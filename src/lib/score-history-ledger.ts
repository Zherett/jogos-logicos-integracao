// Módulo de Histórico de Pontuação e Ledger de Auditoria (Extrato de Pontuação)
// Registra detalhadamente toda pontuação recebida por alunos (XP, Medalhas, Pontos de Ranqueada, Pontos de Carreira e Moedas)
// com origem, justificativa, metadados e data/hora para auditoria aprofundada, retroatribuição e resolução de bugs.

import { nickSlug } from "./player-profile.ts";
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
  | "primeiro_jogo"
  | "promocao_nivel"
  | "promocao_torneio"
  | "recorde"
  | "evento"
  | "correio"
  | "codigo_promocional"
  | "conversao_moedas"
  | "ajuste_adm"
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
const MAX_TOTAL_ENTRIES = 3000;

let inMemoryLedger: ScoreLedgerEntry[] = [];

/**
 * Higieniza o ledger de auditoria removendo transações duplicadas geradas por loops anômalos
 * (por exemplo, múltiplas concessões da mesma medalha a cada 1 segundo para o mesmo aluno).
 */
export function sanitizeScoreLedgerEntries(entries: ScoreLedgerEntry[]): ScoreLedgerEntry[] {
  if (!Array.isArray(entries)) return [];
  const seenMedalKeys = new Set<string>();
  const cleaned: ScoreLedgerEntry[] = [];

  for (const entry of entries) {
    if (!entry) continue;
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

      if (seenMedalKeys.has(key)) {
        // Ignora duplicata fantasma em loop
        continue;
      }
      seenMedalKeys.add(key);
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

function saveAllLedgerEntries(entries: ScoreLedgerEntry[]): void {
  // Mantém os mais recentes respeitando o limite global
  const trimmed = entries.slice(-MAX_TOTAL_ENTRIES);
  inMemoryLedger = trimmed;
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(LEDGER_STORAGE_KEY, JSON.stringify(trimmed));
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
  const fullEntry: ScoreLedgerEntry = {
    id: entry.id || `tx_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
    playerId: nickSlug(entry.playerId || entry.playerNick || "desconhecido"),
    playerNick: entry.playerNick || entry.playerId || "Jogador",
    type: entry.type,
    source: entry.source,
    amount: Math.round(entry.amount),
    balanceAfter: entry.balanceAfter !== undefined ? Math.round(entry.balanceAfter) : undefined,
    reason: entry.reason || "Pontuação recebida",
    metadata: entry.metadata,
    timestamp: entry.timestamp || new Date().toISOString(),
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
  const baseTimestamp = profile.created_at || new Date().toISOString();

  const allMedals = getAllAvailableMedals();
  const medalMap = new Map(allMedals.map((m) => [m.id, m]));

  let currentPtsSum = 0;
  let currentXpSum = 0;

  // 1. Reconstituição de Medalhas Conquistadas
  if (Array.isArray(profile.unlockedMedals)) {
    for (const m of profile.unlockedMedals) {
      if (!m) continue;
      const mId = typeof m === "string" ? m : (m?.medalId ?? (m as any)?.id ?? "");
      if (!mId) continue;
      const def = medalMap.get(mId);
      const title = def?.title || mId;
      const rarity = (def?.rarity || (m as any)?.rarity || "bronze") as MedalRarity;
      const ptsReward = RECONSTRUCT_MEDAL_POINTS[rarity] ?? 20;
      const xpReward = MEDAL_XP_REWARDS[rarity] ?? 10;
      const ts = typeof m === "object" && m.unlockedAt ? m.unlockedAt : baseTimestamp;

      // Evento de medalha
      results.push({
        id: `syn_med_${mId}`,
        playerId: cleanId,
        playerNick,
        type: "medal",
        source: "medalha",
        amount: 1,
        reason: `Medalha Conquistada: ${title}`,
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
          id: `syn_stat_xp_${stat.game_id}`,
          playerId: cleanId,
          playerNick,
          type: "xp",
          source: stat.mode === "torneio_semanal" ? "torneio_semanal" : "partida",
          amount: estimatedXp,
          reason: `Partidas em ${gName} (${stat.plays} partidas, ${stat.wins} vitórias)`,
          metadata: { gameId: stat.game_id, score: stat.best_score },
          timestamp: stat.last_played || baseTimestamp,
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

  return results.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
}

/**
 * Retorna as transações de histórico de um jogador específico, ordenadas da mais recente para a mais antiga.
 * Suporta fallback inteligente de reconstrução sintética se o log local estiver vazio nesta máquina.
 */
export function getPlayerScoreLedger(
  playerId: string,
  filter?: Omit<ScoreLedgerFilter, "playerId">,
  playerProfile?: PlayerProfile | null,
): ScoreLedgerEntry[] {
  if (!playerId) return [];
  const cleanId = nickSlug(playerId);
  const localEntries = getAllScoreLedger({ ...filter, playerId: cleanId });

  if (localEntries.length > 0) {
    return localEntries;
  }

  // Fallback quando não há registros locais salvos no browser da máquina atual
  const target = playerProfile;
  if (
    target &&
    ((target.xp ?? 0) > 0 ||
      (target.careerPoints ?? 0) > 0 ||
      (target.unlockedMedals?.length ?? 0) > 0 ||
      (target.stats?.length ?? 0) > 0)
  ) {
    const synthetic = reconstructStudentLedgerFromProfile(target);
    let filtered = synthetic;
    if (filter?.type) {
      filtered = filtered.filter((e) => e.type === filter.type);
    }
    if (filter?.source) {
      filtered = filtered.filter((e) => e.source === filter.source);
    }
    if (filter?.search) {
      const sLower = filter.search.toLowerCase().trim();
      filtered = filtered.filter(
        (e) =>
          e.reason.toLowerCase().includes(sLower) ||
          e.playerNick.toLowerCase().includes(sLower) ||
          e.source.toLowerCase().includes(sLower),
      );
    }
    if (filter?.limit && filter.limit > 0) {
      filtered = filtered.slice(0, filter.limit);
    }
    return filtered;
  }

  return [];
}

/**
 * Consulta e filtra transações do ledger para auditoria geral de administradores ou visualização detalhada.
 */
export function getAllScoreLedger(filter?: ScoreLedgerFilter): ScoreLedgerEntry[] {
  const all = loadAllLedgerEntries();
  const cleanPlayerId = filter?.playerId ? nickSlug(filter.playerId) : undefined;
  const searchLower = filter?.search?.toLowerCase().trim();

  let results = all.filter((entry) => {
    if (!entry) return false;
    if (cleanPlayerId) {
      const matchPId = nickSlug(entry.playerId || "") === cleanPlayerId;
      const matchPNick = nickSlug(entry.playerNick || "") === cleanPlayerId;
      if (!matchPId && !matchPNick) {
        return false;
      }
    }
    if (filter?.type && entry.type !== filter.type) {
      return false;
    }
    if (filter?.source && entry.source !== filter.source) {
      return false;
    }
    if (filter?.gameId && entry.metadata?.gameId !== filter.gameId) {
      return false;
    }
    if (filter?.startDate && (entry.timestamp || "") < filter.startDate) {
      return false;
    }
    if (filter?.endDate && (entry.timestamp || "") > filter.endDate) {
      return false;
    }
    if (searchLower) {
      const matchNick = (entry.playerNick || "").toLowerCase().includes(searchLower);
      const matchReason = (entry.reason || "").toLowerCase().includes(searchLower);
      const matchMedal = (entry.metadata?.medalTitle || "").toLowerCase().includes(searchLower);
      const matchGame = (entry.metadata?.gameId || "").toLowerCase().includes(searchLower);
      if (!matchNick && !matchReason && !matchMedal && !matchGame) {
        return false;
      }
    }
    return true;
  });

  // Ordena do mais recente para o mais antigo
  results.sort((a, b) => (b.timestamp > a.timestamp ? 1 : b.timestamp < a.timestamp ? -1 : 0));

  if (filter?.limit && filter.limit > 0) {
    results = results.slice(0, filter.limit);
  }

  return results;
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
  totalMedalsAwarded: number;
  transactionsCount: number;
  sourcesBreakdown: Record<ScoreTransactionSource, { xp: number; points: number; count: number }>;
} {
  const cleanId = nickSlug(playerId);
  let entries = loadAllLedgerEntries().filter((e) => {
    if (!e) return false;
    return nickSlug(e.playerId || "") === cleanId || nickSlug(e.playerNick || "") === cleanId;
  });

  if (entries.length === 0) {
    const target = playerProfile;
    if (
      target &&
      ((target.xp ?? 0) > 0 ||
        (target.careerPoints ?? 0) > 0 ||
        (target.unlockedMedals?.length ?? 0) > 0 ||
        (target.stats?.length ?? 0) > 0)
    ) {
      entries = reconstructStudentLedgerFromProfile(target);
    }
  }

  let totalXpFromMatches = 0;
  let totalXpFromMedals = 0;
  let totalXpFromTournament = 0;
  let totalXpFromX1 = 0;
  let totalCareerPoints = 0;
  let totalTournamentPoints = 0;
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
    primeiro_jogo: { xp: 0, points: 0, count: 0 },
    promocao_nivel: { xp: 0, points: 0, count: 0 },
    promocao_torneio: { xp: 0, points: 0, count: 0 },
    recorde: { xp: 0, points: 0, count: 0 },
    evento: { xp: 0, points: 0, count: 0 },
    correio: { xp: 0, points: 0, count: 0 },
    codigo_promocional: { xp: 0, points: 0, count: 0 },
    conversao_moedas: { xp: 0, points: 0, count: 0 },
    ajuste_adm: { xp: 0, points: 0, count: 0 },
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
  primeiro_jogo: { label: "1º Jogo do Dia (+10)", icon: "Flame", badgeColor: "bg-orange-500/10 text-orange-600 border-orange-500/30" },
  promocao_nivel: { label: "Subida de Nível", icon: "Sparkles", badgeColor: "bg-yellow-500/10 text-yellow-600 border-yellow-500/30" },
  promocao_torneio: { label: "Promoção de Liga", icon: "Crown", badgeColor: "bg-amber-500/10 text-amber-600 border-amber-500/30" },
  recorde: { label: "Novo Recorde (+15)", icon: "Star", badgeColor: "bg-cyan-500/10 text-cyan-600 border-cyan-500/30" },
  evento: { label: "Bônus de Evento", icon: "Zap", badgeColor: "bg-indigo-500/10 text-indigo-600 border-indigo-500/30" },
  correio: { label: "Recompensa Postal", icon: "Mail", badgeColor: "bg-pink-500/10 text-pink-600 border-pink-500/30" },
  codigo_promocional: { label: "Código Promocional", icon: "KeyRound", badgeColor: "bg-fuchsia-500/10 text-fuchsia-600 border-fuchsia-500/30" },
  conversao_moedas: { label: "Conversão em Moedas", icon: "Coins", badgeColor: "bg-amber-500/10 text-amber-600 border-amber-500/30" },
  ajuste_adm: { label: "Ajuste pelo ADM", icon: "Shield", badgeColor: "bg-slate-500/10 text-slate-600 border-slate-500/30" },
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
