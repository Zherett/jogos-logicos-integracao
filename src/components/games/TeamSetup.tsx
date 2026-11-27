import { Users, User, Shuffle, ListOrdered, ChevronUp, ChevronDown } from "lucide-react";
import { OptionChip } from "./StartScreen";
import {
  DEFAULT_TEAMS,
  TEAM_NAME_MAX,
  sanitizeTeamName,
  type TeamConfig,
  type TeamOrderMode,
} from "@/lib/teams";
import { useState } from "react";

interface Props {
  value: TeamConfig;
  onChange: (c: TeamConfig) => void;
  /** Locked while a session is running (order must stay until "Finalizar jogo"). */
  locked?: boolean;
}

/** Pre-game selector: modo normal x equipes (padrão ou personalizada) + ordem. */
export function TeamSetup({ value, onChange, locked }: Props) {
  const [preset, setPreset] = useState<"padrao" | "custom">("padrao");
  const [customNames, setCustomNames] = useState<string[]>(["EQUIPE 1", "EQUIPE 2"]);

  function pickNormal() {
    if (locked) return;
    onChange({ mode: "normal", teams: [], order: value.order });
  }
  function pickTeams(kind: "padrao" | "custom", names?: string[]) {
    if (locked) return;
    setPreset(kind);
    const list = kind === "padrao" ? DEFAULT_TEAMS : (names ?? customNames);
    onChange({ mode: "equipes", teams: list.map(sanitizeTeamName), order: value.order });
  }
  function setOrderMode(order: TeamOrderMode) {
    if (locked) return;
    onChange({ ...value, order });
  }
  function setCount(n: number) {
    if (locked) return;
    const next = Array.from({ length: n }, (_, i) => customNames[i] ?? `EQUIPE ${i + 1}`);
    setCustomNames(next);
    pickTeams("custom", next);
  }
  function setName(i: number, name: string) {
    if (locked) return;
    const next = [...customNames];
    next[i] = name.slice(0, TEAM_NAME_MAX);
    setCustomNames(next);
    onChange({ mode: "equipes", teams: next.map(sanitizeTeamName), order: value.order });
  }
  function move(i: number, dir: -1 | 1) {
    if (locked) return;
    const j = i + dir;
    if (j < 0 || j >= value.teams.length) return;
    const next = [...value.teams];
    [next[i], next[j]] = [next[j], next[i]];
    onChange({ ...value, teams: next });
  }

  const isTeams = value.mode === "equipes";

  return (
    <div className="rounded-2xl border bg-secondary/30 p-4">
      <div className="text-sm font-semibold uppercase tracking-wider text-muted-foreground mb-3 text-center">
        Modo de jogo {locked ? "• 🔒 Travado na sessão ativa" : ""}
      </div>
      <div className="grid grid-cols-2 gap-2">
        <OptionChip active={!isTeams} onClick={pickNormal} disabled={locked}>
          <span className="inline-flex items-center gap-2"><User className="h-4 w-4" /> Normal</span>
        </OptionChip>
        <OptionChip active={isTeams} onClick={() => pickTeams(preset)} disabled={locked}>
          <span className="inline-flex items-center gap-2"><Users className="h-4 w-4" /> Equipes</span>
        </OptionChip>
      </div>

      {isTeams && (
        <div className="mt-4 space-y-3">
          <div className="grid grid-cols-2 gap-2">
            <OptionChip active={preset === "padrao"} onClick={() => pickTeams("padrao")} disabled={locked}>
              Equipe padrão
            </OptionChip>
            <OptionChip active={preset === "custom"} onClick={() => pickTeams("custom")} disabled={locked}>
              Personalizada
            </OptionChip>
          </div>

          {preset === "padrao" ? (
            <div className="flex flex-wrap justify-center gap-2">
              {DEFAULT_TEAMS.map((t) => (
                <span key={t} className="rounded-full bg-primary/10 px-3 py-1 text-xs font-bold text-primary">
                  {t}
                </span>
              ))}
            </div>
          ) : (
            <div className="space-y-3">
              <div className="text-xs uppercase tracking-wider text-muted-foreground text-center">
                Quantidade de equipes
              </div>
              <div className="grid grid-cols-4 gap-2">
                {[2, 3, 4, 5].map((n) => (
                  <OptionChip key={n} active={customNames.length === n} onClick={() => setCount(n)} disabled={locked}>
                    {n}
                  </OptionChip>
                ))}
              </div>
              <div className="grid gap-2 sm:grid-cols-2">
                {customNames.map((n, i) => (
                  <input
                    key={i}
                    value={n}
                    maxLength={TEAM_NAME_MAX}
                    disabled={locked}
                    onChange={(e) => setName(i, e.target.value)}
                    placeholder={`Equipe ${i + 1}`}
                    className="rounded-xl border-2 bg-card px-3 py-2 font-display font-bold outline-none focus:border-primary disabled:opacity-50"
                  />
                ))}
              </div>
              <div className="text-center text-xs text-muted-foreground">
                Até {TEAM_NAME_MAX} caracteres por nome
              </div>
            </div>
          )}

          <div className="pt-1">
            <div className="text-xs uppercase tracking-wider text-muted-foreground text-center mb-2">
              Ordem das equipes
            </div>
            <div className="grid grid-cols-2 gap-2">
              <OptionChip active={value.order === "aleatoria"} onClick={() => setOrderMode("aleatoria")} disabled={locked}>
                <span className="inline-flex items-center gap-2"><Shuffle className="h-4 w-4" /> Aleatória</span>
              </OptionChip>
              <OptionChip active={value.order === "manual"} onClick={() => setOrderMode("manual")} disabled={locked}>
                <span className="inline-flex items-center gap-2"><ListOrdered className="h-4 w-4" /> Criar ordem</span>
              </OptionChip>
            </div>

            {value.order === "manual" && (
              <div className="mt-3 space-y-2">
                <div className="text-center text-xs text-muted-foreground">
                  Quem joga primeiro fica no topo
                </div>
                {value.teams.map((t, i) => (
                  <div
                    key={t + i}
                    className="flex items-center gap-2 rounded-xl border-2 bg-card px-3 py-2"
                  >
                    <span className="grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-primary/10 font-display text-sm font-bold text-primary">
                      {i + 1}
                    </span>
                    <span className="min-w-0 flex-1 truncate font-display font-bold">{t}</span>
                    <button
                      type="button"
                      onClick={() => move(i, -1)}
                      disabled={locked || i === 0}
                      className="grid h-7 w-7 place-items-center rounded-lg border bg-background disabled:opacity-30"
                      aria-label="Subir"
                    >
                      <ChevronUp className="h-4 w-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => move(i, 1)}
                      disabled={locked || i === value.teams.length - 1}
                      className="grid h-7 w-7 place-items-center rounded-lg border bg-background disabled:opacity-30"
                      aria-label="Descer"
                    >
                      <ChevronDown className="h-4 w-4" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {locked && (
            <div className="rounded-xl bg-accent/10 px-3 py-2 text-center text-xs font-semibold text-accent">
              Partida em andamento — a ordem e o placar seguem até "Finalizar jogo".
            </div>
          )}
        </div>
      )}
    </div>
  );
}
