'use strict';

/* Downforce — corrida em circuito fechado, vista de trás do carro, contra o Tomás, o Duarte e a Sira.
   A estrada em perspetiva vem do Contramão; aqui todos andam no mesmo sentido e há voltas.
   Motor (topo): circuito, corrida, trânsito lento e pilotos automáticos. Não toca no DOM.
   Interface (fundo): estrada em perspetiva num <canvas>, mapa do circuito, teclado e toque. */

// ====================================================================
// Motor
// ====================================================================

const FAIXAS = 5;
const VOLTAS = 3;
const N = 240;            // passos por volta (cada passo são 10 metros)
const METROS_PASSO = 10;
const DT = 1 / 60;        // passo fixo da simulação (s)
const VISTA = 16;         // passos que se veem à frente
// Mudanças (1.ª a 5.ª): velocidade de cruzeiro em passos por segundo. Começa-se em 5.ª.
const MUDANCAS = [1.6, 2.2, 2.8, 3.5, 4.2];
const V_TRANSITO = 0.8;   // o trânsito lento anda todo à mesma velocidade
const ESP_FILAS = 4;      // passos entre filas de trânsito
const ACEL = 1.7;         // passos/s²
const TRAVAGEM = 7;
const COMP = 0.9;         // comprimento de um carro, em passos (distância mínima atrás de outro)
const AO_LADO = 0.75;     // a menos desta distância, um carro noutra faixa está «ao lado»
const TEMPO_IMUNE = 1.6;  // segundos sem bater depois de um choque

const PILOTOS = [
  { nome: 'Noah', cor: '#e63946', ritmo: 0 },
  { nome: 'Tomas', cor: '#ffc61a', ritmo: 4.05 },
  { nome: 'Duarte', cor: '#3a86ff', ritmo: 3.9 },
  { nome: 'Sira', cor: '#f4f1ea', ritmo: 3.75 },
];

const limitar = (v, a, b) => (v < a ? a : v > b ? b : v);
const serie = (n) => Array.from({ length: n }, (_, k) => k);
const resto = (a, n) => ((a % n) + n) % n;

/** Circuito fechado: curva pelos pontos de controlo, reamostrada em N passos iguais.
    pts serve para o mapa; curv (−1…1) diz quanto a estrada curva em cada passo. */
const PISTA = (() => {
  const P = [[330, 92], [560, 84], [770, 104], [898, 210], [902, 380], [800, 494], [640, 500], [520, 400], [400, 396], [300, 500], [170, 492], [92, 380], [100, 210], [190, 110]];
  const m = P.length, fino = [];
  for (let k = 0; k < m; k++) {
    const p0 = P[(k + m - 1) % m], p1 = P[k], p2 = P[(k + 1) % m], p3 = P[(k + 2) % m];
    for (let j = 0; j < 40; j++) {
      const t = j / 40, t2 = t * t, t3 = t2 * t;
      const c = (e) => 0.5 * (2 * p1[e] + (p2[e] - p0[e]) * t + (2 * p0[e] - 5 * p1[e] + 4 * p2[e] - p3[e]) * t2 + (3 * p1[e] - p0[e] - 3 * p2[e] + p3[e]) * t3);
      fino.push([c(0), c(1)]);
    }
  }
  const acum = [0];
  for (let k = 0; k < fino.length; k++) {
    const a = fino[k], b = fino[(k + 1) % fino.length];
    acum.push(acum[k] + Math.hypot(b[0] - a[0], b[1] - a[1]));
  }
  const esp = acum[fino.length] / N, pts = [];
  for (let i = 0, k = 0; i < N; i++) {
    const s = i * esp;
    while (acum[k + 1] < s) k++;
    const a = fino[k], b = fino[(k + 1) % fino.length], t = (s - acum[k]) / (acum[k + 1] - acum[k] || 1);
    pts.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]);
  }
  const ang = pts.map((p, i) => { const q = pts[(i + 1) % N]; return Math.atan2(q[1] - p[1], q[0] - p[0]); });
  const bruto = ang.map((a, i) => { const d = ang[(i + 1) % N] - a; return Math.atan2(Math.sin(d), Math.cos(d)); });
  const suave = bruto.map((_, i) => { let s = 0; for (let j = -3; j <= 3; j++) s += bruto[resto(i + j, N)]; return s / 7; });
  const max = Math.max(...suave.map(Math.abs));
  // A raiz realça as curvas largas, que de outro modo quase não se notavam na estrada.
  return { pts, curv: suave.map((c) => Math.sign(c) * Math.pow(Math.abs(c) / max, 0.6)) };
})();

/** Estado da corrida. fase: 'contagem' | 'corrida' | 'fim' (o humano cortou a meta).
    carros: os 4 pilotos (pos = passos desde a partida, a contar todas as voltas).
    transito: carros lentos { pos (0…N, dentro da volta), faixa, cor, tipo }. */
const F = { t: 0, fase: 'fim', contagem: 0, carros: [], transito: [], chegados: 0, eventos: [] };

/** Distância (em passos) de um ponto da volta até à frente de um carro: positiva = à frente. */
function adiante(pos, q) {
  const d = resto(q - pos, N);
  return d > N / 2 ? d - N : d;
}

function criarTransito() {
  const lista = [];
  let livres = serie(FAIXAS);
  for (let p = 14; p < N - 6; p += ESP_FILAS) {
    if (Math.random() < 0.28) continue; // de vez em quando, um troço limpo
    // Como no Contramão: fica sempre uma faixa livre ao lado de uma que estava livre na fila anterior.
    const possiveis = serie(FAIXAS).filter((f) => livres.some((l) => Math.abs(l - f) <= 1));
    const livre = possiveis[Math.floor(Math.random() * possiveis.length)];
    const quantos = 1 + (Math.random() < 0.5 ? 1 : 0) + (Math.random() < 0.25 ? 1 : 0);
    const ocupadas = serie(FAIXAS).filter((f) => f !== livre).sort(() => Math.random() - 0.5).slice(0, quantos);
    livres = serie(FAIXAS).filter((f) => !ocupadas.includes(f));
    for (const faixa of ocupadas) lista.push({ pos: p, faixa, cor: Math.floor(Math.random() * 5), tipo: Math.floor(Math.random() * 3) });
  }
  return lista;
}

function novaCorrida({ humano = true } = {}) {
  Object.assign(F, { t: 0, fase: 'contagem', contagem: 3.6, chegados: 0, eventos: [], transito: criarTransito() });
  // Grelha: o humano parte de trás.
  const grelha = [[-4.6, 2], [-1, 1], [-2.2, 3], [-3.4, 1]];
  F.carros = PILOTOS.map((p, id) => ({
    id, nome: p.nome, cor: p.cor, humano: humano && id === 0, ritmo: p.ritmo || 4.1,
    pos: grelha[id][0], faixa: grelha[id][1], x: grelha[id][1], v: 0, mudanca: 5,
    imune: 0, espera: 0, volta: 0, fim: null, lugar: 0, choques: 0,
  }));
  return F;
}

/** Há alguma coisa na faixa, entre as distâncias de e ate (em passos) do carro? */
function ocupada(c, faixa, de, ate) {
  for (const t of F.transito) {
    if (t.faixa !== faixa) continue;
    const d = adiante(c.pos, t.pos);
    if (d > de && d < ate) return true;
  }
  for (const o of F.carros) {
    if (o === c || o.faixa !== faixa) continue;
    const d = o.pos - c.pos;
    if (d > de && d < ate) return true;
  }
  return false;
}

/** O que vai à frente na mesma faixa: { d, v } do obstáculo mais próximo (trânsito ou piloto). */
function aFrente(c, faixa = c.faixa) {
  let d = Infinity, v = 0;
  for (const t of F.transito) {
    if (t.faixa !== faixa) continue;
    const dt = adiante(c.pos, t.pos);
    if (dt > -0.2 && dt < d) { d = dt; v = V_TRANSITO; }
  }
  for (const o of F.carros) {
    if (o === c || o.faixa !== faixa) continue;
    const dc = o.pos - c.pos;
    if (dc > 0 && dc < d) { d = dc; v = o.v; }
  }
  return { d, v };
}

/** Muda o humano de faixa (dir: −1 esquerda, +1 direita). Com um carro mesmo ao lado, não deixa. */
function mover(dir, c = F.carros[0]) {
  const nova = c.faixa + dir;
  if (F.fase === 'fim' || nova < 0 || nova >= FAIXAS) return false;
  if (ocupada(c, nova, -AO_LADO, AO_LADO)) { F.eventos.push({ tipo: 'encosto', id: c.id }); return false; }
  c.faixa = nova;
  return true;
}

/** Mete a mudança acima (+1) ou abaixo (−1). */
function mudar(d, c = F.carros[0]) {
  c.mudanca = limitar(c.mudanca + d, 1, MUDANCAS.length);
  return c.mudanca;
}

/** Piloto automático: devolve a velocidade que quer e muda de faixa quando tem alguém à frente. */
function pilotar(c) {
  const humano = F.carros.find((o) => o.humano);
  // Elástico: quem vai muito à frente do humano abranda um pouco; quem vai atrás acelera.
  let alvo = c.ritmo + (humano && !c.humano ? limitar((humano.pos - c.pos) / 60, -0.35, 0.35) : 0);
  if (c.fim !== null) alvo = 2.4; // volta de consagração
  c.espera -= DT;
  const f = aFrente(c);
  const alcance = 2.2 + c.v * 0.9;
  if (f.d < alcance && f.v < alvo - 0.2 && c.espera <= 0) {
    // Escolhe a faixa do lado que tiver mais estrada livre.
    let melhor = null, folga = f.d + 1.5;
    for (const dir of Math.random() < 0.5 ? [-1, 1] : [1, -1]) {
      const nova = c.faixa + dir;
      if (nova < 0 || nova >= FAIXAS || ocupada(c, nova, -1.1, 1.6)) continue;
      const d = aFrente(c, nova).d;
      if (d > folga) { folga = d; melhor = dir; }
    }
    if (melhor === null && f.d < 1.6) {
      // Encurralado atrás de uma fila: vai de lado, faixa a faixa, até à que tiver estrada livre.
      let alvoF = null, maior = f.d + 1.5;
      for (const k of serie(FAIXAS)) { const d = aFrente(c, k).d; if (d > maior) { maior = d; alvoF = k; } }
      if (alvoF !== null) {
        const dir = Math.sign(alvoF - c.faixa);
        if (!ocupada(c, c.faixa + dir, -1.1, 0.92)) melhor = dir;
      }
    }
    if (melhor !== null) { c.faixa += melhor; c.espera = 0.3; }
  }
  return alvo;
}

function passoCarro(c, alvo) {
  // Nunca mais depressa do que dá para travar até ao carro da frente.
  const f = aFrente(c);
  if (f.d < Infinity && !(c.imune > 0 && f.v === V_TRANSITO && f.d < 1)) {
    const folga = Math.max(0, f.d - COMP - 0.15);
    alvo = Math.min(alvo, Math.sqrt(f.v * f.v + 2 * TRAVAGEM * 0.8 * folga));
  }
  // O humano não trava sozinho atrás do trânsito: é ele que tem de se desviar.
  if (c.humano && c.fim === null) alvo = MUDANCAS[c.mudanca - 1];
  c.v += limitar(alvo - c.v, -TRAVAGEM * DT, ACEL * DT);
  if (c.imune > 0) c.imune -= DT;
  let nova = c.pos + c.v * DT;
  // Atrás de outro piloto na mesma faixa não se passa por cima: fica-se colado até mudar de faixa.
  for (const o of F.carros) {
    if (o === c || o.faixa !== c.faixa) continue;
    if (o.pos > c.pos && nova > o.pos - COMP) { nova = Math.max(c.pos, o.pos - COMP); c.v = Math.min(c.v, o.v); }
  }
  c.pos = nova;
  c.x += limitar(c.faixa - c.x, -7 * DT, 7 * DT);
  // Choque com o trânsito lento: o carro para e fica uns instantes sem poder bater outra vez.
  if (c.imune <= 0) {
    for (const t of F.transito) {
      if (t.faixa !== c.faixa) continue;
      const d = adiante(c.pos, t.pos);
      if (d > -0.3 && d < 0.45) {
        c.v = 0;
        c.imune = TEMPO_IMUNE;
        c.choques++;
        F.eventos.push({ tipo: 'choque', id: c.id });
        break;
      }
    }
  }
}

/** Avança a corrida um passo de simulação (DT). */
function passo() {
  if (F.fase === 'contagem') {
    F.contagem -= DT;
    if (F.contagem <= 0) F.fase = 'corrida';
    return;
  }
  F.t += DT;
  for (const t of F.transito) t.pos = resto(t.pos + V_TRANSITO * DT, N);
  for (const c of F.carros) passoCarro(c, c.humano && c.fim === null ? 0 : pilotar(c));
  for (const c of F.carros) {
    if (c.fim !== null) continue;
    const volta = Math.floor(c.pos / N);
    if (volta > c.volta) {
      c.volta = volta;
      F.eventos.push({ tipo: 'volta', id: c.id, volta });
      if (volta >= VOLTAS) {
        c.fim = F.t;
        c.lugar = ++F.chegados;
        if (c.humano || F.chegados === F.carros.length) F.fase = 'fim';
      }
    }
  }
}

/** Pilotos por ordem: primeiro quem já chegou, depois quem vai mais à frente. */
function classificacao() {
  return [...F.carros].sort((a, b) => (a.fim !== null || b.fim !== null ? (a.fim ?? Infinity) - (b.fim ?? Infinity) : b.pos - a.pos));
}

/** Depois de o humano cortar a meta, corre o resto da prova de seguida para saber os tempos de todos. */
function terminarResto(maxSeg = 240) {
  for (let k = 0; k < maxSeg / DT && F.chegados < F.carros.length; k++) passo();
}

if (typeof module !== 'undefined') {
  module.exports = { F, PISTA, FAIXAS, VOLTAS, N, DT, MUDANCAS, V_TRANSITO, COMP, novaCorrida, passo, mover, mudar, pilotar, adiante, classificacao, terminarResto };
}

// ====================================================================
// Interface
// ====================================================================

if (typeof document !== 'undefined') (() => {
  const $ = (id) => document.getElementById(id);
  const tela = $('tela');
  const ctx = tela.getContext('2d');
  const mapa = $('mapa');
  const calmo = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const CORES_TRANSITO = ['#8d99ae', '#9b5de5', '#2ec4b6', '#ff8c42', '#6a994e'];
  const K = 0.55; // força da perspetiva: tamanho = 1 / (1 + K × distância)

  let W = 0, H = 0, dpr = 1;
  let acum = 0;
  let clarao = 0;
  let aviso = { texto: '', ate: 0 };
  let fimMostrado = false;
  let demo = false;
  let epoca = 0;

  const guardado = () => { try { return JSON.parse(localStorage.getItem('downforce-v1')) || {}; } catch { return {}; } };
  const tempoTxt = (t) => `${Math.floor(t / 60)}:${(t % 60).toFixed(1).padStart(4, '0')}`;
  const ordinal = (n) => `${n}.º`;

  function medir() {
    const caixa = tela.parentElement.getBoundingClientRect();
    dpr = Math.min(2, window.devicePixelRatio || 1);
    W = Math.max(50, caixa.width);
    H = Math.max(50, caixa.height);
    tela.width = Math.round(W * dpr);
    tela.height = Math.round(H * dpr);
    const m = mapa.getBoundingClientRect();
    mapa.width = Math.round(m.width * dpr);
    mapa.height = Math.round(m.height * dpr);
  }

  // ---------- Perspetiva (como no Contramão) ----------
  // Posições na estrada medem-se em faixas: u = 0 é o meio da faixa 0, u = 4 o da última.
  const geo = () => {
    const yHor = H * 0.3, yJog = H * 0.8;
    const faixa = Math.min((W * 0.93) / FAIXAS, (yJog - yHor) * 0.62, 230);
    return { yHor, yJog, faixa, cx: W / 2, cv: (FAIXAS - 1) / 2 };
  };
  const escala = (z) => 1 / (1 + K * z);                      // z = distância em passos (0 = o nosso carro)
  const yDe = (g, z) => g.yHor + (g.yJog - g.yHor) * escala(z);
  const xDe = (g, u, z) => g.cx + desvio(z) * g.faixa + (u - g.cv) * g.faixa * escala(z);
  const zFundo = (g) => 1 / ((H - g.yHor) / (g.yJog - g.yHor)) / K - 1 / K; // distância (negativa) no fundo do ecrã

  // Curvas: a curvatura vem do circuito, no sítio onde o nosso carro vai. Somando-a duas vezes ao
  // longo da distância obtém-se quanto a estrada se desvia para o lado em cada ponto.
  const PASSO_Z = 0.25, Z_MAX = 40, FORCA_CURVA = 0.26, ALCANCE_CURVA = 14;
  const tabela = new Float32Array(Z_MAX / PASSO_Z + 1);
  function curvatura(d) {
    const p = resto(d, N), i = Math.floor(p), f = p - i;
    return PISTA.curv[i] + (PISTA.curv[(i + 1) % N] - PISTA.curv[i]) * f;
  }
  function calcularCurvas(pos) {
    let inclinacao = 0, x = 0;
    for (let i = 0; i < tabela.length; i++) {
      const z = i * PASSO_Z;
      tabela[i] = x * escala(z) * FORCA_CURVA;
      inclinacao += curvatura(pos + z) * Math.max(0, 1 - z / ALCANCE_CURVA) * PASSO_Z;
      x += inclinacao * PASSO_Z;
    }
  }
  /** Desvio lateral da estrada à distância z, em larguras de faixa. */
  function desvio(z) {
    if (z <= 0) return 0;
    const p = Math.min(tabela.length - 1.001, z / PASSO_Z), i = Math.floor(p);
    return tabela[i] + (tabela[i + 1] - tabela[i]) * (p - i);
  }

  function quad(x1, y1, x2, y2, x3, y3, x4, y4) {
    ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.lineTo(x3, y3); ctx.lineTo(x4, y4); ctx.closePath(); ctx.fill();
  }
  function redondo(x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
  }

  // ---------- Cenário ----------
  function cenario(g, pos) {
    const ceu = ctx.createLinearGradient(0, 0, 0, g.yHor);
    ceu.addColorStop(0, '#2a6fb8'); ceu.addColorStop(0.7, '#8fc4ea'); ceu.addColorStop(1, '#dff0fa');
    ctx.fillStyle = ceu;
    ctx.fillRect(0, 0, W, g.yHor + 1);
    // Sol e serras (o sol desliza um pouco ao contrário da curva).
    ctx.fillStyle = '#fff6c9';
    ctx.beginPath(); ctx.arc(g.cx - g.faixa * (1.1 + tabela[tabela.length - 1] * 0.5), g.yHor - H * 0.13, H * 0.045, 0, 7); ctx.fill();
    ctx.fillStyle = '#5b7f95';
    ctx.beginPath(); ctx.moveTo(0, g.yHor);
    for (let k = 0; k <= 24; k++) ctx.lineTo((k / 24) * W, g.yHor - H * (0.035 + 0.035 * Math.sin(k * 1.9) * Math.sin(k * 0.7 + 1)) - H * 0.01);
    ctx.lineTo(W, g.yHor); ctx.closePath(); ctx.fill();
    const campo = ctx.createLinearGradient(0, g.yHor, 0, H);
    campo.addColorStop(0, '#3d7a3f'); campo.addColorStop(1, '#4f9a45');
    ctx.fillStyle = campo;
    ctx.fillRect(0, g.yHor, W, H - g.yHor);

    const zb = zFundo(g);
    const fr = resto(pos, 1);
    // Faixas do campo a passar (dão a sensação de velocidade).
    for (let k = 14; k >= -1; k--) {
      const z1 = Math.max(zb, k - fr), z2 = Math.max(zb, k + 0.5 - fr);
      if (z2 <= zb) continue;
      ctx.fillStyle = 'rgba(0, 0, 0, .07)';
      ctx.fillRect(0, yDe(g, z2), W, yDe(g, z1) - yDe(g, z2));
    }
    // Estrada: corretores, alcatrão e riscos. Desenha-se às fatias, do horizonte até cá, para poder curvar.
    const borda = (m) => {
      ctx.beginPath();
      for (let z = Z_MAX; ; z -= PASSO_Z) {
        const zz = Math.max(zb, z);
        ctx.lineTo(xDe(g, -0.5 - m, zz), yDe(g, zz));
        if (zz === zb) break;
      }
      for (let z = zb; ; z += PASSO_Z) {
        const zz = Math.min(Z_MAX, z);
        ctx.lineTo(xDe(g, FAIXAS - 0.5 + m, zz), yDe(g, zz));
        if (zz === Z_MAX) break;
      }
      ctx.closePath();
      ctx.fill();
    };
    ctx.fillStyle = '#f1ead2';
    borda(0.14);
    // Corretores vermelhos e brancos nas bordas.
    for (let k = 30; k >= -1; k--) {
      if (resto(Math.floor(pos) + k, 2)) continue;
      const z1 = Math.max(zb, k - fr), z2 = Math.max(zb, k + 1 - fr);
      if (z2 <= zb) continue;
      ctx.fillStyle = '#d7263d';
      for (const [a, b] of [[-0.64, -0.5], [FAIXAS - 0.5, FAIXAS - 0.36]]) {
        quad(xDe(g, a, z2), yDe(g, z2), xDe(g, b, z2), yDe(g, z2), xDe(g, b, z1), yDe(g, z1), xDe(g, a, z1), yDe(g, z1));
      }
    }
    const alc = ctx.createLinearGradient(0, g.yHor, 0, H);
    alc.addColorStop(0, '#2a2c33'); alc.addColorStop(1, '#474a54');
    ctx.fillStyle = alc;
    borda(0);
    for (let k = 30; k >= -1; k--) {
      const z1 = Math.max(zb, k - fr), z2 = Math.max(zb, k + 0.45 - fr);
      if (z2 <= zb) continue;
      const y1 = yDe(g, z1), y2 = yDe(g, z2), l = 0.03;
      ctx.fillStyle = '#f1ead2';
      for (let u = 0.5; u < FAIXAS - 0.8; u++) {
        quad(xDe(g, u - l, z2), y2, xDe(g, u + l, z2), y2, xDe(g, u + l, z1), y1, xDe(g, u - l, z1), y1);
      }
    }
    // Linha de meta aos quadrados, pintada na estrada (uma por volta).
    for (const zM of [N - resto(pos, N), -resto(pos, N)]) {
      if (zM - 0.18 <= zb || zM > Z_MAX) continue;
      for (let f = 0; f < 2; f++) {
        const z1 = zM - 0.18 + f * 0.18, z2 = z1 + 0.18;
        for (let k = 0; k < 4 * FAIXAS; k++) {
          const a = -0.5 + k / 4, b = a + 0.25;
          ctx.fillStyle = (k + f) % 2 ? '#15171c' : '#f6f2e6';
          quad(xDe(g, a, z2), yDe(g, z2), xDe(g, b, z2), yDe(g, z2), xDe(g, b, z1), yDe(g, z1), xDe(g, a, z1), yDe(g, z1));
        }
      }
    }
    // Postes à beira da pista.
    for (let k = 18; k >= 0; k--) {
      const z = k - fr;
      if (z < zb + 0.05) continue;
      const e = escala(z), y = yDe(g, z), h = g.faixa * 0.55 * e, l = Math.max(1, g.faixa * 0.05 * e);
      for (const lado of [-1, 1]) {
        const x = xDe(g, (lado < 0 ? -0.5 : FAIXAS - 0.5) + lado * 0.4, z);
        ctx.fillStyle = 'rgba(0, 0, 0, .25)';
        ctx.beginPath(); ctx.ellipse(x, y, l * 2.2, l * 0.8, 0, 0, 7); ctx.fill();
        ctx.fillStyle = resto(k + Math.floor(pos), 2) ? '#e8e2d0' : '#2a6fb8';
        ctx.fillRect(x - l / 2, y - h, l, h);
      }
    }
  }

  // ---------- Carros ----------
  /** Carro visto de trás, assente em (x, y), com largura l. tipo 2 = carrinha (mais alta). */
  function carro(x, y, l, cor, tipo) {
    const alto = tipo === 2;
    const hc = l * (alto ? 0.5 : 0.36);  // altura da carroçaria
    const ht = l * (alto ? 0.42 : 0.3);  // altura do tejadilho
    ctx.fillStyle = 'rgba(0, 0, 0, .35)';
    ctx.beginPath(); ctx.ellipse(x, y, l * 0.58, l * 0.1, 0, 0, 7); ctx.fill();
    ctx.fillStyle = '#111';
    for (const s of [-1, 1]) { redondo(x + s * l * 0.36 - l * 0.09, y - l * 0.16, l * 0.18, l * 0.17, l * 0.04); ctx.fill(); }
    const yb = y - l * 0.07 - hc;
    ctx.fillStyle = cor;
    quad(x - l * (alto ? 0.42 : 0.3), yb - ht, x + l * (alto ? 0.42 : 0.3), yb - ht, x + l * 0.44, yb + 1, x - l * 0.44, yb + 1);
    ctx.fillStyle = '#1a2634';
    quad(x - l * (alto ? 0.37 : 0.26), yb - ht * 0.84, x + l * (alto ? 0.37 : 0.26), yb - ht * 0.84, x + l * 0.38, yb - ht * 0.08, x - l * 0.38, yb - ht * 0.08);
    ctx.fillStyle = cor;
    redondo(x - l / 2, yb, l, hc, l * 0.08); ctx.fill();
    ctx.fillStyle = 'rgba(0, 0, 0, .18)';
    ctx.fillRect(x - l / 2, yb + hc * 0.62, l, hc * 0.38);
    ctx.fillStyle = '#20232a';
    redondo(x - l * 0.52, y - l * 0.07 - hc * 0.2, l * 1.04, hc * 0.22, l * 0.03); ctx.fill();
    ctx.fillStyle = '#ff3b30';
    for (const s of [-1, 1]) { redondo(x + s * l * 0.33 - l * 0.11, yb + hc * 0.16, l * 0.22, hc * 0.24, l * 0.03); ctx.fill(); }
    ctx.fillStyle = '#f4f1ea';
    ctx.fillRect(x - l * 0.12, yb + hc * 0.42, l * 0.24, hc * 0.2);
    return yb - ht; // topo do carro (para a etiqueta com o nome)
  }

  /** Pórtico por cima da linha de meta, com a volta que aí começa. */
  function portico(g, z, texto) {
    const e = escala(z), y = yDe(g, z), a = g.faixa * e, m = FAIXAS / 2;
    const x = xDe(g, m - 0.5, z);
    const alto = a * 1.9, l = a * 0.09;
    // Aparece ao longe sem saltar; mesmo em cima de nós fica translúcido, para não tapar os carros.
    ctx.globalAlpha = Math.max(0, Math.min(1, (VISTA + 2.6 - z) / 0.6, Math.max(0.3, z / 1.4)));
    ctx.fillStyle = '#cfd4d8';
    for (const s of [-1, 1]) ctx.fillRect(x + s * a * (m + 0.3) - l / 2, y - alto, l, alto);
    ctx.fillStyle = '#16181d';
    ctx.fillRect(x - a * (m + 0.36), y - alto - a * 0.1, a * (2 * m + 0.72), a * 0.5);
    const q = a * 0.125;
    for (const s of [-1, 1]) for (let i = 0; i < 2; i++) for (let j = 0; j < 4; j++) {
      ctx.fillStyle = (i + j) % 2 ? '#15171c' : '#f6f2e6';
      ctx.fillRect(x + s * a * (m + 0.1) - q + i * q, y - alto - a * 0.1 + j * q, q, q);
    }
    ctx.fillStyle = '#ffd23f';
    ctx.font = `800 ${a * 0.34}px system-ui, sans-serif`;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(texto, x, y - alto + a * 0.16);
    ctx.globalAlpha = 1;
  }

  function desenhar(agora) {
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const g = geo();
    const eu = F.carros[0];
    // Entre dois passos da simulação, os carros desenham-se um pouco adiantados (movimento suave).
    const extra = F.fase === 'corrida' ? acum : 0;
    const pos = eu.pos + eu.v * extra;
    calcularCurvas(pos);
    const tremor = !calmo && clarao > 0 ? clarao * 9 : 0;
    ctx.save();
    ctx.translate((Math.random() - 0.5) * tremor, (Math.random() - 0.5) * tremor);
    cenario(g, pos);
    const zb = zFundo(g);
    const largura = g.faixa * 0.66;
    const itens = [];
    for (const t of F.transito) {
      const z = adiante(pos, t.pos + V_TRANSITO * extra);
      if (z > zb + 0.25 && z < VISTA + 1) itens.push({ z, u: t.faixa, cor: CORES_TRANSITO[t.cor], tipo: t.tipo });
    }
    for (const c of F.carros) {
      const z = c === eu ? 0 : c.pos + c.v * extra - pos;
      if (z > zb + 0.25 && z < VISTA + 1) itens.push({ z, u: c.x, cor: c.cor, tipo: 0, piloto: c });
    }
    const volta = Math.floor(pos / N);
    for (const zM of [N - resto(pos, N), -resto(pos, N)]) {
      if (zM > zb + 0.3 && zM < VISTA + 3) itens.push({ z: zM + 0.001, meta: zM > 0 ? volta + 2 : volta + 1 });
    }
    itens.sort((a, b) => b.z - a.z);
    for (const it of itens) {
      if (it.meta) { portico(g, it.z, it.meta > VOLTAS ? 'META' : `VOLTA ${it.meta}`); continue; }
      const e = escala(it.z);
      // Depois de um choque o nosso carro pisca enquanto não pode bater outra vez.
      const pisca = it.piloto && it.piloto.imune > 0 && Math.floor(agora / 90) % 2;
      ctx.globalAlpha = Math.min(1, (VISTA + 1 - it.z) / 1) * (pisca ? 0.35 : 1);
      const topo = carro(xDe(g, it.u, it.z), yDe(g, it.z), largura * e, it.cor, it.tipo);
      if (it.piloto && it.piloto !== eu && it.z < 12) {
        // Nome por cima dos adversários.
        const tam = Math.max(9, g.faixa * 0.19 * e);
        ctx.font = `800 ${tam}px system-ui, sans-serif`;
        ctx.textAlign = 'center'; ctx.textBaseline = 'bottom';
        ctx.lineWidth = Math.max(2, tam * 0.22);
        ctx.strokeStyle = 'rgba(0, 0, 0, .65)';
        ctx.strokeText(it.piloto.nome, xDe(g, it.u, it.z), topo - tam * 0.2);
        ctx.fillStyle = it.piloto.cor;
        ctx.fillText(it.piloto.nome, xDe(g, it.u, it.z), topo - tam * 0.2);
      }
      ctx.globalAlpha = 1;
    }
    ctx.restore();
    if (clarao > 0) { ctx.fillStyle = `rgba(255, 80, 60, ${clarao * 0.45})`; ctx.fillRect(0, 0, W, H); }
  }

  // ---------- Mapa do circuito ----------
  function desenharMapa() {
    const m = mapa.getContext('2d');
    const w = mapa.width, h = mapa.height;
    m.setTransform(1, 0, 0, 1, 0, 0);
    m.clearRect(0, 0, w, h);
    const xs = PISTA.pts.map((p) => p[0]), ys = PISTA.pts.map((p) => p[1]);
    const x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys);
    const margem = 9 * dpr, e = Math.min((w - 2 * margem) / (x1 - x0), (h - 2 * margem) / (y1 - y0));
    const X = (x) => (w - (x1 - x0) * e) / 2 + (x - x0) * e, Y = (y) => (h - (y1 - y0) * e) / 2 + (y - y0) * e;
    m.lineJoin = 'round';
    for (const [cor, l] of [['rgba(0, 0, 0, .55)', 7], ['#e8e2d0', 4]]) {
      m.strokeStyle = cor; m.lineWidth = l * dpr;
      m.beginPath();
      for (const p of PISTA.pts) m.lineTo(X(p[0]), Y(p[1]));
      m.closePath(); m.stroke();
    }
    // Meta.
    m.fillStyle = '#16181d';
    m.fillRect(X(PISTA.pts[0][0]) - 1.5 * dpr, Y(PISTA.pts[0][1]) - 5 * dpr, 3 * dpr, 10 * dpr);
    const ponto = (c) => {
      const p = resto(c.pos, N), i = Math.floor(p), f = p - i, a = PISTA.pts[i], b = PISTA.pts[(i + 1) % N];
      m.beginPath();
      m.arc(X(a[0] + (b[0] - a[0]) * f), Y(a[1] + (b[1] - a[1]) * f), (c.id === 0 ? 5 : 3.6) * dpr, 0, 7);
      m.fillStyle = c.cor; m.fill();
      m.lineWidth = 1.4 * dpr; m.strokeStyle = c.id === 0 ? '#fff' : 'rgba(0, 0, 0, .7)'; m.stroke();
    };
    for (const c of F.carros) if (c.id !== 0) ponto(c);
    ponto(F.carros[0]);
  }

  // ---------- Painel ----------
  const textos = {};
  function por(id, texto) { if (textos[id] !== texto) { textos[id] = texto; $(id).textContent = texto; } }
  function avisar(texto, seg) { aviso = { texto, ate: performance.now() + seg * 1000 }; }

  function painel(agora) {
    const eu = F.carros[0];
    const ordem = classificacao();
    por('hud-lugar', ordinal(ordem.indexOf(eu) + 1));
    por('hud-tempo', tempoTxt(eu.fim ?? F.t));
    por('hud-volta', `${limitar(eu.volta + 1, 1, VOLTAS)}/${VOLTAS}`);
    por('hud-mudanca', `${eu.mudanca}.ª`);
    por('hud-vel', String(Math.round(eu.v * METROS_PASSO * 3.6)));
    const chave = ordem.map((c) => c.id).join('');
    if (textos.ordem !== chave) {
      textos.ordem = chave;
      $('hud-ordem').replaceChildren(...ordem.map((c, k) => {
        const li = document.createElement('li');
        if (c.id === 0) li.className = 'meu';
        const cor = document.createElement('i');
        cor.style.background = c.cor;
        li.append(`${k + 1} `, cor, ` ${c.nome}`);
        return li;
      }));
    }
    let grande = '';
    if (F.fase === 'contagem') grande = F.contagem > 3 ? '' : String(Math.ceil(F.contagem));
    else if (F.t < 0.9) grande = 'VAI!';
    else if (agora < aviso.ate) grande = aviso.texto;
    else if (eu.fim !== null) grande = 'Meta!';
    if (textos.grande !== grande) {
      textos.grande = grande;
      const el = $('hud-grande');
      el.textContent = grande;
      el.className = `hud-grande${grande.length > 4 ? ' frase' : ''}`;
      void el.offsetWidth; // reinicia a animação
      if (grande) el.classList.add('entra');
    }
  }

  function tratarEventos() {
    for (const e of F.eventos) {
      if (e.id !== 0) continue;
      if (e.tipo === 'choque') { clarao = 1; navigator.vibrate?.(120); avisar('Bateste!', 1); }
      else if (e.tipo === 'encosto') navigator.vibrate?.(30);
      else if (e.tipo === 'volta' && e.volta < VOLTAS) avisar(e.volta === VOLTAS - 1 ? 'Última volta!' : `Volta ${e.volta + 1}`, 1.6);
    }
    F.eventos.length = 0;
  }

  // ---------- Fim da corrida ----------
  function mostrarResultado() {
    terminarResto();
    F.eventos.length = 0;
    const ordem = classificacao();
    const eu = F.carros[0];
    const lugar = ordem.indexOf(eu) + 1;
    const dados = guardado();
    const anterior = dados.melhor;
    const recorde = !anterior || eu.fim < anterior;
    if (recorde && !demo) { try { localStorage.setItem('downforce-v1', JSON.stringify({ melhor: Math.round(eu.fim * 10) / 10 })); } catch { /* sem armazenamento */ } }
    const melhorTempo = ordem[0].fim;
    mostrarFim({
      estado: ['campeao', 'vitoria', 'empate', 'derrota'][lugar - 1],
      icone: ['🏆', '🥈', '🥉', '🏁'][lugar - 1],
      titulo: ['Ganhaste a corrida!', 'Segundo lugar!', 'Terceiro lugar', 'Ficaste em último'][lugar - 1],
      etiqueta: `${VOLTAS} voltas · ${(VOLTAS * N * METROS_PASSO) / 1000} km`,
      linhas: ordem.map((c, k) => ({
        nome: c.nome, eu: c.id === 0, etiqueta: ordinal(k + 1), mais: k === 0 ? 1 : 0,
        total: c.fim !== null ? tempoTxt(c.fim) : '—', barra: c.fim !== null ? (melhorTempo / c.fim) * 100 : 0,
      })),
      texto: `${eu.choques === 0 ? 'Corrida limpa, sem choques.' : eu.choques === 1 ? 'Bateste 1 vez.' : `Bateste ${eu.choques} vezes.`}${recorde && anterior ? ' Novo recorde teu!' : anterior && !recorde ? ` O teu recorde é ${tempoTxt(anterior)}.` : ''}`,
      botao: 'Correr outra vez',
    });
  }

  // ---------- Ciclo do jogo ----------
  let tAnt = 0;
  function quadro(agora) {
    requestAnimationFrame(quadro);
    const dt = Math.min(0.05, (agora - tAnt) / 1000 || 0);
    tAnt = agora;
    const parado = document.querySelector('dialog[open]');
    if (!parado && F.fase !== 'fim') {
      acum += dt;
      while (acum >= DT && F.fase !== 'fim') { acum -= DT; passo(); tratarEventos(); }
    } else if (!parado && F.fase === 'fim' && !fimMostrado) {
      fimMostrado = true;
      const e = epoca;
      setTimeout(() => { if (e === epoca) mostrarResultado(); }, 900);
    }
    if (clarao > 0) clarao = Math.max(0, clarao - dt * 2.2);
    desenhar(agora);
    desenharMapa();
    painel(agora);
  }

  function comecar() {
    epoca++;
    novaCorrida({ humano: !demo });
    fimMostrado = false;
    acum = 0;
    clarao = 0;
    aviso = { texto: '', ate: 0 };
    for (const k of Object.keys(textos)) delete textos[k];
  }

  // ---------- Comandos: setas (ou WASD), toque em cada metade do ecrã, ou os botões ----------
  // Esquerda/direita mudam de faixa; cima/baixo metem a mudança acima ou abaixo.
  const MAPA_DIR = { ArrowLeft: -1, ArrowRight: 1, a: -1, d: 1 };
  const MAPA_MUD = { ArrowUp: 1, ArrowDown: -1, w: 1, s: -1 };
  const podeJogar = () => !document.querySelector('dialog[open]') && F.fase === 'corrida' && F.carros[0].fim === null;
  addEventListener('keydown', (e) => {
    const dir = MAPA_DIR[e.key] ?? MAPA_DIR[e.key.toLowerCase()];
    const mud = MAPA_MUD[e.key] ?? MAPA_MUD[e.key.toLowerCase()];
    if ((!dir && !mud) || document.querySelector('dialog[open]')) return;
    e.preventDefault();
    if (e.repeat || demo) return;
    if (dir) { if (podeJogar()) mover(dir); } else if (F.fase !== 'fim') mudar(mud);
  });
  tela.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    if (podeJogar() && !demo) mover(e.clientX < tela.getBoundingClientRect().left + W / 2 ? -1 : 1);
  });
  for (const b of document.querySelectorAll('.toques button')) {
    b.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      if (demo) return;
      if (b.dataset.mud) { if (F.fase !== 'fim') mudar(Number(b.dataset.mud)); } else if (podeJogar()) mover(Number(b.dataset.dir));
      b.classList.add('ativo');
      setTimeout(() => b.classList.remove('ativo'), 120);
    });
    b.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  $('btn-regras').addEventListener('click', () => $('dlg-regras').showModal());
  $('btn-novo').addEventListener('click', comecar);
  $('fim-btn').addEventListener('click', () => { $('dlg-fim').close(); comecar(); });
  $('dlg-fim').addEventListener('cancel', (e) => { e.preventDefault(); $('fim-btn').click(); });

  // ?demo=1 põe o piloto automático no teu carro; &t=N adianta N segundos (para capturas de ecrã).
  const args = new URLSearchParams(location.search);
  demo = args.has('demo');
  new ResizeObserver(medir).observe(tela.parentElement);
  medir();
  comecar();
  if (demo) {
    F.fase = 'corrida';
    for (let k = 0; k < (Number(args.get('t')) || 0) / DT && F.fase !== 'fim'; k++) passo();
    F.eventos.length = 0;
  }
  requestAnimationFrame(quadro);
})();
