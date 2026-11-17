import type { PlayerProfile } from "./playfab.ts";
import { isSpecialAdminAccount } from "./playfab.ts";

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
 * Retorna o dia do ciclo atual (1 a 7) baseado na sequência de atividade do jogador.
 * Ciclos completados reiniciam no dia 1 automaticamente:
 * Ex: 1 dia = Dia 1, 7 dias = Dia 7, 8 dias = Dia 1 do próximo ciclo.
 */
export function getCurrentCycleDay(streakDays?: number): number {
  const safeStreak = Math.max(1, Math.floor(streakDays ?? 1));
  const modulo = safeStreak % 7;
  return modulo === 0 ? 7 : modulo;
}

/**
 * Retorna quantos ciclos completos de 7 dias o jogador já concluiu.
 */
export function getCompletedCyclesCount(streakDays?: number): number {
  const safeStreak = Math.max(0, Math.floor(streakDays ?? 0));
  return Math.floor(safeStreak / 7);
}

/** Estado de exibição de um dia na lista do modal */
export type DailyRewardDayStatus = "collected" | "today" | "locked";

/**
 * Calcula o status de cada um dos 7 dias para visualização na UI.
 *
 * @param currentDay Dia ativo no ciclo (1 a 7)
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
