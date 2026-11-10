import { useState } from "react";
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
  Package,
  Camera,
  Loader2,
} from "lucide-react";
import {
  inspectPromoCode,
  claimPromoCode,
  normalizePromoCodeInput,
  type PromoCodeRewardPayload,
} from "@/lib/promo-codes";
import { usePlayerAuth } from "@/lib/player-auth";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onRewardClaimed?: () => void;
}

type RedeemStep = "input" | "preview" | "success";

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

  function resetForm() {
    setStep("input");
    setCodeInput("");
    setErrorMsg(null);
    setIdentifiedReward(null);
    setConfirmedCode("");
    setLoading(false);
    setScannerOpen(false);
  }

  function handleClose(v: boolean) {
    if (!v) resetForm();
    onOpenChange(v);
  }

  // Etapa 1: Inspeciona a prévia do código
  async function handleInspect(e?: React.FormEvent) {
    if (e) e.preventDefault();
    if (!profile) return;
    setErrorMsg(null);

    const clean = normalizePromoCodeInput(codeInput);
    if (!clean) {
      setErrorMsg("Digite o código promocional.");
      return;
    }

    setLoading(true);
    try {
      const res = inspectPromoCode(codeInput, profile.id);
      if (!res.valid) {
        setErrorMsg(res.errorMessage || "Código inválido ou expirado.");
        return;
      }
      setConfirmedCode(res.code || codeInput.trim().toUpperCase());
      setIdentifiedReward(res.rewards || null);
      setStep("preview");
    } finally {
      setLoading(false);
    }
  }

  // Etapa 2: Confirmação e Resgate Atômico
  async function handleClaim() {
    if (!profile) return;
    setLoading(true);
    setErrorMsg(null);

    try {
      const res = claimPromoCode(confirmedCode || codeInput, profile);
      if (!res.success) {
        setErrorMsg(res.errorMessage || "Falha ao resgatar o código.");
        return;
      }

      // Atualiza o estado da autenticação local
      if (res.updatedProfile) {
        await auth.refresh();
      }
      onRewardClaimed?.();
      setStep("success");
    } finally {
      setLoading(false);
    }
  }

  // Simulação amigável de scanner com prompt de colagem ou arquivo
  function handleTriggerScanner() {
    const pasted = window.prompt("Cole a URL ou código escaneado do QR Code:");
    if (pasted) {
      // Se for URL (ex: https://.../?code=A124C-D123A), extrai o código
      const match = pasted.match(/[?&]c(ode)?=([A-Za-z0-9-]+)/i);
      const codeExtracted = match ? match[2] : pasted;
      setCodeInput(codeExtracted.toUpperCase());
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-md rounded-3xl p-6 border shadow-2xl bg-background overflow-hidden">
        <DialogHeader className="border-b pb-3">
          <DialogTitle className="flex items-center gap-2 font-display text-xl font-black text-foreground">
            <Ticket className="h-6 w-6 text-fuchsia-500" />
            Resgatar Código Promocional
            <span className="rounded-full bg-fuchsia-500/20 text-fuchsia-600 dark:text-fuchsia-400 px-2 py-0.5 text-[10px] font-black uppercase">
              Beta
            </span>
          </DialogTitle>
        </DialogHeader>

        <div className="py-2 space-y-4">
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
                    onClick={handleTriggerScanner}
                    className="rounded-xl h-11 px-3 border-fuchsia-500/40 text-fuchsia-600 dark:text-fuchsia-400 hover:bg-fuchsia-500/10"
                    title="Ler QR Code ou colar link do cartão"
                  >
                    <Camera className="h-4 w-4" />
                  </Button>
                </div>
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
                      <Coins className="h-5 w-5 text-yellow-500" />
                      <div>
                        <div className="text-[10px] text-muted-foreground font-bold uppercase">Moedas</div>
                        <div className="font-display text-sm font-black text-yellow-500">+{identifiedReward.points} pts</div>
                      </div>
                    </div>
                  )}

                  {identifiedReward.chestName && (
                    <div className="col-span-2 rounded-xl border bg-background/90 p-2.5 flex items-center gap-2">
                      <Package className="h-5 w-5 text-primary" />
                      <div>
                        <div className="text-[10px] text-muted-foreground font-bold uppercase">Baú de Recompensa</div>
                        <div className="font-display text-xs font-black text-foreground">
                          {identifiedReward.chestQuantity ?? 1}x {identifiedReward.chestName}
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
