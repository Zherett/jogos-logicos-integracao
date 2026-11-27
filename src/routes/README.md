# Routes

Este projeto é uma **SPA estática** construída com **Vite + React + TanStack Router** (usando `createHashHistory()` em [`src/router.tsx`](../router.tsx)). As rotas ficam em `src/routes/`, tendo [`src/routes/__root.tsx`](./__root.tsx) como shell raiz obrigatório com `<HeadContent />` e `<Outlet />`.

## Rotas Atuais

| File | URL (Hash) | Descrição |
| --- | --- | --- |
| [`__root.tsx`](./__root.tsx) | — | Shell raiz (PlayerAuthProvider, `<HeadContent />`, notFound e error boundary) |
| [`index.tsx`](./index.tsx) | `#/` | Hub principal dos jogos, autenticação de alunos, Arena X1, Torneio e Perfil |
| [`ranking.tsx`](./ranking.tsx) | `#/ranking` | Classificação pública por medalhas, pontos, XP, jogos, escolas e torneio ranqueado |
| [`admin.tsx`](./admin.tsx) | `#/admin` | Painel do Administrador (rota dedicada com `noindex, nofollow`) |

## Manutenção Manual de `routeTree.gen.ts`

Como o build usa `@tailwindcss/vite` + `@vitejs/plugin-react` diretamente em SPA estática (sem o plugin de geração automática do TanStack Router no Vite), o arquivo [`src/routeTree.gen.ts`](../routeTree.gen.ts) é **mantido manualmente**. Ao adicionar, renomear ou remover um arquivo de rota em `src/routes/`, atualize `src/routeTree.gen.ts` de forma sincronizada.
