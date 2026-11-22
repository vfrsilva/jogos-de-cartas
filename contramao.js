'use strict';

/* Contramão — os carros vêm de frente e só tens de te desviar; o teu carro anda sozinho.
   Motor (topo): faixas, passos e regras. Não toca no DOM.
   Interface (fundo): estrada em perspetiva num <canvas>, teclado e toque. */

// ====================================================================
// Motor
// ====================================================================

const PASSOS = 16;        // os carros aparecem no horizonte, 16 passos à frente; o passo 0 é a fila do jogador
/** Número de faixas da estrada em cada nível: 3 ao início, 4 a partir do nível 5, 6 a partir do 10. */
const faixasDoNivel = (nivel) => (nivel >= 10 ? 6 : nivel >= 5 ? 4 : 3);
const serie = (n) => Array.from({ length: n }, (_, k) => k);
const VIDAS = 3;
const SEG_NIVEL = 10;     // segundos de jogo entre metas; cada meta é um nível novo (fica mais rápido)
const METROS_PASSO = 10;  // metros percorridos em cada passo: o objetivo do jogo é fazer mais metros
const AO_LADO = 0.25;     // fração do passo em que um carro que chegou à nossa fila ainda está ao nosso lado
const TIPOS = 3;          // feitios de carro (só para o desenho)
const LASERS = 3;         // disparos de laser por jogo
// Combustível (0–100): gasta-se a cada passo e recarrega na faixa de abastecimento, uma faixa
// extra que aparece de vez em quando à esquerda (faixa -1) ou à direita (faixa 3) da estrada.
const CONSUMO = 0.5;      // gasto por passo
const CARGA = 5;          // recarga por passo na faixa de abastecimento
const COMP_DESVIO = 16;   // comprimento da faixa de abastecimento, em passos

/** Estado do jogo. carros: { faixa, passo, tipo, cor }. Um carro no passo 0 está ao lado do jogador. */
const D = { faixa: 1, faixas: 3, lasers: LASERS, carros: [], pontos: 0, vidas: VIDAS, nivel: 1, tempo: 0, ticks: 0, descanso: 0, livres: [0, 1, 2], fim: false,
  combustivel: 100, desvio: null, proxDesvio: 0, meta: null }; // meta: { passo, faixas } — linha de meta a aproximar-se e faixas que a estrada tem depois dela // desvio: { lado: -1|1, de, ate } em passos até ao jogador

function novoJogo() {
  Object.assign(D, { faixa: 1, faixas: 3, lasers: LASERS, carros: [], pontos: 0, vidas: VIDAS, nivel: 1, tempo: 0, ticks: 0, descanso: 1, livres: [0, 1, 2], fim: false,
    combustivel: 100, desvio: null, proxDesvio: 40, meta: null });
  // A estrada já começa com carros ao longe, para não se esperar pela primeira fila.
  for (let p = PASSOS % 2 ? 9 : 8; p <= PASSOS; p += 2) novaFila(p);
  return D;
}

/** Milissegundos entre passos. O carro vai sempre à velocidade máxima do nível em que está:
    quanto mais alto o nível, mais depressa vêm os carros. */
function intervalo() {
  return Math.max(135, 360 - 13 * (D.nivel - 1));
}

/** Nova fila de carros ao fundo da estrada. Fica sempre pelo menos uma faixa livre, e essa faixa
    está, no máximo, ao lado de uma que estava livre na fila anterior: há sempre por onde passar.
    Depois de uma meta que alarga a estrada, as filas já usam as faixas novas. */
function novaFila(passo = PASSOS) {
  const n = D.meta && D.meta.passo < passo ? D.meta.faixas : D.faixas;
  const todas = serie(n);
  const possiveis = todas.filter((f) => D.livres.some((l) => Math.abs(l - f) <= 1));
  const livre = possiveis[Math.floor(Math.random() * possiveis.length)];
  // Quantos carros: 1, e mais um por cada «sorte» (mais provável nos níveis altos). Com 3 faixas
  // vêm no máximo 2, com 4 no máximo 3 e com 6 no máximo 4.
  const p = Math.min(0.75, 0.12 + 0.04 * (D.nivel - 1));
  let quantos = 1;
  for (let k = n === 3 ? 1 : n === 4 ? 2 : 3; k > 0; k--) if (Math.random() < p) quantos++;
  const outras = todas.filter((f) => f !== livre).sort(() => Math.random() - 0.5);
  // De preferência vem um na faixa onde o jogador está, para o obrigar a mexer-se.
  const minha = Math.max(0, Math.min(n - 1, D.faixa));
  if (minha !== livre && Math.random() < 0.55) { outras.splice(outras.indexOf(minha), 1); outras.unshift(minha); }
  const ocupadas = outras.slice(0, quantos);
  D.livres = todas.filter((f) => !ocupadas.includes(f));
  for (const faixa of ocupadas) {
    D.carros.push({ faixa, passo, tipo: Math.floor(Math.random() * TIPOS), cor: Math.floor(Math.random() * 6) });
  }
}

function bater() {
  D.vidas--;
  D.carros = [];
  D.livres = serie(6);
  D.descanso = 2; // dois passos de estrada vazia para recomeçar
  if (D.vidas <= 0) D.fim = true;
}

/** A faixa de abastecimento está ao lado do jogador (pode entrar-se e andar nela)? */
function desvioAberto() {
  return !!D.desvio && D.desvio.de <= 0 && D.desvio.ate >= 0;
}
const faixaDoDesvio = () => (D.desvio.lado < 0 ? -1 : D.faixas);

/** Metros percorridos até agora. */
function metros() {
  return D.ticks * METROS_PASSO;
}

/** Um passo: todos os carros se aproximam. Devolve { choque, seco, meta, evitados }.
    seco: acabou o combustível (custa uma vida e o depósito volta a meio).
    meta: cruzou-se uma linha de meta neste passo (subiu de nível). */
function avancar() {
  if (D.fim) return { choque: false, seco: false, meta: false, evitados: 0 };
  D.ticks++;
  // De 10 em 10 segundos há uma meta. Aparece ao fundo da estrada uns passos antes, para chegar
  // ao jogador mais ou menos na altura certa; o nível sobe quando ela é cruzada (passo 0).
  D.tempo += intervalo() / 1000;
  let meta = false;
  if (D.meta) {
    D.meta.passo--;
    if (D.meta.passo === 0) { D.nivel++; D.faixas = D.meta.faixas; meta = true; }
    if (D.meta.passo < 0) D.meta = null;
  } else if (D.tempo >= D.nivel * SEG_NIVEL - ((PASSOS + 1) * intervalo()) / 1000
    && !(D.desvio && faixasDoNivel(D.nivel + 1) !== D.faixas)) {
    // (Uma meta que alarga a estrada espera que a faixa de abastecimento acabe.)
    D.meta = { passo: PASSOS + 1, faixas: faixasDoNivel(D.nivel + 1) };
  }
  let evitados = 0;
  for (const c of D.carros) c.passo--;
  // A faixa de abastecimento aproxima-se como os carros; quem ainda lá estiver quando ela acaba, bate.
  if (D.desvio) {
    D.desvio.de--;
    D.desvio.ate--;
    if (D.desvio.ate < 0) {
      const dentro = D.faixa === faixaDoDesvio();
      if (dentro) D.faixa = D.desvio.lado < 0 ? 0 : D.faixas - 1;
      D.desvio = null;
      D.proxDesvio = 60 + Math.floor(Math.random() * 31);
      if (dentro) { bater(); return { choque: true, seco: false, meta, evitados: 0 }; }
    }
  } else if (--D.proxDesvio <= 0 && faixasDoNivel(D.nivel + 1) === D.faixas && !(D.meta && D.meta.faixas !== D.faixas)) {
    // (No nível antes de a estrada alargar não há abastecimento, para não atrasar essa meta.)
    D.desvio = { lado: Math.random() < 0.5 ? -1 : 1, de: PASSOS + 1, ate: PASSOS + COMP_DESVIO };
  }
  if (D.carros.some((c) => c.passo === 0 && c.faixa === D.faixa)) {
    bater();
    return { choque: true, seco: false, meta, evitados: 0 };
  }
  const aCarregar = desvioAberto() && D.faixa === faixaDoDesvio();
  D.combustivel = Math.max(0, Math.min(100, D.combustivel + (aCarregar ? CARGA : -CONSUMO)));
  if (D.combustivel <= 0) {
    bater();
    D.combustivel = 50;
    return { choque: false, seco: true, meta, evitados: 0 };
  }
  const antes = D.carros.length;
  D.carros = D.carros.filter((c) => c.passo >= 0);
  evitados = antes - D.carros.length;
  D.pontos += evitados; // carros evitados (só para a estatística do fim)
  // Fila sim, fila não: entre duas filas de carros há sempre um passo vazio para mudar de faixa.
  if (D.descanso > 0) D.descanso--;
  else { novaFila(); D.descanso = 1; }
  return { choque: false, seco: false, meta, evitados };
}

/** Muda de faixa (dir: -1 esquerda, +1 direita). Devolve true se bateu num carro que ia ao lado.
    `fracao` (0–1) é quanto do passo atual já decorreu: um carro que chegou à nossa fila só está
    mesmo ao lado no início do passo; depois já passou e a faixa está livre. */
function mover(dir, fracao = 0) {
  if (D.fim) return false;
  const nova = D.faixa + dir;
  // Fora das três faixas só existe a de abastecimento, e só enquanto estiver ao nosso lado.
  if ((nova < 0 || nova >= D.faixas) && !(desvioAberto() && nova === faixaDoDesvio())) return false;
  D.faixa = nova;
  if (fracao < AO_LADO && D.carros.some((c) => c.passo === 0 && c.faixa === nova)) { bater(); return true; }
  return false;
}

/** Dispara o laser: destrói o carro mais próximo na faixa do jogador e devolve-o. Sem carro nessa
    faixa (ou sem disparos) devolve null e não gasta nada. O carro destruído conta como evitado. */
function disparar() {
  if (D.fim || D.lasers <= 0) return null;
  const alvo = D.carros.filter((c) => c.faixa === D.faixa && c.passo >= 1).sort((a, b) => a.passo - b.passo)[0];
  if (!alvo) return null;
  D.lasers--;
  D.carros = D.carros.filter((c) => c !== alvo);
  D.pontos++;
  return alvo;
}

if (typeof module !== 'undefined') {
  module.exports = { D, faixasDoNivel, PASSOS, VIDAS, SEG_NIVEL, AO_LADO, METROS_PASSO, metros, LASERS, CONSUMO, CARGA, COMP_DESVIO, desvioAberto, disparar, novoJogo, avancar, mover, intervalo };
}

// ====================================================================
// Interface
// ====================================================================

if (typeof document !== 'undefined') (() => {
  const $ = (id) => document.getElementById(id);
  const tela = $('tela');
  let ctx = tela.getContext('2d'); // (troca-se por instantes para desenhar as miniaturas dos veículos)
  const calmo = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const CORES = ['#3a86ff', '#ffc61a', '#f4f1ea', '#9b5de5', '#2ec4b6', '#ff8c42'];
  const K = 0.55; // força da perspetiva: tamanho = 1 / (1 + K × distância)

  let W = 0, H = 0, dpr = 1;
  let estado = 'espera';   // 'espera' (antes de arrancar) | 'jogo' | 'choque' | 'fim'
  let acum = 0;            // ms desde o último passo
  let pausa = 0;           // ms que falta de paragem depois de um choque
  let xCarro = 1;          // posição desenhada do carro (desliza até D.faixa)
  let clarao = 0;
  let estrada = 0;         // distância percorrida, em passos (para as marcas da estrada)
  let demo = false;
  let epoca = 0;
  let destrocos = null;    // carros no ecrã no momento do choque
  let avisoAte = 0;        // até quando fica o aviso de nível novo
  let nVista = 3;          // faixas que a vista mostra (desliza de 3 para 4 e para 6)
  let abre = 0;            // 0–1: quanto a vista se afastou para caber a faixa de abastecimento
  let ladoVista = 1;       // lado da última faixa de abastecimento
  let frPasso = 0;         // fração do passo atual já decorrida (0–1), como é desenhada
  let raio = null;         // último disparo de laser: { faixa, z, cor, t } (t = ms desde o disparo)

  const guardado = () => { try { return JSON.parse(localStorage.getItem('contramao-v1')) || {}; } catch { return {}; } };
  const guardar = (novo) => { try { localStorage.setItem('contramao-v1', JSON.stringify({ ...guardado(), ...novo })); } catch { /* sem armazenamento */ } };
  const recorde = () => guardado().metros | 0;

  // Veículos: só muda o aspeto, o som e a maneira de mudar de faixa; a velocidade é igual para todos.
  // desliza = ms que demora a mudar de faixa; inclina = quanto se inclina ao mudar (rad por faixa) e o máximo.
  const VEICULOS = {
    carro: { nome: 'Carro', desc: 'O de sempre.', desliza: 70, inclina: [0.1, 0.06] },
    mota: { nome: 'Mota', desc: 'Deita-se nas mudanças de faixa.', desliza: 120, inclina: [0.85, 0.5] },
    monstro: { nome: 'Monster truck', desc: 'Rodas enormes, a abanar.', desliza: 95, inclina: [0.22, 0.11] },
  };
  let veiculoAtual = VEICULOS[guardado().veiculo] ? guardado().veiculo : 'carro';
  let inclinacao = 0;      // inclinação desenhada do nosso veículo (rad)

  function medir() {
    const caixa = tela.parentElement.getBoundingClientRect();
    dpr = Math.min(2, window.devicePixelRatio || 1);
    W = Math.max(50, caixa.width);
    H = Math.max(50, caixa.height);
    tela.width = Math.round(W * dpr);
    tela.height = Math.round(H * dpr);
  }

  // ---------- Perspetiva ----------
  const geo = () => {
    const yHor = H * 0.3, yJog = H * 0.8;
    // A vista mostra a estrada toda: as faixas que houver (nVista) mais a de abastecimento.
    // Posições na estrada medem-se em faixas: u = 0 é o meio da faixa 0, u = 1 o da faixa 1, etc.
    const esq = -0.5 - (ladoVista < 0 ? abre : 0), dir = nVista - 0.5 + (ladoVista > 0 ? abre : 0);
    const faixa = Math.min((W * 0.93) / (dir - esq), (yJog - yHor) * 0.62, 230);
    return { yHor, yJog, faixa, cx: W / 2, cv: (esq + dir) / 2 };
  };
  const escala = (z) => 1 / (1 + K * z);                      // z = distância em passos (0 = fila do jogador)
  const yDe = (g, z) => g.yHor + (g.yJog - g.yHor) * escala(z);
  const xDe = (g, u, z) => g.cx + desvio(z) * g.faixa + (u - g.cv) * g.faixa * escala(z);
  /** Faixas da estrada à distância z: depois de uma meta que a alarga, abre aos poucos para a direita. */
  function faixasEm(z) {
    if (!D.meta || D.meta.faixas === D.faixas) return D.faixas;
    return D.faixas + (D.meta.faixas - D.faixas) * Math.max(0, Math.min(1, (z - (D.meta.passo - frPasso)) / 1.5));
  }
  /** Borda da estrada (em faixas) do lado dado, à distância z. */
  const bordaEm = (lado, z) => (lado < 0 ? -0.5 : faixasEm(z) - 0.5);

  // Curvas: são só do desenho (as regras continuam a ser 3 faixas e 5 passos). A curvatura da
  // estrada depende da distância percorrida; somando-a duas vezes ao longo da distância obtém-se
  // quanto a estrada se desvia para o lado em cada ponto. Ao longe a curvatura esbate-se, para o
  // desvio no horizonte não crescer sem limite.
  const PASSO_Z = 0.25, Z_MAX = 40, FORCA_CURVA = 0.1, ALCANCE_CURVA = 14;
  const tabela = new Float32Array(Z_MAX / PASSO_Z + 1);
  function curvatura(d) {
    const v = Math.sin(d * 0.07) + 0.6 * Math.sin(d * 0.031 + 2);
    const a = Math.min(1, Math.max(0, (Math.abs(v) - 0.25) / 0.5)); // perto de zero é reta
    return Math.sign(v) * a * a * (3 - 2 * a);
  }
  function calcularCurvas() {
    let inclinacao = 0, x = 0;
    for (let i = 0; i < tabela.length; i++) {
      const z = i * PASSO_Z;
      tabela[i] = x * escala(z) * FORCA_CURVA;
      inclinacao += curvatura(estrada + z) * Math.max(0, 1 - z / ALCANCE_CURVA) * PASSO_Z;
      x += inclinacao * PASSO_Z;
    }
  }
  /** Largura (0–1 faixas) da faixa de abastecimento à distância z, do lado dado; afunila nas pontas. */
  function largExtra(z, lado) {
    const dv = D.desvio;
    if (!dv || dv.lado !== lado) return 0;
    return Math.max(0, Math.min(1, (z - (dv.de - 0.5 - frPasso)) / 0.7, (dv.ate + 0.5 - frPasso - z) / 0.7));
  }

  /** Faixa de abastecimento: alcatrão esverdeado ao lado da estrada, com riscas de carga e uma placa. */
  function desenharDesvio(g, zb) {
    const dv = D.desvio;
    if (!dv) return;
    const zA = Math.max(zb, dv.de - 0.5 - frPasso), zB = Math.min(Z_MAX, dv.ate + 0.5 - frPasso);
    if (zB <= zA) return;
    const n = Math.max(2, Math.ceil((zB - zA) / PASSO_Z));
    const ub = dv.lado < 0 ? -0.5 : D.faixas - 0.5; // borda da estrada desse lado
    const tira = (berma, cor) => {
      ctx.fillStyle = cor;
      ctx.beginPath();
      for (let i = 0; i <= n; i++) { const z = zA + ((zB - zA) * i) / n; ctx.lineTo(xDe(g, ub, z), yDe(g, z)); }
      for (let i = n; i >= 0; i--) {
        const z = zA + ((zB - zA) * i) / n, w = largExtra(z, dv.lado);
        ctx.lineTo(xDe(g, ub + dv.lado * (w + (w > 0 ? berma : 0.105)), z), yDe(g, z));
      }
      ctx.closePath();
      ctx.fill();
    };
    tira(0.105, '#d8d2c2');
    tira(0, '#27504a');
    // Riscas de carga, uma por passo.
    for (let p = dv.ate; p >= dv.de; p--) {
      const z = p - frPasso;
      if (z - 0.16 <= zb || z > 24 || largExtra(z, dv.lado) < 0.99) continue;
      const z1 = z - 0.16, z2 = z + 0.16;
      ctx.fillStyle = 'rgba(110, 231, 197, .6)';
      quad(xDe(g, ub + dv.lado * 0.18, z2), yDe(g, z2), xDe(g, ub + dv.lado * 0.82, z2), yDe(g, z2),
        xDe(g, ub + dv.lado * 0.82, z1), yDe(g, z1), xDe(g, ub + dv.lado * 0.18, z1), yDe(g, z1));
    }
    // Placa à entrada.
    const zp = dv.de - 0.5 - frPasso;
    if (zp > zb + 0.3 && zp < 22) {
      const e = escala(zp), x = xDe(g, ub + dv.lado * 0.45, zp), y = yDe(g, zp), a = g.faixa * e;
      ctx.fillStyle = '#cfd4d8';
      ctx.fillRect(x - a * 0.025, y - a * 0.85, a * 0.05, a * 0.85);
      ctx.fillStyle = '#12805c';
      redondo(x - a * 0.3, y - a * 1.15, a * 0.6, a * 0.5, a * 0.06); ctx.fill();
      ctx.strokeStyle = '#fff'; ctx.lineWidth = Math.max(1, a * 0.025); ctx.stroke();
      ctx.font = `${a * 0.34}px system-ui, sans-serif`;
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillStyle = '#fff';
      ctx.fillText('⛽', x, y - a * 0.89);
    }
  }

  /** Desvio lateral da estrada à distância z, em larguras de faixa. */
  function desvio(z) {
    if (z <= 0) return 0;
    const p = Math.min(tabela.length - 1.001, z / PASSO_Z), i = Math.floor(p);
    return tabela[i] + (tabela[i + 1] - tabela[i]) * (p - i);
  }
  const zFundo = (g) => 1 / ((H - g.yHor) / (g.yJog - g.yHor)) / K - 1 / K; // distância (negativa) no fundo do ecrã

  function quad(x1, y1, x2, y2, x3, y3, x4, y4) {
    ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.lineTo(x3, y3); ctx.lineTo(x4, y4); ctx.closePath(); ctx.fill();
  }
  function redondo(x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
  }

  // ---------- Cenário ----------
  function cenario(g) {
    const ceu = ctx.createLinearGradient(0, 0, 0, g.yHor);
    ceu.addColorStop(0, '#1d2b53'); ceu.addColorStop(0.6, '#c2557a'); ceu.addColorStop(1, '#ffb35c');
    ctx.fillStyle = ceu;
    ctx.fillRect(0, 0, W, g.yHor + 1);
    // Sol e serras.
    ctx.fillStyle = '#ffe9a8';
    ctx.beginPath(); ctx.arc(g.cx + g.faixa * (0.9 - tabela[tabela.length - 1] * 0.5), g.yHor - H * 0.02, H * 0.07, 0, 7); ctx.fill();
    ctx.fillStyle = '#3a2c52';
    ctx.beginPath(); ctx.moveTo(0, g.yHor);
    for (let k = 0; k <= 24; k++) ctx.lineTo((k / 24) * W, g.yHor - H * (0.035 + 0.035 * Math.sin(k * 1.9) * Math.sin(k * 0.7 + 1)) - H * 0.01);
    ctx.lineTo(W, g.yHor); ctx.closePath(); ctx.fill();
    // Campo.
    const campo = ctx.createLinearGradient(0, g.yHor, 0, H);
    campo.addColorStop(0, '#31573a'); campo.addColorStop(1, '#3f7a3c');
    ctx.fillStyle = campo;
    ctx.fillRect(0, g.yHor, W, H - g.yHor);

    const zb = zFundo(g);
    // Faixas do campo a passar (dão a sensação de velocidade).
    const fr = estrada % 1;
    for (let k = 14; k >= -1; k--) {
      const z1 = Math.max(zb, k - fr), z2 = Math.max(zb, k + 0.5 - fr);
      if (z2 <= zb) continue;
      ctx.fillStyle = 'rgba(0, 0, 0, .07)';
      ctx.fillRect(0, yDe(g, z2), W, yDe(g, z1) - yDe(g, z2));
    }
    // Estrada: berma, alcatrão e riscos. Desenha-se às fatias, do horizonte até cá, para poder curvar.
    const borda = (m) => {
      ctx.beginPath();
      for (let z = Z_MAX; ; z -= PASSO_Z) {
        const zz = Math.max(zb, z);
        ctx.lineTo(xDe(g, -0.5 - m, zz), yDe(g, zz));
        if (zz === zb) break;
      }
      for (let z = zb; ; z += PASSO_Z) {
        const zz = Math.min(Z_MAX, z);
        ctx.lineTo(xDe(g, faixasEm(zz) - 0.5 + m, zz), yDe(g, zz));
        if (zz === Z_MAX) break;
      }
      ctx.closePath();
      ctx.fill();
    };
    ctx.fillStyle = '#d8d2c2';
    borda(0.105);
    const alc = ctx.createLinearGradient(0, g.yHor, 0, H);
    alc.addColorStop(0, '#2a2c33'); alc.addColorStop(1, '#474a54');
    ctx.fillStyle = alc;
    borda(0);
    desenharDesvio(g, zb);
    const zMeta = D.meta ? D.meta.passo - frPasso : null;
    for (let k = 30; k >= -1; k--) {
      const z1 = Math.max(zb, k - fr), z2 = Math.max(zb, k + 0.45 - fr);
      if (z2 <= zb) continue;
      const y1 = yDe(g, z1), y2 = yDe(g, z2), l = 0.035;
      ctx.fillStyle = '#f1ead2';
      // Um risco entre cada duas faixas (onde a estrada alarga, só quando a faixa nova já tem largura).
      for (let u = 0.5; u < faixasEm(z1) - 0.8; u++) {
        quad(xDe(g, u - l, z2), y2, xDe(g, u + l, z2), y2, xDe(g, u + l, z1), y1, xDe(g, u - l, z1), y1);
      }
    }
    // Linha de meta aos quadrados, pintada na estrada.
    if (zMeta !== null && zMeta - 0.18 > zb) {
      const COLS = 4 * D.faixas;
      for (let f = 0; f < 2; f++) {
        const z1 = zMeta - 0.18 + f * 0.18, z2 = z1 + 0.18;
        for (let k = 0; k < COLS; k++) {
          const a = -0.5 + k / 4, b = a + 0.25;
          ctx.fillStyle = (k + f) % 2 ? '#15171c' : '#f6f2e6';
          quad(xDe(g, a, z2), yDe(g, z2), xDe(g, b, z2), yDe(g, z2), xDe(g, b, z1), yDe(g, z1), xDe(g, a, z1), yDe(g, z1));
        }
      }
    }
    // Postes à beira da estrada.
    for (let k = 18; k >= 0; k--) {
      const z = k - fr;
      if (z < zb + 0.05) continue;
      const e = escala(z), y = yDe(g, z), h = g.faixa * 0.55 * e, l = Math.max(1, g.faixa * 0.05 * e);
      for (const lado of [-1, 1]) {
        const x = xDe(g, bordaEm(lado, z) + lado * (0.28 + largExtra(z, lado)), z);
        ctx.fillStyle = 'rgba(0, 0, 0, .25)';
        ctx.beginPath(); ctx.ellipse(x, y, l * 2.2, l * 0.8, 0, 0, 7); ctx.fill();
        ctx.fillStyle = (k + Math.floor(estrada)) % 2 ? '#e8e2d0' : '#d7263d';
        ctx.fillRect(x - l / 2, y - h, l, h);
        ctx.fillStyle = '#ffd166';
        ctx.fillRect(x - l, y - h, l * 2, l * 1.4);
      }
    }
  }

  // ---------- Carros ----------
  /** Carro visto de frente (ou de trás, o do jogador), assente em (x, y), com largura l. */
  function carro(x, y, l, cor, tipo, deTras) {
    const alto = tipo === 2;             // carrinha: mais alta
    const hc = l * (alto ? 0.5 : 0.36);  // altura da carroçaria
    const ht = l * (alto ? 0.42 : 0.3);  // altura do tejadilho
    ctx.fillStyle = 'rgba(0, 0, 0, .35)';
    ctx.beginPath(); ctx.ellipse(x, y, l * 0.58, l * 0.1, 0, 0, 7); ctx.fill();
    // Rodas.
    ctx.fillStyle = '#111';
    for (const s of [-1, 1]) { redondo(x + s * l * 0.36 - l * 0.09, y - l * 0.16, l * 0.18, l * 0.17, l * 0.04); ctx.fill(); }
    // Tejadilho e vidro.
    const yb = y - l * 0.07 - hc;
    ctx.fillStyle = cor;
    quad(x - l * (alto ? 0.42 : 0.3), yb - ht, x + l * (alto ? 0.42 : 0.3), yb - ht, x + l * 0.44, yb + 1, x - l * 0.44, yb + 1);
    ctx.fillStyle = deTras ? '#1a2634' : '#9fd3e8';
    quad(x - l * (alto ? 0.37 : 0.26), yb - ht * 0.84, x + l * (alto ? 0.37 : 0.26), yb - ht * 0.84, x + l * 0.38, yb - ht * 0.08, x - l * 0.38, yb - ht * 0.08);
    if (!deTras) { ctx.fillStyle = 'rgba(255, 255, 255, .35)'; quad(x - l * 0.2, yb - ht * 0.84, x - l * 0.06, yb - ht * 0.84, x - l * 0.2, yb - ht * 0.08, x - l * 0.34, yb - ht * 0.08); }
    // Carroçaria.
    ctx.fillStyle = cor;
    redondo(x - l / 2, yb, l, hc, l * 0.08); ctx.fill();
    ctx.fillStyle = 'rgba(0, 0, 0, .18)';
    ctx.fillRect(x - l / 2, yb + hc * 0.62, l, hc * 0.38);
    ctx.fillStyle = '#20232a'; // para-choques
    redondo(x - l * 0.52, y - l * 0.07 - hc * 0.2, l * 1.04, hc * 0.22, l * 0.03); ctx.fill();
    if (deTras) {
      ctx.fillStyle = '#ff3b30';
      for (const s of [-1, 1]) { redondo(x + s * l * 0.33 - l * 0.11, yb + hc * 0.16, l * 0.22, hc * 0.24, l * 0.03); ctx.fill(); }
      ctx.fillStyle = '#f4f1ea';
      ctx.fillRect(x - l * 0.12, yb + hc * 0.42, l * 0.24, hc * 0.2);
    } else {
      ctx.fillStyle = '#16181d'; // grelha
      redondo(x - l * 0.2, yb + hc * 0.2, l * 0.4, hc * 0.3, l * 0.03); ctx.fill();
      ctx.fillStyle = '#fff6b0'; // faróis
      for (const s of [-1, 1]) { ctx.beginPath(); ctx.ellipse(x + s * l * 0.35, yb + hc * 0.34, l * 0.085, hc * 0.17, 0, 0, 7); ctx.fill(); }
    }
  }

  /** Mota vista de trás, com o piloto. Desenha-se à volta de (0, 0), o ponto onde a roda toca no chão. */
  function mota(l, cor) {
    ctx.fillStyle = 'rgba(0, 0, 0, .35)';
    ctx.beginPath(); ctx.ellipse(0, 0, l * 0.26, l * 0.07, 0, 0, 7); ctx.fill();
    ctx.fillStyle = '#111'; // roda de trás
    redondo(-l * 0.075, -l * 0.44, l * 0.15, l * 0.44, l * 0.06); ctx.fill();
    ctx.fillStyle = '#8d949c'; // escapes
    for (const s of [-1, 1]) { ctx.beginPath(); ctx.arc(s * l * 0.15, -l * 0.3, l * 0.045, 0, 7); ctx.fill(); }
    ctx.fillStyle = cor; // traseira
    redondo(-l * 0.12, -l * 0.62, l * 0.24, l * 0.24, l * 0.05); ctx.fill();
    ctx.fillStyle = '#ff3b30';
    ctx.fillRect(-l * 0.07, -l * 0.55, l * 0.14, l * 0.05);
    ctx.fillStyle = '#f4f1ea';
    ctx.fillRect(-l * 0.055, -l * 0.47, l * 0.11, l * 0.065);
    // Guiador e espelhos.
    ctx.strokeStyle = '#8d949c'; ctx.lineWidth = l * 0.035; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(-l * 0.33, -l * 0.85); ctx.lineTo(l * 0.33, -l * 0.85); ctx.stroke();
    ctx.fillStyle = '#cfd4d8';
    for (const s of [-1, 1]) { ctx.beginPath(); ctx.ellipse(s * l * 0.36, -l * 0.94, l * 0.05, l * 0.035, 0, 0, 7); ctx.fill(); }
    // Piloto: ancas, tronco, braços e capacete.
    ctx.fillStyle = '#20232a';
    redondo(-l * 0.18, -l * 0.74, l * 0.36, l * 0.2, l * 0.08); ctx.fill();
    ctx.fillStyle = '#2b3a55';
    quad(-l * 0.16, -l * 0.66, l * 0.16, -l * 0.66, l * 0.21, -l * 1.02, -l * 0.21, -l * 1.02);
    ctx.strokeStyle = '#2b3a55'; ctx.lineWidth = l * 0.085;
    for (const s of [-1, 1]) { ctx.beginPath(); ctx.moveTo(s * l * 0.19, -l * 0.98); ctx.lineTo(s * l * 0.3, -l * 0.86); ctx.stroke(); }
    ctx.fillStyle = cor;
    ctx.beginPath(); ctx.arc(0, -l * 1.13, l * 0.135, 0, 7); ctx.fill();
    ctx.fillStyle = 'rgba(255, 255, 255, .85)';
    ctx.fillRect(-l * 0.02, -l * 1.26, l * 0.04, l * 0.2);
  }

  /** Monster truck visto de trás: rodas enormes, suspensão à vista e a caixa lá em cima. */
  function monstro(l, cor) {
    ctx.fillStyle = 'rgba(0, 0, 0, .35)';
    ctx.beginPath(); ctx.ellipse(0, 0, l * 0.68, l * 0.11, 0, 0, 7); ctx.fill();
    for (const s of [-1, 1]) {
      ctx.fillStyle = '#111';
      redondo(s * l * 0.43 - l * 0.18, -l * 0.52, l * 0.36, l * 0.52, l * 0.09); ctx.fill();
      ctx.fillStyle = 'rgba(255, 255, 255, .13)'; // rasto do pneu
      for (let k = 1; k < 6; k++) ctx.fillRect(s * l * 0.43 - l * 0.16, -l * 0.52 + k * l * 0.085, l * 0.32, l * 0.02);
    }
    ctx.fillStyle = '#6c737c'; // eixo
    ctx.fillRect(-l * 0.3, -l * 0.31, l * 0.6, l * 0.07);
    ctx.strokeStyle = '#ffd23f'; ctx.lineWidth = l * 0.04; ctx.lineCap = 'round'; // amortecedores
    for (const s of [-1, 1]) { ctx.beginPath(); ctx.moveTo(s * l * 0.2, -l * 0.3); ctx.lineTo(s * l * 0.3, -l * 0.62); ctx.stroke(); }
    ctx.fillStyle = cor; // cabine
    quad(-l * 0.3, -l * 1.16, l * 0.3, -l * 1.16, l * 0.4, -l * 0.9, -l * 0.4, -l * 0.9);
    ctx.fillStyle = '#1a2634';
    quad(-l * 0.26, -l * 1.12, l * 0.26, -l * 1.12, l * 0.34, -l * 0.93, -l * 0.34, -l * 0.93);
    ctx.fillStyle = cor; // caixa
    redondo(-l * 0.47, -l * 0.92, l * 0.94, l * 0.34, l * 0.06); ctx.fill();
    ctx.fillStyle = 'rgba(0, 0, 0, .2)';
    ctx.fillRect(-l * 0.47, -l * 0.7, l * 0.94, l * 0.12);
    ctx.fillStyle = '#ff3b30';
    for (const s of [-1, 1]) { redondo(s * l * 0.37 - l * 0.07, -l * 0.87, l * 0.14, l * 0.12, l * 0.02); ctx.fill(); }
    ctx.fillStyle = '#f4f1ea';
    ctx.fillRect(-l * 0.12, -l * 0.84, l * 0.24, l * 0.08);
    ctx.strokeStyle = '#cfd4d8'; ctx.lineWidth = l * 0.035; // barra com faróis
    ctx.beginPath(); ctx.moveTo(-l * 0.3, -l * 1.16); ctx.lineTo(-l * 0.3, -l * 1.24); ctx.lineTo(l * 0.3, -l * 1.24); ctx.lineTo(l * 0.3, -l * 1.16); ctx.stroke();
    ctx.fillStyle = '#fff6b0';
    for (let k = -1.5; k <= 1.5; k++) { ctx.beginPath(); ctx.arc(k * l * 0.13, -l * 1.27, l * 0.04, 0, 7); ctx.fill(); }
  }

  /** O veículo do jogador, assente em (x, y) e inclinado (a mota deita-se nas mudanças de faixa). */
  function veiculo(tipo, x, y, l, inclina) {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(inclina);
    if (tipo === 'mota') mota(l, '#e63946');
    else if (tipo === 'monstro') monstro(l, '#e63946');
    else carro(0, 0, l, '#e63946', 0, true);
    ctx.restore();
  }

  /** Pórtico da meta: dois postes e uma faixa com o nível que aí começa. */
  function portico(g, z) {
    const e = escala(z), y = yDe(g, z), a = g.faixa * e, m = D.faixas / 2;
    const x = xDe(g, m - 0.5, z); // meio da estrada
    const alto = a * 1.75, l = a * 0.09;
    // Aparece ao longe sem saltar; mesmo em cima de nós fica translúcido, para não tapar os carros.
    ctx.globalAlpha = Math.max(0, Math.min(1, (PASSOS + 1.6 - z) / 0.6, Math.max(0.3, z / 1.4)));
    ctx.fillStyle = '#cfd4d8';
    for (const s of [-1, 1]) ctx.fillRect(x + s * a * (m + 0.16) - l / 2, y - alto, l, alto);
    ctx.fillStyle = '#d7263d';
    ctx.fillRect(x - a * (m + 0.22), y - alto - a * 0.1, a * (2 * m + 0.44), a * 0.46);
    // Quadrados nas pontas da faixa.
    const q = a * 0.115;
    for (const s of [-1, 1]) for (let i = 0; i < 2; i++) for (let j = 0; j < 4; j++) {
      ctx.fillStyle = (i + j) % 2 ? '#15171c' : '#f6f2e6';
      ctx.fillRect(x + s * a * m - q + i * q, y - alto - a * 0.1 + j * q, q, q);
    }
    ctx.fillStyle = '#fff';
    ctx.font = `800 ${a * 0.3}px system-ui, sans-serif`;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(`NÍVEL ${D.meta ? D.nivel + (D.meta.passo > 0 ? 1 : 0) : D.nivel}`, x, y - alto + a * 0.14);
    ctx.globalAlpha = 1;
  }

  /** Raio de laser do nosso carro até ao alvo, e a explosão do carro atingido. */
  function desenharRaio(g, largura) {
    const x0 = xDe(g, xCarro, 0), y0 = g.yJog - largura * 0.62;
    const e = escala(raio.z), x1 = xDe(g, raio.faixa, raio.z), y1 = yDe(g, raio.z) - largura * e * 0.3;
    const feixe = 1 - raio.t / 220;
    if (feixe > 0) {
      ctx.lineCap = 'round';
      for (const [cor, l] of [[`rgba(90, 240, 255, ${0.35 * feixe})`, 0.16], [`rgba(160, 250, 255, ${0.8 * feixe})`, 0.07], [`rgba(255, 255, 255, ${feixe})`, 0.025]]) {
        ctx.strokeStyle = cor;
        ctx.lineWidth = largura * l;
        // O feixe afunila com a distância, como a estrada.
        ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); ctx.stroke();
      }
    }
    const k = raio.t / 520; // explosão: 0 → 1
    if (k < 1) {
      const r = largura * e * (0.35 + 0.75 * k);
      ctx.globalAlpha = 1 - k;
      for (const [cor, f] of [['#ff7b2e', 1], ['#ffd23f', 0.68], ['#fffbe0', 0.36]]) {
        ctx.fillStyle = cor;
        ctx.beginPath(); ctx.arc(x1, y1, r * f, 0, 7); ctx.fill();
      }
      // Estilhaços da cor do carro.
      ctx.fillStyle = CORES[raio.cor];
      for (let i = 0; i < 8; i++) {
        const a = i * 0.785 + 0.4, d = r * (0.6 + 1.3 * k), t = largura * e * 0.09;
        ctx.fillRect(x1 + Math.cos(a) * d - t / 2, y1 + Math.sin(a) * d * 0.75 - k * r * 0.3 - t / 2, t, t);
      }
      ctx.globalAlpha = 1;
    }
  }

  function desenhar() {
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const g = geo();
    calcularCurvas();
    frPasso = estado === 'jogo' ? Math.min(1, acum / intervalo()) : 0;
    const tremor = !calmo && estado === 'choque' ? (pausa / 900) * 10 : 0;
    ctx.save();
    ctx.translate((Math.random() - 0.5) * tremor, (Math.random() - 0.5) * tremor);
    cenario(g);
    const fr = frPasso;
    const lista = (destrocos || D.carros).concat(D.meta ? [{ meta: true, passo: D.meta.passo + 0.01 }] : []).sort((a, b) => b.passo - a.passo);
    const largura = g.faixa * 0.66;
    const proprio = () => veiculo(veiculoAtual, xDe(g, xCarro, 0), g.yJog, largura, inclinacao);
    let feito = false;
    for (const c of lista) {
      if (c.meta) { if (c.passo - frPasso > zFundo(g) + 0.25) portico(g, c.passo - 0.01 - frPasso); continue; }
      const z = c.passo - (destrocos ? 0 : fr);
      if (z < 0 && !feito) { proprio(); feito = true; } // quem já passou fica à frente do nosso carro
      const e = escala(z);
      ctx.globalAlpha = Math.min(1, (PASSOS + 0.6 - z) / 0.6); // aparece ao longe, sem saltar
      carro(xDe(g, c.faixa, z), yDe(g, z), largura * e, CORES[c.cor], c.tipo, false);
      ctx.globalAlpha = 1;
    }
    if (!feito) proprio();
    if (raio) desenharRaio(g, largura);
    ctx.restore();
    if (clarao > 0) { ctx.fillStyle = `rgba(255, 80, 60, ${clarao * 0.5})`; ctx.fillRect(0, 0, W, H); }
  }

  // ---------- Painel ----------
  const textos = {};
  function por(id, texto) { if (textos[id] !== texto) { textos[id] = texto; $(id).textContent = texto; } }
  function painel() {
    const m = Math.floor((D.ticks + (estado === 'jogo' ? Math.min(1, acum / intervalo()) : 0)) * METROS_PASSO);
    por('hud-metros', String(m));
    por('hud-nivel', String(D.nivel));
    por('hud-laser', '⚡'.repeat(D.lasers) || '—');
    const nivel = Math.round(D.combustivel);
    const classe = `deposito${desvioAberto() && (D.faixa < 0 || D.faixa >= D.faixas) ? ' carrega' : nivel < 25 ? ' baixo' : ''}`;
    if (textos.deposito !== nivel) { textos.deposito = nivel; $('deposito-nivel').style.width = `${nivel}%`; }
    if (textos.depositoClasse !== classe) { textos.depositoClasse = classe; $('deposito').className = classe; }
    por('hud-vidas', '♥'.repeat(D.vidas) + '♡'.repeat(VIDAS - D.vidas));
    por('hud-recorde', `recorde ${Math.max(recorde(), demo ? 0 : metros())} m`);
  }
  function grande(texto) {
    if (textos.grande === texto) return;
    textos.grande = texto;
    const el = $('hud-grande');
    el.textContent = texto;
    el.className = `hud-grande${texto.length > 4 ? ' frase' : ''}`;
    void el.offsetWidth;
    if (texto) el.classList.add('entra');
  }

  // ---------- Som ----------
  // Motor sintetizado (Web Audio): dois osciladores com um filtro, mais agudo à medida que o nível
  // avança e a «meter a mudança» em cada meta. Cada veículo tem o seu timbre. O browser só deixa
  // tocar depois de um toque ou de uma tecla, por isso o som liga-se ao arrancar.
  const TIMBRES = {
    carro: { ondas: ['sawtooth', 'square'], base: 62, filtro: 520, treme: 0 },
    mota: { ondas: ['sawtooth', 'sawtooth'], base: 104, filtro: 1500, treme: 0 },
    monstro: { ondas: ['square', 'sawtooth'], base: 38, filtro: 330, treme: 0.5 },
  };
  let somLigado = guardado().som !== false;
  let audio = null, motor = null;

  function ligarSom() {
    if (!somLigado) return;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    if (!audio) {
      audio = new AC();
      const o1 = audio.createOscillator(), o2 = audio.createOscillator();
      const filtro = audio.createBiquadFilter(), ganho = audio.createGain();
      const lfo = audio.createOscillator(), lfoGanho = audio.createGain(), tremolo = audio.createGain();
      filtro.type = 'lowpass';
      ganho.gain.value = 0;
      lfo.frequency.value = 11;
      lfoGanho.gain.value = 0;
      lfo.connect(lfoGanho).connect(tremolo.gain);
      o1.connect(filtro); o2.connect(filtro);
      filtro.connect(tremolo).connect(ganho).connect(audio.destination);
      o1.start(); o2.start(); lfo.start();
      motor = { o1, o2, filtro, ganho, lfoGanho };
    }
    if (audio.state === 'suspended') audio.resume();
  }

  function atualizarMotor(parado) {
    if (!motor) return;
    const t = audio.currentTime, tb = TIMBRES[veiculoAtual];
    const anda = somLigado && !parado && !document.hidden && (estado === 'jogo' || estado === 'espera');
    // Rotação: sobe ao longo de cada nível e cai na meta, como quem mete a mudança seguinte.
    const dentro = estado === 'jogo' ? (D.tempo % SEG_NIVEL) / SEG_NIVEL : 0;
    const rot = estado === 'jogo' ? 1 + 0.55 * dentro + 0.035 * Math.min(D.nivel, 14) : 0.62;
    motor.o1.type = tb.ondas[0]; motor.o2.type = tb.ondas[1];
    motor.o1.frequency.setTargetAtTime(tb.base * rot, t, 0.08);
    motor.o2.frequency.setTargetAtTime(tb.base * rot * 0.503, t, 0.08);
    motor.filtro.frequency.setTargetAtTime(tb.filtro * (0.7 + 0.5 * rot), t, 0.1);
    motor.lfoGanho.gain.setTargetAtTime(tb.treme, t, 0.1);
    motor.ganho.gain.setTargetAtTime(anda ? (estado === 'jogo' ? 0.075 : 0.04) : 0, t, 0.08);
  }

  /** Efeitos curtos: 'choque' (ruído surdo), 'laser' (assobio a descer) e 'nivel' (duas notas). */
  function efeito(tipo) {
    if (!audio || !somLigado) return;
    const t = audio.currentTime, g = audio.createGain();
    g.connect(audio.destination);
    if (tipo === 'choque') {
      const n = Math.floor(audio.sampleRate * 0.5), buf = audio.createBuffer(1, n, audio.sampleRate), d = buf.getChannelData(0);
      for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / n) ** 2;
      const fonte = audio.createBufferSource(), f = audio.createBiquadFilter();
      fonte.buffer = buf; f.type = 'lowpass'; f.frequency.value = 900;
      g.gain.value = 0.5;
      fonte.connect(f).connect(g);
      fonte.start(t);
    } else {
      const o = audio.createOscillator();
      o.connect(g);
      if (tipo === 'laser') {
        o.type = 'sawtooth';
        o.frequency.setValueAtTime(1500, t); o.frequency.exponentialRampToValueAtTime(180, t + 0.22);
        g.gain.setValueAtTime(0.16, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.24);
        o.start(t); o.stop(t + 0.25);
      } else {
        o.type = 'triangle';
        o.frequency.setValueAtTime(660, t); o.frequency.setValueAtTime(990, t + 0.12);
        g.gain.setValueAtTime(0.14, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.34);
        o.start(t); o.stop(t + 0.35);
      }
    }
  }

  function mostrarSom() {
    $('btn-som').textContent = somLigado ? '🔊' : '🔇';
    $('btn-som').setAttribute('aria-label', somLigado ? 'Desligar o som' : 'Ligar o som');
  }

  // ---------- Escolha do veículo ----------
  function abrirVeiculos() {
    $('veiculos').replaceChildren(...Object.entries(VEICULOS).map(([id, v]) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = `circuito${id === veiculoAtual ? ' atual' : ''}`;
      const c = document.createElement('canvas');
      c.width = 220; c.height = 160;
      const principal = ctx;
      ctx = c.getContext('2d');
      veiculo(id, 110, 142, id === 'monstro' ? 92 : 100, 0);
      ctx = principal;
      const info = document.createElement('span');
      const nome = document.createElement('b');
      nome.textContent = v.nome;
      const desc = document.createElement('small');
      desc.textContent = v.desc;
      info.append(nome, desc);
      b.append(c, info);
      b.addEventListener('click', () => {
        veiculoAtual = id;
        guardar({ veiculo: id });
        $('dlg-veiculos').close();
        ligarSom(); // o clique já conta como gesto: o motor ouve-se logo, ao ralenti
        comecar();
      });
      return b;
    }));
    $('dlg-veiculos').showModal();
    $('veiculos').querySelector('.atual')?.focus();
  }

  // ---------- Jogo ----------
  function comecar() {
    epoca++;
    novoJogo();
    estado = 'espera';
    acum = 0; pausa = 0; clarao = 0; xCarro = 1; destrocos = null; avisoAte = 0; raio = null; abre = 0; nVista = 3; inclinacao = 0;
    grande(matchMedia('(pointer: coarse)').matches ? 'Toca para arrancar' : 'Carrega numa seta para arrancar');
    painel();
  }

  function choque(seco) {
    estado = 'choque';
    efeito('choque');
    pausa = 900;
    clarao = 1;
    acum = 0;
    navigator.vibrate?.(120);
    grande(D.fim ? 'Fim!' : seco ? 'Sem combustível!' : D.vidas === 1 ? 'Última vida!' : 'Bateste!');
  }

  function acabar() {
    estado = 'fim';
    const antes = recorde();
    const feitos = metros();
    const novo = !demo && feitos > antes;
    if (novo) guardar({ metros: feitos });
    const topo = Math.max(antes, feitos, 1);
    mostrarFim({
      estado: novo ? 'campeao' : 'empate',
      icone: novo ? '🏆' : '💥',
      titulo: novo ? 'Novo recorde!' : 'Fim da viagem',
      etiqueta: `Nível ${D.nivel}`,
      linhas: [
        { nome: 'Agora', eu: true, etiqueta: '', mais: 0, total: `${feitos} m`, barra: (feitos / topo) * 100 },
        { nome: 'Recorde', etiqueta: '', mais: 0, total: `${Math.max(antes, feitos)} m`, barra: (Math.max(antes, feitos) / topo) * 100 },
      ],
      texto: `Fizeste ${feitos} metros em ${Math.round(D.tempo)} segundos e passaste por ${D.pontos} ${D.pontos === 1 ? 'carro' : 'carros'}.`,
      botao: 'Jogar outra vez',
    });
  }

  function virar(dir) {
    if (document.querySelector('dialog[open]') || estado === 'choque' || estado === 'fim') return;
    ligarSom();
    if (estado === 'espera') { estado = 'jogo'; grande(''); }
    const antes = D.carros.slice();
    if (mover(dir, estado === 'jogo' ? acum / intervalo() : 0)) { destrocos = antes; choque(); }
  }

  function laser() {
    if (document.querySelector('dialog[open]') || estado !== 'jogo') return;
    const fr = Math.min(1, acum / intervalo());
    const alvo = disparar();
    if (!alvo) return;
    raio = { faixa: alvo.faixa, z: alvo.passo - fr, cor: alvo.cor, t: 0 };
    efeito('laser');
    navigator.vibrate?.(40);
  }

  /** Piloto automático (só para ver o jogo a correr): vai para a faixa livre da fila mais próxima. */
  function pilotoDemo() {
    const perto = Math.min(...D.carros.map((c) => c.passo));
    if (!isFinite(perto) || perto === 0 || D.faixa < 0 || D.faixa >= D.faixas) return;
    const ocupadas = D.carros.filter((c) => c.passo === perto).map((c) => c.faixa);
    if (!ocupadas.includes(D.faixa)) return;
    const alvo = serie(D.faixas).filter((f) => !ocupadas.includes(f)).sort((a, b) => Math.abs(a - D.faixa) - Math.abs(b - D.faixa))[0];
    if (alvo !== undefined) mover(Math.sign(alvo - D.faixa));
  }

  let tAnt = 0;
  function quadro(agora) {
    requestAnimationFrame(quadro);
    const dt = Math.min(50, agora - tAnt || 0);
    tAnt = agora;
    const parado = document.querySelector('dialog[open]');
    if (!parado) {
      if (estado === 'jogo') {
        acum += dt;
        estrada += dt / intervalo();
        while (estado === 'jogo' && acum >= intervalo()) {
          acum -= intervalo();
          if (demo) pilotoDemo();
          const antes = D.carros.map((c) => ({ ...c, passo: c.passo - 1 }));
          const nivelAntes = D.nivel;
          const r = avancar();
          if (r.choque || r.seco) { destrocos = r.seco ? [] : antes; choque(r.seco); }
          else if (D.nivel > nivelAntes) { grande(`Nível ${D.nivel}!`); avisoAte = agora + 1300; efeito('nivel'); }
          else if (avisoAte && agora > avisoAte) { grande(''); avisoAte = 0; }
        }
      } else if (estado === 'choque') {
        pausa -= dt;
        if (pausa <= 0) {
          destrocos = null;
          if (D.fim) acabar();
          else { estado = 'jogo'; grande(''); }
        }
      } else if (estado === 'espera') {
        estrada += dt / 900; // a estrada vai passando devagar enquanto se espera
      }
      if (clarao > 0) clarao = Math.max(0, clarao - dt / 500);
      if (raio && (raio.t += dt) > 520) raio = null;
    }
    // O veículo desliza até à faixa nova e inclina-se para esse lado enquanto lá não chega.
    const v = VEICULOS[veiculoAtual];
    xCarro += (D.faixa - xCarro) * Math.min(1, dt / v.desliza);
    const alvoInc = Math.max(-v.inclina[1], Math.min(v.inclina[1], (D.faixa - xCarro) * v.inclina[0]));
    inclinacao += (alvoInc - inclinacao) * Math.min(1, dt / 70);
    atualizarMotor(!!parado);
    if (D.desvio) ladoVista = D.desvio.lado;
    abre += ((D.desvio ? 1 : 0) - abre) * Math.min(1, dt / 260);
    // A vista alarga logo que aparece ao fundo uma meta que traz mais faixas.
    nVista += ((D.meta ? Math.max(D.meta.faixas, D.faixas) : D.faixas) - nVista) * Math.min(1, dt / 500);
    desenhar();
    painel();
  }

  // ---------- Comandos: setas (ou A/D), toque em cada metade do ecrã, ou os botões ----------
  // Esquerda/direita mudam de faixa; espaço dispara o laser.
  const MAPA = { ArrowLeft: -1, ArrowRight: 1, a: -1, d: 1 };
  addEventListener('keydown', (e) => {
    const dir = MAPA[e.key] ?? MAPA[e.key.toLowerCase()];
    const tiro = e.key === ' ' || e.code === 'Space';
    if ((!dir && !tiro) || document.querySelector('dialog[open]')) return;
    e.preventDefault();
    if (tiro) document.activeElement?.blur?.(); // para o espaço não «clicar» num botão da barra
    if (e.repeat) return;
    if (tiro) laser();
    else virar(dir);
  });
  tela.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    virar(e.clientX < tela.getBoundingClientRect().left + W / 2 ? -1 : 1);
  });
  for (const b of document.querySelectorAll('.toques button')) {
    b.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      if (b.dataset.laser) laser();
      else virar(Number(b.dataset.dir));
      b.classList.add('ativo');
      setTimeout(() => b.classList.remove('ativo'), 120);
    });
    b.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  $('btn-regras').addEventListener('click', () => $('dlg-regras').showModal());
  $('btn-novo').addEventListener('click', comecar);
  $('btn-veiculo').addEventListener('click', abrirVeiculos);
  $('btn-som').addEventListener('click', () => {
    somLigado = !somLigado;
    guardar({ som: somLigado });
    mostrarSom();
    if (somLigado) ligarSom();
  });
  mostrarSom();
  $('fim-btn').addEventListener('click', () => { $('dlg-fim').close(); comecar(); });
  $('dlg-fim').addEventListener('cancel', (e) => { e.preventDefault(); $('fim-btn').click(); });

  new ResizeObserver(medir).observe(tela.parentElement);
  medir();
  comecar();
  requestAnimationFrame(quadro);

  // ?demo=1 põe o piloto automático a jogar; &t=N adianta N passos (para capturas de ecrã);
  // &v=mota|monstro|carro escolhe o veículo e &inc=R fixa a inclinação.
  const args = new URLSearchParams(location.search);
  demo = args.has('demo');
  if (!demo) abrirVeiculos();
  if (VEICULOS[args.get('v')]) veiculoAtual = args.get('v');
  if (demo) {
    estado = 'jogo';
    grande('');
    for (let k = 0; k < (Number(args.get('t')) || 0); k++) { pilotoDemo(); avancar(); }
    acum = intervalo() * 0.5;
    if (args.has('nivel')) { D.nivel = Number(args.get('nivel')) || 1; D.tempo = (D.nivel - 1) * SEG_NIVEL; D.faixas = nVista = faixasDoNivel(D.nivel); D.carros = []; D.livres = serie(6); for (let k = 0; k < 14; k++) { pilotoDemo(); avancar(); } }
    if (args.has('desvio')) { const lado = Number(args.get('desvio')) < 0 ? -1 : 1; D.desvio = { lado, de: -3, ate: 7 }; D.faixa = xCarro = lado < 0 ? -1 : D.faixas; D.combustivel = 38; abre = 1; ladoVista = lado; }
    if (args.has('inc')) { VEICULOS[veiculoAtual].inclina = [0, 0]; inclinacao = Number(args.get('inc')); xCarro = D.faixa - 0.4; VEICULOS[veiculoAtual].desliza = 1e9; }
    if (args.has('meta')) D.meta = { passo: Number(args.get('meta')) || 2, faixas: faixasDoNivel(D.nivel + 1) };
    if (args.has('laser')) { const a = D.carros.find((c) => c.passo >= 2); if (a) { D.faixa = a.faixa; xCarro = a.faixa; laser(); raio.t = 90; } }
  }
})();
