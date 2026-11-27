import { ALL_GAME_IDS, GAME_NAMES, type GameId } from "./game-storage.ts";
import type { PlayerProfile } from "./playfab.ts";
import type { GameStatRow } from "./playfab.ts";
import {
  calculatePlayerLevel,
  getLocalDateKey,
  getPreviousDateKey,
  LEVEL_REQUIREMENTS,
  syncLevelStageProgress,
  type LevelStageProgress,
} from "./player-profile.ts";

export type MedalRarity = "bronze" | "prata" | "ouro" | "platina" | "diamante" | "heroi";

export type MedalCategory =
  | "nivel"
  | "jogo_nivel"
  | "jogo_perfeito"
  | "jogo_partidas"
  | "x1_vitorias"
  | "x1_semanal"
  | "exploracao"
  | "sem_erros"
  | "atividade"
  | "ranking"
  | "economia"
  | "baus"
  | "cartas"
  | "meta"
  | "evento"
  | "secreta";

export const CATEGORY_LABELS: Record<MedalCategory, string> = {
  nivel: "Níveis (1..10)",
  jogo_nivel: "Desafio nos Jogos",
  jogo_perfeito: "Zero Erros",
  jogo_partidas: "Partidas Jogadas",
  x1_vitorias: "Arena X1",
  x1_semanal: "X1 Semanal",
  exploracao: "Exploração",
  sem_erros: "Mente Precisa",
  atividade: "Dias & XP",
  ranking: "Torneio",
  economia: "Loja & Moedas",
  baus: "Baús",
  cartas: "Cartas & Coleção",
  meta: "Meta-Medalhas",
  evento: "Eventos Especiais",
  secreta: "Secretas",
};

export type EventRequirementType =
  | "event_matches"
  | "event_xp"
  | "event_score"
  | "event_level"
  | "event_flawless"
  | "event_x1_wins"
  | "event_combo"
  | "event_daily_cap"
  | "event_team_matches"
  | "event_distinct_games";

export interface EventMedalRequirement {
  type: EventRequirementType;
  threshold: number;
  gameId?: GameId; // se undefined, aplica a todos os jogos
  minScore?: number; // pontuação mínima exigida (especialmente para flawless ou score)
}

export interface MedalCondition {
  type:
    | "player_level"
    | "game_best_level"
    | "game_flawless"
    | "game_match_count"
    | "x1_wins_total"
    | "x1_wins_weekly"
    | "x1_matches_total"
    | "x1_win_streak"
    | "x1_same_school_wins"
    | "x1_other_school_wins"
    | "x1_comeback_after_losses"
    | "completed_games_medals"
    | "distinct_games"
    | "distinct_flawless_games"
    | "distinct_specialist_games"
    | "distinct_games_with_50_matches"
    | "max_daily_xp"
    | "daily_missions_completed"
    | "weekly_missions_completed"
    | "streak_days"
    | "tournament_rank"
    | "tournament_rank_mastery"
    | "all_level_medals"
    | "all_game_medals"
    | "total_medals_count"
    | "beta_tester_bronze"
    | "beta_tester_prata"
    | "beta_tester_ouro"
    | "beta_tester_platina"
    | "beta_tester_heroi"
    | "daily_post_cap_matches"
    | "total_matches_played"
    | "normal_matches_total"
    | "lifetime_coins"
    | "coins_spent_total"
    | "cosmetics_purchased_count"
    | "chests_opened_total"
    | "packs_opened_total"
    | "unique_cards_count"
    | "total_cards_count"
    | "streak_medal_count"
    | "top5_weeks_count"
    | "top1_consecutive_weeks"
    | "manual_event"
    | EventRequirementType;
  threshold?: number;
  gameId?: GameId;
  targetRank?: number; // 1, 2, 3
  targetMedalId?: string;
}

export interface MedalDefinition {
  id: string;
  title: string;
  description: string;
  rarity: MedalRarity;
  category: MedalCategory;
  iconName: string;
  condition: MedalCondition;
  isCustom?: boolean;
  createdByAdmin?: boolean;
  gameId?: GameId;
  isSecret?: boolean;
  /** Quando true, não contabiliza no contador da página do jogo nem para conquistas de completar todas as medalhas do jogo */
  excludeFromGameCompletion?: boolean;
  isStackable?: boolean;
  eventId?: string | null;
  eventName?: string | null;
  eventRequirement?: EventMedalRequirement | null;
}

export function formatEventRequirementLabel(req: EventMedalRequirement): string {
  const gameName = req.gameId ? GAME_NAMES[req.gameId] : null;
  switch (req.type) {
    case "event_matches":
      return gameName
        ? `Jogar ${req.threshold} partida(s) de ${gameName} durante o evento.`
        : `Jogar ${req.threshold} partida(s) em qualquer jogo durante o evento.`;
    case "event_xp":
      return gameName
        ? `Acumular ${req.threshold} XP jogando ${gameName} durante o evento.`
        : `Acumular ${req.threshold} XP em partidas durante o evento.`;
    case "event_score":
      return gameName
        ? `Atingir ${req.threshold} pontos em uma partida de ${gameName} durante o evento.`
        : `Atingir ${req.threshold} pontos em uma partida durante o evento.`;
    case "event_level":
      return gameName
        ? `Alcançar o Nível ${req.threshold} no jogo ${gameName} durante o evento.`
        : `Alcançar o Nível ${req.threshold} em qualquer jogo durante o evento.`;
    case "event_flawless":
      return gameName
        ? `Finalizar ${req.threshold} partida(s) de ${gameName} com zero erros durante o evento.`
        : `Finalizar ${req.threshold} partida(s) com zero erros durante o evento.`;
    case "event_x1_wins":
      return `Vencer ${req.threshold} partida(s) na Arena X1 durante o evento.`;
    case "event_combo":
      return `Acertar ${req.threshold} perguntas consecutivas sem errar durante o evento.`;
    case "event_daily_cap":
      return `Bater o limite diário de XP em pelo menos ${req.threshold} dia(s) durante o evento.`;
    case "event_team_matches":
      return `Disputar ${req.threshold} partida(s) cooperativas no modo Equipes durante o evento.`;
    case "event_distinct_games":
      return `Jogar pelo menos 1 partida em ${req.threshold} jogos diferentes durante o evento.`;
    default:
      return "Concluir os objetivos do evento.";
  }
}

export interface PlayerUnlockedMedal {
  medalId: string;
  unlockedAt: string;
  count?: number;
  lastUnlockedAt?: string;
}

export interface AdminMedalNotification {
  id: string;
  studentId: string;
  studentNick: string;
  studentFullName: string;
  studentSchool: string;
  medalId: string;
  medalTitle: string;
  medalRarity: MedalRarity;
  medalIcon: string;
  unlockedAt: string;
  read?: boolean;
}

/** Pre-set curated icon list available for medals and custom admin creations */
export const AVAILABLE_MEDAL_ICONS = [
  "Trophy",
  "Medal",
  "Award",
  "Crown",
  "Flame",
  "Sparkles",
  "Shield",
  "Star",
  "Target",
  "Zap",
  "Swords",
  "Bot",
  "Gem",
  "Rocket",
  "Heart",
  "Brain",
  "CheckCircle",
  "Crosshair",
  "Compass",
  "Lightbulb",
  "Puzzle",
  "Flag",
  "Bookmark",
  "Clock",
] as const;

/** Rarity styling configurations with neon glow border effects */
export const RARITY_INFO: Record<
  MedalRarity,
  {
    label: string;
    weight: number;
    neonBorderClass: string;
    badgeBgClass: string;
    textColor: string;
    glowHex: string;
  }
> = {
  bronze: {
    label: "Bronze",
    weight: 1,
    neonBorderClass: "border-[#cd7f32] shadow-[0_0_10px_rgba(205,127,50,0.4)]",
    badgeBgClass:
      "bg-[#f7e4d0] dark:bg-[#3b2310] text-[#9a5213] dark:text-[#f5b070] border-[#cd7f32] font-black shadow-xs",
    textColor: "text-[#b8661d] dark:text-[#cd7f32]",
    glowHex: "#cd7f32",
  },
  prata: {
    label: "Prata",
    weight: 2,
    neonBorderClass: "border-slate-400 shadow-[0_0_14px_rgba(148,163,184,0.8)]",
    badgeBgClass:
      "bg-slate-200 dark:bg-slate-700 text-slate-800 dark:text-white border-slate-400 dark:border-slate-500 font-black shadow-xs",
    textColor: "text-slate-700 dark:text-slate-200",
    glowHex: "#94a3b8",
  },
  ouro: {
    label: "Ouro",
    weight: 3,
    neonBorderClass: "border-amber-400 shadow-[0_0_15px_rgba(251,191,36,0.7)]",
    badgeBgClass:
      "bg-amber-100 dark:bg-amber-950 text-amber-800 dark:text-amber-300 border-amber-400 font-black shadow-xs",
    textColor: "text-amber-600 dark:text-amber-400",
    glowHex: "#fbbf24",
  },
  platina: {
    label: "Platina",
    weight: 4,
    neonBorderClass: "border-cyan-400 shadow-[0_0_18px_rgba(34,211,238,0.8)]",
    badgeBgClass:
      "bg-cyan-100 dark:bg-cyan-950 text-cyan-800 dark:text-cyan-300 border-cyan-400 font-black shadow-xs",
    textColor: "text-cyan-600 dark:text-cyan-400",
    glowHex: "#22d3ee",
  },
  diamante: {
    label: "Diamante",
    weight: 5,
    neonBorderClass: "border-fuchsia-400 shadow-[0_0_22px_rgba(232,121,249,0.9)]",
    badgeBgClass:
      "bg-fuchsia-100 dark:bg-fuchsia-950 text-fuchsia-800 dark:text-fuchsia-300 border-fuchsia-400 font-black shadow-xs",
    textColor: "text-fuchsia-600 dark:text-fuchsia-400",
    glowHex: "#e879f9",
  },
  heroi: {
    label: "Herói",
    weight: 6,
    neonBorderClass: "border-red-500 shadow-[0_0_24px_rgba(239,68,68,0.95)]",
    badgeBgClass:
      "bg-red-100 dark:bg-red-950 text-red-700 dark:text-red-300 border-red-500 font-black shadow-xs",
    textColor: "text-red-600 dark:text-red-400",
    glowHex: "#ef4444",
  },
};

/** XP bonus granted to the player immediately upon unlocking a medal of each rarity tier */
export const MEDAL_XP_REWARDS: Record<MedalRarity, number> = {
  bronze: 10,
  prata: 20,
  ouro: 30,
  platina: 40,
  diamante: 50,
  heroi: 100,
};

/** Janela oficial de conquista das medalhas especiais de Beta Tester: 01 a 15 de Novembro de 2026 */
export const BETA_TESTER_START = "2026-11-01T00:00:00.000Z";
export const BETA_TESTER_END = "2026-11-15T23:59:59.999Z";

export function isBetaTesterPeriodActive(now = new Date()): boolean {
  const y = now.getFullYear();
  const m = now.getMonth(); // 10 = Novembro (base 0)
  const d = now.getDate();
  if (y === 2026 && m === 10 && d >= 1 && d <= 15) return true;
  const t = now.getTime();
  return t >= new Date(BETA_TESTER_START).getTime() && t <= new Date(BETA_TESTER_END).getTime();
}

/**
 * Relação oficial das 25 medalhas preservadas no perfil do aluno no encerramento da fase Beta (15/11/2026).
 * Todas as outras ~120 medalhas de atividades e níveis comuns de jogos são revogadas.
 */
export const PRESERVED_BETA_END_MEDAL_IDS: string[] = [
  // 1. Beta Tester (5)
  "beta_tester_bronze",
  "beta_tester_prata",
  "beta_tester_ouro",
  "beta_tester_platina",
  "beta_tester_heroi",
  // 2. Robôs Raros Especiais (2)
  "m_rpg_ametista",
  "m_rpg_carmesim",
  // 3. Space Quest Auras Especiais (4)
  "sq_safira",
  "sq_ametista",
  "sq_rubi",
  "sq_ambar",
  // 4. Ranqueada Pódio e Ligas (9)
  "tournament_top_1_gold",
  "tournament_top_2_silver",
  "tournament_top_3_bronze",
  "tour_master_bronze",
  "tour_master_prata",
  "tour_master_ouro",
  "tour_master_platina",
  "tour_master_diamante",
  "tour_master_mestre",
  // 5. Histórico e Legado de Torneio (5)
  "secret_top5_weeks_2",
  "secret_top5_weeks_4",
  "secret_top1_consecutive_2",
  "secret_top1_consecutive_3",
  "secret_top1_consecutive_4",
];

export const PRESERVED_BETA_END_MEDALS_SET = new Set(PRESERVED_BETA_END_MEDAL_IDS);

export function isMedalPreservedOnBetaEnd(medalId: string): boolean {
  return PRESERVED_BETA_END_MEDALS_SET.has(medalId);
}

/**
 * Builds the complete base medals catalog requested by the user:
 * - 9 Level Medals (Level 2 to 10)
 * - 10 Game Level Medals
 * - 10 Game Flawless (zero erros) Medals
 * - 50 Game Match Count Medals (10, 20, 30, 40, 50 partidas x 10 jogos)
 * - 10 X1 Wins Medals (1 to 10 wins)
 * - 3 X1 Weekly Wins Medals (5, 10, 15 wins)
 * - 3 Exploration Medals (3, 5, 9 games)
 * - 3 Flawless Across Games Medals (3, 5, 8 games)
 * - 1 Max Daily XP Medal
 * - 3 Activity Streak Medals (3, 5, 7 consecutive days)
 * - 3 Ranking Tournament Medals (Top 1 Gold, Top 2 Silver, Top 3 Bronze)
 * - 5 Meta-Medals (Platina & Diamante)
 */
export function buildBaseMedalsCatalog(): MedalDefinition[] {
  const medals: MedalDefinition[] = [];

  // 1. Nível (Nível 2 ao 10 = 9 medalhas)
  for (let lvl = 2; lvl <= 10; lvl++) {
    const rarity: MedalRarity =
      lvl <= 3 ? "bronze" : lvl <= 6 ? "prata" : lvl <= 9 ? "ouro" : "platina";
    medals.push({
      id: `lvl_${lvl}`,
      title: `Nível ${lvl}`,
      description: `Alcance o Nível ${lvl} na plataforma de desafios de lógica.`,
      rarity,
      category: "nivel",
      iconName: lvl === 10 ? "Crown" : "Star",
      condition: { type: "player_level", threshold: lvl },
    });
  }

  // 2. Por Jogo: Nível Alcançado & Zero Erros
  for (const gId of ALL_GAME_IDS) {
    const gName = GAME_NAMES[gId];
    medals.push({
      id: `game_${gId}_lvl_master`,
      title: `Especialista: ${gName}`,
      description: `Alcance o nível 3 ou superior no jogo ${gName}.`,
      rarity: "prata",
      category: "jogo_nivel",
      iconName: "Target",
      gameId: gId,
      condition: { type: "game_best_level", gameId: gId, threshold: 3 },
    });

    medals.push({
      id: `game_${gId}_flawless`,
      title: `Perfeição: ${gName}`,
      description: `Finalize uma partida de ${gName} com pontuação acima de 30 pontos e ZERO erros!`,
      rarity: "ouro",
      category: "jogo_perfeito",
      iconName: "Sparkles",
      gameId: gId,
      condition: { type: "game_flawless", gameId: gId, threshold: 30 },
    });
  }

  // 3. Por Jogo: Quantidade de Partidas (10, 20, 30, 40, 50, 100, 200, 300*, 500* partidas x 10 jogos)
  const matchThresholds = [10, 20, 30, 40, 50, 100, 200, 300, 500];
  const thresholdRarities: MedalRarity[] = [
    "bronze",
    "prata",
    "prata",
    "ouro",
    "platina",
    "diamante",
    "diamante",
    "heroi",
    "heroi",
  ];

  for (const gId of ALL_GAME_IDS) {
    const gName = GAME_NAMES[gId];
    matchThresholds.forEach((count, idx) => {
      const isUltraSecret = count >= 300;
      medals.push({
        id: `game_${gId}_matches_${count}`,
        title: `${gName}: ${count} Partidas`,
        description: isUltraSecret
          ? `Segredo revelado: completou ${count} partidas no jogo ${gName}!`
          : `Complete ${count} partidas no jogo ${gName}.`,
        rarity: thresholdRarities[idx],
        category: isUltraSecret ? "secreta" : "jogo_partidas",
        iconName: count >= 300 ? "Crown" : count >= 100 ? "Trophy" : count === 50 ? "Award" : "Flame",
        gameId: gId,
        isSecret: isUltraSecret,
        excludeFromGameCompletion: isUltraSecret,
        condition: { type: "game_match_count", gameId: gId, threshold: count },
      });
    });
  }

  // 3.1 Partidas Normais Totais (soma de jogos normais, excluindo X1 e Ranqueada)
  const normalGlobalMilestones: Array<{
    count: number;
    rarity: MedalRarity;
    title: string;
    isSecret?: boolean;
  }> = [
    { count: 100, rarity: "ouro", title: "Maratonista de Ouro (100 Partidas)" },
    { count: 200, rarity: "platina", title: "Veterano de Platina (200 Partidas)" },
    { count: 300, rarity: "diamante", title: "Mestre de Diamante (300 Partidas)" },
    { count: 500, rarity: "heroi", title: "Herói das Partidas (500 Partidas)" },
    { count: 1000, rarity: "heroi", title: "Lenda Imortal (1.000 Partidas Normais)", isSecret: true },
  ];
  for (const nm of normalGlobalMilestones) {
    medals.push({
      id: `normal_matches_${nm.count}`,
      title: nm.title,
      description: nm.isSecret
        ? `Segredo revelado: disputou ${nm.count} partidas normais na plataforma (fora X1 e Ranqueada)!`
        : `Dispute ${nm.count} partidas normais em qualquer jogo (não inclui X1 nem Ranqueada).`,
      rarity: nm.rarity,
      category: nm.isSecret ? "secreta" : "jogo_partidas",
      iconName: nm.isSecret ? "Crown" : "Flame",
      isSecret: Boolean(nm.isSecret),
      condition: { type: "normal_matches_total", threshold: nm.count },
    });
  }

  // 4. Arena X1: Participação (1, 10, 20, 30, 50, 100, 300 partidas)
  const x1MatchMilestones: Array<{ count: number; rarity: MedalRarity; title: string }> = [
    { count: 1, rarity: "bronze", title: "Primeiro X1 Disputado" },
    { count: 10, rarity: "bronze", title: "Duelista Constante (10 X1)" },
    { count: 20, rarity: "prata", title: "Veterano de Arena (20 X1)" },
    { count: 30, rarity: "ouro", title: "Combatente Assíduo (30 X1)" },
    { count: 50, rarity: "platina", title: "Gladiador Incansável (50 X1)" },
    { count: 100, rarity: "diamante", title: "Centurião da Arena (100 X1)" },
    { count: 300, rarity: "heroi", title: "Lenda Imortal da Arena (300 X1)" },
  ];
  for (const m of x1MatchMilestones) {
    medals.push({
      id: `x1_matches_${m.count}`,
      title: m.title,
      description:
        m.count === 1
          ? "Dispute sua primeira partida na Arena de Desafio X1 Online."
          : `Dispute ${m.count} partidas na Arena de Desafio X1 Online.`,
      rarity: m.rarity,
      category: "x1_vitorias",
      iconName: "Swords",
      condition: { type: "x1_matches_total", threshold: m.count },
    });
  }

  // 4b. Arena X1: Vitórias Gerais (1, 3, 5, 10, 20, 40, 60, 100 vitórias)
  const x1WinMilestones: Array<{ count: number; rarity: MedalRarity; title: string }> = [
    { count: 1, rarity: "bronze", title: "Primeira Vitória no X1" },
    { count: 3, rarity: "bronze", title: "Gladiador X1 (3 Vitórias)" },
    { count: 5, rarity: "prata", title: "Guerreiro X1 (5 Vitórias)" },
    { count: 10, rarity: "prata", title: "Campeão X1 (10 Vitórias)" },
    { count: 20, rarity: "ouro", title: "Conquistador X1 (20 Vitórias)" },
    { count: 40, rarity: "platina", title: "Soberano X1 (40 Vitórias)" },
    { count: 60, rarity: "diamante", title: "Imperador X1 (60 Vitórias)" },
    { count: 100, rarity: "heroi", title: "Herói Supremo do X1 (100 Vitórias)" },
  ];
  for (const m of x1WinMilestones) {
    medals.push({
      id: `x1_wins_${m.count}`,
      title: m.title,
      description: `Vença ${m.count} ${m.count === 1 ? "partida" : "partidas"} na Arena de Desafio X1 Online.`,
      rarity: m.rarity,
      category: "x1_vitorias",
      iconName: "Swords",
      condition: { type: "x1_wins_total", threshold: m.count },
    });
  }

  // 4c. Arena X1: Sequências de Vitórias (2, 5, 8, 12, 20 vitórias seguidas)
  const x1StreakMilestones: Array<{ count: number; rarity: MedalRarity; title: string }> = [
    { count: 2, rarity: "prata", title: "Dupla Imbatível no X1" },
    { count: 5, rarity: "ouro", title: "Sequência Dourada (5 X1 Seguidos)" },
    { count: 8, rarity: "platina", title: "Imparável na Arena (8 X1 Seguidos)" },
    { count: 12, rarity: "diamante", title: "Domínio Absoluto (12 X1 Seguidos)" },
    { count: 20, rarity: "heroi", title: "Invencível na Arena (20 X1 Seguidos)" },
  ];
  for (const m of x1StreakMilestones) {
    medals.push({
      id: `x1_streak_${m.count}`,
      title: m.title,
      description: `Vença ${m.count} partidas seguidas na Arena de Desafio X1 Online.`,
      rarity: m.rarity,
      category: "x1_vitorias",
      iconName: "Flame",
      condition: { type: "x1_win_streak", threshold: m.count },
    });
  }

  // 4d. Arena X1: Vitórias contra Mesma Escola (1, 5, 10) e Outra Escola (1, 5, 10)
  const x1SameSchoolMilestones: Array<{ count: number; rarity: MedalRarity; title: string }> = [
    { count: 1, rarity: "bronze", title: "Rivalidade Escolar (1 Vitória)" },
    { count: 5, rarity: "prata", title: "Destaque da Escola (5 Vitórias)" },
    { count: 10, rarity: "ouro", title: "Líder da Escola no X1 (10 Vitórias)" },
  ];
  for (const m of x1SameSchoolMilestones) {
    medals.push({
      id: `x1_same_school_${m.count}`,
      title: m.title,
      description: `Vença ${m.count} ${m.count === 1 ? "partida" : "partidas"} no X1 contra jogadores da mesma escola.`,
      rarity: m.rarity,
      category: "x1_vitorias",
      iconName: "Shield",
      condition: { type: "x1_same_school_wins", threshold: m.count },
    });
  }

  const x1OtherSchoolMilestones: Array<{ count: number; rarity: MedalRarity; title: string }> = [
    { count: 1, rarity: "prata", title: "Desafiante Interescolar (1 Vitória)" },
    { count: 5, rarity: "ouro", title: "Embaixador da Escola (5 Vitórias)" },
    { count: 10, rarity: "platina", title: "Campeão Interescolar (10 Vitórias)" },
  ];
  for (const m of x1OtherSchoolMilestones) {
    medals.push({
      id: `x1_other_school_${m.count}`,
      title: m.title,
      description: `Vença ${m.count} ${m.count === 1 ? "partida" : "partidas"} no X1 contra jogadores de outras escolas.`,
      rarity: m.rarity,
      category: "x1_vitorias",
      iconName: "Trophy",
      condition: { type: "x1_other_school_wins", threshold: m.count },
    });
  }

  // 4e. Arena X1: Secretas de Virada (perder 3 ou 5 seguidas e vencer a próxima)
  medals.push(
    {
      id: "x1_secret_comeback_3",
      title: "Fênix da Arena",
      description: "Perca 3 partidas seguidas no X1 e vença a próxima.",
      rarity: "ouro",
      category: "secreta",
      iconName: "Sparkles",
      isSecret: true,
      condition: { type: "x1_comeback_after_losses", threshold: 3 },
    },
    {
      id: "x1_secret_comeback_5",
      title: "Virada Lendária",
      description: "Perca 5 partidas seguidas no X1 e vença a próxima.",
      rarity: "platina",
      category: "secreta",
      iconName: "Crown",
      isSecret: true,
      condition: { type: "x1_comeback_after_losses", threshold: 5 },
    },
  );

  // 5. Arena X1: Desafios Semanais (5, 10, 15 vitórias na semana)
  medals.push(
    {
      id: "x1_weekly_5",
      title: "Guerreiro Semanal do X1",
      description: "Vença 5 batalhas na Arena X1 no período de uma semana.",
      rarity: "prata",
      category: "x1_semanal",
      iconName: "Zap",
      condition: { type: "x1_wins_weekly", threshold: 5 },
    },
    {
      id: "x1_weekly_10",
      title: "Mestre Semanal do X1",
      description: "Vença 10 batalhas na Arena X1 no período de uma semana.",
      rarity: "ouro",
      category: "x1_semanal",
      iconName: "Shield",
      condition: { type: "x1_wins_weekly", threshold: 10 },
    },
    {
      id: "x1_weekly_15",
      title: "Lenda Semanal do X1",
      description: "Vença 15 batalhas na Arena X1 no período de uma semana.",
      rarity: "platina",
      category: "x1_semanal",
      iconName: "Crown",
      condition: { type: "x1_wins_weekly", threshold: 15 },
    },
  );

  // 6. Exploração: Jogos Diferentes (3, 5 e 10 jogos)
  const allGamesThreshold = 10;
  medals.push(
    {
      id: "explore_3_games",
      title: "Curioso da Lógica",
      description: "Jogue pelo menos 3 jogos diferentes na plataforma.",
      rarity: "bronze",
      category: "exploracao",
      iconName: "Compass",
      condition: { type: "distinct_games", threshold: 3 },
    },
    {
      id: "explore_5_games",
      title: "Explorador da Lógica",
      description: "Jogue pelo menos 5 jogos diferentes na plataforma.",
      rarity: "prata",
      category: "exploracao",
      iconName: "Brain",
      condition: { type: "distinct_games", threshold: 5 },
    },
    {
      id: "explore_all_games",
      title: "Mestre de Todos os Jogos",
      description: "Explore e complete partidas em pelo menos 10 jogos diferentes da plataforma.",
      rarity: "ouro",
      category: "exploracao",
      iconName: "Trophy",
      condition: { type: "distinct_games", threshold: 10 },
    },
    {
      id: "complete_1_game",
      title: "Colecionador Completo (1 Jogo)",
      description: "Conquiste todas as medalhas base de pelo menos 1 jogo da plataforma.",
      rarity: "platina",
      category: "exploracao",
      iconName: "Award",
      condition: { type: "completed_games_medals", threshold: 1 },
    },
    {
      id: "complete_2_games",
      title: "Colecionador Mestre (2 Jogos)",
      description: "Conquiste todas as medalhas base de pelo menos 2 jogos diferentes.",
      rarity: "diamante",
      category: "exploracao",
      iconName: "Gem",
      condition: { type: "completed_games_medals", threshold: 2 },
    },
    {
      id: "complete_10_games",
      title: "Herói da Plataforma (10 Jogos)",
      description: "Conquiste todas as medalhas base de pelo menos 10 jogos diferentes.",
      rarity: "heroi",
      category: "exploracao",
      iconName: "Crown",
      condition: { type: "completed_games_medals", threshold: 10 },
    },
  );

  // 7. Jogos Diferentes Sem Errar (3, 5 e 8 jogos)
  medals.push(
    {
      id: "flawless_3_games",
      title: "Mente Precisa (3 Jogos)",
      description: "Conquiste vitória com zero erros em pelo menos 3 jogos diferentes.",
      rarity: "prata",
      category: "sem_erros",
      iconName: "CheckCircle",
      condition: { type: "distinct_flawless_games", threshold: 3 },
    },
    {
      id: "flawless_5_games",
      title: "Mente Cirúrgica (5 Jogos)",
      description: "Conquiste vitória com zero erros em pelo menos 5 jogos diferentes.",
      rarity: "ouro",
      category: "sem_erros",
      iconName: "Crosshair",
      condition: { type: "distinct_flawless_games", threshold: 5 },
    },
    {
      id: "flawless_8_games",
      title: "Inviolável da Lógica (8 Jogos)",
      description: "Conquiste vitória com zero erros em pelo menos 8 jogos diferentes.",
      rarity: "platina",
      category: "sem_erros",
      iconName: "Gem",
      condition: { type: "distinct_flawless_games", threshold: 8 },
    },
  );

  // 8. Máximo de XP Adquirido no Dia
  medals.push({
    id: "max_daily_xp_achieved",
    title: "Potência Diária Máxima",
    description: "Alcance o limite diário completo de XP (1.000 XP) em um único dia.",
    rarity: "ouro",
    category: "atividade",
    iconName: "Zap",
    condition: { type: "max_daily_xp", threshold: 1000 },
  });

  // 9. Sequência Diária de Atividade (3, 5 e 7 dias consecutivos)
  medals.push(
    {
      id: "streak_3_days",
      title: "Hábito Formado (3 Dias)",
      description: "Fique ativo e jogue partidas por 3 dias consecutivos.",
      rarity: "bronze",
      category: "atividade",
      iconName: "Clock",
      isStackable: true,
      condition: { type: "streak_days", threshold: 3 },
    },
    {
      id: "streak_5_days",
      title: "Disciplina de Campeão (5 Dias)",
      description: "Fique ativo e jogue partidas por 5 dias consecutivos.",
      rarity: "prata",
      category: "atividade",
      iconName: "Flame",
      isStackable: true,
      condition: { type: "streak_days", threshold: 5 },
    },
    {
      id: "streak_7_days",
      title: "Constância Lendária (7 Dias)",
      description: "Fique ativo e jogue partidas por 7 dias consecutivos sem falhar nenhum dia!",
      rarity: "ouro",
      category: "atividade",
      iconName: "Rocket",
      isStackable: true,
      condition: { type: "streak_days", threshold: 7 },
    },
  );

  // 9b. Tarefas Diárias Concluídas (3, 15, 30, 90, 150 e 300 tarefas diárias)
  medals.push(
    {
      id: "daily_missions_3",
      title: "Iniciante das Missões (3)",
      description: "Complete 3 tarefas diárias.",
      rarity: "bronze",
      category: "atividade",
      iconName: "CheckCircle",
      condition: { type: "daily_missions_completed", threshold: 3 },
    },
    {
      id: "daily_missions_15",
      title: "Dedicado das Missões (15)",
      description: "Complete 15 tarefas diárias.",
      rarity: "prata",
      category: "atividade",
      iconName: "Target",
      condition: { type: "daily_missions_completed", threshold: 15 },
    },
    {
      id: "daily_missions_30",
      title: "Mestre das Tarefas (30)",
      description: "Complete 30 tarefas diárias.",
      rarity: "ouro",
      category: "atividade",
      iconName: "Award",
      condition: { type: "daily_missions_completed", threshold: 30 },
    },
    {
      id: "daily_missions_90",
      title: "Veterano das Missões (90)",
      description: "Complete 90 tarefas diárias.",
      rarity: "platina",
      category: "atividade",
      iconName: "Star",
      condition: { type: "daily_missions_completed", threshold: 90 },
    },
    {
      id: "daily_missions_150",
      title: "Lenda das Missões (150)",
      description: "Complete 150 tarefas diárias.",
      rarity: "diamante",
      category: "atividade",
      iconName: "Gem",
      condition: { type: "daily_missions_completed", threshold: 150 },
    },
    {
      id: "daily_missions_300",
      title: "Herói das Missões (300)",
      description: "Complete 300 tarefas diárias.",
      rarity: "heroi",
      category: "atividade",
      iconName: "Crown",
      condition: { type: "daily_missions_completed", threshold: 300 },
    },
  );

  // 9c. Missões Semanais Concluídas (2, 4, 12, 20, 32 e 52 missões semanais)
  medals.push(
    {
      id: "weekly_missions_2",
      title: "Iniciante Semanal (2)",
      description: "Complete 2 missões semanais.",
      rarity: "bronze",
      category: "atividade",
      iconName: "CheckCircle",
      condition: { type: "weekly_missions_completed", threshold: 2 },
    },
    {
      id: "weekly_missions_4",
      title: "Ritmo Semanal (4)",
      description: "Complete 4 missões semanais.",
      rarity: "prata",
      category: "atividade",
      iconName: "Target",
      condition: { type: "weekly_missions_completed", threshold: 4 },
    },
    {
      id: "weekly_missions_12",
      title: "Mestre Semanal (12)",
      description: "Complete 12 missões semanais.",
      rarity: "ouro",
      category: "atividade",
      iconName: "Award",
      condition: { type: "weekly_missions_completed", threshold: 12 },
    },
    {
      id: "weekly_missions_20",
      title: "Veterano Semanal (20)",
      description: "Complete 20 missões semanais.",
      rarity: "platina",
      category: "atividade",
      iconName: "Star",
      condition: { type: "weekly_missions_completed", threshold: 20 },
    },
    {
      id: "weekly_missions_32",
      title: "Lenda Semanal (32)",
      description: "Complete 32 missões semanais.",
      rarity: "diamante",
      category: "atividade",
      iconName: "Gem",
      condition: { type: "weekly_missions_completed", threshold: 32 },
    },
    {
      id: "weekly_missions_52",
      title: "Herói Semanal (52)",
      description: "Complete 52 missões semanais.",
      rarity: "heroi",
      category: "atividade",
      iconName: "Crown",
      condition: { type: "weekly_missions_completed", threshold: 52 },
    },
  );

  // 10. Ranking do Torneio Semanal (Top 1 Ouro, Top 2 Prata, Top 3 Bronze)
  medals.push(
    {
      id: "tournament_top_1_gold",
      title: "Campeão Mensal (Ouro)",
      description: "Mantenha o 1º lugar da sua etapa no fechamento da temporada ranqueada.",
      rarity: "ouro",
      category: "ranking",
      iconName: "Trophy",
      condition: { type: "tournament_rank", targetRank: 1 },
    },
    {
      id: "tournament_top_2_silver",
      title: "Vice-Campeão Mensal (Prata)",
      description: "Conquiste o 2º lugar da sua etapa no fechamento da temporada ranqueada.",
      rarity: "prata",
      category: "ranking",
      iconName: "Medal",
      condition: { type: "tournament_rank", targetRank: 2 },
    },
    {
      id: "tournament_top_3_bronze",
      title: "3º Lugar Mensal (Bronze)",
      description: "Conquiste o 3º lugar da sua etapa no fechamento da temporada ranqueada.",
      rarity: "bronze",
      category: "ranking",
      iconName: "Award",
      condition: { type: "tournament_rank", targetRank: 3 },
    },
    // Superação de Rank no Torneio Semanal Ranqueado (Conquistas Únicas no ápice de cada elo)
    {
      id: "tour_master_bronze",
      title: "Dominador do Bronze",
      description: "Alcance o ápice da divisão de Bronze chegando a Bronze III (61+ pts) no Torneio Semanal Ranqueado.",
      rarity: "bronze",
      category: "ranking",
      iconName: "Shield",
      condition: { type: "tournament_rank_mastery", threshold: 61 },
    },
    {
      id: "tour_master_prata",
      title: "Dominador da Prata",
      description: "Alcance o ápice da divisão de Prata chegando a Prata III (191+ pts) no Torneio Semanal Ranqueado.",
      rarity: "prata",
      category: "ranking",
      iconName: "Award",
      condition: { type: "tournament_rank_mastery", threshold: 191 },
    },
    {
      id: "tour_master_ouro",
      title: "Dominador do Ouro",
      description: "Alcance o ápice da divisão de Ouro chegando a Ouro III (381+ pts) no Torneio Semanal Ranqueado.",
      rarity: "ouro",
      category: "ranking",
      iconName: "Star",
      condition: { type: "tournament_rank_mastery", threshold: 381 },
    },
    {
      id: "tour_master_platina",
      title: "Dominador da Platina",
      description: "Alcance o ápice da divisão de Platina chegando a Platina IV (622+ pts) no Torneio Semanal Ranqueado.",
      rarity: "platina",
      category: "ranking",
      iconName: "Sparkles",
      condition: { type: "tournament_rank_mastery", threshold: 622 },
    },
    {
      id: "tour_master_diamante",
      title: "Dominador do Diamante",
      description: "Alcance o ápice da divisão de Diamante chegando a Diamante V (817+ pts) no Torneio Semanal Ranqueado.",
      rarity: "diamante",
      category: "ranking",
      iconName: "Flame",
      condition: { type: "tournament_rank_mastery", threshold: 817 },
    },
    {
      id: "tour_master_mestre",
      title: "Grande Mestre do Torneio",
      description: "Conquiste o prestigiado rank Mestre (850+ pts) no Torneio Semanal Ranqueado!",
      rarity: "heroi",
      category: "ranking",
      iconName: "Crown",
      condition: { type: "tournament_rank_mastery", threshold: 850 },
    },
  );

  // 11. Meta-Medalhas Especiais Sugeridas (Platina & Diamante)
  medals.push(
    {
      id: "meta_all_level_medals",
      title: "Lenda dos Níveis",
      description: "Conquiste todas as 9 medalhas de nível, atingindo o Nível Máximo 10!",
      rarity: "platina",
      category: "meta",
      iconName: "Crown",
      condition: { type: "all_level_medals" },
    },
    {
      id: "meta_polymata_semed",
      title: "Polímata da SEMED",
      description: "Consiga a medalha de perfeição (zero erros) em pelo menos 5 jogos diferentes.",
      rarity: "platina",
      category: "meta",
      iconName: "Brain",
      condition: { type: "distinct_flawless_games", threshold: 5 },
    },
    {
      id: "meta_collector_50",
      title: "Colecionador Supremo",
      description: "Acumule 50 ou mais medalhas distintas no seu inventário!",
      rarity: "diamante",
      category: "meta",
      iconName: "Gem",
      condition: { type: "total_medals_count", threshold: 50 },
    },
  );

  // 12. Medalhas Especiais Beta Tester (Válidas de 01 a 15 de Novembro)
  medals.push(
    {
      id: "beta_tester_bronze",
      title: "Beta Tester Bronze",
      description: "Crie sua conta e complete pelo menos 1 partida finalizada durante o período Beta (01 a 15 de Novembro).",
      rarity: "bronze",
      category: "evento",
      iconName: "Sparkles",
      condition: { type: "beta_tester_bronze" },
    },
    {
      id: "beta_tester_prata",
      title: "Beta Tester Prata",
      description: "Jogue e finalize pelo menos 2 partidas de 4 jogos diferentes durante o período Beta (01 a 15 de Novembro).",
      rarity: "prata",
      category: "evento",
      iconName: "Sparkles",
      condition: { type: "beta_tester_prata", threshold: 4 },
    },
    {
      id: "beta_tester_ouro",
      title: "Beta Tester Ouro",
      description: "Jogue e finalize pelo menos 2 partidas de 6 jogos diferentes durante o período Beta (01 a 15 de Novembro).",
      rarity: "ouro",
      category: "evento",
      iconName: "Sparkles",
      condition: { type: "beta_tester_ouro", threshold: 6 },
    },
    {
      id: "beta_tester_platina",
      title: "Beta Tester Platina",
      description: "Jogue e finalize pelo menos 2 partidas de 10 jogos da plataforma durante o período Beta (01 a 15 de Novembro).",
      rarity: "platina",
      category: "evento",
      iconName: "Crown",
      condition: { type: "beta_tester_platina", threshold: 10 },
    },
    {
      id: "beta_tester_heroi",
      title: "Beta Tester Herói",
      description: "Jogue e finalize pelo menos 10 partidas de 10 jogos e alcance o Nível 5 durante o período Beta (01 a 15 de Novembro).",
      rarity: "heroi",
      category: "evento",
      iconName: "Flame",
      condition: { type: "beta_tester_heroi", threshold: 10 },
    },
  );

  // 13. Medalhas Secretas — Além do Limite (Jogar partidas após atingir o XP diário)
  medals.push(
    {
      id: "post_cap_10",
      title: "Além do Limite: Bronze",
      description: "Jogue 10 partidas no mesmo dia após atingir o limite diário de XP.",
      rarity: "bronze",
      category: "secreta",
      iconName: "Zap",
      condition: { type: "daily_post_cap_matches", threshold: 10 },
      isSecret: true,
    },
    {
      id: "post_cap_30",
      title: "Além do Limite: Prata",
      description: "Jogue 30 partidas no mesmo dia após atingir o limite diário de XP.",
      rarity: "prata",
      category: "secreta",
      iconName: "Zap",
      condition: { type: "daily_post_cap_matches", threshold: 30 },
      isSecret: true,
    },
    {
      id: "post_cap_60",
      title: "Além do Limite: Ouro",
      description: "Jogue 60 partidas no mesmo dia após atingir o limite diário de XP.",
      rarity: "ouro",
      category: "secreta",
      iconName: "Flame",
      condition: { type: "daily_post_cap_matches", threshold: 60 },
      isSecret: true,
    },
    {
      id: "post_cap_100",
      title: "Além do Limite: Platina",
      description: "Jogue 100 partidas no mesmo dia após atingir o limite diário de XP.",
      rarity: "platina",
      category: "secreta",
      iconName: "Crown",
      condition: { type: "daily_post_cap_matches", threshold: 100 },
      isSecret: true,
    },

    // 14. Medalhas Secretas - Constância e Dedicação (Total de partidas disputadas)
    {
      id: "secret_matches_50",
      title: "Constância de Prata",
      description: "Segredo revelado: disputou 50 partidas na plataforma!",
      rarity: "prata",
      category: "secreta",
      iconName: "Shield",
      condition: { type: "total_matches_played", threshold: 50 },
      isSecret: true,
    },
    {
      id: "secret_matches_100",
      title: "Centurião de Ouro",
      description: "Segredo revelado: alcançou a marca de 100 partidas disputadas!",
      rarity: "ouro",
      category: "secreta",
      iconName: "Flame",
      condition: { type: "total_matches_played", threshold: 100 },
      isSecret: true,
    },
    {
      id: "secret_matches_250",
      title: "Mestre da Platina",
      description: "Segredo revelado: disputou 250 partidas na plataforma!",
      rarity: "platina",
      category: "secreta",
      iconName: "Sparkles",
      condition: { type: "total_matches_played", threshold: 250 },
      isSecret: true,
    },
    {
      id: "secret_matches_1000",
      title: "Lenda dos Desafios",
      description: "Segredo supremo revelado: alcançou a lendária marca de 1.000 partidas disputadas!",
      rarity: "heroi",
      category: "secreta",
      iconName: "Crown",
      condition: { type: "total_matches_played", threshold: 1000 },
      isSecret: true,
    },

    // 15. Medalhas Secretas de Domínio no Torneio Semanal (Top 5 e Top 1 Consecutivos)
    {
      id: "secret_top5_weeks_2",
      title: "Guardião do Top 5",
      description: "Segredo revelado: manteve-se no Top 5 do ranking por 2 semanas!",
      rarity: "bronze",
      category: "secreta",
      iconName: "Shield",
      condition: { type: "top5_weeks_count", threshold: 2 },
      isSecret: true,
    },
    {
      id: "secret_top5_weeks_4",
      title: "Pilar do Top 5",
      description: "Segredo revelado: manteve-se no Top 5 do ranking por 4 semanas!",
      rarity: "prata",
      category: "secreta",
      iconName: "Award",
      condition: { type: "top5_weeks_count", threshold: 4 },
      isSecret: true,
    },
    {
      id: "secret_top1_consecutive_2",
      title: "Soberano Consecutivo",
      description: "Segredo revelado: manteve-se no Top 1 do ranking de alunos por 2 semanas consecutivas!",
      rarity: "ouro",
      category: "secreta",
      iconName: "Star",
      condition: { type: "top1_consecutive_weeks", threshold: 2 },
      isSecret: true,
    },

    // 16. Medalhas de Economia: Conseguir Moedas (cumulativo, não desconta gastos)
    ...(
      [
        { threshold: 100, rarity: "bronze", title: "Primeiras Moedas (100)" },
        { threshold: 300, rarity: "bronze", title: "Bolsa Crescendo (300)" },
        { threshold: 500, rarity: "prata", title: "Caça-Tesouros (500)" },
        { threshold: 800, rarity: "prata", title: "Cofre em Alta (800)" },
        { threshold: 1200, rarity: "ouro", title: "Colecionador de Ouro (1.200)" },
        { threshold: 2000, rarity: "platina", title: "Fortuna de Platina (2.000)" },
        { threshold: 3000, rarity: "diamante", title: "Tesouro de Diamante (3.000)" },
        { threshold: 4000, rarity: "diamante", title: "Magnata Diamante (4.000)" },
        { threshold: 5000, rarity: "heroi", title: "Herói da Riqueza (5.000)" },
      ] as Array<{ threshold: number; rarity: MedalRarity; title: string }>
    ).map((m) => ({
      id: `coins_earned_${m.threshold}`,
      title: m.title,
      description: `Conquiste um total acumulado de ${m.threshold.toLocaleString("pt-BR")} moedas na sua conta.`,
      rarity: m.rarity,
      category: "economia" as MedalCategory,
      iconName: m.rarity === "heroi" ? "Crown" : "Sparkles",
      condition: { type: "lifetime_coins" as const, threshold: m.threshold },
    })),

    // 17. Medalhas de Economia: Gastar Moedas na Loja
    ...(
      [
        { threshold: 50, rarity: "bronze", title: "Primeira Compra (50 Moedas)" },
        { threshold: 200, rarity: "bronze", title: "Cliente Fiel (200 Moedas)" },
        { threshold: 500, rarity: "prata", title: "Comprador Ativo (500 Moedas)" },
        { threshold: 700, rarity: "prata", title: "Estilo em Alta (700 Moedas)" },
        { threshold: 1200, rarity: "ouro", title: "Investidor de Ouro (1.200 Moedas)" },
        { threshold: 2000, rarity: "ouro", title: "VIP da Loja (2.000 Moedas)" },
        { threshold: 2500, rarity: "platina", title: "Patrono de Platina (2.500 Moedas)" },
        { threshold: 3000, rarity: "platina", title: "Grande Comprador (3.000 Moedas)" },
        { threshold: 4000, rarity: "diamante", title: "Soberano da Loja (4.000 Moedas)" },
        { threshold: 5000, rarity: "heroi", title: "Mecenas Heróico (5.000 Moedas)" },
      ] as Array<{ threshold: number; rarity: MedalRarity; title: string }>
    ).map((m) => ({
      id: `coins_spent_${m.threshold}`,
      title: m.title,
      description: `Gaste um total de ${m.threshold.toLocaleString("pt-BR")} moedas na loja.`,
      rarity: m.rarity,
      category: "economia" as MedalCategory,
      iconName: m.rarity === "heroi" ? "Crown" : "Award",
      condition: { type: "coins_spent_total" as const, threshold: m.threshold },
    })),

    // 18. Medalhas de Economia: Comprar Itens Cosméticos Diferentes (exclui pacotes)
    ...(
      [
        { threshold: 1, rarity: "bronze", title: "Primeiro Cosmético" },
        { threshold: 2, rarity: "bronze", title: "Visual Duplo (2 Cosméticos)" },
        { threshold: 5, rarity: "prata", title: "Guarda-Roupa Inicial (5 Cosméticos)" },
        { threshold: 10, rarity: "prata", title: "Estilo Variado (10 Cosméticos)" },
        { threshold: 15, rarity: "ouro", title: "Coleção de Estilo (15 Cosméticos)" },
        { threshold: 25, rarity: "platina", title: "Ícone da Moda (25 Cosméticos)" },
        { threshold: 35, rarity: "diamante", title: "Acervo de Diamante (35 Cosméticos)" },
        { threshold: 50, rarity: "heroi", title: "Galeria Suprema (50 Cosméticos)" },
      ] as Array<{ threshold: number; rarity: MedalRarity; title: string }>
    ).map((m) => ({
      id: `cosmetics_bought_${m.threshold}`,
      title: m.title,
      description: `Compre ${m.threshold} ${m.threshold === 1 ? "item cosmético diferente" : "itens cosméticos diferentes"} na loja (avatares ou auras).`,
      rarity: m.rarity,
      category: "economia" as MedalCategory,
      iconName: m.rarity === "heroi" ? "Crown" : "Star",
      condition: { type: "cosmetics_purchased_count" as const, threshold: m.threshold },
    })),

    // 19. Medalhas de Baús: Abrir Baús
    ...(
      [
        { threshold: 1, rarity: "bronze", title: "Primeiro Baú Aberto" },
        { threshold: 5, rarity: "prata", title: "Explorador de Baús (5)" },
        { threshold: 10, rarity: "prata", title: "Caçador de Espólios (10)" },
        { threshold: 20, rarity: "ouro", title: "Mestre dos Baús (20)" },
        { threshold: 50, rarity: "platina", title: "Saqueador de Platina (50)" },
        { threshold: 100, rarity: "diamante", title: "Guardião das Arcas (100)" },
        { threshold: 300, rarity: "heroi", title: "Senhor dos Tesouros (300)" },
      ] as Array<{ threshold: number; rarity: MedalRarity; title: string }>
    ).map((m) => ({
      id: `chests_opened_${m.threshold}`,
      title: m.title,
      description:
        m.threshold === 1
          ? "Abra o seu primeiro baú de recompensas."
          : `Abra um total de ${m.threshold} baús de recompensas.`,
      rarity: m.rarity,
      category: "baus" as MedalCategory,
      iconName: m.rarity === "heroi" ? "Crown" : "Trophy",
      condition: { type: "chests_opened_total" as const, threshold: m.threshold },
    })),

    // 20. Medalhas de Cartas: Abrir Pacotes
    ...(
      [
        { threshold: 1, rarity: "bronze", title: "Primeiro Pacote Aberto" },
        { threshold: 5, rarity: "prata", title: "Abrindo Caminhos (5 Pacotes)" },
        { threshold: 15, rarity: "ouro", title: "Colecionador em Ação (15 Pacotes)" },
        { threshold: 30, rarity: "platina", title: "Viciado em Pacotes (30 Pacotes)" },
        { threshold: 100, rarity: "diamante", title: "Centurião dos Pacotes (100 Pacotes)" },
        { threshold: 300, rarity: "heroi", title: "Mestre dos Pacotes (300 Pacotes)" },
      ] as Array<{ threshold: number; rarity: MedalRarity; title: string }>
    ).map((m) => ({
      id: `packs_opened_${m.threshold}`,
      title: m.title,
      description:
        m.threshold === 1
          ? "Abra o seu primeiro pacote de cartas."
          : `Abra um total de ${m.threshold} pacotes de cartas.`,
      rarity: m.rarity,
      category: "cartas" as MedalCategory,
      iconName: m.rarity === "heroi" ? "Crown" : "Sparkles",
      condition: { type: "packs_opened_total" as const, threshold: m.threshold },
    })),

    // 21. Medalhas de Cartas: Colecionar Cartas Diferentes
    ...(
      [
        { threshold: 10, rarity: "bronze", title: "Álbum Inicial (10 Cartas Únicas)" },
        { threshold: 30, rarity: "prata", title: "Coleção Variada (30 Cartas Únicas)" },
        { threshold: 50, rarity: "ouro", title: "Álbum de Ouro (50 Cartas Únicas)" },
        { threshold: 80, rarity: "diamante", title: "Enciclopédia Viva (80 Cartas Únicas)" },
        { threshold: 150, rarity: "heroi", title: "Mestre do Álbum (150 Cartas Únicas)" },
      ] as Array<{ threshold: number; rarity: MedalRarity; title: string }>
    ).map((m) => ({
      id: `cards_unique_${m.threshold}`,
      title: m.title,
      description: `Colecione ${m.threshold} cartas diferentes no seu álbum.`,
      rarity: m.rarity,
      category: "cartas" as MedalCategory,
      iconName: m.rarity === "heroi" ? "Crown" : "Star",
      condition: { type: "unique_cards_count" as const, threshold: m.threshold },
    })),

    // 22. Medalhas de Cartas: Colecionar Total de Cartas
    ...(
      [
        { threshold: 20, rarity: "bronze", title: "Primeiro Monte (20 Cartas)" },
        { threshold: 50, rarity: "prata", title: "Baralho Crescente (50 Cartas)" },
        { threshold: 100, rarity: "ouro", title: "Centena de Cartas (100 Cartas)" },
        { threshold: 300, rarity: "platina", title: "Arquivo de Platina (300 Cartas)" },
        { threshold: 500, rarity: "diamante", title: "Biblioteca de Diamante (500 Cartas)" },
        { threshold: 1500, rarity: "heroi", title: "Acervo Infinito (1.500 Cartas)" },
      ] as Array<{ threshold: number; rarity: MedalRarity; title: string }>
    ).map((m) => ({
      id: `cards_total_${m.threshold}`,
      title: m.title,
      description: `Acumule um total de ${m.threshold.toLocaleString("pt-BR")} cartas no seu inventário (incluindo repetidas).`,
      rarity: m.rarity,
      category: "cartas" as MedalCategory,
      iconName: m.rarity === "heroi" ? "Crown" : "Flame",
      condition: { type: "total_cards_count" as const, threshold: m.threshold },
    })),
    {
      id: "secret_top1_consecutive_3",
      title: "Dinastia da Liderança",
      description: "Segredo revelado: manteve-se no Top 1 do ranking de alunos por 3 semanas consecutivas!",
      rarity: "platina",
      category: "secreta",
      iconName: "Sparkles",
      condition: { type: "top1_consecutive_weeks", threshold: 3 },
      isSecret: true,
    },
    {
      id: "secret_top1_consecutive_4",
      title: "Império Lendário",
      description: "Segredo supremo revelado: manteve-se no Top 1 do ranking de alunos por 4 semanas consecutivas!",
      rarity: "heroi",
      category: "secreta",
      iconName: "Crown",
      condition: { type: "top1_consecutive_weeks", threshold: 4 },
      isSecret: true,
    },

    // 16. Medalhas Secretas - Trilogia da Constância Diária (3x Dia 3, 5x Dia 5, 7x Dia 7)
    {
      id: "secret_streak_day3_x3",
      title: "Tríade do Hábito",
      description: "Segredo de disciplina revelado: conquistou a recompensa do 3º dia por 3 vezes!",
      rarity: "prata",
      category: "secreta",
      iconName: "Clock",
      condition: { type: "streak_medal_count", targetMedalId: "streak_3_days", threshold: 3 },
      isSecret: true,
    },
    {
      id: "secret_streak_day5_x5",
      title: "Pilar da Disciplina",
      description: "Segredo de foco revelado: conquistou a recompensa do 5º dia por 5 vezes!",
      rarity: "ouro",
      category: "secreta",
      iconName: "Flame",
      condition: { type: "streak_medal_count", targetMedalId: "streak_5_days", threshold: 5 },
      isSecret: true,
    },
    {
      id: "secret_streak_day7_x7",
      title: "Guardião da Constância",
      description: "Segredo supremo revelado: completou o ciclo de 7 dias consecutivos por 7 vezes!",
      rarity: "platina",
      category: "secreta",
      iconName: "Crown",
      condition: { type: "streak_medal_count", targetMedalId: "streak_7_days", threshold: 7 },
      isSecret: true,
    },

    // 17. Novas Medalhas Secretas de Maestria Multijogos
    {
      id: "secret_specialist_10_games",
      title: "Especialista Absoluto",
      description: "Segredo supremo revelado: conquistou o título de Especialista (Nível 3+) em pelo menos 10 jogos diferentes!",
      rarity: "diamante",
      category: "secreta",
      iconName: "Target",
      condition: { type: "distinct_specialist_games", threshold: 10 },
      isSecret: true,
    },
    {
      id: "secret_flawless_10_games",
      title: "Perfeição Impecável",
      description: "Segredo revelado: conquistou vitória com ZERO erros em pelo menos 10 jogos diferentes!",
      rarity: "platina",
      category: "secreta",
      iconName: "Crosshair",
      condition: { type: "distinct_flawless_games", threshold: 10 },
      isSecret: true,
    },
    {
      id: "secret_50_matches_10_games",
      title: "Veterano Universal",
      description: "Segredo supremo revelado: disputou pelo menos 50 partidas em 10 jogos diferentes!",
      rarity: "diamante",
      category: "secreta",
      iconName: "Award",
      condition: { type: "distinct_games_with_50_matches", threshold: 10 },
      isSecret: true,
    },
    {
      id: "m_rpg_ametista",
      title: "Destruidor do Robô Ametista",
      description: "Por derrotar um robô especial na Batalha de Robôs.",
      rarity: "platina",
      category: "evento",
      iconName: "Shield",
      gameId: "rpg",
      condition: { type: "manual_event" },
    },
    {
      id: "m_rpg_carmesim",
      title: "Destruidor do Robô Carmesim",
      description: "Por derrotar o temido Robô Carmesim no confronto final da Batalha de Robôs.",
      rarity: "platina",
      category: "evento",
      iconName: "Flame",
      gameId: "rpg",
      condition: { type: "manual_event" },
    },
    // 16. Medalhas Especiais de Auras Cósmicas — Space Quest
    {
      id: "sq_safira",
      title: "Questão Safira",
      description: "Acertou uma questão média com aura azul no Space Quest (2x de pontos)!",
      rarity: "bronze",
      category: "evento",
      iconName: "Gem",
      gameId: "spacequest",
      condition: { type: "manual_event" },
    },
    {
      id: "sq_ametista",
      title: "Questão Ametista",
      description: "Acertou uma questão difícil com aura roxa no Space Quest (3x de pontos)!",
      rarity: "prata",
      category: "evento",
      iconName: "Sparkles",
      gameId: "spacequest",
      condition: { type: "manual_event" },
    },
    {
      id: "sq_rubi",
      title: "Questão Rubi",
      description: "Acertou uma questão difícil com aura vermelha no Space Quest (4x de pontos)!",
      rarity: "ouro",
      category: "evento",
      iconName: "Flame",
      gameId: "spacequest",
      condition: { type: "manual_event" },
    },
    {
      id: "sq_ambar",
      title: "Questão Âmbar",
      description: "Acertou a raríssima questão difícil com aura dourada no Space Quest (4x de pontos e sem penalidade)!",
      rarity: "platina",
      category: "evento",
      iconName: "Crown",
      gameId: "spacequest",
      condition: { type: "manual_event" },
    },
    // 17. Novas Medalhas de Habilidade e Sobrevivência — Space Quest
    {
      id: "sq_hourglass_3x",
      title: "Senhor do Tempo",
      description: "Ativou a ampulheta de dilatação temporal 3 vezes em uma única partida no Space Quest!",
      rarity: "prata",
      category: "evento",
      iconName: "Hourglass",
      gameId: "spacequest",
      condition: { type: "manual_event" },
    },
    {
      id: "sq_shield_2x",
      title: "Sentinela Blindado",
      description: "Ativou o escudo de blindagem de vida 2 vezes em uma única partida no Space Quest!",
      rarity: "prata",
      category: "evento",
      iconName: "Shield",
      gameId: "spacequest",
      condition: { type: "manual_event" },
    },
    {
      id: "sq_divine_luck",
      title: "Sorte Divina",
      description: "Recuperou 1 vida milagrosamente ao responder uma questão estando com apenas 1 coração restante no Space Quest!",
      rarity: "ouro",
      category: "evento",
      iconName: "Heart",
      isSecret: true,
      gameId: "spacequest",
      condition: { type: "manual_event" },
    },
    {
      id: "sq_purist_pilot",
      title: "Piloto Purista",
      description: "Venceu uma partida no Space Quest com mais de 1 vida e sem ativar o escudo ou a ampulheta nenhuma vez!",
      rarity: "platina",
      category: "evento",
      iconName: "Zap",
      gameId: "spacequest",
      condition: { type: "manual_event" },
    },
  );

  return medals;
}

export function getDailyPostCapMatches(
  profile?: { dailyPostCapDate?: string; dailyPostCapMatches?: number } | null,
  todayKey = getLocalDateKey(),
): number {
  if (!profile || profile.dailyPostCapDate !== todayKey) return 0;
  return profile.dailyPostCapMatches ?? 0;
}

/**
 * Calculates the maximum streak of consecutive calendar days from date strings like 'YYYY-MM-DD'.
 */
export function calculateMaxConsecutiveDays(dateStrings: string[]): number {
  if (!Array.isArray(dateStrings) || dateStrings.length === 0) return 0;
  const timestamps = Array.from(new Set(dateStrings))
    .map((dStr) => {
      const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(dStr).trim());
      if (!match) return null;
      return Date.UTC(parseInt(match[1], 10), parseInt(match[2], 10) - 1, parseInt(match[3], 10));
    })
    .filter((t): t is number => t !== null)
    .sort((a, b) => a - b);

  if (timestamps.length === 0) return 0;
  let maxStreak = 1;
  let currentStreak = 1;
  const ONE_DAY_MS = 86_400_000;

  for (let i = 1; i < timestamps.length; i++) {
    const diffDays = Math.round((timestamps[i] - timestamps[i - 1]) / ONE_DAY_MS);
    if (diffDays === 1) {
      currentStreak++;
      if (currentStreak > maxStreak) {
        maxStreak = currentStreak;
      }
    } else if (diffDays > 1) {
      currentStreak = 1;
    }
  }

  return maxStreak;
}

/**
 * Returns the legitimately verified consecutive streak of daily activity for a player.
 * Strictly bounded by:
 * 1. matchesPlayed (a player cannot have played on 7 different days if they have fewer than 7 matches!)
 * 2. Distinct active dates recorded in `activeDates` and `lastActiveDate`.
 * 3. Actual consecutive day intervals between those dates.
 */
export function getPlayerStreakDays(profile?: Partial<PlayerProfile> | null): number {
  if (!profile) return 0;
  const matches = Math.max(
    0,
    profile.matchesPlayed ?? 0,
    profile.totalMatches ?? 0,
    (profile as any)?.totalPlays ?? 0,
  );
  if (matches === 0) return 0;

  const dates: string[] = [];
  if (Array.isArray(profile.activeDates)) {
    for (const d of profile.activeDates) {
      if (typeof d === "string" && d.trim() && !dates.includes(d.trim())) {
        dates.push(d.trim());
      }
    }
  }
  if (profile.lastActiveDate && !dates.includes(profile.lastActiveDate.trim())) {
    dates.push(profile.lastActiveDate.trim());
  }

  if (dates.length > 0) {
    const maxStreakFromDates = calculateMaxConsecutiveDays(dates);
    const rawStreak = Math.max(profile.streakDays ?? 1, maxStreakFromDates);
    return Math.max(1, Math.min(rawStreak, maxStreakFromDates, dates.length, matches));
  }

  // Fallback for accounts with matches played but no dates recorded yet:
  // Cannot exceed 1 day of streak until multiple distinct active days are recorded.
  return Math.min(profile.streakDays ?? 1, matches, 1);
}

/**
 * Calcula a ofensiva ATIVA atual (dias consecutivos terminando em `referenceDateKey` ou no dia anterior),
 * considerando partidas E check-ins registrados em `activeDates` / `lastActiveDate` / `lastDailyRewardClaimDate`.
 * Diferente de `getPlayerStreakDays` (recorde histórico para medalhas), esta função regride para 0/1
 * quando o jogador falta dias consecutivos.
 */
export function getCurrentActiveStreakDays(
  profile?: Partial<PlayerProfile> | null,
  referenceDateKey = getLocalDateKey(),
): number {
  if (!profile) return 0;
  const dateSet = new Set<string>();
  if (Array.isArray(profile.activeDates)) {
    for (const d of profile.activeDates) {
      if (typeof d === "string" && /^\d{4}-\d{2}-\d{2}$/.test(d.trim())) {
        dateSet.add(d.trim());
      }
    }
  }
  for (const extra of [profile.lastActiveDate, profile.lastDailyRewardClaimDate]) {
    if (typeof extra === "string" && /^\d{4}-\d{2}-\d{2}$/.test(extra.trim())) {
      dateSet.add(extra.trim());
    }
  }
  if (dateSet.size === 0) return 0;

  const shiftKey = (key: string, delta: number): string => {
    const [y, m, d] = key.split("-").map(Number);
    if (!y || !m || !d) return key;
    const dt = new Date(Date.UTC(y, m - 1, d + delta));
    return `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, "0")}-${String(dt.getUTCDate()).padStart(2, "0")}`;
  };

  let cursor = dateSet.has(referenceDateKey)
    ? referenceDateKey
    : dateSet.has(shiftKey(referenceDateKey, -1))
      ? shiftKey(referenceDateKey, -1)
      : null;
  if (!cursor) return 0;

  let count = 0;
  while (cursor && dateSet.has(cursor) && count < 3650) {
    count += 1;
    cursor = shiftKey(cursor, -1);
  }
  return count;
}

/** Returns epoch ms for Monday 00:00:00 UTC of an ISO week */
export function getMondayOfIsoWeek(year: number, week: number): number {
  const jan4 = new Date(Date.UTC(year, 0, 4));
  const day = jan4.getUTCDay() || 7;
  const mondayWeek1 = jan4.getTime() - (day - 1) * 86400000;
  return mondayWeek1 + (week - 1) * 7 * 86400000;
}

/** Calculates the maximum streak of consecutive ISO weeks from week keys like 'YYYY-Www' */
export function calculateMaxConsecutiveWeeks(weekKeys: string[]): number {
  if (!Array.isArray(weekKeys) || weekKeys.length === 0) return 0;
  const mondays = Array.from(new Set(weekKeys))
    .map((k) => {
      const match = k.match(/^(\d{4})-W(\d{1,2})$/);
      if (!match) return null;
      return getMondayOfIsoWeek(parseInt(match[1], 10), parseInt(match[2], 10));
    })
    .filter((t): t is number => t !== null)
    .sort((a, b) => a - b);

  if (mondays.length === 0) return 0;
  let maxStreak = 1;
  let currentStreak = 1;
  const ONE_WEEK_MS = 7 * 86400000;

  for (let i = 1; i < mondays.length; i++) {
    const diffWeeks = Math.round((mondays[i] - mondays[i - 1]) / ONE_WEEK_MS);
    if (diffWeeks === 1) {
      currentStreak++;
      if (currentStreak > maxStreak) {
        maxStreak = currentStreak;
      }
    } else if (diffWeeks > 1) {
      currentStreak = 1;
    }
  }

  return maxStreak;
}

/** Total distinct weeks a player maintained a Top 5 position in the tournament */
export function getTop5TotalWeeks(profile?: PlayerProfile | null): number {
  if (!profile || !Array.isArray(profile.tournamentMedals)) return 0;
  const weeks = new Set<string>();
  let countSum = 0;

  for (const m of profile.tournamentMedals) {
    if (m.rank <= 5) {
      if (m.weekKey) weeks.add(m.weekKey);
      if (Array.isArray(m.historyWeeks)) {
        for (const w of m.historyWeeks) weeks.add(w);
      }
      countSum += m.count ?? 1;
    }
  }

  return Math.max(weeks.size, countSum);
}

/** Maximum streak of consecutive tournament cycles (ISO weeks, YYYY-MM months, or Season_N) a player finished in Top 1 */
export function getTop1ConsecutiveWeeks(profile?: PlayerProfile | null): number {
  if (!profile || !Array.isArray(profile.tournamentMedals)) return 0;
  const keys = new Set<string>();

  for (const m of profile.tournamentMedals) {
    if (m.rank === 1) {
      if (m.weekKey) keys.add(m.weekKey);
      if (Array.isArray(m.historyWeeks)) {
        for (const w of m.historyWeeks) keys.add(w);
      }
    }
  }

  const keyArr = Array.from(keys);
  let maxStreak = calculateMaxConsecutiveWeeks(keyArr);

  // Suporte a chaves mensais consecutivas (YYYY-MM, ex.: 2027-01, 2027-02)
  const monthIndices = keyArr
    .map((k) => {
      const m = /^(\d{4})-(\d{2})$/.exec(k);
      if (!m) return null;
      return parseInt(m[1], 10) * 12 + (parseInt(m[2], 10) - 1);
    })
    .filter((n): n is number => n !== null)
    .sort((a, b) => a - b);
  if (monthIndices.length > 0) {
    let cur = 1;
    let best = 1;
    for (let i = 1; i < monthIndices.length; i++) {
      if (monthIndices[i] - monthIndices[i - 1] === 1) {
        cur++;
        if (cur > best) best = cur;
      } else if (monthIndices[i] - monthIndices[i - 1] > 1) {
        cur = 1;
      }
    }
    if (best > maxStreak) maxStreak = best;
  }

  // Suporte a temporadas sequenciais (Season_1, Season_2, ...)
  const seasonNums = keyArr
    .map((k) => {
      const m = /^Season_(\d+)$/i.exec(k);
      return m ? parseInt(m[1], 10) : null;
    })
    .filter((n): n is number => n !== null)
    .sort((a, b) => a - b);
  if (seasonNums.length > 0) {
    let cur = 1;
    let best = 1;
    for (let i = 1; i < seasonNums.length; i++) {
      if (seasonNums[i] - seasonNums[i - 1] === 1) {
        cur++;
        if (cur > best) best = cur;
      } else if (seasonNums[i] - seasonNums[i - 1] > 1) {
        cur = 1;
      }
    }
    if (best > maxStreak) maxStreak = best;
  }

  if (maxStreak === 0 && profile.tournamentMedals.some((m) => m.rank === 1 && (m.count ?? 1) >= 1)) {
    return 1;
  }
  return maxStreak;
}

let cachedBaseMedalsCatalog: MedalDefinition[] | null = null;

/** Merges the default catalog with custom medals defined by the administrator */
export function getAllAvailableMedals(customMedals?: MedalDefinition[]): MedalDefinition[] {
  if (!cachedBaseMedalsCatalog) {
    cachedBaseMedalsCatalog = buildBaseMedalsCatalog();
  }
  const base = cachedBaseMedalsCatalog;
  let customs = customMedals;
  if ((!customs || customs.length === 0) && typeof window !== "undefined") {
    try {
      const raw =
        window.localStorage.getItem("desafios-logica-admin-config-v1") ||
        window.localStorage.getItem("desafios-remote-admin-config-v1");
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed?.customMedals) && parsed.customMedals.length > 0) {
          customs = parsed.customMedals;
        }
      }
    } catch {
      /* ignore */
    }
  }
  if (!customs || customs.length === 0) return base;
  const map = new Map<string, MedalDefinition>();
  base.forEach((m) => map.set(m.id, m));
  customs.forEach((m) => map.set(m.id, m));
  return Array.from(map.values());
}

export interface EventScopeMedalLink {
  scope?: string;
  linkedMedalId?: string | null;
  linkedMedalIds?: string[];
}

export interface GameMedalsProgress {
  total: number;
  earned: number;
  remaining: number;
  medals: MedalDefinition[];
}

/**
 * Calcula o progresso de medalhas vinculadas a um jogo específico,
 * somando as medalhas padrão, extras exclusivas (Batalha de Robôs / Space Quest)
 * e medalhas de eventos especiais (ativos ou encerrados) direcionadas ao jogo.
 */
export function getGameMedalsProgress(
  gameId: GameId,
  unlockedMedals: Array<string | PlayerUnlockedMedal> = [],
  customMedals?: MedalDefinition[],
  events: EventScopeMedalLink[] = [],
): GameMedalsProgress {
  const allMedals = getAllAvailableMedals(customMedals);
  const eventLinkedIds = new Set<string>();

  for (const ev of events) {
    if (ev.scope !== gameId) continue;
    if (ev.linkedMedalId) eventLinkedIds.add(ev.linkedMedalId);
    if (Array.isArray(ev.linkedMedalIds)) {
      for (const id of ev.linkedMedalIds) {
        if (id) eventLinkedIds.add(id);
      }
    }
  }

  const medals = allMedals.filter(
    (m) =>
      !m.excludeFromGameCompletion &&
      (m.gameId === gameId ||
        m.condition.gameId === gameId ||
        m.eventRequirement?.gameId === gameId ||
        eventLinkedIds.has(m.id)),
  );

  const unlockedSet = new Set<string>();
  for (const entry of unlockedMedals) {
    if (typeof entry === "string") {
      if (entry) unlockedSet.add(entry);
    } else if (entry?.medalId) {
      unlockedSet.add(entry.medalId);
    }
  }

  const earned = medals.filter((m) => unlockedSet.has(m.id)).length;
  const total = medals.length;
  return {
    total,
    earned,
    remaining: Math.max(0, total - earned),
    medals,
  };
}

export function getX1MedalsProgress(
  unlockedMedals: Array<string | PlayerUnlockedMedal> = [],
  customMedals?: MedalDefinition[],
  events: Array<EventScopeMedalLink & { id?: string; scope?: string }> = [],
): GameMedalsProgress {
  const allMedals = getAllAvailableMedals(customMedals);
  const x1EventIds = new Set<string>();
  for (const ev of events) {
    if (ev.id && ev.scope === "modo_x1") x1EventIds.add(ev.id);
  }
  for (const m of allMedals) {
    if (m.eventId && m.eventRequirement?.type === "event_x1_wins") {
      x1EventIds.add(m.eventId);
    }
  }

  const medals = allMedals.filter((m) => isX1ExclusiveMedal(m, x1EventIds));
  const unlockedSet = new Set<string>();
  for (const entry of unlockedMedals) {
    if (typeof entry === "string") {
      if (entry) unlockedSet.add(entry);
    } else if (entry?.medalId) {
      unlockedSet.add(entry.medalId);
    }
  }

  const earned = medals.filter((m) => unlockedSet.has(m.id)).length;
  const total = medals.length;
  return {
    total,
    earned,
    remaining: Math.max(0, total - earned),
    medals,
  };
}

export type MedalProgressColorTier = "start" | "half" | "complete";

export interface MedalProgressStyle {
  tier: MedalProgressColorTier;
  pillClass: string;
  cardClass: string;
  textClass: string;
}

/**
 * Define a cor dinâmica do contador de medalhas de um jogo conforme o progresso:
 * - Laranja ("start"): 0 até antes da metade (`earned < Math.ceil(total / 2)`)
 * - Amarelo claro ("half"): metade (arredondada para cima em ímpares) até antes de 100%
 * - Verde ("complete"): 100% concluído (`total > 0 && earned >= total`)
 */
export function getMedalProgressStyle(earned: number, total: number): MedalProgressStyle {
  const safeTotal = Math.max(0, Math.floor(Number(total) || 0));
  const safeEarned = Math.max(0, Math.floor(Number(earned) || 0));

  if (safeTotal > 0 && safeEarned >= safeTotal) {
    return {
      tier: "complete",
      pillClass: "bg-emerald-500/15 border-emerald-500/50 text-emerald-600 dark:text-emerald-400",
      cardClass: "border-emerald-500/50 bg-emerald-500/10",
      textClass: "text-emerald-600 dark:text-emerald-400",
    };
  }

  if (safeTotal > 0 && safeEarned > 0 && safeEarned >= Math.ceil(safeTotal / 2)) {
    return {
      tier: "half",
      pillClass: "bg-yellow-400/15 border-yellow-400/50 text-yellow-600 dark:text-yellow-300",
      cardClass: "border-yellow-400/50 bg-yellow-400/10",
      textClass: "text-yellow-600 dark:text-yellow-300",
    };
  }

  return {
    tier: "start",
    pillClass: "bg-orange-500/15 border-orange-500/45 text-orange-600 dark:text-orange-400",
    cardClass: "border-orange-500/45 bg-orange-500/10",
    textClass: "text-orange-600 dark:text-orange-400",
  };
}

/** Selects the up to `limit` (default 8) highest-rarity / most valuable medals to feature in profile highlights */
export function getTopShowcaseMedals(
  unlockedMedals: PlayerUnlockedMedal[],
  allMedals = getAllAvailableMedals(),
  limit = 8,
): MedalDefinition[] {
  if (!unlockedMedals || unlockedMedals.length === 0 || limit <= 0) return [];

  const defMap = new Map<string, MedalDefinition>(allMedals.map((m) => [m.id, m]));
  const list: MedalDefinition[] = [];

  for (const um of unlockedMedals) {
    if (!um) continue;
    const mId = typeof um === "string" ? um : ((um as any).medalId ?? (um as any).id ?? "");
    const def = defMap.get(mId);
    if (def) list.push(def);
  }

  // Sort by rarity weight descending (safe fallback for unknown custom rarity), then by title
  list.sort((a, b) => {
    const wB = RARITY_INFO[b.rarity]?.weight ?? RARITY_INFO.bronze.weight;
    const wA = RARITY_INFO[a.rarity]?.weight ?? RARITY_INFO.bronze.weight;
    const weightDiff = wB - wA;
    if (weightDiff !== 0) return weightDiff;
    return a.title.localeCompare(b.title);
  });

  return list.slice(0, limit);
}

export interface PlayerStatsContext {
  profile: PlayerProfile;
  stats: GameStatRow[];
  lastMatch?: {
    gameId: GameId;
    score: number;
    level: number;
    correct: number;
    wrong: number;
    mode?: string;
  };
  todayXpEarned?: number;
  dailyMissionsCompleted?: number;
  weeklyMissionsCompleted?: number;
  streakDays?: number;
  weeklyX1Wins?: number;
  enabledGames?: Partial<Record<GameId, boolean>>;
  adminOnlyGames?: Partial<Record<GameId, boolean>>;
  /** IDs de eventos explicitamente voltados ao Modo X1 */
  x1EventIds?: Set<string>;
}

let cachedAdminEnabledGamesRaw: string | null = null;
let cachedAdminEnabledGamesMap: Partial<Record<GameId, boolean>> = {};
let cachedAdminOnlyGamesRaw: string | null = null;
let cachedAdminOnlyGamesMap: Partial<Record<GameId, boolean>> = {};

function getAdminOnlyGameIdsSet(
  adminOnlyOverride?: Partial<Record<GameId, boolean>>,
): Set<GameId> {
  let map: Partial<Record<GameId, boolean>> = {};
  if (typeof window !== "undefined") {
    try {
      const raw = window.localStorage.getItem("desafios-logica-admin-config-v1");
      if (raw) {
        if (raw === cachedAdminOnlyGamesRaw) {
          map = cachedAdminOnlyGamesMap;
        } else {
          const parsed = JSON.parse(raw) as { adminOnlyGames?: Partial<Record<GameId, boolean>> };
          cachedAdminOnlyGamesRaw = raw;
          cachedAdminOnlyGamesMap = parsed?.adminOnlyGames ? { ...parsed.adminOnlyGames } : {};
          map = cachedAdminOnlyGamesMap;
        }
      } else {
        cachedAdminOnlyGamesRaw = null;
        cachedAdminOnlyGamesMap = {};
      }
    } catch {
      /* ignore */
    }
  }
  const set = new Set<GameId>();
  for (const gId of ALL_GAME_IDS) {
    const val =
      adminOnlyOverride && adminOnlyOverride[gId] !== undefined
        ? adminOnlyOverride[gId]
        : map[gId];
    if (val === true) {
      set.add(gId);
    }
  }
  return set;
}

/**
 * Retorna o conjunto de jogos habilitados pelo Administrador na plataforma.
 * Jogos desabilitados (`enabledGames[id] === false`) não podem contar como
 * jogos explorados nem conceder medalhas para alunos.
 */
export function getEnabledGameIdsSet(
  enabledGamesOverride?: Partial<Record<GameId, boolean>>,
): Set<GameId> {
  let map: Partial<Record<GameId, boolean>> = {};
  if (typeof window !== "undefined") {
    try {
      const raw = window.localStorage.getItem("desafios-logica-admin-config-v1");
      if (raw) {
        if (raw === cachedAdminEnabledGamesRaw) {
          map = cachedAdminEnabledGamesMap;
        } else {
          const parsed = JSON.parse(raw) as { enabledGames?: Partial<Record<GameId, boolean>> };
          cachedAdminEnabledGamesRaw = raw;
          cachedAdminEnabledGamesMap = parsed?.enabledGames ? { ...parsed.enabledGames } : {};
          map = cachedAdminEnabledGamesMap;
        }
      } else {
        cachedAdminEnabledGamesRaw = null;
        cachedAdminEnabledGamesMap = {};
      }
    } catch {
      /* ignore */
    }
  }
  const set = new Set<GameId>();
  for (const gId of ALL_GAME_IDS) {
    const val =
      enabledGamesOverride && enabledGamesOverride[gId] !== undefined
        ? enabledGamesOverride[gId]
        : map[gId];
    if (val !== false) {
      set.add(gId);
    }
  }
  return set;
}

/**
 * Avalia ao final do jogo se a partida foi concluída sem NENHUM erro (wrong === 0),
 * com participação real mínima (pelo menos 3 acertos) e pontuação >= threshold (padrão 30).
 */
export function isFlawlessMatch(
  match?: {
    score: number;
    correct: number;
    wrong: number;
    mode?: string;
  } | null,
  minScore = 30,
): boolean {
  if (!match) return false;
  return (
    typeof match.wrong === "number" &&
    match.wrong === 0 &&
    match.correct >= 3 &&
    match.score >= minScore
  );
}

/**
 * Consolida as estatísticas por `game_id` único habilitado (somando partidas jogadas/vitórias entre modos
 * como padrão/equipes/frações/torneio_semanal e mantendo o maior nível e maior pontuação de cada jogo).
 */
export function aggregateStatsByGame(
  stats: GameStatRow[],
  enabledGamesOverride?: Partial<Record<GameId, boolean>>,
): Map<GameId, GameStatRow & { flawless_wins: number }> {
  const enabledSet = getEnabledGameIdsSet(enabledGamesOverride);
  const map = new Map<GameId, GameStatRow & { flawless_wins: number }>();
  for (const row of stats) {
    if (!row || !row.game_id) continue;
    if (row.mode === "x1_online") continue;
    if (!enabledSet.has(row.game_id)) continue;
    const hasActivity =
      (row.plays ?? 0) > 0 ||
      (row.best_score ?? 0) > 0 ||
      (row.best_level ?? 1) > 1 ||
      (row.wins ?? 0) > 0 ||
      (row.flawless_wins ?? 0) > 0 ||
      row.last_wrong !== undefined;
    const rawPlays = Math.max(0, row.plays ?? 0);
    const playsToAdd = Math.max(rawPlays, hasActivity ? 1 : 0);
    const hasWinProgress =
      (row.wins ?? 0) > 0 ||
      (row.flawless_wins ?? 0) >= 1 ||
      (row.best_score ?? 0) >= 20 ||
      (row.best_level ?? 1) >= 2;
    const winsToAdd = Math.max(0, row.wins ?? 0, hasWinProgress ? 1 : 0);
    const flawlessToAdd = Math.max(0, row.flawless_wins ?? 0);

    const existing = map.get(row.game_id);
    if (!existing) {
      map.set(row.game_id, {
        ...row,
        plays: playsToAdd,
        wins: winsToAdd,
        flawless_wins: flawlessToAdd,
        best_score: Math.max(0, row.best_score ?? 0),
        best_level: Math.max(1, row.best_level ?? 1),
      });
    } else {
      map.set(row.game_id, {
        ...existing,
        plays: existing.plays + playsToAdd,
        wins: existing.wins + winsToAdd,
        flawless_wins: existing.flawless_wins + flawlessToAdd,
        best_score: Math.max(existing.best_score, row.best_score ?? 0),
        best_level: Math.max(existing.best_level, row.best_level ?? 1),
        last_played_at:
          (row.last_played_at || "") > (existing.last_played_at || "")
            ? row.last_played_at
            : existing.last_played_at,
      });
    }
  }
  return map;
}

/**
 * Retorna o conjunto de jogos distintos habilitados (`GameId`) em que o jogador comprovadamente
 * finalizou pelo menos uma partida com ZERO erros (`wrong === 0` ao final do jogo e `score >= 30`).
 */
export function getDistinctFlawlessGames(
  _profile?: PlayerProfile | null,
  stats: GameStatRow[] = [],
  lastMatch?: PlayerStatsContext["lastMatch"],
  enabledGamesOverride?: Partial<Record<GameId, boolean>>,
): Set<GameId> {
  const enabledSet = getEnabledGameIdsSet(enabledGamesOverride);
  const flawlessSet = new Set<GameId>();
  const byGame = aggregateStatsByGame(stats, enabledGamesOverride);

  for (const gId of ALL_GAME_IDS) {
    if (!enabledSet.has(gId)) continue;
    const row = byGame.get(gId);
    if (row && row.flawless_wins >= 1 && row.best_score >= 30) {
      // Se a partida recém-finalizada for desse jogo e teve erros, desconsidera
      if (lastMatch && lastMatch.gameId === gId && (lastMatch.wrong ?? 0) > 0) {
        continue;
      }
      // Se a única partida registrada teve erros, não pode ser contada como sem erros
      if (row.plays === 1 && (row.last_wrong ?? 0) > 0) {
        continue;
      }
      flawlessSet.add(gId);
    }
  }

  if (
    lastMatch &&
    lastMatch.mode !== "x1_online" &&
    enabledSet.has(lastMatch.gameId) &&
    isFlawlessMatch(lastMatch, 30)
  ) {
    flawlessSet.add(lastMatch.gameId);
  }

  return flawlessSet;
}

/**
 * Retorna a contagem confiável de jogos distintos habilitados jogados pelo jogador.
 * Cruza todas as fontes de dados para garantir que nenhum progresso real do aluno seja perdido:
 *  1. Estatísticas passadas em `stats` (com plays > 0 ou score/nível/vitória registrados)
 *  2. Estatísticas embutidas no perfil (`profile.stats`) caso existam
 *  3. Última partida finalizada (`lastMatch`)
 *  4. Medalhas já desbloqueadas pelo jogador associadas a um jogo específico (`game_${gId}_...`)
 *  5. Contagem prévia em `profile.distinctGamesPlayed` (limitada estritamente aos jogos habilitados)
 */
export function getDistinctGamesPlayed(
  profile?: Partial<PlayerProfile> | null,
  stats: GameStatRow[] = [],
  lastMatch?: Partial<PlayerStatsContext["lastMatch"]> | null,
  enabledGamesOverride?: Partial<Record<GameId, boolean>>,
): number {
  const enabledSet = getEnabledGameIdsSet(enabledGamesOverride);
  const playedSet = new Set<GameId>();

  // 1. Linhas em stats
  if (Array.isArray(stats) && stats.length > 0) {
    const byGame = aggregateStatsByGame(stats, enabledGamesOverride);
    for (const [gId, row] of byGame.entries()) {
      if (
        row.plays > 0 ||
        (row.best_score ?? 0) > 0 ||
        (row.best_level ?? 1) > 1 ||
        (row.wins ?? 0) > 0 ||
        row.last_wrong !== undefined ||
        (row.flawless_wins ?? 0) > 0
      ) {
        playedSet.add(gId);
      }
    }
  }

  // 2. Profile.stats embutido
  const profStats = (profile as any)?.stats;
  if (Array.isArray(profStats) && profStats.length > 0) {
    const profByGame = aggregateStatsByGame(profStats, enabledGamesOverride);
    for (const [gId, row] of profByGame.entries()) {
      if (
        row.plays > 0 ||
        (row.best_score ?? 0) > 0 ||
        (row.best_level ?? 1) > 1 ||
        (row.wins ?? 0) > 0 ||
        row.last_wrong !== undefined ||
        (row.flawless_wins ?? 0) > 0
      ) {
        playedSet.add(gId);
      }
    }
  }

  // 3. Última partida (ignora duelos X1 online para não contar como jogo solo explorado)
  if (
    lastMatch &&
    lastMatch.mode !== "x1_online" &&
    lastMatch.gameId &&
    enabledSet.has(lastMatch.gameId)
  ) {
    playedSet.add(lastMatch.gameId);
  }

  // 4. Medalhas desbloqueadas específicas de jogo e medalhas cumulativas de exploração/nível
  let minFromMedalsAndBadges = 0;
  if (profile && Array.isArray(profile.unlockedMedals)) {
    for (const m of profile.unlockedMedals) {
      if (!m) continue;
      const rawId = typeof m === "string" ? m : ((m as any).medalId ?? (m as any).id ?? "");
      const mId = typeof rawId === "string" ? rawId : String(rawId || "");
      if (!mId) continue;
      for (const gId of ALL_GAME_IDS) {
        if (!enabledSet.has(gId)) continue;
        if (mId.startsWith(`game_${gId}_`)) {
          playedSet.add(gId);
          break;
        }
      }
      if (mId === "explore_3_games" || mId === "flawless_3_games") {
        minFromMedalsAndBadges = Math.max(minFromMedalsAndBadges, 3);
      } else if (mId === "explore_5_games" || mId === "flawless_5_games") {
        minFromMedalsAndBadges = Math.max(minFromMedalsAndBadges, 5);
      } else if (mId === "beta_tester_prata") {
        minFromMedalsAndBadges = Math.max(minFromMedalsAndBadges, 4);
      } else if (mId === "beta_tester_ouro") {
        minFromMedalsAndBadges = Math.max(minFromMedalsAndBadges, 6);
      } else if (mId === "beta_tester_bronze") {
        minFromMedalsAndBadges = Math.max(minFromMedalsAndBadges, 1);
      } else if (mId.startsWith("lvl_")) {
        const lvlNum = Number(mId.replace("lvl_", ""));
        if (lvlNum >= 2 && lvlNum <= 10) {
          const req = LEVEL_REQUIREMENTS[lvlNum - 1];
          if (req) {
            minFromMedalsAndBadges = Math.max(minFromMedalsAndBadges, req.minDistinctGames);
          }
        }
      }
    }
  }

  // 5. Insígnias (badges) acumuladas no perfil
  if (profile && Array.isArray(profile.badges)) {
    for (const b of profile.badges) {
      if (!b || !b.id) continue;
      if (b.id === "explorador") minFromMedalsAndBadges = Math.max(minFromMedalsAndBadges, 5);
      else if (b.id === "mestre_jogos") minFromMedalsAndBadges = Math.max(minFromMedalsAndBadges, 9);
      else if (
        b.id === "primeira_missao" ||
        b.id === "primeira_vitoria" ||
        b.id === "cinco_vitorias" ||
        b.id === "quinze_vitorias"
      ) {
        minFromMedalsAndBadges = Math.max(minFromMedalsAndBadges, 1);
      }
    }
  }

  // 6. Progresso em eventos especiais ou recorrentes por jogo
  if (profile?.eventProgress) {
    for (const evData of Object.values(profile.eventProgress)) {
      if (evData?.matchesByGame) {
        for (const [gId, count] of Object.entries(evData.matchesByGame)) {
          if (count > 0 && enabledSet.has(gId as GameId)) playedSet.add(gId as GameId);
        }
      }
      if (evData?.bestScoreByGame) {
        for (const [gId, sc] of Object.entries(evData.bestScoreByGame)) {
          if (sc > 0 && enabledSet.has(gId as GameId)) playedSet.add(gId as GameId);
        }
      }
      if (evData?.xpByGame) {
        for (const [gId, xpVal] of Object.entries(evData.xpByGame)) {
          if (xpVal > 0 && enabledSet.has(gId as GameId)) playedSet.add(gId as GameId);
        }
      }
      if (evData?.bestLevelByGame) {
        for (const [gId, lvlVal] of Object.entries(evData.bestLevelByGame)) {
          if (lvlVal > 1 && enabledSet.has(gId as GameId)) playedSet.add(gId as GameId);
        }
      }
      if (Array.isArray(evData?.distinctGamesPlayed)) {
        for (const gId of evData.distinctGamesPlayed) {
          if (enabledSet.has(gId as GameId)) playedSet.add(gId as GameId);
        }
      }
    }
  }

  const countFromSources = playedSet.size;
  const countFromProfile = Math.max(0, profile?.distinctGamesPlayed ?? 0);

  // 7. Recuperação de segurança para perfis cujo array `stats` e `distinctGamesPlayed` foram zerados na sincronização,
  // mas que possuem XP, vitórias e partidas comprovadas no perfil
  let inferredFromHistory = 0;
  if (countFromSources === 0 && countFromProfile === 0) {
    const pXp = Math.max(0, profile?.xp ?? 0, profile?.seasonXp ?? 0);
    const pWins = Math.max(0, profile?.wins ?? 0);
    const pMatches = Math.max(
      0,
      profile?.matchesPlayed ?? 0,
      profile?.totalMatches ?? 0,
      (profile as any)?.totalPlays ?? 0,
      pWins,
    );
    if (pXp >= 600 && pWins >= 10) {
      inferredFromHistory = 4;
    } else if (pXp >= 400 && pWins >= 8) {
      inferredFromHistory = 3;
    } else if ((pXp >= 250 && pWins >= 2) || pWins >= 5 || pMatches >= 5) {
      inferredFromHistory = 2;
    } else if (pWins > 0 || pMatches > 0) {
      inferredFromHistory = 1;
    }
  }

  const finalCount = Math.max(
    countFromSources,
    countFromProfile,
    minFromMedalsAndBadges,
    inferredFromHistory,
  );

  return Math.min(enabledSet.size, finalCount);
}

/**
 * Consolida todos os indicadores de progressão do aluno (XP, Partidas, Vitórias, Jogos Distintos e Nível)
 * cruzando o perfil com o progresso das medalhas e estatísticas por jogo para evitar que qualquer aluno
 * fique travado no Nível 1 após ter cumprido os requisitos.
 */
export function getEffectivePlayerProgression(
  profile?: Partial<PlayerProfile> | null,
  stats: GameStatRow[] = [],
  enabledGamesOverride?: Partial<Record<GameId, boolean>>,
): {
  xp: number;
  matchesPlayed: number;
  wins: number;
  distinctGames: number;
  level: number;
  stageProgress: LevelStageProgress;
  maxAvailableGames: number;
} {
  const enabledSet = getEnabledGameIdsSet(enabledGamesOverride);
  const maxAvailableGames = Math.max(1, enabledSet.size);
  const effectiveStats: GameStatRow[] =
    Array.isArray(stats) && stats.length > 0
      ? stats
      : Array.isArray((profile as any)?.stats)
        ? (profile as any).stats
        : [];

  const statsMap = aggregateStatsByGame(effectiveStats, enabledGamesOverride);
  const aggregatedRows = Array.from(statsMap.values()).filter((s) => s.plays > 0);

  const distinctGames = getDistinctGamesPlayed(
    profile,
    effectiveStats,
    undefined,
    enabledGamesOverride,
  );

  const statsPlaysSum = aggregatedRows.reduce((sum, s) => sum + Math.max(0, s.plays ?? 0), 0);
  const statsWinsSum = aggregatedRows.reduce((sum, s) => sum + Math.max(0, s.wins ?? 0), 0);

  const xp = Math.max(0, profile?.xp ?? 0, profile?.seasonXp ?? 0);

  let minWinsFromMedalsOrBadges = 0;
  if (Array.isArray(profile?.badges)) {
    for (const b of profile!.badges!) {
      if (b?.id === "quinze_vitorias") minWinsFromMedalsOrBadges = Math.max(minWinsFromMedalsOrBadges, 15);
      else if (b?.id === "cinco_vitorias") minWinsFromMedalsOrBadges = Math.max(minWinsFromMedalsOrBadges, 5);
      else if (b?.id === "primeira_vitoria") minWinsFromMedalsOrBadges = Math.max(minWinsFromMedalsOrBadges, 1);
    }
  }

  // Se o aluno possui estatísticas detalhadas de jogos com partidas, a soma real de stats é a fonte da verdade absoluta!
  const hasDetailedStats = aggregatedRows.length > 0;

  const wins = hasDetailedStats
    ? Math.min(statsPlaysSum, Math.max(statsWinsSum, minWinsFromMedalsOrBadges))
    : Math.max(
        0,
        profile?.wins ?? 0,
        statsWinsSum,
        minWinsFromMedalsOrBadges,
        xp >= 354 && distinctGames >= 2 ? 2 : xp >= 100 && distinctGames >= 1 ? 1 : 0,
      );

  const matchesPlayed = hasDetailedStats
    ? statsPlaysSum
    : Math.max(
        0,
        profile?.matchesPlayed ?? 0,
        profile?.totalMatches ?? 0,
        (profile as any)?.totalPlays ?? 0,
        statsPlaysSum,
        wins,
        distinctGames,
        xp >= 354 && wins >= 2 ? 5 : xp >= 100 && wins >= 1 ? 2 : 0,
      );

  const syncedStage = syncLevelStageProgress({
    xp,
    lifetimeMatches: matchesPlayed,
    lifetimeWins: wins,
    lifetimeDistinctGames: distinctGames,
    playedGameIds: aggregatedRows.map((r) => r.game_id),
    currentLevel: profile?.level,
    existingStage: (profile as any)?.levelStageProgress ?? null,
    maxAvailableGames,
  });

  return {
    xp,
    matchesPlayed,
    wins,
    distinctGames,
    level: syncedStage.level,
    stageProgress: syncedStage.stageProgress,
    maxAvailableGames,
  };
}

export function isX1ExclusiveMedal(
  medal: MedalDefinition,
  x1EventIds?: Set<string>,
): boolean {
  if (
    medal.condition.type === "x1_wins_total" ||
    medal.condition.type === "x1_wins_weekly" ||
    medal.condition.type === "x1_matches_total" ||
    medal.condition.type === "x1_win_streak" ||
    medal.condition.type === "x1_same_school_wins" ||
    medal.condition.type === "x1_other_school_wins" ||
    medal.condition.type === "x1_comeback_after_losses"
  ) {
    return true;
  }
  if (medal.eventRequirement?.type === "event_x1_wins") {
    return true;
  }
  if (medal.eventId && x1EventIds?.has(medal.eventId)) {
    return true;
  }
  return false;
}

export function countCompletedBaseGames(
  unlockedSet: Set<string>,
  enabledSet: Set<GameId>,
  allMedals: MedalDefinition[],
): number {
  let completed = 0;
  for (const gId of enabledSet) {
    const gameBaseMedals = allMedals.filter(
      (m) =>
        !m.isCustom &&
        !m.eventId &&
        !m.excludeFromGameCompletion &&
        (m.gameId === gId || m.condition.gameId === gId),
    );
    if (gameBaseMedals.length > 0 && gameBaseMedals.every((m) => unlockedSet.has(m.id))) {
      completed += 1;
    }
  }
  return completed;
}

/**
 * Evaluates all unlocked medals for a player and returns newly awarded medals.
 */
export function evaluatePlayerMedals(
  ctx: PlayerStatsContext,
  allMedals = getAllAvailableMedals(),
  now = new Date(),
): MedalDefinition[] {
  const existingSet = new Set(
    (ctx.profile.unlockedMedals ?? [])
      .map((m: any) => (typeof m === "string" ? m : (m?.medalId ?? m?.id ?? "")))
      .filter(Boolean),
  );
  const newlyAwarded: MedalDefinition[] = [];
  const isX1Match = ctx.lastMatch?.mode === "x1_online";
  const medalsToEvaluate = isX1Match
    ? allMedals.filter((m) => isX1ExclusiveMedal(m, ctx.x1EventIds))
    : allMedals;

  const p = ctx.profile;
  const enabledSet = getEnabledGameIdsSet(ctx.enabledGames);
  const adminOnlySet = getAdminOnlyGameIdsSet(ctx.adminOnlyGames);
  const eligibleGamesForMeta = Array.from(enabledSet).filter(
    (gId) => Boolean(p.isAdmin) || !adminOnlySet.has(gId),
  );
  const statsMap = aggregateStatsByGame(ctx.stats, ctx.enabledGames);
  const aggregatedRows = Array.from(statsMap.values()).filter((s) => s.plays > 0);

  // Contagem estrita de jogos diferentes habilitados realmente jogados
  const distinctGames = getDistinctGamesPlayed(
    p,
    ctx.stats,
    ctx.lastMatch,
    ctx.enabledGames,
  );

  // Contagem estrita de jogos diferentes finalizados com ZERO erros (wrong === 0 no fim do jogo)
  const flawlessGamesSet = getDistinctFlawlessGames(
    p,
    ctx.stats,
    ctx.lastMatch,
    ctx.enabledGames,
  );
  const flawlessGamesCount = flawlessGamesSet.size;

  const effProg = getEffectivePlayerProgression(
    p,
    ctx.stats,
    ctx.enabledGames,
  );
  const effectiveLevel = Math.max(p.level ?? 1, effProg.level);

  const currentLevelMedals = [2, 3, 4, 5, 6, 7, 8, 9, 10].filter((lvl) => effectiveLevel >= lvl).length;
  const totalCompletedPlays = Math.max(
    effProg.matchesPlayed,
    aggregatedRows.reduce((acc, s) => acc + s.plays, 0),
  );
  // Contagem estrita de jogos distintos onde o aluno realmente finalizou 2+ partidas
  const gamesWith2Plays = aggregatedRows.filter((s) => s.plays >= 2).length;
  const gamesWith10Plays = aggregatedRows.filter((s) => s.plays >= 10).length;

  // Contagem estrita de jogos distintos onde o aluno atingiu o nível Especialista (nível 3+)
  const specialistGamesCount = Array.from(enabledSet).filter((gId) => {
    const s = statsMap.get(gId);
    const hasBestLvl3 = s && s.plays > 0 && s.best_level >= 3;
    const isLastMatchLvl3 = ctx.lastMatch && ctx.lastMatch.gameId === gId && ctx.lastMatch.level >= 3;
    const hasSpecialistMedal = existingSet.has(`game_${gId}_lvl_master`);
    return Boolean(hasBestLvl3 || isLastMatchLvl3 || hasSpecialistMedal);
  }).length;

  // Contagem estrita de jogos distintos onde o aluno disputou 50+ partidas
  const gamesWith50Plays = Array.from(enabledSet).filter((gId) => {
    const s = statsMap.get(gId);
    const has50Medal = existingSet.has(`game_${gId}_matches_50`);
    return Boolean((s && s.plays >= 50) || has50Medal);
  }).length;
  const isBetaActive = isBetaTesterPeriodActive(now);
  const effectiveStreakDays = getPlayerStreakDays({
    ...p,
    matchesPlayed: totalCompletedPlays,
    streakDays: Math.max(ctx.streakDays ?? 0, p.streakDays ?? 0),
  });
  const effectiveWeeklyX1Wins = Math.max(ctx.weeklyX1Wins ?? 0, p.weeklyX1Wins ?? 0);

  for (const medal of medalsToEvaluate) {
    if (existingSet.has(medal.id)) continue;
    const cond = medal.condition;
    let earned = false;

    switch (cond.type) {
      case "player_level":
        if (effectiveLevel >= (cond.threshold ?? 1)) earned = true;
        break;

      case "game_best_level":
        if (cond.gameId && enabledSet.has(cond.gameId)) {
          const s = statsMap.get(cond.gameId);
          if (s && s.plays > 0 && s.best_level >= (cond.threshold ?? 1)) earned = true;
        }
        break;

      case "game_flawless":
        if (cond.gameId && enabledSet.has(cond.gameId)) {
          const minScore = cond.threshold ?? 30;
          const row = statsMap.get(cond.gameId);
          // Se estamos avaliando o encerramento de uma partida deste jogo:
          // Se a partida teve qualquer erro (wrong > 0), JAMAIS concede a medalha de zero erros!
          if (ctx.lastMatch && ctx.lastMatch.gameId === cond.gameId) {
            if ((ctx.lastMatch.wrong ?? 0) === 0 && isFlawlessMatch(ctx.lastMatch, minScore)) {
              earned = true;
            }
          } else if (
            row &&
            row.flawless_wins >= 1 &&
            row.best_score >= minScore &&
            !(row.plays === 1 && (row.last_wrong ?? 0) > 0)
          ) {
            earned = true;
          }
        }
        break;

      case "game_match_count":
        if (cond.gameId && enabledSet.has(cond.gameId)) {
          const s = statsMap.get(cond.gameId);
          if (s && s.plays >= (cond.threshold ?? 10)) earned = true;
        }
        break;

      case "x1_wins_total":
        // Tracked strictly in profile.x1Wins (online 1v1 Arena X1 wins only, NOT solo vs CPU)
        if ((p.x1Wins ?? 0) >= (cond.threshold ?? 1)) earned = true;
        break;

      case "x1_wins_weekly":
        if (effectiveWeeklyX1Wins >= (cond.threshold ?? 5)) earned = true;
        break;

      case "x1_matches_total":
        if ((p.x1Matches ?? 0) >= (cond.threshold ?? 1)) earned = true;
        break;

      case "x1_win_streak":
        if (Math.max(p.x1BestWinStreak ?? 0, p.x1WinStreak ?? 0) >= (cond.threshold ?? 2)) earned = true;
        break;

      case "x1_same_school_wins":
        if ((p.x1SameSchoolWins ?? 0) >= (cond.threshold ?? 1)) earned = true;
        break;

      case "x1_other_school_wins":
        if ((p.x1OtherSchoolWins ?? 0) >= (cond.threshold ?? 1)) earned = true;
        break;

      case "x1_comeback_after_losses":
        if ((cond.threshold ?? 3) >= 5) {
          if (p.x1Comeback5Unlocked) earned = true;
        } else if (p.x1Comeback3Unlocked || p.x1Comeback5Unlocked) {
          earned = true;
        }
        break;

      case "completed_games_medals": {
        const effectiveUnlocked = new Set(existingSet);
        for (const awarded of newlyAwarded) effectiveUnlocked.add(awarded.id);
        const completedCount = countCompletedBaseGames(effectiveUnlocked, enabledSet, allMedals);
        if (completedCount >= (cond.threshold ?? 1)) earned = true;
        break;
      }

      case "distinct_games":
        if (distinctGames >= (cond.threshold ?? 3)) earned = true;
        break;

      case "distinct_flawless_games":
        // Uma partida com erros (wrong > 0) JAMAIS pode ser o gatilho para conceder medalhas de zero erros
        if (ctx.lastMatch && (ctx.lastMatch.wrong ?? 0) > 0) {
          earned = false;
        } else if (flawlessGamesCount >= (cond.threshold ?? 3)) {
          earned = true;
        }
        break;

      case "distinct_specialist_games":
        if (specialistGamesCount >= (cond.threshold ?? 10)) earned = true;
        break;

      case "distinct_games_with_50_matches":
        if (gamesWith50Plays >= (cond.threshold ?? 10)) earned = true;
        break;

      case "max_daily_xp":
        if ((ctx.todayXpEarned ?? p.dailyXp ?? 0) >= (cond.threshold ?? 1000)) earned = true;
        break;

      case "daily_missions_completed": {
        const completed = Math.max(0, ctx.dailyMissionsCompleted ?? p.dailyMissionsCompleted ?? 0);
        if (completed >= (cond.threshold ?? 3)) earned = true;
        break;
      }

      case "weekly_missions_completed": {
        const completed = Math.max(0, ctx.weeklyMissionsCompleted ?? p.weeklyMissionsCompleted ?? 0);
        if (completed >= (cond.threshold ?? 2)) earned = true;
        break;
      }

      case "streak_days":
        if (effectiveStreakDays >= (cond.threshold ?? 3)) earned = true;
        break;

      case "streak_medal_count": {
        const targetId = cond.targetMedalId;
        const requiredCount = cond.threshold ?? 3;
        if (targetId && Array.isArray(p.unlockedMedals)) {
          const found = p.unlockedMedals.find((m: any) =>
            (typeof m === "string" ? m : (m?.medalId ?? m?.id)) === targetId,
          );
          if (found) {
            const count =
              typeof found === "object" && typeof (found as any).count === "number"
                ? (found as any).count
                : 1;
            if (count >= requiredCount) earned = true;
          }
        }
        break;
      }

      case "tournament_rank":
        if (
          cond.targetRank &&
          Array.isArray(p.tournamentMedals) &&
          p.tournamentMedals.some((tm) => {
            if (!tm || tm.rank !== cond.targetRank) return false;
            const isProjected = String(tm.id || "").startsWith("projected_");
            return !isProjected;
          })
        ) {
          earned = true;
        }
        break;

      case "tournament_rank_mastery": {
        const threshold = cond.threshold ?? 61;
        const pts = Math.max(
          (p as any)?.tournamentPoints ?? 0,
          (p as any)?.bestTournamentPoints ?? 0,
        );
        if (pts >= threshold) {
          earned = true;
        }
        break;
      }

      case "all_level_medals":
        if (currentLevelMedals === 9) earned = true;
        break;

      case "all_game_medals": {
        const allGameMasterMedalsUnlocked =
          eligibleGamesForMeta.length > 0 &&
          eligibleGamesForMeta.every((gId) => {
            const mId = `game_${gId}_lvl_master`;
            return existingSet.has(mId) || newlyAwarded.some((m) => m.id === mId);
          });
        if (allGameMasterMedalsUnlocked) earned = true;
        break;
      }

      case "total_medals_count":
        if (existingSet.size + newlyAwarded.length >= (cond.threshold ?? 50)) earned = true;
        break;

      case "beta_tester_bronze":
        if (
          isBetaActive &&
          (totalCompletedPlays >= 1 || (p.matchesPlayed ?? 0) >= 1 || (p.totalPlays ?? 0) >= 1)
        ) {
          earned = true;
        }
        break;

      case "beta_tester_prata":
        if (isBetaActive && gamesWith2Plays >= 4) {
          earned = true;
        }
        break;

      case "beta_tester_ouro":
        if (isBetaActive && gamesWith2Plays >= 6) {
          earned = true;
        }
        break;

      case "beta_tester_platina":
        if (isBetaActive && gamesWith2Plays >= (cond.threshold ?? 10)) {
          earned = true;
        }
        break;

      case "beta_tester_heroi":
        if (isBetaActive && gamesWith10Plays >= (cond.threshold ?? 10) && p.level >= 5) {
          earned = true;
        }
        break;

      case "daily_post_cap_matches": {
        const todayKey = getLocalDateKey(now);
        const postCapMatches = getDailyPostCapMatches(p, todayKey);
        const target = cond.threshold ?? 10;
        if (postCapMatches >= target) {
          earned = true;
        }
        break;
      }

      case "total_matches_played": {
        const target = cond.threshold ?? 50;
        if (totalCompletedPlays >= target) {
          earned = true;
        }
        break;
      }

      case "normal_matches_total": {
        const target = cond.threshold ?? 100;
        const normalPlays = ctx.stats
          .filter((s) => s.mode !== "x1_online" && s.mode !== "torneio_semanal")
          .reduce((sum, s) => sum + (Number(s.plays) || 0), 0);
        if (normalPlays >= target) {
          earned = true;
        }
        break;
      }

      case "lifetime_coins": {
        const target = cond.threshold ?? 100;
        const cur = Math.max(p.lifetimeCoins ?? 0, p.coins ?? 0);
        if (cur >= target) earned = true;
        break;
      }

      case "coins_spent_total": {
        const target = cond.threshold ?? 50;
        const cur = Math.max(0, p.coinsSpentTotal ?? 0);
        if (cur >= target) earned = true;
        break;
      }

      case "cosmetics_purchased_count": {
        const target = cond.threshold ?? 1;
        const cur = Array.isArray(p.purchasedCosmeticIds) ? p.purchasedCosmeticIds.length : 0;
        if (cur >= target) earned = true;
        break;
      }

      case "chests_opened_total": {
        const target = cond.threshold ?? 1;
        const cur = Math.max(0, p.chestsOpenedTotal ?? 0);
        if (cur >= target) earned = true;
        break;
      }

      case "packs_opened_total": {
        const target = cond.threshold ?? 1;
        const cur = Math.max(0, p.packsOpenedTotal ?? 0);
        if (cur >= target) earned = true;
        break;
      }

      case "unique_cards_count": {
        const target = cond.threshold ?? 10;
        const cardsMap = p.cards ?? {};
        const cur = Object.values(cardsMap).filter((qty) => (Number(qty) || 0) > 0).length;
        if (cur >= target) earned = true;
        break;
      }

      case "total_cards_count": {
        const target = cond.threshold ?? 20;
        const cardsMap = p.cards ?? {};
        const cur = Object.values(cardsMap).reduce((sum, qty) => sum + Math.max(0, Number(qty) || 0), 0);
        if (cur >= target) earned = true;
        break;
      }

      case "top5_weeks_count": {
        const target = cond.threshold ?? 2;
        if (getTop5TotalWeeks(p) >= target) {
          earned = true;
        }
        break;
      }

      case "top1_consecutive_weeks": {
        const target = cond.threshold ?? 2;
        if (getTop1ConsecutiveWeeks(p) >= target) {
          earned = true;
        }
        break;
      }

      case "manual_event":
        // Only granted manually by ADM
        break;

      default:
        break;
    }

    // Avaliação de requisitos de medalhas de eventos especiais
    if (!earned && medal.eventRequirement) {
      const req = medal.eventRequirement;
      const evProg = (p as any)?.eventProgress?.[medal.eventId ?? ""];
      if (evProg) {
        switch (req.type) {
          case "event_matches": {
            const cur = req.gameId ? (evProg.matchesByGame?.[req.gameId] ?? 0) : (evProg.matchesCount ?? 0);
            if (cur >= req.threshold) earned = true;
            break;
          }
          case "event_xp": {
            const cur = req.gameId ? (evProg.xpByGame?.[req.gameId] ?? 0) : (evProg.xpEarned ?? 0);
            if (cur >= req.threshold) earned = true;
            break;
          }
          case "event_score": {
            const cur = req.gameId
              ? (evProg.bestScoreByGame?.[req.gameId] ?? 0)
              : Math.max(...Object.values(evProg.bestScoreByGame ?? {}).map(Number), 0);
            if (cur >= req.threshold) earned = true;
            break;
          }
          case "event_level": {
            const cur = req.gameId
              ? (evProg.bestLevelByGame?.[req.gameId] ?? 1)
              : Math.max(...Object.values(evProg.bestLevelByGame ?? {}).map(Number), 1);
            if (cur >= req.threshold) earned = true;
            break;
          }
          case "event_flawless": {
            const flawlessCur = req.gameId
              ? (evProg.flawlessByGame?.[req.gameId] ?? 0)
              : (evProg.flawlessCount ?? 0);
            const bestScoreOk =
              req.minScore === undefined ||
              (req.gameId
                ? (evProg.bestScoreByGame?.[req.gameId] ?? 0) >= req.minScore
                : Math.max(...Object.values(evProg.bestScoreByGame ?? {}).map(Number), 0) >=
                  req.minScore);
            if (flawlessCur >= req.threshold && bestScoreOk) earned = true;
            break;
          }
          case "event_x1_wins": {
            if ((evProg.x1Wins ?? 0) >= req.threshold) earned = true;
            break;
          }
          case "event_combo": {
            if ((evProg.maxCombo ?? 0) >= req.threshold) earned = true;
            break;
          }
          case "event_daily_cap": {
            if ((evProg.dailyCapDaysCount ?? 0) >= req.threshold) earned = true;
            break;
          }
          case "event_team_matches": {
            if ((evProg.teamMatchesCount ?? 0) >= req.threshold) earned = true;
            break;
          }
          case "event_distinct_games": {
            if ((evProg.distinctGamesPlayed?.length ?? 0) >= req.threshold) earned = true;
            break;
          }
        }
      }
    }

    if (earned) {
      newlyAwarded.push(medal);
      if (medal.id.startsWith("game_") && medal.id.endsWith("_flawless") && cond.gameId) {
        flawlessGamesSet.add(cond.gameId);
      }
    }
  }

  return newlyAwarded;
}

export interface MedalProgressInfo {
  percent: number;
  progressText: string;
}

/**
 * Calculates current progress towards unlocking a locked medal.
 */
export function calculateMedalProgress(
  medal: MedalDefinition,
  profile?: PlayerProfile | null,
  stats: GameStatRow[] = [],
  enabledGamesOverride?: Partial<Record<GameId, boolean>>,
): MedalProgressInfo {
  if (!profile) {
    return { percent: 0, progressText: "" };
  }

  // Progresso de medalhas exclusivas de eventos
  if (medal.eventRequirement) {
    const req = medal.eventRequirement;
    const evProg = (profile as any)?.eventProgress?.[medal.eventId ?? ""];
    if (!evProg) {
      return {
        percent: 0,
        progressText: `0 de ${req.threshold} no evento`,
      };
    }
    let cur = 0;
    switch (req.type) {
      case "event_matches":
        cur = req.gameId ? (evProg.matchesByGame?.[req.gameId] ?? 0) : (evProg.matchesCount ?? 0);
        break;
      case "event_xp":
        cur = req.gameId ? (evProg.xpByGame?.[req.gameId] ?? 0) : (evProg.xpEarned ?? 0);
        break;
      case "event_score":
        cur = req.gameId
          ? (evProg.bestScoreByGame?.[req.gameId] ?? 0)
          : Math.max(...Object.values(evProg.bestScoreByGame ?? {}).map(Number), 0);
        break;
      case "event_level":
        cur = req.gameId
          ? (evProg.bestLevelByGame?.[req.gameId] ?? 1)
          : Math.max(...Object.values(evProg.bestLevelByGame ?? {}).map(Number), 1);
        break;
      case "event_flawless":
        cur = req.gameId
          ? (evProg.flawlessByGame?.[req.gameId] ?? 0)
          : (evProg.flawlessCount ?? 0);
        break;
      case "event_x1_wins":
        cur = evProg.x1Wins ?? 0;
        break;
      case "event_combo":
        cur = evProg.maxCombo ?? 0;
        break;
      case "event_daily_cap":
        cur = evProg.dailyCapDaysCount ?? 0;
        break;
      case "event_team_matches":
        cur = evProg.teamMatchesCount ?? 0;
        break;
      case "event_distinct_games":
        cur = evProg.distinctGamesPlayed?.length ?? 0;
        break;
      default:
        cur = 0;
    }
    const target = req.threshold || 1;
    const pct = Math.min(100, Math.round((cur / target) * 100));
    return {
      percent: pct,
      progressText: `${cur} de ${target} no evento`,
    };
  }

  const cond = medal.condition;
  const enabledSet = getEnabledGameIdsSet(enabledGamesOverride);
  const statsMap = aggregateStatsByGame(stats, enabledGamesOverride);
  const effectiveStats = stats.length > 0 ? stats : ((profile as any).stats ?? []);
  const effectiveStatsMap =
    stats.length > 0 ? statsMap : aggregateStatsByGame(effectiveStats, enabledGamesOverride);
  const aggregatedRows = Array.from(effectiveStatsMap.values()).filter((s) => s.plays > 0);

  switch (cond.type) {
    case "player_level": {
      const target = cond.threshold ?? 2;
      const eff = getEffectivePlayerProgression(profile, effectiveStats, enabledGamesOverride);
      const cur = Math.max(profile.level ?? 1, eff.level);
      const pct = Math.min(100, Math.round((cur / target) * 100));
      return {
        percent: pct,
        progressText: `Nível ${cur} de ${target} alcançado`,
      };
    }
    case "game_best_level": {
      const gId = cond.gameId!;
      const row = effectiveStatsMap.get(gId);
      const target = cond.threshold ?? 3;
      if (!row || row.plays <= 0) {
        return {
          percent: 0,
          progressText: `Nível 0 de ${target}`,
        };
      }
      const cur = Math.max(1, row.best_level ?? 1);
      const pct = Math.min(100, Math.round((cur / target) * 100));
      return {
        percent: pct,
        progressText: `Nível ${cur} de ${target}`,
      };
    }
    case "game_flawless": {
      const gId = cond.gameId!;
      const row = effectiveStatsMap.get(gId);
      const targetScore = cond.threshold ?? 30;
      if (row && row.flawless_wins >= 1 && row.best_score >= targetScore) {
        return {
          percent: 100,
          progressText: "Concluído com 0 erros!",
        };
      }
      const best = row?.best_score ?? 0;
      const pct = Math.min(90, Math.round((Math.min(best, targetScore) / targetScore) * 50));
      return {
        percent: pct,
        progressText:
          row?.last_wrong !== undefined && row.last_wrong > 0
            ? `Última partida teve ${row.last_wrong} erro(s) — finalize com 0 erros e ${targetScore}+ pts`
            : `Finalize uma partida com 0 erros e ${targetScore}+ pts`,
      };
    }
    case "game_match_count": {
      const gId = cond.gameId!;
      const cur = effectiveStatsMap.get(gId)?.plays ?? 0;
      const target = cond.threshold ?? 10;
      const pct = Math.min(100, Math.round((cur / target) * 100));
      return {
        percent: pct,
        progressText: `${cur} de ${target} partidas concluídas`,
      };
    }
    case "x1_wins_total": {
      const cur = profile.x1Wins ?? 0;
      const target = cond.threshold ?? 1;
      const pct = Math.min(100, Math.round((cur / target) * 100));
      return {
        percent: pct,
        progressText: `${cur} de ${target} vitórias conquistadas no X1 Online`,
      };
    }
    case "x1_wins_weekly": {
      const cur = profile.weeklyX1Wins ?? 0;
      const target = cond.threshold ?? 5;
      const pct = Math.min(100, Math.round((cur / target) * 100));
      return {
        percent: pct,
        progressText: `${cur} de ${target} vitórias no X1 nesta semana`,
      };
    }
    case "x1_matches_total": {
      const cur = profile.x1Matches ?? 0;
      const target = cond.threshold ?? 1;
      const pct = Math.min(100, Math.round((cur / target) * 100));
      return {
        percent: pct,
        progressText: `${cur} de ${target} partidas disputadas no X1`,
      };
    }
    case "x1_win_streak": {
      const cur = Math.max(profile.x1BestWinStreak ?? 0, profile.x1WinStreak ?? 0);
      const target = cond.threshold ?? 2;
      const pct = Math.min(100, Math.round((cur / target) * 100));
      return {
        percent: pct,
        progressText: `Melhor sequência: ${cur} de ${target} vitórias seguidas no X1`,
      };
    }
    case "x1_same_school_wins": {
      const cur = profile.x1SameSchoolWins ?? 0;
      const target = cond.threshold ?? 1;
      const pct = Math.min(100, Math.round((cur / target) * 100));
      return {
        percent: pct,
        progressText: `${cur} de ${target} vitórias contra colegas da mesma escola`,
      };
    }
    case "x1_other_school_wins": {
      const cur = profile.x1OtherSchoolWins ?? 0;
      const target = cond.threshold ?? 1;
      const pct = Math.min(100, Math.round((cur / target) * 100));
      return {
        percent: pct,
        progressText: `${cur} de ${target} vitórias contra jogadores de outras escolas`,
      };
    }
    case "x1_comeback_after_losses": {
      const target = cond.threshold ?? 3;
      const unlocked = target >= 5 ? Boolean(profile.x1Comeback5Unlocked) : Boolean(profile.x1Comeback3Unlocked || profile.x1Comeback5Unlocked);
      const curLoss = profile.x1LossStreak ?? 0;
      return {
        percent: unlocked ? 100 : Math.min(95, Math.round((curLoss / target) * 100)),
        progressText: unlocked
          ? "Virada épica concluída!"
          : `${Math.min(curLoss, target)}/${target} derrotas seguidas (vença a próxima!)`,
      };
    }
    case "completed_games_medals": {
      const target = cond.threshold ?? 1;
      const enabledSet = getEnabledGameIdsSet(enabledGamesOverride);
      const unlockedSet = new Set(
        (profile.unlockedMedals ?? [])
          .map((m: any) => (typeof m === "string" ? m : (m?.medalId ?? m?.id ?? "")))
          .filter(Boolean),
      );
      const allM = getAllAvailableMedals();
      const cur = countCompletedBaseGames(unlockedSet, enabledSet, allM);
      const pct = Math.min(100, Math.round((cur / target) * 100));
      return {
        percent: pct,
        progressText: `${cur} de ${target} jogos com todas as medalhas base conquistadas`,
      };
    }
    case "distinct_games": {
      const distinct = getDistinctGamesPlayed(
        profile,
        effectiveStats,
        undefined,
        enabledGamesOverride,
      );
      const target = cond.threshold ?? 3;
      const pct = Math.min(100, Math.round((distinct / target) * 100));
      return {
        percent: pct,
        progressText: `${distinct} de ${target} jogos explorados`,
      };
    }
    case "distinct_flawless_games": {
      const count = getDistinctFlawlessGames(
        profile,
        effectiveStats,
        undefined,
        enabledGamesOverride,
      ).size;
      const target = cond.threshold ?? 3;
      const pct = Math.min(100, Math.round((count / target) * 100));
      return {
        percent: pct,
        progressText: `${count} de ${target} jogos finalizados com zero erros`,
      };
    }
    case "distinct_specialist_games": {
      const enabledSet = getEnabledGameIdsSet(enabledGamesOverride);
      const unlockedSet = new Set(
        (profile?.unlockedMedals ?? [])
          .map((m: any) => (typeof m === "string" ? m : (m?.medalId ?? m?.id ?? "")))
          .filter(Boolean),
      );
      const count = Array.from(enabledSet).filter((gId) => {
        const s = effectiveStatsMap.get(gId);
        return Boolean((s && s.plays > 0 && s.best_level >= 3) || unlockedSet.has(`game_${gId}_lvl_master`));
      }).length;
      const target = cond.threshold ?? 10;
      const pct = Math.min(100, Math.round((count / target) * 100));
      return {
        percent: pct,
        progressText: `${count} de ${target} jogos com nível Especialista (Nv. 3+)`,
      };
    }
    case "distinct_games_with_50_matches": {
      const enabledSet = getEnabledGameIdsSet(enabledGamesOverride);
      const unlockedSet = new Set(
        (profile?.unlockedMedals ?? [])
          .map((m: any) => (typeof m === "string" ? m : (m?.medalId ?? m?.id ?? "")))
          .filter(Boolean),
      );
      const count = Array.from(enabledSet).filter((gId) => {
        const s = effectiveStatsMap.get(gId);
        return Boolean((s && s.plays >= 50) || unlockedSet.has(`game_${gId}_matches_50`));
      }).length;
      const target = cond.threshold ?? 10;
      const pct = Math.min(100, Math.round((count / target) * 100));
      return {
        percent: pct,
        progressText: `${count} de ${target} jogos com 50 partidas disputadas`,
      };
    }
    case "max_daily_xp": {
      const cur = profile.dailyXp ?? 0;
      const target = cond.threshold ?? 1000;
      const pct = Math.min(100, Math.round((cur / target) * 100));
      return {
        percent: pct,
        progressText: `${cur} de ${target} XP diário acumulado hoje`,
      };
    }
    case "daily_missions_completed": {
      const cur = Math.max(0, profile.dailyMissionsCompleted ?? 0);
      const target = cond.threshold ?? 3;
      const pct = Math.min(100, Math.round((cur / target) * 100));
      return {
        percent: pct,
        progressText: `${cur} de ${target} tarefas diárias concluídas`,
      };
    }
    case "weekly_missions_completed": {
      const cur = Math.max(0, profile.weeklyMissionsCompleted ?? 0);
      const target = cond.threshold ?? 2;
      const pct = Math.min(100, Math.round((cur / target) * 100));
      return {
        percent: pct,
        progressText: `${cur} de ${target} missões semanais concluídas`,
      };
    }
    case "streak_days": {
      const cur = Math.max(getPlayerStreakDays(profile), Math.floor(profile.dailyCheckInCount ?? 0));
      const target = cond.threshold ?? 3;
      const pct = Math.min(100, Math.round((cur / target) * 100));
      return {
        percent: pct,
        progressText: `${cur} de ${target} dias consecutivos ativos`,
      };
    }
    case "streak_medal_count": {
      const targetId = cond.targetMedalId;
      const target = cond.threshold ?? 3;
      let cur = 0;
      if (targetId && Array.isArray(profile.unlockedMedals)) {
        const found = profile.unlockedMedals.find((m: any) =>
          (typeof m === "string" ? m : (m?.medalId ?? m?.id)) === targetId,
        );
        if (found) {
          cur =
            typeof found === "object" && typeof (found as any).count === "number"
              ? (found as any).count
              : 1;
        }
      }
      const pct = Math.min(100, Math.round((cur / target) * 100));
      return {
        percent: pct,
        progressText: `${cur} de ${target} conquistas acumuladas`,
      };
    }
    case "tournament_rank": {
      const target = cond.targetRank ?? 1;
      const bestRank =
        profile.tournamentMedals && profile.tournamentMedals.length > 0
          ? Math.min(...profile.tournamentMedals.map((m) => m.rank))
          : null;
      return {
        percent: bestRank !== null && bestRank <= target ? 100 : 0,
        progressText:
          bestRank !== null
            ? `Melhor colocação semanal: ${bestRank}º lugar (meta: ${target}º)`
            : `Alcance o ${target}º lugar da sua etapa no Torneio Semanal`,
      };
    }
    case "tournament_rank_mastery": {
      const threshold = cond.threshold ?? 61;
      const isLevelEligible = (profile.level ?? 1) >= 3;
      const tourPlays = Array.isArray((profile as any)?.stats)
        ? (profile as any).stats.filter((s: any) => s?.mode === "torneio_semanal").reduce((sum: number, s: any) => sum + (s?.plays ?? 0), 0)
        : 0;

      // Trava de segurança: alunos abaixo do nível 3 ou sem partidas ranqueadas não têm progresso nesta medalha
      if (!isLevelEligible || tourPlays === 0) {
        return {
          percent: 0,
          progressText: `0 / ${threshold} pts no Torneio Semanal (exige Nível 3+)`,
        };
      }

      const pts = Math.max(
        (profile as any)?.tournamentPoints ?? 0,
        (profile as any)?.bestTournamentPoints ?? 0,
      );
      const percent = Math.min(100, Math.round((pts / threshold) * 100));
      return {
        percent,
        progressText: `${pts} / ${threshold} pts no Torneio Semanal`,
      };
    }
    case "total_medals_count": {
      const count = profile.unlockedMedals?.length ?? 0;
      const target = cond.threshold ?? 50;
      const pct = Math.min(100, Math.round((count / target) * 100));
      return {
        percent: pct,
        progressText: `${count} de ${target} medalhas obtidas`,
      };
    }
    case "all_level_medals": {
      const cur = profile.level;
      const pct = Math.min(100, Math.round((cur / 10) * 100));
      return {
        percent: pct,
        progressText: `Nível ${cur}/10 para Lenda dos Níveis`,
      };
    }
    case "beta_tester_bronze": {
      const totalPlays = aggregatedRows.reduce((acc, s) => acc + s.plays, 0);
      const pct =
        totalPlays >= 1 || (profile.matchesPlayed ?? 0) >= 1 || (profile.totalPlays ?? 0) >= 1
          ? 100
          : 0;
      return {
        percent: pct,
        progressText: `${pct === 100 ? 1 : 0} de 1 partida finalizada`,
      };
    }
    case "beta_tester_prata": {
      const games = aggregatedRows.filter((s) => s.plays >= 2).length;
      const target = 4;
      const pct = Math.min(100, Math.round((games / target) * 100));
      return {
        percent: pct,
        progressText: `${games} de ${target} jogos com 2+ partidas finalizadas`,
      };
    }
    case "beta_tester_ouro": {
      const games = aggregatedRows.filter((s) => s.plays >= 2).length;
      const target = 6;
      const pct = Math.min(100, Math.round((games / target) * 100));
      return {
        percent: pct,
        progressText: `${games} de ${target} jogos com 2+ partidas finalizadas`,
      };
    }
    case "beta_tester_platina": {
      const games = aggregatedRows.filter((s) => s.plays >= 2).length;
      const target = cond.threshold ?? 10;
      const pct = Math.min(100, Math.round((games / target) * 100));
      return {
        percent: pct,
        progressText: `${games} de ${target} jogos com 2+ partidas finalizadas`,
      };
    }
    case "beta_tester_heroi": {
      const games = aggregatedRows.filter((s) => s.plays >= 10).length;
      const targetGames = cond.threshold ?? 10;
      const lvlTarget = 5;
      const lvlPct = Math.min(1, profile.level / lvlTarget);
      const gamesPct = Math.min(1, games / targetGames);
      const pct = Math.min(100, Math.round(((lvlPct + gamesPct) / 2) * 100));
      return {
        percent: pct,
        progressText: `${games} de ${targetGames} jogos com 10+ partidas (Nível ${profile.level}/${lvlTarget})`,
      };
    }
    case "daily_post_cap_matches": {
      const todayKey = getLocalDateKey();
      const postCapToday = getDailyPostCapMatches(profile, todayKey);
      const target = cond.threshold ?? 10;
      const pct = Math.min(100, Math.round((postCapToday / target) * 100));
      return {
        percent: pct,
        progressText: `${postCapToday} de ${target} partidas hoje com limite de XP atingido`,
      };
    }
    case "total_matches_played": {
      const target = cond.threshold ?? 50;
      const cur = Math.max(
        profile.matchesPlayed ?? 0,
        (profile as any).totalMatches ?? 0,
        aggregatedRows.reduce((acc, s) => acc + s.plays, 0),
      );
      const pct = Math.min(100, Math.round((cur / target) * 100));
      return {
        percent: pct,
        progressText: `${cur} de ${target} partidas disputadas`,
      };
    }
    case "normal_matches_total": {
      const target = cond.threshold ?? 100;
      const cur = stats
        .filter((s) => s.mode !== "x1_online" && s.mode !== "torneio_semanal")
        .reduce((sum, s) => sum + (Number(s.plays) || 0), 0);
      const pct = Math.min(100, Math.round((cur / target) * 100));
      return {
        percent: pct,
        progressText: `${cur} de ${target} partidas normais`,
      };
    }
    case "lifetime_coins": {
      const target = cond.threshold ?? 100;
      const cur = Math.max(profile.lifetimeCoins ?? 0, profile.coins ?? 0);
      const pct = Math.min(100, Math.round((cur / target) * 100));
      return {
        percent: pct,
        progressText: `${cur.toLocaleString("pt-BR")} de ${target.toLocaleString("pt-BR")} moedas conseguidas`,
      };
    }
    case "coins_spent_total": {
      const target = cond.threshold ?? 50;
      const cur = Math.max(0, profile.coinsSpentTotal ?? 0);
      const pct = Math.min(100, Math.round((cur / target) * 100));
      return {
        percent: pct,
        progressText: `${cur.toLocaleString("pt-BR")} de ${target.toLocaleString("pt-BR")} moedas gastas`,
      };
    }
    case "cosmetics_purchased_count": {
      const target = cond.threshold ?? 1;
      const cur = Array.isArray(profile.purchasedCosmeticIds) ? profile.purchasedCosmeticIds.length : 0;
      const pct = Math.min(100, Math.round((cur / target) * 100));
      return {
        percent: pct,
        progressText: `${cur} de ${target} cosméticos comprados`,
      };
    }
    case "chests_opened_total": {
      const target = cond.threshold ?? 1;
      const cur = Math.max(0, profile.chestsOpenedTotal ?? 0);
      const pct = Math.min(100, Math.round((cur / target) * 100));
      return {
        percent: pct,
        progressText: `${cur} de ${target} baús abertos`,
      };
    }
    case "packs_opened_total": {
      const target = cond.threshold ?? 1;
      const cur = Math.max(0, profile.packsOpenedTotal ?? 0);
      const pct = Math.min(100, Math.round((cur / target) * 100));
      return {
        percent: pct,
        progressText: `${cur} de ${target} pacotes abertos`,
      };
    }
    case "unique_cards_count": {
      const target = cond.threshold ?? 10;
      const cur = Object.values(profile.cards ?? {}).filter((qty) => (Number(qty) || 0) > 0).length;
      const pct = Math.min(100, Math.round((cur / target) * 100));
      return {
        percent: pct,
        progressText: `${cur} de ${target} cartas diferentes`,
      };
    }
    case "total_cards_count": {
      const target = cond.threshold ?? 20;
      const cur = Object.values(profile.cards ?? {}).reduce((sum, qty) => sum + Math.max(0, Number(qty) || 0), 0);
      const pct = Math.min(100, Math.round((cur / target) * 100));
      return {
        percent: pct,
        progressText: `${cur} de ${target} cartas no total`,
      };
    }
    case "top5_weeks_count": {
      const target = cond.threshold ?? 2;
      const cur = getTop5TotalWeeks(profile);
      const pct = Math.min(100, Math.round((cur / target) * 100));
      return {
        percent: pct,
        progressText: `${cur} de ${target} semanas no Top 5`,
      };
    }
    case "top1_consecutive_weeks": {
      const target = cond.threshold ?? 2;
      const cur = getTop1ConsecutiveWeeks(profile);
      const pct = Math.min(100, Math.round((cur / target) * 100));
      return {
        percent: pct,
        progressText: `${cur} de ${target} semanas consecutivas no Top 1`,
      };
    }
    default:
      return { percent: 0, progressText: medal.description };
  }
}

function normalizeSearchText(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

/**
 * Filtra medalhas por título, descrição, ID ou raridade (ex: "prata", "ouro", "platina").
 */
export function filterMedalsByQuery(
  medals: MedalDefinition[],
  query: string
): MedalDefinition[] {
  const q = normalizeSearchText(query);
  if (!q) return medals;

  const terms = q.split(/\s+/).filter(Boolean);
  return medals.filter((m) => {
    const rarityLabel = RARITY_INFO[m.rarity]?.label ?? "";
    const categoryLabel = CATEGORY_LABELS[m.category] ?? "";
    const haystack = normalizeSearchText(
      `${m.title ?? ""} ${m.description ?? ""} ${m.id ?? ""} ${m.rarity ?? ""} ${rarityLabel} ${m.category ?? ""} ${categoryLabel}`
    );
    return terms.every((term) => haystack.includes(term));
  });
}
