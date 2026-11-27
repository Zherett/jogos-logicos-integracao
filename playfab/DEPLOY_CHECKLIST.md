# Checklist Único de Publicação no PlayFab Game Manager (Onda 3)

Este roteiro consolida todas as configurações de backend no **Microsoft Azure PlayFab** após a conclusão das Ondas 0, 1, 2 e 3 do frontend.

---

## Passo 1 — Publicar a Revisão `3.0.0` do CloudScript

1. Acesse o título no [PlayFab Game Manager](https://developer.playfab.com).
2. Vá em **Automation → CloudScript → Revisions (Legacy)**.
3. Copie integralmente o conteúdo de [`playfab/cloudscript.js`](./cloudscript.js) e cole no editor da revisão.
4. Clique em **Save and deploy revision**.

---

## Passo 2 — Configurar Administradores no Servidor (`TitleInternalData`)

O CloudScript v3 valida administradores via `isAuthorizedAdmin(currentPlayerId)` antes de executar ações privilegiadas (`SavePlatformAdminConfig`, `AdminResetSeason`, `AdminResetRankedSeason`, `AdminAdjustRankedPoints`, `AdminListPromoCodes`, `AdminSavePromoCodes`, `AdminPurgeStudentAccount`):

1. No Game Manager, vá em **Title Data → Internal Data** (`TitleInternalData`, invisível para jogadores).
2. Crie ou edite a chave **`AdminPlayFabIds`**.
3. Defina o valor como array JSON contendo os `PlayFabId`s reais das contas de administrador (`adminjosiney` e `adminquemuel`):
   ```json
   ["PLAYFAB_ID_JOSINEY", "PLAYFAB_ID_QUEMUEL"]
   ```
   *(Como fallback secundário por conta, também é possível marcar `UserInternalData["IsAdmin"] = "true"` na conta específica no Game Manager.)*

---

## Passo 3 — Validar Handlers e Bloquear Estatísticas via Cliente

1. Após publicar o CloudScript, teste como ADM no Painel ADM (ou via chamada `ExecuteCloudScript`):
   - `GetCloudScriptInfo` deve retornar `version: "3.0.0"`.
   - `VerifyAdminSession` logado como `adminjosiney` / `adminquemuel` deve retornar `isAdmin: true`.
   - O salvamento em abas do Painel ADM e a criação/listagem de códigos promocionais devem responder com `ok: true`.
2. Em seguida, vá em **Settings → API Features** e **desmarque** *"Allow client to post player statistics"* para garantir que todo envio de `XP_Total`, `XP_Season_*`, `Best_*`, `School_*_XP` e `Ranked_Season_*` passe exclusivamente pela validação anti-cheat do CloudScript (`RecordMatchResult` e `RecordRankedMatch`).

---

## Passo 4 — Virada de Temporada: Estatísticas Versionadas e Limpeza de Códigos Legados

1. **Estatísticas Versionadas (Onda 2 / `QUOTA-03`):**
   - Na próxima virada de temporada, ative `useVersionedSeasonStats: true` na configuração (`PlatformAdminConfig`) caso queira utilizar os nomes fixos (`XP_Season_Current`, `XP_Season_etapa_1..3`, `Best_<game>_Current`, `Best_<game>_etapa_1..3`) configurando o reset periódico diretamente em **Leaderboards** no Game Manager, evitando o limite de estatísticas históricas (`_S<N>`).
   - O handler `RecordMatchResult` v3 já aceita ambos os formatos durante a transição.
2. **Encerramento do SharedGroup Público Legado de Códigos Promocionais (`SEC-06`):**
   - Depois de confirmar que todos os códigos ativos foram migrados para `TitleInternalData["PromoCodesCatalog"]` via `AdminSavePromoCodes`, envie `{ catalog, deletedIds, purgeLegacySharedGroup: true }` (ou limpe manualmente o SharedGroup `SEMED_PROMO_CODES_V1`) para remover `promo_codes_catalog` e `promo_codes_deleted_ids` da chave pública legada.

---

## Passo 5 — Exclusão Definitiva LGPD (`LGPD-06`) e Evolução para Azure Functions

1. Ao excluir definitivamente um aluno pela **Lixeira** do Painel ADM (`permanentlyDeleteStudent`), quando o ADM estiver autenticado com `SessionTicket` real no PlayFab, o frontend aciona `AdminPurgeStudentAccount` para limpar `UserData`, `UserReadOnlyData`, `UserInternalData`, registros em `SEMED_STUDENT_ROSTER_V1`, `TOURNAMENT_SEASON_*`, `SEMED_PRESENCE_V3`, `SEMED_ADMIN_NOTIFICATIONS_V1`, `SEMED_GAME_RECORDS_V2`, banir a conta (`BanUsers`) e gravar trilha de auditoria não-PII em `TitleInternalData["LgpdPurgeLog"]`.
2. O Legacy CloudScript não possui método `server.DeleteMasterPlayerAccount`. Para cumprimento integral de remoção física da conta mestre (**LGPD Art. 18, VI**):
   - No curto prazo: utilize o `targetPlayFabId` registrado na auditoria para excluir manualmente em **Players → Delete Master Player Account** no Game Manager;
   - No próximo estágio de servidor: migre os handlers de `playfab/cloudscript.js` para **Azure Functions (PlayFab CloudScript Functions)** utilizando `PlayFabAdminAPI.DeleteMasterPlayerAccount` com a *Title Secret Key* protegida em variáveis de ambiente da Azure, e remova completamente o fluxo `semedvisitante` do frontend.

---

## Passo 6 — Opcional: Enxugar `package.json` e `package-lock.json` em Ambiente com `npm`

A remoção de 35 componentes UI não utilizados em `src/components/ui/`, do `@tanstack/react-query`, do `vite-tsconfig-paths` e de `eslint-plugin-prettier` deixou 31 dependências de produção e 2 de desenvolvimento sem referências no código-fonte. Quando estiver em uma máquina com `npm` conectado, você pode regenerar o `package-lock.json` enxuto executando:

```bash
npm uninstall --legacy-peer-deps @hookform/resolvers @radix-ui/react-accordion @radix-ui/react-aspect-ratio @radix-ui/react-avatar @radix-ui/react-collapsible @radix-ui/react-context-menu @radix-ui/react-dropdown-menu @radix-ui/react-hover-card @radix-ui/react-menubar @radix-ui/react-navigation-menu @radix-ui/react-progress @radix-ui/react-radio-group @radix-ui/react-scroll-area @radix-ui/react-separator @radix-ui/react-slider @radix-ui/react-toggle @radix-ui/react-toggle-group @radix-ui/react-tooltip @tanstack/react-query cmdk date-fns embla-carousel-react input-otp react-day-picker react-hook-form react-resizable-panels recharts sonner vaul vite-tsconfig-paths zod
npm uninstall -D --legacy-peer-deps eslint-config-prettier eslint-plugin-prettier
```
