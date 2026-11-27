import { useEffect, useMemo, useState } from "react";
import { LogIn, UserPlus, Loader2, Lock, Eye, EyeOff, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { usePlayerAuth } from "@/lib/player-auth";
import { isPlayFabConfigured, getPlayFabTitleId, isAdminUnlockedSession } from "@/lib/playfab";
import {
  abbreviateStudentName,
  AGE_STAGES,
  formatFullNameUpper,
  is5thGradeSchool,
  isAdminOrTestAccount,
  isSecondStageSchool,
  RAIMUNDO_GRADES,
  schoolNeedsGrade,
  SCHOOLS,
  type AgeStageId,
} from "@/lib/player-profile";
import { LegalModal, type LegalTab } from "./LegalModal";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}

export function PlayerAuthDialog({ open, onOpenChange }: Props) {
  const auth = usePlayerAuth();
  const isPrivileged = isAdminUnlockedSession() || isAdminOrTestAccount(auth.profile);
  const [tab, setTab] = useState<"entrar" | "criar">("entrar");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Login states (Apelido + Senha)
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [showLoginPassword, setShowLoginPassword] = useState(false);

  // Sign-Up states (LGPD-minimized: sem data de nascimento e apenas Primeiro Nome + Inicial)
  const [nick, setNick] = useState("");
  const [fullName, setFullName] = useState("");
  const [signupPassword, setSignupPassword] = useState("");
  const [showSignupPassword, setShowSignupPassword] = useState(false);
  const [ageStage, setAgeStage] = useState<AgeStageId>("etapa_1");
  const [school, setSchool] = useState<string>(SCHOOLS[0].name);
  const [grade, setGrade] = useState<string>(RAIMUNDO_GRADES[0]);
  const [turma, setTurma] = useState<string>("");
  const [lgpdAccepted, setLgpdAccepted] = useState(false);

  // Modal de LGPD / Termos
  const [legalOpen, setLegalOpen] = useState(false);
  const [legalTab, setLegalTab] = useState<LegalTab>("privacidade");

  useEffect(() => {
    if (!open) {
      setError(null);
      setShowLoginPassword(false);
      setShowSignupPassword(false);
    } else if (auth.profile && auth.cloudSessionExpired) {
      setTab("entrar");
      setIdentifier(auth.profile.nick || "");
      setPassword("");
      setError(null);
    }
  }, [open, auth.profile, auth.cloudSessionExpired]);

  const availableSchools = useMemo(() => {
    if (ageStage === "etapa_3") {
      return SCHOOLS.filter((s) => s.name === "Nenhuma" || s.name === "Outro");
    }
    if (ageStage === "etapa_2") {
      return SCHOOLS.filter((s) => !is5thGradeSchool(s.name));
    }
    return SCHOOLS.filter((s) => !isSecondStageSchool(s.name));
  }, [ageStage]);

  const isNoSchoolOrCommunity = school === "Nenhuma" || school === "Outro" || ageStage === "etapa_3";
  const abbreviatedPreview = useMemo(() => abbreviateStudentName(fullName), [fullName]);

  useEffect(() => {
    if (!availableSchools.some((s) => s.name === school)) {
      setSchool(availableSchools[0]?.name ?? "Nenhuma");
      setTurma("");
    }
  }, [availableSchools, school]);

  function openLegal(targetTab: LegalTab) {
    setLegalTab(targetTab);
    setLegalOpen(true);
  }

  async function submitLoginOrSignup(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (tab === "entrar") {
      setBusy(true);
      const res = await auth.signIn(identifier, password);
      setBusy(false);

      if (res.error) {
        setError(res.error);
        return;
      }

      setPassword("");
      onOpenChange(false);
      return;
    }

    // Tab === "criar"
    if (signupPassword.trim().length < 6) {
      setError("A senha deve ter pelo menos 6 caracteres (ex: 6 dígitos).");
      return;
    }
    if (!lgpdAccepted) {
      setError("Confirme a ciência e autorização dos Termos de Uso e Política de Privacidade (LGPD).");
      return;
    }

    const resolvedSchool = ageStage === "etapa_3" ? "Nenhuma" : school;
    const isNoSchool = resolvedSchool === "Nenhuma" || resolvedSchool === "Outro" || ageStage === "etapa_3";
    const finalGrade = isNoSchool ? null : schoolNeedsGrade(resolvedSchool) ? grade : "5º ano";
    const finalTurma = isNoSchool ? null : turma.trim() || null;

    setBusy(true);
    const res = await auth.signUp({
      nick,
      password: signupPassword.trim(),
      fullName: abbreviatedPreview || fullName,
      school: resolvedSchool,
      grade: finalGrade,
      turma: finalTurma,
      ageStage,
      lgpdConsent: {
        acceptedAt: new Date().toISOString(),
        policyVersion: "2026-01",
        guardianDeclared: true,
      },
    });
    setBusy(false);

    if (res.error) {
      setError(res.error);
      return;
    }

    setSignupPassword("");
    onOpenChange(false);
  }

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-h-[90vh] overflow-y-auto rounded-3xl sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="font-display text-2xl font-extrabold">
              {tab === "entrar" ? "Entrar na sua conta" : "Criar seu perfil de jogador"}
            </DialogTitle>
          </DialogHeader>

          <div className="grid grid-cols-2 gap-2 rounded-2xl bg-secondary p-1">
            {(["entrar", "criar"] as const).map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => {
                  setTab(t);
                  setError(null);
                }}
                className={`rounded-xl py-2 text-sm font-bold transition-colors ${
                  tab === t
                    ? "bg-card text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {t === "entrar" ? "Entrar" : "Criar Conta"}
              </button>
            ))}
          </div>

          <form onSubmit={submitLoginOrSignup} className="space-y-4">
            {tab === "entrar" ? (
              <>
                {auth.profile && auth.cloudSessionExpired && (
                  <div className="rounded-xl border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs font-semibold text-amber-700 dark:text-amber-300">
                    🔑 Sua sessão na nuvem expirou (limite de 24h). Digite sua senha para renovar o login sem perder seus dados.
                  </div>
                )}
                <div className="space-y-1.5">
                  <Label htmlFor="identifier">Seu Apelido (nick)</Label>
                  <Input
                    id="identifier"
                    value={identifier}
                    onChange={(e) => setIdentifier(e.target.value)}
                    placeholder="EX: JOAO_LOGICA"
                    autoComplete="username"
                    required
                    className="rounded-xl font-semibold"
                  />
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="senha">Senha</Label>
                  <div className="relative">
                    <Input
                      id="senha"
                      type={showLoginPassword ? "text" : "password"}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="Digite sua senha (6+ dígitos)"
                      autoComplete="current-password"
                      required
                      className="rounded-xl pr-10 font-mono tracking-wider"
                    />
                    <button
                      type="button"
                      onClick={() => setShowLoginPassword((v) => !v)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                      aria-label="Mostrar ou ocultar senha"
                    >
                      {showLoginPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                  <p className="text-[11px] text-muted-foreground">
                    💡 Use a sua senha cadastrada (mínimo 6 caracteres; para contas antigas, sua senha de 6 dígitos). Caso tenha esquecido, procure seu professor ou a coordenação/ADM para redefinição.
                  </p>
                </div>
              </>
            ) : (
              <>
                <div className="space-y-1.5">
                  <Label htmlFor="nome">Primeiro nome e inicial do sobrenome</Label>
                  <Input
                    id="nome"
                    value={fullName}
                    onChange={(e) => setFullName(formatFullNameUpper(e.target.value))}
                    placeholder="EX: MARIA S. (OU MARIA SILVA)"
                    required
                    className="rounded-xl uppercase font-semibold"
                  />
                  {abbreviatedPreview && (
                    <p className="text-[11px] text-muted-foreground">
                      🔒 Por privacidade (LGPD), será salvo apenas como:{" "}
                      <b className="text-foreground">{abbreviatedPreview}</b>
                    </p>
                  )}
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="nick">Escolha um Apelido (nick)</Label>
                  <Input
                    id="nick"
                    value={nick}
                    onChange={(e) => setNick(e.target.value)}
                    placeholder="ex: joao_logica"
                    autoComplete="username"
                    required
                    className="rounded-xl"
                  />
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="signup-senha">Crie uma Senha (mínimo 6 caracteres)</Label>
                  <div className="relative">
                    <Input
                      id="signup-senha"
                      type={showSignupPassword ? "text" : "password"}
                      value={signupPassword}
                      onChange={(e) => setSignupPassword(e.target.value)}
                      placeholder="Ex: 6 dígitos fáceis de lembrar"
                      autoComplete="new-password"
                      minLength={6}
                      required
                      className="rounded-xl pr-10 font-mono tracking-wider"
                    />
                    <button
                      type="button"
                      onClick={() => setShowSignupPassword((v) => !v)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                      aria-label="Mostrar ou ocultar senha"
                    >
                      {showSignupPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="etapa">Etapa / Ciclo Escolar</Label>
                  <select
                    id="etapa"
                    value={ageStage}
                    onChange={(e) => setAgeStage(e.target.value as AgeStageId)}
                    className="h-10 w-full rounded-xl border bg-background px-3 text-sm font-semibold"
                  >
                    {AGE_STAGES.map((st) => (
                      <option key={st.id} value={st.id}>
                        {st.emoji} {st.shortLabel} — {st.schoolCycleLabel}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="escola">Instituição (Escola)</Label>
                  <select
                    id="escola"
                    value={school}
                    onChange={(e) => {
                      const val = e.target.value;
                      setSchool(val);
                      if (val === "Nenhuma" || val === "Outro") {
                        setTurma("");
                      }
                    }}
                    className="h-10 w-full rounded-xl border bg-background px-3 text-sm"
                  >
                    {availableSchools.map((s) => (
                      <option key={s.name} value={s.name}>
                        {s.range ? `${s.name} (${s.range})` : s.name}
                      </option>
                    ))}
                  </select>
                </div>

                {!isNoSchoolOrCommunity && schoolNeedsGrade(school) && (
                  <div className="space-y-1.5">
                    <Label htmlFor="serie">Série / Ano</Label>
                    <select
                      id="serie"
                      value={grade}
                      onChange={(e) => setGrade(e.target.value)}
                      className="h-10 w-full rounded-xl border bg-background px-3 text-sm"
                    >
                      {RAIMUNDO_GRADES.map((g) => (
                        <option key={g} value={g}>
                          {g}
                        </option>
                      ))}
                    </select>
                  </div>
                )}

                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <Label
                      htmlFor="turma"
                      className={
                        isNoSchoolOrCommunity
                          ? "text-muted-foreground flex items-center gap-1.5"
                          : ""
                      }
                    >
                      {isNoSchoolOrCommunity && <Lock className="h-3.5 w-3.5 text-muted-foreground" />}
                      Turma (A até F)
                    </Label>
                    {isNoSchoolOrCommunity && (
                      <span className="text-[11px] font-semibold text-muted-foreground">
                        Travada (Não se aplica)
                      </span>
                    )}
                  </div>
                  <select
                    id="turma"
                    value={isNoSchoolOrCommunity ? "" : turma}
                    onChange={(e) => setTurma(e.target.value)}
                    disabled={isNoSchoolOrCommunity}
                    aria-disabled={isNoSchoolOrCommunity}
                    className={`h-10 w-full rounded-xl border px-3 text-sm font-semibold transition-colors ${
                      isNoSchoolOrCommunity
                        ? "bg-muted/50 text-muted-foreground cursor-not-allowed border-dashed opacity-75"
                        : "bg-background text-foreground"
                    }`}
                  >
                    {isNoSchoolOrCommunity ? (
                      <option value="">Sem Turma (Travada)</option>
                    ) : (
                      <>
                        <option value="">Selecione a turma...</option>
                        {["A", "B", "C", "D", "E", "F"].map((t) => (
                          <option key={t} value={t}>
                            Turma {t}
                          </option>
                        ))}
                      </>
                    )}
                  </select>
                </div>

                <div className="flex items-start gap-2.5 rounded-2xl border bg-muted/30 p-3">
                  <Checkbox
                    id="lgpd-consent"
                    checked={lgpdAccepted}
                    onCheckedChange={(v) => setLgpdAccepted(v === true)}
                    className="mt-0.5"
                  />
                  <label
                    htmlFor="lgpd-consent"
                    className="text-[11px] leading-relaxed text-muted-foreground cursor-pointer"
                  >
                    Li e concordo com os{" "}
                    <button
                      type="button"
                      onClick={() => openLegal("termos")}
                      className="font-bold text-primary underline"
                    >
                      Termos de Uso
                    </button>{" "}
                    e a{" "}
                    <button
                      type="button"
                      onClick={() => openLegal("privacidade")}
                      className="font-bold text-primary underline"
                    >
                      Política de Privacidade (LGPD)
                    </button>
                    , declarando ciência e autorização do responsável legal para participação do(a) estudante.
                  </label>
                </div>
              </>
            )}

            {error && (
              <p className="rounded-xl bg-destructive/15 px-3 py-2 text-sm font-semibold text-destructive">
                {error}
              </p>
            )}

            <Button
              type="submit"
              size="lg"
              disabled={busy}
              className="h-12 w-full rounded-2xl text-base font-bold"
            >
              {busy ? (
                <Loader2 className="mr-2 h-5 w-5 animate-spin" />
              ) : tab === "entrar" ? (
                <LogIn className="mr-2 h-5 w-5" />
              ) : (
                <UserPlus className="mr-2 h-5 w-5" />
              )}
              {tab === "entrar" ? "Entrar e jogar" : "Criar perfil e jogar"}
            </Button>
          </form>

          <div className="pt-2 text-center text-[11px] text-muted-foreground flex flex-wrap items-center justify-center gap-x-2 gap-y-1 border-t border-border/40">
            <span className="inline-flex items-center gap-1.5">
              <span
                className={`inline-block h-2 w-2 rounded-full ${
                  isPlayFabConfigured() ? "bg-emerald-500 animate-pulse" : "bg-amber-500"
                }`}
              />
              {isPlayFabConfigured()
                ? isPrivileged
                  ? `Nuvem PlayFab Conectada (${getPlayFabTitleId()})`
                  : "Sincronização em Nuvem Ativa"
                : "Modo Local / Offline-First"}
            </span>
            <span>•</span>
            <button
              type="button"
              onClick={() => openLegal("privacidade")}
              className="inline-flex items-center gap-1 font-semibold text-primary hover:underline"
            >
              <ShieldCheck className="h-3 w-3" />
              Privacidade & LGPD
            </button>
          </div>
        </DialogContent>
      </Dialog>

      <LegalModal open={legalOpen} onOpenChange={setLegalOpen} defaultTab={legalTab} />
    </>
  );
}
