import type { CosmeticKind } from "../cosmetics-catalog.ts";
import type { PlatformAdminConfig } from "../game-codes.ts";

export type PlayFabClientCallFn = <T>(
  endpoint: string,
  body: Record<string, unknown>,
  sessionTicket?: string,
) => Promise<{ data: T | null; error: string | null; errorCode?: string }>;

interface ExecuteCloudScriptEnvelope<T> {
  FunctionResult?: T;
}

export interface VerifyAdminSessionResult {
  ok: boolean;
  isAdmin: boolean;
  playFabId: string | null;
  version?: string;
}

export interface SaveAdminConfigCloudResult {
  ok: boolean;
  conflict?: boolean;
  existingRevision?: number;
  incomingRevision?: number;
  configRevision?: number;
  updatedAt?: string;
  error?: string;
}

export interface PurgeStudentCloudResult {
  ok: boolean;
  purgedPlayFabId?: string | null;
  cleanedGroups?: string[];
  banned?: boolean;
  error?: string;
  note?: string;
}

export interface ServerEconomyResult {
  ok: boolean;
  error?: string;
  profile?: Record<string, unknown>;
}

const serverVerifiedAdminTickets = new Map<string, { isAdmin: boolean; checkedAt: number }>();

export function isServerVerifiedAdminTicket(sessionTicket?: string | null): boolean {
  if (!sessionTicket || sessionTicket.startsWith("admin-")) return false;
  return serverVerifiedAdminTickets.get(sessionTicket)?.isAdmin === true;
}

export function clearServerVerifiedAdminTickets(): void {
  serverVerifiedAdminTickets.clear();
}

export async function verifyAdminSessionCloud(
  callClient: PlayFabClientCallFn,
  sessionTicket?: string | null,
): Promise<VerifyAdminSessionResult | null> {
  if (!sessionTicket || sessionTicket.startsWith("admin-")) return null;
  const res = await callClient<ExecuteCloudScriptEnvelope<VerifyAdminSessionResult>>(
    "ExecuteCloudScript",
    {
      FunctionName: "VerifyAdminSession",
      FunctionParameter: {},
    },
    sessionTicket,
  );
  if (res.error || !res.data?.FunctionResult) return null;
  const result = res.data.FunctionResult;
  if (typeof result.isAdmin === "boolean") {
    serverVerifiedAdminTickets.set(sessionTicket, {
      isAdmin: result.isAdmin,
      checkedAt: Date.now(),
    });
  }
  return result;
}

export async function fetchTitleDataAdminConfig(
  callClient: PlayFabClientCallFn,
  sessionTicket?: string | null,
): Promise<Partial<PlatformAdminConfig> | null> {
  const res = await callClient<{ Data?: Record<string, string> }>(
    "GetTitleData",
    { Keys: ["PlatformAdminConfig"] },
    sessionTicket ?? undefined,
  );
  if (res.error) return null;
  const raw = res.data?.Data?.PlatformAdminConfig;
  if (!raw || typeof raw !== "string") return null;
  try {
    const parsed = JSON.parse(raw) as Partial<PlatformAdminConfig>;
    return parsed && typeof parsed === "object" ? parsed : null;
  } catch {
    return null;
  }
}

export async function saveAdminConfigViaCloudScript(
  callClient: PlayFabClientCallFn,
  config: PlatformAdminConfig,
  options: {
    domain?: string;
    allowSeasonChange?: boolean;
    allowEmptyCollections?: readonly string[];
    force?: boolean;
  } | undefined,
  sessionTicket?: string | null,
): Promise<SaveAdminConfigCloudResult | null> {
  if (!sessionTicket || sessionTicket.startsWith("admin-")) return null;
  const res = await callClient<ExecuteCloudScriptEnvelope<SaveAdminConfigCloudResult>>(
    "ExecuteCloudScript",
    {
      FunctionName: "SavePlatformAdminConfig",
      FunctionParameter: {
        config,
        domain: options?.domain ?? "all",
        allowSeasonChange: options?.allowSeasonChange === true,
        allowEmptyCollections: options?.allowEmptyCollections ?? [],
        force: options?.force === true,
      },
    },
    sessionTicket,
  );
  if (res.error || !res.data?.FunctionResult) return null;
  return res.data.FunctionResult;
}

export async function purgeStudentViaCloudScript(
  callClient: PlayFabClientCallFn,
  args: {
    targetPlayFabId?: string | null;
    studentId?: string | null;
    nickNormalized?: string | null;
    rankedSeasonId?: number;
  },
  sessionTicket?: string | null,
): Promise<PurgeStudentCloudResult | null> {
  if (!sessionTicket || sessionTicket.startsWith("admin-")) return null;
  const res = await callClient<ExecuteCloudScriptEnvelope<PurgeStudentCloudResult>>(
    "ExecuteCloudScript",
    {
      FunctionName: "AdminPurgeStudentAccount",
      FunctionParameter: args,
    },
    sessionTicket,
  );
  if (res.error || !res.data?.FunctionResult) return null;
  return res.data.FunctionResult;
}

export async function serverPurchaseCosmetic(
  callClient: PlayFabClientCallFn,
  args: { itemId: string; kind: CosmeticKind; currency?: "coins" | "points"; price: number },
  sessionTicket?: string | null,
): Promise<ServerEconomyResult | null> {
  if (!sessionTicket || sessionTicket.startsWith("admin-")) return null;
  const res = await callClient<ExecuteCloudScriptEnvelope<ServerEconomyResult>>(
    "ExecuteCloudScript",
    {
      FunctionName: "ServerPurchaseCosmetic",
      FunctionParameter: args,
    },
    sessionTicket,
  );
  if (res.error || !res.data?.FunctionResult) return null;
  return res.data.FunctionResult;
}

export async function serverPurchaseCardPack(
  callClient: PlayFabClientCallFn,
  args: { packId: string; quantity: number; unitPrice: number },
  sessionTicket?: string | null,
): Promise<ServerEconomyResult | null> {
  if (!sessionTicket || sessionTicket.startsWith("admin-")) return null;
  const res = await callClient<ExecuteCloudScriptEnvelope<ServerEconomyResult>>(
    "ExecuteCloudScript",
    {
      FunctionName: "ServerPurchaseCardPack",
      FunctionParameter: args,
    },
    sessionTicket,
  );
  if (res.error || !res.data?.FunctionResult) return null;
  return res.data.FunctionResult;
}

export async function serverOpenChest(
  callClient: PlayFabClientCallFn,
  args: {
    chestId: string;
    rewards?: { coins?: number; points?: number; packIds?: string[] };
  },
  sessionTicket?: string | null,
): Promise<ServerEconomyResult | null> {
  if (!sessionTicket || sessionTicket.startsWith("admin-")) return null;
  const res = await callClient<ExecuteCloudScriptEnvelope<ServerEconomyResult>>(
    "ExecuteCloudScript",
    {
      FunctionName: "ServerOpenChest",
      FunctionParameter: args,
    },
    sessionTicket,
  );
  if (res.error || !res.data?.FunctionResult) return null;
  return res.data.FunctionResult;
}

export async function serverOpenCardPack(
  callClient: PlayFabClientCallFn,
  args: { packId: string; cardIds: string[] },
  sessionTicket?: string | null,
): Promise<ServerEconomyResult | null> {
  if (!sessionTicket || sessionTicket.startsWith("admin-")) return null;
  const res = await callClient<ExecuteCloudScriptEnvelope<ServerEconomyResult>>(
    "ExecuteCloudScript",
    {
      FunctionName: "ServerOpenCardPack",
      FunctionParameter: args,
    },
    sessionTicket,
  );
  if (res.error || !res.data?.FunctionResult) return null;
  return res.data.FunctionResult;
}
