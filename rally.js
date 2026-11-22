'use strict';

/* Rally — super especiais em circuito fechado, vistas de cima.
   Motor (topo): pista, física com gravidade, choques e pilotos automáticos. Não toca no DOM.
   Interface (fundo): desenho em <canvas>, teclado e botões de toque. */

// ====================================================================
// Motor
// ====================================================================

const LARG_MUNDO = 1000;
const ALT_MUNDO = 600;
const PASSO = 6;        // distância (px) entre pontos da pista
const DT = 1 / 120;     // passo fixo da física (s)
const GRAV = 320;       // gravidade (px/s²)
const VOLTAS = 4;
const NO_AR = 1.2;      // altura acima do chão a partir da qual as rodas deixam de agarrar

const FIS = {
  acel: 270,          // aceleração do motor parado (px/s²)
  vmax: 300,          // velocidade a que o motor deixa de puxar
  travao: 430,
  marchaAtras: 150,
  vmaxAtras: 90,
  virar: 3.2,         // rad/s com o volante todo virado
  volante: 9,         // rapidez do volante (1/s)
  atritoTerra: 0.22,
  atritoRelva: 1.7,
  aderTerra: 6.5,     // quanto maior, menos o carro desliza de lado
  aderRelva: 3.2,
  encosta: 0.9,       // peso da gravidade nas subidas e descidas
  raio: 6.6,          // cada carro são dois círculos (frente e traseira)
  eixo: 6.2,
  ressalto: 0.35,
};

const PILOTOS = [
  { nome: 'Noah', cor: '#e63946', pericia: 1, motor: 1 },
  { nome: 'Duarte', cor: '#3a86ff', pericia: 0.98, motor: 0.97 },
  { nome: 'Tomas', cor: '#ffc61a', pericia: 0.93, motor: 0.95 },
  { nome: 'Sira', cor: '#f4f1ea', pericia: 0.88, motor: 0.93 },
];

/* Cada circuito: pontos de controlo (curva fechada que passa por todos), relevo
   (ondas [nº de ondas por volta, altura, fase]), rampas (acabam num degrau: é dali que se salta)
   e lombas. `em` é a fração da volta, a contar da partida. */
const CIRCUITOS = [
  {
    id: 'pedreira', nome: 'Pedreira', desc: 'Rápido e largo, com dois grandes saltos.',
    larg: 68, semente: 7,
    pontos: [[330, 92], [560, 84], [770, 104], [898, 210], [902, 380], [800, 494], [640, 500], [520, 400], [400, 396], [300, 500], [170, 492], [92, 380], [100, 210], [190, 110]],
    relevo: [[1, 12, 0.6], [3, 5, 2.1]],
    rampas: [{ em: 0.045, alt: 13, comp: 54 }, { em: 0.52, alt: 10, comp: 44 }],
    lombas: [{ em: 0.3, alt: 6, larg: 13 }, { em: 0.8, alt: 6, larg: 13 }],
  },
  {
    id: 'serra', nome: 'Serra', desc: 'Sobe e desce sem parar, com ganchos apertados.',
    larg: 62, semente: 21,
    pontos: [[280, 90], [450, 86], [600, 150], [750, 90], [860, 112], [912, 220], [900, 400], [840, 500], [710, 520], [620, 450], [570, 340], [470, 300], [390, 360], [370, 460], [290, 524], [180, 516], [100, 440], [92, 290], [110, 160], [180, 100]],
    relevo: [[2, 13, 0.3], [5, 5, 1.2]],
    rampas: [{ em: 0.008, alt: 11, comp: 48 }, { em: 0.312, alt: 12, comp: 50 }, { em: 0.848, alt: 12, comp: 50 }],
    lombas: [{ em: 0.2, alt: 5.5, larg: 12 }, { em: 0.55, alt: 6, larg: 12 }, { em: 0.71, alt: 5.5, larg: 12 }],
  },
  {
    id: 'oito', nome: 'Oito', desc: 'A pista cruza-se a si mesma: passas por cima da ponte e depois por baixo.',
    larg: 62, semente: 40,
    pontos: [[250, 96], [370, 150], [500, 300], [630, 450], [760, 506], [880, 440], [912, 300], [880, 160], [760, 94], [630, 150], [500, 300], [370, 450], [250, 504], [124, 440], [90, 300], [124, 160]],
    relevo: [[2, 5, 1.5]],
    ponte: { alt: 30, plano: 80, rampa: 150 },
    rampas: [{ em: 0.366, alt: 11, comp: 46 }, { em: 0.868, alt: 12, comp: 50 }],
    lombas: [{ em: 0.47, alt: 6, larg: 12 }, { em: 0.7, alt: 5.5, larg: 12 }, { em: 0.97, alt: 5.5, larg: 12 }],
  },
];

const limitar = (v, a, b) => (v < a ? a : v > b ? b : v);

/** Curva fechada (Catmull-Rom) pelos pontos de controlo, reamostrada a espaços iguais. */
function construirPista(def) {
  const P = def.pontos;
  const m = P.length;
  const fino = [];
  for (let k = 0; k < m; k++) {
    const p0 = P[(k + m - 1) % m], p1 = P[k], p2 = P[(k + 1) % m], p3 = P[(k + 2) % m];
    for (let j = 0; j < 48; j++) {
      const t = j / 48, t2 = t * t, t3 = t2 * t;
      const c = (e) => 0.5 * (2 * p1[e] + (p2[e] - p0[e]) * t + (2 * p0[e] - 5 * p1[e] + 4 * p2[e] - p3[e]) * t2 + (3 * p1[e] - p0[e] - 3 * p2[e] + p3[e]) * t3);
      fino.push([c(0), c(1)]);
    }
  }
  const acum = [0];
  for (let k = 0; k < fino.length; k++) {
    const a = fino[k], b = fino[(k + 1) % fino.length];
    acum.push(acum[k] + Math.hypot(b[0] - a[0], b[1] - a[1]));
  }
  const comp = acum[fino.length];
  const n = Math.round(comp / PASSO);
  const esp = comp / n;
  const pts = [];
  for (let i = 0, k = 0; i < n; i++) {
    const s = i * esp;
    while (acum[k + 1] < s) k++;
    const a = fino[k], b = fino[(k + 1) % fino.length];
    const t = (s - acum[k]) / (acum[k + 1] - acum[k] || 1);
    pts.push({ x: a[0] + (b[0] - a[0]) * t, y: a[1] + (b[1] - a[1]) * t, tx: 0, ty: 0, h: 0, decl: 0, curv: 0, curvS: 0, rampa: false, labio: false, ponte: false });
  }
  const pt = (i) => pts[((i % n) + n) % n];
  for (let i = 0; i < n; i++) {
    const a = pt(i - 1), b = pt(i + 1);
    const d = Math.hypot(b.x - a.x, b.y - a.y);
    pts[i].tx = (b.x - a.x) / d;
    pts[i].ty = (b.y - a.y) / d;
  }
  for (let i = 0; i < n; i++) {
    const a = pt(i - 1), b = pt(i + 1);
    pts[i].curv = (a.tx * b.ty - a.ty * b.tx) / (2 * esp); // > 0: curva para o lado da normal (-ty, tx)
  }
  for (let i = 0; i < n; i++) {
    let s = 0;
    for (let j = -3; j <= 3; j++) s += pt(i + j).curv;
    pts[i].curvS = s / 7;
  }

  // Relevo: ondas suaves ao longo da volta.
  for (let i = 0; i < n; i++) {
    for (const [ondas, alt, fase] of def.relevo) pts[i].h += alt * (0.5 + 0.5 * Math.sin((2 * Math.PI * ondas * i) / n + fase));
  }
  // Ponte: no ponto onde a pista se cruza, a primeira passagem sobe e passa por cima.
  let cruz = null;
  if (def.ponte) {
    let melhor = Infinity;
    for (let i = 0; i < n; i++) {
      for (let j = i + Math.floor(n / 4); j < Math.min(n, i + Math.floor((3 * n) / 4)); j++) {
        const d = (pts[i].x - pts[j].x) ** 2 + (pts[i].y - pts[j].y) ** 2;
        if (d < melhor) { melhor = d; cruz = [i, j]; }
      }
    }
    const { alt, plano, rampa } = def.ponte;
    const alcance = Math.ceil((plano / 2 + rampa) / esp);
    for (let j = -alcance; j <= alcance; j++) {
      const d = Math.abs(j) * esp;
      const f = d < plano / 2 ? 1 : 0.5 + 0.5 * Math.cos((Math.PI * (d - plano / 2)) / rampa);
      const p = pt(cruz[0] + j);
      p.h += alt * f;
      p.ponte = f > 0.3;
    }
    // A passagem de baixo fica rasa, para haver sempre espaço debaixo da ponte.
    for (let j = -20; j <= 20; j++) pt(cruz[1] + j).h *= Math.min(1, Math.abs(j) / 20 + 0.2);
  }
  for (const l of def.lombas || []) {
    const i0 = Math.round(l.em * n), alcance = Math.ceil((l.larg * 3) / esp);
    for (let j = -alcance; j <= alcance; j++) pt(i0 + j).h += l.alt * Math.exp(-((j * esp) ** 2) / (2 * l.larg * l.larg));
  }
  for (const r of def.rampas || []) {
    const i0 = Math.round(r.em * n), nr = Math.round(r.comp / esp);
    for (let j = 1; j <= nr; j++) {
      const p = pt(i0 + j);
      p.h += r.alt * Math.pow(j / nr, 1.3);
      p.rampa = true;
      p.labio = j === nr;
    }
  }
  // Declive no sentido da marcha; os degraus das rampas não contam.
  for (let i = 0; i < n; i++) {
    const d = (pts[i].h - pt(i - 1).h) / esp;
    pts[i].decl = Math.abs(d) > 1 ? 0 : d;
  }
  return { id: def.id, nome: def.nome, larg: def.larg, semente: def.semente, pts, n, esp, comp, cruz };
}

const PISTAS = CIRCUITOS.map(construirPista);

/** Estado da corrida. fase: 'contagem' | 'corrida' | 'fim' (o humano cortou a meta). */
const R = { pista: PISTAS[0], iPista: 0, carros: [], t: 0, contagem: 0, fase: 'fim', chegados: 0, eventos: [], voltas: VOLTAS };

function novaCorrida(iPista = 0, { humano = true } = {}) {
  const pista = PISTAS[iPista];
  Object.assign(R, { pista, iPista, t: 0, contagem: 3.6, fase: 'contagem', chegados: 0, eventos: [], voltas: VOLTAS });
  // Grelha: duas filas atrás da meta; o humano parte de trás.
  const lugares = [[26, -1], [26, 1], [13, -1], [13, 1]];
  R.carros = PILOTOS.map((pl, id) => {
    const [atras, lado] = lugares[id];
    const i = pista.n - atras;
    const p = pista.pts[i];
    const lat = lado * pista.larg * 0.2;
    return {
      id, nome: pl.nome, cor: pl.cor, humano: humano && id === 0, pericia: pl.pericia, motorBase: pl.motor, motor: pl.motor,
      x: p.x - p.ty * lat, y: p.y + p.tx * lat, ang: Math.atan2(p.ty, p.tx),
      vx: 0, vy: 0, vf: 0, vl: 0, rot: 0, volante: 0,
      z: p.h, vz: 0, alt: 0, pico: 0,
      i, prog: -atras, lat, fora: Math.abs(lat), dist: Math.abs(lat),
      linha: lat * 0.8, tLinha: 2 + id, tFora: 0, tParado: 0, derrapa: 0,
      volta: 0, tVolta: 0, melhorVolta: null, fim: null, lugar: 0,
      acel: false, trav: false,
    };
  });
  return R;
}

/** Acha o ponto da pista mais próximo do carro, procurando só à volta do ponto anterior
    (assim não se pode atalhar, e no cruzamento do «oito» cada carro fica na sua passagem). */
function localizar(c) {
  const { pts, n } = R.pista;
  let melhor = Infinity, dj = 0;
  for (let j = -14; j <= 28; j++) {
    const p = pts[(((c.i + j) % n) + n) % n];
    const d = (c.x - p.x) ** 2 + (c.y - p.y) ** 2;
    if (d < melhor) { melhor = d; dj = j; }
  }
  c.i = (((c.i + dj) % n) + n) % n;
  c.prog += dj;
  const p = pts[c.i];
  c.lat = (c.x - p.x) * -p.ty + (c.y - p.y) * p.tx;
  c.fora = Math.abs(c.lat);
  c.dist = Math.sqrt(melhor);
}

/** Altura do chão debaixo do carro (a altura só depende do sítio ao longo da pista). */
function alturaChao(c) {
  const { pts, n, esp } = R.pista;
  const p = pts[c.i];
  const t = limitar(((c.x - p.x) * p.tx + (c.y - p.y) * p.ty) / esp, -1, 1);
  const q = pts[(c.i + (t >= 0 ? 1 : n - 1)) % n];
  return p.h + (q.h - p.h) * Math.abs(t);
}

/** Volta a pôr o carro no meio da pista, parado, no último sítio por onde passou. */
function repor(c) {
  const p = R.pista.pts[c.i];
  Object.assign(c, { x: p.x, y: p.y, ang: Math.atan2(p.ty, p.tx), vx: 0, vy: 0, vf: 0, vl: 0, rot: 0, z: p.h, vz: 0, alt: 0, pico: 0, tFora: 0, tParado: 0, derrapa: 0 });
  localizar(c);
  R.eventos.push({ tipo: 'repor', id: c.id, x: c.x, y: c.y, f: 1 });
}

function passoCarro(c, cmd) {
  const pista = R.pista;
  c.acel = !!cmd.acel;
  c.trav = !!cmd.trav;
  c.volante += limitar(cmd.dir - c.volante, -FIS.volante * DT, FIS.volante * DT);
  const cos = Math.cos(c.ang), sin = Math.sin(c.ang);
  let vf = c.vx * cos + c.vy * sin;   // velocidade para a frente
  let vl = -c.vx * sin + c.vy * cos;  // velocidade de lado (derrapagem)
  const noChao = c.alt < NO_AR;
  if (noChao) {
    const relva = c.fora > pista.larg / 2;
    if (cmd.acel) vf += FIS.acel * Math.max(0, 1 - vf / (FIS.vmax * c.motor)) * DT;
    if (cmd.trav) vf -= (vf > 4 ? FIS.travao : vf > -FIS.vmaxAtras ? FIS.marchaAtras : 0) * DT;
    if (!cmd.acel && !cmd.trav) vf -= vf * 0.5 * DT;
    vf -= vf * (relva ? FIS.atritoRelva : FIS.atritoTerra) * DT;
    vl *= Math.exp(-(relva ? FIS.aderRelva : FIS.aderTerra) * (c.derrapa > 0 ? 0.3 : 1) * DT);
    // Só se vira em andamento, e um pouco menos a alta velocidade.
    c.ang += c.volante * FIS.virar * limitar(vf / 80, -1, 1) * (1 - 0.3 * Math.min(1, Math.abs(vf) / FIS.vmax)) * DT;
    // A velocidade recompõe-se com o rumo antigo: o carro roda primeiro e só depois «agarra».
    const p = pista.pts[c.i];
    const g = -GRAV * p.decl * FIS.encosta * DT;
    c.vx = vf * cos - vl * sin + g * p.tx;
    c.vy = vf * sin + vl * cos + g * p.ty;
  }
  c.vf = vf;
  c.vl = vl;
  c.ang += c.rot * DT;
  c.rot *= Math.exp(-5 * DT);
  if (c.derrapa > 0) c.derrapa -= DT;

  const xAnt = c.x, yAnt = c.y, hAnt = c.z - c.alt;
  c.x += c.vx * DT;
  c.y += c.vy * DT;
  // Limites do recinto.
  if (c.x < 10 || c.x > LARG_MUNDO - 10) { c.x = limitar(c.x, 10, LARG_MUNDO - 10); c.vx *= -0.4; }
  if (c.y < 10 || c.y > ALT_MUNDO - 10) { c.y = limitar(c.y, 10, ALT_MUNDO - 10); c.vy *= -0.4; }
  localizar(c);
  let hN = alturaChao(c);
  // Degrau de uma rampa apanhado ao contrário: é uma parede.
  if (noChao && hN - hAnt > Math.hypot(c.vx, c.vy) * DT + 0.05) {
    c.x = xAnt; c.y = yAnt; c.vx *= -0.3; c.vy *= -0.3;
    localizar(c);
    hN = alturaChao(c);
  }
  // Gravidade: o carro cai livremente e o chão segura-o. Onde o chão foge (fim de uma rampa,
  // cimo de uma lomba) o carro fica no ar com a velocidade vertical que trazia da subida.
  c.z += c.vz * DT;
  c.vz -= GRAV * DT;
  if (c.z <= hN) {
    const vzChao = limitar((hN - hAnt) / DT, -200, 200);
    const impacto = vzChao - c.vz;
    c.z = hN;
    c.vz = vzChao;
    if (c.pico > 3 && impacto > 60) {
      c.vx *= 0.95; c.vy *= 0.95;
      c.derrapa = Math.max(c.derrapa, 0.14);
      if (impacto > 130) c.vz += impacto * 0.2; // ressalto
      R.eventos.push({ tipo: 'aterra', id: c.id, x: c.x, y: c.y, f: impacto });
    }
  }
  c.alt = c.z - hN;
  c.pico = c.alt < 0.01 ? 0 : Math.max(c.pico, c.alt); // altura máxima do salto em curso

  // Perdido longe da pista ou encravado: volta para o meio da pista.
  c.tFora = c.dist > pista.larg * 2 ? c.tFora + DT : 0;
  c.tParado = !c.humano && Math.abs(vf) < 14 ? c.tParado + DT : 0;
  if (c.tFora > 3 || c.tParado > 2.2) repor(c);
}

/** Choque entre dois carros: empurra-os, troca velocidade e fá-los rodar. */
function colidir(a, b) {
  if (Math.abs(a.z - b.z) > 10) return; // um vai no ar ou na ponte
  if ((a.x - b.x) ** 2 + (a.y - b.y) ** 2 > (2 * (FIS.eixo + FIS.raio)) ** 2) return;
  for (const sa of [1, -1]) {
    for (const sb of [1, -1]) {
      const rax = Math.cos(a.ang) * FIS.eixo * sa, ray = Math.sin(a.ang) * FIS.eixo * sa;
      const rbx = Math.cos(b.ang) * FIS.eixo * sb, rby = Math.sin(b.ang) * FIS.eixo * sb;
      let nx = b.x + rbx - a.x - rax, ny = b.y + rby - a.y - ray;
      const d = Math.hypot(nx, ny);
      if (d >= 2 * FIS.raio) continue;
      if (d < 0.001) { nx = 1; ny = 0; } else { nx /= d; ny /= d; }
      const pen = (2 * FIS.raio - d) / 2;
      a.x -= nx * pen; a.y -= ny * pen;
      b.x += nx * pen; b.y += ny * pen;
      const vn = (b.vx - a.vx) * nx + (b.vy - a.vy) * ny;
      if (vn >= 0) continue;
      const j = (-(1 + FIS.ressalto) * vn) / 2;
      a.vx -= j * nx; a.vy -= j * ny;
      b.vx += j * nx; b.vy += j * ny;
      a.rot = limitar(a.rot + (rax * -ny - ray * -nx) * j / 240, -6, 6);
      b.rot = limitar(b.rot + (rbx * ny - rby * nx) * j / 240, -6, 6);
      if (j > 35) {
        a.derrapa = Math.max(a.derrapa, 0.3);
        b.derrapa = Math.max(b.derrapa, 0.3);
        R.eventos.push({ tipo: 'choque', id: a.id, id2: b.id, x: (a.x + b.x) / 2, y: (a.y + b.y) / 2, f: j });
      }
    }
  }
}

/** Piloto automático: aponta a um ponto mais à frente e trava a tempo das curvas. */
function pilotar(c) {
  const { pts, n, esp, larg } = R.pista;
  const v = Math.max(0, c.vf);
  const avanco = Math.round(5 + v / 15);
  let k = 0;
  for (let j = 0; j < avanco + 8; j += 2) k += pts[(c.i + j) % n].curvS;
  const desvio = limitar(k * 60, -1, 1) * larg * 0.22 + c.linha; // corta as curvas por dentro
  const p = pts[(c.i + avanco) % n];
  let dif = Math.atan2(p.y + p.tx * desvio - c.y, p.x - p.ty * desvio - c.x) - c.ang;
  dif = Math.atan2(Math.sin(dif), Math.cos(dif));
  let limite = Infinity;
  for (let j = 0; j <= 48; j += 3) {
    const vc2 = (330 * c.pericia) / Math.max(Math.abs(pts[(c.i + j) % n].curvS), 1e-4);
    limite = Math.min(limite, Math.sqrt(vc2 + 2 * FIS.travao * 0.55 * j * esp));
  }
  if (c.fim !== null) limite = Math.min(limite, 110); // volta de consagração
  if (Math.abs(dif) > 1.1) limite = Math.min(limite, 80);
  // Condução suja: com um adversário ao lado, encosta-se a ele.
  let toque = 0;
  const cos = Math.cos(c.ang), sin = Math.sin(c.ang);
  for (const o of R.carros) {
    if (o === c || Math.abs(o.z - c.z) > 10) continue;
    const dx = o.x - c.x, dy = o.y - c.y;
    const frente = dx * cos + dy * sin, lado = -dx * sin + dy * cos;
    if (frente > -12 && frente < 34 && Math.abs(lado) < 30 && Math.abs(lado) > 4) toque += Math.sign(lado) * 0.3;
  }
  return { acel: v < limite, trav: v > limite + 14, dir: limitar(dif * 2.6 + toque, -1, 1) };
}

const PARADO = { acel: false, trav: false, dir: 0 };

/** Avança a corrida um passo de física. `cmd` são os comandos do humano: { acel, trav, dir }. */
function passo(cmd = PARADO) {
  if (R.fase === 'contagem') {
    R.contagem -= DT;
    if (R.contagem <= 0) R.fase = 'corrida';
    return;
  }
  R.t += DT;
  const humano = R.carros.find((c) => c.humano);
  for (const c of R.carros) {
    if (!c.humano || c.fim !== null) {
      // Elástico: quem vai muito à frente do humano abranda um pouco, quem vai atrás acelera.
      if (humano) c.motor = c.motorBase * (1 + limitar(((humano.prog - c.prog) * R.pista.esp) / 5000, -0.07, 0.07));
      c.tLinha -= DT;
      if (c.tLinha <= 0) { c.tLinha = 2 + Math.random() * 4; c.linha = (Math.random() - 0.5) * R.pista.larg * 0.42; }
    }
    passoCarro(c, c.humano && c.fim === null ? cmd : pilotar(c));
  }
  for (let a = 0; a < R.carros.length; a++) for (let b = a + 1; b < R.carros.length; b++) colidir(R.carros[a], R.carros[b]);
  for (const c of R.carros) {
    if (c.fim !== null) continue;
    const volta = Math.floor(c.prog / R.pista.n);
    if (volta > c.volta) {
      const tempo = R.t - c.tVolta;
      if (c.melhorVolta === null || tempo < c.melhorVolta) c.melhorVolta = tempo;
      c.tVolta = R.t;
      c.volta = volta;
      R.eventos.push({ tipo: 'volta', id: c.id, x: c.x, y: c.y, f: tempo });
      if (volta >= R.voltas) {
        c.fim = R.t;
        c.lugar = ++R.chegados;
        if (c.humano || R.chegados === R.carros.length) R.fase = 'fim';
      }
    }
  }
}

/** Carros por ordem: primeiro quem já chegou, depois quem vai mais à frente. */
function classificacao() {
  return [...R.carros].sort((a, b) => (a.fim !== null || b.fim !== null ? (a.fim ?? Infinity) - (b.fim ?? Infinity) : b.prog - a.prog));
}

/** Depois de o humano cortar a meta, corre o resto da prova de seguida para saber os tempos de todos. */
function terminarResto(maxSeg = 120) {
  for (let k = 0; k < maxSeg / DT && R.chegados < R.carros.length; k++) passo();
}

if (typeof module !== 'undefined') {
  module.exports = { R, FIS, CIRCUITOS, PISTAS, VOLTAS, DT, novaCorrida, passo, pilotar, classificacao, terminarResto, construirPista };
}

// ====================================================================
// Interface
// ====================================================================

if (typeof document !== 'undefined') (() => {
  const $ = (id) => document.getElementById(id);
  const tela = $('tela');
  const ctx = tela.getContext('2d');
  const calmo = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const nova = () => document.createElement('canvas');
  const camadas = { fundo: nova(), marcas: nova(), ponte: nova() };
  const vista = { a: 1, ox: 0, oy: 0, rodado: false, luz: { x: 0.6, y: 0.8 } };
  const teclas = { cima: false, baixo: false, esq: false, dir: false };
  let particulas = [];
  let rodas = [];       // última posição das rodas traseiras de cada carro, para as marcas no chão
  let tremor = 0;
  let aviso = { texto: '', ate: 0 };
  let fimMostrado = false;
  let demo = false;
  let epoca = 0;

  const guardado = () => { try { return JSON.parse(localStorage.getItem('rally-v1')) || {}; } catch { return {}; } };
  const tempoTxt = (t) => `${Math.floor(t / 60)}:${(t % 60).toFixed(1).padStart(4, '0')}`;
  const ordinal = (n) => `${n}.º`;

  /** Números pseudo-aleatórios com semente, para a paisagem ser sempre igual em cada circuito. */
  function sorteio(semente) {
    let s = semente >>> 0;
    return () => {
      s = (s + 0x6d2b79f5) >>> 0;
      let t = Math.imul(s ^ (s >>> 15), 1 | s);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  // ---------- Vista: o mundo todo cabe na janela (deitado, ou de pé em ecrãs altos) ----------
  function transformar(c) {
    const { a, ox, oy } = vista;
    if (vista.rodado) c.setTransform(0, a, -a, 0, ox + ALT_MUNDO * a, oy);
    else c.setTransform(a, 0, 0, a, ox, oy);
  }

  function medir() {
    const caixa = tela.parentElement.getBoundingClientRect();
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const w = Math.max(50, Math.round(caixa.width * dpr)), h = Math.max(50, Math.round(caixa.height * dpr));
    vista.rodado = h > w;
    const [mw, mh] = vista.rodado ? [ALT_MUNDO, LARG_MUNDO] : [LARG_MUNDO, ALT_MUNDO];
    vista.a = Math.min(w / mw, h / mh);
    vista.ox = (w - mw * vista.a) / 2;
    vista.oy = (h - mh * vista.a) / 2;
    // A luz vem do canto superior esquerdo do ecrã; as sombras caem para baixo e para a direita.
    vista.luz = vista.rodado ? { x: 0.8, y: -0.6 } : { x: 0.6, y: 0.8 };
    for (const c of [tela, camadas.fundo, camadas.marcas, camadas.ponte]) { c.width = w; c.height = h; }
    desenharFundo();
  }

  // ---------- Paisagem e pista (desenhadas uma vez por circuito) ----------
  function corTerra(p) {
    // Mais alto = mais claro; as encostas viradas para a luz também.
    const k = limitar(0.8 + p.h / 75 + p.decl * (p.tx * vista.luz.x + p.ty * vista.luz.y) * 1.7, 0.45, 1.35);
    return `rgb(${Math.round(186 * k)},${Math.round(140 * k)},${Math.round(92 * k)})`;
  }

  function caminho(c, pista, de, ate, desvio = 0) {
    c.beginPath();
    for (let i = de; i <= ate; i++) {
      const p = pista.pts[((i % pista.n) + pista.n) % pista.n];
      c.lineTo(p.x - p.ty * desvio, p.y + p.tx * desvio);
    }
  }

  function piso(c, pista, de, ate) {
    const { pts, n, larg } = pista;
    const pt = (i) => pts[((i % n) + n) % n];
    const m = larg / 2;
    for (let i = de; i < ate; i++) {
      const p = pt(i), q = pt(i + 1);
      c.beginPath();
      c.moveTo(p.x - p.ty * m, p.y + p.tx * m);
      c.lineTo(q.x - q.ty * m, q.y + q.tx * m);
      c.lineTo(q.x + q.ty * m, q.y - q.tx * m);
      c.lineTo(p.x + p.ty * m, p.y - p.tx * m);
      c.closePath();
      c.fillStyle = c.strokeStyle = corTerra(q);
      c.lineWidth = 0.8;
      c.fill();
      c.stroke();
    }
    // Sulcos dos pneus.
    c.lineWidth = 3;
    c.strokeStyle = 'rgba(70, 42, 20, .13)';
    for (const d of [-larg * 0.17, larg * 0.17]) { caminho(c, pista, de, ate, d); c.stroke(); }
    // Rampas: setas a subir e o lábio de onde se salta. Lombas: ficam só pelo sombreado.
    for (let i = de; i < ate; i++) {
      const p = pt(i);
      if (p.rampa && !p.labio && i % 3 === 0) {
        c.strokeStyle = 'rgba(255, 221, 87, .85)';
        c.lineWidth = 2.4;
        c.lineJoin = 'round';
        for (const lado of [-1, 1]) {
          const cx = p.x - p.ty * lado * m * 0.45, cy = p.y + p.tx * lado * m * 0.45;
          c.beginPath();
          c.moveTo(cx - p.tx * 4 - p.ty * 7, cy - p.ty * 4 + p.tx * 7);
          c.lineTo(cx + p.tx * 4, cy + p.ty * 4);
          c.lineTo(cx - p.tx * 4 + p.ty * 7, cy - p.ty * 4 - p.tx * 7);
          c.stroke();
        }
      }
      if (p.labio) {
        const q = pt(i + 1);
        // Sombra do degrau, do lado de lá.
        for (let k = 0; k < 5; k++) {
          c.strokeStyle = `rgba(30, 16, 6, ${0.42 - k * 0.08})`;
          c.lineWidth = 3;
          c.beginPath();
          c.moveTo(q.x + q.tx * (k * 2.6 - 2) - q.ty * m, q.y + q.ty * (k * 2.6 - 2) + q.tx * m);
          c.lineTo(q.x + q.tx * (k * 2.6 - 2) + q.ty * m, q.y + q.ty * (k * 2.6 - 2) - q.tx * m);
          c.stroke();
        }
        c.strokeStyle = '#fff3c4';
        c.lineWidth = 3;
        c.beginPath();
        c.moveTo(p.x - p.ty * m, p.y + p.tx * m);
        c.lineTo(p.x + p.ty * m, p.y - p.tx * m);
        c.stroke();
        // Pneus a marcar a rampa.
        for (const lado of [-1, 1]) {
          for (let k = 0; k < 3; k++) {
            const bx = p.x - p.ty * lado * (m + 5) - p.tx * k * 8, by = p.y + p.tx * lado * (m + 5) - p.ty * k * 8;
            c.fillStyle = k % 2 ? '#f4f1ea' : '#d7263d';
            c.beginPath(); c.arc(bx, by, 4, 0, 7); c.fill();
            c.fillStyle = 'rgba(0,0,0,.45)';
            c.beginPath(); c.arc(bx, by, 1.6, 0, 7); c.fill();
          }
        }
      }
    }
  }

  function desenharFundo() {
    const pista = R.pista;
    const { pts, n, larg } = pista;
    const c = camadas.fundo.getContext('2d');
    const rnd = sorteio(pista.semente);
    c.setTransform(1, 0, 0, 1, 0, 0);
    c.fillStyle = '#4f7a3a';
    c.fillRect(0, 0, camadas.fundo.width, camadas.fundo.height);
    transformar(c);

    const longe = (x, y, d) => { for (let i = 0; i < n; i += 3) if ((pts[i].x - x) ** 2 + (pts[i].y - y) ** 2 < d * d) return false; return true; };
    // Manchas de erva e de terra.
    for (let k = 0; k < 260; k++) {
      const x = -300 + rnd() * (LARG_MUNDO + 600), y = -300 + rnd() * (ALT_MUNDO + 600), r = 20 + rnd() * 70;
      c.fillStyle = rnd() < 0.3 ? 'rgba(150, 132, 74, .13)' : rnd() < 0.5 ? 'rgba(42, 88, 40, .16)' : 'rgba(112, 156, 70, .13)';
      c.beginPath(); c.ellipse(x, y, r, r * (0.5 + rnd() * 0.5), rnd() * 3, 0, 7); c.fill();
    }
    for (let k = 0; k < 2600; k++) {
      const x = -300 + rnd() * (LARG_MUNDO + 600), y = -300 + rnd() * (ALT_MUNDO + 600);
      c.fillStyle = rnd() < 0.5 ? 'rgba(30, 66, 30, .35)' : 'rgba(170, 196, 96, .3)';
      c.fillRect(x, y, 1.6, 1.6);
    }
    // Berma da pista.
    c.lineJoin = 'round';
    c.strokeStyle = 'rgba(60, 44, 24, .35)'; c.lineWidth = larg + 20; caminho(c, pista, 0, n); c.closePath(); c.stroke();
    c.strokeStyle = '#7d5a35'; c.lineWidth = larg + 9; caminho(c, pista, 0, n); c.closePath(); c.stroke();
    piso(c, pista, 0, n);
    // Pedrinhas na pista.
    for (let k = 0; k < 500; k++) {
      const p = pts[Math.floor(rnd() * n)], d = (rnd() - 0.5) * larg * 0.94;
      c.fillStyle = rnd() < 0.5 ? 'rgba(80, 50, 26, .3)' : 'rgba(240, 214, 170, .32)';
      c.fillRect(p.x - p.ty * d, p.y + p.tx * d, 1.5, 1.5);
    }
    // Meta aos quadrados.
    const p0 = pts[0];
    c.save();
    c.translate(p0.x, p0.y);
    c.rotate(Math.atan2(p0.ty, p0.tx));
    const lado = 5, filas = Math.round(larg / lado);
    for (let f = 0; f < filas; f++) for (let k = 0; k < 2; k++) { c.fillStyle = (f + k) % 2 ? '#1a1a1a' : '#f6f2e6'; c.fillRect(k * lado - lado, -larg / 2 + (f * larg) / filas, lado, larg / filas + 0.3); }
    // Postes da meta.
    for (const s of [-1, 1]) { c.fillStyle = '#d7263d'; c.fillRect(-3, s * (larg / 2 + 6) - 3, 6, 6); c.fillStyle = '#fff'; c.fillRect(-1.5, s * (larg / 2 + 6) - 1.5, 3, 3); }
    c.restore();

    // Arbustos, pedras e fardos de palha fora da pista.
    for (let k = 0; k < 150; k++) {
      const x = 14 + rnd() * (LARG_MUNDO - 28), y = 14 + rnd() * (ALT_MUNDO - 28), tipo = rnd();
      if (!longe(x, y, larg / 2 + 24)) continue;
      c.fillStyle = 'rgba(0,0,0,.25)';
      c.beginPath(); c.ellipse(x + vista.luz.x * 4, y + vista.luz.y * 4, 9, 8, 0, 0, 7); c.fill();
      if (tipo < 0.62) {
        const r = 6 + rnd() * 7;
        c.fillStyle = '#28542a'; c.beginPath(); c.arc(x, y, r, 0, 7); c.fill();
        c.fillStyle = '#3b7a37'; c.beginPath(); c.arc(x - vista.luz.x * r * 0.25, y - vista.luz.y * r * 0.25, r * 0.7, 0, 7); c.fill();
        c.fillStyle = '#62a14a'; c.beginPath(); c.arc(x - vista.luz.x * r * 0.45, y - vista.luz.y * r * 0.45, r * 0.35, 0, 7); c.fill();
      } else if (tipo < 0.85) {
        c.fillStyle = '#8b8a80'; c.beginPath(); c.ellipse(x, y, 7, 5, rnd() * 3, 0, 7); c.fill();
        c.fillStyle = '#b9b8ad'; c.beginPath(); c.ellipse(x - vista.luz.x * 2, y - vista.luz.y * 2, 4, 2.6, rnd() * 3, 0, 7); c.fill();
      } else {
        c.save(); c.translate(x, y); c.rotate(rnd() * 3);
        c.fillStyle = '#d9b44a'; c.fillRect(-8, -5, 16, 10);
        c.strokeStyle = '#a07c22'; c.lineWidth = 1; c.strokeRect(-8, -5, 16, 10);
        c.beginPath(); c.moveTo(-3, -5); c.lineTo(-3, 5); c.moveTo(3, -5); c.lineTo(3, 5); c.stroke();
        c.restore();
      }
    }
    // Fita à volta do recinto.
    c.setLineDash([10, 10]);
    c.lineWidth = 2.5;
    c.strokeStyle = 'rgba(255,255,255,.75)'; c.strokeRect(3, 3, LARG_MUNDO - 6, ALT_MUNDO - 6);
    c.lineDashOffset = 10;
    c.strokeStyle = 'rgba(215,38,61,.85)'; c.strokeRect(3, 3, LARG_MUNDO - 6, ALT_MUNDO - 6);
    c.setLineDash([]); c.lineDashOffset = 0;

    // Ponte: numa camada à parte, desenhada por cima dos carros que passam por baixo.
    const cp = camadas.ponte.getContext('2d');
    cp.setTransform(1, 0, 0, 1, 0, 0);
    cp.clearRect(0, 0, camadas.ponte.width, camadas.ponte.height);
    if (pista.cruz) {
      let de = pista.cruz[0], ate = pista.cruz[0];
      while (pts[(((de - 1) % n) + n) % n].ponte) de--;
      while (pts[(ate + 1) % n].ponte) ate++;
      transformar(cp);
      cp.lineJoin = 'round';
      // Sombra da ponte no chão.
      cp.save();
      cp.translate(vista.luz.x * 16, vista.luz.y * 16);
      cp.strokeStyle = 'rgba(0,0,0,.3)'; cp.lineWidth = larg + 8; caminho(cp, pista, de + 6, ate - 6); cp.stroke();
      cp.restore();
      cp.strokeStyle = '#3d2b1a'; cp.lineWidth = larg + 12; caminho(cp, pista, de, ate); cp.stroke();
      cp.strokeStyle = '#c9c2b2'; cp.lineWidth = larg + 8; caminho(cp, pista, de, ate); cp.stroke();
      piso(cp, pista, de, ate);
      // Guardas.
      cp.setLineDash([9, 7]);
      cp.strokeStyle = '#d7263d'; cp.lineWidth = 2.2;
      for (const d of [-(larg / 2 + 2), larg / 2 + 2]) { caminho(cp, pista, de, ate, d); cp.stroke(); }
      cp.setLineDash([]);
    }
    limparMarcas();
  }

  function limparMarcas() {
    const c = camadas.marcas.getContext('2d');
    c.setTransform(1, 0, 0, 1, 0, 0);
    c.clearRect(0, 0, camadas.marcas.width, camadas.marcas.height);
    rodas = [];
  }

  // ---------- Efeitos: pó, marcas no chão, tremor ----------
  function po(x, y, vx, vy, cor, r = 3, vida = 0.7) {
    if (particulas.length > 500) particulas.shift();
    particulas.push({ x, y, vx, vy, cor, r, vida, total: vida });
  }

  function efeitosDoPasso() {
    const pista = R.pista;
    const cm = camadas.marcas.getContext('2d');
    for (const c of R.carros) {
      const noChao = c.alt < NO_AR;
      const relva = c.fora > pista.larg / 2;
      const cos = Math.cos(c.ang), sin = Math.sin(c.ang);
      const vel = Math.hypot(c.vx, c.vy);
      const escorrega = Math.abs(c.vl);
      const tras = [[c.x - cos * 8 - sin * 5, c.y - sin * 8 + cos * 5], [c.x - cos * 8 + sin * 5, c.y - sin * 8 - cos * 5]];
      const ant = rodas[c.id];
      const marca = noChao && !pista.pts[c.i].ponte && (escorrega > 32 || (c.trav && c.vf > 70) || (relva && vel > 30));
      if (marca && ant) {
        transformar(cm);
        cm.strokeStyle = relva ? 'rgba(74, 52, 28, .2)' : 'rgba(58, 34, 14, .2)';
        cm.lineWidth = 2.4;
        cm.lineCap = 'round';
        cm.beginPath();
        for (const k of [0, 1]) { cm.moveTo(ant[k][0], ant[k][1]); cm.lineTo(tras[k][0], tras[k][1]); }
        cm.stroke();
      }
      rodas[c.id] = marca ? tras : null;
      // Pó das rodas traseiras.
      if (noChao && vel > 40 && Math.random() < 0.05 + escorrega / 260 + (c.acel && c.vf < 120 ? 0.25 : 0) + (relva ? 0.1 : 0)) {
        const k = Math.random() < 0.5 ? 0 : 1;
        po(tras[k][0], tras[k][1], -c.vx * 0.12 + (Math.random() - 0.5) * 30, -c.vy * 0.12 + (Math.random() - 0.5) * 30,
          relva ? '120, 140, 70' : '214, 178, 130', 2.5 + Math.random() * 3 + escorrega / 40, 0.5 + Math.random() * 0.5);
      }
    }
    for (const e of R.eventos) {
      const meu = e.id === 0 || e.id2 === 0;
      if (e.tipo === 'aterra') {
        for (let k = 0; k < 14; k++) { const a = Math.random() * 6.3, v = 30 + Math.random() * 70; po(e.x, e.y, Math.cos(a) * v, Math.sin(a) * v, '222, 190, 146', 3 + Math.random() * 4, 0.7); }
        if (meu) tremor = Math.max(tremor, Math.min(1, e.f / 220));
      } else if (e.tipo === 'choque') {
        for (let k = 0; k < 8; k++) { const a = Math.random() * 6.3, v = 40 + Math.random() * 90; po(e.x, e.y, Math.cos(a) * v, Math.sin(a) * v, k % 2 ? '255, 226, 120' : '230, 230, 230', 1.5 + Math.random() * 2, 0.35); }
        if (meu) tremor = Math.max(tremor, Math.min(1, e.f / 160));
      } else if (e.tipo === 'repor') {
        for (let k = 0; k < 10; k++) { const a = Math.random() * 6.3; po(e.x, e.y, Math.cos(a) * 40, Math.sin(a) * 40, '255, 255, 255', 3, 0.5); }
        if (meu) avisar('De volta à pista!', 1.4);
      } else if (e.tipo === 'volta' && meu) {
        const c = R.carros[0];
        if (c.fim === null) avisar(c.volta === R.voltas - 1 ? 'Última volta!' : `Volta ${c.volta + 1} · ${tempoTxt(e.f)}`, 1.8);
      }
    }
    R.eventos.length = 0;
    for (const p of particulas) { p.x += p.vx * DT; p.y += p.vy * DT; p.vx *= 0.97; p.vy *= 0.97; p.vida -= DT; }
    if (particulas.length && particulas[0].vida <= 0) particulas = particulas.filter((p) => p.vida > 0);
    if (tremor > 0) tremor = Math.max(0, tremor - DT * 3.5);
  }

  function avisar(texto, seg) { aviso = { texto, ate: performance.now() + seg * 1000 }; }

  // ---------- Desenho de cada quadro ----------
  function retRedondo(x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  function sombraCarro(c) {
    const d = 2 + c.alt * 1.1;
    ctx.save();
    ctx.translate(c.x + vista.luz.x * d, c.y + vista.luz.y * d);
    ctx.rotate(c.ang);
    ctx.fillStyle = `rgba(0, 0, 0, ${Math.max(0.16, 0.38 - c.alt * 0.008)})`;
    retRedondo(-12, -6.5, 24, 13, 4);
    ctx.fill();
    ctx.restore();
  }

  function desenharCarro(c) {
    const e = 1 + Math.min(c.alt, 40) / 42; // no ar, o carro vem na nossa direção: fica maior
    ctx.save();
    ctx.translate(c.x, c.y);
    ctx.rotate(c.ang);
    ctx.scale(e, e);
    // Rodas (as da frente viram com o volante).
    ctx.fillStyle = '#141414';
    for (const s of [-1, 1]) {
      ctx.fillRect(-10.5, s * 6.6 - 1.6, 6, 3.2);
      ctx.save(); ctx.translate(7.5, s * 6.6); ctx.rotate(c.volante * 0.5); ctx.fillRect(-3, -1.6, 6, 3.2); ctx.restore();
    }
    // Carroçaria.
    ctx.fillStyle = c.cor;
    ctx.strokeStyle = 'rgba(0, 0, 0, .55)';
    ctx.lineWidth = 0.9;
    retRedondo(-12, -6, 24, 12, 3.6);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = 'rgba(0, 0, 0, .78)';   // aileron
    ctx.fillRect(-13, -6, 2.4, 12);
    ctx.fillStyle = 'rgba(16, 28, 40, .88)'; // vidros
    retRedondo(0.5, -4.7, 4.6, 9.4, 1.2); ctx.fill();
    ctx.fillRect(-7.6, -4.3, 2.4, 8.6);
    ctx.fillStyle = 'rgba(255, 255, 255, .28)'; // tejadilho
    ctx.fillRect(-5, -4.6, 5.3, 9.2);
    ctx.fillStyle = 'rgba(0, 0, 0, .3)';     // risca
    ctx.fillRect(5.4, -1.3, 6.2, 2.6);
    ctx.fillStyle = '#fff6b0';               // faróis
    ctx.fillRect(10.4, -5, 1.6, 2.4);
    ctx.fillRect(10.4, 2.6, 1.6, 2.4);
    if (c.trav && c.vf > 4) { ctx.fillStyle = '#ff3b30'; ctx.fillRect(-12.4, -5.2, 1.6, 2.6); ctx.fillRect(-12.4, 2.6, 1.6, 2.6); }
    ctx.restore();
  }

  function desenhar(agora) {
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    const tr = calmo ? 0 : tremor * 7 * vista.a;
    const tx = (Math.random() - 0.5) * tr, ty = (Math.random() - 0.5) * tr;
    ctx.drawImage(camadas.fundo, tx, ty);
    ctx.drawImage(camadas.marcas, tx, ty);
    transformar(ctx);
    ctx.translate(tx / vista.a * (vista.rodado ? 0 : 1), ty / vista.a * (vista.rodado ? 0 : 1));
    const pts = R.pista.pts;
    const baixo = [], cima = [];
    for (const c of R.carros) (pts[c.i].ponte ? cima : baixo).push(c);
    const porAltura = (a, b) => a.alt - b.alt;
    const camada = (lista) => {
      lista.sort(porAltura);
      for (const c of lista) sombraCarro(c);
      for (const c of lista) desenharCarro(c);
    };
    for (const p of particulas) {
      ctx.fillStyle = `rgba(${p.cor}, ${0.5 * (p.vida / p.total)})`;
      ctx.beginPath(); ctx.arc(p.x, p.y, p.r * (1.6 - p.vida / p.total), 0, 7); ctx.fill();
    }
    camada(baixo);
    if (R.pista.cruz) {
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.drawImage(camadas.ponte, tx, ty);
      transformar(ctx);
    }
    camada(cima);
    // Marca por cima do carro do jogador, enquanto a corrida não começa.
    const eu = R.carros[0];
    if (eu && R.fase === 'contagem') {
      const salto = Math.sin(agora / 160) * 2;
      const sx = vista.rodado ? 1 : 0, sy = vista.rodado ? 0 : -1; // «para cima» no ecrã
      ctx.save();
      ctx.translate(eu.x + sx * (22 + salto), eu.y + sy * (22 + salto));
      if (vista.rodado) ctx.rotate(-Math.PI / 2);
      ctx.fillStyle = '#f2c94c';
      ctx.strokeStyle = 'rgba(0,0,0,.6)';
      ctx.lineWidth = 3;
      ctx.font = '800 13px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.strokeText('TU ▼', 0, 0);
      ctx.fillText('TU ▼', 0, 0);
      ctx.restore();
    }
  }

  // ---------- Painel por cima da pista ----------
  const textos = {};
  function por(id, texto) { if (textos[id] !== texto) { textos[id] = texto; $(id).textContent = texto; } }

  function atualizarPainel(agora) {
    const eu = R.carros[0];
    const ordem = classificacao();
    por('hud-lugar', ordinal(ordem.indexOf(eu) + 1));
    por('hud-volta', `${Math.min(R.voltas, Math.max(1, eu.volta + 1))}/${R.voltas}`);
    por('hud-tempo', tempoTxt(eu.fim ?? R.t));
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
    if (R.fase === 'contagem') grande = R.contagem > 3 ? '' : String(Math.ceil(R.contagem));
    else if (R.t < 0.9) grande = 'VAI!';
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

  // ---------- Fim da corrida ----------
  function mostrarResultado() {
    terminarResto();
    R.eventos.length = 0;
    const ordem = classificacao();
    const eu = R.carros[0];
    const lugar = ordem.indexOf(eu) + 1;
    const pista = R.pista;
    const dados = guardado();
    dados.melhor = dados.melhor || {};
    const anterior = dados.melhor[pista.id];
    const recorde = eu.fim !== null && (!anterior || eu.fim < anterior);
    if (recorde && !demo) {
      dados.melhor[pista.id] = Math.round(eu.fim * 10) / 10;
      try { localStorage.setItem('rally-v1', JSON.stringify(dados)); } catch { /* sem armazenamento */ }
    }
    const melhorTempo = ordem[0].fim;
    mostrarFim({
      estado: ['campeao', 'vitoria', 'empate', 'derrota'][lugar - 1],
      icone: ['🏆', '🥈', '🥉', '🏁'][lugar - 1],
      titulo: ['Ganhaste a corrida!', 'Segundo lugar!', 'Terceiro lugar', 'Ficaste em último'][lugar - 1],
      etiqueta: `${pista.nome} · ${R.voltas} voltas`,
      linhas: ordem.map((c, k) => ({
        nome: c.nome, eu: c.id === 0, etiqueta: ordinal(k + 1), mais: k === 0 ? 1 : 0,
        total: c.fim !== null ? tempoTxt(c.fim) : '—', barra: c.fim !== null ? (melhorTempo / c.fim) * 100 : 0,
      })),
      texto: recorde && anterior ? `Novo recorde teu neste circuito! Melhor volta: ${tempoTxt(eu.melhorVolta)}.`
        : `Melhor volta: ${tempoTxt(eu.melhorVolta)}.${anterior && !recorde ? ` O teu recorde é ${tempoTxt(anterior)}.` : ''}`,
      botao: 'Correr outra vez',
    });
  }

  // ---------- Ciclo do jogo ----------
  function comandos() {
    return { acel: teclas.cima, trav: teclas.baixo, dir: (teclas.dir ? 1 : 0) - (teclas.esq ? 1 : 0) };
  }

  let tAnt = 0, acum = 0;
  function quadro(agora) {
    requestAnimationFrame(quadro);
    const dt = Math.min(0.05, (agora - tAnt) / 1000 || 0);
    tAnt = agora;
    if (!R.carros.length) return;
    const parado = document.querySelector('dialog[open]');
    if (!parado && R.fase !== 'fim') {
      acum += dt;
      const cmd = comandos();
      while (acum >= DT) {
        acum -= DT;
        passo(cmd);
        efeitosDoPasso();
        if (R.fase === 'fim') break;
      }
    } else if (!parado && R.fase === 'fim' && !fimMostrado) {
      // Deixa o carro rolar um instante depois da meta, e só então mostra o resultado.
      fimMostrado = true;
      const e = epoca;
      setTimeout(() => { if (e === epoca) mostrarResultado(); }, 900);
    }
    desenhar(agora);
    atualizarPainel(agora);
  }

  function comecar(iPista) {
    epoca++;
    novaCorrida(iPista, { humano: !demo });
    fimMostrado = false;
    for (const k of Object.keys(teclas)) teclas[k] = false;
    particulas = [];
    tremor = 0;
    acum = 0;
    aviso = { texto: '', ate: 0 };
    for (const k of Object.keys(textos)) delete textos[k];
    $('titulo-pista').textContent = R.pista.nome;
    desenharFundo();
    const dados = guardado();
    dados.pista = iPista;
    try { localStorage.setItem('rally-v1', JSON.stringify(dados)); } catch { /* sem armazenamento */ }
  }

  // ---------- Escolha do circuito ----------
  function miniatura(pista) {
    const c = document.createElement('canvas');
    c.width = 200; c.height = 120;
    const m = c.getContext('2d');
    m.scale(0.2, 0.2);
    m.lineJoin = 'round';
    const tracar = () => { m.beginPath(); for (const p of pista.pts) m.lineTo(p.x, p.y); m.closePath(); m.stroke(); };
    m.strokeStyle = '#5b3f22'; m.lineWidth = pista.larg + 22; tracar();
    m.strokeStyle = '#c99a63'; m.lineWidth = pista.larg; tracar();
    m.fillStyle = '#fff';
    const p0 = pista.pts[0];
    m.save(); m.translate(p0.x, p0.y); m.rotate(Math.atan2(p0.ty, p0.tx)); m.fillRect(-6, -pista.larg / 2, 12, pista.larg); m.restore();
    return c;
  }

  function abrirCircuitos() {
    const melhor = guardado().melhor || {};
    $('circuitos').replaceChildren(...PISTAS.map((pista, k) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'circuito';
      const info = document.createElement('span');
      const nome = document.createElement('b');
      nome.textContent = pista.nome;
      const desc = document.createElement('small');
      desc.textContent = CIRCUITOS[k].desc;
      const rec = document.createElement('em');
      rec.textContent = melhor[pista.id] ? `Recorde: ${tempoTxt(melhor[pista.id])}` : 'Ainda sem recorde';
      info.append(nome, desc, rec);
      b.append(miniatura(pista), info);
      b.addEventListener('click', () => { $('dlg-circuitos').close(); comecar(k); });
      return b;
    }));
    $('dlg-circuitos').showModal();
  }

  // ---------- Comandos: setas (ou WASD) e botões de toque ----------
  const MAPA = { ArrowUp: 'cima', ArrowDown: 'baixo', ArrowLeft: 'esq', ArrowRight: 'dir', w: 'cima', s: 'baixo', a: 'esq', d: 'dir' };
  const tecla = (e, valor) => {
    const k = MAPA[e.key] || MAPA[e.key.toLowerCase()];
    if (!k || document.querySelector('dialog[open]')) return;
    teclas[k] = valor;
    e.preventDefault();
  };
  addEventListener('keydown', (e) => tecla(e, true));
  addEventListener('keyup', (e) => tecla(e, false));
  addEventListener('blur', () => { for (const k of Object.keys(teclas)) teclas[k] = false; });
  for (const b of document.querySelectorAll('.toques button')) {
    const k = b.dataset.tecla;
    const largar = () => { teclas[k] = false; b.classList.remove('ativo'); };
    b.addEventListener('pointerdown', (e) => { e.preventDefault(); b.setPointerCapture?.(e.pointerId); teclas[k] = true; b.classList.add('ativo'); });
    b.addEventListener('pointerup', largar);
    b.addEventListener('pointercancel', largar);
    b.addEventListener('lostpointercapture', largar);
    b.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  $('btn-regras').addEventListener('click', () => $('dlg-regras').showModal());
  $('btn-circuito').addEventListener('click', abrirCircuitos);
  $('btn-novo').addEventListener('click', () => comecar(R.iPista));
  $('fim-btn').addEventListener('click', () => { $('dlg-fim').close(); comecar(R.iPista); });
  $('dlg-fim').addEventListener('cancel', (e) => { e.preventDefault(); $('fim-btn').click(); });
  // Sem circuito escolhido não há corrida: fechar a escolha com Esc começa no primeiro.
  $('dlg-circuitos').addEventListener('close', () => { if (!R.carros.length) comecar(0); });

  new ResizeObserver(medir).observe(tela.parentElement);
  medir();
  requestAnimationFrame(quadro);

  // ?c=N abre logo um circuito; &demo=1 põe o piloto automático no teu carro (para ver o jogo a correr).
  const args = new URLSearchParams(location.search);
  demo = args.has('demo');
  if (args.has('c')) {
    comecar(limitar(Number(args.get('c')) | 0, 0, PISTAS.length - 1));
    // &t=N adianta N segundos de corrida (para capturas de ecrã a meio da prova).
    for (let k = 0; k < (Number(args.get('t')) || 0) / DT && R.fase !== 'fim'; k++) { passo(pilotar(R.carros[0])); efeitosDoPasso(); }
  } else abrirCircuitos();
})();
