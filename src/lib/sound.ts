import { useEffect, useState } from "react";
import { safeLocalStorageSet } from "./storage-guard.ts";

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
      if (muted) safeLocalStorageSet(MUTE_KEY, "1");
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

function playFilteredNoise(opts: {
  duration: number;
  freqStart: number;
  freqEnd: number;
  q?: number;
  filterType?: BiquadFilterType;
  vol: number;
  delay?: number;
  crackle?: boolean;
}) {
  if (isSoundMuted()) return;
  const ctx = getAudioContext();
  if (!ctx) return;
  try {
    const sampleRate = ctx.sampleRate;
    const frameCount = Math.max(1, Math.floor(sampleRate * opts.duration));
    const buffer = ctx.createBuffer(1, frameCount, sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < frameCount; i++) {
      let sample = Math.random() * 2 - 1;
      if (opts.crackle) {
        // Modulação irregular para simular plástico/papel rasgando
        const gate = Math.sin((i / sampleRate) * 95) * 0.45 + 0.65;
        sample *= gate;
      }
      data[i] = sample;
    }

    const src = ctx.createBufferSource();
    src.buffer = buffer;

    const filter = ctx.createBiquadFilter();
    filter.type = opts.filterType ?? "bandpass";
    filter.Q.value = opts.q ?? 1.4;
    const start = ctx.currentTime + (opts.delay ?? 0);
    filter.frequency.setValueAtTime(opts.freqStart, start);
    filter.frequency.exponentialRampToValueAtTime(
      Math.max(60, opts.freqEnd),
      start + opts.duration,
    );

    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.linearRampToValueAtTime(opts.vol, start + Math.min(0.025, opts.duration * 0.2));
    gain.gain.exponentialRampToValueAtTime(0.0001, start + opts.duration);

    src.connect(filter);
    filter.connect(gain);
    gain.connect(ctx.destination);
    src.start(start);
    src.stop(start + opts.duration + 0.02);
  } catch {
    /* ignore */
  }
}

/** Som de plástico/papel rasgando na abertura do pacote */
export function playPackTear() {
  playFilteredNoise({
    duration: 0.72,
    freqStart: 1900,
    freqEnd: 3400,
    q: 1.8,
    filterType: "bandpass",
    vol: 0.14,
    crackle: true,
  });
}

/** Som leve da aba superior do pacote voando */
export function playPackTopWhoosh() {
  playFilteredNoise({
    duration: 0.22,
    freqStart: 1500,
    freqEnd: 620,
    q: 1.3,
    filterType: "bandpass",
    vol: 0.09,
  });
}

/** Som mais grave e alto da parte de baixo do pacote sendo jogada fora */
export function playPackBodyWhoosh() {
  playFilteredNoise({
    duration: 0.34,
    freqStart: 680,
    freqEnd: 190,
    q: 1.1,
    filterType: "lowpass",
    vol: 0.18,
  });
}

/** Estalo rápido ao virar uma carta */
export function playCardFlip() {
  playFilteredNoise({
    duration: 0.11,
    freqStart: 2400,
    freqEnd: 950,
    q: 1.6,
    filterType: "bandpass",
    vol: 0.12,
  });
}

/** Som de arremessar uma carta revelada para fora */
export function playCardToss() {
  playFilteredNoise({
    duration: 0.17,
    freqStart: 1650,
    freqEnd: 520,
    q: 1.2,
    filterType: "bandpass",
    vol: 0.11,
  });
}

/** Som das cartas se juntando em um maço no centro */
export function playCardsGather() {
  playFilteredNoise({
    duration: 0.24,
    freqStart: 900,
    freqEnd: 340,
    q: 1.2,
    filterType: "lowpass",
    vol: 0.13,
  });
}

/** Som encorpado de todas as cartas virando juntas no amontoado */
export function playCardsFlipAll() {
  playFilteredNoise({
    duration: 0.22,
    freqStart: 2100,
    freqEnd: 780,
    q: 1.3,
    filterType: "bandpass",
    vol: 0.15,
  });
}

/** Som sequencial de cada carta se espalhando lado a lado */
export function playCardsSpread(count: number) {
  const safeCount = Math.max(1, Math.min(20, count));
  for (let i = 0; i < safeCount; i++) {
    playFilteredNoise({
      duration: 0.1,
      freqStart: 2000 + i * 90,
      freqEnd: 900,
      q: 1.5,
      filterType: "bandpass",
      vol: 0.09,
      delay: i * 0.09,
    });
  }
}

/**
 * Brilho mágico sutil ao revelar carta Épica/Lendária ou Foil.
 * Cartas Foil recebem um arpejo mágico um pouco mais longo e trabalhado.
 */
export function playCardMagicReveal(opts: { isEpicOrHigher?: boolean; isFoil?: boolean }) {
  if (isSoundMuted()) return;
  if (!opts.isEpicOrHigher && !opts.isFoil) return;
  const ctx = getAudioContext();
  if (!ctx) return;

  try {
    const now = ctx.currentTime;
    const notes = opts.isFoil
      ? [783.99, 987.77, 1174.66, 1567.98, 1975.53] // G5-B5-D6-G6-B6 (mais longo e trabalhado)
      : [659.25, 880, 1174.66]; // E5-A5-D6 (sutil e cristalino para épica+)
    const step = opts.isFoil ? 0.075 : 0.065;
    const noteDur = opts.isFoil ? 0.34 : 0.24;
    const baseVol = opts.isFoil ? 0.065 : 0.05;

    notes.forEach((freq, idx) => {
      const start = now + idx * step;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = idx % 2 === 0 ? "sine" : "triangle";
      osc.frequency.setValueAtTime(freq, start);
      if (opts.isFoil) {
        osc.frequency.exponentialRampToValueAtTime(freq * 1.02, start + noteDur);
      }

      gain.gain.setValueAtTime(0.0001, start);
      gain.gain.linearRampToValueAtTime(baseVol, start + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + noteDur);

      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(start);
      osc.stop(start + noteDur + 0.03);
    });
  } catch {
    /* ignore */
  }
}

/** Som metálico de fechadura destrancando ao completar a barrinha do baú. */
export function playChestUnlock() {
  if (isSoundMuted()) return;
  const ctx = getAudioContext();
  if (!ctx) return;
  try {
    const now = ctx.currentTime;
    [520, 780].forEach((freq, idx) => {
      const t = now + idx * 0.065;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "triangle";
      osc.frequency.setValueAtTime(freq, t);
      osc.frequency.exponentialRampToValueAtTime(freq * 1.35, t + 0.07);
      gain.gain.setValueAtTime(0.001, t);
      gain.gain.linearRampToValueAtTime(0.14, t + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.11);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(t);
      osc.stop(t + 0.12);
    });
  } catch {
    /* ignore */
  }
}

/** Som suave da tampa do baú subindo e se separando do corpo. */
export function playChestLidOpen() {
  playFilteredNoise({
    duration: 0.24,
    freqStart: 420,
    freqEnd: 1650,
    q: 1.2,
    filterType: "bandpass",
    vol: 0.12,
  });
}

/** Acorde brilhante quando a bolinha '?' se transforma no modal de premiação do baú. */
export function playChestReveal() {
  if (isSoundMuted()) return;
  const ctx = getAudioContext();
  if (!ctx) return;
  try {
    const now = ctx.currentTime;
    const notes = [523.25, 659.25, 783.99, 1046.5];
    notes.forEach((freq, idx) => {
      const t = now + idx * 0.06;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.setValueAtTime(freq, t);
      gain.gain.setValueAtTime(0.0001, t);
      gain.gain.linearRampToValueAtTime(0.09, t + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.35);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(t);
      osc.stop(t + 0.38);
    });
  } catch {
    /* ignore */
  }
}

/**
 * Som realista de baú pesado balançando com itens/moedas chacoalhando por dentro.
 * Adapta o peso e o timbre ao tamanho do baú (`compacto`, `padrao`, `largo`) e à variação (1..3).
 */
export function playChestLockpickTick(
  shape: "padrao" | "largo" | "compacto" = "padrao",
  variant: 1 | 2 | 3 = 1,
) {
  if (isSoundMuted()) return;
  const ctx = getAudioContext();
  if (!ctx) return;
  try {
    const now = ctx.currentTime;
    const isLarge = shape === "largo";
    const isCompact = shape === "compacto";
    const baseThud = isLarge ? 105 : isCompact ? 168 : 132;
    const volScale = isLarge ? 1.15 : isCompact ? 0.9 : 1.0;

    // 1. Camada grave: corpo pesado do baú balançando (ida e volta "tum-toc" oco)
    const swingBeats =
      variant === 1
        ? [
            { offset: 0, pitch: 1.0, gain: 0.13 },
            { offset: 0.135, pitch: 0.9, gain: 0.095 },
          ]
        : variant === 2
          ? [
              { offset: 0, pitch: 1.04, gain: 0.12 },
              { offset: 0.115, pitch: 0.94, gain: 0.1 },
            ]
          : [
              { offset: 0, pitch: 0.96, gain: 0.135 },
              { offset: 0.145, pitch: 1.02, gain: 0.09 },
            ];

    for (const beat of swingBeats) {
      const t = now + beat.offset;
      const thudOsc = ctx.createOscillator();
      const thudGain = ctx.createGain();
      thudOsc.type = "sine";
      const startF = baseThud * beat.pitch;
      thudOsc.frequency.setValueAtTime(startF, t);
      thudOsc.frequency.exponentialRampToValueAtTime(Math.max(42, startF * 0.42), t + 0.095);
      thudGain.gain.setValueAtTime(0.0001, t);
      thudGain.gain.linearRampToValueAtTime(beat.gain * volScale, t + 0.009);
      thudGain.gain.exponentialRampToValueAtTime(0.0001, t + 0.115);
      thudOsc.connect(thudGain);
      thudGain.connect(ctx.destination);
      thudOsc.start(t);
      thudOsc.stop(t + 0.12);

      // Corpo de madeira/caixa oca (ruído lowpass grave bem curto)
      const woodDur = 0.07;
      const woodSamples = Math.floor(ctx.sampleRate * woodDur);
      const woodBuf = ctx.createBuffer(1, woodSamples, ctx.sampleRate);
      const woodData = woodBuf.getChannelData(0);
      for (let i = 0; i < woodSamples; i++) {
        woodData[i] = (Math.random() * 2 - 1) * Math.exp(-i / (woodSamples * 0.35));
      }
      const woodSrc = ctx.createBufferSource();
      woodSrc.buffer = woodBuf;
      const woodFilter = ctx.createBiquadFilter();
      woodFilter.type = "lowpass";
      woodFilter.frequency.setValueAtTime(isLarge ? 260 : isCompact ? 420 : 320, t);
      woodFilter.frequency.exponentialRampToValueAtTime(120, t + woodDur);
      const woodGain = ctx.createGain();
      woodGain.gain.setValueAtTime(0.0001, t);
      woodGain.gain.linearRampToValueAtTime(0.075 * volScale, t + 0.008);
      woodGain.gain.exponentialRampToValueAtTime(0.0001, t + woodDur);
      woodSrc.connect(woodFilter);
      woodFilter.connect(woodGain);
      woodGain.connect(ctx.destination);
      woodSrc.start(t);
      woodSrc.stop(t + woodDur + 0.01);
    }

    // 2. Camada média: objetos soltos batendo nas paredes internas com pequeno atraso físico
    const rattleOffsets =
      variant === 1 ? [0.038, 0.095, 0.175] : variant === 2 ? [0.032, 0.082, 0.155, 0.21] : [0.045, 0.11, 0.19];
    rattleOffsets.forEach((offset, idx) => {
      const t = now + offset;
      const dur = 0.038;
      const samples = Math.floor(ctx.sampleRate * dur);
      const buf = ctx.createBuffer(1, samples, ctx.sampleRate);
      const data = buf.getChannelData(0);
      for (let i = 0; i < samples; i++) {
        data[i] = (Math.random() * 2 - 1) * Math.exp(-i / (samples * 0.28));
      }
      const src = ctx.createBufferSource();
      src.buffer = buf;
      const bp = ctx.createBiquadFilter();
      bp.type = "bandpass";
      const centerFreq = (isLarge ? 360 : isCompact ? 620 : 480) + idx * 75 + variant * 20;
      bp.frequency.setValueAtTime(centerFreq, t);
      bp.Q.setValueAtTime(3.2, t);
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.linearRampToValueAtTime(0.055 * volScale, t + 0.004);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      src.connect(bp);
      bp.connect(g);
      g.connect(ctx.destination);
      src.start(t);
      src.stop(t + dur + 0.01);
    });

    // 3. Camada sutil: tilintar suave de moedas/itens internos (sine puro, nunca square agudo)
    const clinkOffsets = variant === 2 ? [0.06, 0.165] : [0.07, 0.18];
    clinkOffsets.forEach((offset, idx) => {
      const t = now + offset;
      const osc = ctx.createOscillator();
      const g = ctx.createGain();
      osc.type = "sine";
      const f = (isLarge ? 880 : isCompact ? 1220 : 1040) + idx * 145 + variant * 25;
      osc.frequency.setValueAtTime(f, t);
      osc.frequency.exponentialRampToValueAtTime(f * 0.88, t + 0.042);
      g.gain.setValueAtTime(0.0001, t);
      g.gain.linearRampToValueAtTime(0.02, t + 0.005);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.048);
      osc.connect(g);
      g.connect(ctx.destination);
      osc.start(t);
      osc.stop(t + 0.052);
    });
  } catch {
    /* ignore */
  }
}

/** Som cristalino ao revelar a recompensa de Pontos do baú. */
export function playChestRewardPoints() {
  if (isSoundMuted()) return;
  const ctx = getAudioContext();
  if (!ctx) return;
  try {
    const now = ctx.currentTime;
    [587.33, 880].forEach((freq, idx) => {
      const t = now + idx * 0.07;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "triangle";
      osc.frequency.setValueAtTime(freq, t);
      gain.gain.setValueAtTime(0.0001, t);
      gain.gain.linearRampToValueAtTime(0.11, t + 0.015);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.24);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(t);
      osc.stop(t + 0.26);
    });
  } catch {
    /* ignore */
  }
}

/** Som energético ascendente ao revelar a recompensa de XP do baú. */
export function playChestRewardXp() {
  if (isSoundMuted()) return;
  const ctx = getAudioContext();
  if (!ctx) return;
  try {
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "sine";
    osc.frequency.setValueAtTime(440, now);
    osc.frequency.exponentialRampToValueAtTime(987.77, now + 0.18);
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.linearRampToValueAtTime(0.1, now + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.28);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.3);
  } catch {
    /* ignore */
  }
}

/** Som metálico de moedas tilintando ao revelar a recompensa de Moedas do baú. */
export function playChestRewardCoins() {
  if (isSoundMuted()) return;
  const ctx = getAudioContext();
  if (!ctx) return;
  try {
    const now = ctx.currentTime;
    [1318.51, 1760, 2093].forEach((freq, idx) => {
      const t = now + idx * 0.055;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.setValueAtTime(freq, t);
      gain.gain.setValueAtTime(0.0001, t);
      gain.gain.linearRampToValueAtTime(0.085, t + 0.008);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.22);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(t);
      osc.stop(t + 0.24);
    });
  } catch {
    /* ignore */
  }
}

/** Acorde especial ao revelar Pacotes ou Cosméticos recebidos no baú. */
export function playChestRewardPack() {
  if (isSoundMuted()) return;
  const ctx = getAudioContext();
  if (!ctx) return;
  try {
    const now = ctx.currentTime;
    [523.25, 659.25, 783.99, 1046.5, 1318.51].forEach((freq, idx) => {
      const t = now + idx * 0.05;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "triangle";
      osc.frequency.setValueAtTime(freq, t);
      gain.gain.setValueAtTime(0.0001, t);
      gain.gain.linearRampToValueAtTime(0.085, t + 0.018);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.34);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(t);
      osc.stop(t + 0.36);
    });
  } catch {
    /* ignore */
  }
}
