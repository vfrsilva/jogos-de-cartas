'use strict';

/* Comando de jogos (Bluetooth ou USB) para os jogos de ação.
   Lê o comando com a Gamepad API do browser e «carrega» nas mesmas teclas que o teclado usa
   (setas e barra de espaços), por isso os jogos não precisam de saber que há um comando.

   Funciona com comandos em modo X-input (mapeamento «standard») e em modo D-input, em que o
   browser não garante a ordem dos botões: por isso lê-se a alavanca esquerda, a cruzeta nas
   várias formas em que pode aparecer, e grupos de botões em vez de um botão exato.

   Cada página diz que botões quer com <body data-comando="…">:
     rally      — botões de baixo/gatilho direito aceleram, os outros travam
     contramao  — qualquer botão dispara o laser
     downforce  — gatilhos (e dois botões da frente) mudam a mudança
     superpilotos — qualquer botão dispara o laser */

// As 8 posições de uma cruzeta que vem num só eixo («hat»), de cima no sentido dos ponteiros.
const CRUZETA_EIXO = [[0, -1], [1, -1], [1, 0], [1, 1], [0, 1], [-1, 1], [-1, 0], [-1, -1]];

const BOTOES = {
  rally: { ArrowUp: [0, 5, 7], ArrowDown: [1, 2, 3, 4, 6] },
  contramao: { ' ': [0, 1, 2, 3, 4, 5, 6, 7] },
  downforce: { ArrowUp: [0, 3, 5, 7], ArrowDown: [1, 2, 4, 6] },
  superpilotos: { ' ': [0, 1, 2, 3, 4, 5, 6, 7] },
};

/** Estado das teclas que o comando está a «carregar»: { ArrowLeft, ArrowRight, ArrowUp, ArrowDown, ' ' }.
    `descanso` são os valores dos eixos quando o comando foi ligado: um eixo que não descansa
    perto de zero (um gatilho, por exemplo) não é uma alavanca e é ignorado. */
function lerComando(gp, descanso, modo) {
  const carregado = (i) => !!gp.buttons[i] && (gp.buttons[i].pressed || gp.buttons[i].value > 0.5);
  const eixo = (i) => (i < gp.axes.length && Math.abs(descanso[i] || 0) < 0.3 ? gp.axes[i] : 0);
  let x = 0, y = 0;
  // Alavanca esquerda.
  if (Math.abs(eixo(0)) > 0.5) x = Math.sign(eixo(0));
  if (Math.abs(eixo(1)) > 0.5) y = Math.sign(eixo(1));
  if (gp.mapping === 'standard') {
    // Cruzeta nos botões 12–15.
    if (carregado(14)) x = -1; else if (carregado(15)) x = 1;
    if (carregado(12)) y = -1; else if (carregado(13)) y = 1;
  } else {
    // D-input: a cruzeta costuma vir num só eixo (o 10.º), com um valor para cada posição…
    if (gp.axes.length > 9) {
      const p = (gp.axes[9] + 1) / (2 / 7);
      const k = Math.round(p);
      if (k >= 0 && k <= 7 && Math.abs(p - k) < 0.15) { x = CRUZETA_EIXO[k][0] || x; y = CRUZETA_EIXO[k][1] || y; }
    } else if (gp.axes.length === 8) {
      // …ou em dois eixos (7.º e 8.º).
      if (Math.abs(eixo(6)) > 0.5) x = Math.sign(eixo(6));
      if (Math.abs(eixo(7)) > 0.5) y = Math.sign(eixo(7));
    }
    // …ou, em alguns comandos, nos botões 12–15 como no modo «standard».
    if (gp.buttons.length >= 16) {
      if (carregado(14)) x = -1; else if (carregado(15)) x = 1;
      if (carregado(12)) y = -1; else if (carregado(13)) y = 1;
    }
  }
  const teclas = { ArrowLeft: x < 0, ArrowRight: x > 0, ArrowUp: y < 0, ArrowDown: y > 0, ' ': false };
  for (const [tecla, lista] of Object.entries(BOTOES[modo] || {})) {
    if (lista.some(carregado)) teclas[tecla] = true;
  }
  // Acelerar e travar ao mesmo tempo: ganha o travão (só interessa ao Rally).
  if (teclas.ArrowUp && teclas.ArrowDown) teclas.ArrowUp = false;
  return teclas;
}

if (typeof module !== 'undefined') module.exports = { lerComando, BOTOES };

if (typeof document !== 'undefined' && 'getGamepads' in navigator) (() => {
  const modo = document.body.dataset.comando;
  const estado = { ArrowLeft: false, ArrowRight: false, ArrowUp: false, ArrowDown: false, ' ': false };
  const descansos = {};   // por índice do comando
  let botaoAntes = false; // algum botão carregado no quadro anterior (para os diálogos)

  function avisar(texto) {
    document.querySelector('.comando-aviso')?.remove();
    const el = document.createElement('div');
    el.className = 'comando-aviso';
    el.textContent = texto;
    document.body.append(el);
    setTimeout(() => el.remove(), 3000);
  }

  addEventListener('gamepadconnected', (e) => {
    descansos[e.gamepad.index] = Array.from(e.gamepad.axes);
    avisar('🎮 Comando ligado');
  });
  addEventListener('gamepaddisconnected', (e) => {
    delete descansos[e.gamepad.index];
    avisar('🎮 Comando desligado');
  });

  const tecla = (tipo, key) => dispatchEvent(new KeyboardEvent(tipo, { key, code: key === ' ' ? 'Space' : key, bubbles: true, cancelable: true }));

  /** Com um diálogo aberto (regras, escolha de circuito, fim), o comando anda pelos botões e escolhe. */
  function noDialogo(dlg, novo, algumBotao) {
    const botoes = [...dlg.querySelectorAll('button')];
    if (!botoes.length) return;
    let i = botoes.indexOf(document.activeElement);
    const passo = (novo.ArrowDown && !estado.ArrowDown) || (novo.ArrowRight && !estado.ArrowRight) ? 1
      : (novo.ArrowUp && !estado.ArrowUp) || (novo.ArrowLeft && !estado.ArrowLeft) ? -1 : 0;
    if (passo) { i = (Math.max(i, 0) + passo + botoes.length) % botoes.length; botoes[i].focus(); }
    if (algumBotao && !botaoAntes) (botoes[i] || dlg.querySelector('.principal') || botoes[0]).click();
  }

  function ler() {
    requestAnimationFrame(ler);
    const novo = { ArrowLeft: false, ArrowRight: false, ArrowUp: false, ArrowDown: false, ' ': false };
    let algumBotao = false;
    for (const gp of navigator.getGamepads()) {
      if (!gp || !gp.connected) continue;
      const lido = lerComando(gp, descansos[gp.index] || (descansos[gp.index] = Array.from(gp.axes)), modo);
      for (const k of Object.keys(novo)) novo[k] = novo[k] || lido[k];
      for (let b = 0; b < Math.min(4, gp.buttons.length); b++) algumBotao = algumBotao || gp.buttons[b].pressed;
    }
    const dlg = document.querySelector('dialog[open]');
    if (dlg) {
      noDialogo(dlg, novo, algumBotao);
      // Larga tudo o que estava carregado, para nada ficar preso quando o diálogo fechar.
      for (const k of Object.keys(estado)) { if (estado[k] && !novo[k]) tecla('keyup', k); }
    } else {
      for (const k of Object.keys(estado)) {
        if (novo[k] !== estado[k]) tecla(novo[k] ? 'keydown' : 'keyup', k);
      }
    }
    Object.assign(estado, novo);
    botaoAntes = algumBotao;
  }
  requestAnimationFrame(ler);
})();
