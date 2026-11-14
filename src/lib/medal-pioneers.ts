// Modulo de Deteccao de Pioneiros das Medalhas (Primeiro Aluno a Conquistar)
// Realiza retroverificacao deterministica em toda a base de alunos.
// Regra mandataria: Ignora perfis de teste da administracao (ZHERET e LORD) e contas de administradores.

import { isPioneerExcludedAccount } from "./player-profile.ts";
import type { PlayerProfile } from "./playfab.ts";

export interface MedalPioneer {
  medalId: string;
  studentId: string;
  studentNick: string;
  studentFullName: string;
  studentSchool: string;
  studentGrade?: string | null;
  studentTurma?: string | null;
  unlockedAt: string;
  timestampMs: number;
}

let cachedPioneersMap: Record<string, MedalPioneer> | null = null;
let lastPioneersComputeAt = 0;
let lastPioneersPlayersCount = -1;

/**
 * Computa de forma pura e deterministica os primeiros alunos a conquistarem cada medalha.
 * Ignora estritamente contas de teste ZHERET e LORD (usadas pelo ADM para testes com jogadores comuns) e ADMs.
 */
export function computeMedalPioneers(players: PlayerProfile[]): Record<string, MedalPioneer> {
  const pioneers: Record<string, MedalPioneer> = {};

  if (!Array.isArray(players) || players.length === 0) {
    return pioneers;
  }

  for (const player of players) {
    // 1. Ignora contas de teste ZHERET e LORD, alem de administradores
    if (isPioneerExcludedAccount(player)) {
      continue;
    }
    // 2. Ignora contas na lixeira ou suspensas
    if (player.deletedAt) {
      continue;
    }

    const unlocked = player.unlockedMedals;
    if (!Array.isArray(unlocked) || unlocked.length === 0) {
      continue;
    }

    for (const um of unlocked) {
      if (!um.medalId || !um.unlockedAt) continue;

      const timeMs = Date.parse(um.unlockedAt);
      if (Number.isNaN(timeMs) || timeMs <= 0) continue;

      const current = pioneers[um.medalId];
      if (!current || timeMs < current.timestampMs) {
        pioneers[um.medalId] = {
          medalId: um.medalId,
          studentId: player.id,
          studentNick: player.nick,
          studentFullName: player.full_name,
          studentSchool: player.school,
          studentGrade: player.grade,
          studentTurma: player.turma,
          unlockedAt: um.unlockedAt,
          timestampMs: timeMs,
        };
      }
    }
  }

  return pioneers;
}

/**
 * Retorna os pioneiros cacheados ou recalcula se necessario
 */
export function getCachedMedalPioneers(players?: PlayerProfile[]): Record<string, MedalPioneer> {
  const now = Date.now();
  if (
    cachedPioneersMap &&
    now - lastPioneersComputeAt < 60000 &&
    (!players || players.length === 0 || players.length === lastPioneersPlayersCount)
  ) {
    return cachedPioneersMap;
  }
  if (players && players.length > 0) {
    cachedPioneersMap = computeMedalPioneers(players);
    lastPioneersComputeAt = now;
    lastPioneersPlayersCount = players.length;
    return cachedPioneersMap;
  }
  return cachedPioneersMap ?? {};
}

/**
 * Invalida cache de pioneiros para forcar novo calculo quando novas medalhas sao salvas
 */
export function invalidatePioneersCache(): void {
  cachedPioneersMap = null;
  lastPioneersComputeAt = 0;
  lastPioneersPlayersCount = -1;
}

/**
 * Formata texto amigavel para exibicao no tooltip ou modal da medalha
 */
export function formatPioneerLabel(pioneer?: MedalPioneer | null): {
  hasPioneer: boolean;
  title: string;
  description: string;
  dateFormatted?: string;
} {
  if (!pioneer) {
    return {
      hasPioneer: false,
      title: "Medalha Inédita",
      description: "Nenhum aluno da rede conquistou esta medalha ainda. Seja o primeiro!",
    };
  }

  let dateFormatted = pioneer.unlockedAt;
  try {
    const d = new Date(pioneer.timestampMs);
    dateFormatted = d.toLocaleDateString("pt-BR", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    // fallback
  }

  return {
    hasPioneer: true,
    title: `Pioneiro: ${pioneer.studentNick}`,
    description: `Primeiro a conquistar: ${pioneer.studentFullName} (${pioneer.studentSchool}) em ${dateFormatted}.`,
    dateFormatted,
  };
}
