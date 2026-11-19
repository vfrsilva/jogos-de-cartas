'use strict';

/* =====================================================================
   Bisca dos Três — motor do jogo (2 jogadores)
   Jogador 0 = tu (Noah), jogador 1 = computador (Duarte).
   ===================================================================== */

const { NOME_NAIPE, forca, pontos, idCarta, nomeCarta, baralhar, elCarta, darCartas } =
  typeof require !== 'undefined' ? require('./cartas.js') : Cartas;

const JOGOS_PARA_GANHAR = 4;

const B = {
  jogos: [0, 0],
  dador: 0,
  maos: [[], []],
  baralho: [], // baralho[0] é a carta de trunfo, a última a ser comprada
  trunfo: null,
  cartaTrunfo: null,
  vez: -1,
  vaza: [],
  pontos: [0, 0],
  ultimaVaza: null,
  compradas: [null, null], // última carta comprada por cada jogador
  fim: false,
};

function novaPartida() {
  const b = baralhar();
  B.maos = [b.splice(-3), b.splice(-3)];
  B.baralho = b;
  B.cartaTrunfo = b[0];
  B.trunfo = b[0].s;
  B.vez = 1 - B.dador;
  B.vaza = [];
  B.pontos = [0, 0];
  B.ultimaVaza = null;
  B.compradas = [null, null];
  B.fim = false;
}

/** Na Bisca nunca é obrigatório assistir: pode jogar-se qualquer carta da mão. */
function jogadasLegais(p) {
  return B.maos[p].slice();
}

/** A carta `a`, jogada em segundo lugar, ganha à carta `b`? */
function bate(a, b) {
  if (a.s === b.s) return forca(a) > forca(b);
  return a.s === B.trunfo;
}

function vencedorVaza(vaza) {
  return bate(vaza[1].carta, vaza[0].carta) ? vaza[1].p : vaza[0].p;
}

function jogar(p, carta) {
  const i = B.maos[p].indexOf(carta);
  if (p !== B.vez || i < 0 || !jogadasLegais(p).includes(carta)) throw new Error('Jogada inválida');
  B.maos[p].splice(i, 1);
  B.vaza.push({ p, carta });
  if (B.vaza.length < 2) {
    B.vez = 1 - p;
    return { completa: false };
  }
  B.vez = -1;
  return { completa: true, vencedor: vencedorVaza(B.vaza) };
}

/** Atribui a vaza e compra cartas: primeiro quem ganhou, depois o outro. */
function fecharVaza() {
  const v = vencedorVaza(B.vaza);
  B.pontos[v] += pontos(B.vaza[0].carta) + pontos(B.vaza[1].carta);
  B.ultimaVaza = { cartas: B.vaza, vencedor: v };
  B.vaza = [];
  B.compradas = [null, null];
  if (B.baralho.length) {
    for (const p of [v, 1 - v]) {
      B.compradas[p] = B.baralho.pop();
      B.maos[p].push(B.compradas[p]);
    }
  }
  B.vez = v;
  if (!B.maos[0].length && !B.maos[1].length) {
    B.fim = true;
    B.vez = -1;
  }
}

function fecharPartida() {
  const [a, b] = B.pontos;
  const r = { pontos: [a, b], vencedor: a === b ? -1 : a > b ? 0 : 1 };
  if (r.vencedor >= 0) B.jogos[r.vencedor]++;
  r.fimDeJogo = B.jogos.some((j) => j >= JOGOS_PARA_GANHAR);
  B.dador = 1 - B.dador;
  return r;
}

/* ---------------------------------------------------------------------
   Inteligência do computador
   --------------------------------------------------------------------- */

function maisBaixa(cartas) {
  const chave = (c) => pontos(c) * 100 + (c.s === B.trunfo ? 50 : 0) + forca(c);
  return cartas.reduce((m, c) => (chave(c) < chave(m) ? c : m));
}

/** Sem baralho, as mãos deduzem-se das cartas já vistas: procura exaustiva do melhor final. */
function valorFinal(maos, vez, mesa) {
  if (!mesa && !maos[0].length && !maos[1].length) return 0;
  let melhor = -Infinity;
  for (const c of maos[vez]) {
    const novas = maos.slice();
    novas[vez] = maos[vez].filter((x) => x !== c);
    let v;
    if (!mesa) {
      v = -valorFinal(novas, 1 - vez, { p: vez, carta: c });
    } else {
      const ganha = bate(c, mesa.carta);
      const pts = pontos(c) + pontos(mesa.carta);
      v = ganha ? pts + valorFinal(novas, vez, null) : -pts - valorFinal(novas, 1 - vez, null);
    }
    if (v > melhor) melhor = v;
  }
  return melhor; // do ponto de vista de quem joga
}

function escolherFinal(p) {
  const mesa = B.vaza[0] || null;
  let melhor = null;
  let melhorV = -Infinity;
  for (const c of jogadasLegais(p)) {
    const novas = B.maos.slice();
    novas[p] = B.maos[p].filter((x) => x !== c);
    let v;
    if (!mesa) {
      v = -valorFinal(novas, 1 - p, { p, carta: c });
    } else {
      const ganha = bate(c, mesa.carta);
      const pts = pontos(c) + pontos(mesa.carta);
      v = ganha ? pts + valorFinal(novas, p, null) : -pts - valorFinal(novas, 1 - p, null);
    }
    if (v > melhorV) { melhorV = v; melhor = c; }
  }
  return melhor;
}

function escolherCarta(p) {
  const mao = B.maos[p];
  if (mao.length === 1) return mao[0];
  if (!B.baralho.length) return escolherFinal(p);

  // Sair: a carta que menos custa perder.
  if (!B.vaza.length) return maisBaixa(mao);

  // Responder.
  const saida = B.vaza[0].carta;
  const ganham = mao.filter((c) => bate(c, saida));
  if (!ganham.length) return maisBaixa(mao);

  const doNaipe = ganham.filter((c) => c.s === saida.s && c.s !== B.trunfo);
  if (doNaipe.length) {
    // Ganhar no naipe não gasta trunfos: aproveita para meter o Ás ou o Sete.
    const rica = doNaipe.reduce((m, c) => (pontos(c) > pontos(m) ? c : m));
    if (pontos(rica) >= 10) return rica;
    if (pontos(saida) > 0) return doNaipe.reduce((m, c) => (forca(c) < forca(m) ? c : m));
    return maisBaixa(mao);
  }

  // Só ganha com trunfo: cortar se a carta de saída valer a pena.
  const menorTrunfo = ganham.reduce((m, c) => (forca(c) < forca(m) ? c : m));
  if (pontos(saida) >= 10) return menorTrunfo;
  if (pontos(saida) >= 3 && pontos(menorTrunfo) === 0) return menorTrunfo;
  const resto = mao.filter((c) => !ganham.includes(c));
  return maisBaixa(resto.length ? resto : mao);
}

if (typeof module !== 'undefined') {
  module.exports = { B, novaPartida, jogadasLegais, jogar, fecharVaza, fecharPartida, escolherCarta };
}

/* =====================================================================
   Interface
   ===================================================================== */

if (typeof document !== 'undefined') (() => {
  const $ = (id) => document.getElementById(id);
  const CHAVE = 'bisca-v1';
  const ESPERA_IA = 800;
  const ESPERA_VAZA = 1100;
  const ESPERA_RECOLHA = 420;
  const NOMES = ['Noah', 'Duarte'];

  let epoca = 0; // invalida temporizadores quando se recomeça
  const depois = (ms, fn) => {
    const e = epoca;
    setTimeout(() => { if (e === epoca) fn(); }, ms);
  };

  function guardar() {
    try { localStorage.setItem(CHAVE, JSON.stringify({ jogos: B.jogos, dador: B.dador })); } catch { /* sem armazenamento */ }
  }
  function carregar() {
    try {
      const d = JSON.parse(localStorage.getItem(CHAVE));
      if (d && Array.isArray(d.jogos) && d.jogos.every((j) => j >= 0 && j < JOGOS_PARA_GANHAR)) {
        B.jogos = [d.jogos[0] | 0, d.jogos[1] | 0];
        B.dador = d.dador ? 1 : 0;
        return;
      }
    } catch { /* ignora */ }
    B.dador = Math.floor(Math.random() * 2);
  }

  function desenharMao() {
    const minhaVez = B.vez === 0;
    const legais = minhaVez ? jogadasLegais(0) : [];
    $('mao').replaceChildren(...B.maos[0].map((c) => {
      const b = elCarta(c, 'button');
      b.type = 'button';
      b.setAttribute('aria-label', nomeCarta(c));
      if (c === B.compradas[0]) b.classList.add('nova');
      if (minhaVez && legais.includes(c)) {
        b.classList.add('jogavel');
        b.addEventListener('click', () => { if (B.vez === 0) fazerJogada(0, c); });
      } else {
        if (minhaVez) b.classList.add('proibida');
        b.disabled = true;
      }
      return b;
    }));
    B.compradas[0] = null; // anima só uma vez
  }

  function desenharVaza() {
    for (const p of [0, 1]) {
      const slot = $(`slot-${p}`);
      const j = B.vaza.find((x) => x.p === p);
      const id = j ? idCarta(j.carta) : '';
      if (slot.dataset.id === id) continue;
      slot.dataset.id = id;
      slot.replaceChildren(...(j ? [elCarta(j.carta)] : []));
    }
  }

  function desenhar() {
    for (const p of [0, 1]) {
      $(`jogos-${p}`).textContent = B.jogos[p];
      $(`pontos-${p}`).textContent = B.pontos[p];
      $(`barra-${p}`).style.width = `${B.pontos[p] / 1.2}%`;
      $(`lugar-${p}`).classList.toggle('ativo', B.vez === p);
    }
    const rival = $('lugar-1');
    rival.querySelector('.nome').innerHTML = NOMES[1] + (B.dador === 1 ? ' <small>· deu</small>' : '');
    const costas = rival.querySelector('.costas');
    costas.classList.toggle('vazio', !B.maos[1].length);
    costas.querySelector('b').textContent = B.maos[1].length;
    costas.setAttribute('aria-label', `${B.maos[1].length} cartas`);

    // Baralho: monte virado para baixo com a carta de trunfo à vista por baixo.
    const n = B.baralho.length;
    const monte = $('baralho');
    monte.classList.toggle('vazio', n === 0);
    monte.classList.toggle('so-trunfo', n === 1);
    $('baralho-n').textContent = n;
    monte.setAttribute('aria-label', n ? `Baralho: ${n} cartas` : 'Baralho esgotado');
    for (const id of ['trunfo-carta', 'baralho-trunfo']) {
      const t = $(id);
      if (t.dataset.id !== idCarta(B.cartaTrunfo)) {
        t.dataset.id = idCarta(B.cartaTrunfo);
        t.replaceChildren(...elCarta(B.cartaTrunfo).childNodes);
      }
    }
    const naipe = NOME_NAIPE[B.trunfo];
    $('trunfo-detalhe').textContent =
      `${naipe[0].toUpperCase()}${naipe.slice(1)} · ${n ? `baralho: ${n}` : 'baralho esgotado'}`;

    let estado = '';
    if (B.vez === 0) {
      estado = B.vaza.length ? 'É a tua vez' : 'É a tua vez — sais tu';
    } else if (B.vez === 1) estado = 'Joga o Duarte…';
    else if (B.vaza.length === 2) {
      estado = vencedorVaza(B.vaza) === 0 ? 'Ganhaste a vaza' : 'O Duarte ganhou a vaza';
    }
    $('estado').textContent = estado;

    $('btn-ultima').disabled = !B.ultimaVaza;
    desenharVaza();
    desenharMao();
  }

  function fazerJogada(p, carta) {
    const r = jogar(p, carta);
    desenhar();
    if (!r.completa) return continuar();

    $(`slot-${r.vencedor}`).classList.add('ganha');
    depois(ESPERA_VAZA, () => {
      $('vaza').classList.add('recolhe', `para-${r.vencedor === 0 ? 0 : 2}`);
      depois(ESPERA_RECOLHA, () => {
        fecharVaza();
        limparMesa();
        desenhar();
        continuar();
      });
    });
  }

  function limparMesa() {
    $('vaza').className = 'vaza dupla';
    for (const p of [0, 1]) $(`slot-${p}`).classList.remove('ganha');
  }

  function continuar() {
    if (B.fim) return depois(300, fimDaPartida);
    if (B.vez === 1) depois(ESPERA_IA, () => fazerJogada(1, escolherCarta(1)));
  }

  let fimDeJogo = false;
  function fimDaPartida() {
    const r = fecharPartida();
    fimDeJogo = r.fimDeJogo;
    let titulo = r.vencedor < 0 ? 'Empate' : r.vencedor === 0 ? 'Ganhaste a partida!' : 'Perdeste a partida…';
    let estado = r.vencedor < 0 ? 'empate' : r.vencedor === 0 ? 'vitoria' : 'derrota';
    if (fimDeJogo) {
      const campeao = B.jogos[0] > B.jogos[1];
      titulo = campeao ? 'Vitória! O jogo é teu!' : 'Derrota — o Duarte ganhou o jogo';
      estado = campeao ? 'campeao' : 'eliminado';
    }
    const texto = r.vencedor < 0
      ? 'Empate a 60 pontos — ninguém marca.'
      : `Mais de 60 pontos: 1 jogo para ${r.vencedor === 0 ? 'ti' : 'o Duarte'}.`;

    $('jogos-0').textContent = B.jogos[0];
    $('jogos-1').textContent = B.jogos[1];
    if (fimDeJogo) { try { localStorage.removeItem(CHAVE); } catch { /* ignora */ } }
    else guardar();

    mostrarFim({
      estado,
      titulo,
      texto,
      pontos: r.pontos,
      nomes: NOMES,
      jogos: B.jogos,
      novos: [r.vencedor === 0 ? 1 : 0, r.vencedor === 1 ? 1 : 0],
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
    B.jogos = [0, 0];
    B.dador = Math.floor(Math.random() * 2);
    fimDeJogo = false;
    guardar();
    comecarPartida();
  }

  $('fim-btn').addEventListener('click', () => {
    $('dlg-fim').close();
    if (fimDeJogo) novoJogo(); else comecarPartida();
  });
  $('dlg-fim').addEventListener('cancel', (e) => { e.preventDefault(); $('fim-btn').click(); });

  $('btn-novo').addEventListener('click', () => {
    const aMeio = B.jogos[0] + B.jogos[1] > 0 || B.ultimaVaza || B.vaza.length;
    if (!aMeio || confirm('Começar um jogo novo? O resultado atual será apagado.')) novoJogo();
  });

  $('btn-regras').addEventListener('click', () => $('dlg-regras').showModal());

  $('btn-ultima').addEventListener('click', () => {
    const u = B.ultimaVaza;
    if (!u) return;
    $('ultima-cartas').replaceChildren(...u.cartas.map((j) => {
      const f = document.createElement('figure');
      if (j.p === u.vencedor) f.className = 'ganhou';
      const cap = document.createElement('figcaption');
      cap.textContent = NOMES[j.p];
      f.append(elCarta(j.carta), cap);
      return f;
    }));
    const pts = u.cartas.reduce((t, j) => t + pontos(j.carta), 0);
    $('ultima-texto').textContent =
      `${u.vencedor === 0 ? 'Ganhaste' : 'O Duarte ganhou'} · ${pts} ${pts === 1 ? 'ponto' : 'pontos'}`;
    $('dlg-ultima').showModal();
  });

  for (const id of ['dlg-regras', 'dlg-ultima']) {
    $(id).addEventListener('click', (e) => { if (e.target === e.currentTarget) e.currentTarget.close(); });
  }

  carregar();
  comecarPartida();
})();
