import type { PlayerProfile } from "./playfab.ts";
import { isSpecialAdminAccount } from "./playfab.ts";

/** Incremento de pontos por dia seguido na ofensiva (a partir do 2º dia consecutivo) */
export const DAILY_STREAK_BONUS_STEP = 5;

/** Teto máximo diário do bônus extra de ofensiva */
export const DAILY_STREAK_BONUS_CAP = 100;

/** Configuração de um dia específico na trilha de 7 dias */
export interface DailyRewardTier {
  day: number;
  title: string;
  points: number;
  xp: number;
  milestoneMedalId?: string;
  /** Preparação para o sistema de baús especiais */
  chestReward?: {
    enabled: boolean;
    chestId: string;
    label: string;
    icon: string;
  };
}

/** Tabela progressiva oficial de 7 dias da Semana */
export const DAILY_REWARDS_SCHEDULE: readonly DailyRewardTier[] = [
  {
    day: 1,
    title: "Boas-Vindas à Semana",
    points: 25,
    xp: 10,
  },
  {
    day: 2,
    title: "Aquecendo os Motores",
    points: 30,
    xp: 15,
  },
  {
    day: 3,
    title: "Hábito Formado",
    points: 40,
    xp: 25,
    milestoneMedalId: "streak_3_days",
  },
  {
    day: 4,
    title: "Foco Redobrado",
    points: 50,
    xp: 35,
  },
  {
    day: 5,
    title: "Disciplina de Campeão",
    points: 65,
    xp: 50,
    milestoneMedalId: "streak_5_days",
  },
  {
    day: 6,
    title: "Reta Final",
    points: 80,
    xp: 70,
  },
  {
    day: 7,
    title: "Constância Lendária!",
    points: 120,
    xp: 100,
    milestoneMedalId: "streak_7_days",
    chestReward: {
      enabled: true,
      chestId: "weekly_epic_chest",
      label: "Grande Baú Semanal (Em Breve)",
      icon: "Gift",
    },
  },
] as const;

/**
 * Calcula o bônus extra de pontos por ofensiva de dias consecutivos:
 * - 1º dia (ou retorno após falta): 0 pts
 * - 2º dia seguido: +5 pts
 * - 3º dia seguido: +10 pts
 * - ... até o teto máximo de 100 pts (21+ dias seguidos).
 */
export function getStreakBonusPoints(consecutiveDays?: number): number {
  const safeDays = Math.max(1, Math.floor(consecutiveDays ?? 1));
  const rawBonus = (safeDays - 1) * DAILY_STREAK_BONUS_STEP;
  return Math.min(DAILY_STREAK_BONUS_CAP, Math.max(0, rawBonus));
}

/**
 * Calcula o dia atual (1 a 7) na trilha de Check-in Acumulativo.
 * O progresso nunca regride ao faltar um dia:
 * - Se ainda não coletou hoje, retorna o próximo passo disponível (totalCheckIns % 7 + 1).
 * - Se já coletou hoje, mantém exibindo o passo recém-coletado.
 */
export function getCumulativeCheckInDay(
  totalCheckIns?: number,
  isTodayClaimed = false,
): number {
  const count = Math.max(0, Math.floor(totalCheckIns ?? 0));
  if (count === 0) return 1;
  if (isTodayClaimed) {
    const mod = count % 7;
    return mod === 0 ? 7 : mod;
  }
  return (count % 7) + 1;
}

/**
 * Retorna quantos ciclos completos de 7 check-ins o jogador já concluiu.
 */
export function getCompletedCyclesCount(totalCheckIns?: number): number {
  const safeCount = Math.max(0, Math.floor(totalCheckIns ?? 0));
  return Math.floor(safeCount / 7);
}

/**
 * Helper legado/compatível que resolve o passo atual do ciclo a partir do perfil.
 * Usa `activeDates.length` como contagem acumulativa de dias enquanto o campo
 * dedicado de check-in não estiver ativo em produção.
 */
export function getCurrentCycleDay(
  streakOrCount?: number,
  isTodayClaimed = false,
): number {
  return getCumulativeCheckInDay(streakOrCount, isTodayClaimed);
}

/** Estado de exibição de um dia na lista do modal */
export type DailyRewardDayStatus = "collected" | "today" | "locked";

/**
 * Calcula o status de cada um dos 7 dias para visualização na UI.
 *
 * @param day Dia na tabela (1 a 7)
 * @param currentDay Passo ativo no ciclo acumulativo (1 a 7)
 * @param isTodayClaimed Se a recompensa do dia de hoje já foi resgatada
 */
export function getDayStatus(
  day: number,
  currentDay: number,
  isTodayClaimed = false,
): DailyRewardDayStatus {
  if (day < currentDay) {
    return "collected";
  }
  if (day === currentDay) {
    return isTodayClaimed ? "collected" : "today";
  }
  return "locked";
}

/**
 * Controle de acesso restrito (Feature Flag de Segurança):
 * Apenas Administradores e contas especiais de teste da administração
 * podem visualizar o botão do calendário e abrir o modal de recompensas diárias.
 */
export function canAccessDailyRewardsPreview(
  profile?: Partial<PlayerProfile> | null,
  isAdmin = false,
): boolean {
  if (isAdmin) return true;
  if (!profile) return false;
  if (profile.isAdmin) return true;
  if (isSpecialAdminAccount(profile)) return true;

  const nick = String(profile.nickNormalized || profile.nick || "").toLowerCase().trim();
  const testAccounts = ["zheret", "admin", "semed_admin", "josiney", "quemuel", "lord"];
  return testAccounts.includes(nick);
}
