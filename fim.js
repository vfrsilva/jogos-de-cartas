'use strict';

/* Ecrã de fim de partida, partilhado por todos os jogos.
   Constrói o conteúdo de <dialog id="dlg-fim"> e expõe mostrarFim(). */
const mostrarFim = (() => {
  const dlg = document.getElementById('dlg-fim');
  dlg.innerHTML = `
    <div class="fim-corpo">
      <div class="fim-icone" id="fim-icone" aria-hidden="true"></div>
      <h2 id="fim-titulo"></h2>
      <p class="fim-etiqueta" id="fim-etiqueta"></p>
      <div class="fim-placar">
        <div class="lado nos"><span class="quem" id="fim-quem-0"></span><span class="num" id="fim-num-0">0</span></div>
        <span class="sep">–</span>
        <div class="lado eles"><span class="quem" id="fim-quem-1"></span><span class="num" id="fim-num-1">0</span></div>
      </div>
      <div class="fim-barra" aria-hidden="true"><span id="fim-barra-nos"></span><i></i></div>
      <div class="fim-tabela" id="fim-tabela"></div>
      <p id="fim-texto"></p>
      <div class="fim-jogos" id="fim-jogos"></div>
      <button type="button" class="principal" id="fim-btn"></button>
    </div>`;

  const $ = (id) => document.getElementById(id);
  const ICONES = { vitoria: '🎉', campeao: '🏆', derrota: '😞', eliminado: '😭', empate: '🤝' };
  const CORES = ['#f2c94c', '#7fd1ff', '#ffab91', '#9be7a1', '#ffffff', '#e59cff'];
  const calmo = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
  const el = (tag, classe, texto) => {
    const e = document.createElement(tag);
    if (classe) e.className = classe;
    if (texto !== undefined) e.textContent = texto;
    return e;
  };

  function contar(alvo, ate) {
    if (calmo()) { alvo.textContent = ate; return; }
    const t0 = performance.now();
    const dur = 900;
    const passo = (t) => {
      const k = Math.min(1, (t - t0) / dur);
      alvo.textContent = Math.round(ate * (1 - Math.pow(1 - k, 3)));
      if (k < 1 && dlg.open) requestAnimationFrame(passo);
      else alvo.textContent = ate;
    };
    requestAnimationFrame(passo);
  }

  function confetes(n) {
    dlg.querySelector('.confetes')?.remove();
    if (!n || calmo()) return;
    const caixa = el('div', 'confetes');
    caixa.setAttribute('aria-hidden', 'true');
    for (let i = 0; i < n; i++) {
      const c = document.createElement('i');
      c.style.left = `${Math.random() * 100}%`;
      c.style.background = CORES[i % CORES.length];
      c.style.width = `${6 + Math.random() * 6}px`;
      c.style.height = `${8 + Math.random() * 10}px`;
      c.style.animationDuration = `${2.2 + Math.random() * 2.2}s`;
      c.style.animationDelay = `${Math.random() * 1.2}s`;
      c.style.setProperty('--desvio', `${(Math.random() - 0.5) * 30}vw`);
      c.style.setProperty('--voltas', `${(Math.random() - 0.5) * 6}turn`);
      caixa.append(c);
    }
    dlg.append(caixa);
    setTimeout(() => caixa.remove(), 6000);
  }

  function pips(total, novos, meta, lado) {
    const s = el('span', `pips ${lado}`);
    s.setAttribute('aria-label', `${total} de ${meta}`);
    for (let i = 0; i < meta; i++) {
      const p = document.createElement('i');
      if (i < total) p.className = i >= total - novos ? 'cheio novo' : 'cheio';
      s.append(p);
    }
    return s;
  }

  /** Dois lados (Sueca, Bisca): resultado grande, barra dos 120 pontos e jogos ganhos. */
  function doisLados({ pontos, nomes, jogos, novos, meta }) {
    for (const i of [0, 1]) $(`fim-quem-${i}`).textContent = nomes[i];
    dlg.querySelector('.lado.nos').classList.toggle('maior', pontos[0] > pontos[1]);
    dlg.querySelector('.lado.eles').classList.toggle('maior', pontos[1] > pontos[0]);
    $('fim-jogos').replaceChildren(
      el('span', '', nomes[0]), pips(Math.min(jogos[0], meta), novos[0], meta, 'nos'),
      pips(Math.min(jogos[1], meta), novos[1], meta, 'eles'), el('span', '', nomes[1]));
    const barra = $('fim-barra-nos');
    barra.style.width = '50%';
    return () => {
      requestAnimationFrame(() => { barra.style.width = `${(pontos[0] / 120) * 100}%`; });
      contar($('fim-num-0'), pontos[0]);
      contar($('fim-num-1'), pontos[1]);
    };
  }

  /** Vários jogadores (Copas): uma linha por jogador com os pontos da ronda e o total. */
  function tabela(linhas) {
    const barras = [];
    $('fim-tabela').replaceChildren(...linhas.map((l) => {
      const linha = el('div', l.eu ? 'linha eu' : 'linha');
      const trilho = el('span', 'trilho');
      const barra = el('span');
      barra.style.width = `${Math.max(0, Math.min(100, ((l.total - l.mais) / l.limite) * 100))}%`;
      barras.push([barra, Math.min(100, (l.total / l.limite) * 100)]);
      trilho.append(barra);
      linha.append(el('span', 'quem', l.nome), el('span', l.mais ? 'mais tem' : 'mais', `+${l.mais}`), trilho, el('span', 'total', l.total));
      return linha;
    }));
    return () => requestAnimationFrame(() => { for (const [b, w] of barras) b.style.width = `${w}%`; });
  }

  /**
   * estado: 'vitoria' | 'derrota' | 'empate' | 'campeao' | 'eliminado' (do ponto de vista do jogador).
   * Com `linhas` mostra uma tabela de jogadores; sem ela, o resultado de dois lados
   * (pontos, jogos, novos: [lado 0, lado 1]; nomes; meta: jogos para ganhar).
   */
  return function mostrarFim(o) {
    dlg.className = `fim ${o.estado}${o.linhas ? ' tabela' : ''}`;
    $('fim-icone').textContent = o.icone || ICONES[o.estado];
    $('fim-titulo').textContent = o.titulo;
    $('fim-etiqueta').textContent = o.etiqueta || '';
    $('fim-etiqueta').hidden = !o.etiqueta;
    $('fim-texto').textContent = o.texto;
    $('fim-btn').textContent = o.botao;
    const animar = o.linhas ? tabela(o.linhas) : doisLados(o);
    dlg.showModal();
    $('fim-btn').focus();
    animar();
    confetes(o.confetes ?? { vitoria: 70, campeao: 160 }[o.estado] ?? 0);
  };
})();
