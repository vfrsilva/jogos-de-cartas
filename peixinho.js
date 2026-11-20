'use strict';

/* =====================================================================
   Peixinho — motor do jogo (4 jogadores, cada um por si)
   Lugares: 0 = tu (baixo), 1 = direita, 2 = cima, 3 = esquerda.
   Um «peixinho» são as 4 cartas do mesmo valor. Ganha quem fizer mais.
   ===================================================================== */

const { nomeCarta, baralhar, elCarta, darCartas } =
  typeof require !== 'undefined' ? require('./cartas.js') : Cartas;

const ORDEM = ['ace', 'king', 'queen', 'jack', '10', '9', '8', '7', '6', '5', '4', '3', '2'];
const PLURAL = {
  ace: 'Ases', king: 'Reis', queen: 'Damas', jack: 'Valetes', 10: 'Dez', 9: 'Noves', 8: 'Oitos',
  7: 'Setes', 6: 'Seis', 5: 'Cincos', 4: 'Quatros', 3: 'Três', 2: 'Dois',
};
const SIMBOLO = { ace: 'Á', king: 'R', queen: 'D', jack: 'V' };
const JOGADORES = ['Noah', 'Duarte', 'Tomas', 'Sira'];
const CARTAS_INICIAIS = 5;
const TOTAL_PEIXINHOS = ORDEM.length;

const P = {
  maos: [[], [], [], []],
  lago: [], // monte de onde se pesca
  peixinhos: [[], [], [], []], // valores completos por jogador
  vez: -1,
  inicio: 0,
  fim: false,
  // Memória dos adversários: o que se sabe pelas perguntas feitas à mesa.
  sabe: [new Set(), new Set(), new Set(), new Set()], // valores que o jogador tem de certeza
  negou: [new Set(), new Set(), new Set(), new Set()], // valores que disse não ter (até voltar a pescar)
};

const seguinte = (p) => (p + 1) % 4;
const feitos = () => P.peixinhos.reduce((t, l) => t + l.length, 0);
const alvosDe = (p) => [0, 1, 2, 3].filter((q) => q !== p && P.maos[q].length);

function novaPartida() {
  const b = baralhar(ORDEM);
  P.maos = [0, 1, 2, 3].map(() => b.splice(-CARTAS_INICIAIS));
  P.lago = b;
  P.peixinhos = [[], [], [], []];
  P.sabe = [0, 1, 2, 3].map(() => new Set());
  P.negou = [0, 1, 2, 3].map(() => new Set());
  P.fim = false;
  P.vez = P.inicio;
  P.inicio = seguinte(P.inicio);
  for (let p = 0; p < 4; p++) verificar(p);
}

function pescar(p) {
  const c = P.lago.pop();
  P.maos[p].push(c);
  P.negou[p].clear(); // a carta nova pode ser qualquer uma
  return c;
}

/** Baixa os valores de que o jogador já tem as 4 cartas. Devolve os valores completados. */
function verificar(p) {
  const novos = [];
  for (const r of ORDEM) {
    if (P.maos[p].filter((c) => c.r === r).length === 4) {
      P.maos[p] = P.maos[p].filter((c) => c.r !== r);
      P.peixinhos[p].push(r);
      P.sabe[p].delete(r);
      novos.push(r);
    }
  }
  return novos;
}

/**
 * O jogador p pede ao alvo as cartas de valor r (tem de ter pelo menos uma).
 * - Se o alvo tiver, dá todas e p joga outra vez.
 * - Se não, p pesca uma carta; se for do valor pedido joga outra vez, senão passa a vez.
 */
function pedir(p, alvo, r) {
  if (p !== P.vez || alvo === p || !P.maos[alvo].length || !P.maos[p].some((c) => c.r === r)) {
    throw new Error('Pedido inválido');
  }
  P.sabe[p].add(r);
  const dadas = P.maos[alvo].filter((c) => c.r === r);
  if (dadas.length) {
    P.maos[alvo] = P.maos[alvo].filter((c) => c.r !== r);
    P.maos[p].push(...dadas);
    P.sabe[alvo].delete(r);
    return { tipo: 'deu', n: dadas.length, feitos: verificar(p) };
  }
  P.negou[alvo].add(r);
  if (!P.lago.length) {
    P.vez = seguinte(p);
    return { tipo: 'nada', feitos: [] };
  }
  const carta = pescar(p);
  const acertou = carta.r === r;
  const novos = verificar(p);
  if (!acertou) P.vez = seguinte(p);
  return { tipo: 'pescou', carta, acertou, feitos: novos };
}

/**
 * Deixa o jogo pronto para o próximo pedido: quem está sem cartas pesca uma (ou é saltado
 * se o lago estiver vazio) e deteta o fim do jogo. Devolve o que aconteceu, para mostrar.
 */
function prepararVez() {
  const acontecimentos = [];
  for (let i = 0; i < 16; i++) {
    if (feitos() === TOTAL_PEIXINHOS) break;
    const p = P.vez;
    if (!P.maos[p].length) {
      if (!P.lago.length) { P.vez = seguinte(p); continue; }
      acontecimentos.push({ p, tipo: 'repor', carta: pescar(p), feitos: [] });
    }
    if (!alvosDe(p).length) {
      // Ninguém tem cartas para dar: pesca uma e passa a vez.
      if (P.lago.length) acontecimentos.push({ p, tipo: 'sozinho', carta: pescar(p), feitos: verificar(p) });
      P.vez = seguinte(p);
      continue;
    }
    return acontecimentos;
  }
  P.fim = true;
  P.vez = -1;
  return acontecimentos;
}

/* ---------------------------------------------------------------------
   Inteligência dos adversários
   --------------------------------------------------------------------- */

function escolherPedido(p) {
  const conta = {};
  for (const c of P.maos[p]) conta[c.r] = (conta[c.r] || 0) + 1;
  const valores = Object.keys(conta).sort((a, b) => conta[b] - conta[a] || Math.random() - 0.5);
  const alvos = alvosDe(p);
  // Primeiro, pedir a quem já se sabe que tem.
  for (const r of valores) {
    const quem = alvos.find((q) => P.sabe[q].has(r));
    if (quem !== undefined) return { alvo: quem, r };
  }
  // Senão, o valor de que tem mais cartas, a alguém que ainda não disse que não tem.
  const r = valores[0];
  const possiveis = alvos.filter((q) => !P.negou[q].has(r));
  const lista = possiveis.length ? possiveis : alvos;
  return { alvo: lista[Math.floor(Math.random() * lista.length)], r };
}

if (typeof module !== 'undefined') {
  module.exports = { P, novaPartida, pedir, prepararVez, escolherPedido, feitos, TOTAL_PEIXINHOS };
}

/* =====================================================================
   Interface
   ===================================================================== */

if (typeof document !== 'undefined') (() => {
  const $ = (id) => document.getElementById(id);
  const ESPERA_PERGUNTA = 1300;
  const ESPERA_RESPOSTA = 1600;

  const O = (p) => (p === 3 ? 'A' : 'O');
  const ao = (p) => (p === 3 ? 'à' : 'ao');
  const simbolo = (r) => SIMBOLO[r] || r;

  let escolhido = null; // valor selecionado na tua mão
  let ocupado = false; // a mostrar uma jogada: não aceita toques
  let novoValor = null; // valor da carta que acabaste de pescar (para animar)
  let versaoFalas = 0;
  const falas = [];

  let epoca = 0; // invalida temporizadores quando se recomeça
  const depois = (ms, fn) => {
    const e = epoca;
    setTimeout(() => { if (e === epoca) fn(); }, ms);
  };

  function dizer(texto, tipo = '') {
    falas.push({ texto, tipo });
    if (falas.length > 3) falas.shift();
    versaoFalas++;
  }

  function frasePedido(p, alvo, r) {
    if (p === 0) return `Pediste ${PLURAL[r]} ${ao(alvo)} ${JOGADORES[alvo]}`;
    if (alvo === 0) return `${O(p)} ${JOGADORES[p]} pediu-te ${PLURAL[r]}`;
    return `${O(p)} ${JOGADORES[p]} pediu ${PLURAL[r]} ${ao(alvo)} ${JOGADORES[alvo]}`;
  }

  function fraseResposta(p, alvo, res) {
    if (res.tipo === 'deu') {
      const n = res.n === 1 ? '1 carta' : `${res.n} cartas`;
      if (p === 0) return ` e recebeste ${n}. Jogas outra vez!`;
      return alvo === 0 ? ` e deste-lhe ${n}.` : ` e recebeu ${n}.`;
    }
    if (res.tipo === 'nada') return ' — não tem, e o lago está vazio.';
    if (p === 0) return ` — vai ao peixinho! Pescaste: ${nomeCarta(res.carta)}.${res.acertou ? ' Jogas outra vez!' : ''}`;
    return ` — vai ao peixinho!${res.acertou ? ' Pescou a carta que pediu e joga outra vez.' : ''}`;
  }

  function anunciarPeixinhos(p, valores) {
    for (const r of valores) {
      dizer(p === 0 ? `Fizeste um peixinho de ${PLURAL[r]}! 🐟` : `${O(p)} ${JOGADORES[p]} fez um peixinho de ${PLURAL[r]}! 🐟`, 'peixe');
    }
  }

  function desenharMao() {
    const minhaVez = P.vez === 0 && !ocupado;
    const mao = P.maos[0];
    const grupos = ORDEM.filter((r) => mao.some((c) => c.r === r)).map((r) => mao.filter((c) => c.r === r));
    $('mao').replaceChildren(...grupos.map((cartas) => {
      const r = cartas[0].r;
      const b = elCarta(cartas[0], 'button');
      b.type = 'button';
      b.classList.add(`pilha-${cartas.length}`);
      b.setAttribute('aria-label', `${PLURAL[r]}: ${cartas.length === 1 ? '1 carta' : cartas.length + ' cartas'}`);
      if (cartas.length > 1) {
        const n = document.createElement('b');
        n.className = 'conta';
        n.textContent = `×${cartas.length}`;
        b.append(n);
      }
      if (r === novoValor) b.classList.add('nova');
      if (minhaVez) {
        b.classList.add('jogavel');
        b.classList.toggle('escolhida', r === escolhido);
        b.setAttribute('aria-pressed', r === escolhido);
        b.addEventListener('click', () => {
          escolhido = escolhido === r ? null : r;
          desenhar();
        });
      } else {
        b.disabled = true;
      }
      return b;
    }));
    novoValor = null; // anima só uma vez
  }

  /** Quadro no centro: a quem pedir o valor escolhido. */
  function desenharPedido() {
    const quadro = $('pedido');
    quadro.hidden = !(P.vez === 0 && !ocupado);
    if (quadro.hidden) return;
    $('pedido-titulo').textContent = escolhido ? `Pedir ${PLURAL[escolhido]} a…` : 'Toca numa carta da tua mão';
    $('pedido-alvos').replaceChildren(...[3, 2, 1].map((q) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'principal';
      b.textContent = JOGADORES[q];
      b.disabled = !escolhido || !P.maos[q].length;
      b.addEventListener('click', () => { if (escolhido && P.vez === 0 && !ocupado) executar(0, q, escolhido); });
      return b;
    }));
  }

  let falasDesenhadas = -1;
  function desenharFalas() {
    if (falasDesenhadas === versaoFalas) return;
    falasDesenhadas = versaoFalas;
    $('falas').replaceChildren(...falas.map((f) => {
      const li = document.createElement('li');
      if (f.tipo) li.className = f.tipo;
      li.textContent = f.texto;
      return li;
    }));
  }

  function desenhar() {
    for (let p = 0; p < 4; p++) {
      const n = P.peixinhos[p].length;
      $(`total-${p}`).textContent = n;
      $(`ronda-${p}`).textContent = n ? P.peixinhos[p].map(simbolo).join(' ') : '—';
      const lugar = $(`lugar-${p}`);
      lugar.classList.toggle('ativo', P.vez === p);
      if (p === 0) continue;
      lugar.querySelector('.nome').innerHTML = JOGADORES[p] + (n ? ` <small>🐟 ${n}</small>` : '');
      const costas = lugar.querySelector('.costas');
      costas.classList.toggle('vazio', !P.maos[p].length);
      costas.querySelector('b').textContent = P.maos[p].length;
      costas.setAttribute('aria-label', `${P.maos[p].length} cartas`);
    }

    const monte = $('lago-monte');
    monte.classList.toggle('vazio', !P.lago.length);
    $('lago-n').textContent = P.lago.length;
    $('lago-texto').textContent = P.lago.length ? 'Lago' : 'Lago vazio';

    let estado = '';
    if (P.vez === 0 && !ocupado) estado = escolhido ? `A quem pedes ${PLURAL[escolhido]}?` : 'É a tua vez — escolhe o que queres pedir';
    else if (P.vez > 0) estado = `Joga ${O(P.vez).toLowerCase()} ${JOGADORES[P.vez]}…`;
    $('estado').textContent = estado;

    desenharFalas();
    desenharPedido();
    desenharMao();
  }

  /** Mostra a pergunta, depois a resposta, e só então avança. */
  function executar(p, alvo, r) {
    ocupado = true;
    escolhido = null;
    const pergunta = frasePedido(p, alvo, r);
    dizer(`${pergunta}…`);
    desenhar();
    depois(p === 0 ? 500 : ESPERA_PERGUNTA, () => {
      const res = pedir(p, alvo, r);
      falas.pop();
      dizer(pergunta + fraseResposta(p, alvo, res), res.tipo === 'deu' ? 'bom' : 'mau');
      anunciarPeixinhos(p, res.feitos);
      if (p === 0 && res.carta) novoValor = res.carta.r;
      desenhar();
      depois(ESPERA_RESPOSTA, avancar);
    });
  }

  function avancar() {
    for (const a of prepararVez()) {
      if (a.tipo === 'repor') {
        dizer(a.p === 0 ? 'Ficaste sem cartas e pescaste uma.' : `${O(a.p)} ${JOGADORES[a.p]} ficou sem cartas e pescou uma.`);
      } else {
        dizer(a.p === 0 ? 'Ninguém tem cartas para te dar: pescaste uma e passas a vez.'
          : `Ninguém tem cartas para dar: ${O(a.p).toLowerCase()} ${JOGADORES[a.p]} pescou uma e passa a vez.`);
      }
      if (a.p === 0) novoValor = a.carta.r;
      anunciarPeixinhos(a.p, a.feitos);
    }
    ocupado = false;
    desenhar();
    continuar();
  }

  function continuar() {
    if (P.fim) return depois(500, fimDoJogo);
    if (P.vez > 0) {
      ocupado = true;
      const p = P.vez;
      depois(700, () => {
        const { alvo, r } = escolherPedido(p);
        executar(p, alvo, r);
      });
    }
  }

  function fimDoJogo() {
    const totais = P.peixinhos.map((l) => l.length);
    const maximo = Math.max(...totais);
    const vencedores = [0, 1, 2, 3].filter((p) => totais[p] === maximo);
    const meus = totais[0];
    const plural = (n) => (n === 1 ? '1 peixinho' : `${n} peixinhos`);

    let estado = 'eliminado';
    let titulo = `Derrota — ${JOGADORES[vencedores[0]]} ganhou o jogo`;
    let texto = `Fizeste ${plural(meus)}; ${O(vencedores[0]).toLowerCase()} ${JOGADORES[vencedores[0]]} fez ${maximo}.`;
    if (vencedores.includes(0) && vencedores.length === 1) {
      estado = 'campeao'; titulo = 'Vitória! Ganhaste o jogo!';
      texto = `Fizeste ${plural(meus)}, mais do que qualquer outro jogador.`;
    } else if (vencedores.includes(0)) {
      estado = 'vitoria'; titulo = 'Empate no primeiro lugar!';
      texto = `Fizeste ${plural(meus)}, tantos como ${vencedores.filter((p) => p).map((p) => `${O(p).toLowerCase()} ${JOGADORES[p]}`).join(' e ')}.`;
    } else if (vencedores.length > 1) {
      titulo = 'Derrota — empate entre adversários';
      texto = `Fizeste ${plural(meus)}; ${vencedores.map((p) => JOGADORES[p]).join(' e ')} fizeram ${maximo} cada.`;
    }

    const linhas = [0, 1, 2, 3]
      .map((p) => ({ nome: JOGADORES[p], mais: totais[p], etiqueta: totais[p] ? '🐟' : '', total: totais[p], eu: p === 0, limite: TOTAL_PEIXINHOS }))
      .sort((a, b) => b.total - a.total);
    mostrarFim({ estado, icone: estado === 'eliminado' ? '🎣' : '🐟', titulo, texto, linhas, botao: 'Novo jogo' });
  }

  function comecar() {
    epoca++;
    escolhido = null;
    ocupado = false;
    falas.length = 0;
    novaPartida();
    dizer(`Cada jogador recebe ${CARTAS_INICIAIS} cartas. Junta as 4 cartas do mesmo valor para fazer um peixinho.`);
    desenhar();
    darCartas($('mao'));
    avancar();
  }

  $('fim-btn').addEventListener('click', () => { $('dlg-fim').close(); comecar(); });
  $('dlg-fim').addEventListener('cancel', (e) => { e.preventDefault(); $('fim-btn').click(); });

  $('btn-novo').addEventListener('click', () => {
    const aMeio = feitos() > 0 || P.lago.length < 52 - 4 * CARTAS_INICIAIS;
    if (!aMeio || confirm('Começar um jogo novo? O jogo atual será apagado.')) comecar();
  });

  $('btn-regras').addEventListener('click', () => $('dlg-regras').showModal());
  $('dlg-regras').addEventListener('click', (e) => { if (e.target === e.currentTarget) e.currentTarget.close(); });

  comecar();
})();
