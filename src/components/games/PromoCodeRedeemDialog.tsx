import { useState, useEffect, useRef } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Ticket,
  Sparkles,
  CheckCircle2,
  AlertTriangle,
  RotateCcw,
  Zap,
  Coins,
  Star,
  Package,
  Camera,
  Loader2,
  X,
} from "lucide-react";
import {
  inspectPromoCodeCloud,
  claimPromoCodeCloud,
  normalizePromoCodeInput,
  getPromoCodesSnapshot,
  restorePromoCodesSnapshot,
  syncPromoCodesToPlayFab,
  type PromoCodeRewardPayload,
} from "@/lib/promo-codes";
import { getActiveAccount, savePlayerProfile } from "@/lib/playfab";
import { usePlayerAuth } from "@/lib/player-auth";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onRewardClaimed?: () => void;
}

type RedeemStep = "input" | "preview" | "success";

function extractCodeFromQrText(raw: string): string {
  const trimmed = raw.trim();
  const match = trimmed.match(/[?&]c(ode)?=([A-Za-z0-9-]+)/i);
  return (match ? match[2] : trimmed).toUpperCase();
}

export function PromoCodeRedeemDialog({ open, onOpenChange, onRewardClaimed }: Props) {
  const auth = usePlayerAuth();
  const profile = auth.profile;

  const [step, setStep] = useState<RedeemStep>("input");
  const [codeInput, setCodeInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [identifiedReward, setIdentifiedReward] = useState<PromoCodeRewardPayload | null>(null);
  const [confirmedCode, setConfirmedCode] = useState<string>("");
  const [scannerOpen, setScannerOpen] = useState(false);
  const [scannerStatus, setScannerStatus] = useState<string | null>(null);
  const [pasteInput, setPasteInput] = useState("");

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const actionLockRef = useRef(false);

  function stopCamera() {
    if (streamRef.current) {
      for (const track of streamRef.current.getTracks()) {
        track.stop();
      }
      streamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
  }

  // Detecta ?code=... na URL caso o aluno tenha escaneado o QR Code pela câmera nativa do celular
  useEffect(() => {
    if (!open || typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    const urlCode = params.get("code") || params.get("c");
    if (urlCode && urlCode.trim()) {
      setCodeInput(urlCode.trim().toUpperCase());
    }
  }, [open]);

  // Para a câmera ao fechar o modal ou o scanner
  useEffect(() => {
    if (!open || !scannerOpen) {
      stopCamera();
    }
    return () => {
      stopCamera();
    };
  }, [open, scannerOpen]);

  // Loop de leitura de QR Code via câmera + BarcodeDetector nativo
  useEffect(() => {
    if (!open || !scannerOpen) return;
    let cancelled = false;
    let rafId = 0;

    async function startScanner() {
      setScannerStatus("Iniciando câmera...");
      const BarcodeDetectorCtor = (
        window as unknown as {
          BarcodeDetector?: new (opts: { formats: string[] }) => {
            detect: (source: ImageBitmapSource) => Promise<Array<{ rawValue?: string }>>;
          };
        }
      ).BarcodeDetector;

      if (!navigator.mediaDevices?.getUserMedia || !BarcodeDetectorCtor) {
        setScannerStatus("Leitura automática indisponível neste navegador. Cole o link ou código do QR abaixo:");
        return;
      }

      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: "environment" },
          audio: false,
        });
        if (cancelled) {
          for (const t of stream.getTracks()) t.stop();
          return;
        }
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play();
        }
        setScannerStatus("Aponte a câmera para o QR Code do cartão...");
        const detector = new BarcodeDetectorCtor({ formats: ["qr_code"] });

        const tick = async () => {
          if (cancelled || !videoRef.current) return;
          try {
            if (videoRef.current.readyState >= 2) {
              const results = await detector.detect(videoRef.current);
              const hit = results.find((r) => r.rawValue && r.rawValue.trim().length > 0);
              if (hit?.rawValue) {
                setCodeInput(extractCodeFromQrText(hit.rawValue));
                setScannerOpen(false);
                stopCamera();
                return;
              }
            }
          } catch {
            /* ignora erro pontual de frame */
          }
          rafId = window.requestAnimationFrame(() => {
            void tick();
          });
        };
        rafId = window.requestAnimationFrame(() => {
          void tick();
        });
      } catch {
        setScannerStatus("Não foi possível acessar a câmera. Cole o link ou código do QR abaixo:");
      }
    }

    void startScanner();

    return () => {
      cancelled = true;
      if (rafId) window.cancelAnimationFrame(rafId);
      stopCamera();
    };
  }, [open, scannerOpen]);

  function resetForm() {
    stopCamera();
    setStep("input");
    setCodeInput("");
    setErrorMsg(null);
    setIdentifiedReward(null);
    setConfirmedCode("");
    setLoading(false);
    setScannerOpen(false);
    setScannerStatus(null);
    setPasteInput("");
  }

  function handleClose(v: boolean) {
    if (!v) resetForm();
    onOpenChange(v);
  }

  // Etapa 1: Inspeciona a prévia do código via servidor (CloudScript) sem baixar catálogo
  async function handleInspect(e?: React.FormEvent) {
    if (e) e.preventDefault();
    if (actionLockRef.current || loading) return;
    setErrorMsg(null);

    if (!profile) {
      setErrorMsg("Entre na sua conta de jogador para verificar e resgatar códigos.");
      return;
    }

    const clean = normalizePromoCodeInput(codeInput);
    if (!clean) {
      setErrorMsg("Digite o código promocional.");
      return;
    }

    actionLockRef.current = true;
    setLoading(true);
    try {
      const res = await inspectPromoCodeCloud(codeInput, profile.id, profile);
      if (!res.valid) {
        setErrorMsg(res.errorMessage || "Código inválido ou expirado.");
        return;
      }
      setConfirmedCode(res.code || codeInput.trim().toUpperCase());
      setIdentifiedReward(res.rewards || null);
      setStep("preview");
    } finally {
      actionLockRef.current = false;
      setLoading(false);
    }
  }

  // Etapa 2: Confirmação e Resgate Atômico
  async function handleClaim() {
    if (!profile || loading || actionLockRef.current) {
      if (!profile) setErrorMsg("Sessão de jogador não encontrada.");
      return;
    }
    actionLockRef.current = true;
    setLoading(true);
    setErrorMsg(null);

    const prevCodesRaw = getPromoCodesSnapshot();

    try {
      // Usa o perfil ao vivo do localStorage (trava anti-duplicidade em múltiplas abas)
      const liveProfile = getActiveAccount()?.profile ?? profile;
      const profileSnapshot = JSON.parse(JSON.stringify(liveProfile)) as typeof liveProfile;
      const res = await claimPromoCodeCloud(confirmedCode || codeInput, profileSnapshot);
      if (!res.success) {
        setErrorMsg(res.errorMessage || "Falha ao resgatar o código.");
        return;
      }

      // Persiste XP, nível, moedas e itens no PlayFab com confirmação obrigatória do servidor
      if (res.updatedProfile) {
        await savePlayerProfile(res.updatedProfile, { requireServerSync: true });
        if (!res.usedCloudScript) {
          const syncedPromo = await syncPromoCodesToPlayFab();
          if (!syncedPromo) {
            console.warn("[PromoCode] Recompensa salva no perfil, mas falhou ao replicar status do código no SharedGroup.");
          }
        }
        await auth.refresh();
      }
      onRewardClaimed?.();
      setStep("success");
    } catch (err) {
      // Rollback atômico (localStorage + cache em memória) se a gravação no servidor falhar
      restorePromoCodesSnapshot(prevCodesRaw);
      setErrorMsg(
        err instanceof Error && err.message
          ? err.message
          : "Sua sessão expirou ou está sem conexão. Faça login novamente para resgatar este código.",
      );
    } finally {
      actionLockRef.current = false;
      setLoading(false);
    }
  }

  function handleApplyPastedQr() {
    if (!pasteInput.trim()) return;
    setCodeInput(extractCodeFromQrText(pasteInput));
    setPasteInput("");
    setScannerOpen(false);
  }

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto rounded-3xl p-6 border shadow-2xl bg-background">
        <DialogHeader className="border-b pb-3">
          <DialogTitle className="flex items-center gap-2 font-display text-xl font-black text-foreground">
            <Ticket className="h-6 w-6 text-fuchsia-500" />
            Resgatar Código Promocional
          </DialogTitle>
        </DialogHeader>

        <div className="py-2 space-y-4">
          {auth.cloudSessionExpired && (
            <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-amber-500/40 bg-amber-500/10 p-3 text-xs font-semibold text-amber-700 dark:text-amber-300">
              <span>🔑 Sessão na nuvem expirada (24h). Renove o login para resgatar códigos.</span>
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => auth.openReloginDialog()}
                className="h-7 rounded-lg border-amber-500/50 bg-background/80 text-xs font-extrabold"
              >
                Renovar Login
              </Button>
            </div>
          )}

          {/* MENSAGEM DE ERRO OU RATE LIMIT */}
          {errorMsg && (
            <div className="rounded-xl border border-destructive/40 bg-destructive/10 p-3 text-xs text-destructive flex items-start gap-2 animate-shake">
              <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
              <span>{errorMsg}</span>
            </div>
          )}

          {/* ETAPA 1: DIGITAÇÃO DO CÓDIGO */}
          {step === "input" && (
            <form onSubmit={handleInspect} className="space-y-4">
              <p className="text-xs text-muted-foreground">
                Digite o código do seu cartão escolar ou use a câmera para ler o QR Code da recompensa:
              </p>

              <div className="space-y-2">
                <div className="flex gap-2">
                  <Input
                    value={codeInput}
                    onChange={(e) => setCodeInput(e.target.value.toUpperCase())}
                    placeholder="Ex: A124C-D123A"
                    className="font-mono text-center text-sm font-black uppercase tracking-wider h-11 rounded-xl"
                    autoFocus
                    disabled={loading}
                  />
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setScannerOpen((v) => !v)}
                    className="rounded-xl h-11 px-3 border-fuchsia-500/40 text-fuchsia-600 dark:text-fuchsia-400 hover:bg-fuchsia-500/10"
                    title="Ler QR Code com a câmera ou colar link do cartão"
                  >
                    {scannerOpen ? <X className="h-4 w-4" /> : <Camera className="h-4 w-4" />}
                  </Button>
                </div>

                {scannerOpen && (
                  <div className="rounded-2xl border border-fuchsia-500/30 bg-muted/40 p-3 space-y-2.5">
                    <div className="relative overflow-hidden rounded-xl bg-black/90 aspect-video flex items-center justify-center">
                      <video ref={videoRef} className="h-full w-full object-cover" playsInline muted />
                      {scannerStatus && (
                        <div className="absolute inset-x-2 bottom-2 rounded-lg bg-black/75 px-2.5 py-1 text-center text-[11px] font-semibold text-white">
                          {scannerStatus}
                        </div>
                      )}
                    </div>
                    <div className="flex gap-2">
                      <Input
                        value={pasteInput}
                        onChange={(e) => setPasteInput(e.target.value)}
                        placeholder="Ou cole aqui o link / código do QR..."
                        className="h-9 text-xs rounded-xl"
                      />
                      <Button
                        type="button"
                        size="sm"
                        variant="secondary"
                        onClick={handleApplyPastedQr}
                        disabled={!pasteInput.trim()}
                        className="h-9 rounded-xl text-xs font-bold shrink-0"
                      >
                        Aplicar
                      </Button>
                    </div>
                  </div>
                )}
              </div>

              <div className="flex gap-2 pt-1">
                <Button
                  type="submit"
                  disabled={loading || !codeInput.trim()}
                  className="w-full rounded-xl h-11 font-display font-extrabold gap-2 bg-fuchsia-600 hover:bg-fuchsia-700 text-white shadow-md cursor-pointer"
                >
                  {loading ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" /> Verificando...
                    </>
                  ) : (
                    <>
                      <Sparkles className="h-4 w-4" /> Verificar Código →
                    </>
                  )}
                </Button>
              </div>
            </form>
          )}

          {/* ETAPA 2: PRÉVIA DA RECOMPENSA IDENTIFICADA */}
          {step === "preview" && identifiedReward && (
            <div className="space-y-4 animate-fade-in">
              <div className="rounded-2xl border border-fuchsia-500/30 bg-fuchsia-500/10 p-4 space-y-3">
                <div className="flex items-center gap-2 text-fuchsia-600 dark:text-fuchsia-400 font-display text-sm font-black">
                  <Sparkles className="h-4 w-4 animate-spin" />
                  Recompensa Identificada!
                </div>

                <div className="font-mono text-xs text-muted-foreground bg-background/80 rounded-lg p-1.5 text-center font-bold">
                  Código: <span className="text-foreground">{confirmedCode}</span>
                </div>

                <div className="grid grid-cols-2 gap-2 pt-1">
                  {identifiedReward.xp > 0 && (
                    <div className="rounded-xl border bg-background/90 p-2.5 flex items-center gap-2">
                      <Zap className="h-5 w-5 text-amber-500" />
                      <div>
                        <div className="text-[10px] text-muted-foreground font-bold uppercase">Experiência</div>
                        <div className="font-display text-sm font-black text-amber-500">+{identifiedReward.xp} XP</div>
                      </div>
                    </div>
                  )}

                  {identifiedReward.points > 0 && (
                    <div className="rounded-xl border bg-background/90 p-2.5 flex items-center gap-2">
                      <Star className="h-5 w-5 text-primary" />
                      <div>
                        <div className="text-[10px] text-muted-foreground font-bold uppercase">Pontos</div>
                        <div className="font-display text-sm font-black text-primary">+{identifiedReward.points} pts</div>
                      </div>
                    </div>
                  )}

                  {(identifiedReward.coins ?? 0) > 0 && (
                    <div className="rounded-xl border bg-background/90 p-2.5 flex items-center gap-2">
                      <Coins className="h-5 w-5 text-amber-500" />
                      <div>
                        <div className="text-[10px] text-muted-foreground font-bold uppercase">Moedas</div>
                        <div className="font-display text-sm font-black text-amber-500">+{identifiedReward.coins} moedas</div>
                      </div>
                    </div>
                  )}

                  {(identifiedReward.cosmeticId || identifiedReward.avatarPieceId) && (
                    <div className="col-span-2 rounded-xl border bg-background/90 p-2.5 flex items-center gap-2">
                      <Sparkles className="h-5 w-5 text-fuchsia-500" />
                      <div>
                        <div className="text-[10px] text-muted-foreground font-bold uppercase">
                          Cosmético ({identifiedReward.cosmeticKind === "aura" ? "Aura" : "Avatar"})
                        </div>
                        <div className="font-display text-xs font-black text-foreground">
                          Desbloqueio exclusivo no seu perfil
                        </div>
                      </div>
                    </div>
                  )}

                  {(identifiedReward.rewardItem || identifiedReward.chestName) && (
                    <div className="col-span-2 rounded-xl border bg-background/90 p-2.5 flex items-center gap-2">
                      <Package className="h-5 w-5 text-primary" />
                      <div>
                        <div className="text-[10px] text-muted-foreground font-bold uppercase">
                          {identifiedReward.rewardItem?.category === "card_pack"
                            ? "Pacote de Cartas"
                            : "Baú de Recompensa"}
                        </div>
                        <div className="font-display text-xs font-black text-foreground">
                          {identifiedReward.rewardItem
                            ? `${identifiedReward.rewardItem.quantity}x ${identifiedReward.rewardItem.label}`
                            : `${identifiedReward.chestQuantity ?? 1}x ${identifiedReward.chestName}`}
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </div>

              <div className="flex gap-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setStep("input")}
                  disabled={loading}
                  className="rounded-xl h-11 px-4 font-bold"
                >
                  Voltar
                </Button>
                <Button
                  type="button"
                  onClick={handleClaim}
                  disabled={loading}
                  className="flex-1 rounded-xl h-11 font-display font-extrabold gap-2 bg-emerald-600 hover:bg-emerald-700 text-white shadow-md cursor-pointer"
                >
                  {loading ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" /> Resgatando...
                    </>
                  ) : (
                    <>
                      <CheckCircle2 className="h-4 w-4" /> Confirmar Resgate
                    </>
                  )}
                </Button>
              </div>
            </div>
          )}

          {/* SUCESSO: RECOMPENSA CONCEDIDA COM LOOPING */}
          {step === "success" && (
            <div className="space-y-4 text-center py-2 animate-fade-in">
              <div className="inline-flex h-14 w-14 items-center justify-center rounded-full bg-emerald-500/20 text-emerald-500 mb-1">
                <CheckCircle2 className="h-8 w-8" />
              </div>

              <h4 className="font-display text-lg font-black text-foreground">
                Recompensa Resgatada com Sucesso!
              </h4>
              <p className="text-xs text-muted-foreground max-w-xs mx-auto">
                Os prêmios do código <span className="font-mono font-bold text-foreground">{confirmedCode}</span> já foram creditados na sua conta.
              </p>

              <div className="flex flex-col sm:flex-row gap-2 pt-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={resetForm}
                  className="flex-1 rounded-xl h-11 font-bold gap-1.5"
                >
                  <RotateCcw className="h-4 w-4" /> Resgatar Outro Código
                </Button>
                <Button
                  type="button"
                  onClick={() => handleClose(false)}
                  className="flex-1 rounded-xl h-11 font-bold bg-secondary hover:bg-secondary/80 text-foreground"
                >
                  Concluir / Fechar
                </Button>
              </div>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
