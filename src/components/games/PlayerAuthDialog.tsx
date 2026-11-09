import { useEffect, useState } from "react";
import { LogIn, UserPlus, Loader2, KeyRound, CheckCircle2, Sparkles, HelpCircle, Lock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { usePlayerAuth } from "@/lib/player-auth";
import { isPlayFabConfigured, getPlayFabTitleId, isAdminUnlockedSession } from "@/lib/playfab";
import {
  ageFrom,
  formatFullNameUpper,
  getAvailableSchoolsForAge,
  isAdminOrTestAccount,
  is5thGradeSchool,
  isEtapa3OrOlder,
  isOfficialSemedSchool,
  passwordFromBirthdate,
  RAIMUNDO_GRADES,
  schoolNeedsGrade,
  SCHOOLS,
  stageFromBirthdate,
} from "@/lib/player-profile";

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

  // Login states (Nick OR Full Name + Birthdate password DDMMYY)
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");

  // Fallback / Recovery states (Full Name + Birthdate selector)
  const [recoveryMode, setRecoveryMode] = useState(false);
  const [recoveryFullName, setRecoveryFullName] = useState("");
  const [recoveryBirthdate, setRecoveryBirthdate] = useState("");
  const [recoveredBanner, setRecoveredBanner] = useState<{
    nick: string;
    passwordHint: string;
  } | null>(null);

  // Sign-Up states
  const [nick, setNick] = useState("");
  const [fullName, setFullName] = useState("");
  const [school, setSchool] = useState<string>("Nenhuma");
  const [grade, setGrade] = useState<string>(RAIMUNDO_GRADES[0]);
  const [turma, setTurma] = useState<string>("");
  const [birthdate, setBirthdate] = useState("");

  useEffect(() => {
    if (!open) {
      setError(null);
      setRecoveryMode(false);
      setRecoveredBanner(null);
    }
  }, [open]);

  const generatedSignupPassword = birthdate ? passwordFromBirthdate(birthdate) : "";
  const calculatedAge = birthdate ? ageFrom(birthdate) : null;
  const isOver15 = birthdate ? isEtapa3OrOlder(birthdate) : (calculatedAge !== null ? calculatedAge >= 17 : false);
  const isOver11 = calculatedAge !== null ? calculatedAge > 11 : false;
  const availableSchools = getAvailableSchoolsForAge(birthdate);
  const isNoSchoolOrCommunity = school === "Nenhuma" || school === "Outro" || isOver15;

  // Auto-reset school and turma if current selection is not available for this age
  useEffect(() => {
    if (!availableSchools.some((s) => s.name === school)) {
      setSchool("Nenhuma");
      setTurma("");
    }
  }, [availableSchools, school]);

  function handleBirthdateChange(val: string) {
    setBirthdate(val);
    if (isEtapa3OrOlder(val)) {
      if (isOfficialSemedSchool(school)) {
        setSchool("Nenhuma");
      }
      setTurma("");
    } else if (val) {
      const age = ageFrom(val);
      if (age > 11) {
        if (is5thGradeSchool(school)) {
          setSchool("Nenhuma");
          setTurma("");
        }
      }
    }
  }

  async function submitLoginOrSignup(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);

    if (tab === "entrar") {
      const res = await auth.signIn(identifier, password);
      setBusy(false);

      if (res.error) {
        setError(res.error);
        if (res.needsRecovery) {
          // Pre-fill full name if the student already typed a name with spaces
          if (identifier.trim().includes(" ") && !recoveryFullName) {
            setRecoveryFullName(identifier.trim());
          }
          setRecoveryMode(true);
        }
        return;
      }

      if (res.recoveredNick) {
        setRecoveredBanner({
          nick: res.recoveredNick,
          passwordHint: passwordFromBirthdate(password),
        });
        return;
      }

      setPassword("");
      onOpenChange(false);
      return;
    }

    // Tab === "criar"
    const submitAge = birthdate ? ageFrom(birthdate) : 0;
    const isPlayerOver15 = isEtapa3OrOlder(birthdate);
    const isPlayerOver11 = submitAge > 11;
    let resolvedSchool = school;
    if (isPlayerOver15 && isOfficialSemedSchool(school)) {
      resolvedSchool = "Nenhuma";
    } else if (isPlayerOver11 && is5thGradeSchool(school)) {
      resolvedSchool = "Nenhuma";
    }
    const isNoSchool = resolvedSchool === "Nenhuma" || resolvedSchool === "Outro" || isPlayerOver15;
    const finalGrade = isNoSchool ? null : (schoolNeedsGrade(resolvedSchool) ? grade : "5º ano");
    const finalTurma = isNoSchool ? null : (turma.trim() || null);

    const res = await auth.signUp({
      nick,
      fullName,
      school: resolvedSchool,
      grade: finalGrade,
      turma: finalTurma,
      birthdate,
    });
    setBusy(false);

    if (res.error) {
      setError(res.error);
      return;
    }

    if (res.recoveredNick) {
      setRecoveredBanner({
        nick: res.recoveredNick,
        passwordHint: generatedSignupPassword,
      });
      return;
    }

    onOpenChange(false);
  }

  async function submitRecovery(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);

    const res = await auth.recoverByNameAndBirthdate(recoveryFullName, recoveryBirthdate);
    setBusy(false);

    if (res.error) {
      setError(res.error);
      return;
    }

    setRecoveredBanner({
      nick: res.recoveredNick ?? auth.profile?.nick ?? "",
      passwordHint: res.derivedPassword ?? passwordFromBirthdate(recoveryBirthdate),
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto rounded-3xl sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="font-display text-2xl font-extrabold">
            {recoveredBanner
              ? "Conta Conectada!"
              : tab === "entrar"
                ? "Entrar na sua conta"
                : "Criar seu perfil de jogador"}
          </DialogTitle>
        </DialogHeader>

        {/* Banner shown when the student logs in via Full Name + Birthdate recovery */}
        {recoveredBanner ? (
          <div className="space-y-4 py-2">
            <div className="rounded-2xl border border-success/40 bg-success/10 p-4 text-center space-y-2">
              <CheckCircle2 className="mx-auto h-10 w-10 text-success" />
              <p className="font-display text-lg font-extrabold text-foreground">
                Encontramos sua conta e você já está logado!
              </p>
              <p className="text-xs text-muted-foreground">
                Anote seus dados de acesso para as próximas aulas:
              </p>
              <div className="mt-2 grid grid-cols-2 gap-2 rounded-xl bg-card p-3 text-left border">
                <div>
                  <span className="block text-[11px] font-bold uppercase text-muted-foreground">
                    Seu Apelido (Nick)
                  </span>
                  <span className="font-display text-base font-extrabold text-primary">
                    {recoveredBanner.nick}
                  </span>
                </div>
                <div>
                  <span className="block text-[11px] font-bold uppercase text-muted-foreground">
                    Sua Senha (Nascimento)
                  </span>
                  <span className="font-mono text-base font-extrabold text-accent">
                    {recoveredBanner.passwordHint}
                  </span>
                </div>
              </div>
            </div>

            <Button
              type="button"
              size="lg"
              onClick={() => {
                setRecoveredBanner(null);
                onOpenChange(false);
              }}
              className="h-12 w-full rounded-2xl text-base font-bold"
            >
              Continuar e Jogar!
            </Button>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-2 gap-2 rounded-2xl bg-secondary p-1">
              {(["entrar", "criar"] as const).map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => {
                    setTab(t);
                    setError(null);
                    setRecoveryMode(false);
                  }}
                  className={`rounded-xl py-2 text-sm font-bold transition-colors ${
                    tab === t ? "bg-card text-primary shadow-sm" : "text-muted-foreground"
                  }`}
                >
                  {t === "entrar" ? "Já tenho conta" : "Criar perfil"}
                </button>
              ))}
            </div>

            {/* TAB: ENTRAR — Modo Recuperação por Nome Completo + Data de Nascimento */}
            {tab === "entrar" && recoveryMode ? (
              <form onSubmit={submitRecovery} className="space-y-3">
                <div className="rounded-2xl border border-primary/30 bg-primary/5 p-3.5 text-xs space-y-1">
                  <div className="font-display text-sm font-extrabold text-primary flex items-center gap-1.5">
                    <Sparkles className="h-4 w-4" /> Entrar com Nome Completo e Aniversário
                  </div>
                  <p className="text-muted-foreground">
                    Esqueceu seu apelido ou errou a senha? Digite seu <b>nome completo</b> e
                    selecione sua <b>data de nascimento</b> para entrar automaticamente e ver seu
                    apelido!
                  </p>
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="rec-nome">Seu Nome Completo</Label>
                  <Input
                    id="rec-nome"
                    value={recoveryFullName}
                    onChange={(e) => setRecoveryFullName(formatFullNameUpper(e.target.value))}
                    placeholder="EX: MARIA CLARA SOUZA"
                    required
                    autoFocus
                    className="rounded-xl uppercase font-semibold"
                  />
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="rec-nasc">Sua Data de Nascimento</Label>
                  <Input
                    id="rec-nasc"
                    type="date"
                    value={recoveryBirthdate}
                    onChange={(e) => setRecoveryBirthdate(e.target.value)}
                    required
                    className="rounded-xl"
                  />
                </div>

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
                  ) : (
                    <LogIn className="mr-2 h-5 w-5" />
                  )}
                  Encontrar minha conta e entrar
                </Button>

                <button
                  type="button"
                  onClick={() => {
                    setRecoveryMode(false);
                    setError(null);
                  }}
                  className="w-full text-center text-xs font-semibold text-muted-foreground hover:text-primary"
                >
                  ← Voltar para o login com apelido e senha
                </button>
              </form>
            ) : (
              /* TAB: ENTRAR (Padrão) ou CRIAR PERFIL */
              <form onSubmit={submitLoginOrSignup} className="space-y-3">
                {tab === "entrar" ? (
                  <>
                    <div className="space-y-1.5">
                      <Label htmlFor="identifier">Apelido (nick) ou Nome completo</Label>
                      <Input
                        id="identifier"
                        value={identifier}
                        onChange={(e) => setIdentifier(formatFullNameUpper(e.target.value))}
                        placeholder="EX: JOAO_LOGICA OU JOÃO PEDRO SILVA"
                        autoComplete="username"
                        required
                        className="rounded-xl uppercase font-semibold"
                      />
                    </div>

                    <div className="space-y-1.5">
                      <Label htmlFor="senha">
                        Senha (sua data de nascimento — ex: <b>200114</b>)
                      </Label>
                      <Input
                        id="senha"
                        type="text"
                        inputMode="numeric"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        placeholder="Ex: 200114 (para 20/01/2014)"
                        autoComplete="current-password"
                        required
                        className="rounded-xl font-mono tracking-wider"
                      />
                      <p className="text-[11px] text-muted-foreground">
                        💡 Exemplo: se você nasceu em <b>20/01/2014</b>, sua senha é{" "}
                        <b>200114</b> (dia + mês + últimos 2 dígitos do ano).
                      </p>
                    </div>
                  </>
                ) : (
                  <>
                    <div className="space-y-1.5">
                      <Label htmlFor="nome">Nome completo</Label>
                      <Input
                        id="nome"
                        value={fullName}
                        onChange={(e) => setFullName(formatFullNameUpper(e.target.value))}
                        placeholder="SEU NOME E SOBRENOME"
                        required
                        className="rounded-xl uppercase font-semibold"
                      />
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
                      <Label htmlFor="nascimento">Data de nascimento</Label>
                      <Input
                        id="nascimento"
                        type="date"
                        value={birthdate}
                        onChange={(e) => handleBirthdateChange(e.target.value)}
                        required
                        className="rounded-xl"
                      />
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

                    {isOver15 ? (
                      <div className="rounded-xl border border-accent/40 bg-accent/10 p-2.5 text-xs text-accent-foreground font-medium">
                        ℹ️ Pela sua data de nascimento (nascidos antes de 2010 • 3ª Etapa), você participa na categoria <b>Comunidade / Outro</b>. As escolas municipais da SEMED (5º ao 9º ano) são restritas para alunos do Ensino Fundamental.
                      </div>
                    ) : isOver11 ? (
                      <div className="rounded-xl border border-primary/30 bg-primary/10 p-2.5 text-xs text-primary font-medium">
                        ℹ️ Alunos da <b>2ª Etapa (6º ao 9º ano • nascidos até dez/2010)</b> não podem selecionar escolas de 5º ano. Para os anos finais, selecione uma escola da 2ª Etapa (<b>Raimundo Bezerra</b> ou <b>Agenor Smith</b>) ou a categoria <b>Outro</b>.
                      </div>
                    ) : null}

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

                    {generatedSignupPassword.length === 6 && (
                      <div className="rounded-2xl border border-primary/30 bg-primary/10 px-3.5 py-2.5 text-xs space-y-1.5">
                        <div className="flex items-center gap-1.5 font-display font-bold text-primary">
                          <KeyRound className="h-4 w-4 shrink-0" />
                          Sua senha automática será:{" "}
                          <span className="rounded-lg bg-card px-2 py-0.5 font-mono text-sm font-extrabold text-foreground">
                            {generatedSignupPassword}
                          </span>
                        </div>
                        <div className="flex flex-wrap items-center gap-1.5 font-display font-bold text-foreground">
                          <Sparkles className="h-3.5 w-3.5 text-accent shrink-0" />
                          Faixa Etária alocada:{" "}
                          <span className="rounded-full bg-card px-2.5 py-0.5 text-[11px] font-extrabold text-primary border border-primary/20 shadow-2xs">
                            {stageFromBirthdate(birthdate, new Date(), school).emoji}{" "}
                            {stageFromBirthdate(birthdate, new Date(), school).label}
                          </span>
                          {calculatedAge !== null && (
                            <span className="text-[11px] font-semibold text-muted-foreground">
                              • Sua idade: <b>{calculatedAge} anos</b>
                            </span>
                          )}
                        </div>
                        <p className="text-[11px] text-muted-foreground">
                          O sistema aloca você automaticamente na sua Etapa de idade para garantir
                          disputas justas no Ranking, no Torneio Semanal e na Arena X1!
                        </p>
                      </div>
                    )}
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

                {tab === "entrar" && (
                  <button
                    type="button"
                    onClick={() => {
                      setRecoveryMode(true);
                      setError(null);
                    }}
                    className="flex w-full items-center justify-center gap-1.5 pt-1 text-xs font-bold text-primary hover:underline"
                  >
                    <HelpCircle className="h-3.5 w-3.5" />
                    Esqueceu o apelido ou errou a senha? Entrar com Nome Completo e Aniversário
                  </button>
                )}
              </form>
            )}
          </>
        )}

        <div className="pt-2 text-center text-[11px] text-muted-foreground flex items-center justify-center gap-1.5 border-t border-border/40">
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
        </div>
      </DialogContent>
    </Dialog>
  );
}
