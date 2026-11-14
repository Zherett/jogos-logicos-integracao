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
    | "distinct_games"
    | "distinct_flawless_games"
    | "distinct_specialist_games"
    | "distinct_games_with_50_matches"
    | "max_daily_xp"
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
    | "top5_weeks_count"
    | "top1_consecutive_weeks"
    | "manual_event"
    | EventRequirementType;
  threshold?: number;
  gameId?: GameId;
  targetRank?: number; // 1, 2, 3
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

  // 3. Por Jogo: Quantidade de Partidas (10, 20, 30, 40, 50 partidas x 10 jogos = 50 medalhas)
  const matchThresholds = [10, 20, 30, 40, 50];
  const thresholdRarities: MedalRarity[] = ["bronze", "prata", "prata", "ouro", "platina"];

  for (const gId of ALL_GAME_IDS) {
    const gName = GAME_NAMES[gId];
    matchThresholds.forEach((count, idx) => {
      medals.push({
        id: `game_${gId}_matches_${count}`,
        title: `${gName}: ${count} Partidas`,
        description: `Complete ${count} partidas no jogo ${gName}.`,
        rarity: thresholdRarities[idx],
        category: "jogo_partidas",
        iconName: count === 50 ? "Award" : "Flame",
        gameId: gId,
        condition: { type: "game_match_count", gameId: gId, threshold: count },
      });
    });
  }

  // 4. Arena X1: Vitórias Gerais (1 a 10 vitórias = 10 medalhas)
  for (let w = 1; w <= 10; w++) {
    const rarity: MedalRarity = w <= 3 ? "bronze" : w <= 7 ? "prata" : "ouro";
    medals.push({
      id: `x1_wins_${w}`,
      title: w === 1 ? "Primeira Vitória no X1" : `Gladiador X1 (${w} Vitórias)`,
      description: `Vença ${w} ${w === 1 ? "partida" : "partidas"} na Arena de Desafio X1 Online.`,
      rarity,
      category: "x1_vitorias",
      iconName: "Swords",
      condition: { type: "x1_wins_total", threshold: w },
    });
  }

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
      condition: { type: "streak_days", threshold: 3 },
    },
    {
      id: "streak_5_days",
      title: "Disciplina de Campeão (5 Dias)",
      description: "Fique ativo e jogue partidas por 5 dias consecutivos.",
      rarity: "prata",
      category: "atividade",
      iconName: "Flame",
      condition: { type: "streak_days", threshold: 5 },
    },
    {
      id: "streak_7_days",
      title: "Constância Lendária (7 Dias)",
      description: "Fique ativo e jogue partidas por 7 dias consecutivos sem falhar nenhum dia!",
      rarity: "ouro",
      category: "atividade",
      iconName: "Rocket",
      condition: { type: "streak_days", threshold: 7 },
    },
  );

  // 10. Ranking do Torneio Semanal (Top 1 Ouro, Top 2 Prata, Top 3 Bronze)
  medals.push(
    {
      id: "tournament_top_1_gold",
      title: "Campeão Semanal (Ouro)",
      description: "Mantenha o 1º lugar da sua etapa no fechamento do torneio semanal (domingo 23:59).",
      rarity: "ouro",
      category: "ranking",
      iconName: "Trophy",
      condition: { type: "tournament_rank", targetRank: 1 },
    },
    {
      id: "tournament_top_2_silver",
      title: "Vice-Campeão Semanal (Prata)",
      description: "Conquiste o 2º lugar da sua etapa no fechamento do torneio semanal.",
      rarity: "prata",
      category: "ranking",
      iconName: "Medal",
      condition: { type: "tournament_rank", targetRank: 2 },
    },
    {
      id: "tournament_top_3_bronze",
      title: "3º Lugar Semanal (Bronze)",
      description: "Conquiste o 3º lugar da sua etapa no fechamento do torneio semanal.",
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

    // 16. Novas Medalhas Secretas de Maestria Multijogos
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
      secret: true,
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

/** Maximum streak of consecutive weeks a player finished in Top 1 */
export function getTop1ConsecutiveWeeks(profile?: PlayerProfile | null): number {
  if (!profile || !Array.isArray(profile.tournamentMedals)) return 0;
  const weeks = new Set<string>();

  for (const m of profile.tournamentMedals) {
    if (m.rank === 1) {
      if (m.weekKey) weeks.add(m.weekKey);
      if (Array.isArray(m.historyWeeks)) {
        for (const w of m.historyWeeks) weeks.add(w);
      }
    }
  }

  const streak = calculateMaxConsecutiveWeeks(Array.from(weeks));
  if (streak === 0 && profile.tournamentMedals.some((m) => m.rank === 1 && (m.count ?? 1) >= 1)) {
    return 1;
  }
  return streak;
}

let cachedBaseMedalsCatalog: MedalDefinition[] | null = null;

/** Merges the default catalog with custom medals defined by the administrator */
export function getAllAvailableMedals(customMedals?: MedalDefinition[]): MedalDefinition[] {
  if (!cachedBaseMedalsCatalog) {
    cachedBaseMedalsCatalog = buildBaseMedalsCatalog();
  }
  const base = cachedBaseMedalsCatalog;
  if (!customMedals || customMedals.length === 0) return base;
  const map = new Map<string, MedalDefinition>();
  base.forEach((m) => map.set(m.id, m));
  customMedals.forEach((m) => map.set(m.id, m));
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
      m.gameId === gameId ||
      m.condition.gameId === gameId ||
      m.eventRequirement?.gameId === gameId ||
      eventLinkedIds.has(m.id),
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

/** Selects the up to `limit` (default 6) highest-rarity / most valuable medals to feature in profile highlights */
export function getTopShowcaseMedals(
  unlockedMedals: PlayerUnlockedMedal[],
  allMedals = getAllAvailableMedals(),
  limit = 6,
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

  // Sort by rarity weight descending, then by title
  list.sort((a, b) => {
    const weightDiff = RARITY_INFO[b.rarity].weight - RARITY_INFO[a.rarity].weight;
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
  streakDays?: number;
  weeklyX1Wins?: number;
  enabledGames?: Partial<Record<GameId, boolean>>;
}

let cachedAdminEnabledGamesRaw: string | null = null;
let cachedAdminEnabledGamesMap: Partial<Record<GameId, boolean>> = {};

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
      (row.best_level ?? 1) >= 2 ||
      playsToAdd >= 2;
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

  // 3. Última partida
  if (
    lastMatch &&
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
    } else if (pXp > 0 || pWins > 0 || pMatches > 0) {
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
        xp >= 354 && wins >= 2 ? 5 : xp >= 100 && wins >= 1 ? 2 : xp > 0 ? 1 : 0,
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

  const p = ctx.profile;
  const enabledSet = getEnabledGameIdsSet(ctx.enabledGames);
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

  for (const medal of allMedals) {
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

      case "streak_days":
        if (effectiveStreakDays >= (cond.threshold ?? 3)) earned = true;
        break;

      case "tournament_rank":
        if (
          cond.targetRank &&
          Array.isArray(p.tournamentMedals) &&
          p.tournamentMedals.some((tm) => {
            if (!tm || tm.rank !== cond.targetRank) return false;
            // Torneio semanal em andamento (W46 encerra apenas em 15/11 às 23:59) NÃO pode conceder medalha de pódio oficial prematuramente
            const isOngoingOrProjected =
              tm.weekKey === "2026-W46" ||
              tm.weekKey === "Season_1" ||
              String(tm.id || "").startsWith("projected_") ||
              (typeof tm.label === "string" && tm.label.includes("RoboGrid"));
            return !isOngoingOrProjected;
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
        const allGameMasterMedalsUnlocked = ALL_GAME_IDS.every((gId) => {
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
        const todayKey = getLocalDateKey();
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
            if ((evProg.flawlessCount ?? 0) >= req.threshold) earned = true;
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
        cur = evProg.flawlessCount ?? 0;
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
    case "streak_days": {
      const cur = getPlayerStreakDays(profile);
      const target = cond.threshold ?? 3;
      const pct = Math.min(100, Math.round((cur / target) * 100));
      return {
        percent: pct,
        progressText: `${cur} de ${target} dias consecutivos ativos`,
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
    const haystack = normalizeSearchText(
      `${m.title} ${m.description} ${m.id} ${m.rarity} ${rarityLabel}`
    );
    return terms.every((term) => haystack.includes(term));
  });
}
