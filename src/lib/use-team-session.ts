import { useCallback, useRef, useState } from "react";
import { shuffleTeams, type TeamConfig } from "./teams";

export interface TeamSession {
  /** Play order for the current session (empty when there is no session). */
  order: string[];
  scores: number[];
  current: number;
  activeSession: boolean;
  setCurrent: (i: number) => void;
  credit: (delta: number) => void;
  /** Starts (or keeps) a session based on the chosen configuration. */
  begin: (config: TeamConfig) => void;
  /** Moves the turn to the next team in the order. */
  advance: () => void;
  /** Ends the session: order and scores are cleared. */
  finish: () => void;
}

/**
 * Keeps team order and scores alive across rounds until "Finalizar jogo".
 */
export function useTeamSession(): TeamSession {
  const [order, setOrder] = useState<string[]>([]);
  const [scores, setScores] = useState<number[]>([]);
  const [current, setCurrentState] = useState(0);
  const currentRef = useRef(0);
  const orderRef = useRef<string[]>([]);

  const setCurrent = useCallback((i: number) => {
    currentRef.current = i;
    setCurrentState(i);
  }, []);

  const credit = useCallback((delta: number) => {
    if (!delta) return;
    // Capture the owner of the turn before React processes the score update.
    // The turn may advance immediately after credit() (instant cards), so
    // reading currentRef inside the updater could credit the next team.
    const creditedTeam = currentRef.current;
    setScores((s) => {
      if (!s.length) return s;
      const next = [...s];
      const i = Math.min(creditedTeam, next.length - 1);
      next[i] = (next[i] ?? 0) + delta;
      return next;
    });
  }, []);

  const advance = useCallback(() => {
    const o = orderRef.current;
    if (o.length > 1) {
      setCurrent((currentRef.current + 1) % o.length);
    }
  }, [setCurrent]);

  const finish = useCallback(() => {
    orderRef.current = [];
    setOrder([]);
    setScores([]);
    setCurrent(0);
  }, [setCurrent]);

  const begin = useCallback(
    (config: TeamConfig) => {
      if (config.mode !== "equipes" || config.teams.length === 0) {
        finish();
        return;
      }
      const prev = orderRef.current;
      const sameSession =
        prev.length === config.teams.length && prev.every((t) => config.teams.includes(t));
      if (sameSession) {
        setScores((s) => (s.length === config.teams.length ? s : config.teams.map(() => 0)));
        return;
      }
      const nextOrder =
        config.order === "aleatoria" ? shuffleTeams(config.teams) : [...config.teams];
      orderRef.current = nextOrder;
      setOrder(nextOrder);
      setScores(config.teams.map(() => 0));
      setCurrent(0);
    },
    [finish, setCurrent],
  );

  return {
    order,
    scores,
    current,
    activeSession: order.length > 0,
    setCurrent,
    credit,
    begin,
    advance,

    finish,
  };
}
