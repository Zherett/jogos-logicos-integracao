# Desafios de Lógica — Projeto INTEGRAÇÃO (SEMED Coari)

Plataforma educacional gamificada voltada para alunos do **5º ao 9º ano do Ensino Fundamental** (e comunidade em modo livre), idealizada pelo **Projeto INTEGRAÇÃO — SEMED Coari**.

Construída como uma **SPA estática** (**Vite + React 19 + TypeScript + Tailwind CSS v4**) para **GitHub Pages** com backend em nuvem no **Microsoft Azure PlayFab**, a plataforma conta com **11 jogos educativos**, além de **Arena X1 (1v1)**, **Torneio Semanal Ranqueado**, **Álbum de Cartas Colecionáveis**, **Baús**, **Loja de Cosméticos**, **Jornal Oficial**, **Caixa de Entrada**, **Ranking Geral/Escola/Jogo**, **Modo Equipes** e **Painel do Administrador (ADM)**.

---

## Escolas Participantes (SEMED Coari)

1. **Raimundo Bezerra** (6º ao 9º ano)
2. **Agenor Smith** (6º ao 9º ano)
3. **Elisângela Litaiff** (5º ano)
4. **Raimunda Cruz** (5º ano)
5. **Maria de Nazaré** (5º ano)
6. **Ursulina Souza** (5º ano)

*(Alunos de outras escolas ou participantes da comunidade podem selecionar `Outro` ou `Nenhuma` na etapa correspondente.)*

---

## Catálogo dos 11 Jogos

| Jogo | ID | Descrição |
| :--- | :---: | :--- |
| **Lógica Matemática** | `logica` | Proposições de Verdadeiro ou Falso contra o tempo (4 níveis) |
| **Plano Cartesiano** | `cartesiano` | Localização de pontos e coordenadas no plano cartesiano |
| **Formas e Cores** | `formas` | Reconhecimento e encaixe de formas geométricas por cor e tamanho |
| **Memória das Cores** | `memoria` | Sequências visuais e sonoras progressivas |
| **Caça às Variáveis** | `variaveis` | Resolução de incógnitas com arrastar e soltar |
| **RoboGrid** | `robogrid` | Localização espacial e movimentação em tabuleiro 10×10 |
| **Desafio das Partes** | `porcentagem` | Porcentagens (barras, pizza, réguas, problemas) e Frações |
| **Campo Minado Lógico** | `minado` | Tabuleiro lógico com cartas de desafio e cartas bônus |
| **Completando a Lógica** | `completar` | Complete expressões arrastando operadores e digitando números |
| **Batalha de Robôs** | `rpg` | Duelo tático em turnos: derrote oponentes resolvendo desafios de lógica |
| **Space Quest** | `spacequest` | Aventura espacial em 5 fases de exploração e resolução de enigmas lógicos |

> **Códigos e Acesso Administrativo:** os códigos de liberação das atividades e o acesso ao **Painel ADM** (`#/admin` ou botão **ADM**) são configurados e gerenciados exclusivamente via variáveis de ambiente (`VITE_ADMIN_PIN`, `VITE_PLAYFAB_TITLE_ID`) e sincronização no PlayFab/Painel ADM.

---

## Como Rodar Localmente

```bash
npm ci --legacy-peer-deps
npm run dev
```

Comandos de verificação:

```bash
npm run typecheck
npm test
npm run lint
npm run format:check
npm run build
```

---

## Publicação no GitHub Pages e Microsoft Azure PlayFab

1. **GitHub Pages Automático:**
   - O workflow [`.github/workflows/deploy.yml`](./.github/workflows/deploy.yml) instala dependências com `npm ci --legacy-peer-deps`, executa `npm run typecheck`, `npm test`, gera o build estático em `dist/` (com `.nojekyll` e redirecionamento SPA em `404.html`) e publica no GitHub Pages.
   - No GitHub, acesse **Settings → Pages** e em **Build and deployment > Source**, selecione **GitHub Actions**.
2. **Microsoft Azure PlayFab:**
   - Crie um título gratuito em [developer.playfab.com](https://developer.playfab.com).
   - Em **Settings → API Features**, desmarque *"Require both username and email"*.
   - Em **Automation → CloudScript**, publique o conteúdo de [`playfab/cloudscript.js`](./playfab/cloudscript.js) para validação no servidor e sincronização de configurações do ADM.
   - Defina `VITE_PLAYFAB_TITLE_ID` e `VITE_ADMIN_PIN` nas variáveis/secrets do repositório no GitHub Actions.
