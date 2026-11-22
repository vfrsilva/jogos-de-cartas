'use strict';

/* Super Pilotos by Noah — corrida de 12 pilotos (meninos contra meninas) em circuito fechado.
   Cópia do Downforce (estrada em perspetiva, voltas, mapa) com outro motor: não há trânsito nem
   mudanças; há obstáculos na pista, lasers, gasolina e empurrões entre carros.
   Motor (topo): circuito, obstáculos, corrida e pilotos automáticos. Não toca no DOM.
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
const V_MAX = 4.2;        // velocidade do carro do jogador, em passos por segundo (não há mudanças)
const ACEL = 1.7;         // passos/s²
const TRAVAGEM = 7;
const COMP = 0.9;         // comprimento de um carro, em passos (distância mínima atrás de outro)
const AO_LADO = 0.75;     // a menos desta distância, um carro noutra faixa está «ao lado»
const TEMPO_IMUNE = 1.6;  // segundos sem bater depois de um choque
const LASERS = 12;        // disparos de cada piloto para a corrida toda
const ALCANCE_LASER = 10; // passos
const ESP_FILAS = 5;      // passos entre filas de obstáculos
const TEMPO_AR = 0.9;     // segundos no ar depois de um salto
// Gasolina (0–100): gasta-se por passo andado e recarrega nas faixas de abastecimento.
const CONSUMO = 0.42;
const CARGA = 8;
const TEMPO_SECO = 2.5;   // segundos parado quando a gasolina acaba (depois o depósito volta a 40)
// Faixas de abastecimento: uma de cada lado, sempre nos mesmos sítios da volta (em passos).
const POSTOS = [{ lado: -1, de: 62, ate: 76 }, { lado: 1, de: 178, ate: 192 }];

// Caixas surpresa: filas fixas em cada volta, entre as filas de obstáculos. Dão um turbo ou um
// míssil, que fica guardado (um de cada vez) até o piloto o usar. Quanto mais atrás vai o piloto,
// mais dura o turbo. Quem vai em primeiro não as apanha.
const CAIXAS_POS = [40.5, 80.5, 120.5, 160.5, 200.5];
const TEMPO_CAIXA = 3;    // segundos até uma caixa apanhada voltar a aparecer
const TURBO_V = 1.6;      // passos/s a mais durante o turbo
const V_MISSIL = 9;       // passos/s (e vai acelerando)

const AZUL = '#2f7bff', ROSA = '#ff5fa8';
// equipa 0 = meninos (azul), 1 = meninas (rosa). O primeiro é o carro do jogador.
const PILOTOS = [
  { nome: 'Noah', num: 23, equipa: 0 },
  { nome: 'Duarte', num: 55, equipa: 0 },
  { nome: 'Tomás', num: 1, equipa: 0 },
  { nome: 'Madis', num: 33, equipa: 0 },
  { nome: 'Rafael', num: 52, equipa: 0 },
  { nome: 'Leo', num: 17, equipa: 0 },
  { nome: 'Isabel', num: 9, equipa: 1 },
  { nome: 'Sira', num: 12, equipa: 1 },
  { nome: 'Yara', num: 20, equipa: 1 },
  { nome: 'Bia', num: 2, equipa: 1 },
  { nome: 'Alice', num: 7, equipa: 1 },
  { nome: 'Luisa', num: 15, equipa: 1 },
];
const EQUIPAS = ['Meninos', 'Meninas'];
const BICHOS = ['vaca', 'cavalo', 'ovelha', 'porco'];
// O laser desfaz pedras e troncos e espanta os animais; poças e saltos ficam como estão.
const LASER_ACERTA = { pedra: true, tronco: true, animal: true };

const limitar = (v, a, b) => (v < a ? a : v > b ? b : v);
const serie = (n) => Array.from({ length: n }, (_, k) => k);
const resto = (a, n) => ((a % n) + n) % n;
const sorte = (n) => Math.floor(Math.random() * n);
function baralhar(lista) {
  for (let i = lista.length - 1; i > 0; i--) { const j = sorte(i + 1); [lista[i], lista[j]] = [lista[j], lista[i]]; }
  return lista;
}

/** Circuito fechado: curva pelos pontos de controlo, reamostrada em N passos iguais.
    pts serve para o mapa; curv (−1…1) diz quanto a estrada curva em cada passo. */
const PISTA = (() => {
  const P = [[300, 80], [520, 70], [700, 120], [760, 230], [900, 250], [910, 400], [780, 500], [600, 470], [520, 360], [400, 350], [330, 480], [180, 500], [90, 390], [150, 270], [100, 160], [180, 90]];
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
    carros: os 12 pilotos (pos = passos desde a partida, a contar todas as voltas; faixa −1 ou
    FAIXAS = dentro de uma faixa de abastecimento).
    obstaculos: { pos (0…N, dentro da volta), tipo, faixa, larg, x, vx, bicho, ativo, foge }.
    caixas: { pos, faixa, espera (s até voltar a aparecer) }. misseis: { de, alvo (ids), pos, x, t }. */
const S = { t: 0, fase: 'fim', contagem: 0, carros: [], obstaculos: [], caixas: [], misseis: [], chegados: 0, eventos: [] };

/** Distância (em passos) de um ponto da volta até outro: positiva = à frente. */
function adiante(pos, q) {
  const d = resto(q - pos, N);
  return d > N / 2 ? d - N : d;
}

/** Obstáculos de uma volta, em filas. Como no Contramão, em cada fila fica sempre uma faixa
    livre ao lado de uma que estava livre na fila anterior. Os animais vão sozinhos na fila. */
function criarObstaculos() {
  const lista = [];
  const por = (pos, tipo, faixa, extra) => lista.push({ pos, tipo, faixa, larg: 1, x: faixa, vx: 0, bicho: 0, ativo: true, foge: 0, ...extra });
  let livres = serie(FAIXAS);
  for (let p = 18; p < N - 8; p += ESP_FILAS) {
    const r = Math.random();
    if (r < 0.15) continue; // de vez em quando, um troço limpo
    if (r < 0.32) {
      // Um animal a atravessar a estrada, de um lado para o outro.
      por(p, 'animal', sorte(FAIXAS), { bicho: sorte(BICHOS.length), vx: (Math.random() < 0.5 ? -1 : 1) * (0.25 + Math.random() * 0.25) });
      livres = serie(FAIXAS);
      continue;
    }
    const possiveis = serie(FAIXAS).filter((f) => livres.some((l) => Math.abs(l - f) <= 1));
    const livre = possiveis[sorte(possiveis.length)];
    const ocupadas = new Set();
    if (Math.random() < 0.3) {
      // Tronco caído: tapa duas faixas seguidas.
      const inicios = serie(FAIXAS - 1).filter((f) => f !== livre && f + 1 !== livre);
      const f = inicios[sorte(inicios.length)];
      por(p, 'tronco', f, { larg: 2, x: f + 0.5 });
      ocupadas.add(f).add(f + 1);
    }
    const quantos = Math.min(3 - ocupadas.size, (ocupadas.size ? 0 : 1) + (Math.random() < 0.55 ? 1 : 0) + (Math.random() < 0.25 ? 1 : 0));
    for (const f of baralhar(serie(FAIXAS).filter((k) => k !== livre && !ocupadas.has(k))).slice(0, quantos)) {
      const t = Math.random();
      por(p, t < 0.4 ? 'pedra' : t < 0.75 ? 'poca' : 'salto', f);
      ocupadas.add(f);
    }
    livres = serie(FAIXAS).filter((f) => !ocupadas.has(f));
  }
  return lista;
}

/** Começa uma corrida. A dificuldade dos 11 adversários é sorteada: cada um fica com um nível
    diferente (0 = o mais fraco, 10 = o mais forte), que dá o ritmo e a atenção aos obstáculos.
    grelha: ids dos pilotos pela ordem de partida (a classificação da corrida anterior); sem ela,
    o jogador parte de trás, ao meio, e os outros por ordem sorteada. */
function novaCorrida({ humano = true, grelha = null } = {}) {
  Object.assign(S, { t: 0, fase: 'contagem', contagem: 3.6, chegados: 0, eventos: [], obstaculos: criarObstaculos(), misseis: [],
    caixas: CAIXAS_POS.flatMap((pos, i) => (i % 2 ? [1, 3] : [0, 2, 4]).map((faixa) => ({ pos, faixa, espera: 0 }))) });
  const niveis = baralhar(serie(PILOTOS.length - 1));
  // Grelha de 4 filas de 3 (em cada fila: meio, esquerda, direita).
  const lugares = baralhar(serie(PILOTOS.length - 1));
  const valida = Array.isArray(grelha) && grelha.length === PILOTOS.length && serie(PILOTOS.length).every((id) => grelha.includes(id));
  S.carros = PILOTOS.map((p, id) => {
    const nivel = id === 0 ? null : niveis[id - 1];
    const k = id === 0 ? 1 : nivel / 10;
    const lugar = valida ? grelha.indexOf(id) : id === 0 ? 9 : lugares[id - 1] < 9 ? lugares[id - 1] : lugares[id - 1] + 1;
    const faixa = [2, 0, 4][lugar % 3];
    return {
      id, nome: p.nome, num: p.num, equipa: p.equipa, cor: p.equipa ? ROSA : AZUL, humano: humano && id === 0,
      nivel, ritmo: id === 0 ? V_MAX : 3.6 + 0.5 * k, atencao: id === 0 ? 0.97 : 0.72 + 0.26 * k,
      atrev: Math.random(), sede: 60 + Math.random() * 12,
      pos: -1 - Math.floor(lugar / 3) * 1.3, faixa, x: faixa, v: 0,
      lasers: LASERS, premio: null, usa: 0, comb: 100, turbo: 0, parado: 0, ar: 0, imune: 0, espera: 0, ultimo: null, visto: null, ignora: null,
      volta: 0, fim: null, lugar: 0, choques: 0, atingido: 0,
    };
  });
  return S;
}

/** O obstáculo tapa esta faixa? (Os animais andam de lado; o tronco tapa duas.) */
function tapa(o, faixa) {
  if (!o.ativo || o.foge) return false;
  return o.tipo === 'animal' ? Math.abs(o.x - faixa) < 0.6 : faixa >= o.faixa && faixa < o.faixa + o.larg;
}

/** A faixa existe neste sítio da volta? As de abastecimento (−1 e FAIXAS) só entre de e ate. */
function faixaExiste(faixa, pos) {
  if (faixa >= 0 && faixa < FAIXAS) return true;
  const p = resto(pos, N);
  return POSTOS.some((q) => (q.lado < 0 ? -1 : FAIXAS) === faixa && p >= q.de && p <= q.ate);
}

/** Carros que estão mesmo ao lado de c, na faixa dada. */
function aoLado(c, faixa) {
  return S.carros.filter((o) => o !== c && o.faixa === faixa && o.ar <= 0 && Math.abs(adiante(c.pos, o.pos)) < AO_LADO);
}

/** Empurra o carro o uma faixa para o lado (e, em cadeia, quem estiver ao lado dele).
    Com fazer = false só diz se dá: não dá contra a borda da estrada. */
function empurrar(o, dir, fazer, fundo = 0) {
  const nova = o.faixa + dir;
  if (fundo > 4 || !faixaExiste(nova, o.pos)) return false;
  for (const viz of aoLado(o, nova)) if (!empurrar(viz, dir, fazer, fundo + 1)) return false;
  if (fazer) { o.faixa = nova; o.v *= 0.9; o.espera = 0.4; }
  return true;
}

/** Muda de faixa (dir: −1 esquerda, +1 direita). Quem estiver ao lado é empurrado para a faixa
    seguinte; se não houver para onde o empurrar, a mudança não se faz. */
function mover(dir, c = S.carros[0]) {
  const nova = c.faixa + dir;
  if (S.fase === 'fim' || c.ar > 0 || !faixaExiste(nova, c.pos)) return false;
  const vizinhos = aoLado(c, nova);
  if (vizinhos.length) {
    if (!vizinhos.every((o) => empurrar(o, dir, false))) { S.eventos.push({ tipo: 'encosto', id: c.id }); return false; }
    for (const o of vizinhos) { if (o.faixa === nova) empurrar(o, dir, true); S.eventos.push({ tipo: 'empurrao', id: c.id, alvo: o.id }); }
  }
  c.faixa = nova;
  return true;
}

/** Dispara o laser de c: acerta na primeira coisa à frente, na mesma faixa. Pedras e troncos
    desfazem-se, os animais fogem da estrada e um carro atingido perde a velocidade.
    Sem alvo ao alcance não dispara nem gasta. */
function disparar(c = S.carros[0]) {
  if (S.fase !== 'corrida' || c.lasers <= 0 || c.ar > 0 || c.fim !== null) return null;
  let d = ALCANCE_LASER, obst = null, carro = null;
  for (const o of S.obstaculos) {
    if (!LASER_ACERTA[o.tipo] || !tapa(o, c.faixa)) continue;
    const x = adiante(c.pos, o.pos);
    if (x > 0.2 && x < d) { d = x; obst = o; }
  }
  for (const o of S.carros) {
    if (o === c || o.faixa !== c.faixa || o.ar > 0) continue;
    const x = adiante(c.pos, o.pos);
    if (x > 0.2 && x < d) { d = x; carro = o; obst = null; }
  }
  if (!obst && !carro) return null;
  c.lasers--;
  if (carro) {
    if (carro.imune <= 0) { carro.v *= 0.3; carro.imune = TEMPO_IMUNE; carro.atingido++; }
  } else if (obst.tipo === 'animal') obst.foge = obst.x < (FAIXAS - 1) / 2 ? -1 : 1;
  else obst.ativo = false;
  const tiro = { tipo: 'laser', id: c.id, alvo: carro ? 'carro' : obst.tipo, vitima: carro ? carro.id : -1, pos: carro ? carro.pos : obst.pos, u: carro ? carro.faixa : obst.x };
  S.eventos.push(tiro);
  return tiro;
}

/** O piloto c passou numa caixa surpresa: fica com um turbo ou um míssil guardado (`c.premio`)
    até o usar. Quem vai em primeiro ou já tem um prémio guardado não recebe nada e a caixa
    fica onde estava: devolve false. */
function abrirCaixa(c) {
  if (c.fim !== null || c.premio) return false;
  if (classificacao()[0] === c) return false;
  c.premio = Math.random() < 0.65 ? 'missil' : 'turbo';
  c.usa = 0.4 + Math.random() * 2; // os pilotos automáticos demoram um bocadinho a usá-lo
  S.eventos.push({ tipo: 'caixa', id: c.id, item: c.premio });
  return true;
}

/** Usa o prémio guardado de c. O turbo dura mais para quem vai mais atrás; o míssil parte atrás
    do piloto que vai imediatamente à frente (sem ninguém à frente em prova, fica guardado).
    Devolve o prémio usado, ou null. */
function usarPremio(c = S.carros[0]) {
  if (S.fase !== 'corrida' || !c.premio || c.ar > 0 || c.fim !== null) return null;
  const ordem = classificacao(), lugar = ordem.indexOf(c) + 1;
  const item = c.premio;
  if (item === 'missil') {
    const alvo = ordem[lugar - 2];
    if (!alvo || alvo.fim !== null) return null;
    S.misseis.push({ de: c.id, alvo: alvo.id, pos: c.pos + 0.5, x: c.x, t: 0 });
  } else c.turbo = 1.2 + 0.25 * (lugar - 1);
  c.premio = null;
  S.eventos.push({ tipo: 'premio', id: c.id, item });
  return item;
}

/** A barra de espaços: usa o prémio guardado, se houver e puder ser usado; senão dispara o laser. */
function acao(c = S.carros[0]) {
  return usarPremio(c) || disparar(c);
}

/** O que c tem à frente numa faixa: { d, o, carro } do obstáculo ou do carro mais lento mais próximo. */
function livre(c, faixa, alvo) {
  let d = Infinity, o = null, carro = null;
  for (const b of S.obstaculos) {
    if (b === c.ignora || !tapa(b, faixa)) continue;
    const x = adiante(c.pos, b.pos);
    if (x > -0.2 && x < d) { d = x; o = b; }
  }
  for (const k of S.carros) {
    if (k === c || k.faixa !== faixa || k.ar > 0 || k.v >= alvo - 0.2) continue;
    const x = adiante(c.pos, k.pos);
    if (x > 0 && x < d) { d = x; o = null; carro = k; }
  }
  return { d, o, carro };
}

/** Piloto automático: devolve a velocidade que quer; desvia-se dos obstáculos, vai abastecer
    quando tem pouca gasolina e usa o laser quando não tem por onde passar. */
function pilotar(c) {
  const humano = S.carros[0];
  // Elástico: quem vai muito à frente do jogador abranda um pouco; quem vai atrás acelera.
  let alvo = c.ritmo + (c.id ? limitar((humano.pos - c.pos) / 60, -0.35, 0.35) : 0);
  if (c.fim !== null) alvo = 2.4; // volta de consagração
  c.espera -= DT;
  if (c.premio && (c.usa -= DT) <= 0 && !usarPremio(c)) c.usa = 0.5;
  if (c.ar > 0 || c.espera > 0 || c.parado > 0) return alvo;
  const p = resto(c.pos, N);
  // Dentro da faixa de abastecimento: sai com o depósito cheio ou antes de ela acabar.
  if (c.faixa < 0 || c.faixa >= FAIXAS) {
    const posto = POSTOS.find((q) => (q.lado < 0) === (c.faixa < 0));
    if (c.comb >= 97 || posto.ate - p < 3) c.espera = mover(c.faixa < 0 ? 1 : -1, c) ? 0.3 : 0.05;
    return alvo;
  }
  // Com pouca gasolina, encosta-se ao lado da próxima faixa de abastecimento e entra.
  let desejo = null, urgente = false;
  // Uma caixa surpresa na faixa ao lado, já perto: vale a pena ir buscá-la.
  for (const b of S.caixas) {
    const d = adiante(c.pos, b.pos);
    if (!c.premio && S.carros.some((o) => o.pos > c.pos) && b.espera <= 0 && d > 1 && d < 6 && Math.abs(b.faixa - c.faixa) === 1) desejo = b.faixa;
  }
  if (c.comb < c.sede && c.fim === null) {
    for (const q of POSTOS) {
      if (q.de - p > 20 || p > q.ate - 4) continue;
      const borda = q.lado < 0 ? 0 : FAIXAS - 1;
      if (c.faixa !== borda) { desejo = borda; urgente = true; }
      else if (p >= q.de && mover(q.lado, c)) { c.espera = 0.3; return alvo; }
    }
  }
  let f = livre(c, c.faixa, alvo);
  if (f.o && f.o !== c.visto) {
    // Obstáculo novo à frente: às vezes o piloto distrai-se e não o vê (os saltos, muitas vezes).
    c.visto = f.o;
    c.ignora = Math.random() > (f.o.tipo === 'salto' ? 0.5 : c.atencao) ? f.o : null;
    if (c.ignora) f = livre(c, c.faixa, alvo);
  }
  const dist = serie(FAIXAS).map((k) => (k === c.faixa ? f : livre(c, k, alvo)));
  const atirar = () => {
    if (f.d < 0.3 || f.d > 2.8 || c.lasers <= 0) return;
    // Nos outros carros só atiram os mais atrevidos, de vez em quando, e nunca logo à partida.
    if (f.o ? LASER_ACERTA[f.o.tipo] : c.lasers > 4 && S.t > 8 && Math.random() < c.atrev * 0.12) { disparar(c); c.espera = 0.25; }
  };
  let destino = null;
  if (f.d < 2.2 + c.v * 0.9) {
    // Escolhe a faixa com mais estrada livre, de preferência perto.
    let nota = f.d + 1.5;
    for (const k of serie(FAIXAS)) {
      const n = Math.min(dist[k].d, 30) - 0.8 * Math.abs(k - c.faixa) + (k === desejo ? 2 : 0) + Math.random() * 0.3;
      if (k !== c.faixa && n > nota) { nota = n; destino = k; }
    }
    if (destino === null) atirar();
  } else if (desejo !== null) destino = desejo;
  if (destino !== null) {
    const dir = Math.sign(destino - c.faixa), nova = c.faixa + dir;
    if (dist[nova].d > 1 || dist[nova].d > f.d + 0.5) {
      // Com um carro ao lado, só se mete (e o empurra) quem é atrevido ou precisa de abastecer.
      if (!aoLado(c, nova).length || (urgente && destino === desejo) || Math.random() < c.atrev * 0.3) c.espera = mover(dir, c) ? 0.3 : 0.1;
      else c.espera = 0.1;
    } else atirar();
  }
  return alvo;
}

function passoCarro(c, alvo) {
  if (c.parado > 0) {
    // Parado uns segundos: sem gasolina (depois segue com o depósito a 40) ou atingido por um míssil.
    alvo = 0;
    c.parado -= DT;
    if (c.parado <= 0 && c.comb <= 0) c.comb = 40;
  }
  if (c.turbo > 0) {
    c.turbo -= DT;
    if (c.parado <= 0) alvo += TURBO_V;
  }
  if (!c.humano || c.fim !== null) {
    // Os pilotos automáticos nunca vão mais depressa do que dá para travar até ao carro da frente.
    for (const o of S.carros) {
      if (o === c || o.faixa !== c.faixa || o.ar > 0) continue;
      const d = adiante(c.pos, o.pos);
      if (d > 0 && d < 8) alvo = Math.min(alvo, Math.sqrt(o.v * o.v + 2 * TRAVAGEM * 0.8 * Math.max(0, d - COMP - 0.15)));
    }
  }
  if (c.ar <= 0) c.v += limitar(alvo - c.v, -TRAVAGEM * DT, (c.turbo > 0 ? 3 : 1) * ACEL * DT);
  if (c.imune > 0) c.imune -= DT;
  let anda = c.v * DT;
  if (c.ar > 0) {
    c.ar -= DT;
    if (c.ar <= 0) { c.v *= 0.8; S.eventos.push({ tipo: 'aterra', id: c.id }); } // a aterragem custa um pouco
  } else {
    // Atrás de outro carro na mesma faixa não se passa por cima: fica-se colado até mudar de faixa.
    for (const o of S.carros) {
      if (o === c || o.faixa !== c.faixa || o.ar > 0) continue;
      const d = adiante(c.pos, o.pos);
      if (d > 0 && anda > d - COMP) { anda = Math.max(0, d - COMP); c.v = Math.min(c.v, o.v); }
    }
  }
  c.pos += anda;
  c.x += limitar(c.faixa - c.x, -7 * DT, 7 * DT);
  const noPosto = c.faixa < 0 || c.faixa >= FAIXAS;
  if (noPosto) {
    c.comb = Math.min(100, c.comb + CARGA * anda);
    if (!faixaExiste(c.faixa, c.pos)) {
      // A faixa de abastecimento acabou e o carro ainda lá estava: bate no fim e volta à estrada.
      c.faixa = c.faixa < 0 ? 0 : FAIXAS - 1;
      c.v = 0; c.imune = TEMPO_IMUNE; c.choques++;
      S.eventos.push({ tipo: 'choque', id: c.id, com: 'barreira' });
    }
  } else if (c.fim === null && c.parado <= 0) {
    c.comb -= CONSUMO * anda;
    if (c.comb <= 0) { c.comb = 0; c.parado = TEMPO_SECO; S.eventos.push({ tipo: 'seco', id: c.id }); }
  }
  if (c.ultimo && adiante(c.pos, c.ultimo.pos) < -0.3) c.ultimo = null;
  if (c.ar > 0 || noPosto) return;
  for (const b of S.caixas) {
    if (b.espera > 0 || b.faixa !== c.faixa) continue;
    const d = adiante(c.pos, b.pos);
    if (d > -0.3 && d < 0.45 && abrirCaixa(c)) b.espera = TEMPO_CAIXA;
  }
  for (const o of S.obstaculos) {
    if (o === c.ultimo || !tapa(o, c.faixa)) continue;
    const d = adiante(c.pos, o.pos);
    if (d <= -0.3 || d >= 0.45) continue;
    if (o.tipo === 'poca') { c.v *= 0.45; c.ultimo = o; S.eventos.push({ tipo: 'poca', id: c.id }); }
    else if (o.tipo === 'salto') { c.ar = TEMPO_AR; c.ultimo = o; S.eventos.push({ tipo: 'salto', id: c.id }); }
    else if (c.imune <= 0) {
      // Pedra, tronco ou animal: o carro para e fica uns instantes sem poder bater outra vez.
      c.v = 0; c.imune = TEMPO_IMUNE; c.choques++; c.ultimo = o;
      S.eventos.push({ tipo: 'choque', id: c.id, com: o.tipo === 'animal' ? BICHOS[o.bicho] : o.tipo });
    }
    break;
  }
}

/** Avança a corrida um passo de simulação (DT). */
function passo() {
  if (S.fase === 'contagem') {
    S.contagem -= DT;
    if (S.contagem <= 0) S.fase = 'corrida';
    return;
  }
  S.t += DT;
  for (const o of S.obstaculos) {
    if (o.tipo !== 'animal' || !o.ativo) continue;
    if (o.foge) {
      // Espantado pelo laser: corre para fora da estrada.
      o.x += o.foge * 3.5 * DT;
      if (o.x < -2.5 || o.x > FAIXAS + 1.5) o.ativo = false;
    } else {
      o.x += o.vx * DT;
      if (o.x < 0 || o.x > FAIXAS - 1) { o.x = limitar(o.x, 0, FAIXAS - 1); o.vx = -o.vx; }
    }
  }
  for (const b of S.caixas) if (b.espera > 0) b.espera -= DT;
  for (const c of S.carros) passoCarro(c, c.humano && c.fim === null ? V_MAX : pilotar(c));
  // Mísseis: perseguem o alvo, cada vez mais depressa, e acertam sempre: o carro fica parado
  // tanto tempo como quando fica sem gasolina.
  S.misseis = S.misseis.filter((m) => {
    const a = S.carros[m.alvo];
    if (a.fim !== null) return false;
    m.t += DT;
    m.pos += (V_MISSIL + 2 * m.t) * DT;
    m.x += limitar(a.x - m.x, -4 * DT, 4 * DT);
    if (m.pos < a.pos - 0.3) return true;
    a.v = 0; a.parado = Math.max(a.parado, TEMPO_SECO); a.imune = TEMPO_SECO + 1; a.atingido++;
    S.eventos.push({ tipo: 'missil', id: m.de, vitima: a.id });
    return false;
  });
  for (const c of S.carros) {
    if (c.fim !== null) continue;
    const volta = Math.floor(c.pos / N);
    if (volta > c.volta) {
      c.volta = volta;
      S.eventos.push({ tipo: 'volta', id: c.id, volta });
      if (volta >= VOLTAS) {
        c.fim = S.t;
        c.lugar = ++S.chegados;
        if (c.humano || S.chegados === S.carros.length) S.fase = 'fim';
      }
    }
  }
}

/** Pilotos por ordem: primeiro quem já chegou, depois quem vai mais à frente. */
function classificacao() {
  return [...S.carros].sort((a, b) => (a.fim !== null || b.fim !== null ? (a.fim ?? Infinity) - (b.fim ?? Infinity) : b.pos - a.pos));
}

/** Pontos de cada equipa: 12 para o primeiro, 11 para o segundo… 1 para o último. */
function pontosEquipas() {
  const pontos = [0, 0];
  classificacao().forEach((c, k) => { pontos[c.equipa] += S.carros.length - k; });
  return pontos;
}

/** Depois de o humano cortar a meta, corre o resto da prova de seguida para saber os tempos de todos. */
function terminarResto(maxSeg = 300) {
  for (let k = 0; k < maxSeg / DT && S.chegados < S.carros.length; k++) passo();
}

if (typeof module !== 'undefined') {
  module.exports = { S, PISTA, PILOTOS, POSTOS, FAIXAS, VOLTAS, N, DT, V_MAX, COMP, LASERS, novaCorrida, passo, mover, disparar, usarPremio, acao, pilotar, adiante, tapa, faixaExiste, classificacao, pontosEquipas, terminarResto };
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
  const estreito = matchMedia('(max-width: 620px)');
  const K = 0.55; // força da perspetiva: tamanho = 1 / (1 + K × distância)
  const EMOJI = { vaca: '🐄', cavalo: '🐎', ovelha: '🐑', porco: '🐖' };
  const VOZES = { vaca: 'Muuu!', cavalo: 'Hiiii!', ovelha: 'Mééé!', porco: 'Oinc!', pedra: 'Uma pedra!', tronco: 'Um tronco!', barreira: 'Bateste!' };
  const COR_RAIO = ['90, 240, 255', '255, 130, 220']; // por equipa

  let W = 0, H = 0, dpr = 1;
  let acum = 0;
  let clarao = 0, corClarao = '255, 80, 60';
  let aviso = { texto: '', ate: 0 };
  let fimMostrado = false;
  let demo = false;
  let epoca = 0;
  let abre = 0;        // 0–1: quanto a vista se afastou para caber a faixa de abastecimento
  let ladoVista = 1;   // lado da última faixa de abastecimento
  let pv = null;       // faixa de abastecimento à vista: { q, zDe, zAte } (distâncias ao nosso carro)
  let postoAvisado = null;
  let grelha = null;   // ordem de partida: a classificação da última corrida (fica guardada)
  let raios = [];      // disparos a desenhar: { id, pos, u, alvo, vitima, t } (t em segundos)

  const guardado = () => { try { return JSON.parse(localStorage.getItem('superpilotos-v1')) || {}; } catch { return {}; } };
  const tempoTxt = (t) => `${Math.floor(t / 60)}:${(t % 60).toFixed(1).padStart(4, '0')}`;
  const ordinal = (n) => `${n}.º`;
  const artigo = (c) => (c.equipa ? 'A' : 'O');

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
  // A vista mostra a estrada toda e afasta-se um pouco quando há uma faixa de abastecimento.
  const geo = () => {
    const yHor = H * 0.3, yJog = H * 0.8;
    const esq = -0.5 - (ladoVista < 0 ? abre : 0), dir = FAIXAS - 0.5 + (ladoVista > 0 ? abre : 0);
    const faixa = Math.min((W * 0.93) / (dir - esq), (yJog - yHor) * 0.62, 230);
    return { yHor, yJog, faixa, cx: W / 2, cv: (esq + dir) / 2 };
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

  // ---------- Faixa de abastecimento ----------
  /** A faixa de abastecimento que se vê a partir de pos (ou null). */
  function postoAVista(pos) {
    for (const q of POSTOS) {
      const zDe = adiante(pos, q.de), zAte = zDe + q.ate - q.de;
      if (zAte > -3 && zDe < VISTA + 6) return { q, zDe, zAte };
    }
    return null;
  }
  /** Largura (0–1 faixas) da faixa de abastecimento à distância z, do lado dado; afunila nas pontas. */
  function largExtra(z, lado) {
    if (!pv || pv.q.lado !== lado) return 0;
    return Math.max(0, Math.min(1, (z - (pv.zDe - 0.5)) / 0.7, (pv.zAte + 0.5 - z) / 0.7));
  }
  /** Alcatrão esverdeado ao lado da estrada, com riscas de carga e uma placa à entrada. */
  function desenharPosto(g, zb) {
    if (!pv) return;
    const lado = pv.q.lado;
    const zA = Math.max(zb, pv.zDe - 0.5), zB = Math.min(Z_MAX, pv.zAte + 0.5);
    if (zB <= zA) return;
    const n = Math.max(2, Math.ceil((zB - zA) / PASSO_Z));
    const ub = lado < 0 ? -0.5 : FAIXAS - 0.5; // borda da estrada desse lado
    const tira = (berma, cor) => {
      ctx.fillStyle = cor;
      ctx.beginPath();
      for (let i = 0; i <= n; i++) { const z = zA + ((zB - zA) * i) / n; ctx.lineTo(xDe(g, ub, z), yDe(g, z)); }
      for (let i = n; i >= 0; i--) {
        const z = zA + ((zB - zA) * i) / n, w = largExtra(z, lado);
        ctx.lineTo(xDe(g, ub + lado * (w + (w > 0 ? berma : 0.14)), z), yDe(g, z));
      }
      ctx.closePath();
      ctx.fill();
    };
    tira(0.14, '#f1ead2');
    tira(0, '#27504a');
    // Riscas de carga, uma por passo.
    for (let i = pv.q.ate - pv.q.de - 1; i >= 0; i--) {
      const z = pv.zDe + i + 0.5;
      if (z - 0.16 <= zb || z > 24 || largExtra(z, lado) < 0.99) continue;
      const z1 = z - 0.16, z2 = z + 0.16;
      ctx.fillStyle = 'rgba(110, 231, 197, .6)';
      quad(xDe(g, ub + lado * 0.18, z2), yDe(g, z2), xDe(g, ub + lado * 0.82, z2), yDe(g, z2),
        xDe(g, ub + lado * 0.82, z1), yDe(g, z1), xDe(g, ub + lado * 0.18, z1), yDe(g, z1));
    }
  }
  /** Placa da bomba de gasolina, à entrada da faixa de abastecimento. */
  function placaPosto(g, z) {
    const lado = pv.q.lado, ub = lado < 0 ? -0.5 : FAIXAS - 0.5;
    const e = escala(z), x = xDe(g, ub + lado * 1.25, z), y = yDe(g, z), a = g.faixa * e;
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
    // Corretores azuis e rosa nas bordas (as cores das duas equipas).
    for (let k = 30; k >= -1; k--) {
      if (resto(Math.floor(pos) + k, 2)) continue;
      const z1 = Math.max(zb, k - fr), z2 = Math.max(zb, k + 1 - fr);
      if (z2 <= zb) continue;
      for (const [a, b, cor] of [[-0.64, -0.5, AZUL], [FAIXAS - 0.5, FAIXAS - 0.36, ROSA]]) {
        ctx.fillStyle = cor;
        quad(xDe(g, a, z2), yDe(g, z2), xDe(g, b, z2), yDe(g, z2), xDe(g, b, z1), yDe(g, z1), xDe(g, a, z1), yDe(g, z1));
      }
    }
    const alc = ctx.createLinearGradient(0, g.yHor, 0, H);
    alc.addColorStop(0, '#2a2c33'); alc.addColorStop(1, '#474a54');
    ctx.fillStyle = alc;
    borda(0);
    desenharPosto(g, zb);
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
    // Postes à beira da pista (não onde passa a faixa de abastecimento).
    for (let k = 18; k >= 0; k--) {
      const z = k - fr;
      if (z < zb + 0.05) continue;
      const e = escala(z), y = yDe(g, z), h = g.faixa * 0.55 * e, l = Math.max(1, g.faixa * 0.05 * e);
      for (const lado of [-1, 1]) {
        if (largExtra(z, lado) > 0) continue;
        const x = xDe(g, (lado < 0 ? -0.5 : FAIXAS - 0.5) + lado * 0.4, z);
        ctx.fillStyle = 'rgba(0, 0, 0, .25)';
        ctx.beginPath(); ctx.ellipse(x, y, l * 2.2, l * 0.8, 0, 0, 7); ctx.fill();
        ctx.fillStyle = resto(k + Math.floor(pos), 2) ? '#e8e2d0' : '#2a6fb8';
        ctx.fillRect(x - l / 2, y - h, l, h);
      }
    }
  }

  // ---------- Carros ----------
  /** Carro visto de trás, assente em (x, y), com largura l e o número do piloto na traseira.
      alt = altura a que vai do chão (num salto); a sombra fica no chão. */
  function carro(x, y, l, cor, num, alt) {
    const hc = l * 0.36;  // altura da carroçaria
    const ht = l * 0.3;   // altura do tejadilho
    ctx.fillStyle = 'rgba(0, 0, 0, .35)';
    const s0 = 1 / (1 + alt / l);
    ctx.beginPath(); ctx.ellipse(x, y, l * 0.58 * s0, l * 0.1 * s0, 0, 0, 7); ctx.fill();
    y -= alt;
    ctx.fillStyle = '#111';
    for (const s of [-1, 1]) { redondo(x + s * l * 0.36 - l * 0.09, y - l * 0.16, l * 0.18, l * 0.17, l * 0.04); ctx.fill(); }
    const yb = y - l * 0.07 - hc;
    ctx.fillStyle = cor;
    quad(x - l * 0.3, yb - ht, x + l * 0.3, yb - ht, x + l * 0.44, yb + 1, x - l * 0.44, yb + 1);
    ctx.fillStyle = '#1a2634';
    quad(x - l * 0.26, yb - ht * 0.84, x + l * 0.26, yb - ht * 0.84, x + l * 0.38, yb - ht * 0.08, x - l * 0.38, yb - ht * 0.08);
    ctx.fillStyle = cor;
    redondo(x - l / 2, yb, l, hc, l * 0.08); ctx.fill();
    ctx.fillStyle = 'rgba(0, 0, 0, .18)';
    ctx.fillRect(x - l / 2, yb + hc * 0.72, l, hc * 0.28);
    ctx.fillStyle = '#20232a';
    redondo(x - l * 0.52, y - l * 0.07 - hc * 0.2, l * 1.04, hc * 0.22, l * 0.03); ctx.fill();
    ctx.fillStyle = '#ff3b30';
    for (const s of [-1, 1]) { redondo(x + s * l * 0.37 - l * 0.09, yb + hc * 0.16, l * 0.18, hc * 0.24, l * 0.03); ctx.fill(); }
    // Número do piloto, num círculo branco.
    const r = hc * 0.36;
    ctx.fillStyle = '#fff';
    ctx.beginPath(); ctx.ellipse(x, yb + hc * 0.4, r * 1.25, r, 0, 0, 7); ctx.fill();
    if (l > 16) {
      ctx.fillStyle = '#12151c';
      ctx.font = `900 ${r * 1.5}px system-ui, sans-serif`;
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(String(num), x, yb + hc * 0.42);
    }
    return yb - ht; // topo do carro (para a etiqueta com o nome)
  }

  // ---------- Obstáculos ----------
  /** Desenha um obstáculo à distância z. a = largura de uma faixa a essa distância. */
  function obstaculo(g, o, z, agora) {
    const e = escala(z), a = g.faixa * e, x = xDe(g, o.x, z), y = yDe(g, z);
    if (o.tipo === 'poca') {
      const ry = Math.max(1, (yDe(g, z - 0.28) - yDe(g, z + 0.28)) / 2);
      ctx.fillStyle = '#2f6fa8';
      ctx.beginPath(); ctx.ellipse(x, y, a * 0.43, ry, 0, 0, 7); ctx.fill();
      ctx.fillStyle = '#5db4ea';
      ctx.beginPath(); ctx.ellipse(x - a * 0.03, y - ry * 0.1, a * 0.36, ry * 0.76, 0, 0, 7); ctx.fill();
      ctx.fillStyle = 'rgba(255, 255, 255, .7)';
      ctx.beginPath(); ctx.ellipse(x - a * 0.12, y - ry * 0.3, a * 0.12, ry * 0.2, 0, 0, 7); ctx.fill();
    } else if (o.tipo === 'salto') {
      // Rampa: sobe para longe de nós. Vê-se a rampa de frente, com setas a apontar para cima.
      const z1 = z - 0.3, z2 = z + 0.3, e1 = escala(z1), e2 = escala(z2);
      const xa = xDe(g, o.x, z1), xb = xDe(g, o.x, z2), ya = yDe(g, z1), yb = yDe(g, z2) - g.faixa * e2 * 0.34;
      const la = g.faixa * e1 * 0.42, lb = g.faixa * e2 * 0.42;
      ctx.fillStyle = 'rgba(0, 0, 0, .3)';
      quad(xb - lb, yDe(g, z2), xb + lb, yDe(g, z2), xb + lb * 1.12, yDe(g, z2) + a * 0.05, xb - lb * 1.12, yDe(g, z2) + a * 0.05);
      ctx.fillStyle = '#8a5a12';
      quad(xb - lb, yb, xb + lb, yb, xb + lb, yDe(g, z2), xb - lb, yDe(g, z2));
      ctx.fillStyle = '#ffb31a';
      quad(xa - la, ya, xa + la, ya, xb + lb, yb, xb - lb, yb);
      ctx.strokeStyle = '#fff'; ctx.lineWidth = Math.max(1.5, a * 0.05); ctx.lineJoin = 'round';
      for (const t of [0.3, 0.62]) {
        const xm = xa + (xb - xa) * t, ym = ya + (yb - ya) * t, lm = (la + (lb - la) * t) * 0.5, hm = (ya - yb) * 0.24;
        ctx.beginPath(); ctx.moveTo(xm - lm, ym); ctx.lineTo(xm, ym - hm); ctx.lineTo(xm + lm, ym); ctx.stroke();
      }
    } else if (o.tipo === 'pedra') {
      ctx.fillStyle = 'rgba(0, 0, 0, .35)';
      ctx.beginPath(); ctx.ellipse(x, y, a * 0.4, a * 0.08, 0, 0, 7); ctx.fill();
      const forma = [[-0.36, 0], [-0.33, -0.2], [-0.16, -0.4], [0.08, -0.44], [0.28, -0.3], [0.37, -0.1], [0.34, 0]];
      ctx.fillStyle = '#878c96';
      ctx.beginPath(); for (const [px, py] of forma) ctx.lineTo(x + px * a, y + py * a); ctx.closePath(); ctx.fill();
      ctx.fillStyle = '#b4b9c2';
      ctx.beginPath(); for (const [px, py] of [[-0.33, -0.2], [-0.16, -0.4], [0.08, -0.44], [0, -0.24], [-0.2, -0.14]]) ctx.lineTo(x + px * a, y + py * a); ctx.closePath(); ctx.fill();
      ctx.fillStyle = '#5e636c';
      ctx.beginPath(); for (const [px, py] of [[0.08, -0.44], [0.28, -0.3], [0.37, -0.1], [0.34, 0], [0.12, 0], [0, -0.24]]) ctx.lineTo(x + px * a, y + py * a); ctx.closePath(); ctx.fill();
    } else if (o.tipo === 'tronco') {
      // Tronco deitado ao través de duas faixas.
      const m = a * 0.92, h = a * 0.3;
      ctx.fillStyle = 'rgba(0, 0, 0, .35)';
      ctx.beginPath(); ctx.ellipse(x, y, m * 1.02, a * 0.07, 0, 0, 7); ctx.fill();
      ctx.fillStyle = '#7a4a21';
      ctx.fillRect(x - m, y - h, 2 * m, h);
      ctx.fillStyle = '#5c3615';
      ctx.fillRect(x - m, y - h * 0.4, 2 * m, h * 0.4);
      ctx.fillStyle = '#93602f';
      ctx.fillRect(x - m, y - h, 2 * m, h * 0.22);
      ctx.fillStyle = '#4a2b10';
      for (const t of [-0.6, -0.15, 0.35, 0.7]) ctx.fillRect(x + t * m, y - h * 0.7, a * 0.16, Math.max(1, h * 0.07));
      for (const s of [-1, 1]) {
        ctx.fillStyle = '#d9ae6e';
        ctx.beginPath(); ctx.ellipse(x + s * m, y - h / 2, h * 0.3, h / 2, 0, 0, 7); ctx.fill();
        ctx.strokeStyle = '#9a7340'; ctx.lineWidth = Math.max(1, h * 0.07);
        ctx.beginPath(); ctx.ellipse(x + s * m, y - h / 2, h * 0.15, h * 0.26, 0, 0, 7); ctx.stroke();
      }
    } else {
      // Animal: anda de lado pela estrada (o desenho vem virado para a esquerda).
      const salto = o.foge ? Math.abs(Math.sin(agora / 60)) * a * 0.12 : Math.abs(Math.sin(agora / 220 + o.pos)) * a * 0.03;
      ctx.fillStyle = 'rgba(0, 0, 0, .3)';
      ctx.beginPath(); ctx.ellipse(x, y, a * 0.36, a * 0.07, 0, 0, 7); ctx.fill();
      ctx.save();
      ctx.translate(x, y - salto + a * 0.08);
      if ((o.foge || o.vx) > 0) ctx.scale(-1, 1);
      ctx.font = `${a * 0.78}px system-ui, "Apple Color Emoji", "Segoe UI Emoji", "Noto Color Emoji", sans-serif`;
      ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic';
      ctx.fillStyle = '#fff';
      ctx.fillText(EMOJI[BICHOS[o.bicho]], 0, 0);
      ctx.restore();
    }
  }

  /** Caixa surpresa: um cubo colorido com um ponto de interrogação, a flutuar por cima da estrada. */
  function caixa(g, b, z, agora) {
    const e = escala(z), a = g.faixa * e, x = xDe(g, b.faixa, z), y = yDe(g, z);
    const l = a * 0.44, yc = y - a * 0.5 - Math.sin(agora / 260 + b.pos + b.faixa) * a * 0.06;
    ctx.fillStyle = 'rgba(0, 0, 0, .3)';
    ctx.beginPath(); ctx.ellipse(x, y, l * 0.55, l * 0.13, 0, 0, 7); ctx.fill();
    const tom = (agora / 9 + b.pos * 7 + b.faixa * 50) % 360;
    ctx.fillStyle = `hsl(${tom}, 95%, 62%)`;
    redondo(x - l / 2, yc - l / 2, l, l, l * 0.16); ctx.fill();
    ctx.fillStyle = `hsl(${(tom + 60) % 360}, 95%, 72%)`;
    redondo(x - l / 2, yc - l / 2, l, l * 0.4, l * 0.16); ctx.fill();
    ctx.strokeStyle = '#fff'; ctx.lineWidth = Math.max(1, l * 0.08);
    redondo(x - l / 2, yc - l / 2, l, l, l * 0.16); ctx.stroke();
    ctx.fillStyle = '#fff';
    ctx.font = `900 ${l * 0.78}px system-ui, sans-serif`;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText('?', x, yc + l * 0.04);
  }

  /** Míssil visto de trás: a chama do motor e as quatro aletas. */
  function missil(g, m, z, agora) {
    const e = escala(z), a = g.faixa * e, x = xDe(g, m.x, z), y = yDe(g, z) - a * 0.3;
    ctx.fillStyle = 'rgba(0, 0, 0, .3)';
    ctx.beginPath(); ctx.ellipse(x, yDe(g, z), a * 0.14, a * 0.04, 0, 0, 7); ctx.fill();
    const r = a * (0.2 + 0.04 * Math.sin(agora / 30));
    ctx.fillStyle = 'rgba(255, 123, 46, .55)';
    ctx.beginPath(); ctx.arc(x, y, r, 0, 7); ctx.fill();
    ctx.strokeStyle = '#d7263d'; ctx.lineWidth = Math.max(1.5, a * 0.05); ctx.lineCap = 'round';
    for (const [dx, dy] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) { ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + dx * a * 0.13, y + dy * a * 0.13); ctx.stroke(); }
    ctx.fillStyle = '#e9edf2';
    ctx.beginPath(); ctx.arc(x, y, a * 0.1, 0, 7); ctx.fill();
    ctx.fillStyle = '#ffd23f';
    ctx.beginPath(); ctx.arc(x, y, a * 0.055, 0, 7); ctx.fill();
  }

  /** Chamas do turbo, a sair de trás do carro. */
  function chamas(x, y, l, agora) {
    for (const s of [-1, 1]) for (const [cor, k] of [['#ff7b2e', 1], ['#ffe066', 0.55]]) {
      const h = l * (0.3 + 0.1 * Math.sin(agora / 35 + s)) * k, w = l * 0.1 * k;
      ctx.fillStyle = cor;
      ctx.beginPath(); ctx.moveTo(x + s * l * 0.26 - w, y - l * 0.08); ctx.lineTo(x + s * l * 0.26 + w, y - l * 0.08); ctx.lineTo(x + s * l * 0.26, y - l * 0.08 + h); ctx.closePath(); ctx.fill();
    }
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

  /** Raio de laser de um carro até ao alvo, e o estouro do que foi atingido. */
  function desenharRaio(g, r, pos, zb, largura) {
    const quem = S.carros[r.id];
    const z0 = r.id === 0 ? 0 : adiante(pos, quem.pos);
    const z1 = adiante(pos, r.vitima >= 0 ? S.carros[r.vitima].pos : r.pos);
    if (z0 < zb + 0.2 || z1 > VISTA + 1 || z1 <= z0) return;
    const e0 = escala(z0), e1 = escala(z1);
    const x0 = xDe(g, quem.x, z0), y0 = yDe(g, z0) - largura * e0 * 0.62;
    const xr = xDe(g, quem.x, z1), x1 = xDe(g, r.u, z1), y1 = yDe(g, z1) - largura * e1 * 0.3;
    const feixe = 1 - r.t / 0.22;
    if (feixe > 0) {
      ctx.lineCap = 'round';
      const cor = COR_RAIO[quem.equipa];
      for (const [alfa, l] of [[0.35, 0.16], [0.8, 0.07], [1, 0.025]]) {
        ctx.strokeStyle = l < 0.03 ? `rgba(255, 255, 255, ${feixe})` : `rgba(${cor}, ${alfa * feixe})`;
        ctx.lineWidth = Math.max(1, largura * e0 * l);
        ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(xr, y1); ctx.stroke();
      }
    }
    const k = r.t / 0.52; // estouro: 0 → 1
    if (k < 1 && r.alvo !== 'animal') {
      const raio = largura * e1 * (0.35 + 0.75 * k) * (r.alvo === 'carro' ? 0.6 : 1);
      ctx.globalAlpha = 1 - k;
      for (const [cor, f] of [['#ff7b2e', 1], ['#ffd23f', 0.68], ['#fffbe0', 0.36]]) {
        ctx.fillStyle = cor;
        ctx.beginPath(); ctx.arc(x1, y1, raio * f, 0, 7); ctx.fill();
      }
      // Estilhaços da cor do que rebentou.
      ctx.fillStyle = r.alvo === 'pedra' ? '#878c96' : r.alvo === 'tronco' ? '#7a4a21' : '#fff';
      for (let i = 0; i < 8; i++) {
        const an = i * 0.785 + 0.4, d = raio * (0.6 + 1.3 * k), t = largura * e1 * 0.09;
        ctx.fillRect(x1 + Math.cos(an) * d - t / 2, y1 + Math.sin(an) * d * 0.75 - k * raio * 0.3 - t / 2, t, t);
      }
      ctx.globalAlpha = 1;
    }
  }

  function desenhar(agora) {
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const eu = S.carros[0];
    // Entre dois passos da simulação, os carros desenham-se um pouco adiantados (movimento suave).
    const extra = S.fase === 'corrida' ? acum : 0;
    const pos = eu.pos + eu.v * extra;
    pv = postoAVista(pos);
    if (pv) ladoVista = pv.q.lado;
    const g = geo();
    calcularCurvas(pos);
    const tremor = !calmo && clarao > 0 ? clarao * 9 : 0;
    ctx.save();
    ctx.translate((Math.random() - 0.5) * tremor, (Math.random() - 0.5) * tremor);
    cenario(g, pos);
    const zb = zFundo(g);
    const largura = g.faixa * 0.66;
    const itens = [];
    for (const o of S.obstaculos) {
      if (!o.ativo) continue;
      const z = adiante(pos, o.pos);
      if (z > zb + 0.25 && z < VISTA + 1) itens.push({ z, obst: o });
    }
    for (const b of S.caixas) {
      const z = adiante(pos, b.pos);
      if (b.espera <= 0 && z > zb + 0.25 && z < VISTA + 1) itens.push({ z, caixa: b });
    }
    for (const m of S.misseis) {
      const z = adiante(pos, m.pos);
      if (z > zb + 0.25 && z < VISTA + 1) itens.push({ z, missil: m });
    }
    for (const c of S.carros) {
      const z = c === eu ? 0 : adiante(pos, c.pos + c.v * extra);
      if (z > zb + 0.25 && z < VISTA + 1) itens.push({ z: z + 0.002, piloto: c });
    }
    const volta = Math.floor(pos / N);
    for (const zM of [N - resto(pos, N), -resto(pos, N)]) {
      if (zM > zb + 0.3 && zM < VISTA + 3) itens.push({ z: zM + 0.001, meta: zM > 0 ? volta + 2 : volta + 1 });
    }
    if (pv && pv.zDe - 0.5 > zb + 0.3 && pv.zDe < VISTA + 4) itens.push({ z: pv.zDe - 0.5, placa: true });
    itens.sort((a, b) => b.z - a.z);
    for (const it of itens) {
      if (it.meta) { portico(g, it.z, it.meta > VOLTAS ? 'META' : `VOLTA ${it.meta}`); continue; }
      if (it.placa) { ctx.globalAlpha = Math.min(1, (VISTA + 4 - it.z) / 1); placaPosto(g, it.z); ctx.globalAlpha = 1; continue; }
      const e = escala(it.z);
      const c = it.piloto;
      // Depois de um choque o carro pisca enquanto não pode bater outra vez.
      const pisca = c && c.imune > 0 && Math.floor(agora / 90) % 2;
      ctx.globalAlpha = Math.min(1, (VISTA + 1 - it.z) / 1) * (pisca ? 0.35 : 1);
      if (it.obst) { obstaculo(g, it.obst, it.z, agora); ctx.globalAlpha = 1; continue; }
      if (it.caixa) { caixa(g, it.caixa, it.z, agora); ctx.globalAlpha = 1; continue; }
      if (it.missil) { missil(g, it.missil, it.z, agora); ctx.globalAlpha = 1; continue; }
      const x = xDe(g, c.x, it.z);
      const t = c.ar > 0 ? 1 - c.ar / TEMPO_AR : 0;
      const alt = 4 * t * (1 - t) * largura * e * 0.75;
      const topo = carro(x, yDe(g, it.z), largura * e, c.cor, c.num, alt);
      if (c.turbo > 0) chamas(x, yDe(g, it.z) - alt, largura * e, agora);
      if (c !== eu && it.z < 9) {
        // Nome por cima dos adversários.
        const tam = Math.max(9, g.faixa * 0.19 * e);
        ctx.font = `800 ${tam}px system-ui, sans-serif`;
        ctx.textAlign = 'center'; ctx.textBaseline = 'bottom';
        ctx.lineWidth = Math.max(2, tam * 0.22);
        ctx.strokeStyle = 'rgba(0, 0, 0, .65)';
        ctx.strokeText(c.nome, x, topo - tam * 0.2);
        ctx.fillStyle = c.equipa ? '#ffc4e0' : '#bcd8ff';
        ctx.fillText(c.nome, x, topo - tam * 0.2);
      }
      ctx.globalAlpha = 1;
    }
    for (const r of raios) desenharRaio(g, r, pos, zb, largura);
    ctx.restore();
    if (clarao > 0) { ctx.fillStyle = `rgba(${corClarao}, ${clarao * 0.45})`; ctx.fillRect(0, 0, W, H); }
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
    m.lineJoin = 'round'; m.lineCap = 'butt';
    for (const [cor, l] of [['rgba(0, 0, 0, .55)', 7], ['#e8e2d0', 4]]) {
      m.strokeStyle = cor; m.lineWidth = l * dpr;
      m.beginPath();
      for (const p of PISTA.pts) m.lineTo(X(p[0]), Y(p[1]));
      m.closePath(); m.stroke();
    }
    // Faixas de abastecimento, a verde.
    m.strokeStyle = '#19c98b'; m.lineWidth = 4 * dpr;
    for (const q of POSTOS) {
      m.beginPath();
      for (let i = q.de; i <= q.ate; i++) m.lineTo(X(PISTA.pts[i][0]), Y(PISTA.pts[i][1]));
      m.stroke();
    }
    // Meta.
    m.fillStyle = '#16181d';
    m.fillRect(X(PISTA.pts[0][0]) - 1.5 * dpr, Y(PISTA.pts[0][1]) - 5 * dpr, 3 * dpr, 10 * dpr);
    const ponto = (c) => {
      const p = resto(c.pos, N), i = Math.floor(p), f = p - i, a = PISTA.pts[i], b = PISTA.pts[(i + 1) % N];
      m.beginPath();
      m.arc(X(a[0] + (b[0] - a[0]) * f), Y(a[1] + (b[1] - a[1]) * f), (c.id === 0 ? 5 : 3.2) * dpr, 0, 7);
      m.fillStyle = c.cor; m.fill();
      m.lineWidth = (c.id === 0 ? 1.8 : 1) * dpr; m.strokeStyle = c.id === 0 ? '#fff' : 'rgba(0, 0, 0, .7)'; m.stroke();
    };
    for (const c of S.carros) if (c.id !== 0) ponto(c);
    ponto(S.carros[0]);
  }

  // ---------- Painel ----------
  const textos = {};
  const ICONE_PREMIO = { missil: '🚀', turbo: '🔥' };
  const NOME_PREMIO = { missil: 'Míssil', turbo: 'Turbo' };
  function por(id, texto) { if (textos[id] !== texto) { textos[id] = texto; $(id).textContent = texto; } }
  function avisar(texto, seg) { aviso = { texto, ate: performance.now() + seg * 1000 }; }

  function painel(agora) {
    const eu = S.carros[0];
    const ordem = classificacao();
    const lugar = ordem.indexOf(eu);
    por('hud-lugar', ordinal(lugar + 1));
    por('hud-tempo', tempoTxt(eu.fim ?? S.t));
    por('hud-volta', `${limitar(eu.volta + 1, 1, VOLTAS)}/${VOLTAS}`);
    por('hud-laser', `⚡${eu.lasers}`);
    // O prémio guardado: no painel e no botão de toque, que passa a usá-lo em vez do laser.
    const premio = eu.fim === null ? eu.premio || '' : '';
    if (textos.premio !== premio) {
      textos.premio = premio;
      $('hud-premio').className = `premio${premio ? ` tem ${premio}` : ''}`;
      $('hud-premio-icone').textContent = ICONE_PREMIO[premio] || '?';
      $('hud-premio-nome').textContent = premio ? NOME_PREMIO[premio] : 'Sem prémio';
      const b = $('btn-tiro');
      b.textContent = ICONE_PREMIO[premio] || '⚡';
      b.classList.toggle('carregado', Boolean(premio));
      b.setAttribute('aria-label', premio ? `Usar ${NOME_PREMIO[premio].toLowerCase()}` : 'Disparar o laser');
    }
    const nivel = Math.round(eu.comb);
    const classe = `deposito${eu.faixa < 0 || eu.faixa >= FAIXAS ? ' carrega' : nivel < 25 ? ' baixo' : ''}`;
    if (textos.deposito !== nivel) { textos.deposito = nivel; $('deposito-nivel').style.width = `${nivel}%`; }
    if (textos.depositoClasse !== classe) { textos.depositoClasse = classe; $('deposito').className = classe; }
    // Classificação: em ecrãs estreitos só cabem os cinco à volta do jogador.
    const n = estreito.matches ? 5 : ordem.length;
    const de = limitar(lugar - Math.floor(n / 2), 0, ordem.length - n);
    const chave = `${de}:${ordem.slice(de, de + n).map((c) => c.id).join(',')}`;
    if (textos.ordem !== chave) {
      textos.ordem = chave;
      $('hud-ordem').replaceChildren(...ordem.slice(de, de + n).map((c, k) => {
        const li = document.createElement('li');
        if (c.id === 0) li.className = 'meu';
        const cor = document.createElement('i');
        cor.style.background = c.cor;
        li.append(`${de + k + 1} `, cor, ` ${c.nome}`);
        return li;
      }));
    }
    let grande = '';
    if (S.fase === 'contagem') grande = S.contagem > 3 ? '' : String(Math.ceil(S.contagem));
    else if (S.t < 0.9) grande = 'VAI!';
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
    const eu = S.carros[0];
    for (const e of S.eventos) {
      if (e.tipo === 'laser') {
        raios.push({ ...e, t: 0 });
        if (e.id === 0) navigator.vibrate?.(40);
        if (e.vitima === 0 && !demo) { clarao = 0.7; corClarao = COR_RAIO[S.carros[e.id].equipa]; navigator.vibrate?.(90); avisar(`${artigo(S.carros[e.id])} ${S.carros[e.id].nome} acertou-te!`, 1.3); }
        continue;
      }
      if (e.tipo === 'missil') {
        const quem = S.carros[e.id], vitima = S.carros[e.vitima];
        if (e.vitima === 0 && !demo) { clarao = 1; corClarao = '255, 140, 40'; navigator.vibrate?.(150); avisar(`O míssil d${quem.equipa ? 'a' : 'o'} ${quem.nome} acertou-te!`, 2.2); }
        else if (e.id === 0) avisar(`Acertaste n${vitima.equipa ? 'a' : 'o'} ${vitima.nome}!`, 1.2);
        continue;
      }
      if (e.tipo === 'empurrao' && e.alvo === 0) { navigator.vibrate?.(50); avisar(`${artigo(S.carros[e.id])} ${S.carros[e.id].nome} empurrou-te!`, 1); continue; }
      if (e.id !== 0) continue;
      if (e.tipo === 'choque') { clarao = 1; corClarao = '255, 80, 60'; navigator.vibrate?.(120); avisar(VOZES[e.com] || 'Bateste!', 1); }
      else if (e.tipo === 'poca') { clarao = 0.8; corClarao = '90, 170, 240'; navigator.vibrate?.(60); avisar('Splash!', 0.9); }
      else if (e.tipo === 'salto') avisar('Iuupi!', 0.8);
      else if (e.tipo === 'caixa') { navigator.vibrate?.(40); avisar(e.item === 'missil' ? '🚀 Tens um míssil!' : '🔥 Tens um turbo!', 1.3); }
      else if (e.tipo === 'premio') { navigator.vibrate?.(40); avisar(e.item === 'missil' ? '🚀 Lá vai!' : '🔥 Turbo!', 0.9); }
      else if (e.tipo === 'seco') { clarao = 0.6; corClarao = '255, 80, 60'; avisar('Sem gasolina!', 2.2); }
      else if (e.tipo === 'encosto' || e.tipo === 'empurrao') navigator.vibrate?.(30);
      else if (e.tipo === 'volta' && e.volta < VOLTAS) avisar(e.volta === VOLTAS - 1 ? 'Última volta!' : `Volta ${e.volta + 1}`, 1.6);
    }
    S.eventos.length = 0;
    // Com o depósito a menos de meio, avisa de que lado vem a faixa de abastecimento.
    if (pv && pv.q !== postoAvisado && pv.zDe > 1 && pv.zDe < 11 && eu.comb < 55 && eu.fim === null) {
      postoAvisado = pv.q;
      avisar(pv.q.lado < 0 ? '◀ ⛽ Gasolina' : 'Gasolina ⛽ ▶', 1.8);
    }
    if (!pv) postoAvisado = null;
  }

  // ---------- Fim da corrida ----------
  function mostrarResultado() {
    terminarResto();
    S.eventos.length = 0;
    const ordem = classificacao();
    const eu = S.carros[0];
    const lugar = ordem.indexOf(eu) + 1;
    const dados = guardado();
    const anterior = dados.melhor;
    const recorde = !anterior || eu.fim < anterior;
    // A classificação fica guardada: é a grelha de partida da corrida seguinte.
    grelha = ordem.map((c) => c.id);
    if (!demo) { try { localStorage.setItem('superpilotos-v1', JSON.stringify({ melhor: recorde ? Math.round(eu.fim * 10) / 10 : anterior, grelha })); } catch { /* sem armazenamento */ } }
    const melhorTempo = ordem[0].fim;
    const pontos = pontosEquipas();
    const equipas = pontos[0] === pontos[1] ? `Meninos e Meninas empataram a ${pontos[0]} pontos.`
      : `Ganharam ${pontos[0] > pontos[1] ? 'os Meninos' : 'as Meninas'}: ${Math.max(...pontos)} – ${Math.min(...pontos)}.`;
    mostrarFim({
      estado: lugar === 1 ? 'campeao' : lugar <= 3 ? 'vitoria' : lugar <= 6 ? 'empate' : 'derrota',
      icone: ['🏆', '🥈', '🥉'][lugar - 1] || '🏁',
      titulo: ['Ganhaste a corrida!', 'Segundo lugar!', 'Terceiro lugar!'][lugar - 1] || `Ficaste em ${ordinal(lugar)}`,
      etiqueta: `${VOLTAS} voltas · ${(VOLTAS * N * METROS_PASSO) / 1000} km`,
      linhas: ordem.map((c, k) => ({
        nome: `${c.equipa ? '🩷' : '💙'} ${c.nome}`, eu: c.id === 0, etiqueta: ordinal(k + 1), mais: k === 0 ? 1 : 0,
        total: c.fim !== null ? tempoTxt(c.fim) : '—', barra: c.fim !== null ? (melhorTempo / c.fim) * 100 : 0,
      })),
      texto: `${equipas}${recorde && anterior ? ' Novo recorde teu!' : anterior && !recorde ? ` O teu recorde é ${tempoTxt(anterior)}.` : ''}`,
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
    if (!parado && S.fase !== 'fim') {
      acum += dt;
      while (acum >= DT && S.fase !== 'fim') { acum -= DT; passo(); tratarEventos(); }
    } else if (!parado && S.fase === 'fim' && !fimMostrado) {
      fimMostrado = true;
      const e = epoca;
      setTimeout(() => { if (e === epoca) mostrarResultado(); }, 900);
    }
    if (!parado) {
      for (const r of raios) r.t += dt;
      raios = raios.filter((r) => r.t < 0.52);
    }
    if (clarao > 0) clarao = Math.max(0, clarao - dt * 2.2);
    abre += ((pv && pv.zDe < 13 ? 1 : 0) - abre) * Math.min(1, dt / 0.26);
    desenhar(agora);
    desenharMapa();
    painel(agora);
  }

  function comecar() {
    epoca++;
    novaCorrida({ humano: !demo, grelha });
    fimMostrado = false;
    acum = 0;
    clarao = 0;
    raios = [];
    postoAvisado = null;
    aviso = { texto: '', ate: 0 };
    for (const k of Object.keys(textos)) delete textos[k];
  }

  // ---------- Comandos: setas (ou A/D), toque em cada metade do ecrã, ou os botões ----------
  // Esquerda/direita mudam de faixa; a barra de espaços usa o prémio guardado ou, sem ele, dispara o laser.
  const MAPA_DIR = { ArrowLeft: -1, ArrowRight: 1, a: -1, d: 1 };
  const podeJogar = () => !document.querySelector('dialog[open]') && S.fase === 'corrida' && S.carros[0].fim === null && !demo;
  addEventListener('keydown', (e) => {
    const dir = MAPA_DIR[e.key] ?? MAPA_DIR[e.key.toLowerCase()];
    const tiro = e.key === ' ' || e.code === 'Space';
    if ((!dir && !tiro) || document.querySelector('dialog[open]')) return;
    e.preventDefault();
    if (tiro) document.activeElement?.blur?.(); // para o espaço não «clicar» num botão da barra
    if (e.repeat || !podeJogar()) return;
    if (tiro) acao(); else mover(dir);
  });
  tela.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    if (podeJogar()) mover(e.clientX < tela.getBoundingClientRect().left + W / 2 ? -1 : 1);
  });
  for (const b of document.querySelectorAll('.toques button')) {
    b.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      if (podeJogar()) { if (b.dataset.laser) acao(); else mover(Number(b.dataset.dir)); }
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
  if (!demo) grelha = guardado().grelha || null;
  new ResizeObserver(medir).observe(tela.parentElement);
  medir();
  comecar();
  if (demo) {
    S.fase = 'corrida';
    for (let k = 0; k < (Number(args.get('t')) || 0) / DT && S.fase !== 'fim'; k++) passo();
    S.eventos.length = 0;
    // &premio=missil|turbo deixa um prémio guardado no teu carro, para ver o aviso no painel.
    if (args.get('premio')) { S.carros[0].premio = args.get('premio'); S.carros[0].usa = 99; }
    if (S.fase !== 'fim') { pv = postoAVista(S.carros[0].pos); abre = pv && pv.zDe < 13 ? 1 : 0; }
  }
  requestAnimationFrame(quadro);
})();
