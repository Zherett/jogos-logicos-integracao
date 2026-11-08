import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import {
  isSoundMuted,
  setSoundMuted,
  toggleSoundMuted,
  playTone,
  playCorrect,
  playWrong,
  playClick,
  playVictory,
  playNotificationChime,
  playLaserShoot,
  playSpaceQuestWrong,
  playBarrierBreach,
  playTickTac,
  startHourglassTicking,
  stopHourglassTicking,
  playSound,
} from "./sound.ts";

describe("Sistema de Efeitos Sonoros e Sintetizador Web Audio (sound.ts)", () => {
  beforeEach(() => {
    setSoundMuted(false);
  });

  afterEach(() => {
    stopHourglassTicking();
    setSoundMuted(false);
  });

  it("gerencia estado de mudo (mute / unmute / toggle)", () => {
    assert.equal(isSoundMuted(), false);

    setSoundMuted(true);
    assert.equal(isSoundMuted(), true);

    const toggled = toggleSoundMuted();
    assert.equal(toggled, false);
    assert.equal(isSoundMuted(), false);
  });

  it("executa funções de som do Space Quest com segurança em ambiente headless sem lançar erros", () => {
    assert.doesNotThrow(() => {
      playLaserShoot();
      playSpaceQuestWrong();
      playBarrierBreach();
      playTickTac(false); // tic
      playTickTac(true);  // tac
    });
  });

  it("controla o ciclo do som de tictac contínuo da ampulheta (start / stop)", () => {
    assert.doesNotThrow(() => {
      const stop = startHourglassTicking(100);
      assert.equal(typeof stop, "function");
      stop();
    });

    assert.doesNotThrow(() => {
      stopHourglassTicking();
    });
  });

  it("executa playSound com os novos tipos do Space Quest ('laser', 'barrier', 'sq_wrong')", () => {
    assert.doesNotThrow(() => {
      playSound("laser");
      playSound("barrier");
      playSound("sq_wrong");
      playSound("correct");
      playSound("wrong");
      playSound("click");
      playSound("victory");
      playSound("notification");
    });
  });
});
