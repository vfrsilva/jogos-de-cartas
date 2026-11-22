# Jogos

Web app estática com jogos de cartas portugueses (Sueca, Bisca dos Três, Copas, Peixinho, Blackjack), o Cinquillo com baralha espanhola e jogos de ação e desporto (Rally, Contramão, Downforce, Super Pilotos by Noah).
Publicada em https://vfrsilva.github.io/jogos-de-cartas/ (GitHub Pages, repositório `vfrsilva/jogos-de-cartas`, ramo `main`, raiz).

## Princípios

- **Sem anúncios, sem rastreio, sem pedidos externos.** Tudo o que a página usa está no repositório.
- **Sem build nem dependências.** HTML, CSS e JavaScript simples; abre-se com duplo clique em `index.html` (`file://`), por isso não usar módulos ES, `fetch` de ficheiros locais nem nada que exija servidor.
- **Tudo em português de Portugal**: interface, nomes de variáveis e funções, comentários e mensagens de commit.
- **Não recriar jogos comerciais.** Só jogos tradicionais de domínio público, com regras e aspeto próprios.

## Estrutura

| Ficheiro | Papel |
|---|---|
| `index.html` | Painel inicial: um cartão por jogo. |
| `sueca.html` / `bisca.html` / `copas.html` / `peixinho.html` / `cinquillo.html` | Uma página por jogo. |
| `sueca.js` / `bisca.js` / `copas.js` / `peixinho.js` / `cinquillo.js` | Motor + interface de cada jogo. |
| `cartas.js` | Código partilhado: baralho, pontos da Sueca/Bisca, `elCarta`, `darCartas`. Expõe o global `Cartas`. |
| `fim.js` | Ecrã de fim de partida partilhado. Constrói o conteúdo de `<dialog id="dlg-fim">` e expõe `mostrarFim()`. |
| `style.css` | Folha de estilos única para todas as páginas. |
| `rally.html` / `rally.js` | Rally: corrida vista de cima em `<canvas>`. Não usa `cartas.js`; só `fim.js`. |
| `contramao.html` / `contramao.js` | Contramão: desviar dos carros que vêm de frente, em `<canvas>`. Só usa `fim.js`. |
| `downforce.html` / `downforce.js` | Downforce: corrida em circuito fechado com a estrada em perspetiva do Contramão. Só usa `fim.js`. |
| `superpilotos.html` / `superpilotos.js` | Super Pilotos by Noah: cópia do Downforce com 12 pilotos em duas equipas, obstáculos, lasers e gasolina. Só usa `fim.js`. |
| `comando.js` | Comando de jogos (Gamepad API) para o Rally, o Contramão, o Downforce e os Super Pilotos: transforma o comando em eventos de teclado (setas e espaço). Carrega-se depois do script do jogo; os botões de cada jogo vêm de `<body data-comando="…">`. Suporta X-input e D-input (cruzeta em botões, num eixo «hat» ou em dois eixos). |
| `cartas/*.svg` | 52 cartas (*Vector Playing Cards* de Byron Knoll, domínio público). Nome: `<valor>_of_<naipe>.svg`. |
| `baraja/*.png` | Baralha espanhola de 40 cartas + `reverso.png` (Basquetteur, Wikimedia Commons, **CC BY-SA 3.0**: manter a atribuição em `baraja/CREDITOS.txt` e nas regras do jogo). Nome: `<valor>_de_<palo>.png`, palos `oros`, `copas`, `espadas`, `bastos`. Só o Cinquillo a usa, com a classe `.carta.es`. |

Ordem dos scripts em cada página de jogo: `cartas.js`, `fim.js`, `<jogo>.js`.

## Arquitetura de cada jogo

Cada `<jogo>.js` tem duas metades no mesmo ficheiro:

1. **Motor** (topo): estado num objeto global (`G` Sueca, `B` Bisca, `C` Copas, `P` Peixinho, `Q` Cinquillo) e funções puras de regras e de IA. Não toca no DOM. É exportado com `module.exports` para poder ser simulado em Node.
2. **Interface** (fundo): dentro de `if (typeof document !== 'undefined') (() => { ... })()`. Lê o estado e redesenha tudo com `desenhar()`.

Convenções comuns:

- Carta = `{ s: 'hearts'|'spades'|'diamonds'|'clubs', r: '2'…'10'|'jack'|'queen'|'king'|'ace' }`.
- Lugares: 0 = jogador humano (em baixo), 1 = direita, 2 = em frente, 3 = esquerda. Joga-se 0 → 1 → 2 → 3 (sentido anti-horário).
- Jogadores: Noah (humano), Duarte, Tomas, Sira. A interface trata o humano por «tu»; o nome Noah só aparece em pontuações e tabelas. A Sira é o único nome feminino (artigos `a`/`à`).
- Uma jogada não fecha a vaza: `jogar()` deixa as cartas na mesa e a interface chama `fecharVaza()` depois da animação.
- Temporizadores passam por `depois(ms, fn)`, que ignora o callback se `epoca` mudou (jogo recomeçado). O Peixinho usa `async/await` com `espera()` e `toque()`, cancelados da mesma forma.
- Elementos que se redesenham muitas vezes (vaza, balões, montra) guardam uma chave em `dataset` e só são reconstruídos quando mudam, para não repetir animações.

## Regras decididas

- **Sueca**: 4 jogadores em 2 equipas (tu e o Tomas contra o Duarte e a Sira), 40 cartas, obrigatório assistir. Trunfo = última carta de quem dá. Mais de 60 pontos = 1 jogo, 91+ = 2 (capote), todas as vazas = 4 (bandeira), 60–60 = empate. Ganha quem chega a 4 jogos.
- **Bisca dos Três**: 2 jogadores, 3 cartas na mão, compra-se do baralho depois de cada vaza. **Nunca é obrigatório assistir**, nem depois de o baralho acabar (decisão do utilizador). Sem troca do trunfo. Ganha quem chega a 4 partidas.
- **Copas**: 4 jogadores, 52 cartas, passe de 3 cartas (esquerda, direita, frente, sem passe). Sai o 2 de paus; copas fechadas até alguém jogar uma; sem pontos na primeira vaza. Copas = 1, Dama de espadas = 13. Quem apanha os 26 marca 0 e dá 26 a cada adversário. Acaba aos 100 pontos; ganha quem tem menos.
- **Peixinho**: 2 jogadores (tu contra o Duarte), 52 cartas, 7 cada. Pede-se um valor que se tenha na mão; quem não tem manda «ao peixinho» (pescar do lago); pescar o valor pedido dá nova jogada. Ganha quem fizer mais grupos de 4. O humano responde sempre com um toque aos pedidos do Duarte e pesca tocando no lago — o jogo nunca avança sozinho nesses momentos.
- **Cinquillo**: 4 jogadores, baralha espanhola de 40 cartas, 10 cada. Começa o 5 de ouros; cada naipe cresce a partir do 5 (4-3-2-1 e 6-7-10-11-12). Quem pode jogar tem de jogar; só passa quem não tem carta que encaixe. Ganha a ronda quem fica sem cartas; ganha o jogo quem chega a 3 rondas. A mesa é um tabuleiro de 4 filas × 10 casas, e pode jogar-se tocando na carta ou na casa.

A IA usa só informação que um jogador atento teria (cartas jogadas, perguntas feitas). No fim da Bisca, sem baralho, faz procura exaustiva porque as mãos são dedutíveis. No Peixinho o Duarte «esquece-se» de propósito cerca de um quarto das vezes.

## Rally (ação e desporto)

- `rally.js` segue a mesma divisão motor/interface; o estado é o global `R`. O motor corre a passo fixo (`DT` = 1/120 s) com `passo(cmd)` e simula-se em Node com `novaCorrida(i, { humano: false })`.
- **Pista**: curva fechada pelos pontos de controlo de `CIRCUITOS`, reamostrada de 6 em 6 px. A altura do chão só depende da posição ao longo da pista: relevo (ondas), rampas (acabam num degrau), lombas e, no «Oito», uma ponte no cruzamento.
- **Gravidade**: cada carro tem `z` e `vz`; cai livremente e o chão segura-o. Onde o chão foge fica no ar (`alt` > `NO_AR`) e aí não acelera, não trava nem vira. As encostas puxam o carro (`decl`).
- **Sem atalhos**: cada carro só procura o ponto da pista mais próximo à volta do anterior (`localizar`); quem se afasta de mais é reposto (`repor`). É isso também que separa quem vai na ponte de quem passa por baixo.
- Choques carro a carro com dois círculos por carro; só chocam se estiverem à mesma altura.
- A vista mostra sempre o mundo todo (1000×600); em ecrãs ao alto o mundo é rodado 90°. Fundo, marcas de pneus e ponte são camadas `<canvas>` desenhadas à parte.
- `rally.html?c=N&demo=1&t=S` abre o circuito N com piloto automático e adianta S segundos: serve para capturas de ecrã.
- Recordes por circuito em `localStorage` (`rally-v1`).

## Contramão (ação e desporto)

- Estado no global `D`. Jogo por passos: os carros aparecem no horizonte, a `PASSOS` (16) passos, e em cada `avancar()` descem um passo. O passo 0 é a fila do jogador. `mover(±1, fracao)` muda de faixa e só bate num carro ao lado (passo 0) durante o primeiro quarto do passo (`AO_LADO`); depois o carro já passou.
- **Faixas** (`D.faixas`, `faixasDoNivel`): 3 ao início, 4 a partir do nível 5, 6 a partir do 10. As faixas novas ficam à direita (índices mais altos). A meta leva o número de faixas do nível seguinte (`D.meta.faixas`): as filas criadas depois dela já o usam, e `D.faixas` só muda quando o jogador a cruza. Uma meta que alarga a estrada e uma faixa de abastecimento nunca coexistem (uma espera pela outra).
- **Há sempre caminho**: fila sim, fila não (um passo vazio entre filas); há sempre uma faixa livre em cada fila, e essa fica no máximo ao lado de uma que estava livre na fila anterior (no máximo 2, 3 ou 4 carros por fila, com 3, 4 ou 6 faixas). A simulação em Node com um jogador perfeito nunca pode bater.
- **Objetivo: metros.** Cada passo vale `METROS_PASSO` (10 m); `metros()` dá o total e o recorde fica em `localStorage` (`contramao-v1`, campo `metros`). `D.pontos` conta só os carros evitados, para a estatística do fim. 3 vidas.
- **Metas e níveis**: de `SEG_NIVEL` (10) em 10 segundos aparece uma linha de meta ao fundo (`D.meta = { passo }`); o nível sobe quando ela chega ao passo 0. Cada nível encurta `intervalo()` e traz mais filas de dois.
- **Veículos** (`VEICULOS`, na interface): carro, mota e monster truck, escolhidos num diálogo ao abrir a página (e no botão «Veículo»). Só mudam o desenho, o timbre do motor e a animação de mudar de faixa (`desliza`, `inclina`: a mota deita-se); as regras e a velocidade são iguais. A escolha fica em `contramao-v1` (`veiculo`).
- **Som** (Web Audio, sem ficheiros): motor sintetizado com dois osciladores (`TIMBRES`), que sobe de rotação ao longo de cada nível e cai na meta; efeitos de choque, laser e nível. Só arranca depois de um gesto do utilizador; o botão 🔊 guarda a preferência (`som`).
- **Velocidade**: não há mudanças; o carro vai sempre à velocidade máxima do nível (`intervalo()`: 360 ms por passo no nível 1, menos 13 ms por nível, mínimo 135 ms).
- **Laser** (`disparar()`, barra de espaços): 3 por jogo (`LASERS`). Destrói o carro mais próximo na faixa do jogador (passo ≥ 1) e conta-o como evitado; sem alvo não dispara nem gasta.
- **Combustível** (`D.combustivel`, 0–100): gasta `CONSUMO` por passo; a zero custa uma vida e volta a 50. De 60 a 90 passos depois de acabar a anterior aparece uma **faixa de abastecimento** (`D.desvio = { lado, de, ate }`, em passos até ao jogador) do lado esquerdo (faixa -1) ou direito (faixa 3), com `COMP_DESVIO` passos: lá dentro não há carros e o depósito ganha `CARGA` por passo. Só se entra enquanto está ao lado (`desvioAberto()`); quem ainda lá estiver quando acaba, bate.
- **Desenho**: posições laterais em unidades de faixa (`u` = 0 é o meio da faixa 0); `xDe(g, u, z)` converte para o ecrã. A vista centra-se e encolhe sozinha para caber tudo (`nVista`, `abre`).
- **Curvas**: são só do desenho. `curvatura(distância)` é somada duas vezes ao longo da distância (`calcularCurvas`) e `desvio(z)` dá o deslocamento lateral da estrada; as regras não mudam com a curva.
- A interface interpola os carros entre passos (distância desenhada = `passo` − fração do passo) com perspetiva `1 / (1 + K·z)`. `contramao.html?demo=1&t=N` joga sozinho e adianta N passos.

## Downforce (ação e desporto)

- Cópia da estrada em perspetiva do Contramão (o código de desenho está duplicado de propósito, não partilhado), com outro motor: corrida de `VOLTAS` (3) voltas, sempre `FAIXAS` (5) faixas, contra o Tomas, o Duarte e a Sira. Estado no global `F`.
- Motor contínuo a passo fixo (`DT` = 1/60 s), não por passos inteiros: cada piloto tem `pos` (passos desde a partida, a contar todas as voltas), `faixa` e `v` (passos/s). A volta tem `N` (240) passos de 10 m. Simula-se em Node com `novaCorrida({ humano: false })`.
- **Circuito fechado** (`PISTA`): curva pelos pontos de controlo, reamostrada em `N` passos; `pts` desenha o mapa e `curv` dá a curva da estrada em cada passo (a mesma em todas as voltas).
- **Trânsito lento** (`F.transito`): carros a `V_TRANSITO`, em filas de 4 em 4 passos com no máximo 3 das 5 faixas ocupadas. Bater num para o carro (`v = 0`) e dá `TEMPO_IMUNE` sem novos choques. Os adversários travam atrás do trânsito e mudam de faixa (`pilotar`).
- Atrás de outro piloto na mesma faixa fica-se colado à velocidade dele (`COMP`); `mover()` recusa a mudança se houver um carro ao lado (`AO_LADO`). O humano escolhe a velocidade com as mudanças (`MUDANCAS`) e não trava sozinho.
- Elástico: os adversários ganham ou perdem até 0,35 passos/s conforme vão atrás ou à frente do humano.
- Recorde (melhor tempo) em `localStorage` (`downforce-v1`). `downforce.html?demo=1&t=S` corre com piloto automático e adianta S segundos.

## Super Pilotos by Noah (ação e desporto)

- Cópia do Downforce (estrada, voltas, mapa; desenho duplicado de propósito) pedida pelo utilizador, com outro motor. Estado no global `S`; simula-se em Node com `novaCorrida({ humano: false })`.
- **12 pilotos** (`PILOTOS`, com número e equipa): Meninos (azul) — Noah 23 (o jogador), Duarte 55, Tomás 1, Madis 33, Rafael 52, Leo 17; Meninas (rosa) — Isabel 9, Sira 12, Yara 20, Bia 2, Alice 7, Luisa 15. O número vai desenhado na traseira do carro. Aqui o Tomás leva acento (pedido assim).
- **Dificuldade sorteada**: em cada corrida os 11 adversários recebem um `nivel` diferente (0–10), que dá o `ritmo` e a `atencao` (probabilidade de ver cada obstáculo). `atrev` (empurrar e atirar a carros) e `sede` (quando vai abastecer) também são sorteados.
- **Sem mudanças nem trânsito**: o jogador vai sempre a `V_MAX`. 3 voltas, 5 faixas. Mantém-se o elástico do Downforce.
- **Obstáculos** (`S.obstaculos`, sorteados em cada corrida, em filas de `ESP_FILAS` passos com uma faixa sempre livre): `pedra`, `tronco` (tapa 2 faixas) e `animal` (anda de lado, `x`/`vx`; vai sozinho na fila) param o carro e dão `TEMPO_IMUNE`; `poca` corta a velocidade para 45 %; `salto` põe o carro no ar `TEMPO_AR` segundos (não vira, não dispara, não bate em nada) e aterra a 80 %.
- **Laser** (`disparar(c)`): `LASERS` (12) por piloto para a corrida toda. Acerta na primeira coisa à frente na faixa, até `ALCANCE_LASER`: pedras e troncos desaparecem até ao fim da corrida, os animais fogem (`foge`), um carro perde 70 % da velocidade. Poças e saltos não contam. Sem alvo não dispara nem gasta.
- **Caixas surpresa** (`S.caixas`, filas fixas em `CAIXAS_POS`, voltam `TEMPO_CAIXA` segundos depois de apanhadas): servem para quem vai atrás alcançar a frente. `abrirCaixa(c)` guarda o prémio em `c.premio` (um de cada vez; quem já tem um não apanha outra caixa): um `turbo` ou, 65 % das vezes, um `missil`. Só sai com `usarPremio(c)`: o turbo (`c.turbo`, +`TURBO_V`) dura mais quanto pior o lugar; o míssil (`S.misseis`) persegue o piloto imediatamente à frente na classificação, acerta sempre e deixa-o parado `TEMPO_SECO` (como sem gasolina); sem ninguém à frente fica guardado. A barra de espaços chama `acao()`: usa o prémio se puder, senão dispara o laser. Os automáticos usam-no passado `c.usa` segundos. O prémio guardado aparece em `#hud-premio` e no botão de toque. **Quem vai em primeiro não apanha caixas** (a caixa fica lá). `&premio=missil|turbo` no modo demo deixa um guardado, para capturas.
- **Grelha**: `novaCorrida({ grelha })` recebe os ids pela ordem de partida; a interface passa a classificação da corrida anterior, guardada em `localStorage` (campo `grelha`). Sem ela, o jogador parte de trás e os outros por sorteio.
- **Empurrões**: `mover()` empurra para a faixa seguinte quem estiver ao lado (`aoLado`, em cadeia com `empurrar`); só recusa se o empurrado ficasse fora da estrada.
- **Gasolina** (`c.comb`, 0–100, todos os pilotos): gasta `CONSUMO` por passo. Há duas faixas de abastecimento fixas por volta (`POSTOS`, faixa −1 à esquerda e `FAIXAS` à direita) que dão `CARGA` por passo; quem lá estiver quando acabam, bate. A zero o carro fica parado `TEMPO_SECO` e volta com 40.
- As distâncias entre carros usam `adiante()` (posição na volta), por isso um carro dobrado também estorva.
- No fim, cada lugar dá pontos à equipa (12 ao primeiro … 1 ao último; `pontosEquipas()`). Recorde em `localStorage` (`superpilotos-v1`). `superpilotos.html?demo=1&t=S` como no Downforce.

## Interface e estilo

- Tema escuro de feltro verde, títulos em serifa dourada. Painéis «de vidro» com contorno luminoso: a cor vem da variável `--tom` (dourado por omissão; cada jogo/cartão pode mudá-la).
- Tamanho das cartas: variável `--cw` em `:root`, calculada a partir da largura e altura da janela para a mesa caber sem scroll. `--ch` e `--raio` derivam dela e são recalculadas em cada elemento (regra em `*`), para se poder mudar `--cw` localmente.
- Pontuação numa barra no fundo da janela. Caixa do trunfo no canto superior direito, dentro da grelha da mesa.
- **Telemóvel** (`max-width: 620px`): barra do topo numa linha com textos curtos (`.t-curto`/`.t-longo`), cartas maiores e mão em grelha com **duas filas quando há mais de 6 cartas** (o número de colunas vem de regras `:has(> :last-child:nth-child(n))`).
- As cartas escurecidas usam `filter`, que cria contexto de empilhamento: por isso todas as cartas da mão têm `position: relative` e as jogáveis `z-index: 1` (em telemóvel sem `z-index`, para a fila de cima não tapar a de baixo).
- Efeitos de `:hover` ficam dentro de `@media (hover: hover)`, para não ficarem presos depois de um toque.
- Resultados em curso guardados em `localStorage` (`sueca-v1`, `bisca-v1`, `copas-v1`, `cinquillo-v1`); o Peixinho não guarda nada.
- **Nomes de classes**: o `style.css` é único e partilhado, por isso uma classe nova pode colidir com uma antiga sem dar por isso (`.ultima` do diálogo da última vaza deu margem a uma casa do tabuleiro do Cinquillo). Antes de criar uma classe genérica, procurar o nome no `style.css`.
- `classList.toggle(nome, valor)` com `valor` `undefined` alterna a classe em vez de a tirar: passar sempre um booleano (`Boolean(...)`).

## Verificar alterações

Não há testes automáticos. Antes de dar uma alteração por feita:

1. **Simular o motor em Node**, IA contra IA, e verificar os invariantes (pontos totais, número de vazas, jogadas legais, cartas contadas). Exemplo:
   ```
   node -e 'const S=require("./sueca.js"); for(let k=0;k<1000;k++){S.novaPartida(); while(!S.G.fim){const p=S.G.vez; if(S.jogar(p,S.escolherCarta(p)).completa) S.fecharVaza()} if(S.G.pontos[0]+S.G.pontos[1]!==120) throw "soma"}'
   ```
2. **Ver a interface** em computador e em telemóvel (390×664 e 360×560), por exemplo com capturas do Chrome em modo headless.

## Publicar

- Só fazer `git commit` e `git push` quando o utilizador pedir. O site atualiza-se sozinho um a dois minutos depois do push.
- O GitHub Pages manda os browsers guardarem os ficheiros 10 minutos. **Sempre que mudar CSS ou JS, subir o número de versão** em todas as ligações (`style.css?v=N`, `*.js?v=N`) de todos os ficheiros HTML; a versão atual é `v=18`.
- Os commits usam o email `noreply` do GitHub (configuração local do repositório), para não expor o email pessoal.
