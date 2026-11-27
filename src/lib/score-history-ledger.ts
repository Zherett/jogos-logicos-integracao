// Módulo de Histórico de Pontuação e Ledger de Auditoria (Extrato de Pontuação)
// Registra detalhadamente toda pontuação recebida por alunos (XP, Medalhas, Pontos de Ranqueada, Pontos de Carreira e Moedas)
// com origem, justificativa, metadados e data/hora para auditoria aprofundada, retroatribuição e resolução de bugs.

import { nickSlug } from "./player-profile.ts";
import { getOfficialNow } from "./official-time.ts";
import { safeLocalStorageSet } from "./storage-guard.ts";
import type { PlayerProfile } from "./playfab.ts";
import { getAllAvailableMedals, MEDAL_XP_REWARDS, type MedalRarity } from "./medals-catalog.ts";
import { GAME_NAMES } from "./game-storage.ts";

const RECONSTRUCT_MEDAL_POINTS: Record<string, number> = {
  bronze: 20,
  prata: 30,
  ouro: 50,
  platina: 100,
  diamante: 150,
  heroi: 150,
  secreta: 150,
};

const RECONSTRUCT_LEVEL_POINTS: Record<number, number> = {
  2: 30,
  3: 40,
  4: 50,
  5: 75,
  6: 100,
  7: 150,
  8: 200,
  9: 300,
  10: 500,
};

export type ScoreTransactionType =
  | "xp"
  | "career_points"
  | "points_balance"
  | "tournament_pts"
  | "medal"
  | "coins";

export type ScoreTransactionSource =
  | "partida"
  | "torneio_semanal"
  | "arena_x1"
  | "medalha"
  | "login_diario"
  | "recompensa_diaria"
  | "missao_diaria"
  | "missao_semanal"
  | "bau"
  | "retroatribuicao"
  | "compra_loja"
  | "primeiro_jogo"
  | "promocao_nivel"
  | "promocao_torneio"
  | "recorde"
  | "evento"
  | "correio"
  | "codigo_promocional"
  | "conversao_moedas"
  | "ajuste_adm"
  | "reconciliacao"
  | "sanitizacao";

export interface ScoreLedgerEntry {
  id: string;
  playerId: string;
  playerNick: string;
  type: ScoreTransactionType;
  source: ScoreTransactionSource;
  amount: number;
  balanceAfter?: number;
  reason: string;
  metadata?: {
    gameId?: string;
    mode?: string;
    score?: number;
    level?: number;
    medalId?: string;
    medalTitle?: string;
    messageId?: string;
    eventId?: string;
    adminUser?: string;
  };
  timestamp: string;
}

export interface ScoreLedgerFilter {
  playerId?: string;
  type?: ScoreTransactionType;
  source?: ScoreTransactionSource;
  gameId?: string;
  search?: string;
  startDate?: string;
  endDate?: string;
  limit?: number;
}

const LEDGER_STORAGE_KEY = "desafios_score_history_ledger_v1";
const MAX_ENTRIES_PER_PLAYER = 150;
export const MAX_CLOUD_ENTRIES_PER_PLAYER = 80;
const MAX_TOTAL_ENTRIES = 3000;

let inMemoryLedger: ScoreLedgerEntry[] = [];

/**
 * Funde múltiplas listas de transações de um jogador (ex.: localStorage + nuvem PlayFab),
 * deduplicando por `id`, higienizando loops de medalha e mantendo os lançamentos mais recentes.
 */
export function mergePlayerScoreLedgerEntries(
  lists: Array<ScoreLedgerEntry[] | undefined | null>,
  limit = MAX_CLOUD_ENTRIES_PER_PLAYER,
): ScoreLedgerEntry[] {
  const byId = new Map<string, ScoreLedgerEntry>();
  for (const list of lists) {
    if (!Array.isArray(list)) continue;
    for (const entry of list) {
      if (!entry || !entry.id || !entry.type) continue;
      if (!byId.has(entry.id)) {
        byId.set(entry.id, entry);
      }
    }
  }
  const merged = sanitizeScoreLedgerEntries(Array.from(byId.values()));
  merged.sort((a, b) => (a.timestamp > b.timestamp ? 1 : a.timestamp < b.timestamp ? -1 : 0));
  return limit > 0 && merged.length > limit ? merged.slice(-limit) : merged;
}

/**
 * Recupera as entradas brutas gravadas no navegador local para um jogador (usado ao sincronizar o extrato na nuvem).
 */
export function getPlayerRawLedgerEntries(
  playerId: string,
  limit = MAX_CLOUD_ENTRIES_PER_PLAYER,
): ScoreLedgerEntry[] {
  if (!playerId) return [];
  const cleanId = nickSlug(playerId);
  const all = loadAllLedgerEntries().filter(
    (e) => e && (nickSlug(e.playerId || "") === cleanId || nickSlug(e.playerNick || "") === cleanId),
  );
  return mergePlayerScoreLedgerEntries([all], limit);
}

/**
 * Higieniza o ledger de auditoria removendo transações duplicadas geradas por loops anômalos
 * (por exemplo, múltiplas concessões da mesma medalha a cada 1 segundo para o mesmo aluno).
 */
export function sanitizeScoreLedgerEntries(entries: ScoreLedgerEntry[]): ScoreLedgerEntry[] {
  if (!Array.isArray(entries)) return [];
  const stackableIds = new Set(
    getAllAvailableMedals()
      .filter((m) => m.isStackable)
      .map((m) => m.id),
  );
  const seenNonStackable = new Set<string>();
  const lastBurstMs = new Map<string, number>();
  const BURST_WINDOW_MS = 60_000;
  const cleaned: ScoreLedgerEntry[] = [];

  const isBurstDuplicate = (key: string, timestamp?: string): boolean => {
    const tsMs = Date.parse(timestamp || "");
    const prevMs = lastBurstMs.get(key);
    if (prevMs !== undefined) {
      if (!Number.isFinite(tsMs) || !Number.isFinite(prevMs) || Math.abs(tsMs - prevMs) <= BURST_WINDOW_MS) {
        if (Number.isFinite(tsMs)) {
          lastBurstMs.set(key, tsMs);
        }
        return true;
      }
    }
    lastBurstMs.set(key, tsMs);
    return false;
  };

  for (const entry of entries) {
    if (!entry) continue;

    if (entry.type === "coins") {
      const pId = nickSlug(entry.playerId || entry.playerNick || "");
      const coinKey = `${pId}_coins_${entry.metadata?.medalId || entry.reason || "generic"}`;
      if (isBurstDuplicate(coinKey, entry.timestamp)) {
        continue;
      }
      cleaned.push(entry);
      continue;
    }

    // Identifica registros de medalha repetidos em loop
    const isMedalEntry =
      entry.source === "medalha" ||
      entry.type === "medal" ||
      (typeof entry.reason === "string" && entry.reason.includes("Medalha"));

    if (isMedalEntry) {
      const pId = nickSlug(entry.playerId || entry.playerNick || "");
      const medalKey =
        entry.metadata?.medalId ||
        (entry.reason?.includes("Campeão Semanal")
          ? "tournament_top_1_gold"
          : entry.reason?.replace(/[^a-zA-Z0-9_]/g, "_") || "unknown");
      const key = `${pId}_${medalKey}_${entry.type}`;

      const isStackable =
        stackableIds.has(medalKey) || medalKey.startsWith("tournament_top_");

      if (isStackable) {
        if (isBurstDuplicate(key, entry.timestamp)) {
          continue;
        }
      } else {
        if (seenNonStackable.has(key)) {
          continue;
        }
        seenNonStackable.add(key);
      }
    }

    cleaned.push(entry);
  }

  return cleaned;
}

function loadAllLedgerEntries(): ScoreLedgerEntry[] {
  if (typeof window === "undefined") return inMemoryLedger;
  try {
    const raw = window.localStorage.getItem(LEDGER_STORAGE_KEY);
    if (!raw) return inMemoryLedger;
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      const sanitized = sanitizeScoreLedgerEntries(parsed);
      if (sanitized.length !== parsed.length) {
        saveAllLedgerEntries(sanitized);
      }
      inMemoryLedger = sanitized;
      return sanitized;
    }
    return inMemoryLedger;
  } catch {
    return inMemoryLedger;
  }
}

export const MAX_LEDGER_ENTRIES_PER_PLAYER = 150;

/**
 * Aplica retenção justa por aluno (até `maxPerPlayer` transações recentes por aluno)
 * antes de aplicar o teto global, evitando que um único usuário em PC compartilhado
 * apague o extrato dos colegas.
 */
export function trimLedgerFairly(
  entries: ScoreLedgerEntry[],
  maxPerPlayer = MAX_LEDGER_ENTRIES_PER_PLAYER,
  maxTotal = MAX_TOTAL_ENTRIES,
): ScoreLedgerEntry[] {
  if (!Array.isArray(entries) || entries.length === 0) return [];
  const safePerPlayer = Math.max(10, Math.floor(maxPerPlayer));
  const safeMaxTotal = Math.max(safePerPlayer, Math.floor(maxTotal));

  const perPlayerCounts = new Map<string, number>();
  const keptReversed: ScoreLedgerEntry[] = [];

  for (let i = entries.length - 1; i >= 0; i--) {
    const entry = entries[i];
    if (!entry) continue;
    const pKey = nickSlug(entry.playerId || entry.playerNick || "desconhecido") || "desconhecido";
    const count = perPlayerCounts.get(pKey) ?? 0;
    if (count >= safePerPlayer) continue;
    perPlayerCounts.set(pKey, count + 1);
    keptReversed.push(entry);
  }

  let kept = keptReversed.reverse();
  if (kept.length > safeMaxTotal) {
    // Reduz uniformemente o excesso entre jogadores com mais registros preservando o mínimo recente de cada aluno
    const excess = kept.length - safeMaxTotal;
    const finalReversed: ScoreLedgerEntry[] = [];
    const seenPlayers = new Set<string>();
    const playerSlotsUsed = new Map<string, number>();
    const activePlayers = Math.max(1, perPlayerCounts.size);
    const fairCap = Math.max(20, Math.floor(safeMaxTotal / activePlayers));
    let skipped = 0;

    for (let i = kept.length - 1; i >= 0; i--) {
      const entry = kept[i];
      const pKey = nickSlug(entry.playerId || entry.playerNick || "desconhecido") || "desconhecido";
      const used = playerSlotsUsed.get(pKey) ?? 0;
      if (skipped < excess && seenPlayers.has(pKey) && used >= fairCap) {
        skipped++;
        continue;
      }
      seenPlayers.add(pKey);
      playerSlotsUsed.set(pKey, used + 1);
      finalReversed.push(entry);
    }
    kept = finalReversed.reverse();
    if (kept.length > safeMaxTotal) {
      kept = kept.slice(-safeMaxTotal);
    }
  }
  return kept;
}

function saveAllLedgerEntries(entries: ScoreLedgerEntry[]): void {
  const trimmed = trimLedgerFairly(entries, MAX_LEDGER_ENTRIES_PER_PLAYER, MAX_TOTAL_ENTRIES);
  inMemoryLedger = trimmed;
  if (typeof window === "undefined") return;
  try {
    const writeRes = safeLocalStorageSet(LEDGER_STORAGE_KEY, JSON.stringify(trimmed));
    if (!writeRes.ok) {
      console.warn("[ScoreLedger] Falha ao persistir ledger no localStorage:", writeRes.error);
    }
    window.dispatchEvent(
      new CustomEvent("desafios:score-ledger-updated", {
        detail: { count: trimmed.length, lastEntry: trimmed[trimmed.length - 1] },
      }),
    );
  } catch (err) {
    console.warn("[ScoreLedger] Falha ao persistir ledger no localStorage:", err);
  }
}

/**
 * Registra uma nova transação de pontuação no Ledger de Auditoria.
 */
export function recordScoreLedgerEntry(
  entry: Omit<ScoreLedgerEntry, "id" | "timestamp"> & {
    id?: string;
    timestamp?: string;
  },
): ScoreLedgerEntry {
  const numAmount = Number(entry.amount);
  const safeAmount = Number.isFinite(numAmount) ? Math.round(numAmount) : 0;
  const numBalance = entry.balanceAfter !== undefined ? Number(entry.balanceAfter) : undefined;
  const safeBalance =
    numBalance !== undefined && Number.isFinite(numBalance) ? Math.round(numBalance) : undefined;
  const fullEntry: ScoreLedgerEntry = {
    id: entry.id || `tx_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
    playerId: nickSlug(entry.playerId || entry.playerNick || "desconhecido"),
    playerNick: entry.playerNick || entry.playerId || "Jogador",
    type: entry.type,
    source: entry.source,
    amount: safeAmount,
    balanceAfter: safeBalance,
    reason: entry.reason || "Pontuação recebida",
    metadata: entry.metadata,
    timestamp: entry.timestamp || getOfficialNow().toISOString(),
  };

  const all = loadAllLedgerEntries();
  all.push(fullEntry);
  saveAllLedgerEntries(all);

  return fullEntry;
}

/**
 * Reconstitui sinteticamente o extrato de auditoria de um aluno a partir dos dados consolidados do seu perfil
 * (partidas nos minijogos, medalhas desbloqueadas, níveis de progressão e bônus convalidos).
 * Garante que a soma exata de XP e Pontos bata com `profile.xp` e `profile.careerPoints`.
 */
export function reconstructStudentLedgerFromProfile(profile: PlayerProfile): ScoreLedgerEntry[] {
  if (!profile) return [];
  const cleanId = nickSlug(profile.id || profile.nickNormalized || profile.nick || "desconhecido");
  const playerNick = profile.nick || "Jogador";
  const results: ScoreLedgerEntry[] = [];
  const baseTimestamp = profile.createdAt || getOfficialNow().toISOString();

  const allMedals = getAllAvailableMedals();
  const medalMap = new Map(allMedals.map((m) => [m.id, m]));

  let currentPtsSum = 0;
  let currentXpSum = 0;

  // 1. Reconstituição de Medalhas Conquistadas
  if (Array.isArray(profile.unlockedMedals)) {
    for (const m of profile.unlockedMedals) {
      if (!m) continue;
      const legacy = m as { medalId?: string; id?: string; rarity?: MedalRarity; count?: unknown; unlockedAt?: string };
      const mId = typeof m === "string" ? m : (legacy.medalId ?? legacy.id ?? "");
      if (!mId) continue;
      const def = medalMap.get(mId);
      const title = def?.title || mId;
      const rarity = (def?.rarity || legacy.rarity || "bronze") as MedalRarity;
      const rawCount = typeof m === "object" ? Number((m as { count?: unknown }).count) : 1;
      const medalCount = Number.isFinite(rawCount) && rawCount > 1 ? Math.floor(rawCount) : 1;
      const ptsReward = (RECONSTRUCT_MEDAL_POINTS[rarity] ?? 20) * medalCount;
      const xpReward = (MEDAL_XP_REWARDS[rarity] ?? 10) * medalCount;
      const ts = typeof m === "object" && m.unlockedAt ? m.unlockedAt : baseTimestamp;

      // Evento de medalha
      results.push({
        id: `syn_med_${mId}`,
        playerId: cleanId,
        playerNick,
        type: "medal",
        source: "medalha",
        amount: medalCount,
        reason: `Medalha Conquistada: ${title}${medalCount > 1 ? ` (${medalCount}x)` : ""}`,
        metadata: { medalId: mId, medalTitle: title },
        timestamp: ts,
      });

      // XP da medalha
      if (xpReward > 0) {
        results.push({
          id: `syn_med_xp_${mId}`,
          playerId: cleanId,
          playerNick,
          type: "xp",
          source: "medalha",
          amount: xpReward,
          reason: `Bônus de Experiência por Medalha: ${title} (+${xpReward} XP)`,
          metadata: { medalId: mId, medalTitle: title },
          timestamp: ts,
        });
        currentXpSum += xpReward;
      }

      // Pontos do Hall da Fama da medalha
      if (ptsReward > 0) {
        results.push({
          id: `syn_med_pts_${mId}`,
          playerId: cleanId,
          playerNick,
          type: "career_points",
          source: "medalha",
          amount: ptsReward,
          reason: `Pontos do Hall da Fama por Medalha: ${title} (+${ptsReward} pts)`,
          metadata: { medalId: mId, medalTitle: title },
          timestamp: ts,
        });
        currentPtsSum += ptsReward;
      }
    }
  }

  // 2. Reconstituição por Subida de Nível (Elo)
  const currentLvl = Math.min(10, Math.max(1, profile.level ?? 1));
  for (let l = 2; l <= currentLvl; l++) {
    const lvlPts = RECONSTRUCT_LEVEL_POINTS[l] ?? 0;
    if (lvlPts > 0) {
      results.push({
        id: `syn_lvl_${l}`,
        playerId: cleanId,
        playerNick,
        type: "career_points",
        source: "promocao_nivel",
        amount: lvlPts,
        reason: `Promoção para Nível ${l} (+${lvlPts} pts)`,
        timestamp: baseTimestamp,
      });
      currentPtsSum += lvlPts;
    }
  }

  // 3. Reconstituição por Partidas nos Jogos
  if (Array.isArray(profile.stats) && profile.stats.length > 0) {
    for (const stat of profile.stats) {
      if (!stat || stat.plays <= 0) continue;
      const gName = (GAME_NAMES as Record<string, string>)[stat.game_id] || stat.game_id;
      const remainingXp = Math.max(0, (profile.xp ?? 0) - currentXpSum);
      const estimatedXp = Math.min(remainingXp, stat.plays * 18);
      if (estimatedXp > 0) {
        results.push({
          id: `syn_stat_xp_${stat.game_id}_${stat.mode || "padrao"}`,
          playerId: cleanId,
          playerNick,
          type: "xp",
          source: stat.mode === "torneio_semanal" ? "torneio_semanal" : "partida",
          amount: estimatedXp,
          reason: `Partidas em ${gName} (${stat.plays} partidas, ${stat.wins} vitórias)`,
          metadata: { gameId: stat.game_id, mode: stat.mode, score: stat.best_score },
          timestamp: stat.last_played_at || baseTimestamp,
        });
        currentXpSum += estimatedXp;
      }
    }
  }

  // 4. Reconciliação Exata de Saldo (garante bate 100% com careerPoints e xp)
  const totalTargetPts = Math.max(0, profile.careerPoints ?? 0);
  if (totalTargetPts > currentPtsSum) {
    const diffPts = totalTargetPts - currentPtsSum;
    results.push({
      id: `syn_reconcile_pts`,
      playerId: cleanId,
      playerNick,
      type: "career_points",
      source: "partida",
      amount: diffPts,
      reason: `Pontuação Acumulada em Partidas e Desafios (+${diffPts} pts)`,
      timestamp: baseTimestamp,
    });
    currentPtsSum += diffPts;
  }

  const totalTargetXp = Math.max(0, profile.xp ?? 0);
  if (totalTargetXp > currentXpSum) {
    const diffXp = totalTargetXp - currentXpSum;
    results.push({
      id: `syn_reconcile_xp`,
      playerId: cleanId,
      playerNick,
      type: "xp",
      source: "partida",
      amount: diffXp,
      reason: `Experiência Acumulada em Partidas e Atividades (+${diffXp} XP)`,
      timestamp: baseTimestamp,
    });
    currentXpSum += diffXp;
  }

  // 5. Reconstituição da Pontuação Ranqueada (Torneio Semanal/Mensal) para contas legadas sem log detalhado na nuvem
  const targetTourPts = Math.max(0, Math.floor(profile.tournamentPoints ?? 0));
  if (targetTourPts > 0) {
    let accountedTourPts = 0;
    const rankedStats = Array.isArray(profile.stats)
      ? profile.stats.filter((s) => s && s.mode === "torneio_semanal" && (s.plays ?? 0) > 0)
      : [];
    const totalRankedPlays = rankedStats.reduce((sum, s) => sum + Math.max(0, s.plays ?? 0), 0);
    if (rankedStats.length > 0 && totalRankedPlays > 0) {
      for (const st of rankedStats) {
        const gName = (GAME_NAMES as Record<string, string>)[st.game_id] || st.game_id;
        const share = Math.min(
          targetTourPts - accountedTourPts,
          Math.max(1, Math.round((st.plays / totalRankedPlays) * targetTourPts)),
        );
        if (share > 0) {
          accountedTourPts += share;
          results.push({
            id: `syn_tour_pts_${st.game_id}_${st.mode || "torneio_semanal"}`,
            playerId: cleanId,
            playerNick,
            type: "tournament_pts",
            source: "torneio_semanal",
            amount: share,
            balanceAfter: accountedTourPts,
            reason: `Pontos Ranqueados em ${gName} (${st.plays} partidas, ${st.wins} vitórias)`,
            metadata: { gameId: st.game_id, mode: "torneio_semanal", score: st.best_score },
            timestamp: st.last_played_at || baseTimestamp,
          });
        }
      }
    }
    const remainingTourPts = targetTourPts - accountedTourPts;
    if (remainingTourPts > 0) {
      results.push({
        id: `syn_reconcile_tour_pts`,
        playerId: cleanId,
        playerNick,
        type: "tournament_pts",
        source: "torneio_semanal",
        amount: remainingTourPts,
        balanceAfter: targetTourPts,
        reason: `Pontuação Acumulada no Torneio Ranqueado (Temporada #${profile.rankedSeasonId ?? 1})`,
        metadata: { mode: "torneio_semanal" },
        timestamp: profile.lastKnownActivityAt || baseTimestamp,
      });
    }
  }

  return results.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
}

function applyLedgerFilters(
  entries: ScoreLedgerEntry[],
  filter?: Omit<ScoreLedgerFilter, "playerId">,
): ScoreLedgerEntry[] {
  let filtered = entries;
  if (filter?.type) {
    filtered = filtered.filter((e) => e.type === filter.type);
  }
  if (filter?.source) {
    filtered = filtered.filter((e) => e.source === filter.source);
  }
  if (filter?.gameId) {
    filtered = filtered.filter((e) => e.metadata?.gameId === filter.gameId);
  }
  if (filter?.startDate) {
    const startBound = /^\d{4}-\d{2}-\d{2}$/.test(filter.startDate.trim())
      ? new Date(`${filter.startDate.trim()}T00:00:00.000-04:00`).toISOString()
      : filter.startDate;
    filtered = filtered.filter((e) => (e.timestamp || "") >= startBound);
  }
  if (filter?.endDate) {
    const endBound = /^\d{4}-\d{2}-\d{2}$/.test(filter.endDate.trim())
      ? new Date(`${filter.endDate.trim()}T23:59:59.999-04:00`).toISOString()
      : filter.endDate;
    filtered = filtered.filter((e) => (e.timestamp || "") <= endBound);
  }
  if (filter?.search) {
    const sLower = filter.search.toLowerCase().trim();
    if (sLower) {
      filtered = filtered.filter(
        (e) =>
          (e.reason || "").toLowerCase().includes(sLower) ||
          (e.playerNick || "").toLowerCase().includes(sLower) ||
          (e.source || "").toLowerCase().includes(sLower) ||
          (e.metadata?.medalTitle || "").toLowerCase().includes(sLower) ||
          (e.metadata?.gameId || "").toLowerCase().includes(sLower),
      );
    }
  }
  filtered = [...filtered].sort((a, b) =>
    b.timestamp > a.timestamp ? 1 : b.timestamp < a.timestamp ? -1 : 0,
  );
  if (filter?.limit && filter.limit > 0) {
    filtered = filtered.slice(0, filter.limit);
  }
  return filtered;
}

function collectUnifiedPlayerLedgerEntries(
  playerId: string,
  playerProfile?: PlayerProfile | null,
): ScoreLedgerEntry[] {
  const cleanId = nickSlug(playerId);
  const localRaw = loadAllLedgerEntries().filter(
    (e) => e && (nickSlug(e.playerId || "") === cleanId || nickSlug(e.playerNick || "") === cleanId),
  );
  const cloudRaw = Array.isArray(playerProfile?.scoreLedger) ? playerProfile!.scoreLedger : [];
  let unified = mergePlayerScoreLedgerEntries([cloudRaw, localRaw], MAX_ENTRIES_PER_PLAYER);

  const target = playerProfile;
  if (
    unified.length === 0 &&
    target &&
    ((target.xp ?? 0) > 0 ||
      (target.careerPoints ?? 0) > 0 ||
      (target.tournamentPoints ?? 0) > 0 ||
      (target.unlockedMedals?.length ?? 0) > 0 ||
      (target.stats?.length ?? 0) > 0)
  ) {
    return reconstructStudentLedgerFromProfile(target);
  }

  // Se já existem registros de XP/medalha mas ainda não há nenhum lançamento `tournament_pts`
  // para um aluno legado com pontuação ranqueada ativa, complementa com a reconstituição ranqueada.
  if (
    target &&
    (target.tournamentPoints ?? 0) > 0 &&
    !unified.some((e) => e.type === "tournament_pts")
  ) {
    const syntheticTour = reconstructStudentLedgerFromProfile(target).filter(
      (e) => e.type === "tournament_pts",
    );
    if (syntheticTour.length > 0) {
      unified = mergePlayerScoreLedgerEntries([unified, syntheticTour], MAX_ENTRIES_PER_PLAYER);
    }
  }

  return unified;
}

/**
 * Retorna as transações de histórico de um jogador específico, ordenadas da mais recente para a mais antiga.
 * Combina o extrato sincronizado na nuvem (`profile.scoreLedger`) com registros locais e fallback sintético.
 */
export function getPlayerScoreLedger(
  playerId: string,
  filter?: Omit<ScoreLedgerFilter, "playerId">,
  playerProfile?: PlayerProfile | null,
): ScoreLedgerEntry[] {
  if (!playerId) return [];
  const unified = collectUnifiedPlayerLedgerEntries(playerId, playerProfile);
  return applyLedgerFilters(unified, filter);
}

/**
 * Consulta e filtra transações do ledger para auditoria geral de administradores ou visualização detalhada.
 */
export function getAllScoreLedger(filter?: ScoreLedgerFilter): ScoreLedgerEntry[] {
  const all = loadAllLedgerEntries();
  const cleanPlayerId = filter?.playerId ? nickSlug(filter.playerId) : undefined;
  const scoped = cleanPlayerId
    ? all.filter(
        (entry) =>
          entry &&
          (nickSlug(entry.playerId || "") === cleanPlayerId ||
            nickSlug(entry.playerNick || "") === cleanPlayerId),
      )
    : all.filter(Boolean);
  return applyLedgerFilters(scoped, filter);
}

/**
 * Calcula o detalhamento consolidado da origem das pontuações de um aluno.
 * Se não houver logs gravados no navegador local, reconstrói o detalhamento com base no perfil consolidado.
 */
export function calculateStudentScoreBreakdown(
  playerId: string,
  playerProfile?: PlayerProfile | null,
): {
  totalXpFromMatches: number;
  totalXpFromMedals: number;
  totalXpFromTournament: number;
  totalXpFromX1: number;
  totalCareerPoints: number;
  totalTournamentPoints: number;
  totalCoins: number;
  totalMedalsAwarded: number;
  transactionsCount: number;
  sourcesBreakdown: Record<ScoreTransactionSource, { xp: number; points: number; count: number }>;
} {
  const entries = collectUnifiedPlayerLedgerEntries(playerId, playerProfile);

  let totalXpFromMatches = 0;
  let totalXpFromMedals = 0;
  let totalXpFromTournament = 0;
  let totalXpFromX1 = 0;
  let totalCareerPoints = 0;
  let totalTournamentPoints = 0;
  let totalCoins = 0;
  let totalMedalsAwarded = 0;

  const sourcesBreakdown: Record<
    ScoreTransactionSource,
    { xp: number; points: number; count: number }
  > = {
    partida: { xp: 0, points: 0, count: 0 },
    torneio_semanal: { xp: 0, points: 0, count: 0 },
    arena_x1: { xp: 0, points: 0, count: 0 },
    medalha: { xp: 0, points: 0, count: 0 },
    login_diario: { xp: 0, points: 0, count: 0 },
    recompensa_diaria: { xp: 0, points: 0, count: 0 },
    missao_diaria: { xp: 0, points: 0, count: 0 },
    missao_semanal: { xp: 0, points: 0, count: 0 },
    bau: { xp: 0, points: 0, count: 0 },
    retroatribuicao: { xp: 0, points: 0, count: 0 },
    compra_loja: { xp: 0, points: 0, count: 0 },
    primeiro_jogo: { xp: 0, points: 0, count: 0 },
    promocao_nivel: { xp: 0, points: 0, count: 0 },
    promocao_torneio: { xp: 0, points: 0, count: 0 },
    recorde: { xp: 0, points: 0, count: 0 },
    evento: { xp: 0, points: 0, count: 0 },
    correio: { xp: 0, points: 0, count: 0 },
    codigo_promocional: { xp: 0, points: 0, count: 0 },
    conversao_moedas: { xp: 0, points: 0, count: 0 },
    ajuste_adm: { xp: 0, points: 0, count: 0 },
    reconciliacao: { xp: 0, points: 0, count: 0 },
    sanitizacao: { xp: 0, points: 0, count: 0 },
  };

  for (const tx of entries) {
    if (!sourcesBreakdown[tx.source]) {
      sourcesBreakdown[tx.source] = { xp: 0, points: 0, count: 0 };
    }
    sourcesBreakdown[tx.source].count++;

    if (tx.type === "xp") {
      sourcesBreakdown[tx.source].xp += tx.amount;
      if (tx.source === "partida") totalXpFromMatches += tx.amount;
      else if (tx.source === "medalha") totalXpFromMedals += tx.amount;
      else if (tx.source === "torneio_semanal") totalXpFromTournament += tx.amount;
      else if (tx.source === "arena_x1") totalXpFromX1 += tx.amount;
    } else if (tx.type === "career_points") {
      sourcesBreakdown[tx.source].points += tx.amount;
      totalCareerPoints += tx.amount;
    } else if (tx.type === "tournament_pts") {
      totalTournamentPoints += tx.amount;
    } else if (tx.type === "coins") {
      totalCoins += tx.amount;
    } else if (tx.type === "medal") {
      totalMedalsAwarded += Math.max(1, tx.amount);
    }
  }

  return {
    totalXpFromMatches,
    totalXpFromMedals,
    totalXpFromTournament,
    totalXpFromX1,
    totalCareerPoints,
    totalTournamentPoints,
    totalCoins,
    totalMedalsAwarded,
    transactionsCount: entries.length,
    sourcesBreakdown,
  };
}

/** Rótulos amigáveis em português para fontes de transação */
export const TRANSACTION_SOURCE_LABELS: Record<ScoreTransactionSource, { label: string; icon: string; badgeColor: string }> = {
  partida: { label: "Partida Concluída", icon: "Gamepad2", badgeColor: "bg-blue-500/10 text-blue-600 border-blue-500/30" },
  torneio_semanal: { label: "Torneio Ranqueado", icon: "Trophy", badgeColor: "bg-amber-500/10 text-amber-600 border-amber-500/30" },
  arena_x1: { label: "Arena X1 Versus", icon: "Swords", badgeColor: "bg-red-500/10 text-red-600 border-red-500/30" },
  medalha: { label: "Bônus de Medalha", icon: "Medal", badgeColor: "bg-purple-500/10 text-purple-600 border-purple-500/30" },
  login_diario: { label: "Login Diário (+25)", icon: "Calendar", badgeColor: "bg-emerald-500/10 text-emerald-600 border-emerald-500/30" },
  recompensa_diaria: { label: "Recompensa Diária", icon: "Calendar", badgeColor: "bg-amber-500/10 text-amber-600 border-amber-500/30" },
  missao_diaria: { label: "Missão Diária", icon: "CheckCircle", badgeColor: "bg-blue-500/10 text-blue-600 border-blue-500/30" },
  missao_semanal: { label: "Missão Semanal", icon: "Trophy", badgeColor: "bg-amber-500/10 text-amber-600 border-amber-500/30" },
  bau: { label: "Abertura de Baú", icon: "Gift", badgeColor: "bg-emerald-500/10 text-emerald-600 border-emerald-500/30" },
  retroatribuicao: { label: "Retroatribuição", icon: "Coins", badgeColor: "bg-yellow-500/10 text-yellow-600 border-yellow-500/30" },
  compra_loja: { label: "Compra na Loja", icon: "BadgeDollarSign", badgeColor: "bg-rose-500/10 text-rose-600 border-rose-500/30" },
  primeiro_jogo: { label: "1º Jogo do Dia (+10)", icon: "Flame", badgeColor: "bg-orange-500/10 text-orange-600 border-orange-500/30" },
  promocao_nivel: { label: "Subida de Nível", icon: "Sparkles", badgeColor: "bg-yellow-500/10 text-yellow-600 border-yellow-500/30" },
  promocao_torneio: { label: "Promoção de Liga", icon: "Crown", badgeColor: "bg-amber-500/10 text-amber-600 border-amber-500/30" },
  recorde: { label: "Novo Recorde (+15)", icon: "Star", badgeColor: "bg-cyan-500/10 text-cyan-600 border-cyan-500/30" },
  evento: { label: "Bônus de Evento", icon: "Zap", badgeColor: "bg-indigo-500/10 text-indigo-600 border-indigo-500/30" },
  correio: { label: "Recompensa Postal", icon: "Mail", badgeColor: "bg-pink-500/10 text-pink-600 border-pink-500/30" },
  codigo_promocional: { label: "Código Promocional", icon: "KeyRound", badgeColor: "bg-fuchsia-500/10 text-fuchsia-600 border-fuchsia-500/30" },
  conversao_moedas: { label: "Conversão em Moedas", icon: "Coins", badgeColor: "bg-amber-500/10 text-amber-600 border-amber-500/30" },
  ajuste_adm: { label: "Ajuste pelo ADM", icon: "Shield", badgeColor: "bg-slate-500/10 text-slate-600 border-slate-500/30" },
  reconciliacao: { label: "Reconciliação", icon: "CheckCircle", badgeColor: "bg-teal-500/10 text-teal-600 border-teal-500/30" },
  sanitizacao: { label: "Correção de Sistema", icon: "CheckCircle", badgeColor: "bg-teal-500/10 text-teal-600 border-teal-500/30" },
};

/** Rótulos amigáveis para tipo de recurso modificado */
export const TRANSACTION_TYPE_LABELS: Record<ScoreTransactionType, { label: string; unit: string; symbol: string }> = {
  xp: { label: "Experiência (XP)", unit: "XP", symbol: "⚡" },
  career_points: { label: "Pontos de Conquista", unit: "pts", symbol: "🪙" },
  points_balance: { label: "Saldo de Pontos", unit: "pts", symbol: "🪙" },
  tournament_pts: { label: "Pontos de Ranqueada", unit: "pts", symbol: "🏆" },
  medal: { label: "Medalha Conquistada", unit: "medalha", symbol: "🎖️" },
  coins: { label: "Moedas", unit: "moedas", symbol: "💰" },
};
