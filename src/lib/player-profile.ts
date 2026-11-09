// Player profile helpers: schools, age, XP, levels (1..10), mission gates, daily XP cap, titles and badges.

import { type GameId } from "./game-storage.ts";
import {
  getActiveEventBonuses,
  type SpecialEvent,
  type RecurringEvent,
} from "./custom-events.ts";

export const SCHOOLS = [
  { name: "Nenhuma", slug: "nenhuma", range: "", needsGrade: false },
  { name: "Raimundo Bezerra", slug: "raimundo_bezerra", range: "6º ao 9º", needsGrade: true },
  { name: "Agenor Smith", slug: "agenor_smith", range: "6º ao 9º", needsGrade: true },
  { name: "Elisângela Litaiff", slug: "elisangela_litaiff", range: "5º ano", needsGrade: false },
  { name: "Raimunda Cruz", slug: "raimunda_cruz", range: "5º ano", needsGrade: false },
  { name: "Maria de Nazaré", slug: "maria_de_nazare", range: "5º ano", needsGrade: false },
  { name: "Ursulina Souza", slug: "ursulina_souza", range: "5º ano", needsGrade: false },
  { name: "Outro", slug: "outro", range: "", needsGrade: false },
] as const;

export type SchoolName = (typeof SCHOOLS)[number]["name"];

export const GRADES = ["5º ano", "6º ano", "7º ano", "8º ano", "9º ano"] as const;
export const RAIMUNDO_GRADES = ["6º ano", "7º ano", "8º ano", "9º ano"] as const;
export const FUNDAMENTAL_II_GRADES = RAIMUNDO_GRADES;

export const OFFICIAL_SEMED_SCHOOLS = [
  "Raimundo Bezerra",
  "Agenor Smith",
  "Elisângela Litaiff",
  "Raimunda Cruz",
  "Maria de Nazaré",
  "Ursulina Souza",
] as const;

export type OfficialSemedSchoolName = (typeof OFFICIAL_SEMED_SCHOOLS)[number];

export const SECOND_STAGE_SCHOOLS = [
  "Raimundo Bezerra",
  "Agenor Smith",
] as const;

export function isSecondStageSchool(school?: string | null): boolean {
  if (!school) return false;
  const lower = school.trim().toLowerCase();
  return (
    SECOND_STAGE_SCHOOLS.some((s) => s.toLowerCase() === lower) ||
    lower.includes("bezerra") ||
    lower.includes("agenor")
  );
}

export const FIFTH_GRADE_SCHOOLS = [
  "Elisângela Litaiff",
  "Raimunda Cruz",
  "Maria de Nazaré",
  "Ursulina Souza",
] as const;

export function isOfficialSemedSchool(school?: string | null): boolean {
  if (!school) return false;
  return OFFICIAL_SEMED_SCHOOLS.some((s) => s.toLowerCase() === school.trim().toLowerCase());
}

export function is5thGradeSchool(school?: string | null): boolean {
  if (!school) return false;
  const lower = school.trim().toLowerCase();
  return FIFTH_GRADE_SCHOOLS.some((s) => s.toLowerCase() === lower);
}

/**
 * Checks whether a student belongs to Etapa 3 (Comunidade / Outro).
 * Conforme diretriz pedagógica:
 * - Nascidos até dezembro de 2010 (ano de nascimento >= 2010, ex: 2010, 2011, 2012...)
 *   podem participar da 2ª Etapa (Ensino Fundamental - 6º ao 9º ano) e têm acesso
 *   à Escola Municipal Raimundo Bezerra.
 * - Nascidos antes de 2010 (ano de nascimento < 2010, ex: 2009, 2008, 2007...)
 *   pertencem à 3ª Etapa (Comunidade / Outro) e não possuem vínculo com escolas do Ensino Fundamental.
 */
export function isEtapa3OrOlder(birthdate?: string | null, _now = new Date()): boolean {
  if (!birthdate) return false;
  const clean = birthdate.trim();
  const isoMatch = /^(\d{4})-(\d{2})-(\d{2})/.exec(clean);
  if (isoMatch) {
    const birthYear = parseInt(isoMatch[1], 10);
    return birthYear < 2010;
  }
  const brMatch = /^(\d{2})\/(\d{2})\/(\d{4})/.exec(clean);
  if (brMatch) {
    const birthYear = parseInt(brMatch[3], 10);
    return birthYear < 2010;
  }
  const b = new Date(`${clean}T00:00:00`);
  if (!Number.isNaN(b.getTime())) {
    return b.getFullYear() < 2010;
  }
  return false;
}

/**
 * Returns available school options based on age/stage:
 * - Nascidos antes de 2010 (3ª Etapa): nenhuma escola oficial deve ser exibida (apenas "Nenhuma" e "Outro").
 * - Nascidos até dezembro de 2010 com mais de 11 anos (> 11 anos, ex: 12 a 16 anos):
 *   escolas de 5º ano NÃO devem aparecer (apenas "Raimundo Bezerra", "Nenhuma" e "Outro").
 * - Até 11 anos (<= 11 anos, incluindo alunos nascidos em 2015 que completam 11 anos até dezembro de 2026):
 *   escolas de 5º ano aparecem normalmente junto com as demais.
 */
export function getAvailableSchoolsForAge(
  birthdate?: string | null,
  now = new Date(),
): typeof SCHOOLS {
  if (!birthdate) return SCHOOLS;

  // 1. Nascidos antes de 2010 pertencem à 3ª Etapa: nenhuma escola oficial deve ser exibida
  if (isEtapa3OrOlder(birthdate, now)) {
    return SCHOOLS.filter(
      (s) => s.name === "Nenhuma" || s.name === "Outro",
    ) as unknown as typeof SCHOOLS;
  }

  const age = ageFrom(birthdate, now);

  // 2. Ao ultrapassar 11 anos (> 11 anos, ex: 12 a 16 anos para nascidos até dez/2010): não deve aparecer escolas de 5º ano
  if (age > 11) {
    return SCHOOLS.filter(
      (s) => !is5thGradeSchool(s.name),
    ) as unknown as typeof SCHOOLS;
  }

  // 3. Até 11 anos (<= 11 anos, válido até dezembro de 2026 para alunos do 5º ano): escolas de 5º ano aparecem normalmente
  return SCHOOLS;
}

export function schoolNeedsGrade(school: string): boolean {
  return SCHOOLS.find((s) => s.name === school)?.needsGrade ?? false;
}

export function schoolSlug(school: string): string {
  const found = SCHOOLS.find((s) => s.name === school);
  if (found) return found.slug;
  return nickSlug(school) || "raimundo_bezerra";
}

export function isValidSchool(school: string): school is SchoolName {
  return SCHOOLS.some((s) => s.name === school);
}

/** Turns a nick into an internal slug (3-20 alphanumeric/underscore chars), preserving underscores. */
export function nickSlug(nick: string): string {
  return nick
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9_]/g, "");
}

/**
 * Converte um apelido (que pode conter underlines '_') em um Username 100% válido para a API PlayFab.
 * O Azure PlayFab proíbe expressamente caracteres especiais e underlines no campo Username (aceita estritamente [a-zA-Z0-9]{3,20}).
 * Essa codificação mapeia '_' para '0u', garantindo compatibilidade total com a nuvem sem perda do nick original.
 */
export function playfabUsernameFromNick(nick: string): string {
  const slug = nickSlug(nick);
  // Substitui '_' por '0u' (sequencia estritamente alfanumerica)
  let clean = slug.replace(/_+/g, "0u").replace(/[^a-z0-9]/g, "");
  if (clean.length < 3) {
    clean = (clean + "000").slice(0, 3);
  }
  return clean.slice(0, 20);
}

/**
 * Verifica se uma conta ou apelido deve ser excluído do cálculo do "Pioneiro da Medalha" (Primeiro a Conquistar).
 * As contas de teste da administração (ZHERET e LORD) são perfis de jogadores comuns usados pelos ADMs para testes,
 * devendo ser ignoradas para não tomar o pioneirismo dos alunos reais.
 */
export function isPioneerExcludedAccount(p?: {
  id?: string;
  nick?: string;
  nickNormalized?: string;
  full_name?: string;
  isAdmin?: boolean;
} | null): boolean {
  if (!p) return false;
  if (p.isAdmin) return true;
  if (p.id === "admin-system" || p.id?.startsWith("admin-")) return true;

  const rawNick = (p.nick ?? "").toLowerCase();
  const slugNick = (p.nickNormalized ?? nickSlug(p.nick ?? "")).toLowerCase();
  const rawName = (p.full_name ?? "").toLowerCase();

  // Exclui perfis de teste da administracao: ZHERET e LORD
  const testPatterns = ["zheret", "lord"];
  for (const pattern of testPatterns) {
    if (
      slugNick === pattern ||
      slugNick.startsWith(`${pattern}_`) ||
      slugNick.endsWith(`_${pattern}`) ||
      rawNick.includes(pattern) ||
      rawName.includes(pattern)
    ) {
      return true;
    }
  }

  // Exclui contas administrativas dedicadas
  if (slugNick === "josiney" || slugNick === "quemuel" || rawNick.includes("admin")) {
    return true;
  }

  return false;
}

/**
 * Identifica se um perfil pertence à administração (JOSINEY, QUEMUEL, isAdmin)
 * ou é um perfil de jogador comum utilizado pelo administrador para testes (ZHERET, LORD).
 * Esses perfis possuem passe livre total (sem trava de horário, nível ou arena fechada) no modo X1.
 */
export function isAdminOrTestAccount(
  p?: {
    id?: string;
    nick?: string;
    nickNormalized?: string;
    full_name?: string;
    isAdmin?: boolean;
  } | null,
  isAdminSession = false,
): boolean {
  if (isAdminSession) return true;
  return isPioneerExcludedAccount(p);
}

/** Formats a student's full name in UPPERCASE (pt-BR locale) as they type or save. */
export function formatFullNameUpper(fullName: string): string {
  return fullName.toLocaleUpperCase("pt-BR");
}

/** Normalizes a student's full name for case-insensitive and accent-insensitive matching. */
export function fullNameSlug(fullName: string): string {
  return fullName
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Generates the student's 6-digit password (`DDMMAA`) from their birthdate.
 * Example: `2014-01-20` (20/01/2014) -> `"200114"`.
 */
export function passwordFromBirthdate(birthdate: string): string {
  const clean = birthdate.trim();
  // Format YYYY-MM-DD
  const isoMatch = /^(\d{4})-(\d{2})-(\d{2})$/.exec(clean);
  if (isoMatch) {
    const [, yyyy, mm, dd] = isoMatch;
    return `${dd}${mm}${yyyy.slice(-2)}`;
  }
  // Format DD/MM/YYYY or DD/MM/YY
  const brMatch = /^(\d{2})\/(\d{2})\/(\d{2}|\d{4})$/.exec(clean);
  if (brMatch) {
    const [, dd, mm, y] = brMatch;
    return `${dd}${mm}${y.slice(-2)}`;
  }
  const digits = clean.replace(/\D/g, "");
  if (digits.length === 8) {
    // Assume DDMMYYYY
    return `${digits.slice(0, 4)}${digits.slice(6, 8)}`;
  }
  if (digits.length === 6) {
    return digits;
  }
  return clean;
}

/**
 * Normalizes any password typed by the student (e.g. `200114`, `20/01/2014`, `20012014`, `2014-01-20`)
 * into the canonical 6-digit `DDMMAA` password.
 */
export function normalizeBirthdatePasswordInput(rawPassword: string): string {
  const trimmed = rawPassword.trim();
  if (!trimmed) return "";
  const converted = passwordFromBirthdate(trimmed);
  return converted || trimmed;
}

/**
 * Builds a deterministic PlayFab CustomID (3..100 chars) from Full Name + Birthdate (`DDMMAA`)
 * so a student can log in or recover their account using only Full Name + Birthdate on any device.
 */
export function studentCustomId(fullName: string, birthdateOrPassword: string): string {
  const namePart = fullNameSlug(fullName).replace(/\s+/g, "_").slice(0, 65);
  const passPart = normalizeBirthdatePasswordInput(birthdateOrPassword);
  return `stu_${namePart}_${passPart}`.slice(0, 95);
}

export function ageFrom(birthdate: string, now = new Date()): number {
  if (!birthdate) return 10;
  // Robust match for YYYY-MM-DD without timezone shift
  const match = birthdate.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (match) {
    const birthYear = parseInt(match[1], 10);
    const birthMonth = parseInt(match[2], 10) - 1; // 0-based
    const birthDay = parseInt(match[3], 10);

    let age = now.getFullYear() - birthYear;
    const m = now.getMonth() - birthMonth;
    if (m < 0 || (m === 0 && now.getDate() < birthDay)) {
      age--;
    }
    return Math.max(0, age);
  }

  const b = new Date(`${birthdate}T00:00:00`);
  if (Number.isNaN(b.getTime())) return 10;
  let age = now.getFullYear() - b.getFullYear();
  const m = now.getMonth() - b.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < b.getDate())) age--;
  return Math.max(0, age);
}

export function formatBirthdateBR(birthdate?: string | null): string {
  if (!birthdate) return "";
  const match = birthdate.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (match) {
    return `${match[3]}/${match[2]}/${match[1]}`;
  }
  return birthdate;
}

/* ------------------------ Turmas Escolares (A - F) ------------------------ */

export const VALID_TURMAS = ["A", "B", "C", "D", "E", "F"] as const;
export type TurmaCode = (typeof VALID_TURMAS)[number];

export function isValidTurma(val: string): val is TurmaCode {
  return VALID_TURMAS.includes(val as TurmaCode);
}

export interface TurmaChangeRequest {
  id: string;
  playerId: string;
  playerNick: string;
  playerFullName: string;
  school: string;
  grade: string | null;
  currentTurma: string | null;
  requestedTurma: TurmaCode;
  requestedAt: string;
  status: "pendente" | "aprovada" | "recusada";
}

const TURMA_REQUESTS_KEY = "desafios-turma-requests-v1";

export function loadTurmaRequests(): TurmaChangeRequest[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(TURMA_REQUESTS_KEY);
    return raw ? (JSON.parse(raw) as TurmaChangeRequest[]) : [];
  } catch {
    return [];
  }
}

export function saveTurmaRequests(reqs: TurmaChangeRequest[]): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(TURMA_REQUESTS_KEY, JSON.stringify(reqs));
  } catch {
    // ignore
  }
}

export function createTurmaChangeRequest(args: {
  playerId: string;
  playerNick: string;
  playerFullName: string;
  school: string;
  grade: string | null;
  currentTurma: string | null;
  requestedTurma: TurmaCode;
}): TurmaChangeRequest {
  const reqs = loadTurmaRequests().filter(
    (r) => !(r.playerId === args.playerId && r.status === "pendente"),
  );
  const newReq: TurmaChangeRequest = {
    id: `req_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    ...args,
    requestedAt: new Date().toISOString(),
    status: "pendente",
  };
  reqs.unshift(newReq);
  saveTurmaRequests(reqs);
  return newReq;
}

export function resolveTurmaChangeRequest(
  requestId: string,
  decision: "aprovada" | "recusada",
): TurmaChangeRequest | null {
  const reqs = loadTurmaRequests();
  const found = reqs.find((r) => r.id === requestId);
  if (!found) return null;
  found.status = decision;
  saveTurmaRequests(reqs);
  return found;
}

/* --------------- Etapas por Faixa Etária (1ª, 2ª e 3ª Etapa) --------------- */

export type AgeStageId = "etapa_1" | "etapa_2" | "etapa_3";

export interface AgeStageInfo {
  id: AgeStageId;
  shortLabel: string;
  label: string;
  ageRangeLabel: string;
  schoolCycleLabel: string;
  emoji: string;
  minAge: number;
  maxAge: number | null;
}

export const AGE_STAGES: readonly AgeStageInfo[] = [
  {
    id: "etapa_1",
    shortLabel: "1ª Etapa",
    label: "1ª Etapa (Até 11 anos • 5º ano)",
    ageRangeLabel: "Até 11 anos",
    schoolCycleLabel: "5º ano (Raimunda Cruz, Ursulina, Nazaré, Litaiff)",
    emoji: "🌱",
    minAge: 0,
    maxAge: 11,
  },
  {
    id: "etapa_2",
    shortLabel: "2ª Etapa",
    label: "2ª Etapa (6º ao 9º ano • Raimundo Bezerra, Agenor Smith)",
    ageRangeLabel: "6º ao 9º ano (até 2010)",
    schoolCycleLabel: "6º ao 9º ano (Raimundo Bezerra, Agenor Smith)",
    emoji: "⚡",
    minAge: 11,
    maxAge: 16,
  },
  {
    id: "etapa_3",
    shortLabel: "3ª Etapa",
    label: "3ª Etapa (Comunidade / Outro)",
    ageRangeLabel: "Nascidos antes de 2010",
    schoolCycleLabel: "Comunidade / Outro",
    emoji: "🚀",
    minAge: 17,
    maxAge: null,
  },
] as const;

export function getAgeStageInfo(stageId: AgeStageId): AgeStageInfo {
  return AGE_STAGES.find((s) => s.id === stageId) ?? AGE_STAGES[0];
}

/**
 * Allocates a player into one of the 3 Age Stages based on their calculated age:
 * - 1ª Etapa (`etapa_1`): até 11 anos (alunos do 5º ano que completam até 11 anos até dezembro de 2026)
 * - 2ª Etapa (`etapa_2`): 12 a 16 anos (nascidos até dezembro de 2010 ou 11 anos no Raimundo Bezerra / Agenor Smith)
 * - 3ª Etapa (`etapa_3`): 17+ anos (nascidos antes de 2010 • Comunidade / Outro)
 */
export function stageFromAge(age: number): AgeStageInfo {
  const safeAge = Math.max(0, Math.floor(age));
  if (safeAge <= 11) return AGE_STAGES[0];
  if (safeAge <= 16) return AGE_STAGES[1];
  return AGE_STAGES[2];
}

/**
 * Calculates the player's stage considering their actual age, birthdate and school:
 * - Nascidos antes de 2010 -> 3ª Etapa (Jovens e Adultos / Comunidade / Outro)
 * - Idade > 11 anos e nascidos até dezembro de 2010 -> 2ª Etapa (6º ao 9º ano / Raimundo Bezerra, Agenor Smith)
 * - Idade <= 11 anos (incluindo alunos que completam 11 anos até dezembro de 2026):
 *   -> Se estiver em escola de 6º ao 9º ano (Raimundo Bezerra, Agenor Smith), aloca na 2ª Etapa;
 *   -> Caso contrário (escolas de 5º ano), aloca na 1ª Etapa (5º ano).
 * - Se data não informada: usa a escola como critério auxiliar
 */
export function stageFromBirthdate(
  birthdate?: string | null,
  now = new Date(),
  school?: string | null,
): AgeStageInfo {
  // Se não informou data de nascimento, usa escola informada como fallback
  if (!birthdate) {
    if (school) {
      if (is5thGradeSchool(school)) return AGE_STAGES[0];
      if (isSecondStageSchool(school)) return AGE_STAGES[1];
    }
    return AGE_STAGES[0];
  }

  // 0. Nascidos antes de 2010 (Etapa 3) são sempre da 3ª Etapa (Comunidade / Outro)
  if (isEtapa3OrOlder(birthdate, now)) {
    return AGE_STAGES[2];
  }

  const age = ageFrom(birthdate, now);

  // 1. Jogadores que ultrapassaram 11 anos e nasceram até dez/2010 pertencem à 2ª Etapa (6º ao 9º ano)
  if (age > 11) {
    return AGE_STAGES[1];
  }

  // 2. Alunos com até 11 anos (válido até dezembro de 2026):
  // Se matriculado em escola do 6º ao 9º ano (Raimundo Bezerra ou Agenor Smith), participa da 2ª Etapa;
  // caso contrário (5º ano), participa da 1ª Etapa.
  if (isSecondStageSchool(school)) {
    return AGE_STAGES[1];
  }

  return AGE_STAGES[0];
}

export function stageForPlayer(
  school?: string | null,
  birthdate?: string | null,
  now = new Date(),
): AgeStageInfo {
  return stageFromBirthdate(birthdate, now, school);
}

/* --------------------- Categorias de Série / Etapa para o Ranking --------------------- */

export type RankingFilterCategory =
  | AgeStageId
  | "5º ano"
  | "6º ano"
  | "7º ano"
  | "8º ano"
  | "9º ano"
  | "TODAS";

export interface RankingSeriesOption {
  id: AgeStageId;
  shortLabel: string;
  label: string;
  description: string;
  emoji: string;
}

export const RANKING_SERIES_OPTIONS: readonly RankingSeriesOption[] = [
  {
    id: "etapa_1",
    shortLabel: "1ª Etapa (5º ano)",
    label: "1ª Etapa (5º ano)",
    description: "Raimunda Cruz, Ursulina, Nazaré, Litaiff",
    emoji: "🌱",
  },
  {
    id: "etapa_2",
    shortLabel: "2ª Etapa (6º - 9º ano)",
    label: "2ª Etapa (6º - 9º ano)",
    description: "Raimundo Bezerra • 11 a 14 anos",
    emoji: "⚡",
  },
  {
    id: "etapa_3",
    shortLabel: "3ª Etapa (15+)",
    label: "3ª Etapa (15+)",
    description: "Comunidade / Outro",
    emoji: "🚀",
  },
] as const;

export function getRankingCategoryLabel(category: RankingFilterCategory): string {
  if (category === "TODAS") return "Geral (Todas as Etapas)";
  if (category === "etapa_1" || category === "5º ano") {
    return "1ª Etapa (5º ano)";
  }
  if (
    category === "etapa_2" ||
    category === "6º ano" ||
    category === "7º ano" ||
    category === "8º ano" ||
    category === "9º ano"
  ) {
    return "2ª Etapa (6º - 9º ano)";
  }
  if (category === "etapa_3") {
    return "3ª Etapa (15+)";
  }
  const found = RANKING_SERIES_OPTIONS.find((o) => o.id === category);
  return found ? found.label : category;
}

/**
 * Resolves the default Ranking filter for a logged-in player based on their stage:
 * - Student in 1ª Etapa (5º ano): sees "etapa_1" ("1ª Etapa (5º ano)")
 * - Student in 2ª Etapa (6º ano / 11-14 anos): sees "etapa_2" ("2ª Etapa (6º ano)")
 * - Student in 3ª Etapa (15+ years): sees "etapa_3" ("3ª Etapa (15+)")
 */
export function resolveDefaultRankingCategory(
  profile?: { birthdate?: string | null; school?: string | null; grade?: string | null } | null,
  now = new Date(),
): RankingFilterCategory {
  if (!profile) return "etapa_1";
  const st = stageFromBirthdate(profile.birthdate, now, profile.school);
  return st.id;
}

/**
 * Checks whether a student profile belongs to the selected Ranking series/stage filter.
 */
export function matchesRankingCategory(
  profile: { birthdate?: string | null; school?: string | null; grade?: string | null },
  category?: RankingFilterCategory | null,
  now = new Date(),
): boolean {
  if (!category || category === "TODAS") return true;
  const st = stageFromBirthdate(profile.birthdate, now, profile.school);
  if (category === "etapa_3") return st.id === "etapa_3";
  if (category === "etapa_1" || category === "5º ano") return st.id === "etapa_1";
  if (category === "etapa_2") return st.id === "etapa_2";
  if (
    category === "6º ano" ||
    category === "7º ano" ||
    category === "8º ano" ||
    category === "9º ano"
  ) {
    if (st.id !== "etapa_2") return false;
    const normalizedGrade = profile.grade?.trim().toLowerCase() ?? "";
    return normalizedGrade === category.toLowerCase();
  }
  return true;
}

/* --------------------- Cálculo Real de Subida / Descida no Ranking --------------------- */

export type RankTrendDirection = "up" | "down" | "same";

export interface RankHistoryState {
  lastRank: number;
  previousRank: number;
  trend: RankTrendDirection;
}

/**
 * Computes real rank movement arrows (up / down / same) by comparing each player's current rank
 * against their previously recorded rank on the same leaderboard.
 *
 * Rules:
 * - Se o aluno subiu de posição (ex: estava em 2º e foi para 1º, ou de 3º para 2º): `trend = "up"` (seta verde ▲).
 * - Se o aluno caiu de posição (ex: estava em 1º e foi para 2º, ou de 2º para 3º): `trend = "down"` (seta vermelha ▼).
 * - O 1º colocado (`rank === 1`) NUNCA pode ter seta vermelha (`"down"`), pois não há posição acima de 1º lugar.
 */
export function evaluateLeaderboardRankChanges<T extends { playerId: string; rank: number }>(
  entries: T[],
  prevHistory: Record<string, RankHistoryState> = {},
): {
  entriesWithTrend: (T & { rankTrend: RankTrendDirection; previousRank: number })[];
  nextHistory: Record<string, RankHistoryState>;
} {
  const nextHistory: Record<string, RankHistoryState> = { ...prevHistory };

  // 1. Identify players present in both the previous snapshot and the current leaderboard
  const commonEntries = entries.filter((e) => Boolean(prevHistory[e.playerId]));

  // Relative order in the previous snapshot (1..K) vs current snapshot (1..K)
  const prevSortedIds = [...commonEntries]
    .sort((a, b) => {
      const diff = prevHistory[a.playerId].lastRank - prevHistory[b.playerId].lastRank;
      return diff !== 0 ? diff : a.rank - b.rank;
    })
    .map((e) => e.playerId);

  const prevRelMap = new Map<string, number>();
  prevSortedIds.forEach((id, idx) => prevRelMap.set(id, idx + 1));

  const currRelMap = new Map<string, number>();
  commonEntries.forEach((e, idx) => currRelMap.set(e.playerId, idx + 1));

  // Detect if any known competitor actually overtook another known competitor
  const anyRelativeChange = commonEntries.some(
    (e) => currRelMap.get(e.playerId) !== prevRelMap.get(e.playerId),
  );

  const rawResults = entries.map((entry) => {
    const currentRank = entry.rank;
    const prev = prevHistory[entry.playerId];
    let trend: RankTrendDirection = "same";
    let previousRank = currentRank;

    if (!prev) {
      // Primeiro registro deste jogador neste ranking: 1º lugar destaca em verde (topo), demais neutro (—)
      trend = currentRank === 1 ? "up" : "same";
      previousRank = currentRank;
    } else if (anyRelativeChange) {
      // Houve ultrapassagem real entre os competidores
      const prevRel = prevRelMap.get(entry.playerId) ?? currentRank;
      const currRel = currRelMap.get(entry.playerId) ?? currentRank;
      if (currRel < prevRel) {
        trend = "up";
        previousRank = Math.max(currentRank + 1, prev.lastRank);
      } else if (currRel > prevRel) {
        trend = "down";
        previousRank = Math.min(currentRank - 1, prev.lastRank);
      } else {
        trend = currentRank === 1 ? "up" : "same";
        previousRank = currentRank;
      }
    } else {
      // Ninguém ultrapassou ninguém desde a última leitura: preserva último movimento válido
      trend = prev.trend;
      previousRank = prev.previousRank ?? currentRank;
    }

    // Regra de segurança absoluta: quem está em 1º lugar jamais pode estar com seta vermelha de queda
    if (currentRank === 1 && trend === "down") {
      trend = "up";
      previousRank = 1;
    }

    return {
      entry,
      currentRank,
      trend,
      previousRank,
    };
  });

  // 2. Invariante matemática: um jogador na posição R só pode ter seta vermelha ("down")
  // se existir pelo menos um jogador acima dele (rank < R) que realmente subiu de posição ("up" com previousRank > rank).
  // Isso impede que todos apareçam caindo ao mesmo tempo sem ninguém ter subido.
  const entriesWithTrend = rawResults.map((item) => {
    let { trend, previousRank } = item;
    const { entry, currentRank } = item;

    if (trend === "down") {
      const someoneAboveClimbed = rawResults.some(
        (other) =>
          other.currentRank < currentRank &&
          other.trend === "up" &&
          other.previousRank > other.currentRank,
      );
      if (!someoneAboveClimbed) {
        trend = currentRank === 1 ? "up" : "same";
        previousRank = currentRank;
      }
    }

    nextHistory[entry.playerId] = {
      lastRank: currentRank,
      previousRank,
      trend,
    };

    return {
      ...entry,
      rankTrend: trend,
      previousRank,
    };
  });

  return { entriesWithTrend, nextHistory };
}

/** Next birthday date and how many days are left. */
export function birthdayInfo(birthdate: string) {
  const b = new Date(`${birthdate || "2015-01-01"}T00:00:00`);
  const safeB = Number.isNaN(b.getTime()) ? new Date("2015-01-01T00:00:00") : b;
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  let next = new Date(today.getFullYear(), safeB.getMonth(), safeB.getDate());
  if (next < today) next = new Date(today.getFullYear() + 1, safeB.getMonth(), safeB.getDate());
  const days = Math.round((next.getTime() - today.getTime()) / 86_400_000);
  return {
    date: next,
    label: next.toLocaleDateString("pt-BR", { day: "2-digit", month: "long" }),
    daysLeft: days,
    isToday: days === 0,
  };
}

/* --------------- XP, Level 1..10 Gates & Daily XP Cap --------------- */

export const MAX_LEVEL = 10;
export const DEFAULT_DAILY_XP_CAP = 1000;
export const X1_MIN_LEVEL = 5;
export const TOURNAMENT_MIN_LEVEL = 3;
export const X1_DAILY_EXTRA_XP_CAP = 100;
export const TOURNAMENT_DAILY_EXTRA_XP_CAP = 100;
export const TOURNAMENT_DAILY_FREE_ENTRIES = 10;
export const TOURNAMENT_DAILY_PAID_ENTRIES_LIMIT = 50;
export const TOURNAMENT_DAILY_ENTRIES_LIMIT = 60; // 10 gratuitas + 50 pagas
export const TOURNAMENT_PAID_ENTRY_COST = 5;
export const TOURNAMENT_XP_PER_ENTRY = 10;

/** Fator de redução de XP quando uma partida é jogada em equipes/grupos (redução de 4X) */
export const TEAM_MODE_XP_DIVISOR = 4;

export function adjustXpForGameMode(matchXp: number, isTeam = false): number {
  if (!isTeam) return matchXp;
  return Math.max(1, Math.round(matchXp / TEAM_MODE_XP_DIVISOR));
}

export interface TournamentMedal {
  id: string;
  weekKey: string;
  gameId: string;
  rank: number; // 1..5
  tier: "gold" | "silver" | "bronze" | "elite";
  label: string;
  heldMinutes: number;
  bonusXpAwarded: number;
  earnedAt: string;
  count?: number; // Multiplicador acumulativo (ex: x2, x3 no mesmo selo)
  historyWeeks?: string[]; // Semanas em que esta medalha foi conquistada (ex: ["2026-W43", "2026-W44"])
}

export interface LevelRankTitle {
  minLevel: number;
  title: string;
  emoji: string;
}

export interface LevelRequirement {
  level: number;
  title: string;
  emoji: string;
  /** Cumulative XP required to unlock this level */
  minXp: number;
  /** Minimum finished matches required */
  minMatches: number;
  /** Minimum won matches required */
  minWins: number;
  /** Minimum distinct games explored on the platform */
  minDistinctGames: number;
}

/**
 * Progressive requirements from Level 1 to Level 10 (MAX_LEVEL).
 * With the default 1,000 XP/day cap:
 * - On Day 1 (max 1,000 XP), a player can reach at most Level 4 (795 XP), stopping short of Level 5 (1,444 XP).
 * - Reaching Level 10 (8,433 XP) requires at least 9 days (~1+ week) of daily XP plus 50 matches, 30 wins, and 9 distinct games.
 */
export const LEVEL_REQUIREMENTS: LevelRequirement[] = [
  { level: 1, title: "Iniciante da Lógica", emoji: "🌱", minXp: 0, minMatches: 0, minWins: 0, minDistinctGames: 0 },
  { level: 2, title: "Explorador Digital", emoji: "🔍", minXp: 100, minMatches: 2, minWins: 1, minDistinctGames: 1 },
  { level: 3, title: "Desbravador de Padrões", emoji: "🧩", minXp: 354, minMatches: 5, minWins: 2, minDistinctGames: 2 },
  { level: 4, title: "Calculista Ágil", emoji: "⚡", minXp: 795, minMatches: 8, minWins: 4, minDistinctGames: 3 },
  { level: 5, title: "Programador Júnior", emoji: "🤖", minXp: 1444, minMatches: 12, minWins: 6, minDistinctGames: 4 },
  { level: 6, title: "Estrategista Booleano", emoji: "🛡️", minXp: 2322, minMatches: 18, minWins: 9, minDistinctGames: 5 },
  { level: 7, title: "Mestre dos Algoritmos", emoji: "🧠", minXp: 3445, minMatches: 25, minWins: 13, minDistinctGames: 6 },
  { level: 8, title: "Arquiteto de Dados", emoji: "🚀", minXp: 4829, minMatches: 33, minWins: 18, minDistinctGames: 7 },
  { level: 9, title: "Guardião da Lógica", emoji: "👑", minXp: 6487, minMatches: 42, minWins: 24, minDistinctGames: 8 },
  { level: 10, title: "Lenda da Lógica", emoji: "🌟", minXp: 8433, minMatches: 50, minWins: 30, minDistinctGames: 9 },
];

export const LEVEL_TITLES: LevelRankTitle[] = LEVEL_REQUIREMENTS.map((r) => ({
  minLevel: r.level,
  title: r.title,
  emoji: r.emoji,
}));

export function getLevelRequirement(level: number): LevelRequirement {
  const clamped = Math.max(1, Math.min(MAX_LEVEL, Math.floor(level)));
  return LEVEL_REQUIREMENTS[clamped - 1];
}

export function levelTitle(level: number): LevelRankTitle {
  const req = getLevelRequirement(level);
  return { minLevel: req.level, title: req.title, emoji: req.emoji };
}

/** Cumulative XP needed to reach a given level (1..10). */
export function xpForLevel(level: number): number {
  if (level <= 1) return 0;
  if (level >= MAX_LEVEL) return LEVEL_REQUIREMENTS[MAX_LEVEL - 1].minXp;
  return LEVEL_REQUIREMENTS[Math.floor(level) - 1].minXp;
}

/** Cost in XP to advance from `level` to `level + 1`. */
export function xpForNextLevel(level: number): number {
  if (level >= MAX_LEVEL) return 0;
  return xpForLevel(level + 1) - xpForLevel(level);
}

/**
 * Pure XP-based level lookup (capped at MAX_LEVEL = 10).
 * Used when only XP is known; when full player stats are available, use `calculatePlayerLevel`.
 */
export function levelFromXp(xp: number): number {
  const safeXp = Math.max(0, Math.floor(xp));
  let lvl = 1;
  for (const req of LEVEL_REQUIREMENTS) {
    if (safeXp >= req.minXp) lvl = req.level;
  }
  return Math.min(MAX_LEVEL, lvl);
}

export interface LevelStageProgress {
  /** Nível em que os requisitos para o próximo nível estão sendo contabilizados (1..10) */
  forLevel: number;
  /** Partidas concluídas contabilizadas nesta etapa de nível (travadas no valor máximo do requisito) */
  matches: number;
  /** Vitórias conquistadas contabilizadas nesta etapa de nível (travadas no valor máximo do requisito) */
  wins: number;
  /** Jogos diferentes explorados contabilizados nesta etapa de nível (travados no valor máximo do requisito) */
  distinctGames: string[];
}

export interface PlayerProgressionInput {
  xp: number;
  matchesPlayed?: number;
  wins?: number;
  distinctGames?: number;
  /** Nível atual e progresso por etapa (onde cada requisito inicia em 0 ao subir de nível e trava no teto do requisito) */
  currentLevel?: number;
  stageProgress?: LevelStageProgress | null;
  maxAvailableGames?: number;
}

/**
 * Calculates the player's actual unlocked level (1..10) enforcing ALL level gates:
 * XP + Matches Played + Wins + Distinct Games Explored.
 * When `stageProgress` is provided, level advancement evaluates the current stage's capped progress
 * (so excess history from a previous level does not auto-complete future levels before reaching them).
 */
export function calculatePlayerLevel(input: PlayerProgressionInput): number {
  const safeXp = Math.max(0, Math.floor(input.xp));

  if (input.stageProgress && input.stageProgress.forLevel >= 1) {
    const xpCapLvl = levelFromXp(safeXp);
    const baseLevel = Math.max(
      1,
      Math.min(MAX_LEVEL, xpCapLvl, Math.floor(input.currentLevel ?? input.stageProgress.forLevel)),
    );
    if (baseLevel >= MAX_LEVEL) return MAX_LEVEL;

    const nextReq = getLevelRequirement(baseLevel + 1);
    const reqDistinct = input.maxAvailableGames
      ? Math.min(nextReq.minDistinctGames, Math.max(1, input.maxAvailableGames))
      : nextReq.minDistinctGames;
    const stageMatches =
      input.stageProgress.forLevel === baseLevel
        ? Math.max(
            Math.max(0, Math.floor(input.stageProgress.matches ?? 0)),
            Math.max(0, Math.floor(input.matchesPlayed ?? 0)),
          )
        : Math.max(0, Math.floor(input.matchesPlayed ?? 0));
    const stageWins =
      input.stageProgress.forLevel === baseLevel
        ? Math.max(
            Math.max(0, Math.floor(input.stageProgress.wins ?? 0)),
            Math.max(0, Math.floor(input.wins ?? 0)),
          )
        : Math.max(0, Math.floor(input.wins ?? 0));
    const stageDistinct =
      input.stageProgress.forLevel === baseLevel && Array.isArray(input.stageProgress.distinctGames)
        ? Math.max(input.stageProgress.distinctGames.length, Math.max(0, Math.floor(input.distinctGames ?? 0)))
        : Math.max(0, Math.floor(input.distinctGames ?? 0));

    const meetsNext =
      safeXp >= nextReq.minXp &&
      stageMatches >= nextReq.minMatches &&
      stageWins >= nextReq.minWins &&
      stageDistinct >= reqDistinct;

    return meetsNext ? Math.min(MAX_LEVEL, baseLevel + 1) : baseLevel;
  }

  const matches = Math.max(0, Math.floor(input.matchesPlayed ?? 0));
  const wins = Math.max(0, Math.floor(input.wins ?? 0));
  const distinct = Math.max(0, Math.floor(input.distinctGames ?? 0));

  let unlockedLevel = 1;
  for (const req of LEVEL_REQUIREMENTS) {
    if (req.level === 1) continue;
    const reqDistinct = input.maxAvailableGames
      ? Math.min(req.minDistinctGames, Math.max(1, input.maxAvailableGames))
      : req.minDistinctGames;
    const meetsAll =
      safeXp >= req.minXp &&
      matches >= req.minMatches &&
      wins >= req.minWins &&
      distinct >= reqDistinct;
    if (meetsAll) {
      unlockedLevel = req.level;
    } else {
      break;
    }
  }
  return Math.min(MAX_LEVEL, unlockedLevel);
}

/**
 * Inicializa ou sincroniza o progresso de requisitos do nível atual (`LevelStageProgress`).
 * - Garante que nenhum contador de requisito ultrapasse o teto (`required`) do próximo nível.
 * - Qualquer excedente feito antes de subir de nível permanece apenas no histórico geral.
 * - Ao cumprir todos os requisitos do nível atual e subir de nível, o progresso para o novo nível inicia em 0.
 */
export function syncLevelStageProgress(args: {
  xp: number;
  lifetimeMatches: number;
  lifetimeWins: number;
  lifetimeDistinctGames: number;
  playedGameIds?: string[];
  currentLevel?: number;
  existingStage?: LevelStageProgress | null;
  maxAvailableGames?: number;
}): { level: number; stageProgress: LevelStageProgress } {
  const safeXp = Math.max(0, Math.floor(args.xp));
  const xpCapLvl = levelFromXp(safeXp);
  const lifetimeLevel = calculatePlayerLevel({
    xp: safeXp,
    matchesPlayed: args.lifetimeMatches,
    wins: args.lifetimeWins,
    distinctGames: args.lifetimeDistinctGames,
    maxAvailableGames: args.maxAvailableGames,
  });

  if (args.existingStage && args.existingStage.forLevel >= 1) {
    // Se o jogador estava com nível 1 defasado mas já tinha histórico de nível maior antes da migração,
    // respeita o maior entre o nível salvo e o forLevel (limitado pelo teto de XP).
    const baseLevel = Math.max(
      1,
      Math.min(
        MAX_LEVEL,
        xpCapLvl,
        Math.max(Math.floor(args.currentLevel ?? 1), Math.floor(args.existingStage.forLevel)),
      ),
    );

    if (baseLevel >= MAX_LEVEL) {
      return {
        level: MAX_LEVEL,
        stageProgress: { forLevel: MAX_LEVEL, matches: 0, wins: 0, distinctGames: [] },
      };
    }

    const nextReq = getLevelRequirement(baseLevel + 1);
    const reqDistinct = args.maxAvailableGames
      ? Math.min(nextReq.minDistinctGames, Math.max(1, args.maxAvailableGames))
      : nextReq.minDistinctGames;

    const isSameStage = args.existingStage.forLevel === baseLevel;
    const stageMatches = isSameStage ? Math.max(0, Math.floor(args.existingStage.matches ?? 0)) : 0;
    const stageWins = isSameStage ? Math.max(0, Math.floor(args.existingStage.wins ?? 0)) : 0;
    const rawMatches = Math.max(stageMatches, Math.max(0, Math.floor(args.lifetimeMatches ?? 0)));
    const rawWins = Math.max(stageWins, Math.max(0, Math.floor(args.lifetimeWins ?? 0)));

    const existingDistinct =
      isSameStage && Array.isArray(args.existingStage.distinctGames)
        ? Array.from(new Set(args.existingStage.distinctGames))
        : [];
    const sourceIds = Array.isArray(args.playedGameIds) ? args.playedGameIds : [];
    const allDistinct = Array.from(new Set([...existingDistinct, ...sourceIds]));
    while (allDistinct.length < Math.min(reqDistinct, Math.max(0, Math.floor(args.lifetimeDistinctGames ?? 0)))) {
      allDistinct.push(`game_${allDistinct.length + 1}`);
    }

    const cappedMatches = Math.min(nextReq.minMatches, rawMatches);
    const cappedWins = Math.min(nextReq.minWins, rawWins);
    const cappedDistinct = allDistinct.slice(0, reqDistinct);

    const meetsAll =
      safeXp >= nextReq.minXp &&
      cappedMatches >= nextReq.minMatches &&
      cappedWins >= nextReq.minWins &&
      cappedDistinct.length >= reqDistinct;

    if (meetsAll) {
      const nextLvl = Math.min(MAX_LEVEL, baseLevel + 1);
      return {
        level: nextLvl,
        stageProgress: {
          forLevel: nextLvl,
          matches: 0,
          wins: 0,
          distinctGames: [],
        },
      };
    }

    return {
      level: baseLevel,
      stageProgress: {
        forLevel: baseLevel,
        matches: cappedMatches,
        wins: cappedWins,
        distinctGames: cappedDistinct,
      },
    };
  }

  // Primeira inicialização para perfis existentes (sem existingStage salvo):
  const initialLevel = Math.max(
    1,
    Math.min(MAX_LEVEL, xpCapLvl, Math.max(Math.floor(args.currentLevel ?? 1), lifetimeLevel)),
  );
  if (initialLevel >= MAX_LEVEL) {
    return {
      level: MAX_LEVEL,
      stageProgress: { forLevel: MAX_LEVEL, matches: 0, wins: 0, distinctGames: [] },
    };
  }

  const nextReq = getLevelRequirement(initialLevel + 1);
  const reqDistinct = args.maxAvailableGames
    ? Math.min(nextReq.minDistinctGames, Math.max(1, args.maxAvailableGames))
    : nextReq.minDistinctGames;

  const cappedMatches = Math.min(nextReq.minMatches, Math.max(0, Math.floor(args.lifetimeMatches)));
  const cappedWins = Math.min(nextReq.minWins, Math.max(0, Math.floor(args.lifetimeWins)));
  const distinctCount = Math.min(
    reqDistinct,
    Math.max(0, Math.floor(args.lifetimeDistinctGames)),
  );
  const sourceIds = Array.isArray(args.playedGameIds)
    ? Array.from(new Set(args.playedGameIds))
    : [];
  while (sourceIds.length < distinctCount) {
    sourceIds.push(`game_${sourceIds.length + 1}`);
  }
  const cappedDistinct = sourceIds.slice(0, distinctCount);

  return {
    level: initialLevel,
    stageProgress: {
      forLevel: initialLevel,
      matches: cappedMatches,
      wins: cappedWins,
      distinctGames: cappedDistinct,
    },
  };
}

/**
 * Registra uma partida concluída na etapa de requisitos do nível atual:
 * - Cada atributo (`matches`, `wins`, `distinctGames`) soma até o limite máximo do requisito atual (`Math.min(..., required)`).
 * - Se um atributo já atingiu o teto (ex: 4/4 vitórias) e o jogador fizer mais 10 vitórias antes de subir de nível,
 *   o requisito permanece em 4/4 (não acumula excedente para o próximo nível), enquanto o histórico geral salva normalmente.
 * - Quando todos os requisitos do nível atual são cumpridos, o jogador sobe 1 nível e os contadores de missão
 *   do novo nível começam em 0 (`0 / Nova Meta`).
 */
export function advanceLevelStageOnMatch(args: {
  currentLevel: number;
  stageProgress?: LevelStageProgress | null;
  newXp: number;
  lifetimeMatches?: number;
  lifetimeWins?: number;
  gameId: string;
  won: boolean;
  isGameEnabled?: boolean;
  maxAvailableGames?: number;
}): { level: number; stageProgress: LevelStageProgress; leveledUp: boolean } {
  const safeXp = Math.max(0, Math.floor(args.newXp));
  const lvl = Math.max(1, Math.min(MAX_LEVEL, Math.floor(args.currentLevel || 1)));

  if (lvl >= MAX_LEVEL) {
    return {
      level: MAX_LEVEL,
      stageProgress: { forLevel: MAX_LEVEL, matches: 0, wins: 0, distinctGames: [] },
      leveledUp: false,
    };
  }

  const nextReq = getLevelRequirement(lvl + 1);
  const reqDistinct = args.maxAvailableGames
    ? Math.min(nextReq.minDistinctGames, Math.max(1, args.maxAvailableGames))
    : nextReq.minDistinctGames;

  const baseStage: LevelStageProgress =
    args.stageProgress && args.stageProgress.forLevel === lvl
      ? args.stageProgress
      : { forLevel: lvl, matches: 0, wins: 0, distinctGames: [] };

  const currentMatches = Math.max(
    Math.max(0, Math.floor(baseStage.matches)),
    typeof args.lifetimeMatches === "number" ? Math.max(0, Math.floor(args.lifetimeMatches)) : 0,
  );
  const currentWins = Math.max(
    Math.max(0, Math.floor(baseStage.wins)),
    typeof args.lifetimeWins === "number" ? Math.max(0, Math.floor(args.lifetimeWins)) : 0,
  );

  const nextMatches = Math.min(nextReq.minMatches, currentMatches + 1);
  const nextWins = Math.min(
    nextReq.minWins,
    currentWins + (args.won ? 1 : 0),
  );
  const distinctList = Array.isArray(baseStage.distinctGames)
    ? Array.from(new Set(baseStage.distinctGames))
    : [];
  if (
    args.isGameEnabled !== false &&
    args.gameId &&
    !distinctList.includes(args.gameId) &&
    distinctList.length < reqDistinct
  ) {
    distinctList.push(args.gameId);
  }
  const cappedDistinct = distinctList.slice(0, reqDistinct);

  const meetsAll =
    safeXp >= nextReq.minXp &&
    nextMatches >= nextReq.minMatches &&
    nextWins >= nextReq.minWins &&
    cappedDistinct.length >= reqDistinct;

  if (meetsAll) {
    const newLevel = Math.min(MAX_LEVEL, lvl + 1);
    return {
      level: newLevel,
      stageProgress: {
        forLevel: newLevel,
        matches: 0,
        wins: 0,
        distinctGames: [],
      },
      leveledUp: true,
    };
  }

  return {
    level: lvl,
    stageProgress: {
      forLevel: lvl,
      matches: nextMatches,
      wins: nextWins,
      distinctGames: cappedDistinct,
    },
    leveledUp: false,
  };
}

export interface LevelMissionCheckItem {
  key: "xp" | "matches" | "wins" | "distinctGames";
  label: string;
  current: number;
  required: number;
  met: boolean;
}

/**
 * Full progression status for UI display (PlayerMenu, Profile Dialog, etc.).
 * Accepts either a raw `xp` number (backwards compatible) or a `PlayerProgressionInput` object.
 * All requirement `current` values in `checklist` are strictly capped at `required` so they never exceed the target.
 */
export function levelProgress(input: number | PlayerProgressionInput) {
  const stats: PlayerProgressionInput =
    typeof input === "number"
      ? {
          xp: input,
          matchesPlayed: 999,
          wins: 999,
          distinctGames: 99,
        }
      : input;

  const safeXp = Math.max(0, Math.floor(stats.xp));
  const matches = Math.max(0, Math.floor(stats.matchesPlayed ?? 0));
  const wins = Math.max(0, Math.floor(stats.wins ?? 0));
  const distinct = Math.max(0, Math.floor(stats.distinctGames ?? 0));

  const level = calculatePlayerLevel({
    xp: safeXp,
    matchesPlayed: matches,
    wins,
    distinctGames: distinct,
    currentLevel: stats.currentLevel,
    stageProgress: stats.stageProgress,
    maxAvailableGames: stats.maxAvailableGames,
  });
  const xpOnlyLevel = levelFromXp(safeXp);
  const isMaxLevel = level >= MAX_LEVEL;
  const currentReq = getLevelRequirement(level);
  const nextReq = isMaxLevel ? null : getLevelRequirement(level + 1);

  const start = currentReq.minXp;
  const end = nextReq ? nextReq.minXp : currentReq.minXp;
  const needed = Math.max(1, end - start);
  const currentInBracket = Math.min(needed, Math.max(0, safeXp - start));
  const percent = isMaxLevel
    ? 100
    : Math.min(100, Math.round((currentInBracket / needed) * 100));

  const reqDistinct = nextReq
    ? stats.maxAvailableGames
      ? Math.min(nextReq.minDistinctGames, Math.max(1, stats.maxAvailableGames))
      : nextReq.minDistinctGames
    : 0;

  const hasStage = Boolean(stats.stageProgress && stats.stageProgress.forLevel >= 1);
  const isStageForCurrentLevel = hasStage && stats.stageProgress!.forLevel === level;

  const rawMatchesForReq = hasStage
    ? isStageForCurrentLevel
      ? Math.max(0, Math.floor(stats.stageProgress!.matches ?? 0))
      : 0
    : matches;
  const rawWinsForReq = hasStage
    ? isStageForCurrentLevel
      ? Math.max(0, Math.floor(stats.stageProgress!.wins ?? 0))
      : 0
    : wins;
  const rawDistinctForReq = hasStage
    ? isStageForCurrentLevel && Array.isArray(stats.stageProgress!.distinctGames)
      ? stats.stageProgress!.distinctGames.length
      : 0
    : distinct;

  const cappedXpForReq = nextReq ? Math.min(safeXp, nextReq.minXp) : safeXp;
  const cappedMatchesForReq = nextReq ? Math.min(rawMatchesForReq, nextReq.minMatches) : 0;
  const cappedWinsForReq = nextReq ? Math.min(rawWinsForReq, nextReq.minWins) : 0;
  const cappedDistinctForReq = nextReq ? Math.min(rawDistinctForReq, reqDistinct) : 0;

  const checklist: LevelMissionCheckItem[] = nextReq
    ? [
        {
          key: "xp",
          label: "XP acumulado",
          current: cappedXpForReq,
          required: nextReq.minXp,
          met: safeXp >= nextReq.minXp,
        },
        {
          key: "matches",
          label: "Partidas concluídas",
          current: cappedMatchesForReq,
          required: nextReq.minMatches,
          met: cappedMatchesForReq >= nextReq.minMatches,
        },
        {
          key: "wins",
          label: "Vitórias conquistadas",
          current: cappedWinsForReq,
          required: nextReq.minWins,
          met: cappedWinsForReq >= nextReq.minWins,
        },
        {
          key: "distinctGames",
          label: "Jogos diferentes explorados",
          current: cappedDistinctForReq,
          required: reqDistinct,
          met: cappedDistinctForReq >= reqDistinct,
        },
      ]
    : [];

  const isLockedByMissions =
    !isMaxLevel && nextReq !== null && safeXp >= nextReq.minXp && level < xpOnlyLevel;

  return {
    level,
    xpOnlyLevel,
    isMaxLevel,
    isLockedByMissions,
    title: currentReq.title,
    emoji: currentReq.emoji,
    current: isMaxLevel ? safeXp : currentInBracket,
    needed: isMaxLevel ? 0 : needed,
    nextLevelXp: end,
    percent,
    nextRequirement: nextReq ? { ...nextReq, minDistinctGames: reqDistinct } : null,
    checklist,
  };
}

/* ------------------------- Daily XP Cap Helpers ------------------------- */

/** Returns local date string in `YYYY-MM-DD` format for tracking the daily XP limit. */
export function getLocalDateKey(now = new Date()): string {
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/** Returns the previous day's date string in `YYYY-MM-DD` format. */
export function getPreviousDateKey(dateKey: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateKey);
  if (!match) return "";
  const d = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  d.setDate(d.getDate() - 1);
  return getLocalDateKey(d);
}

export interface DailyXpCapResult {
  /** XP actually granted after applying the daily cap */
  grantedXp: number;
  /** Updated daily XP accumulated on `dateKey` */
  newDailyXp: number;
  /** Remaining XP the player can still earn today */
  remainingToday: number;
  /** True if raw XP was reduced or zeroed because of the daily cap */
  wasCapped: boolean;
  /** Active date key (`YYYY-MM-DD`) */
  dateKey: string;
}

/**
 * Enforces the daily XP limit (default 1,000 XP/day).
 * Resets automatically when `lastDateKey !== todayKey`.
 */
export function applyDailyXpCap(args: {
  rawEarnedXp: number;
  currentDailyXp?: number;
  lastDateKey?: string;
  todayKey?: string;
  dailyCap?: number;
}): DailyXpCapResult {
  const todayKey = args.todayKey ?? getLocalDateKey();
  const cap = Math.max(100, Math.floor(args.dailyCap ?? DEFAULT_DAILY_XP_CAP));
  const raw = Math.max(0, Math.floor(args.rawEarnedXp));
  const usedToday =
    args.lastDateKey === todayKey ? Math.max(0, Math.floor(args.currentDailyXp ?? 0)) : 0;

  const remainingBefore = Math.max(0, cap - usedToday);
  const grantedXp = Math.min(raw, remainingBefore);
  const newDailyXp = usedToday + grantedXp;
  const remainingToday = Math.max(0, cap - newDailyXp);

  return {
    grantedXp,
    newDailyXp,
    remainingToday,
    wasCapped: grantedXp < raw,
    dateKey: todayKey,
  };
}

/**
 * Checks whether the Arena X1 is currently within its operating hours (default 07:00 to 19:00 local time).
 */
export function isX1WindowOpen(
  now = new Date(),
  openHour = 7,
  closeHour = 19,
  forceOpen = false,
): boolean {
  if (forceOpen) return true;
  const h = now.getHours();
  if (openHour <= closeHour) {
    return h >= openHour && h < closeHour;
  }
  return h >= openHour || h < closeHour;
}

/** Determines whether a match counts as a "Victory" (Jogo Ganho). */
export function isMatchVictory(score: number, correct: number, wrong = 0): boolean {
  if (correct <= 0 && score <= 0) return false;
  const total = correct + wrong;
  const accuracy = total > 0 ? correct / total : 1;
  return (correct >= 3 && accuracy >= 0.6 && score > 0) || score >= 40;
}

/** Calculates raw XP earned from a finished match (before applying the daily XP cap).
 *  Rewards participation, score, accuracy, game level reached, and victory bonus! */
export function xpFromMatch(
  score: number,
  correct: number,
  wrong = 0,
  gameLevel = 1,
): number {
  const safeScore = Math.max(0, score);
  const safeCorrect = Math.max(0, correct);
  if (safeScore === 0 && safeCorrect === 0) return 0;

  const total = safeCorrect + Math.max(0, wrong);
  const accuracy = total > 0 ? safeCorrect / total : 1;

  const participationXp = 15;
  const scoreXp = Math.floor(safeScore * 0.8);
  const accuracyXp = Math.round(accuracy * 35);
  const levelBonusXp = Math.max(1, gameLevel) * 12;
  const won = isMatchVictory(safeScore, safeCorrect, wrong);
  const flawless = won && wrong === 0 && safeCorrect >= 4;
  const victoryBonusXp = flawless ? 50 : won ? 30 : 0;

  return participationXp + scoreXp + accuracyXp + levelBonusXp + victoryBonusXp;
}

export interface Badge {
  id: string;
  label: string;
  earnedAt: string;
}

export function computeBadges(args: {
  existing: Badge[];
  xp: number;
  wins: number;
  matchesPlayed?: number;
  distinctGamesPlayed: number;
  lastMatchScore: number;
}): Badge[] {
  const map = new Map<string, Badge>(args.existing.map((b) => [b.id, b]));
  const now = new Date().toISOString();
  const level = calculatePlayerLevel({
    xp: args.xp,
    matchesPlayed: args.matchesPlayed ?? args.wins,
    wins: args.wins,
    distinctGames: args.distinctGamesPlayed,
  });

  const grant = (id: string, label: string) => {
    if (!map.has(id)) map.set(id, { id, label, earnedAt: now });
  };

  if ((args.matchesPlayed ?? 0) >= 1 || args.distinctGamesPlayed >= 1) {
    grant("primeira_missao", "🎯 Primeira Missão");
  }
  if (args.wins >= 1) grant("primeira_vitoria", "🏆 Primeira Vitória");
  if (args.wins >= 5) grant("cinco_vitorias", "🔥 Vencedor em Série (5 vitórias)");
  if (args.wins >= 15) grant("quinze_vitorias", "⚔️ Campeão Imbatível (15 vitórias)");
  if (args.lastMatchScore >= 100) grant("centuriao", "💯 Centurião (100+ pts)");
  if (args.distinctGamesPlayed >= 5) grant("explorador", "🧠 Explorador Completo (5 jogos)");
  if (args.distinctGamesPlayed >= 9) grant("mestre_jogos", "🎮 Dominador da Plataforma (9+ jogos)");
  if (args.xp >= 1000) grant("xp_1000", "💎 1.000 XP Acumulados");
  if (args.xp >= 5000) grant("xp_5000", "🏅 5.000 XP Acumulados");
  if (level >= 5) grant("nivel_5", "🤖 Programador Júnior (Nível 5)");
  if (level >= 10) grant("nivel_10", "🌟 Lenda da Lógica (Nível 10)");

  return Array.from(map.values());
}

export interface MatchXpBreakdown {
  finalXp: number;
  baseXp: number;
  multiplier: number;
  isTeam: boolean;
  atDailyCap: boolean;
  formulaText?: string;
  displayLabel: string;
}

/**
 * Calcula o XP obtido em uma partida e a fórmula explicativa entre parênteses
 * quando há bônus de evento (ex: 2x) ou redução de modo (equipes).
 */
export function computeMatchDisplayXp(args: {
  score: number;
  correct: number;
  wrong?: number;
  level?: number;
  gameId?: GameId;
  mode?: string;
  isTeam?: boolean;
  won?: boolean;
  currentDailyXp?: number;
  dailyXpCap?: number;
  dailyXpDate?: string;
  now?: Date;
  activeEvents?: SpecialEvent[];
  recurringEvents?: RecurringEvent[];
}): MatchXpBreakdown {
  const safeScore = Math.max(0, args.score);
  const safeCorrect = Math.max(0, args.correct);
  const safeWrong = Math.max(0, args.wrong ?? 0);
  const safeLevel = Math.max(1, args.level ?? 1);
  const mode = args.mode ?? "padrao";
  const isTeam = Boolean(args.isTeam || mode === "equipes");
  const won = typeof args.won === "boolean" ? args.won : isMatchVictory(safeScore, safeCorrect, safeWrong);
  const now = args.now ?? new Date();

  // Caso especial: Arena X1 Online
  if (mode === "x1_online") {
    const rawXp = won ? 25 : 10;
    const atCap = (args.currentDailyXp ?? 0) >= (args.dailyXpCap ?? 100);
    if (atCap) {
      return {
        finalXp: 0,
        baseXp: rawXp,
        multiplier: 1,
        isTeam: false,
        atDailyCap: true,
        formulaText: "(Limite diário)",
        displayLabel: "0 XP (Limite diário)",
      };
    }
    return {
      finalXp: rawXp,
      baseXp: rawXp,
      multiplier: 1,
      isTeam: false,
      atDailyCap: false,
      displayLabel: `${rawXp} XP`,
    };
  }

  // Caso especial: Torneio Semanal Ranqueado
  if (mode === "torneio_semanal") {
    const rawXp = 10;
    const atCap = (args.currentDailyXp ?? 0) >= (args.dailyXpCap ?? 100);
    if (atCap) {
      return {
        finalXp: 0,
        baseXp: rawXp,
        multiplier: 1,
        isTeam: false,
        atDailyCap: true,
        formulaText: "(Limite diário)",
        displayLabel: "0 XP (Limite diário)",
      };
    }
    return {
      finalXp: rawXp,
      baseXp: rawXp,
      multiplier: 1,
      isTeam: false,
      atDailyCap: false,
      displayLabel: `${rawXp} XP`,
    };
  }

  // Partida padrão dos jogos
  const rawEarnedXp = xpFromMatch(safeScore, safeCorrect, safeWrong, safeLevel);
  // Base padrão limitada em 20 XP por partida
  const baseXp = Math.min(rawEarnedXp, 20);

  // Multiplicadores e bônus de eventos ativos
  const bonuses = getActiveEventBonuses(
    args.gameId ?? ("todos" as GameId),
    args.dailyXpCap ?? 1000,
    20,
    args.activeEvents,
    now,
    args.recurringEvents,
  );

  const multiplier = bonuses.multiplier;
  let calculatedXp = Math.round(baseXp * multiplier);

  // Redução 4x em equipes
  if (isTeam) {
    calculatedXp = adjustXpForGameMode(calculatedXp, true);
  }

  // Checa limite diário
  const todayKey = getLocalDateKey(now);
  const isToday = args.dailyXpDate === todayKey;
  const currentDaily = isToday ? (args.currentDailyXp ?? 0) : 0;
  const dailyCap = bonuses.dailyXpCap;
  const remainingDaily = Math.max(0, dailyCap - currentDaily);

  if (isToday && currentDaily >= dailyCap) {
    return {
      finalXp: 0,
      baseXp,
      multiplier,
      isTeam,
      atDailyCap: true,
      formulaText: "(Limite diário)",
      displayLabel: "0 XP (Limite diário)",
    };
  }

  const finalXp = remainingDaily > 0 ? Math.min(calculatedXp, remainingDaily) : calculatedXp;

  // Monta a fórmula da operação se houver bônus ou redução
  let formulaText: string | undefined;
  if (multiplier > 1 && isTeam) {
    formulaText = `(${baseXp} x ${multiplier} ÷ 4)`;
  } else if (multiplier > 1) {
    formulaText = `(${baseXp} x ${multiplier})`;
  } else if (isTeam) {
    formulaText = `(${baseXp} ÷ 4)`;
  }

  const displayLabel = formulaText ? `${finalXp} XP ${formulaText}` : `${finalXp} XP`;

  return {
    finalXp,
    baseXp,
    multiplier,
    isTeam,
    atDailyCap: false,
    formulaText,
    displayLabel,
  };
}
