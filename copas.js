'use strict';

/* =====================================================================
   Copas — motor do jogo (4 jogadores, cada um por si)
   Lugares: 0 = tu (baixo), 1 = direita, 2 = cima, 3 = esquerda.
   O objetivo é fazer o MENOR número de pontos.
   ===================================================================== */

const { idCarta, nomeCarta, baralhar, elCarta, darCartas } =
  typeof require !== 'undefined' ? require('./cartas.js') : Cartas;

const ORDEM = ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'jack', 'queen', 'king', 'ace'];
const LIMITE = 100;
const JOGADORES = ['Noah', 'Duarte', 'Tomas', 'Sira'];
// Sentido do passe em cada ronda: d é o deslocamento até ao lugar de destino.
const PASSES = [
  { d: 3, nome: 'à esquerda' },
  { d: 1, nome: 'à direita' },
  { d: 2, nome: 'em frente' },
  { d: 0, nome: 'sem passe' },
];

const forca = (c) => ORDEM.indexOf(c.r);
const eDama = (c) => c.s === 'spades' && c.r === 'queen';
const pontosCarta = (c) => (c.s === 'hearts' ? 1 : eDama(c) ? 13 : 0);
const maisAlta = (cs) => cs.reduce((m, c) => (forca(c) > forca(m) ? c : m));
const maisBaixa = (cs) => cs.reduce((m, c) => (forca(c) < forca(m) ? c : m));

const C = {
  totais: [0, 0, 0, 0],
  ronda: 0,
  maos: [[], [], [], []],
  fase: 'jogar', // 'passar' | 'jogar'
  vez: -1,
  vaza: [],
  pontos: [0, 0, 0, 0],
  abertas: false, // já se jogou alguma copa?
  primeira: true, // ainda é a primeira vaza?
  jogadas: new Set(),
  ultimaVaza: null,
  recebidas: [], // cartas que recebeste no passe
  fim: false,
};

const passeAtual = () => PASSES[C.ronda % 4];

function novaRonda() {
  const b = baralhar(ORDEM);
  C.maos = [0, 1, 2, 3].map((p) => b.slice(p * 13, p * 13 + 13));
  C.vaza = [];
  C.pontos = [0, 0, 0, 0];
  C.abertas = false;
  C.primeira = true;
  C.jogadas = new Set();
  C.ultimaVaza = null;
  C.recebidas = [];
  C.fim = false;
  C.vez = -1;
  C.fase = 'passar';
  if (!passeAtual().d) iniciarJogo();
}

/** Sai quem tem o 2 de paus. */
function iniciarJogo() {
  C.fase = 'jogar';
  C.vez = C.maos.findIndex((m) => m.some((c) => c.s === 'clubs' && c.r === '2'));
}

/** Troca as 3 cartas escolhidas por cada jogador (escolhas[p]) e começa a jogar. */
function passar(escolhas) {
  const d = passeAtual().d;
  escolhas.forEach((cs, p) => { C.maos[p] = C.maos[p].filter((c) => !cs.includes(c)); });
  escolhas.forEach((cs, p) => {
    const destino = (p + d) % 4;
    C.maos[destino].push(...cs);
    if (destino === 0) C.recebidas = cs.slice();
  });
  iniciarJogo();
}

function jogadasLegais(p) {
  const mao = C.maos[p];
  if (!C.vaza.length) {
    if (C.primeira) return mao.filter((c) => c.s === 'clubs' && c.r === '2');
    if (!C.abertas) {
      const semCopas = mao.filter((c) => c.s !== 'hearts');
      if (semCopas.length) return semCopas;
    }
    return mao.slice();
  }
  const doNaipe = mao.filter((c) => c.s === C.vaza[0].carta.s);
  if (doNaipe.length) return doNaipe;
  if (C.primeira) {
    // Na primeira vaza não se jogam cartas com pontos (salvo se não houver outra).
    const limpas = mao.filter((c) => !pontosCarta(c));
    if (limpas.length) return limpas;
  }
  return mao.slice();
}

/** Ganha a carta mais alta do naipe de saída — não há trunfo. */
function vencedorVaza(vaza) {
  let melhor = vaza[0];
  for (const j of vaza.slice(1)) {
    if (j.carta.s === melhor.carta.s && forca(j.carta) > forca(melhor.carta)) melhor = j;
  }
  return melhor;
}

function jogar(p, carta) {
  const i = C.maos[p].indexOf(carta);
  if (C.fase !== 'jogar' || p !== C.vez || i < 0 || !jogadasLegais(p).includes(carta)) {
    throw new Error('Jogada inválida');
  }
  C.maos[p].splice(i, 1);
  C.vaza.push({ p, carta });
  C.jogadas.add(idCarta(carta));
  if (carta.s === 'hearts') C.abertas = true;
  if (C.vaza.length < 4) {
    C.vez = (p + 1) % 4;
    return { completa: false };
  }
  C.vez = -1;
  return { completa: true, vencedor: vencedorVaza(C.vaza).p };
}

function fecharVaza() {
  const v = vencedorVaza(C.vaza).p;
  C.pontos[v] += C.vaza.reduce((t, j) => t + pontosCarta(j.carta), 0);
  C.ultimaVaza = { cartas: C.vaza, vencedor: v };
  C.vaza = [];
  C.primeira = false;
  C.vez = v;
  if (C.maos.every((m) => !m.length)) {
    C.fim = true;
    C.vez = -1;
  }
}

/** Soma os pontos da ronda. Quem apanhar os 26 pontos fica com 0 e dá 26 a cada adversário. */
function fecharRonda() {
  const lua = C.pontos.indexOf(26);
  const pontos = lua >= 0 ? C.pontos.map((_, p) => (p === lua ? 0 : 26)) : C.pontos.slice();
  pontos.forEach((n, p) => { C.totais[p] += n; });
  C.ronda++;
  return { pontos, lua, fimDeJogo: C.totais.some((t) => t >= LIMITE) };
}

/* ---------------------------------------------------------------------
   Inteligência dos adversários
   --------------------------------------------------------------------- */

/** As 3 cartas mais perigosas da mão. */
function escolherPasse(p) {
  const mao = C.maos[p];
  const espadas = mao.filter((c) => c.s === 'spades').length;
  const perigo = (c) => {
    let v = forca(c);
    if (c.s === 'spades' && forca(c) >= forca({ r: 'queen' })) v += espadas < 5 ? (eDama(c) ? 30 : 20) : -8;
    if (c.s === 'hearts' && forca(c) >= forca({ r: '10' })) v += 4;
    return v;
  };
  return mao.slice().sort((a, b) => perigo(b) - perigo(a)).slice(0, 3);
}

function escolherCarta(p) {
  const legais = jogadasLegais(p);
  if (legais.length === 1) return legais[0];
  const mao = C.maos[p];
  const damaSaiu = C.jogadas.has('queen_of_spades');
  const semDama = legais.filter((c) => !eDama(c));
  const opcoes = semDama.length ? semDama : legais;

  // --- Sair ---
  if (!C.vaza.length) {
    if (!damaSaiu && !mao.some(eDama)) {
      // Puxar espadas baixas para obrigar a Dama a sair.
      const baixas = legais.filter((c) => c.s === 'spades' && forca(c) < forca({ r: 'queen' }));
      if (baixas.length) return maisBaixa(baixas);
    }
    const seguras = damaSaiu ? legais : legais.filter((c) => !(c.s === 'spades' && forca(c) >= forca({ r: 'queen' })));
    const lista = seguras.length ? seguras : legais;
    const noNaipe = (s) => mao.filter((c) => c.s === s).length;
    return lista.reduce((m, c) =>
      (forca(c) < forca(m) || (forca(c) === forca(m) && noNaipe(c.s) < noNaipe(m.s)) ? c : m));
  }

  // --- Assistir ---
  const saida = C.vaza[0].carta.s;
  if (legais[0].s === saida) {
    if (C.primeira) return maisAlta(opcoes); // na primeira vaza não há pontos: despachar a mais alta
    const topo = forca(vencedorVaza(C.vaza).carta);
    const abaixo = legais.filter((c) => forca(c) < topo);
    if (abaixo.length) return abaixo.find(eDama) || maisAlta(abaixo);
    // Vai ganhar a vaza de qualquer forma.
    return C.vaza.length === 3 ? maisAlta(opcoes) : maisBaixa(opcoes);
  }

  // --- Sem o naipe: livrar-se das cartas perigosas ---
  const dama = legais.find(eDama);
  if (dama) return dama;
  if (!damaSaiu) {
    const altas = legais.filter((c) => c.s === 'spades' && forca(c) > forca({ r: 'queen' }));
    if (altas.length) return maisAlta(altas);
  }
  const copas = legais.filter((c) => c.s === 'hearts');
  return maisAlta(copas.length ? copas : legais);
}

if (typeof module !== 'undefined') {
  module.exports = { C, novaRonda, passar, escolherPasse, jogadasLegais, jogar, fecharVaza, fecharRonda, escolherCarta };
}

/* =====================================================================
   Interface
   ===================================================================== */

if (typeof document !== 'undefined') (() => {
  const $ = (id) => document.getElementById(id);
  const CHAVE = 'copas-v1';
  const ESPERA_IA = 700;
  const ESPERA_VAZA = 1100;
  const ESPERA_RECOLHA = 420;
  const ORDEM_NAIPES = ['clubs', 'diamonds', 'spades', 'hearts'];
  const artigo = (p) => (p === 3 ? 'a' : 'o');

  let escolhidas = []; // cartas marcadas para passar
  let epoca = 0; // invalida temporizadores quando se recomeça
  const depois = (ms, fn) => {
    const e = epoca;
    setTimeout(() => { if (e === epoca) fn(); }, ms);
  };

  function guardar() {
    try { localStorage.setItem(CHAVE, JSON.stringify({ totais: C.totais, ronda: C.ronda })); } catch { /* sem armazenamento */ }
  }
  function carregar() {
    try {
      const d = JSON.parse(localStorage.getItem(CHAVE));
      if (d && Array.isArray(d.totais) && d.totais.length === 4 && d.totais.every((t) => t >= 0 && t < LIMITE)) {
        C.totais = d.totais.map((t) => t | 0);
        C.ronda = d.ronda | 0;
      }
    } catch { /* ignora */ }
  }

  function ordenarMao(mao) {
    return mao.slice().sort((a, b) =>
      ORDEM_NAIPES.indexOf(a.s) - ORDEM_NAIPES.indexOf(b.s) || forca(b) - forca(a));
  }

  function desenharMao() {
    const aPassar = C.fase === 'passar';
    const minhaVez = C.fase === 'jogar' && C.vez === 0;
    const legais = minhaVez ? jogadasLegais(0) : [];
    // As cartas escolhidas para passar saem da mão e ficam no quadro do passe.
    const naMao = aPassar ? C.maos[0].filter((c) => !escolhidas.includes(c)) : C.maos[0];
    $('mao').replaceChildren(...ordenarMao(naMao).map((c) => {
      const b = elCarta(c, 'button');
      b.type = 'button';
      b.setAttribute('aria-label', nomeCarta(c));
      if (aPassar) {
        if (escolhidas.length < 3) {
          b.classList.add('jogavel');
          b.addEventListener('click', () => {
            if (escolhidas.length < 3) escolhidas.push(c);
            desenhar();
          });
        } else {
          b.disabled = true;
        }
        return b;
      }
      if (C.recebidas.includes(c)) b.classList.add('recebida');
      if (minhaVez && legais.includes(c)) {
        b.classList.add('jogavel');
        b.addEventListener('click', () => { if (C.vez === 0) fazerJogada(0, c); });
      } else {
        if (minhaVez) b.classList.add('proibida');
        b.disabled = true;
      }
      return b;
    }));
  }

  function desenharVaza() {
    for (let p = 0; p < 4; p++) {
      const slot = $(`slot-${p}`);
      const j = C.vaza.find((x) => x.p === p);
      const id = j ? idCarta(j.carta) : '';
      if (slot.dataset.id === id) continue;
      slot.dataset.id = id;
      slot.replaceChildren(...(j ? [elCarta(j.carta)] : []));
    }
  }

  /** Quadro no centro da mesa com as cartas escolhidas para passar. */
  function desenharPasse() {
    const quadro = $('passe');
    quadro.hidden = C.fase !== 'passar';
    if (quadro.hidden) return;
    const destino = passeAtual().d % 4;
    $('passe-titulo').textContent = `Para ${artigo(destino)} ${JOGADORES[destino]} · ${passeAtual().nome}`;
    [...$('passe-cartas').children].forEach((slot, i) => {
      const c = escolhidas[i];
      const id = c ? idCarta(c) : '';
      if (slot.dataset.id === id) return;
      slot.dataset.id = id;
      slot.classList.toggle('cheio', !!c);
      if (!c) { slot.replaceChildren(); return; }
      const b = elCarta(c, 'button');
      b.type = 'button';
      b.title = 'Devolver à mão';
      b.setAttribute('aria-label', `${nomeCarta(c)} — devolver à mão`);
      b.addEventListener('click', () => {
        escolhidas = escolhidas.filter((x) => x !== c);
        desenhar();
      });
      slot.replaceChildren(b);
    });
    const btn = $('btn-passar');
    btn.disabled = escolhidas.length !== 3;
    btn.textContent = escolhidas.length === 3 ? 'Passar as 3 cartas' : `Escolhidas: ${escolhidas.length} de 3`;
  }

  function textoEstado() {
    const passe = passeAtual();
    if (C.fase === 'passar') {
      const destino = passe.d % 4;
      if (escolhidas.length === 3) return 'Confirma o passe, ou toca numa carta do quadro para a trocar';
      return `Escolhe 3 cartas para passar ${destino === 3 ? 'à' : 'ao'} ${JOGADORES[destino]} (${passe.nome})`;
    }
    if (C.vez === 0) {
      if (C.primeira && !C.vaza.length) return 'Sais tu, com o 2 de paus';
      if (C.recebidas.length) return 'É a tua vez — as cartas com contorno azul são as que recebeste';
      return C.vaza.length ? 'É a tua vez' : 'É a tua vez — sais tu';
    }
    if (C.vez > 0) return `Joga ${artigo(C.vez)} ${JOGADORES[C.vez]}…`;
    if (C.vaza.length === 4) {
      const v = vencedorVaza(C.vaza).p;
      const pts = C.vaza.reduce((t, j) => t + pontosCarta(j.carta), 0);
      const quem = v === 0 ? 'Ficaste com a vaza' : `${JOGADORES[v]} ficou com a vaza`;
      return pts ? `${quem} (+${pts})` : quem;
    }
    return '';
  }

  function desenhar() {
    for (let p = 0; p < 4; p++) {
      $(`total-${p}`).textContent = C.totais[p];
      const ronda = $(`ronda-${p}`);
      ronda.textContent = `+${C.pontos[p]}`;
      ronda.classList.toggle('tem', C.pontos[p] > 0);
      const lugar = $(`lugar-${p}`);
      lugar.classList.toggle('ativo', C.vez === p || (p === 0 && C.fase === 'passar'));
      if (p === 0) continue;
      lugar.querySelector('.nome').innerHTML = JOGADORES[p] + (C.pontos[p] ? ` <small>+${C.pontos[p]}</small>` : '');
      const costas = lugar.querySelector('.costas');
      costas.classList.toggle('vazio', !C.maos[p].length);
      costas.querySelector('b').textContent = C.maos[p].length;
      costas.setAttribute('aria-label', `${C.maos[p].length} cartas`);
    }

    $('copas-icone').classList.toggle('aberta', C.abertas);
    $('copas-detalhe').textContent = `${C.abertas ? 'Abertas' : 'Fechadas'} · ronda ${C.ronda + 1}`;
    $('estado').textContent = textoEstado();

    $('btn-ultima').disabled = !C.ultimaVaza;
    desenharPasse();
    desenharVaza();
    desenharMao();
  }

  function fazerJogada(p, carta) {
    if (p === 0) C.recebidas = [];
    const r = jogar(p, carta);
    desenhar();
    if (!r.completa) return continuar();

    $(`slot-${r.vencedor}`).classList.add('ganha');
    depois(ESPERA_VAZA, () => {
      $('vaza').classList.add('recolhe', `para-${r.vencedor}`);
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
    if (C.fim) return depois(300, fimDaRonda);
    if (C.fase === 'jogar' && C.vez > 0) {
      const p = C.vez;
      depois(ESPERA_IA, () => fazerJogada(p, escolherCarta(p)));
    }
  }

  let fimDeJogo = false;
  function fimDaRonda() {
    const r = fecharRonda();
    fimDeJogo = r.fimDeJogo;
    const meus = r.pontos[0];
    const pior = Math.max(...r.pontos);

    let estado = 'empate';
    let icone = '🃏';
    let titulo = 'Fim da ronda';
    let texto = `Ficaste com ${meus} ${meus === 1 ? 'ponto' : 'pontos'} nesta ronda.`;
    let confetes;
    if (r.lua === 0) {
      estado = 'vitoria'; icone = '🌙'; titulo = 'Apanhaste tudo!';
      texto = 'Ficaste com os 26 pontos: tu marcas 0 e cada adversário leva 26.';
    } else if (r.lua > 0) {
      estado = 'derrota'; icone = '🌙'; titulo = `${JOGADORES[r.lua]} apanhou tudo…`;
      texto = `${JOGADORES[r.lua]} ficou com os 26 pontos: marca 0 e todos os outros levam 26.`;
    } else if (meus === 0) {
      estado = 'vitoria'; icone = '😎'; titulo = 'Ronda limpa!'; confetes = 30;
      texto = 'Não apanhaste nenhum ponto nesta ronda.';
    } else if (meus === pior) {
      estado = 'derrota'; icone = meus >= 13 ? '😬' : '😞'; titulo = 'Ronda difícil…';
    }

    if (fimDeJogo) {
      const menor = Math.min(...C.totais);
      const vencedor = C.totais.indexOf(menor);
      if (C.totais[0] === menor) {
        estado = 'campeao'; icone = '🏆'; titulo = 'Vitória! Ganhaste o jogo!'; confetes = undefined;
        texto = `Alguém chegou aos ${LIMITE} pontos e és tu quem tem menos.`;
      } else {
        estado = 'eliminado'; icone = '😭'; titulo = `Derrota — ${JOGADORES[vencedor]} ganhou o jogo`; confetes = 0;
        texto = `Alguém chegou aos ${LIMITE} pontos e ${artigo(vencedor)} ${JOGADORES[vencedor]} é quem tem menos.`;
      }
    }

    const linhas = [0, 1, 2, 3]
      .map((p) => ({ nome: JOGADORES[p], mais: r.pontos[p], total: C.totais[p], eu: p === 0, limite: LIMITE }))
      .sort((a, b) => a.total - b.total);

    for (let p = 0; p < 4; p++) $(`total-${p}`).textContent = C.totais[p];
    if (fimDeJogo) { try { localStorage.removeItem(CHAVE); } catch { /* ignora */ } }
    else guardar();

    mostrarFim({ estado, icone, titulo, texto, linhas, confetes, botao: fimDeJogo ? 'Novo jogo' : 'Próxima ronda' });
  }

  function comecarRonda() {
    epoca++;
    escolhidas = [];
    limparMesa();
    novaRonda();
    desenhar();
    darCartas($('mao'));
    continuar();
  }

  function novoJogo() {
    C.totais = [0, 0, 0, 0];
    C.ronda = 0;
    fimDeJogo = false;
    guardar();
    comecarRonda();
  }

  $('btn-passar').addEventListener('click', () => {
    if (C.fase !== 'passar' || escolhidas.length !== 3) return;
    passar([escolhidas, escolherPasse(1), escolherPasse(2), escolherPasse(3)]);
    escolhidas = [];
    desenhar();
    continuar();
  });

  $('fim-btn').addEventListener('click', () => {
    $('dlg-fim').close();
    if (fimDeJogo) novoJogo(); else comecarRonda();
  });
  $('dlg-fim').addEventListener('cancel', (e) => { e.preventDefault(); $('fim-btn').click(); });

  $('btn-novo').addEventListener('click', () => {
    const aMeio = C.ronda > 0 || C.jogadas.size > 0;
    if (!aMeio || confirm('Começar um jogo novo? O resultado atual será apagado.')) novoJogo();
  });

  $('btn-regras').addEventListener('click', () => $('dlg-regras').showModal());

  $('btn-ultima').addEventListener('click', () => {
    const u = C.ultimaVaza;
    if (!u) return;
    $('ultima-cartas').replaceChildren(...u.cartas.map((j) => {
      const f = document.createElement('figure');
      if (j.p === u.vencedor) f.className = 'ganhou';
      const cap = document.createElement('figcaption');
      cap.textContent = JOGADORES[j.p];
      f.append(elCarta(j.carta), cap);
      return f;
    }));
    const pts = u.cartas.reduce((t, j) => t + pontosCarta(j.carta), 0);
    $('ultima-texto').textContent =
      `${u.vencedor === 0 ? 'Ficaste' : JOGADORES[u.vencedor] + ' ficou'} com a vaza · ${pts} ${pts === 1 ? 'ponto' : 'pontos'}`;
    $('dlg-ultima').showModal();
  });

  for (const id of ['dlg-regras', 'dlg-ultima']) {
    $(id).addEventListener('click', (e) => { if (e.target === e.currentTarget) e.currentTarget.close(); });
  }

  carregar();
  comecarRonda();
})();
