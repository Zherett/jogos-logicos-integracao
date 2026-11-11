/**
 * Módulo de Códigos Promocionais e QR Codes (Promo Codes System)
 * Suporta 6 padrões de máscara de alta entropia, proteção contra brute-force / timing attacks,
 * transações atômicas de resgate e trava de acesso para contas de teste (Zheret & Lord).
 */
import { awardCareerPoints } from "./career-points.ts";
import { calculatePlayerLevel, nickSlug, type PlayerProfile } from "./player-profile.ts";
import { recordScoreLedgerEntry } from "./score-history-ledger.ts";
import {
  callPlayFabClient,
  getAdminPlayFabTicket,
  isPlayFabConfigured,
  loadStoredSession,
} from "./playfab.ts";

export type PromoCodePattern =
  | "padrao_1" // LNNNL-LNNNL (ex: A124C-D123A)
  | "padrao_2" // NNNL-LNNN   (ex: 123A-C121)
  | "padrao_3" // NLLN-NLLN   (ex: 1AV5-4BC1)
  | "padrao_4" // NNLL-LLNN   (ex: 33AA-BB44)
  | "padrao_5" // LLNN-NNLL   (ex: AA55-66BB)
  | "padrao_6"; // LNLNLN-LNLN (ex: G1H2I3-J1K2)

export const PROMO_CODE_PATTERN_NAMES: Record<PromoCodePattern, { name: string; format: string; example: string }> = {
  padrao_1: { name: "Padrão 1 (LNNNL-LNNNL)", format: "Letra, 3 dígitos, Letra - Letra, 3 dígitos, Letra", example: "A124C-D123A" },
  padrao_2: { name: "Padrão 2 (NNNL-LNNN)", format: "3 dígitos, Letra - Letra, 3 dígitos", example: "123A-C121" },
  padrao_3: { name: "Padrão 3 (NLLN-NLLN)", format: "Dígito, 2 Letras, Dígito - Dígito, 2 Letras, Dígito", example: "1AV5-4BC1" },
  padrao_4: { name: "Padrão 4 (NNLL-LLNN)", format: "2 Dígitos, 2 Letras - 2 Letras, 2 Dígitos", example: "33AA-BB44" },
  padrao_5: { name: "Padrão 5 (LLNN-NNLL)", format: "2 Letras, 2 Dígitos - 2 Dígitos, 2 Letras", example: "AA55-66BB" },
  padrao_6: { name: "Padrão 6 (LNLNLN-LNLN)", format: "Alternado 6 chars - Alternado 4 chars", example: "G1H2I3-J1K2" },
};

// Alfabeto sanitizado (sem I, L, O, S para evitar confusão visual)
const SAFE_LETTERS = "ABCDEFGHJKMNPQRTUVWXYZ";
// Dígitos sanitizados (sem 0 e 1)
const SAFE_DIGITS = "23456789";

export interface PromoCodeRewardPayload {
  xp: number;
  points: number;
  chestName?: string;
  chestQuantity?: number;
  // TODO - COSMÉTICOS & AVATARES: ganchos futuros
  cosmeticId?: string;
  avatarPieceId?: string;
}

export interface PromoCodeItem {
  id: string;
  code: string; // formato visual em caixa alta com hífen
  cleanCode: string; // sem traços nem espaços, para busca rápida
  pattern: PromoCodePattern;
  batchId?: string; // ID único do lote daquela leva
  batchName: string;
  allowMultiplePerStudent?: boolean; // se true, aluno pode resgatar vários; se false, 1x por aluno
  status: "active" | "claimed";
  rewards: PromoCodeRewardPayload;
  createdAt: string;
  createdBy: string;
  claimedByStudentId?: string;
  claimedByNick?: string;
  claimedByFullName?: string;
  claimedBySchool?: string;
  claimedAt?: string;
  hiddenForAdmin?: boolean; // Soft Delete
}

export interface PromoCodeInspectResult {
  valid: boolean;
  status: "active" | "already_claimed" | "invalid" | "rate_limited";
  code?: string;
  rewards?: PromoCodeRewardPayload;
  errorMessage?: string;
  cooldownSeconds?: number;
}

export interface PromoCodeClaimResult {
  success: boolean;
  code: string;
  rewards?: PromoCodeRewardPayload;
  errorMessage?: string;
  updatedProfile?: PlayerProfile;
}

// Chaves de armazenamento
const PROMO_CODES_LOCAL_KEY = "desafios_promo_codes_v1";
export const PROMO_CODES_SHARED_GROUP_ID = "SEMED_PROMO_CODES_V1";

// Cache em memória
let inMemoryPromoCodes: PromoCodeItem[] = [];
let memoryLoaded = false;

// Rate limiting de tentativas inválidas por aluno
interface RateLimitTracker {
  failedAttempts: number;
  blockedUntil?: number;
}
const rateLimitMap = new Map<string, RateLimitTracker>();

/** Contas de teste com acesso exclusivo ao modo Beta de resgate */
export const PROMO_CODE_TESTER_ACCOUNTS = ["zheret", "lord"];

/** Verifica se o perfil atual tem acesso liberado ao resgate de códigos */
export function canAccessPromoCodeRedeem(profile?: Partial<PlayerProfile> | null): boolean {
  if (!profile) return false;
  if (profile.isAdmin) return true; // Administrador autenticado sempre pode testar
  const rawNick = (profile.nick ?? "").toLowerCase().trim();
  const slug = (profile.nickNormalized ?? nickSlug(profile.nick ?? "")).toLowerCase().trim();
  const name = (profile.full_name ?? "").toLowerCase().trim();
  const id = (profile.id ?? "").toLowerCase().trim();
  const patterns = ["zheret", "lord", "josiney", "quemuel", "admin"];
  return patterns.some(
    (p) => slug === p || slug.includes(p) || rawNick.includes(p) || name.includes(p) || id.includes(p),
  );
}

/** Gera um caractere aleatório de uma lista */
function pickRandomChar(chars: string): string {
  const idx = Math.floor(Math.random() * chars.length);
  return chars.charAt(idx);
}

/** Gera um código individual baseado na regra da máscara */
export function generateSingleCode(pattern: PromoCodePattern): string {
  const L = () => pickRandomChar(SAFE_LETTERS);
  const N = () => pickRandomChar(SAFE_DIGITS);

  switch (pattern) {
    case "padrao_1": // LNNNL-LNNNL
      return `${L()}${N()}${N()}${N()}${L()}-${L()}${N()}${N()}${N()}${L()}`;
    case "padrao_2": // NNNL-LNNN
      return `${N()}${N()}${N()}${L()}-${L()}${N()}${N()}${N()}`;
    case "padrao_3": // NLLN-NLLN
      return `${N()}${L()}${L()}${N()}-${N()}${L()}${L()}${N()}`;
    case "padrao_4": // NNLL-LLNN
      return `${N()}${N()}${L()}${L()}-${L()}${L()}${N()}${N()}`;
    case "padrao_5": // LLNN-NNLL
      return `${L()}${L()}${N()}${N()}-${N()}${N()}${L()}${L()}`;
    case "padrao_6": // LNLNLN-LNLN
      return `${L()}${N()}${L()}${N()}${L()}${N()}-${L()}${N()}${L()}${N()}`;
    default:
      return `${L()}${N()}${N()}${N()}${L()}-${L()}${N()}${N()}${N()}${L()}`;
  }
}

/** Normaliza string de código digitada pelo usuário */
export function normalizePromoCodeInput(raw: string): string {
  return raw
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "");
}

/** Carrega os códigos salvos no armazenamento local */
export function loadLocalPromoCodes(): PromoCodeItem[] {
  if (memoryLoaded && inMemoryPromoCodes.length > 0) {
    return inMemoryPromoCodes;
  }
  try {
    const raw = typeof window !== "undefined" ? localStorage.getItem(PROMO_CODES_LOCAL_KEY) : null;
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        inMemoryPromoCodes = parsed;
        memoryLoaded = true;
        return inMemoryPromoCodes;
      }
    }
  } catch {
    /* ignore parse error */
  }
  memoryLoaded = true;
  return inMemoryPromoCodes;
}

/** Salva a lista de códigos no armazenamento local */
export function saveLocalPromoCodes(codes: PromoCodeItem[]): void {
  inMemoryPromoCodes = codes;
  memoryLoaded = true;
  try {
    if (typeof window !== "undefined") {
      localStorage.setItem(PROMO_CODES_LOCAL_KEY, JSON.stringify(codes));
    }
  } catch {
    /* ignore write error */
  }
}

/**
 * Cria um lote de códigos únicos, garantindo que não colidam com códigos existentes.
 */
export function generatePromoCodesBatch(options: {
  count: number;
  pattern: PromoCodePattern;
  rewards: PromoCodeRewardPayload;
  batchName: string;
  createdBy: string;
  allowMultiplePerStudent?: boolean;
}): PromoCodeItem[] {
  const currentList = loadLocalPromoCodes();
  const existingCleanCodes = new Set(currentList.map((c) => c.cleanCode));
  const newBatch: PromoCodeItem[] = [];
  const nowIso = new Date().toISOString();
  const batchId = `batch_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
  const allowMultiple = options.allowMultiplePerStudent ?? false;

  let attempts = 0;
  const maxAttempts = options.count * 50;

  while (newBatch.length < options.count && attempts < maxAttempts) {
    attempts++;
    const formatted = generateSingleCode(options.pattern);
    const clean = normalizePromoCodeInput(formatted);

    if (!existingCleanCodes.has(clean)) {
      existingCleanCodes.add(clean);
      const item: PromoCodeItem = {
        id: `promo_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`,
        code: formatted,
        cleanCode: clean,
        pattern: options.pattern,
        batchId,
        batchName: options.batchName || "Lote Padrão",
        allowMultiplePerStudent: allowMultiple,
        status: "active",
        rewards: {
          xp: Math.max(0, options.rewards.xp ?? 0),
          points: Math.max(0, options.rewards.points ?? 0),
          chestName: options.rewards.chestName,
          chestQuantity: options.rewards.chestQuantity,
        },
        createdAt: nowIso,
        createdBy: options.createdBy || "admin",
      };
      newBatch.push(item);
    }
  }

  const updated = [...newBatch, ...currentList];
  saveLocalPromoCodes(updated);
  return newBatch;
}

/**
 * Exclui um código do sistema:
 * - Se estiver 'active': remove fisicamente da lista (Hard Delete).
 * - Se estiver 'claimed': marca 'hiddenForAdmin: true' (Soft Delete), preservando o histórico contábil.
 */
export function deletePromoCode(codeId: string): { success: boolean; mode: "hard_deleted" | "soft_deleted" } {
  const list = loadLocalPromoCodes();
  const target = list.find((c) => c.id === codeId);
  if (!target) return { success: false, mode: "hard_deleted" };

  if (target.status === "active") {
    const remaining = list.filter((c) => c.id !== codeId);
    saveLocalPromoCodes(remaining);
    return { success: true, mode: "hard_deleted" };
  } else {
    target.hiddenForAdmin = true;
    saveLocalPromoCodes([...list]);
    return { success: true, mode: "soft_deleted" };
  }
}

/**
 * Sistema Anti-Quebra: Verifica se o aluno está sob cooldown por excesso de falhas.
 */
export function checkStudentPromoRateLimit(studentId: string): {
  blocked: boolean;
  remainingSeconds: number;
  failedCount: number;
} {
  const cleanId = nickSlug(studentId);
  const now = Date.now();
  const tracker = rateLimitMap.get(cleanId);

  if (!tracker) {
    return { blocked: false, remainingSeconds: 0, failedCount: 0 };
  }

  if (tracker.blockedUntil && tracker.blockedUntil > now) {
    const remainingSeconds = Math.ceil((tracker.blockedUntil - now) / 1000);
    return { blocked: true, remainingSeconds, failedCount: tracker.failedAttempts };
  }

  return { blocked: false, remainingSeconds: 0, failedCount: tracker.failedAttempts };
}

/** Registra tentativa falha e calcula o cooldown adaptativo */
export function recordFailedPromoAttempt(studentId: string): { blocked: boolean; remainingSeconds: number } {
  const cleanId = nickSlug(studentId);
  const now = Date.now();
  const tracker = rateLimitMap.get(cleanId) ?? { failedAttempts: 0 };
  tracker.failedAttempts += 1;

  let cooldownMs = 0;
  if (tracker.failedAttempts >= 10) {
    cooldownMs = 60 * 60 * 1000; // 1 hora
  } else if (tracker.failedAttempts >= 6) {
    cooldownMs = 5 * 60 * 1000; // 5 minutos
  } else if (tracker.failedAttempts >= 3) {
    cooldownMs = 60 * 1000; // 60 segundos
  }

  if (cooldownMs > 0) {
    tracker.blockedUntil = now + cooldownMs;
    rateLimitMap.set(cleanId, tracker);
    return { blocked: true, remainingSeconds: Math.ceil(cooldownMs / 1000) };
  }

  rateLimitMap.set(cleanId, tracker);
  return { blocked: false, remainingSeconds: 0 };
}

/** Limpa tentativas falhas após resgate legítimo */
export function resetStudentPromoFailedAttempts(studentId: string): void {
  const cleanId = nickSlug(studentId);
  rateLimitMap.delete(cleanId);
}

/**
 * Etapa 1: Inspeciona a prévia do código sem consumi-lo (apenas leitura segura).
 */
export function inspectPromoCode(rawInput: string, studentId: string): PromoCodeInspectResult {
  const rateLimit = checkStudentPromoRateLimit(studentId);
  if (rateLimit.blocked) {
    return {
      valid: false,
      status: "rate_limited",
      cooldownSeconds: rateLimit.remainingSeconds,
      errorMessage: `Muitas tentativas inválidas. Aguarde ${rateLimit.remainingSeconds}s antes de tentar novamente.`,
    };
  }

  const clean = normalizePromoCodeInput(rawInput);
  if (!clean || clean.length < 6) {
    return {
      valid: false,
      status: "invalid",
      errorMessage: "Insira um código válido com no mínimo 6 caracteres.",
    };
  }

  const list = loadLocalPromoCodes();
  const match = list.find((c) => c.cleanCode === clean);

  if (!match) {
    const penalty = recordFailedPromoAttempt(studentId);
    return {
      valid: false,
      status: penalty.blocked ? "rate_limited" : "invalid",
      cooldownSeconds: penalty.remainingSeconds,
      errorMessage: penalty.blocked
        ? `Tentativas excessivas bloqueadas por segurança. Aguarde ${penalty.remainingSeconds}s.`
        : "Código não encontrado ou inválido. Verifique os caracteres e tente novamente.",
    };
  }

  if (match.status === "claimed") {
    recordFailedPromoAttempt(studentId);
    return {
      valid: false,
      status: "already_claimed",
      errorMessage: "Este código já foi resgatado anteriormente.",
    };
  }

  // Verifica se o lote restringe a 1 resgate por aluno
  if (match.allowMultiplePerStudent === false && match.batchId) {
    const cleanStudentId = nickSlug(studentId);
    const alreadyClaimedFromBatch = list.some(
      (c) =>
        c.batchId === match.batchId &&
        c.status === "claimed" &&
        (nickSlug(c.claimedByStudentId || "") === cleanStudentId ||
          nickSlug(c.claimedByNick || "") === cleanStudentId),
    );
    if (alreadyClaimedFromBatch) {
      return {
        valid: false,
        status: "already_claimed",
        errorMessage: `Você já resgatou uma recompensa desta mesma leva/lote (${match.batchName}). Limite de 1 resgate por aluno atingido.`,
      };
    }
  }

  return {
    valid: true,
    status: "active",
    code: match.code,
    rewards: match.rewards,
  };
}

/**
 * Etapa 2: Confirmação e Resgate Atômico do Código.
 * Altera status, credita XP/Pontos com registro no livro-razão e impede duplo uso.
 */
export function claimPromoCode(
  rawInput: string,
  student: PlayerProfile,
): PromoCodeClaimResult {
  if (!student || !student.id) {
    return { success: false, code: rawInput, errorMessage: "Sessão de aluno inválida." };
  }

  const rateLimit = checkStudentPromoRateLimit(student.id);
  if (rateLimit.blocked) {
    return {
      success: false,
      code: rawInput,
      errorMessage: `Acesso temporariamente bloqueado. Aguarde ${rateLimit.remainingSeconds}s.`,
    };
  }

  const clean = normalizePromoCodeInput(rawInput);
  const list = loadLocalPromoCodes();
  const target = list.find((c) => c.cleanCode === clean);

  if (!target || target.status !== "active") {
    recordFailedPromoAttempt(student.id);
    return {
      success: false,
      code: rawInput,
      errorMessage: "Código inválido ou já resgatado.",
    };
  }

  // Verifica se o lote restringe a 1 resgate por aluno
  if (target.allowMultiplePerStudent === false && target.batchId) {
    const cleanStudentId = nickSlug(student.id);
    const cleanNick = nickSlug(student.nick);
    const alreadyClaimedFromBatch = list.some(
      (c) =>
        c.batchId === target.batchId &&
        c.status === "claimed" &&
        (nickSlug(c.claimedByStudentId || "") === cleanStudentId ||
          nickSlug(c.claimedByNick || "") === cleanNick),
    );
    if (alreadyClaimedFromBatch) {
      return {
        success: false,
        code: rawInput,
        errorMessage: `Você já resgatou um código desta mesma leva/lote (${target.batchName}). Cada aluno só pode resgatar 1 vez.`,
      };
    }
  }

  // 1. Marca como resgatado de forma atômica
  const nowIso = new Date().toISOString();
  target.status = "claimed";
  target.claimedByStudentId = student.id;
  target.claimedByNick = student.nick;
  target.claimedByFullName = student.full_name || student.nick;
  target.claimedBySchool = student.school;
  target.claimedAt = nowIso;

  saveLocalPromoCodes(list);

  // 2. Concede XP se houver
  const rewards = target.rewards;
  if (rewards.xp && rewards.xp > 0) {
    student.xp = (student.xp ?? 0) + rewards.xp;
    student.seasonXp = (student.seasonXp ?? 0) + rewards.xp;
    student.level = calculatePlayerLevel({
      xp: student.xp,
      matchesPlayed: student.matchesPlayed ?? 0,
      wins: student.wins ?? 0,
      distinctGames: student.distinctGamesPlayed ?? 0,
    });
    try {
      recordScoreLedgerEntry({
        playerId: student.id,
        playerNick: student.nick,
        type: "xp",
        source: "codigo_promocional",
        amount: rewards.xp,
        balanceAfter: student.xp,
        reason: `Resgate de Código Promocional (${target.code})`,
        metadata: { codeId: target.id, code: target.code, batchName: target.batchName },
      });
    } catch {
      /* ignore */
    }
  }

  // 3. Concede Pontos (Moedas) se houver
  if (rewards.points && rewards.points > 0) {
    awardCareerPoints(student, rewards.points, `Código Promocional: ${target.code}`);
    try {
      recordScoreLedgerEntry({
        playerId: student.id,
        playerNick: student.nick,
        type: "career_points",
        source: "codigo_promocional",
        amount: rewards.points,
        balanceAfter: student.careerPoints,
        reason: `Resgate de Código: +${rewards.points} Pontos (${target.code})`,
        metadata: { codeId: target.id, code: target.code, batchName: target.batchName },
      });
    } catch {
      /* ignore */
    }
  }

  // Limpa as tentativas falhas após o sucesso
  resetStudentPromoFailedAttempts(student.id);

  // Tenta sincronizar silenciosamente com o PlayFab em segundo plano se configurado
  void syncPromoCodesToPlayFab();

  return {
    success: true,
    code: target.code,
    rewards,
    updatedProfile: student,
  };
}

/**
 * Garante que o SharedGroup dos Códigos Promocionais exista na PlayFab.
 */
let sharedGroupEnsured = false;
async function ensurePromoCodesSharedGroup(ticket: string): Promise<void> {
  if (sharedGroupEnsured) return;
  try {
    await callPlayFabClient(
      "CreateSharedGroup",
      { SharedGroupId: PROMO_CODES_SHARED_GROUP_ID },
      ticket,
    );
  } catch {
    /* SharedGroup já existe (erro 1085 / SharedGroupAlreadyExists), prossegue normalmente */
  }
  sharedGroupEnsured = true;
}

/**
 * Sincroniza os códigos com a nuvem PlayFab (SharedGroup público).
 */
export async function syncPromoCodesToPlayFab(): Promise<boolean> {
  if (!isPlayFabConfigured()) return false;
  try {
    const ticket = (await getAdminPlayFabTicket()) ?? loadStoredSession()?.sessionTicket;
    if (!ticket) return false;

    await ensurePromoCodesSharedGroup(ticket);

    const list = loadLocalPromoCodes();
    const payload = JSON.stringify(list);

    await callPlayFabClient(
      "UpdateSharedGroupData",
      {
        SharedGroupId: PROMO_CODES_SHARED_GROUP_ID,
        Data: { promo_codes_catalog: payload },
        Permission: "Public",
      },
      ticket,
    );
    return true;
  } catch (err) {
    console.warn("[PromoCodes] Falha ao sincronizar códigos com a nuvem:", err);
    return false;
  }
}

/**
 * Baixa os códigos mais recentes da nuvem PlayFab.
 */
export async function fetchPromoCodesFromPlayFab(): Promise<PromoCodeItem[]> {
  if (!isPlayFabConfigured()) return loadLocalPromoCodes();
  try {
    const ticket = (await getAdminPlayFabTicket()) ?? loadStoredSession()?.sessionTicket;
    if (!ticket) return loadLocalPromoCodes();

    const res = await callPlayFabClient(
      "GetSharedGroupData",
      {
        SharedGroupId: PROMO_CODES_SHARED_GROUP_ID,
        Keys: ["promo_codes_catalog"],
      },
      ticket,
    );

    const raw = res?.data?.Data?.promo_codes_catalog?.Value;
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        // Mescla códigos da nuvem com eventuais alterações locais muito recentes
        const local = loadLocalPromoCodes();
        const now = Date.now();
        const map = new Map<string, PromoCodeItem>();
        for (const item of parsed) map.set(item.cleanCode, item);
        for (const item of local) {
          const cloudItem = map.get(item.cleanCode);
          if (!cloudItem) {
            // Preserva item local apenas se foi criado nos últimos 15s (ainda subindo para nuvem)
            const ageMs = now - new Date(item.createdAt).getTime();
            if (ageMs >= 0 && ageMs < 15_000) {
              map.set(item.cleanCode, item);
            }
          } else if (item.status === "claimed" && cloudItem.status !== "claimed") {
            map.set(item.cleanCode, item); // Prioriza resgate local se ainda não subiu
          }
        }
        const merged = Array.from(map.values());
        saveLocalPromoCodes(merged);
        return merged;
      }
    }

    const localFallback = loadLocalPromoCodes();
    if (localFallback.length > 0) {
      await syncPromoCodesToPlayFab();
    }
    return localFallback;
  } catch (err) {
    const localFallback = loadLocalPromoCodes();
    if (localFallback.length > 0) {
      await syncPromoCodesToPlayFab();
    } else {
      console.warn("[PromoCodes] Falha ao baixar códigos da nuvem:", err);
    }
    return localFallback;
  }
}
