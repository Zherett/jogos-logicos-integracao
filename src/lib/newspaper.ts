import { GAME_NAMES, type GameId } from "./game-storage.ts";
import type { AllGameRecords } from "./game-records.ts";
import { getAllAvailableMedals, type MedalDefinition } from "./medals-catalog.ts";
import type { MedalPioneer } from "./medal-pioneers.ts";
import { isPioneerExcludedAccount, nickSlug, stageForPlayer } from "./player-profile.ts";
import { COARI_OFFSET_MS, getOfficialNow } from "./official-time.ts";
import type { PlayerProfile } from "./playfab.ts";

export interface NewspaperPlayerRef {
  playerId: string;
  nick: string;
  school: string;
  level: number;
  xp: number;
  medalsCount: number;
  metricLabel?: string;
}

export type NewspaperArticleKind = "plantao" | "top3" | "destaque" | "recorde" | "escola";
export type NewspaperAccentTone = "red" | "amber" | "sky" | "emerald" | "purple";

export interface NewsArticle {
  id: string;
  kind: NewspaperArticleKind;
  badge: string;
  isBreaking?: boolean;
  headline: string;
  summary: string;
  accentTone: NewspaperAccentTone;
  featuredPlayer?: NewspaperPlayerRef;
  top3Players?: NewspaperPlayerRef[];
  metrics?: Array<{ label: string; value: string }>;
}

/**
 * Retorna a chave da edição diária do jornal, com virada programada para as 07h00 da manhã.
 * Antes das 07h00 usa a edição do dia anterior; a partir das 07h00 já vale a edição do dia atual.
 */
export function getNewspaperEditionKey(now = getOfficialNow()): string {
  // Fuso horário oficial de Coari (UTC-4), virando diariamente às 07h00 Coari
  const shifted = new Date(now.getTime() + COARI_OFFSET_MS);
  if (shifted.getUTCHours() < 7) {
    shifted.setUTCDate(shifted.getUTCDate() - 1);
  }
  const yyyy = shifted.getUTCFullYear();
  const mm = String(shifted.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(shifted.getUTCDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function hashSeed(str: string): number {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function countMedals(p: PlayerProfile): number {
  const countsById = new Map<string, number>();
  for (const m of Array.isArray(p.unlockedMedals) ? p.unlockedMedals : []) {
    const rawId = typeof m === "string" ? m : m?.medalId;
    if (!rawId || rawId.startsWith("projected_")) continue;
    const count = typeof m === "object" && m ? Math.max(1, Math.floor(m.count ?? 1)) : 1;
    countsById.set(rawId, Math.max(countsById.get(rawId) ?? 0, count));
  }
  for (const tm of Array.isArray(p.tournamentMedals) ? p.tournamentMedals : []) {
    if (!tm || !tm.id || tm.id.startsWith("projected_")) continue;
    const count = Math.max(1, Math.floor(tm.count ?? 1));
    countsById.set(tm.id, Math.max(countsById.get(tm.id) ?? 0, count));
  }
  let total = 0;
  for (const c of countsById.values()) {
    total += c;
  }
  return total;
}

function toPlayerRef(p: PlayerProfile, metricLabel?: string): NewspaperPlayerRef {
  return {
    playerId: p.id || p.nickNormalized || p.nick,
    nick: p.nick,
    school: p.school || "Comunidade",
    level: p.level ?? 1,
    xp: p.xp ?? 0,
    medalsCount: countMedals(p),
    metricLabel,
  };
}

function stageLabelFromId(stageId: string): string {
  if (stageId === "etapa_1") return "1ª Etapa";
  if (stageId === "etapa_2") return "2ª Etapa";
  if (stageId === "etapa_3") return "3ª Etapa";
  return stageId;
}

export interface GenerateNewspaperInput {
  players: PlayerProfile[];
  records?: AllGameRecords;
  pioneers?: Record<string, MedalPioneer>;
  medals?: MedalDefinition[];
  now?: Date;
}

/**
 * Gera a lista de matérias do Jornal Dinâmico a partir dos dados reais da plataforma.
 */
export function generateNewspaperArticles(input: GenerateNewspaperInput): NewsArticle[] {
  const now = input.now ?? new Date();
  const editionKey = getNewspaperEditionKey(now);
  const seed = hashSeed(editionKey);
  const medalsCatalog = input.medals ?? getAllAvailableMedals();
  const medalById = new Map(medalsCatalog.map((m) => [m.id, m]));

  const eligible = input.players.filter(
    (p) => p && !p.deletedAt && !p.isAdmin && !isPioneerExcludedAccount(p),
  );

  if (eligible.length === 0) {
    return [
      {
        id: `empty_${editionKey}`,
        kind: "destaque",
        badge: "📰 EDIÇÃO DAS 07H",
        headline: "Jornal Integração pronto para novas conquistas!",
        summary:
          "Jogue partidas, conquiste medalhas raras e suba no ranking para aparecer nas manchetes da rede SEMED Coari.",
        accentTone: "sky",
      },
    ];
  }

  const breakingArticles: NewsArticle[] = [];
  const regularArticles: NewsArticle[] = [];
  const nowMs = now.getTime();
  const RECENT_WINDOW_MS = 72 * 60 * 60 * 1000;

  // 1. PLANTÃO: Medalhas raras/misteriosas desbloqueadas recentemente ou pioneiros
  const rareRarities = new Set(["heroi", "diamante", "platina", "ouro", "secreta", "lendaria"]);
  let latestRareUnlock: {
    player: PlayerProfile;
    medal: MedalDefinition;
    unlockedAtMs: number;
  } | null = null;

  for (const p of eligible) {
    for (const um of p.unlockedMedals ?? []) {
      const def = medalById.get(um.medalId);
      if (!def) continue;
      const isSpecialMedal =
        def.isSecret === true ||
        def.id === "m_rpg_carmesim" ||
        def.id === "m_rpg_ametista" ||
        def.id.startsWith("sq_") ||
        def.id.startsWith("m_sq_");
      if (!rareRarities.has(def.rarity) && !isSpecialMedal) continue;
      const ts = um.unlockedAt ? new Date(um.unlockedAt).getTime() : 0;
      if (!Number.isFinite(ts) || ts <= 0) continue;
      if (!latestRareUnlock || ts > latestRareUnlock.unlockedAtMs) {
        latestRareUnlock = { player: p, medal: def, unlockedAtMs: ts };
      }
    }
  }

  if (latestRareUnlock) {
    const ageMs = nowMs - latestRareUnlock.unlockedAtMs;
    const isFresh = ageMs >= 0 && ageMs <= RECENT_WINDOW_MS;
    const { player, medal } = latestRareUnlock;
    const isSecret =
      (medal.rarity as string) === "secreta" ||
      medal.isSecret === true ||
      medal.id === "m_rpg_carmesim" ||
      medal.id === "m_rpg_ametista";
    breakingArticles.push({
      id: `rare_medal_${medal.id}_${player.nickNormalized}`,
      kind: isFresh ? "plantao" : "destaque",
      badge: isFresh ? "🚨 ÚLTIMA HORA" : "💎 MEDALHA RARA",
      isBreaking: isFresh,
      headline: isSecret
        ? `${player.nick} desbloqueou uma medalha misteriosa: ${medal.title}!`
        : `${player.nick} conquistou a medalha rara ${medal.title}!`,
      summary: `${player.school} em destaque! A conquista "${medal.title}" (${medal.category}) chamou a atenção da rede.`,
      accentTone: isFresh ? "red" : "purple",
      featuredPlayer: toPlayerRef(player),
      metrics: [
        { label: "Escola", value: player.school || "Comunidade" },
        { label: "Nível", value: `Nv. ${player.level ?? 1}` },
        { label: "Medalhas", value: String(countMedals(player)) },
      ],
    });
  }

  // 2. PLANTÃO: Novo Recorde recente em algum jogo/etapa
  if (input.records) {
    let newestRecord: {
      gameId: GameId;
      stage: string;
      score: number;
      holderNick: string;
      holderSchool: string;
      holderId: string;
      achievedAt: number;
    } | null = null;

    for (const entry of Object.values(input.records)) {
      if (!entry || !entry.holders || entry.holders.length === 0) continue;
      for (const holder of entry.holders) {
        if (!holder) continue;
        const matched = eligible.find(
          (p) =>
            p.id === holder.playerId ||
            p.nickNormalized === holder.playerId ||
            (holder.nick && nickSlug(p.nick) === nickSlug(holder.nick)),
        );
        if (!matched) continue;
        const ageMs = nowMs - holder.achievedAt;
        if (ageMs < 0 || ageMs > RECENT_WINDOW_MS) continue;
        if (!newestRecord || holder.achievedAt > newestRecord.achievedAt) {
          newestRecord = {
            gameId: entry.gameId,
            stage: entry.stage,
            score: entry.score,
            holderNick: matched.nick,
            holderSchool: matched.school,
            holderId: matched.id,
            achievedAt: holder.achievedAt,
          };
        }
      }
    }

    if (newestRecord) {
      const recAge = nowMs - newestRecord.achievedAt;
      if (recAge >= 0 && recAge <= RECENT_WINDOW_MS) {
      const holderProfile = eligible.find((p) => p.id === newestRecord!.holderId);
      if (holderProfile) {
        breakingArticles.push({
          id: `record_break_${newestRecord.gameId}_${newestRecord.stage}_${newestRecord.score}`,
          kind: "plantao",
          badge: "🚨 NOVO RECORDE",
          isBreaking: true,
          headline: `${holderProfile.nick} quebrou o recorde em ${GAME_NAMES[newestRecord.gameId] ?? newestRecord.gameId}!`,
          summary: `Na ${stageLabelFromId(newestRecord.stage)}, alcançou a marca histórica de ${newestRecord.score.toLocaleString("pt-BR")} pontos.`,
          accentTone: "amber",
          featuredPlayer: toPlayerRef(holderProfile),
          metrics: [
            { label: "Pontuação", value: `${newestRecord.score.toLocaleString("pt-BR")} pts` },
            { label: "Etapa", value: stageLabelFromId(newestRecord.stage) },
            { label: "Escola", value: holderProfile.school || "Comunidade" },
          ],
        });
      }
      }
    }
  }

  // 3. PLANTÃO: Sequência Histórica no X1
  const topStreakX1 = [...eligible].sort(
    (a, b) => (b.x1BestWinStreak ?? 0) - (a.x1BestWinStreak ?? 0),
  )[0];
  if (topStreakX1 && (topStreakX1.x1BestWinStreak ?? 0) >= 5) {
    breakingArticles.push({
      id: `x1_streak_${topStreakX1.nickNormalized}_${topStreakX1.x1BestWinStreak}`,
      kind: "plantao",
      badge: "🔥 EM CHAMAS NO X1",
      isBreaking: true,
      headline: `${topStreakX1.nick} atingiu ${topStreakX1.x1BestWinStreak} vitórias seguidas na Arena X1!`,
      summary: `Desempenho impressionante nos duelos 1v1 ao vivo representando ${topStreakX1.school || "sua escola"}.`,
      accentTone: "red",
      featuredPlayer: toPlayerRef(topStreakX1),
      metrics: [
        { label: "Sequência", value: `${topStreakX1.x1BestWinStreak} vitórias` },
        { label: "Vitórias X1", value: String(topStreakX1.x1Wins ?? 0) },
      ],
    });
  }

  // 4. TOP 3: Maior Nível & XP Geral
  const byXp = [...eligible].sort((a, b) => {
    const lvlDiff = (b.level ?? 1) - (a.level ?? 1);
    if (lvlDiff !== 0) return lvlDiff;
    return (b.xp ?? 0) - (a.xp ?? 0);
  });

  if (byXp.length > 0) {
    const leader = byXp[0];
    regularArticles.push({
      id: `top3_level_${editionKey}`,
      kind: "top3",
      badge: "🏆 TOP 3 • NÍVEL & XP",
      headline: "Os 3 maiores níveis da plataforma",
      summary: "Clique em qualquer jogador do pódio para inspecionar seu perfil e suas conquistas.",
      accentTone: "sky",
      top3Players: byXp
        .slice(0, 3)
        .map((p) => toPlayerRef(p, `Nv. ${p.level ?? 1} • ${(p.xp ?? 0).toLocaleString("pt-BR")} XP`)),
    });

    regularArticles.push({
      id: `leader_xp_${editionKey}`,
      kind: "destaque",
      badge: "👑 LÍDER GERAL",
      headline: `${leader.nick} lidera a rede com ${(leader.xp ?? 0).toLocaleString("pt-BR")} XP!`,
      summary: `Representando ${leader.school || "a comunidade"}, está no Nível ${leader.level ?? 1} e soma ${countMedals(leader)} medalhas.`,
      accentTone: "amber",
      featuredPlayer: toPlayerRef(leader),
      metrics: [
        { label: "XP Total", value: (leader.xp ?? 0).toLocaleString("pt-BR") },
        { label: "Nível", value: `Nv. ${leader.level ?? 1}` },
        { label: "Medalhas", value: String(countMedals(leader)) },
      ],
    });
  }

  // 5. TOP 3: Colecionadores de Medalhas
  const byMedals = [...eligible]
    .filter((p) => countMedals(p) > 0)
    .sort((a, b) => countMedals(b) - countMedals(a));
  if (byMedals.length > 0) {
    regularArticles.push({
      id: `top3_medals_${editionKey}`,
      kind: "top3",
      badge: "🏅 TOP 3 • MEDALHAS",
      headline: "Os maiores colecionadores de medalhas",
      summary: "Veja quem já acumulou mais condecorações nos desafios e torneios da rede.",
      accentTone: "purple",
      top3Players: byMedals
        .slice(0, 3)
        .map((p) => toPlayerRef(p, `${countMedals(p)} medalha${countMedals(p) === 1 ? "" : "s"}`)),
    });
  }

  // 6. DESTAQUE DO DIA (rotaciona às 20h): Pioneiro de Medalha ou Chama Acesa (Streak) ou Rei do X1
  const dailyPool: NewsArticle[] = [];

  const byStreak = [...eligible].sort((a, b) => (b.streakDays ?? 0) - (a.streakDays ?? 0))[0];
  if (byStreak && (byStreak.streakDays ?? 0) >= 2) {
    dailyPool.push({
      id: `streak_king_${editionKey}`,
      kind: "destaque",
      badge: "🔥 ASSIDUIDADE",
      headline: `${byStreak.nick} está há ${byStreak.streakDays} dias seguidos jogando!`,
      summary: `Dedicação diária nos desafios de lógica representando ${byStreak.school || "a comunidade"}.`,
      accentTone: "amber",
      featuredPlayer: toPlayerRef(byStreak),
      metrics: [
        { label: "Ofensiva", value: `${byStreak.streakDays} dias` },
        { label: "Partidas", value: String(byStreak.matchesPlayed ?? 0) },
      ],
    });
  }

  const byX1Wins = [...eligible].sort((a, b) => (b.x1Wins ?? 0) - (a.x1Wins ?? 0))[0];
  if (byX1Wins && (byX1Wins.x1Wins ?? 0) > 0) {
    dailyPool.push({
      id: `x1_king_${editionKey}`,
      kind: "destaque",
      badge: "⚔️ DESTAQUE X1",
      headline: `${byX1Wins.nick} soma ${byX1Wins.x1Wins} vitórias na Arena X1!`,
      summary: `Um dos duelistas mais temidos da plataforma pela escola ${byX1Wins.school || "Comunidade"}.`,
      accentTone: "sky",
      featuredPlayer: toPlayerRef(byX1Wins),
      metrics: [
        { label: "Vitórias X1", value: String(byX1Wins.x1Wins ?? 0) },
        { label: "Nível", value: `Nv. ${byX1Wins.level ?? 1}` },
      ],
    });
  }

  if (input.pioneers) {
    const validPioneers: Array<{
      picked: MedalPioneer;
      holder: PlayerProfile;
      medalDef: MedalDefinition;
    }> = [];
    for (const p of Object.values(input.pioneers)) {
      if (!p || !p.studentNick) continue;
      const holder = eligible.find(
        (el) =>
          el.id === p.studentId ||
          el.nickNormalized === p.studentId ||
          nickSlug(el.nick) === nickSlug(p.studentNick),
      );
      const medalDef = medalById.get(p.medalId);
      if (holder && medalDef) {
        validPioneers.push({ picked: p, holder, medalDef });
      }
    }
    if (validPioneers.length > 0) {
      const { picked, holder, medalDef } = validPioneers[seed % validPioneers.length];
      dailyPool.push({
        id: `pioneer_${picked.medalId}_${editionKey}`,
        kind: "destaque",
        badge: "🥇 PIONEIRO DA REDE",
        headline: `${holder.nick} foi o 1º a conquistar "${medalDef.title}"!`,
        summary: `Marco pioneiro registrado na rede SEMED Coari (${stageForPlayer(holder.school, holder.birthdate, now, holder.ageStage, holder.grade).shortLabel}).`,
        accentTone: "emerald",
        featuredPlayer: toPlayerRef(holder),
        metrics: [
          { label: "Medalha", value: medalDef.title },
          { label: "Escola", value: holder.school || "Comunidade" },
        ],
      });
    }
  }

  // Escola Líder em XP
  const schoolXpMap = new Map<string, { xp: number; students: number }>();
  for (const p of eligible) {
    if (!p.school || p.school === "Nenhuma" || p.school === "Outro") continue;
    const prev = schoolXpMap.get(p.school) ?? { xp: 0, students: 0 };
    prev.xp += p.xp ?? 0;
    prev.students += 1;
    schoolXpMap.set(p.school, prev);
  }
  const topSchool = Array.from(schoolXpMap.entries()).sort((a, b) => b[1].xp - a[1].xp)[0];
  if (topSchool) {
    dailyPool.push({
      id: `top_school_${editionKey}`,
      kind: "escola",
      badge: "🏫 ESCOLA LÍDER",
      headline: `${topSchool[0]} lidera o ranking escolar!`,
      summary: `Com ${topSchool[1].students} aluno(s) ativos, a instituição já acumula ${topSchool[1].xp.toLocaleString("pt-BR")} XP na rede.`,
      accentTone: "emerald",
      metrics: [
        { label: "XP da Escola", value: topSchool[1].xp.toLocaleString("pt-BR") },
        { label: "Alunos", value: String(topSchool[1].students) },
      ],
    });
  }

  // Rotaciona a ordem do pool diário com base na edição das 20h
  if (dailyPool.length > 0) {
    const offset = seed % dailyPool.length;
    const rotated = [...dailyPool.slice(offset), ...dailyPool.slice(0, offset)];
    regularArticles.push(...rotated);
  }

  return [...breakingArticles, ...regularArticles];
}
