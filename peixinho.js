'use strict';

/* =====================================================================
   Peixinho — motor do jogo (2 jogadores)
   Jogador 0 = tu, jogador 1 = computador (Duarte).
   Um «peixinho» são as 4 cartas do mesmo valor. Ganha quem fizer mais.
   ===================================================================== */

const { NAIPES, nomeCarta, baralhar, elCarta, darCartas } =
  typeof require !== 'undefined' ? require('./cartas.js') : Cartas;

const ORDEM = ['ace', 'king', 'queen', 'jack', '10', '9', '8', '7', '6', '5', '4', '3', '2'];
const PLURAL = {
  ace: 'Ases', king: 'Reis', queen: 'Damas', jack: 'Valetes', 10: 'Dez', 9: 'Noves', 8: 'Oitos',
  7: 'Setes', 6: 'Seis', 5: 'Cincos', 4: 'Quatros', 3: 'Três', 2: 'Dois',
};
const UM = { ace: 'um Ás', king: 'um Rei', queen: 'uma Dama', jack: 'um Valete' };
const SIMBOLO = { ace: 'Á', king: 'R', queen: 'D', jack: 'V' };
const JOGADORES = ['Noah', 'Duarte'];
const CARTAS_INICIAIS = 7;
const TOTAL_PEIXINHOS = ORDEM.length;

const um = (r) => UM[r] || `um ${r}`;
const quantos = (r, n) => (n === 1 ? um(r) : `${n} ${PLURAL[r]}`);

const P = {
  maos: [[], []],
  lago: [], // monte de onde se pesca
  peixinhos: [[], []], // valores completos por jogador
  vez: -1,
  inicio: 0,
  fim: false,
  aPescar: null, // { p, r } enquanto o jogador p tem de ir ao lago
  // Memória do computador: o que se sabe pelas perguntas feitas.
  sabe: [new Set(), new Set()], // valores que o jogador tem de certeza
  negou: [new Set(), new Set()], // valores que disse não ter (até voltar a pescar)
};

const feitos = () => P.peixinhos[0].length + P.peixinhos[1].length;

function novaPartida() {
  const b = baralhar(ORDEM);
  P.maos = [b.splice(-CARTAS_INICIAIS), b.splice(-CARTAS_INICIAIS)];
  P.lago = b;
  P.peixinhos = [[], []];
  P.sabe = [new Set(), new Set()];
  P.negou = [new Set(), new Set()];
  P.aPescar = null;
  P.fim = false;
  P.vez = P.inicio;
  P.inicio = 1 - P.inicio;
  verificar(0);
  verificar(1);
}

function tirarDoLago(p) {
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
 * O jogador p pede ao outro as cartas de valor r (tem de ter pelo menos uma).
 * - 'deu': o outro tinha e deu todas; p joga outra vez.
 * - 'peixinho': não tinha; p tem agora de pescar (pescarPedido).
 * - 'nada': não tinha e o lago está vazio; passa a vez.
 */
function pedir(p, r) {
  const outro = 1 - p;
  if (p !== P.vez || P.aPescar || !P.maos[outro].length || !P.maos[p].some((c) => c.r === r)) {
    throw new Error('Pedido inválido');
  }
  P.sabe[p].add(r);
  const dadas = P.maos[outro].filter((c) => c.r === r);
  if (dadas.length) {
    P.maos[outro] = P.maos[outro].filter((c) => c.r !== r);
    P.maos[p].push(...dadas);
    P.sabe[outro].delete(r);
    return { tipo: 'deu', cartas: dadas, feitos: verificar(p) };
  }
  P.negou[outro].add(r);
  if (!P.lago.length) {
    P.vez = outro;
    return { tipo: 'nada', feitos: [] };
  }
  P.aPescar = { p, r };
  return { tipo: 'peixinho', feitos: [] };
}

/** Pesca a carta depois de um pedido falhado. Se sair o valor pedido, joga outra vez. */
function pescarPedido() {
  const { p, r } = P.aPescar;
  P.aPescar = null;
  const carta = tirarDoLago(p);
  const acertou = carta.r === r;
  const novos = verificar(p);
  if (!acertou) P.vez = 1 - p;
  return { carta, acertou, feitos: novos };
}

/**
 * Deixa o jogo pronto para o próximo pedido: quem está sem cartas pesca uma (ou é saltado
 * se o lago estiver vazio) e deteta o fim do jogo. Devolve o que aconteceu, para mostrar.
 */
function prepararVez() {
  const acontecimentos = [];
  for (let i = 0; i < 60; i++) {
    if (feitos() === TOTAL_PEIXINHOS) break;
    const p = P.vez;
    if (!P.maos[p].length) {
      if (!P.lago.length) { P.vez = 1 - p; continue; }
      acontecimentos.push({ p, tipo: 'repor', carta: tirarDoLago(p), feitos: [] });
    }
    if (!P.maos[1 - p].length) {
      // O outro não tem cartas para dar: pesca uma e passa a vez.
      if (P.lago.length) acontecimentos.push({ p, tipo: 'sozinho', carta: tirarDoLago(p), feitos: verificar(p) });
      P.vez = 1 - p;
      continue;
    }
    return acontecimentos;
  }
  P.fim = true;
  P.vez = -1;
  return acontecimentos;
}

/* ---------------------------------------------------------------------
   Inteligência do computador
   --------------------------------------------------------------------- */

function escolherPedido(p) {
  const outro = 1 - p;
  const conta = {};
  for (const c of P.maos[p]) conta[c.r] = (conta[c.r] || 0) + 1;
  const valores = Object.keys(conta).sort((a, b) => conta[b] - conta[a] || Math.random() - 0.5);
  // Pedir o que já se sabe que o outro tem — mas nem sempre se lembra.
  if (Math.random() < 0.75) {
    const certo = valores.find((r) => P.sabe[outro].has(r));
    if (certo) return certo;
  }
  // Senão, o valor de que tem mais cartas e que o outro ainda não negou.
  return valores.find((r) => !P.negou[outro].has(r)) || valores[0];
}

if (typeof module !== 'undefined') {
  module.exports = { P, novaPartida, pedir, pescarPedido, prepararVez, escolherPedido, feitos, TOTAL_PEIXINHOS };
}

/* =====================================================================
   Interface — uma conversa passo a passo: perguntas, respondes, pescas.
   ===================================================================== */

if (typeof document !== 'undefined') (() => {
  const $ = (id) => document.getElementById(id);
  const CANCELADO = Symbol('cancelado');
  const simbolo = (r) => SIMBOLO[r] || r;

  let epoca = 0; // muda quando se recomeça; cancela o jogo em curso
  let aguarda = null; // promessa à espera de um toque do jogador
  let novoValor = null; // valor da carta que acabou de chegar à tua mão (para animar)

  // O que está a ser mostrado no centro da mesa.
  const cena = {};
  function limpar() {
    Object.assign(cena, {
      falas: [null, null], // o que cada jogador diz: { texto, tipo }
      botao: null, // texto do botão com a tua resposta
      cartas: [], // cartas mostradas na montra
      viradas: 0, // cartas mostradas de costas
      legenda: '',
      legendaTipo: '',
      estado: '',
      escolher: false, // podes tocar numa carta da mão
      pescar: false, // podes tocar no lago
      pedida: null, // valor que o Duarte te pediu
    });
  }

  const espera = (ms) => {
    const e = epoca;
    return new Promise((ok, nao) => setTimeout(() => (e === epoca ? ok() : nao(CANCELADO)), ms));
  };
  const toque = () => new Promise((ok, nao) => { aguarda = { ok, nao }; });
  function resolver(valor) {
    const a = aguarda;
    aguarda = null;
    if (a) a.ok(valor);
  }

  /* ---------- Desenho ---------- */

  function desenharMao() {
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
      if (r === cena.pedida) b.classList.add('pedida');
      if (cena.escolher) {
        b.classList.add('jogavel');
        b.addEventListener('click', () => resolver(r));
      } else {
        b.disabled = true;
      }
      return b;
    }));
    novoValor = null; // anima só uma vez
  }

  function desenharBaloes() {
    for (const p of [0, 1]) {
      const balao = $(`balao-${p}`);
      const lado = p === 0 ? 'meu' : 'dele';
      const botao = p === 0 ? cena.botao : null;
      const fala = cena.falas[p];
      const chave = botao ? `b:${botao}` : fala ? `f:${fala.tipo || ''}:${fala.texto}` : '';
      if (balao.dataset.chave === chave) continue;
      balao.dataset.chave = chave;
      balao.hidden = !chave;
      if (botao) {
        const b = document.createElement('button');
        b.type = 'button';
        b.className = 'principal';
        b.textContent = botao;
        b.addEventListener('click', () => resolver(true));
        balao.className = `balao ${lado} acao`;
        balao.replaceChildren(b);
      } else {
        balao.className = `balao ${lado} ${fala ? fala.tipo || '' : ''}`;
        balao.textContent = fala ? fala.texto : '';
      }
    }
  }

  function desenharMontra() {
    const chave = `${cena.cartas.map((c) => c.r + c.s).join()}|${cena.viradas}|${cena.legendaTipo}|${cena.legenda}`;
    const montra = $('montra');
    if (montra.dataset.chave === chave) return;
    montra.dataset.chave = chave;
    const cartas = cena.cartas.map((c) => elCarta(c));
    for (let i = 0; i < cena.viradas; i++) {
      const costas = document.createElement('span');
      costas.className = 'costas grande';
      cartas.push(costas);
    }
    $('montra-cartas').replaceChildren(...cartas);
    const legenda = $('legenda');
    legenda.className = `legenda ${cena.legendaTipo}`;
    legenda.textContent = cena.legenda;
  }

  function desenhar() {
    for (const p of [0, 1]) {
      $(`pontos-${p}`).textContent = P.peixinhos[p].length;
      // Só acrescenta as fichas novas, para a animação não recomeçar a cada desenho.
      const fichas = $(`fichas-${p}`);
      if (fichas.children.length > P.peixinhos[p].length) fichas.replaceChildren();
      for (const r of P.peixinhos[p].slice(fichas.children.length)) {
        const f = document.createElement('i');
        f.textContent = simbolo(r);
        f.title = `Peixinho de ${PLURAL[r]}`;
        fichas.append(f);
      }
      $(`lugar-${p}`).classList.toggle('ativo', P.vez === p);
    }
    const costas = $('lugar-1').querySelector('.costas');
    costas.classList.toggle('vazio', !P.maos[1].length);
    costas.querySelector('b').textContent = P.maos[1].length;
    costas.setAttribute('aria-label', `${P.maos[1].length} cartas`);

    const lago = $('lago');
    lago.disabled = !cena.pescar;
    lago.classList.toggle('pescar', cena.pescar);
    $('lago-monte').classList.toggle('vazio', !P.lago.length);
    $('lago-n').textContent = P.lago.length;
    $('lago-texto').textContent = cena.pescar ? 'Toca para pescar' : P.lago.length ? 'Lago' : 'Lago vazio';

    $('estado').textContent = cena.estado;
    desenharBaloes();
    desenharMontra();
    desenharMao();
  }

  /* ---------- Jogo, passo a passo ---------- */

  async function celebrar(p, valores) {
    for (const r of valores) {
      cena.cartas = NAIPES.map((s) => ({ s, r }));
      cena.viradas = 0;
      cena.legenda = `${p === 0 ? 'Fizeste' : 'O Duarte fez'} um peixinho de ${PLURAL[r]}! 🐟`;
      cena.legendaTipo = 'peixe';
      desenhar();
      await espera(2200);
    }
  }

  async function turnoMeu() {
    cena.escolher = true;
    cena.estado = 'É a tua vez: toca numa carta tua para a pedir ao Duarte';
    desenhar();
    const r = await toque();

    cena.escolher = false;
    cena.estado = '';
    cena.falas[0] = { texto: `Duarte, tens ${PLURAL[r]}?` };
    desenhar();
    await espera(1000);

    const res = pedir(0, r);
    if (res.tipo === 'deu') {
      const q = quantos(r, res.cartas.length);
      cena.falas[1] = { texto: `Sim! Toma ${q}.`, tipo: 'bom' };
      cena.cartas = res.cartas;
      cena.legenda = `Recebeste ${q}. Jogas outra vez!`;
      cena.legendaTipo = 'bom';
      novoValor = r;
      desenhar();
      await espera(2200);
    } else if (res.tipo === 'nada') {
      cena.falas[1] = { texto: 'Não tenho.', tipo: 'mau' };
      cena.legenda = 'O lago está vazio: agora joga o Duarte.';
      desenhar();
      await espera(1900);
    } else {
      cena.falas[1] = { texto: 'Não tenho. Vai ao peixinho! 🐟', tipo: 'mau' };
      cena.pescar = true;
      cena.estado = 'Toca no lago para pescar uma carta';
      desenhar();
      await toque();

      cena.pescar = false;
      cena.estado = '';
      const s = pescarPedido();
      res.feitos = s.feitos;
      cena.cartas = [s.carta];
      cena.legenda = s.acertou
        ? `Pescaste ${um(r)}, a carta que pediste. Jogas outra vez!`
        : `Pescaste: ${nomeCarta(s.carta)}. Agora joga o Duarte.`;
      cena.legendaTipo = s.acertou ? 'bom' : '';
      novoValor = s.carta.r;
      desenhar();
      await espera(2300);
    }
    await celebrar(0, res.feitos);
  }

  async function turnoDele() {
    cena.estado = 'O Duarte está a escolher…';
    desenhar();
    await espera(1100);

    const r = escolherPedido(1);
    const tenho = P.maos[0].filter((c) => c.r === r).length;
    const resposta = tenho ? `Sim, toma ${quantos(r, tenho)}.` : 'Não tenho. Vai ao peixinho! 🐟';
    cena.falas[1] = { texto: `Noah, tens ${PLURAL[r]}?` };
    cena.pedida = tenho ? r : null;
    cena.botao = resposta;
    cena.estado = tenho ? 'Tens as cartas que ele pediu: toca no botão para lhas dar' : 'Não tens essas cartas: manda-o ao peixinho';
    desenhar();
    await toque();

    cena.botao = null;
    cena.pedida = null;
    cena.estado = '';
    cena.falas[0] = { texto: resposta, tipo: tenho ? 'mau' : 'bom' };
    const res = pedir(1, r);
    if (res.tipo === 'deu') {
      cena.cartas = res.cartas;
      cena.legenda = `Deste ${quantos(r, res.cartas.length)} ao Duarte. Ele joga outra vez.`;
      desenhar();
      await espera(2200);
    } else if (res.tipo === 'nada') {
      cena.falas[0] = { texto: 'Não tenho.', tipo: 'bom' };
      cena.legenda = 'O lago está vazio: é a tua vez.';
      desenhar();
      await espera(1900);
    } else {
      desenhar();
      await espera(900);
      const s = pescarPedido();
      res.feitos = s.feitos;
      if (s.acertou) {
        cena.cartas = [s.carta];
        cena.legenda = `O Duarte pescou ${um(r)}, a carta que pediu. Joga outra vez!`;
      } else {
        cena.viradas = 1;
        cena.legenda = 'O Duarte pescou uma carta. Agora é a tua vez.';
      }
      desenhar();
      await espera(2100);
    }
    await celebrar(1, res.feitos);
  }

  /** Cartas pescadas automaticamente (mão vazia, ou o outro sem cartas para dar). */
  async function mostrarAutomatico(a) {
    limpar();
    if (a.p === 0) {
      cena.cartas = [a.carta];
      novoValor = a.carta.r;
      cena.legenda = a.tipo === 'repor'
        ? 'Ficaste sem cartas: pescaste uma do lago.'
        : 'O Duarte não tem cartas para te dar: pescaste uma e passas a vez.';
    } else {
      cena.viradas = 1;
      cena.legenda = a.tipo === 'repor'
        ? 'O Duarte ficou sem cartas e pescou uma do lago.'
        : 'Não tens cartas para lhe dar: o Duarte pescou uma e passa a vez.';
    }
    desenhar();
    await espera(2100);
    await celebrar(a.p, a.feitos);
  }

  function fimDoJogo() {
    const [meus, dele] = P.peixinhos.map((l) => l.length);
    const n = (x) => (x === 1 ? '1 peixinho' : `${x} peixinhos`);
    const ganhei = meus > dele;
    const linhas = [0, 1]
      .map((p) => ({ nome: JOGADORES[p], mais: P.peixinhos[p].length, etiqueta: '🐟', total: P.peixinhos[p].length, eu: p === 0, limite: TOTAL_PEIXINHOS }))
      .sort((a, b) => b.total - a.total);
    mostrarFim({
      estado: ganhei ? 'campeao' : 'eliminado',
      icone: ganhei ? '🐟' : '🎣',
      titulo: ganhei ? 'Vitória! Ganhaste o jogo!' : 'Derrota — o Duarte ganhou o jogo',
      texto: `Fizeste ${n(meus)} e o Duarte fez ${n(dele)}.`,
      linhas,
      botao: 'Novo jogo',
    });
  }

  async function jogar() {
    novaPartida();
    limpar();
    cena.legenda = `Cada um recebe ${CARTAS_INICIAIS} cartas. Junta as 4 cartas do mesmo valor para fazer um peixinho.`;
    desenhar();
    darCartas($('mao'));
    await espera(1600);
    for (;;) {
      for (const a of prepararVez()) await mostrarAutomatico(a);
      if (P.fim) break;
      limpar();
      if (P.vez === 0) await turnoMeu(); else await turnoDele();
    }
    limpar();
    desenhar();
    await espera(500);
    fimDoJogo();
  }

  function comecar() {
    epoca++;
    if (aguarda) { aguarda.nao(CANCELADO); aguarda = null; }
    jogar().catch((erro) => { if (erro !== CANCELADO) throw erro; });
  }

  $('lago').addEventListener('click', () => { if (cena.pescar) resolver(true); });

  $('fim-btn').addEventListener('click', () => { $('dlg-fim').close(); comecar(); });
  $('dlg-fim').addEventListener('cancel', (e) => { e.preventDefault(); $('fim-btn').click(); });

  $('btn-novo').addEventListener('click', () => {
    const aMeio = !P.fim && (feitos() > 0 || P.lago.length < 52 - 2 * CARTAS_INICIAIS);
    if (!aMeio || confirm('Começar um jogo novo? O jogo atual será apagado.')) comecar();
  });

  $('btn-regras').addEventListener('click', () => $('dlg-regras').showModal());
  $('dlg-regras').addEventListener('click', (e) => { if (e.target === e.currentTarget) e.currentTarget.close(); });

  limpar();
  comecar();
})();
