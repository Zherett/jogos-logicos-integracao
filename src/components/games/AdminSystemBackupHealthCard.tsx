import { useEffect, useRef, useState } from "react";
import { Download, HardDrive, RefreshCw, ShieldCheck, Upload, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  exportFullAdminBackup,
  parseFullAdminBackup,
} from "@/lib/admin-config-guard";
import type { PlatformAdminConfig } from "@/lib/game-codes";
import {
  fetchPlayFabStorageHealth,
  getLastAdminCloudSyncError,
  type PlayFabStorageHealthReport,
  type PushAdminConfigOptions,
} from "@/lib/playfab";
import { loadLocalPromoCodes, saveLocalPromoCodes, syncPromoCodesToPlayFab, type PromoCodeItem } from "@/lib/promo-codes";
import { measureLocalStorageUsage, type LocalStorageHealthReport } from "@/lib/storage-guard";

interface AdminSystemBackupHealthCardProps {
  draft: PlatformAdminConfig;
  setDraft: React.Dispatch<React.SetStateAction<PlatformAdminConfig>>;
  onSaveConfig: (
    nextCfg: PlatformAdminConfig,
    options?: PushAdminConfigOptions,
  ) => Promise<void> | void;
  onShowFeedback?: (msg: string) => void;
}

function formatKb(bytes: number): string {
  return `${(bytes / 1024).toFixed(1)} KB`;
}

export function AdminSystemBackupHealthCard({
  draft,
  setDraft,
  onSaveConfig,
  onShowFeedback,
}: AdminSystemBackupHealthCardProps) {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [localHealth, setLocalHealth] = useState<LocalStorageHealthReport>(() =>
    measureLocalStorageUsage(),
  );
  const [cloudHealth, setCloudHealth] = useState<PlayFabStorageHealthReport | null>(null);
  const [loadingHealth, setLoadingHealth] = useState(false);
  const [busyRestore, setBusyRestore] = useState(false);
  const [statusMsg, setStatusMsg] = useState<string | null>(null);

  async function refreshHealth() {
    setLoadingHealth(true);
    setLocalHealth(measureLocalStorageUsage());
    try {
      const report = await fetchPlayFabStorageHealth();
      setCloudHealth(report);
    } finally {
      setLoadingHealth(false);
    }
  }

  useEffect(() => {
    void refreshHealth();
  }, []);

  function handleExportFullBackup() {
    const promoCodes = loadLocalPromoCodes();
    const json = exportFullAdminBackup(draft, promoCodes);
    const blob = new Blob([json], { type: "application/json;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    const stamp = new Date().toISOString().slice(0, 10);
    a.href = url;
    a.download = `plataforma-backup-completo-${stamp}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    const msg = `💾 Backup completo exportado (${draft.cardsCatalog?.length ?? 0} cartas, ${draft.chestsCatalog?.length ?? 0} baús, ${draft.inboxMessages?.length ?? 0} mensagens, ${promoCodes.length} códigos promo)!`;
    setStatusMsg(msg);
    onShowFeedback?.(msg);
  }

  async function handleImportFullBackup(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setStatusMsg(null);
    setBusyRestore(true);
    try {
      const text = await file.text();
      const parsed = parseFullAdminBackup(text);
      if (parsed.error || !parsed.config || !parsed.summary) {
        setStatusMsg(`⚠️ ${parsed.error ?? "Backup inválido."}`);
        return;
      }

      const s = parsed.summary;
      const confirmed = window.confirm(
        `Deseja restaurar este backup completo na nuvem?\n\n` +
          `• Cartas: ${s.cardsCount}\n` +
          `• Pacotes: ${s.packsCount} • Baús: ${s.chestsCount}\n` +
          `• Medalhas custom: ${s.customMedalsCount} • Eventos: ${s.specialEventsCount + s.recurringEventsCount}\n` +
          `• Avisos: ${s.noticeSlidesCount} • Correio: ${s.inboxMessagesCount}\n` +
          `• Códigos Promocionais: ${s.promoCodesCount}`,
      );
      if (!confirmed) return;

      const restoredCfg: PlatformAdminConfig = {
        ...draft,
        ...parsed.config,
      };
      setDraft(restoredCfg);
      await onSaveConfig(restoredCfg, {
        domain: "all",
        allowCardsCatalogWrite: (restoredCfg.cardsCatalog?.length ?? 0) > 0,
        allowSeasonChange: false,
      });

      if (Array.isArray(parsed.promoCodes) && parsed.promoCodes.length > 0) {
        saveLocalPromoCodes(parsed.promoCodes as PromoCodeItem[]);
        await syncPromoCodesToPlayFab();
      }

      const cloudErr = getLastAdminCloudSyncError();
      const msg = cloudErr
        ? `⚠️ Restaurado localmente — erro ao publicar no PlayFab: ${cloudErr}`
        : `✅ Backup completo restaurado e publicado na nuvem (${s.cardsCount} cartas, ${s.inboxMessagesCount} mensagens)!`;
      setStatusMsg(msg);
      onShowFeedback?.(msg);
      await refreshHealth();
    } catch (err) {
      setStatusMsg(
        `⚠️ Falha ao restaurar backup: ${err instanceof Error ? err.message : "arquivo inválido."}`,
      );
    } finally {
      setBusyRestore(false);
    }
  }

  return (
    <div className="rounded-2xl border border-primary/25 bg-card p-4 space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <ShieldCheck className="h-5 w-5 text-primary" />
          <div>
            <div className="font-display text-sm font-black text-foreground">
              Backup Completo &amp; Monitor de Saúde do Armazenamento
            </div>
            <p className="text-[11px] text-muted-foreground">
              Salve ou restaure toda a plataforma (cartas, pacotes, baús, loja, eventos, avisos, correio, rotina e códigos) em 1 arquivo JSON.
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <input
            ref={fileInputRef}
            type="file"
            accept="application/json,.json"
            className="hidden"
            onChange={(e) => void handleImportFullBackup(e)}
          />
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={handleExportFullBackup}
            className="h-8 rounded-xl text-xs font-bold"
          >
            <Download className="h-3.5 w-3.5 mr-1" /> Exportar Tudo (.json)
          </Button>
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={busyRestore}
            onClick={() => fileInputRef.current?.click()}
            className="h-8 rounded-xl text-xs font-bold border-primary/40 text-primary"
          >
            <Upload className="h-3.5 w-3.5 mr-1" /> {busyRestore ? "Restaurando..." : "Restaurar Tudo"}
          </Button>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            disabled={loadingHealth}
            onClick={() => void refreshHealth()}
            className="h-8 rounded-xl text-xs font-bold"
          >
            <RefreshCw className={`h-3.5 w-3.5 mr-1 ${loadingHealth ? "animate-spin" : ""}`} />
            Atualizar
          </Button>
        </div>
      </div>

      {statusMsg && (
        <div
          className={`rounded-xl border px-3 py-2 text-xs font-bold ${
            statusMsg.startsWith("⚠️")
              ? "border-rose-500/40 bg-rose-500/10 text-rose-700 dark:text-rose-300"
              : "border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
          }`}
        >
          {statusMsg}
        </div>
      )}

      <div className="grid gap-3 md:grid-cols-2">
        {/* Saúde do PlayFab */}
        <div className="rounded-xl border bg-secondary/25 p-3 space-y-2 text-xs">
          <div className="flex items-center justify-between font-bold text-foreground">
            <span>☁️ Nuvem PlayFab (1B2E1517154B2D49)</span>
            {cloudHealth?.ok && (
              <span className="font-mono text-[11px] text-primary">
                Rev. #{cloudHealth.configRevision} • {formatKb(cloudHealth.totalOwnerBytes)}
              </span>
            )}
          </div>
          {!cloudHealth ? (
            <p className="text-[11px] text-muted-foreground">Carregando métricas da nuvem...</p>
          ) : !cloudHealth.ok ? (
            <p className="text-[11px] text-destructive">{cloudHealth.error ?? "Erro ao consultar nuvem."}</p>
          ) : (
            <div className="space-y-1.5 text-[11px]">
              <div className="grid grid-cols-2 gap-1.5">
                <div className="rounded-lg bg-background/80 px-2 py-1.5 border">
                  <span className="text-muted-foreground block">Cartas Fatiadas</span>
                  <b className="font-mono text-foreground">
                    {cloudHealth.cardsCount} carta(s) • {cloudHealth.cardsChunksCount} bloco(s)
                  </b>
                </div>
                <div className="rounded-lg bg-background/80 px-2 py-1.5 border">
                  <span className="text-muted-foreground block">Roster de Alunos</span>
                  <b className="font-mono text-foreground">
                    {cloudHealth.rosterKeysCount} alunos • {formatKb(cloudHealth.rosterTotalBytes)}
                  </b>
                </div>
                <div className="rounded-lg bg-background/80 px-2 py-1.5 border">
                  <span className="text-muted-foreground block">Recibos / Notif. SG</span>
                  <b className="font-mono text-foreground">{cloudHealth.notificationsKeysCount} chaves</b>
                </div>
                <div className="rounded-lg bg-background/80 px-2 py-1.5 border">
                  <span className="text-muted-foreground block">Promo &amp; Recordes</span>
                  <b className="font-mono text-foreground">
                    {formatKb(cloudHealth.promoCodesBytes)} / {formatKb(cloudHealth.gameRecordsBytes)}
                  </b>
                </div>
              </div>
              {cloudHealth.keys.length > 0 && (
                <div className="pt-1 space-y-0.5 text-[10px] font-mono text-muted-foreground">
                  {cloudHealth.keys.slice(0, 5).map((item) => (
                    <div key={item.key} className="flex justify-between gap-2">
                      <span className="truncate">{item.key}</span>
                      <span className={item.bytes > 75_000 ? "text-amber-600 dark:text-amber-400 font-bold" : ""}>
                        {formatKb(item.bytes)}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Saúde do localStorage */}
        <div className="rounded-xl border bg-secondary/25 p-3 space-y-2 text-xs">
          <div className="flex items-center justify-between font-bold text-foreground">
            <span className="flex items-center gap-1.5">
              <HardDrive className="h-3.5 w-3.5 text-primary" /> Armazenamento Local (Navegador)
            </span>
            <span
              className={`font-mono text-[11px] font-extrabold ${
                localHealth.warningLevel === "critical"
                  ? "text-destructive"
                  : localHealth.warningLevel === "attention"
                    ? "text-amber-600 dark:text-amber-400"
                    : "text-emerald-600 dark:text-emerald-400"
              }`}
            >
              {formatKb(localHealth.totalBytes)} ({localHealth.usagePercent}%)
            </span>
          </div>
          <div className="h-2 w-full overflow-hidden rounded-full bg-background border">
            <div
              className={`h-full transition-all ${
                localHealth.warningLevel === "critical"
                  ? "bg-destructive"
                  : localHealth.warningLevel === "attention"
                    ? "bg-amber-500"
                    : "bg-emerald-500"
              }`}
              style={{ width: `${Math.max(2, Math.min(100, localHealth.usagePercent))}%` }}
            />
          </div>
          {localHealth.warningLevel !== "ok" && (
            <div className="flex items-center gap-1.5 text-[10px] font-bold text-amber-700 dark:text-amber-300">
              <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
              Uso elevado de localStorage — a limpeza automática de caches descartáveis está ativa.
            </div>
          )}
          <div className="space-y-0.5 text-[10px] font-mono text-muted-foreground">
            {localHealth.topKeys.slice(0, 5).map((item) => (
              <div key={item.key} className="flex justify-between gap-2">
                <span className="truncate">{item.key}</span>
                <span>{formatKb(item.bytes)}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
