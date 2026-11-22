'use strict';

/* =====================================================================
   Cinquillo — motor do jogo (4 jogadores, baralha espanhola de 40 cartas)
   Lugares: 0 = tu (baixo), 1 = direita, 2 = cima, 3 = esquerda.
   Cada naipe cresce na mesa a partir do 5, para baixo e para cima.
   Ganha a ronda quem ficar primeiro sem cartas.
   ===================================================================== */

const PALOS = ['oros', 'copas', 'espadas', 'bastos'];
const VALORES = ['1', '2', '3', '4', '5', '6', '7', '10', '11', '12']; // por ordem na mesa
const CINCO = VALORES.indexOf('5');
const NOME_PALO = { oros: 'ouros', copas: 'copas', espadas: 'espadas', bastos: 'paus' };
const NOME_VALOR = { 1: 'Ás', 10: 'Sota', 11: 'Cavalo', 12: 'Rei' };
const JOGADORES = ['Noah', 'Duarte', 'Tomas', 'Sira'];
const RONDAS_PARA_GANHAR = 3;

const pos = (c) => VALORES.indexOf(c.r);
const nomeCarta = (c) => `${NOME_VALOR[c.r] || c.r} de ${NOME_PALO[c.s]}`;

const Q = {
  vitorias: [0, 0, 0, 0],
  maos: [[], [], [], []],
  mesa: {}, // por naipe: { min, max } (posições já na mesa) ou null
  vez: -1,
  fim: false,
  vencedor: -1,
  ultima: null, // última ação: { p, carta } ou { p, passou: true }
};

function novaRonda() {
  const b = [];
  for (const s of PALOS) for (const r of VALORES) b.push({ s, r });
  for (let i = b.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [b[i], b[j]] = [b[j], b[i]];
  }
  Q.maos = [0, 1, 2, 3].map((p) => b.slice(p * 10, p * 10 + 10));
  Q.mesa = { oros: null, copas: null, espadas: null, bastos: null };
  Q.fim = false;
  Q.vencedor = -1;
  Q.ultima = null;
  // Começa quem tem o 5 de ouros.
  Q.vez = Q.maos.findIndex((m) => m.some((c) => c.s === 'oros' && c.r === '5'));
}

const mesaVazia = () => PALOS.every((s) => !Q.mesa[s]);

/** A carta encaixa na mesa: é um 5 de um naipe por abrir, ou a seguinte de uma ponta. */
function encaixa(c) {
  const m = Q.mesa[c.s];
  const i = pos(c);
  return m ? i === m.min - 1 || i === m.max + 1 : i === CINCO;
}

function jogadasLegais(p) {
  if (mesaVazia()) return Q.maos[p].filter((c) => c.s === 'oros' && c.r === '5');
  return Q.maos[p].filter(encaixa);
}

function jogar(p, carta) {
  const i = Q.maos[p].indexOf(carta);
  if (p !== Q.vez || i < 0 || !jogadasLegais(p).includes(carta)) throw new Error('Jogada inválida');
  Q.maos[p].splice(i, 1);
  const n = pos(carta);
  const m = Q.mesa[carta.s];
  Q.mesa[carta.s] = m ? { min: Math.min(m.min, n), max: Math.max(m.max, n) } : { min: n, max: n };
  Q.ultima = { p, carta };
  if (!Q.maos[p].length) {
    Q.fim = true;
    Q.vencedor = p;
    Q.vitorias[p]++;
    Q.vez = -1;
  } else {
    Q.vez = (p + 1) % 4;
  }
}

/** Só se pode passar quando nenhuma carta encaixa. */
function passar(p) {
  if (p !== Q.vez || jogadasLegais(p).length) throw new Error('Não podes passar');
  Q.ultima = { p, passou: true };
  Q.vez = (p + 1) % 4;
}

const fimDeJogo = () => Q.vitorias.some((v) => v >= RONDAS_PARA_GANHAR);

/* ---------------------------------------------------------------------
   Inteligência dos adversários
   --------------------------------------------------------------------- */

/**
 * Prefere a carta que desbloqueia mais cartas suas no mesmo naipe; em caso de empate,
 * a mais longe do 5. Evita abrir caminho aos outros quando não ganha nada com isso.
 */
function escolherCarta(p) {
  const mao = Q.maos[p];
  const valor = (c) => {
    const i = pos(c);
    const doNaipe = mao.filter((x) => x.s === c.s && x !== c);
    const minhas = i === CINCO ? doNaipe.length
      : doNaipe.filter((x) => (i < CINCO ? pos(x) < i : pos(x) > i)).length;
    const ponta = i === 0 || i === VALORES.length - 1 ? 5 : 0; // não abre nada a ninguém
    return minhas * 10 + ponta + Math.abs(i - CINCO);
  };
  return jogadasLegais(p).reduce((m, c) => (valor(c) > valor(m) ? c : m));
}

if (typeof module !== 'undefined') {
  module.exports = { Q, PALOS, VALORES, novaRonda, jogadasLegais, jogar, passar, escolherCarta, fimDeJogo };
}

/* =====================================================================
   Interface
   ===================================================================== */

if (typeof document !== 'undefined') (() => {
  const $ = (id) => document.getElementById(id);
  const CHAVE = 'cinquillo-v1';
  const ESPERA_IA = 850;
  const ESPERA_PASSO = 900;
  const o = (p) => (p === 3 ? 'a' : 'o');
  const O = (p) => (p === 3 ? 'A' : 'O');
  const imagem = (c) => `baraja/${c.r}_de_${c.s}.png`;

  let epoca = 0; // invalida temporizadores quando se recomeça
  const depois = (ms, fn) => {
    const e = epoca;
    setTimeout(() => { if (e === epoca) fn(); }, ms);
  };

  function guardar() {
    try { localStorage.setItem(CHAVE, JSON.stringify({ vitorias: Q.vitorias })); } catch { /* sem armazenamento */ }
  }
  function carregar() {
    try {
      const d = JSON.parse(localStorage.getItem(CHAVE));
      if (d && Array.isArray(d.vitorias) && d.vitorias.length === 4 && d.vitorias.every((v) => v >= 0 && v < RONDAS_PARA_GANHAR)) {
        Q.vitorias = d.vitorias.map((v) => v | 0);
      }
    } catch { /* ignora */ }
  }

  /** Carta da baralha espanhola virada para cima. */
  function elCarta(carta, tag = 'span') {
    const el = document.createElement(tag);
    el.className = 'carta es';
    const img = document.createElement('img');
    img.src = imagem(carta);
    img.alt = nomeCarta(carta);
    img.draggable = false;
    el.append(img);
    return el;
  }

  // Tabuleiro: uma fila por naipe com as 10 posições (1 … 7, 10, 11, 12).
  const casas = {};
  function construirTabuleiro() {
    const tab = $('tabuleiro');
    const topo = document.createElement('div');
    topo.className = 'tab-fila tab-topo';
    topo.setAttribute('aria-hidden', 'true');
    for (const r of VALORES) {
      const n = document.createElement('span');
      n.textContent = r;
      topo.append(n);
    }
    tab.append(topo);
    for (const s of PALOS) {
      const fila = document.createElement('div');
      fila.className = 'tab-fila';
      fila.setAttribute('aria-label', NOME_PALO[s]);
      casas[s] = VALORES.map((r) => {
        const casa = document.createElement('button');
        casa.type = 'button';
        casa.className = 'casa';
        casa.addEventListener('click', () => {
          const carta = Q.maos[0].find((c) => c.s === s && c.r === r);
          if (Q.vez === 0 && carta && jogadasLegais(0).includes(carta)) fazerJogada(0, carta);
        });
        fila.append(casa);
        return casa;
      });
      tab.append(fila);
    }
  }

  function desenharTabuleiro() {
    const minhas = Q.vez === 0 ? jogadasLegais(0) : [];
    const vazia = PALOS.every((s) => !Q.mesa[s]);
    for (const s of PALOS) {
      const m = Q.mesa[s];
      VALORES.forEach((r, i) => {
        const casa = casas[s][i];
        const posta = !!m && i >= m.min && i <= m.max;
        const aberta = !posta && (m ? i === m.min - 1 || i === m.max + 1 : i === CINCO && (!vazia || s === 'oros'));
        const minha = minhas.some((c) => c.s === s && c.r === r);
        const ultima = !!Q.ultima && !!Q.ultima.carta && Q.ultima.carta.s === s && Q.ultima.carta.r === r;
        const estado = `${posta ? 'posta' : ''} ${aberta ? 'aberta' : ''} ${minha ? 'minha' : ''} ${ultima ? 'recente' : ''}`;
        if (casa.dataset.estado === estado) return;
        const tinhaCarta = casa.dataset.estado && casa.dataset.estado.startsWith('posta');
        casa.dataset.estado = estado;
        casa.className = `casa ${estado}`;
        casa.disabled = !minha;
        casa.setAttribute('aria-label', `${nomeCarta({ s, r })}${posta ? ' — na mesa' : minha ? ' — podes jogar aqui' : ''}`);
        if (posta && tinhaCarta) return; // a imagem já lá está: não repetir a animação
        if (posta || i === CINCO) {
          // O 5 ainda por jogar aparece esbatido, para se ver de que naipe é a fila.
          const img = document.createElement('img');
          img.src = imagem({ s, r });
          img.alt = '';
          img.draggable = false;
          casa.replaceChildren(img);
          casa.classList.toggle('fantasma', !posta);
        } else {
          casa.textContent = r;
        }
      });
    }
  }

  function ordenarMao(mao) {
    return mao.slice().sort((a, b) => PALOS.indexOf(a.s) - PALOS.indexOf(b.s) || pos(a) - pos(b));
  }

  function desenharMao() {
    const minhaVez = Q.vez === 0;
    const legais = minhaVez ? jogadasLegais(0) : [];
    $('mao').replaceChildren(...ordenarMao(Q.maos[0]).map((c) => {
      const b = elCarta(c, 'button');
      b.type = 'button';
      b.setAttribute('aria-label', nomeCarta(c));
      if (minhaVez && legais.includes(c)) {
        b.classList.add('jogavel');
        b.addEventListener('click', () => { if (Q.vez === 0) fazerJogada(0, c); });
      } else {
        if (minhaVez) b.classList.add('proibida');
        b.disabled = true;
      }
      return b;
    }));
  }

  function desenhar() {
    for (let p = 0; p < 4; p++) {
      const n = Q.maos[p].length;
      $(`total-${p}`).textContent = Q.vitorias[p];
      $(`ronda-${p}`).textContent = n === 1 ? '1 carta' : `${n} cartas`;
      const lugar = $(`lugar-${p}`);
      lugar.classList.toggle('ativo', Q.vez === p);
      if (p === 0) continue;
      lugar.classList.toggle('passou', Boolean(Q.ultima && Q.ultima.passou && Q.ultima.p === p));
      const costas = lugar.querySelector('.costas');
      costas.classList.toggle('vazio', !n);
      costas.querySelector('b').textContent = n;
      costas.setAttribute('aria-label', `${n} cartas`);
    }

    const semJogada = Q.vez === 0 && !jogadasLegais(0).length;
    let estado = '';
    if (Q.vez === 0) {
      if (semJogada) estado = '';
      else if (PALOS.every((s) => !Q.mesa[s])) estado = 'Tens o 5 de ouros: joga-o para começar';
      else estado = 'É a tua vez: joga uma carta que encaixe na mesa';
    } else if (Q.vez > 0) {
      estado = `Joga ${o(Q.vez)} ${JOGADORES[Q.vez]}…`;
    } else if (Q.fim) {
      estado = Q.vencedor === 0 ? 'Ficaste sem cartas!' : `${O(Q.vencedor)} ${JOGADORES[Q.vencedor]} ficou sem cartas`;
    }
    // Sem jogada possível, o botão de passar ocupa o lugar da linha de estado.
    $('estado').textContent = estado;
    $('estado').hidden = semJogada;
    $('btn-passar').hidden = !semJogada;

    desenharTabuleiro();
    desenharMao();
  }

  function fazerJogada(p, carta) {
    jogar(p, carta);
    desenhar();
    if (Q.fim) depois(1100, fimDaRonda); else continuar();
  }

  function continuar() {
    if (Q.vez <= 0) return;
    const p = Q.vez;
    depois(ESPERA_IA, () => {
      if (jogadasLegais(p).length) return fazerJogada(p, escolherCarta(p));
      passar(p);
      desenhar(); // mostra «Passo» junto ao jogador
      depois(ESPERA_PASSO - ESPERA_IA > 0 ? ESPERA_PASSO - ESPERA_IA : 0, continuar);
    });
  }

  let acabou = false;
  function fimDaRonda() {
    acabou = fimDeJogo();
    const v = Q.vencedor;
    const ganhei = v === 0;
    const sobram = Q.maos[0].length;

    let estado = ganhei ? 'vitoria' : 'derrota';
    let titulo = ganhei ? 'Ganhaste a ronda!' : `${O(v)} ${JOGADORES[v]} ganhou a ronda`;
    let texto = ganhei
      ? 'Foste o primeiro a ficar sem cartas.'
      : `${O(v)} ${JOGADORES[v]} ficou sem cartas primeiro. Ficaste com ${sobram === 1 ? '1 carta' : sobram + ' cartas'} na mão.`;
    if (acabou) {
      estado = ganhei ? 'campeao' : 'eliminado';
      titulo = ganhei ? 'Vitória! Ganhaste o jogo!' : `Derrota — ${o(v)} ${JOGADORES[v]} ganhou o jogo`;
      texto = `${ganhei ? 'Chegaste' : `${O(v)} ${JOGADORES[v]} chegou`} às ${RONDAS_PARA_GANHAR} rondas ganhas.`;
    }

    const linhas = [0, 1, 2, 3]
      .map((p) => ({ nome: JOGADORES[p], mais: p === v ? 1 : 0, etiqueta: p === v ? '🏆' : '', total: Q.vitorias[p], eu: p === 0, limite: RONDAS_PARA_GANHAR }))
      .sort((a, b) => b.total - a.total);

    for (let p = 0; p < 4; p++) $(`total-${p}`).textContent = Q.vitorias[p];
    if (acabou) { try { localStorage.removeItem(CHAVE); } catch { /* ignora */ } }
    else guardar();

    mostrarFim({ estado, titulo, texto, linhas, botao: acabou ? 'Novo jogo' : 'Próxima ronda' });
  }

  function comecarRonda() {
    epoca++;
    novaRonda();
    desenhar();
    Cartas.darCartas($('mao'));
    continuar();
  }

  function novoJogo() {
    Q.vitorias = [0, 0, 0, 0];
    acabou = false;
    guardar();
    comecarRonda();
  }

  $('btn-passar').addEventListener('click', () => {
    if (Q.vez !== 0 || jogadasLegais(0).length) return;
    passar(0);
    desenhar();
    continuar();
  });

  $('fim-btn').addEventListener('click', () => {
    $('dlg-fim').close();
    if (acabou) novoJogo(); else comecarRonda();
  });
  $('dlg-fim').addEventListener('cancel', (e) => { e.preventDefault(); $('fim-btn').click(); });

  $('btn-novo').addEventListener('click', () => {
    const aMeio = Q.vitorias.some((v) => v > 0) || !PALOS.every((s) => !Q.mesa[s]);
    if (!aMeio || confirm('Começar um jogo novo? O resultado atual será apagado.')) novoJogo();
  });

  $('btn-regras').addEventListener('click', () => $('dlg-regras').showModal());
  $('dlg-regras').addEventListener('click', (e) => { if (e.target === e.currentTarget) e.currentTarget.close(); });

  construirTabuleiro();
  carregar();
  comecarRonda();
})();
