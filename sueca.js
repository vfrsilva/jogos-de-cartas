'use strict';

/* =====================================================================
   Sueca — motor do jogo
   Lugares: 0 = tu (baixo), 1 = direita, 2 = parceiro (cima), 3 = esquerda.
   Joga-se por ordem 0 → 1 → 2 → 3 (sentido anti-horário).
   Equipas: 0 = Nós (lugares 0 e 2), 1 = Eles (lugares 1 e 3).
   ===================================================================== */

const { NAIPES, VALORES, NOME_NAIPE, forca, pontos, idCarta, nomeCarta, baralhar, elCarta, darCartas } =
  typeof require !== 'undefined' ? require('./cartas.js') : Cartas;

const JOGOS_PARA_GANHAR = 4;
const JOGADORES = ['Noah', 'Duarte', 'Tomas', 'Sira'];
const equipa = (p) => p % 2;

const G = {
  jogos: [0, 0],
  dador: 0,
  maos: [[], [], [], []],
  trunfo: null,
  cartaTrunfo: null,
  vez: -1,
  vaza: [],
  pontos: [0, 0],
  vazas: [0, 0],
  jogadas: new Set(),
  ultimaVaza: null,
  fim: false,
};

function novaPartida() {
  const b = baralhar();
  G.maos = [0, 1, 2, 3].map((p) => b.slice(p * 10, p * 10 + 10));
  G.cartaTrunfo = G.maos[G.dador][9];
  G.trunfo = G.cartaTrunfo.s;
  G.vez = (G.dador + 1) % 4;
  G.vaza = [];
  G.pontos = [0, 0];
  G.vazas = [0, 0];
  G.jogadas = new Set();
  G.ultimaVaza = null;
  G.fim = false;
}

function jogadasLegais(p) {
  const mao = G.maos[p];
  if (!G.vaza.length) return mao.slice();
  const saida = G.vaza[0].carta.s;
  const doNaipe = mao.filter((c) => c.s === saida);
  return doNaipe.length ? doNaipe : mao.slice();
}

/** A carta `a` ganha à carta `b` que está a ganhar a vaza? */
function bate(a, b) {
  if (a.s === b.s) return forca(a) > forca(b);
  return a.s === G.trunfo;
}

function vencedorVaza(vaza) {
  let melhor = vaza[0];
  for (const j of vaza.slice(1)) if (bate(j.carta, melhor.carta)) melhor = j;
  return melhor;
}

/** Joga uma carta. Devolve { completa, vencedor } — a vaza fica na mesa até fecharVaza(). */
function jogar(p, carta) {
  const mao = G.maos[p];
  const i = mao.findIndex((c) => c.s === carta.s && c.r === carta.r);
  if (p !== G.vez || i < 0 || !jogadasLegais(p).some((c) => c === mao[i])) {
    throw new Error('Jogada inválida');
  }
  mao.splice(i, 1);
  G.vaza.push({ p, carta });
  G.jogadas.add(idCarta(carta));
  if (G.vaza.length < 4) {
    G.vez = (p + 1) % 4;
    return { completa: false };
  }
  G.vez = -1;
  return { completa: true, vencedor: vencedorVaza(G.vaza).p };
}

function fecharVaza() {
  const v = vencedorVaza(G.vaza).p;
  G.pontos[equipa(v)] += G.vaza.reduce((t, j) => t + pontos(j.carta), 0);
  G.vazas[equipa(v)]++;
  G.ultimaVaza = { cartas: G.vaza, vencedor: v };
  G.vaza = [];
  G.vez = v;
  if (G.maos.every((m) => !m.length)) {
    G.fim = true;
    G.vez = -1;
  }
}

/** Resultado da partida terminada; soma os jogos e roda o dador. */
function fecharPartida() {
  const [a, b] = G.pontos;
  const r = { pontos: [a, b], vencedora: -1, jogos: 0, tipo: 'empate' };
  if (a !== b) {
    const v = a > b ? 0 : 1;
    r.vencedora = v;
    if (G.vazas[v] === 10) { r.jogos = 4; r.tipo = 'bandeira'; }
    else if (G.pontos[v] >= 91) { r.jogos = 2; r.tipo = 'capote'; }
    else { r.jogos = 1; r.tipo = 'normal'; }
    G.jogos[v] += r.jogos;
  }
  r.fimDeJogo = G.jogos.some((j) => j >= JOGOS_PARA_GANHAR);
  G.dador = (G.dador + 1) % 4;
  return r;
}

/* ---------------------------------------------------------------------
   Inteligência dos adversários e do parceiro
   --------------------------------------------------------------------- */

/** Não há carta mais alta do mesmo naipe por jogar fora da mão de `p`. */
function eMestra(carta, p) {
  return VALORES.slice(forca(carta) + 1).every((r) => {
    const c = { s: carta.s, r };
    return G.jogadas.has(idCarta(c)) || G.maos[p].some((m) => m.s === c.s && m.r === c.r);
  });
}

function maisBaixa(cartas) {
  const chave = (c) => pontos(c) * 100 + (c.s === G.trunfo ? 50 : 0) + forca(c);
  return cartas.reduce((m, c) => (chave(c) < chave(m) ? c : m));
}

function maisPontos(cartas) {
  const semTrunfo = cartas.filter((c) => c.s !== G.trunfo);
  const lista = semTrunfo.length ? semTrunfo : cartas;
  if (!semTrunfo.length) return maisBaixa(lista);
  return lista.reduce((m, c) => (pontos(c) > pontos(m) ? c : m));
}

function escolherCarta(p) {
  const legais = jogadasLegais(p);
  if (legais.length === 1) return legais[0];

  // --- Sair ---
  if (!G.vaza.length) {
    const jogadasNoNaipe = (s) => VALORES.filter((r) => G.jogadas.has(`${r}_of_${s}`)).length;
    const mestras = legais.filter((c) => c.s !== G.trunfo && pontos(c) >= 10 && eMestra(c, p));
    if (mestras.length) {
      return mestras.reduce((m, c) => (jogadasNoNaipe(c.s) < jogadasNoNaipe(m.s) ? c : m));
    }
    const trunfos = legais.filter((c) => c.s === G.trunfo);
    if (trunfos.length >= 4) {
      const alto = trunfos.reduce((m, c) => (forca(c) > forca(m) ? c : m));
      if (eMestra(alto, p)) return alto;
    }
    return maisBaixa(legais);
  }

  // --- Responder ---
  const saida = G.vaza[0].carta.s;
  const aGanhar = vencedorVaza(G.vaza);
  const ultimo = G.vaza.length === 3;
  const assiste = legais[0].s === saida;
  const pontosVaza = G.vaza.reduce((t, j) => t + pontos(j.carta), 0);

  if (aGanhar.p === (p + 2) % 4) {
    const segura = ultimo || eMestra(aGanhar.carta, p);
    return segura ? maisPontos(legais) : maisBaixa(legais);
  }

  const ganham = legais.filter((c) => bate(c, aGanhar.carta));
  if (!ganham.length) return maisBaixa(legais);

  const menorQueGanha = ganham.reduce((m, c) => (forca(c) < forca(m) ? c : m));
  if (assiste) {
    if (ultimo) return ganham.reduce((m, c) => (pontos(c) > pontos(m) ? c : m));
    const mestra = ganham.find((c) => eMestra(c, p));
    if (mestra) return mestra;
    if (pontos(menorQueGanha) < 10) return menorQueGanha;
    return maisBaixa(legais);
  }
  // Sem o naipe de saída: cortar só se compensar.
  if (pontosVaza >= 3 || (ultimo && pontosVaza > 0) || G.maos[p].every((c) => c.s === G.trunfo)) {
    return menorQueGanha;
  }
  const descartes = legais.filter((c) => c.s !== G.trunfo);
  return maisBaixa(descartes.length ? descartes : legais);
}

if (typeof module !== 'undefined') {
  module.exports = { G, novaPartida, jogadasLegais, jogar, fecharVaza, fecharPartida, escolherCarta, pontos };
}

/* =====================================================================
   Interface
   ===================================================================== */

if (typeof document !== 'undefined') (() => {
  const $ = (id) => document.getElementById(id);
  const CHAVE = 'sueca-v1';
  const ESPERA_IA = 750;
  const ESPERA_VAZA = 1100;
  const ESPERA_RECOLHA = 420;

  let epoca = 0; // invalida temporizadores quando se recomeça
  const depois = (ms, fn) => {
    const e = epoca;
    setTimeout(() => { if (e === epoca) fn(); }, ms);
  };

  function guardar() {
    try { localStorage.setItem(CHAVE, JSON.stringify({ jogos: G.jogos, dador: G.dador })); } catch { /* sem armazenamento */ }
  }
  function carregar() {
    try {
      const d = JSON.parse(localStorage.getItem(CHAVE));
      if (d && Array.isArray(d.jogos) && d.jogos.every((j) => j >= 0 && j < JOGOS_PARA_GANHAR)) {
        G.jogos = [d.jogos[0] | 0, d.jogos[1] | 0];
        G.dador = (d.dador | 0) % 4;
        return;
      }
    } catch { /* ignora */ }
    G.dador = Math.floor(Math.random() * 4);
  }

  function ordenarMao(mao) {
    return mao.slice().sort((a, b) =>
      NAIPES.indexOf(a.s) - NAIPES.indexOf(b.s) || forca(b) - forca(a));
  }

  function desenharMao() {
    const mao = $('mao');
    const minhaVez = G.vez === 0;
    const legais = minhaVez ? jogadasLegais(0) : [];
    mao.replaceChildren(...ordenarMao(G.maos[0]).map((c) => {
      const b = elCarta(c, 'button');
      b.type = 'button';
      b.setAttribute('aria-label', nomeCarta(c));
      if (minhaVez) {
        if (legais.includes(c)) {
          b.classList.add('jogavel');
          b.addEventListener('click', () => { if (G.vez === 0) fazerJogada(0, c); });
        } else {
          b.classList.add('proibida');
          b.disabled = true;
        }
      } else {
        b.disabled = true;
      }
      return b;
    }));
  }

  function desenharVaza() {
    for (let p = 0; p < 4; p++) {
      const slot = $(`slot-${p}`);
      const j = G.vaza.find((x) => x.p === p);
      const id = j ? idCarta(j.carta) : '';
      if (slot.dataset.id === id) continue;
      slot.dataset.id = id;
      slot.replaceChildren(...(j ? [elCarta(j.carta)] : []));
    }
  }

  function desenhar() {
    for (const e of [0, 1]) {
      $(`jogos-${e}`).textContent = G.jogos[e];
      $(`pontos-${e}`).textContent = G.pontos[e];
      $(`barra-${e}`).style.width = `${G.pontos[e] / 1.2}%`;
    }
    for (let p = 0; p < 4; p++) {
      const lugar = $(`lugar-${p}`);
      lugar.classList.toggle('ativo', G.vez === p);
      if (p === 0) continue;
      const dador = G.dador === p ? ' <small>· deu</small>' : '';
      const papel = p === 2 ? ' <small>(parceiro)</small>' : '';
      lugar.querySelector('.nome').innerHTML = JOGADORES[p] + papel + dador;
      const costas = lugar.querySelector('.costas');
      costas.classList.toggle('vazio', !G.maos[p].length);
      costas.querySelector('b').textContent = G.maos[p].length;
      costas.setAttribute('aria-label', `${G.maos[p].length} cartas`);
    }

    const t = $('trunfo-carta');
    if (t.dataset.id !== idCarta(G.cartaTrunfo)) {
      t.dataset.id = idCarta(G.cartaTrunfo);
      t.replaceChildren(...elCarta(G.cartaTrunfo).childNodes);
    }
    $('trunfo-detalhe').textContent =
      `${NOME_NAIPE[G.trunfo][0].toUpperCase()}${NOME_NAIPE[G.trunfo].slice(1)} · deu: ${G.dador === 0 ? 'tu' : JOGADORES[G.dador]}`;

    let estado = '';
    if (G.vez === 0) estado = G.vaza.length ? 'É a tua vez' : 'É a tua vez — sais tu';
    else if (G.vez > 0) estado = `Joga ${G.vez === 3 ? 'a' : 'o'} ${JOGADORES[G.vez]}…`;
    else if (G.vaza.length === 4) {
      const v = vencedorVaza(G.vaza).p;
      estado = v === 0 ? 'Ganhaste a vaza' : `${JOGADORES[v]} ganhou a vaza`;
    }
    $('estado').textContent = estado;

    $('btn-ultima').disabled = !G.ultimaVaza;
    desenharVaza();
    desenharMao();
  }

  function fazerJogada(p, carta) {
    const r = jogar(p, carta);
    desenhar();
    if (!r.completa) return continuar();

    const vaza = $('vaza');
    $(`slot-${r.vencedor}`).classList.add('ganha');
    depois(ESPERA_VAZA, () => {
      vaza.classList.add('recolhe', `para-${r.vencedor}`);
      depois(ESPERA_RECOLHA, () => {
        fecharVaza();
        limparMesa();
        desenhar();
        continuar();
      });
    });
  }

  function limparMesa() {
    $('vaza').className = 'vaza';
    for (let p = 0; p < 4; p++) $(`slot-${p}`).classList.remove('ganha');
  }

  function continuar() {
    if (G.fim) return depois(300, fimDaPartida);
    if (G.vez > 0) {
      const p = G.vez;
      depois(ESPERA_IA, () => fazerJogada(p, escolherCarta(p)));
    }
  }

  let fimDeJogo = false;
  function fimDaPartida() {
    const r = fecharPartida();
    fimDeJogo = r.fimDeJogo;
    const ganhamos = r.vencedora === 0;
    const jogosTxt = r.jogos === 1 ? '1 jogo' : `${r.jogos} jogos`;
    const quem = ganhamos ? 'para nós' : 'para eles';
    const textos = {
      empate: 'Empate a 60 pontos — ninguém marca.',
      normal: `Mais de 60 pontos: ${jogosTxt} ${quem}.`,
      capote: `Capote! 91 pontos ou mais valem ${jogosTxt} ${quem}.`,
      bandeira: `Bandeira! Todas as vazas valem ${jogosTxt} ${quem}.`,
    };
    let titulo = r.vencedora < 0 ? 'Empate' : ganhamos ? 'Ganhámos a partida!' : 'Perdemos a partida…';
    let estado = r.vencedora < 0 ? 'empate' : ganhamos ? 'vitoria' : 'derrota';
    if (fimDeJogo) {
      const campeoes = G.jogos[0] > G.jogos[1];
      titulo = campeoes ? 'Vitória! O jogo é nosso!' : 'Derrota — eles ganharam o jogo';
      estado = campeoes ? 'campeao' : 'eliminado';
    }
    const etiquetas = { capote: 'Capote!', bandeira: 'Bandeira!' };

    $('jogos-0').textContent = G.jogos[0];
    $('jogos-1').textContent = G.jogos[1];
    if (fimDeJogo) { try { localStorage.removeItem(CHAVE); } catch { /* ignora */ } }
    else guardar();

    mostrarFim({
      estado,
      titulo,
      etiqueta: etiquetas[r.tipo] || '',
      texto: textos[r.tipo],
      pontos: r.pontos,
      nomes: ['Nós', 'Eles'],
      jogos: G.jogos,
      novos: [ganhamos ? r.jogos : 0, r.vencedora === 1 ? r.jogos : 0],
      meta: JOGOS_PARA_GANHAR,
      botao: fimDeJogo ? 'Novo jogo' : 'Próxima partida',
    });
  }

  function comecarPartida() {
    epoca++;
    limparMesa();
    novaPartida();
    desenhar();
    darCartas($('mao'));
    continuar();
  }

  function novoJogo() {
    G.jogos = [0, 0];
    G.dador = Math.floor(Math.random() * 4);
    fimDeJogo = false;
    guardar();
    comecarPartida();
  }

  $('fim-btn').addEventListener('click', () => {
    $('dlg-fim').close();
    if (fimDeJogo) novoJogo(); else comecarPartida();
  });
  // Esc no diálogo de fim de partida também avança.
  $('dlg-fim').addEventListener('cancel', (e) => { e.preventDefault(); $('fim-btn').click(); });

  $('btn-novo').addEventListener('click', () => {
    const aMeio = G.jogos[0] + G.jogos[1] > 0 || G.jogadas.size > 0;
    if (!aMeio || confirm('Começar um jogo novo? O resultado atual será apagado.')) novoJogo();
  });

  $('btn-regras').addEventListener('click', () => $('dlg-regras').showModal());

  $('btn-ultima').addEventListener('click', () => {
    const u = G.ultimaVaza;
    if (!u) return;
    $('ultima-cartas').replaceChildren(...u.cartas.map((j) => {
      const f = document.createElement('figure');
      if (j.p === u.vencedor) f.className = 'ganhou';
      const cap = document.createElement('figcaption');
      cap.textContent = JOGADORES[j.p];
      f.append(elCarta(j.carta), cap);
      return f;
    }));
    const pts = u.cartas.reduce((t, j) => t + pontos(j.carta), 0);
    $('ultima-texto').textContent =
      `${u.vencedor === 0 ? 'Ganhaste' : JOGADORES[u.vencedor] + ' ganhou'} · ${pts} ${pts === 1 ? 'ponto' : 'pontos'}`;
    $('dlg-ultima').showModal();
  });

  // Fechar diálogos informativos ao clicar fora.
  for (const id of ['dlg-regras', 'dlg-ultima']) {
    $(id).addEventListener('click', (e) => { if (e.target === e.currentTarget) e.currentTarget.close(); });
  }

  carregar();
  comecarPartida();
})();
