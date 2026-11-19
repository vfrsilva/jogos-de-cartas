'use strict';

/* Cartas — código partilhado por todos os jogos. */
const Cartas = (() => {
  const NAIPES = ['hearts', 'spades', 'diamonds', 'clubs'];
  // Baralho português de 40 cartas (Sueca, Bisca), do mais fraco ao mais forte.
  const VALORES = ['2', '3', '4', '5', '6', 'queen', 'jack', 'king', '7', 'ace'];
  const PONTOS = { ace: 11, 7: 10, king: 4, jack: 3, queen: 2 };
  const NOME_NAIPE = { hearts: 'copas', spades: 'espadas', diamonds: 'ouros', clubs: 'paus' };
  const NOME_VALOR = { ace: 'Ás', king: 'Rei', jack: 'Valete', queen: 'Dama' };

  const forca = (c) => VALORES.indexOf(c.r);
  const pontos = (c) => PONTOS[c.r] || 0;
  const idCarta = (c) => `${c.r}_of_${c.s}`;
  const nomeCarta = (c) => `${NOME_VALOR[c.r] || c.r} de ${NOME_NAIPE[c.s]}`;

  /** Baralho baralhado com os valores dados (por omissão, as 40 cartas). */
  function baralhar(valores = VALORES) {
    const b = [];
    for (const s of NAIPES) for (const r of valores) b.push({ s, r });
    for (let i = b.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [b[i], b[j]] = [b[j], b[i]];
    }
    return b;
  }

  /** Elemento DOM de uma carta virada para cima. */
  function elCarta(carta, tag = 'span') {
    const el = document.createElement(tag);
    el.className = 'carta';
    const img = document.createElement('img');
    img.src = `cartas/${idCarta(carta)}.svg`;
    img.alt = nomeCarta(carta);
    img.draggable = false;
    el.append(img);
    return el;
  }

  /** Anima a distribuição das cartas da mão, uma a uma. */
  function darCartas(mao) {
    [...mao.children].forEach((c, i) => c.style.setProperty('--i', i));
    mao.classList.add('dar');
    setTimeout(() => mao.classList.remove('dar'), 700);
  }

  return { NAIPES, VALORES, NOME_NAIPE, forca, pontos, idCarta, nomeCarta, baralhar, elCarta, darCartas };
})();

if (typeof module !== 'undefined') module.exports = Cartas;
