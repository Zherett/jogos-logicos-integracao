#!/usr/bin/env node
/**
 * Script seguro de auditoria e limpeza de contas fantasmas no PlayFab.
 *
 * Uso:
 *   1) Modo auditoria (dry-run — NÃO apaga nada):
 *      $env:PLAYFAB_SECRET_KEY="SUA_SECRET_KEY"
 *      node scripts/cleanup-playfab-players.mjs
 *
 *   2) Salvar relatório detalhado em JSON para inspeção:
 *      node scripts/cleanup-playfab-players.mjs --report cleanup-report.json
 *
 *   3) Apagar APENAS contas descartáveis antigas ("semedv*", exceto "semedvisitante"):
 *      node scripts/cleanup-playfab-players.mjs --execute
 *
 *   4) Apagar "semedv*" + contas banidas/órfãs fora do roster oficial:
 *      node scripts/cleanup-playfab-players.mjs --execute --include-orphans
 *
 * Segurança:
 * - Nunca salva a Secret Key em arquivo.
 * - Exige confirmação interativa ("CONFIRMAR") antes de excluir qualquer conta.
 * - Protege sempre a conta de serviço "semedvisitante" (1B2E1517154B2D49) e todos os
 *   PlayFabIds presentes no roster oficial (SEMED_STUDENT_ROSTER_V1).
 */

import fs from "node:fs";
import readline from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";

const TITLE_ID = (process.env.PLAYFAB_TITLE_ID || process.env.VITE_PLAYFAB_TITLE_ID || "186F63").trim();
const SECRET_KEY = (process.env.PLAYFAB_SECRET_KEY || "").trim();
const ROSTER_SHARED_GROUP_ID = "SEMED_STUDENT_ROSTER_V1";
const SERVICE_PLAYFAB_ID = "1B2E1517154B2D49";
const SERVICE_USERNAME = "semedvisitante";

const args = new Set(process.argv.slice(2));
const EXECUTE = args.has("--execute");
const INCLUDE_ORPHANS = args.has("--include-orphans");
const AUTO_YES = args.has("--yes");

const reportArgIdx = process.argv.indexOf("--report");
const REPORT_PATH = reportArgIdx !== -1 ? process.argv[reportArgIdx + 1] : null;

if (!SECRET_KEY) {
  console.error("Erro: defina a variável de ambiente PLAYFAB_SECRET_KEY antes de executar.");
  console.error('Exemplo PowerShell: $env:PLAYFAB_SECRET_KEY="SUA_SECRET_KEY"');
  process.exit(1);
}

const BASE_URL = `https://${TITLE_ID}.playfabapi.com`;

async function callPlayFab(area, endpoint, body = {}) {
  const res = await fetch(`${BASE_URL}/${area}/${endpoint}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-SecretKey": SECRET_KEY,
    },
    body: JSON.stringify(body),
  });

  const json = await res.json().catch(() => null);
  if (!res.ok || !json || json.code !== 200) {
    const msg = json?.errorMessage || json?.error || `HTTP ${res.status}`;
    throw new Error(`PlayFab ${area}/${endpoint} falhou: ${msg}`);
  }
  return json.data;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchRosterPlayFabIds() {
  const data = await callPlayFab("Server", "GetSharedGroupData", {
    SharedGroupId: ROSTER_SHARED_GROUP_ID,
    GetMembers: true,
  });

  const rosterIds = new Set();
  const rosterNicks = new Set();
  const entries = data?.Data || {};

  for (const [key, entry] of Object.entries(entries)) {
    try {
      const parsed = JSON.parse(entry?.Value || "{}");
      const pfId = String(parsed.playfabId || parsed.id || "").trim().toUpperCase();
      if (pfId && !pfId.startsWith("PF_LOCAL_")) {
        rosterIds.add(pfId);
      }
      const nickNorm = String(parsed.nickNormalized || key || "").trim().toLowerCase();
      if (nickNorm) rosterNicks.add(nickNorm);
    } catch {
      // ignora entrada malformada
    }
  }

  return { rosterIds, rosterNicks, totalEntries: Object.keys(entries).length };
}

async function findAllPlayersSegmentId() {
  const segData = await callPlayFab("Admin", "GetAllSegments", {});
  const segments = segData?.Segments || [];
  const exact = segments.find((s) => /^all\s*players$/i.test(String(s.Name || "")));
  if (exact) return exact.Id;
  const fallback = segments.find((s) => /all/i.test(String(s.Name || "")));
  if (fallback) return fallback.Id;
  if (segments.length > 0) return segments[0].Id;
  throw new Error("Nenhum segmento encontrado no PlayFab (GetAllSegments retornou vazio).");
}

async function fetchAllPlayerProfiles(segmentId) {
  const players = [];
  let continuationToken = undefined;

  do {
    const page = await callPlayFab("Admin", "GetPlayersInSegment", {
      SegmentId: segmentId,
      MaxBatchSize: 500,
      ...(continuationToken ? { ContinuationToken: continuationToken } : {}),
    });

    if (Array.isArray(page?.PlayerProfiles)) {
      players.push(...page.PlayerProfiles);
    }
    continuationToken = page?.ContinuationToken || undefined;
  } while (continuationToken);

  return players;
}

function isServiceOrAdminProfile(profile) {
  const pfId = String(profile.PlayerId || "").trim().toUpperCase();
  const displayName = String(profile.DisplayName || "").trim().toLowerCase();
  const linked = Array.isArray(profile.LinkedAccounts) ? profile.LinkedAccounts : [];
  const username = String(
    linked.find((a) => a.Platform === "PlayFab")?.Username ||
      linked.find((a) => a.Username)?.Username ||
      "",
  )
    .trim()
    .toLowerCase();

  if (pfId === SERVICE_PLAYFAB_ID || username === SERVICE_USERNAME) {
    return { match: true, reason: "conta de serviço semedvisitante" };
  }
  if (username === "adm" || username.startsWith("admin") || displayName.includes("[adm]")) {
    return { match: true, reason: "conta administrativa" };
  }
  return { match: false, username };
}

async function main() {
  console.log(`Title ID: ${TITLE_ID}`);
  console.log(`Modo: ${EXECUTE ? "EXECUÇÃO (exclusão real após confirmação)" : "DRY-RUN (somente leitura)"}`);
  console.log("1/3 Lendo roster oficial no SharedGroup...");

  const roster = await fetchRosterPlayFabIds();
  console.log(`    -> ${roster.totalEntries} entradas no roster (${roster.rosterIds.size} PlayFabIds válidos).`);

  console.log("2/3 Buscando segmento 'All Players' e listando todas as contas...");
  const segmentId = await findAllPlayersSegmentId();
  const allPlayers = await fetchAllPlayerProfiles(segmentId);
  console.log(`    -> ${allPlayers.length} contas encontradas no PlayFab.`);

  const keepRoster = [];
  const keepServiceAdmin = [];
  const deleteDisposable = [];
  const deleteOrphans = [];

  for (const p of allPlayers) {
    const pfId = String(p.PlayerId || "").trim().toUpperCase();
    const serviceCheck = isServiceOrAdminProfile(p);
    const username = serviceCheck.username || "";
    const isBanned = Boolean(p.BannedUntil);

    const summary = {
      playFabId: pfId,
      username: username || null,
      displayName: p.DisplayName || null,
      created: p.Created || null,
      lastLogin: p.LastLogin || null,
      bannedUntil: p.BannedUntil || null,
    };

    if (serviceCheck.match) {
      keepServiceAdmin.push({ ...summary, reason: serviceCheck.reason });
      continue;
    }

    if (roster.rosterIds.has(pfId)) {
      keepRoster.push(summary);
      continue;
    }

    // Antigas contas descartáveis geradas pelo fallback de visitante ("semedv*")
    if (username.startsWith("semedv") && username !== SERVICE_USERNAME) {
      deleteDisposable.push({ ...summary, reason: "conta descartável semedv*" });
      continue;
    }

    deleteOrphans.push({
      ...summary,
      reason: isBanned ? "conta banida fora do roster" : "conta fora do roster oficial",
    });
  }

  console.log("\n3/3 Resultado da auditoria:");
  console.log(`  [MANTER] Alunos no roster oficial:        ${keepRoster.length}`);
  console.log(`  [MANTER] Serviço / ADM protegidos:        ${keepServiceAdmin.length}`);
  console.log(`  [EXCLUIR] Descartáveis semedv*:           ${deleteDisposable.length}`);
  console.log(
    `  [${INCLUDE_ORPHANS ? "EXCLUIR" : "REVISAR"}] Banidas / fora do roster:     ${deleteOrphans.length}`,
  );

  if (REPORT_PATH) {
    const reportPayload = {
      generatedAt: new Date().toISOString(),
      titleId: TITLE_ID,
      totals: {
        playfabTotal: allPlayers.length,
        keepRoster: keepRoster.length,
        keepServiceAdmin: keepServiceAdmin.length,
        deleteDisposable: deleteDisposable.length,
        orphansOutsideRoster: deleteOrphans.length,
      },
      keepServiceAdmin,
      keepRoster,
      deleteDisposable,
      deleteOrphans,
    };
    fs.writeFileSync(REPORT_PATH, JSON.stringify(reportPayload, null, 2), "utf8");
    console.log(`\nRelatório salvo em: ${REPORT_PATH}`);
  }

  const targets = INCLUDE_ORPHANS ? [...deleteDisposable, ...deleteOrphans] : [...deleteDisposable];

  if (!EXECUTE) {
    console.log("\nDry-run concluído. Nenhuma conta foi alterada.");
    console.log("Para excluir apenas as contas 'semedv*', rode com --execute.");
    console.log("Para excluir também banidas/órfãs após revisar o relatório, rode com --execute --include-orphans.");
    return;
  }

  if (targets.length === 0) {
    console.log("\nNenhuma conta elegível para exclusão com os filtros atuais.");
    return;
  }

  if (!AUTO_YES) {
    const rl = readline.createInterface({ input, output });
    const answer = await rl.question(
      `\nATENÇÃO: ${targets.length} conta(s) serão EXCLUÍDAS DEFINITIVAMENTE do PlayFab.\nDigite CONFIRMAR para prosseguir: `,
    );
    rl.close();
    if (answer.trim() !== "CONFIRMAR") {
      console.log("Operação cancelada pelo usuário.");
      return;
    }
  }

  console.log(`\nExcluindo ${targets.length} conta(s)...`);
  let deleted = 0;
  let failed = 0;

  for (let i = 0; i < targets.length; i++) {
    const t = targets[i];
    try {
      await callPlayFab("Admin", "DeleteMasterPlayerAccount", {
        PlayFabId: t.playFabId,
      });
      deleted++;
      if ((i + 1) % 25 === 0 || i + 1 === targets.length) {
        console.log(`  Progresso: ${i + 1}/${targets.length} (excluídas: ${deleted}, falhas: ${failed})`);
      }
      // Pausa curta para evitar rate limit (429) na Admin API
      await sleep(120);
    } catch (err) {
      failed++;
      console.error(`  Falha ao excluir ${t.playFabId} (${t.username || "sem username"}): ${err.message}`);
      await sleep(400);
    }
  }

  console.log(`\nConcluído. Excluídas: ${deleted} | Falhas: ${failed}`);
}

main().catch((err) => {
  console.error("Erro fatal:", err.message);
  process.exit(1);
});
