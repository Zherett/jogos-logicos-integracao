import { useEffect, useState } from "react";

const MUTE_KEY = "desafios-logica-muted-v1";

let memoryMuted = false;

type MuteListener = (muted: boolean) => void;
const listeners = new Set<MuteListener>();

export function isSoundMuted(): boolean {
  if (typeof window === "undefined") return memoryMuted;
  try {
    return window.localStorage.getItem(MUTE_KEY) === "1";
  } catch {
    return memoryMuted;
  }
}

export function setSoundMuted(muted: boolean) {
  memoryMuted = muted;
  if (typeof window !== "undefined") {
    try {
      if (muted) window.localStorage.setItem(MUTE_KEY, "1");
      else window.localStorage.removeItem(MUTE_KEY);
    } catch {
      /* ignore */
    }
  }
  listeners.forEach((fn) => fn(muted));
}

export function toggleSoundMuted(): boolean {
  const next = !isSoundMuted();
  setSoundMuted(next);
  return next;
}

export function useSoundMuted() {
  const [muted, setMuted] = useState(false);

  useEffect(() => {
    setMuted(isSoundMuted());
    const handler: MuteListener = (m) => setMuted(m);
    listeners.add(handler);
    return () => {
      listeners.delete(handler);
    };
  }, []);

  return {
    muted,
    toggle: () => toggleSoundMuted(),
    setMuted: (m: boolean) => setSoundMuted(m),
  };
}

let sharedCtx: AudioContext | null = null;

function getAudioContext(): AudioContext | null {
  if (typeof window === "undefined") return null;
  try {
    if (!sharedCtx || sharedCtx.state === "closed") {
      const AC =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!AC) return null;
      sharedCtx = new AC();
    }
    if (sharedCtx.state === "suspended") {
      void sharedCtx.resume().catch(() => {});
    }
    return sharedCtx;
  } catch {
    return null;
  }
}

export function playTone(
  freq: number,
  dur = 0.14,
  type: OscillatorType = "sine",
  vol = 0.08,
) {
  if (isSoundMuted()) return;
  const ctx = getAudioContext();
  if (!ctx) return;
  try {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(0.0001, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(Math.max(0.01, vol), ctx.currentTime + 0.015);
    gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + dur);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + dur + 0.03);
  } catch {
    /* ignore */
  }
}

export function playCorrect() {
  playTone(587.33, 0.1, "triangle", 0.09);
  if (typeof window !== "undefined") {
    window.setTimeout(() => playTone(880, 0.16, "triangle", 0.1), 90);
  }
}

export function playWrong() {
  playTone(170, 0.25, "sawtooth", 0.06);
}

export function playClick() {
  playTone(480, 0.06, "triangle", 0.05);
}

export function playVictory() {
  playTone(523.25, 0.12, "triangle", 0.09);
  if (typeof window !== "undefined") {
    window.setTimeout(() => playTone(659.25, 0.12, "triangle", 0.09), 110);
    window.setTimeout(() => playTone(783.99, 0.14, "triangle", 0.1), 220);
    window.setTimeout(() => playTone(1046.5, 0.28, "triangle", 0.12), 340);
  }
}

/** Som de sino/chime agradável para notificação de correio ou mensagem recebida */
export function playNotificationChime() {
  if (isSoundMuted()) return;
  // Dois tons harmônicos ascendentes suaves em onda senoidal (D5 -> A5)
  playTone(587.33, 0.14, "sine", 0.1);
  if (typeof window !== "undefined") {
    window.setTimeout(() => playTone(880, 0.25, "sine", 0.12), 110);
  }
}

/**
 * Som de disparo do feixe laser (Space Quest)
 * Varredura rápida descendente estilo blaster arcade sci-fi
 */
export function playLaserShoot() {
  if (isSoundMuted()) return;
  const ctx = getAudioContext();
  if (!ctx) return;
  try {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    const now = ctx.currentTime;
    const dur = 0.11;

    osc.type = "sawtooth";
    osc.frequency.setValueAtTime(960, now);
    osc.frequency.exponentialRampToValueAtTime(220, now + dur);

    gain.gain.setValueAtTime(0.001, now);
    gain.gain.linearRampToValueAtTime(0.09, now + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + dur);

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start(now);
    osc.stop(now + dur + 0.02);
  } catch {
    /* ignore */
  }
}

/**
 * Som específico para resposta incorreta no Space Quest
 * Tom descendente e dissonante de erro espacial
 */
export function playSpaceQuestWrong() {
  if (isSoundMuted()) return;
  const ctx = getAudioContext();
  if (!ctx) return;
  try {
    const now = ctx.currentTime;
    const dur = 0.24;

    const osc1 = ctx.createOscillator();
    const osc2 = ctx.createOscillator();
    const gain = ctx.createGain();

    osc1.type = "sawtooth";
    osc2.type = "triangle";

    osc1.frequency.setValueAtTime(220, now);
    osc1.frequency.exponentialRampToValueAtTime(110, now + dur);

    osc2.frequency.setValueAtTime(233, now); // Dissonância sutil
    osc2.frequency.exponentialRampToValueAtTime(115, now + dur);

    gain.gain.setValueAtTime(0.001, now);
    gain.gain.linearRampToValueAtTime(0.1, now + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + dur);

    osc1.connect(gain);
    osc2.connect(gain);
    gain.connect(ctx.destination);

    osc1.start(now);
    osc2.start(now);
    osc1.stop(now + dur + 0.02);
    osc2.stop(now + dur + 0.02);
  } catch {
    /* ignore */
  }
}

/**
 * Som de violação da Linha Vermelha / Barreira Estelar (Space Quest)
 * Impacto grave de colisão com aviso de perda de integridade
 */
export function playBarrierBreach() {
  if (isSoundMuted()) return;
  const ctx = getAudioContext();
  if (!ctx) return;
  try {
    const now = ctx.currentTime;
    const dur = 0.32;

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = "square";
    osc.frequency.setValueAtTime(160, now);
    osc.frequency.exponentialRampToValueAtTime(45, now + dur);

    gain.gain.setValueAtTime(0.001, now);
    gain.gain.linearRampToValueAtTime(0.14, now + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + dur);

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start(now);
    osc.stop(now + dur + 0.03);
  } catch {
    /* ignore */
  }
}

let activeTickingTimer: number | null = null;
let tickingStep = 0;

/**
 * Toca um pulso único de "tic" ou "tac" mecânico suave
 */
export function playTickTac(isTac = false) {
  if (isSoundMuted()) return;
  const ctx = getAudioContext();
  if (!ctx) return;
  try {
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    const dur = 0.022;

    osc.type = "sine";
    // Alterna: Tic mais agudo (1180Hz), Tac mais grave (780Hz)
    osc.frequency.setValueAtTime(isTac ? 780 : 1180, now);

    gain.gain.setValueAtTime(0.001, now);
    gain.gain.linearRampToValueAtTime(0.07, now + 0.003);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + dur);

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start(now);
    osc.stop(now + dur + 0.01);
  } catch {
    /* ignore */
  }
}

/**
 * Inicia o som rítmico contínuo de tictac enquanto a ampulheta estiver ativa
 * Retorna uma função para parar imediatamente o som.
 */
export function startHourglassTicking(intervalMs = 450): () => void {
  stopHourglassTicking();
  tickingStep = 0;

  // Primeiro pulso imediato
  playTickTac(false);

  if (typeof window !== "undefined") {
    activeTickingTimer = window.setInterval(() => {
      tickingStep++;
      playTickTac(tickingStep % 2 === 1);
    }, intervalMs);
  }

  return stopHourglassTicking;
}

/**
 * Para imediatamente o som de tictac da ampulheta
 */
export function stopHourglassTicking() {
  if (activeTickingTimer !== null && typeof window !== "undefined") {
    window.clearInterval(activeTickingTimer);
    activeTickingTimer = null;
  }
}

/**
 * Som de golpe acertado no inimigo na Batalha de Robôs (laser + impacto energético)
 */
export function playRpgAttackHit(isSuper = false) {
  if (isSoundMuted()) return;
  const ctx = getAudioContext();
  if (!ctx) return;
  try {
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = isSuper ? "sawtooth" : "triangle";
    osc.frequency.setValueAtTime(isSuper ? 980 : 680, now);
    osc.frequency.exponentialRampToValueAtTime(isSuper ? 320 : 240, now + 0.14);

    gain.gain.setValueAtTime(0.001, now);
    gain.gain.linearRampToValueAtTime(isSuper ? 0.14 : 0.1, now + 0.015);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.16);

    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.18);
  } catch {
    /* ignore */
  }
}

/**
 * Som de dano sofrido pelo robô do jogador na Batalha de Robôs (choque metálico grave)
 */
export function playRpgPlayerHit() {
  if (isSoundMuted()) return;
  const ctx = getAudioContext();
  if (!ctx) return;
  try {
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "sawtooth";
    osc.frequency.setValueAtTime(195, now);
    osc.frequency.exponentialRampToValueAtTime(62, now + 0.28);

    gain.gain.setValueAtTime(0.001, now);
    gain.gain.linearRampToValueAtTime(0.14, now + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.3);

    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.32);
  } catch {
    /* ignore */
  }
}

/**
 * Som de robô inimigo derrotado na Batalha de Robôs (explosão + fanfarra curta)
 */
export function playRpgEnemyDefeated() {
  if (isSoundMuted()) return;
  const ctx = getAudioContext();
  if (!ctx) return;
  try {
    const now = ctx.currentTime;
    const notes = [392, 523.25, 659.25, 783.99];
    notes.forEach((freq, idx) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      const start = now + idx * 0.07;
      osc.type = "triangle";
      osc.frequency.setValueAtTime(freq, start);

      gain.gain.setValueAtTime(0.001, start);
      gain.gain.linearRampToValueAtTime(0.11, start + 0.015);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.18);

      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(start);
      osc.stop(start + 0.2);
    });
  } catch {
    /* ignore */
  }
}

export function playSound(
  type:
    | "correct"
    | "wrong"
    | "click"
    | "victory"
    | "notification"
    | "laser"
    | "barrier"
    | "sq_wrong"
) {
  if (type === "correct") playCorrect();
  else if (type === "wrong") playWrong();
  else if (type === "sq_wrong") playSpaceQuestWrong();
  else if (type === "victory") playVictory();
  else if (type === "notification") playNotificationChime();
  else if (type === "laser") playLaserShoot();
  else if (type === "barrier") playBarrierBreach();
  else playClick();
}
