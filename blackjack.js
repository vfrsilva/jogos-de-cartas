'use strict';

/* =====================================================================
   Blackjack — motor do jogo (4 jogadores contra a banca)
   Lugares: 0 = tu, 1 = direita, 2 = meio, 3 = esquerda.
   Cada jogador começa com 1000 pontos e aposta-os contra a banca.
   Ganha quem tiver mais pontos ao fim de 10 rondas.
   ===================================================================== */

const { baralhar, elCarta } = typeof require !== 'undefined' ? require('./cartas.js') : Cartas;

const ORDEM = ['ace', 'king', 'queen', 'jack', '10', '9', '8', '7', '6', '5', '4', '3', '2'];
const JOGADORES = ['Noah', 'Duarte', 'Tomas', 'Sira'];
const SALDO_INICIAL = 1000;
const RONDAS = 10;
const APOSTA_MIN = 10;
// Parte do saldo que cada adversário aposta: o Duarte é prudente, a Sira arrisca.
const OUSADIA = [0, 0.05, 0.1, 0.2];

const B = {
  saldos: [SALDO_INICIAL, SALDO_INICIAL, SALDO_INICIAL, SALDO_INICIAL],
  ronda: 0, // rondas já terminadas
  fase: 'aposta', // 'aposta' | 'jogar' | 'banca' | 'fim-ronda' | 'fim'
  apostas: [0, 0, 0, 0],
  maos: [[], [], [], []],
  estados: ['espera', 'espera', 'espera', 'espera'], // 'espera' | 'joga' | 'ficou' | 'rebentou' | 'blackjack' | 'fora'
  banca: [],
  escondida: true, // a segunda carta da banca ainda está virada para baixo
  vez: -1,
  baralho: [],
  ganhos: null, // pontos ganhos (ou perdidos) por cada jogador na ronda
};

const pontosCarta = (c) => (c.r === 'ace' ? 11 : ['king', 'queen', 'jack'].includes(c.r) ? 10 : Number(c.r));

/** Valor de uma mão: o Ás vale 11, ou 1 se com 11 passasse dos 21. `suave` = há um Ás a valer 11. */
function valor(mao) {
  let total = 0;
  let ases = 0;
  for (const c of mao) {
    total += pontosCarta(c);
    if (c.r === 'ace') ases++;
  }
  while (total > 21 && ases) { total -= 10; ases--; }
  return { total, suave: ases > 0 };
}

const eBlackjack = (mao) => mao.length === 2 && valor(mao).total === 21;
const apostaMinima = (p) => Math.min(APOSTA_MIN, B.saldos[p]);
const apostaValida = (p, v) => Number.isInteger(v) && v >= apostaMinima(p) && v <= B.saldos[p] && v > 0;

function limparMesa() {
  B.fase = 'aposta';
  B.apostas = [0, 0, 0, 0];
  B.maos = [[], [], [], []];
  B.estados = B.saldos.map((s) => (s > 0 ? 'espera' : 'fora'));
  B.banca = [];
  B.escondida = true;
  B.vez = -1;
  B.ganhos = null;
}

function novoJogo() {
  B.saldos = [SALDO_INICIAL, SALDO_INICIAL, SALDO_INICIAL, SALDO_INICIAL];
  B.ronda = 0;
  limparMesa();
}

function apostaBot(p) {
  const a = Math.round((B.saldos[p] * OUSADIA[p]) / 10) * 10;
  return Math.max(apostaMinima(p), Math.min(B.saldos[p], a));
}

/** Passa a vez ao jogador seguinte que ainda esteja a jogar; se não houver, joga a banca. */
function proximaVez() {
  for (let p = B.vez + 1; p < 4; p++) {
    if (B.estados[p] === 'joga') { B.vez = p; return; }
  }
  B.vez = -1;
  B.fase = 'banca';
}

/** Começa a ronda com a tua aposta: os adversários apostam e dão-se 2 cartas a cada um e à banca. */
function iniciarRonda(aposta) {
  if (B.fase !== 'aposta' || !apostaValida(0, aposta)) throw new Error('Aposta inválida');
  B.baralho = baralhar(ORDEM);
  const ativos = [0, 1, 2, 3].filter((p) => B.estados[p] !== 'fora');
  for (const p of ativos) B.apostas[p] = p === 0 ? aposta : apostaBot(p);
  for (let i = 0; i < 2; i++) {
    for (const p of ativos) B.maos[p].push(B.baralho.pop());
    B.banca.push(B.baralho.pop());
  }
  for (const p of ativos) B.estados[p] = eBlackjack(B.maos[p]) ? 'blackjack' : 'joga';
  B.fase = 'jogar';
  B.vez = -1;
  proximaVez();
}

function validarVez(p) {
  if (B.fase !== 'jogar' || B.vez !== p) throw new Error('Não é a vez deste jogador');
}

/** Pede mais uma carta. Passa dos 21 = rebenta; com 21 fica automaticamente. */
function pedir(p) {
  validarVez(p);
  const c = B.baralho.pop();
  B.maos[p].push(c);
  const { total } = valor(B.maos[p]);
  if (total >= 21) {
    B.estados[p] = total > 21 ? 'rebentou' : 'ficou';
    proximaVez();
  }
  return c;
}

function ficar(p) {
  validarVez(p);
  B.estados[p] = 'ficou';
  proximaVez();
}

const podeDobrar = (p) => B.fase === 'jogar' && B.vez === p && B.maos[p].length === 2 && B.saldos[p] >= B.apostas[p] * 2;

/** Dobra a aposta, recebe uma única carta e fica. */
function dobrar(p) {
  if (!podeDobrar(p)) throw new Error('Não pode dobrar');
  B.apostas[p] *= 2;
  const c = B.baralho.pop();
  B.maos[p].push(c);
  B.estados[p] = valor(B.maos[p]).total > 21 ? 'rebentou' : 'ficou';
  proximaVez();
  return c;
}

function revelar() {
  B.escondida = false;
}

/** A banca pede até ter 17 ou mais — mas só se ainda houver alguém por bater. */
const bancaDevePedir = () => B.fase === 'banca' && B.estados.includes('ficou') && valor(B.banca).total < 17;

function bancaTira() {
  if (!bancaDevePedir()) throw new Error('A banca não pode pedir');
  const c = B.baralho.pop();
  B.banca.push(c);
  return c;
}

/** Faz as contas da ronda: paga ou cobra as apostas e decide se o jogo continua. */
function liquidar() {
  if (B.fase !== 'banca' || bancaDevePedir()) throw new Error('A ronda ainda não acabou');
  B.escondida = false;
  const tb = valor(B.banca).total;
  const bjBanca = eBlackjack(B.banca);
  B.ganhos = [0, 1, 2, 3].map((p) => {
    const a = B.apostas[p];
    const e = B.estados[p];
    if (e === 'fora') return 0;
    if (e === 'rebentou') return -a;
    if (e === 'blackjack') return bjBanca ? 0 : Math.round(a * 1.5);
    if (bjBanca) return -a;
    const t = valor(B.maos[p]).total;
    if (tb > 21 || t > tb) return a;
    return t < tb ? -a : 0;
  });
  for (let p = 0; p < 4; p++) B.saldos[p] += B.ganhos[p];
  B.ronda++;
  B.fase = B.ronda >= RONDAS || B.saldos[0] <= 0 ? 'fim' : 'fim-ronda';
  return B.ganhos;
}

function proximaRonda() {
  if (B.fase !== 'fim-ronda') throw new Error('A ronda ainda não acabou');
  limparMesa();
}

/* ---------------------------------------------------------------------
   Inteligência dos adversários (estratégia básica simplificada)
   --------------------------------------------------------------------- */

function decidirBot(p) {
  const banca = pontosCarta(B.banca[0]); // a carta que a banca tem à vista
  const { total, suave } = valor(B.maos[p]);
  if (podeDobrar(p) && !suave && (total === 11 || (total === 10 && banca < 10))) return 'dobrar';
  if (suave) return total <= 17 || (total === 18 && banca >= 9) ? 'pedir' : 'ficar';
  if (total <= 11) return 'pedir';
  if (total >= 17) return 'ficar';
  if (total === 12) return banca >= 4 && banca <= 6 ? 'ficar' : 'pedir';
  return banca <= 6 ? 'ficar' : 'pedir';
}

if (typeof module !== 'undefined') {
  module.exports = {
    B, SALDO_INICIAL, RONDAS, valor, eBlackjack, novoJogo, iniciarRonda, pedir, ficar, dobrar, podeDobrar,
    revelar, bancaDevePedir, bancaTira, liquidar, proximaRonda, decidirBot, apostaValida,
  };
}

/* =====================================================================
   Interface
   ===================================================================== */

if (typeof document !== 'undefined') (() => {
  const $ = (id) => document.getElementById(id);
  const CHAVE = 'blackjack-v1';
  const ESPERA = 850;
  const FICHAS = [10, 50, 100, 500];

  const O = (p) => (p === 3 ? 'A' : 'O');
  const sinal = (g) => (g > 0 ? `+${g}` : g < 0 ? `−${-g}` : '0');

  let aposta = 50; // a aposta que estás a preparar
  let ocupado = false; // a mostrar uma jogada: não aceita toques
  let vistos = {}; // quantas cartas já foram desenhadas em cada zona (para animar só as novas)

  let epoca = 0; // invalida temporizadores quando se recomeça
  const depois = (ms, fn) => {
    const e = epoca;
    setTimeout(() => { if (e === epoca) fn(); }, ms);
  };

  function guardar() {
    try {
      if (B.fase === 'fim') localStorage.removeItem(CHAVE);
      else localStorage.setItem(CHAVE, JSON.stringify({ saldos: B.saldos, ronda: B.ronda }));
    } catch { /* sem armazenamento: joga-se na mesma */ }
  }

  function carregar() {
    try {
      const d = JSON.parse(localStorage.getItem(CHAVE));
      const ok = d && Array.isArray(d.saldos) && d.saldos.length === 4
        && d.saldos.every((s) => Number.isInteger(s) && s >= 0) && d.saldos[0] > 0
        && Number.isInteger(d.ronda) && d.ronda > 0 && d.ronda < RONDAS;
      if (!ok) return false;
      B.saldos = d.saldos;
      B.ronda = d.ronda;
      limparMesa();
      return true;
    } catch { return false; }
  }

  /* ---------- Desenho ---------- */

  function desenharCartas(zona, cartas, escondida = false) {
    const antes = vistos[zona] || 0;
    const virada = vistos[`${zona}-virada`] && !escondida; // a carta escondida acabou de ser revelada
    $(zona).replaceChildren(...cartas.map((c, i) => {
      let el;
      if (escondida && i === 1) {
        el = document.createElement('span');
        el.className = 'costas grande';
        el.setAttribute('aria-label', 'Carta virada para baixo');
      } else {
        el = elCarta(c);
      }
      if (i >= antes || (virada && i === 1)) {
        el.classList.add('nova');
        el.style.setProperty('--i', Math.max(0, i - antes));
      }
      return el;
    }));
    vistos[zona] = cartas.length;
    vistos[`${zona}-virada`] = escondida && cartas.length > 1;
  }

  function textoValor(mao) {
    const { total, suave } = valor(mao);
    if (eBlackjack(mao)) return 'Blackjack!';
    return suave && total < 21 ? `${total - 10} ou ${total}` : String(total);
  }

  function desenharValor(el, p) {
    const mao = B.maos[p];
    let texto = '';
    let classe = '';
    if (mao.length) {
      const e = B.estados[p];
      texto = e === 'ficou' || e === 'rebentou' ? String(valor(mao).total) : textoValor(mao);
      if (e === 'rebentou') { texto = `💥 ${texto}`; classe = 'mau'; }
      if (e === 'blackjack') classe = 'ouro';
      if (B.ganhos) {
        const g = B.ganhos[p];
        if (p > 0) texto = String(valor(mao).total); // os adversários têm pouco espaço
        texto += g ? ` · ${sinal(g)}` : ' · empate';
        classe = g > 0 ? 'bom' : g < 0 ? 'mau' : '';
      }
    }
    el.textContent = texto;
    el.className = `valor ${classe}`;
  }

  function desenharBanca() {
    desenharCartas('cartas-banca', B.banca, B.escondida);
    const el = $('valor-banca');
    let texto = '';
    let classe = '';
    if (B.banca.length) {
      if (B.escondida) {
        texto = String(pontosCarta(B.banca[0]));
      } else {
        const { total } = valor(B.banca);
        texto = textoValor(B.banca);
        if (total > 21) { texto = `💥 ${total}`; classe = 'mau'; }
        if (eBlackjack(B.banca)) classe = 'ouro';
      }
    }
    el.textContent = texto;
    el.className = `valor ${classe}`;
    $('banca').classList.toggle('ativo', B.fase === 'banca');
  }

  function botao(texto, classe, aoClicar, desligado = false) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = classe;
    b.textContent = texto;
    b.disabled = desligado;
    b.addEventListener('click', aoClicar);
    return b;
  }

  function desenharControlos() {
    const caixa = $('controlos');
    caixa.classList.toggle('apostar', B.fase === 'aposta');
    if (B.fase === 'aposta') {
      const saldo = B.saldos[0];
      const fichas = document.createElement('div');
      fichas.className = 'fichas';
      fichas.append(
        botao('Limpar', 'secundario', () => { aposta = 0; desenhar(); }, !aposta),
        ...FICHAS.map((v) => {
          const b = botao(`+${v}`, `ficha f${v}`, () => { aposta = Math.min(saldo, aposta + v); desenhar(); }, aposta + v > saldo);
          b.setAttribute('aria-label', `Apostar mais ${v} pontos`);
          return b;
        }),
        botao('Tudo', 'secundario', () => { aposta = saldo; desenhar(); }, aposta === saldo),
      );
      const linha = document.createElement('div');
      linha.className = 'aposta-linha';
      const mostrador = document.createElement('span');
      mostrador.className = 'aposta-valor';
      mostrador.innerHTML = `Aposta <b>${aposta}</b>`;
      linha.append(mostrador, botao('Dar cartas', 'principal', dar, !apostaValida(0, aposta)));
      caixa.replaceChildren(fichas, linha);
    } else if (B.fase === 'fim-ronda') {
      caixa.replaceChildren(botao('Próxima ronda ›', 'principal', seguinte));
    } else if (B.fase === 'fim') {
      caixa.replaceChildren(botao('Ver classificação', 'principal', fimDoJogo));
    } else {
      const parado = !(B.fase === 'jogar' && B.vez === 0 && !ocupado);
      caixa.replaceChildren(
        botao('Pedir carta', 'principal', () => jogar('pedir'), parado),
        botao('Ficar', 'principal ficar', () => jogar('ficar'), parado),
        botao('Dobrar', 'secundario', () => jogar('dobrar'), parado || !podeDobrar(0)),
      );
    }
  }

  function textoEstado() {
    if (B.fase === 'aposta') return `Ronda ${B.ronda + 1} de ${RONDAS} — faz a tua aposta`;
    if (B.fase === 'jogar') {
      if (B.vez !== 0) return `Joga ${O(B.vez).toLowerCase()} ${JOGADORES[B.vez]}…`;
      return ocupado ? 'A dar cartas…' : `É a tua vez — tens ${textoValor(B.maos[0])}`;
    }
    if (B.fase === 'banca') return 'Joga a banca…';
    const g = B.ganhos[0];
    const meu = valor(B.maos[0]).total;
    const tb = valor(B.banca).total;
    let motivo = `${meu} contra ${tb}`;
    if (B.estados[0] === 'rebentou') motivo = `Rebentaste com ${meu}`;
    else if (B.estados[0] === 'blackjack') motivo = 'Blackjack!';
    else if (eBlackjack(B.banca)) motivo = 'A banca fez blackjack';
    else if (tb > 21) motivo = 'A banca rebentou';
    if (g > 0) return `${motivo} — ganhaste ${g} pontos!`;
    if (g < 0) return `${motivo} — perdeste ${-g} pontos.`;
    return `${motivo} — empate.`;
  }

  function desenhar() {
    const acabada = B.fase === 'fim-ronda' || B.fase === 'fim';
    $('ronda-txt').textContent = `ronda ${acabada ? B.ronda : B.ronda + 1}/${RONDAS}`;
    desenharBanca();

    for (let p = 0; p < 4; p++) {
      const fora = B.estados[p] === 'fora';
      $(`total-${p}`).textContent = B.saldos[p];
      const ronda = $(`ronda-${p}`);
      const g = B.ganhos ? B.ganhos[p] : 0;
      ronda.textContent = fora ? 'fora' : B.ganhos ? sinal(g) : B.apostas[p] ? `● ${B.apostas[p]}` : '—';
      ronda.className = `ronda${g > 0 ? ' ganho' : g < 0 ? ' perda' : ''}`;

      const lugar = $(`lugar-${p}`);
      lugar.classList.toggle('ativo', B.fase === 'jogar' && B.vez === p && !(p === 0 && ocupado));
      desenharCartas(p === 0 ? 'mao' : `cartas-${p}`, B.maos[p]);
      desenharValor($(`valor-${p}`), p);
      if (p === 0) continue;
      lugar.classList.toggle('fora', fora);
      lugar.querySelector('.nome').innerHTML = JOGADORES[p] + (fora ? ' <small>sem pontos</small>' : B.apostas[p] ? ` <small>● ${B.apostas[p]}</small>` : '');
    }

    $('mao').hidden = B.fase === 'aposta';
    $('valor-0').hidden = B.fase === 'aposta';
    $('estado').textContent = textoEstado();
    desenharControlos();
  }

  /* ---------- Fluxo ---------- */

  function dar() {
    if (B.fase !== 'aposta' || ocupado || !apostaValida(0, aposta)) return;
    iniciarRonda(aposta);
    ocupado = true;
    desenhar();
    depois(1200, continuar);
  }

  function jogar(acao) {
    if (B.fase !== 'jogar' || B.vez !== 0 || ocupado) return;
    if (acao === 'pedir') pedir(0);
    else if (acao === 'ficar') ficar(0);
    else if (podeDobrar(0)) dobrar(0);
    continuar();
  }

  /** Desenha o estado atual e faz jogar quem se segue (adversários e banca). */
  function continuar() {
    if (B.fase === 'jogar' && B.vez === 0) {
      ocupado = false;
      desenhar();
      return;
    }
    ocupado = true;
    desenhar();
    if (B.fase === 'jogar') {
      const p = B.vez;
      depois(ESPERA, () => {
        const acao = decidirBot(p);
        if (acao === 'pedir') pedir(p);
        else if (acao === 'dobrar') dobrar(p);
        else ficar(p);
        continuar();
      });
    } else if (B.fase === 'banca') {
      depois(ESPERA, () => {
        revelar();
        desenhar();
        passoBanca();
      });
    }
  }

  function passoBanca() {
    depois(ESPERA, () => {
      if (bancaDevePedir()) {
        bancaTira();
        desenhar();
        passoBanca();
      } else {
        liquidar();
        guardar();
        ocupado = false;
        desenhar();
      }
    });
  }

  function prepararAposta() {
    const saldo = B.saldos[0];
    aposta = Math.max(Math.min(APOSTA_MIN, saldo), Math.min(aposta, saldo));
    vistos = {};
    ocupado = false;
    desenhar();
  }

  function seguinte() {
    if (B.fase !== 'fim-ronda') return;
    proximaRonda();
    prepararAposta();
  }

  function fimDoJogo() {
    const s = B.saldos;
    const maximo = Math.max(...s);
    const vencedores = [0, 1, 2, 3].filter((p) => s[p] === maximo);
    const melhor = vencedores[0];

    let estado = 'derrota';
    let titulo = `Derrota — ${JOGADORES[melhor]} ganhou o jogo`;
    let texto = `Acabaste com ${s[0]} pontos; ${O(melhor).toLowerCase()} ${JOGADORES[melhor]} acabou com ${maximo}.`;
    if (s[0] <= 0) {
      estado = 'eliminado'; titulo = 'Ficaste sem pontos!';
      texto = `Perdeste os ${SALDO_INICIAL} pontos em ${B.ronda === 1 ? '1 ronda' : `${B.ronda} rondas`}.`;
    } else if (vencedores.includes(0) && vencedores.length === 1) {
      estado = 'campeao'; titulo = 'Vitória! Ganhaste o jogo!';
      texto = `Acabaste com ${s[0]} pontos, mais do que qualquer outro jogador.`;
    } else if (vencedores.includes(0)) {
      estado = 'vitoria'; titulo = 'Empate no primeiro lugar!';
      texto = `Acabaste com ${s[0]} pontos, tantos como ${vencedores.filter((p) => p).map((p) => `${O(p).toLowerCase()} ${JOGADORES[p]}`).join(' e ')}.`;
    } else if (vencedores.length > 1) {
      titulo = 'Derrota — empate entre adversários';
      texto = `Acabaste com ${s[0]} pontos; ${vencedores.map((p) => JOGADORES[p]).join(' e ')} acabaram com ${maximo} cada.`;
    }

    const linhas = [0, 1, 2, 3]
      .map((p) => {
        const d = s[p] - SALDO_INICIAL;
        return { nome: JOGADORES[p], mais: Math.min(d, 0), etiqueta: sinal(d), total: s[p], eu: p === 0, limite: Math.max(maximo, SALDO_INICIAL) };
      })
      .sort((a, b) => b.total - a.total);
    mostrarFim({ estado, titulo, texto, linhas, botao: 'Novo jogo' });
  }

  function comecar(novo) {
    epoca++;
    if (novo || !carregar()) {
      novoJogo();
      try { localStorage.removeItem(CHAVE); } catch { /* ignora */ }
    }
    aposta = 50;
    prepararAposta();
  }

  $('fim-btn').addEventListener('click', () => { $('dlg-fim').close(); comecar(true); });
  $('dlg-fim').addEventListener('cancel', (e) => { e.preventDefault(); $('fim-btn').click(); });

  $('btn-novo').addEventListener('click', () => {
    const aMeio = B.ronda > 0 || B.fase !== 'aposta';
    if (!aMeio || confirm('Começar um jogo novo? O jogo atual será apagado.')) comecar(true);
  });

  $('btn-regras').addEventListener('click', () => $('dlg-regras').showModal());
  $('dlg-regras').addEventListener('click', (e) => { if (e.target === e.currentTarget) e.currentTarget.close(); });

  comecar(false);
})();
