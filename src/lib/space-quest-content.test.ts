import test from "node:test";
import assert from "node:assert/strict";
import {
  rollAura,
  getDifficultySpeedMultiplier,
  getStageFallDurationSeconds,
  generateLogicQuestion,
  generateMathQuestion,
  generateSpaceQuestQuestion,
  generateDoubleWaveQuestions,
  resolveAnswer,
  AURA_CONFIGS,
  FLOOR_COLLISION_PENALTY,
  BASE_CORRECT_POINTS,
  COMBO_BONUS_POINTS,
  STARTING_LIVES,
  RECOVER_LIFE_CHANCE,
  DOUBLE_WAVE_CHANCE,
  SLOW_MOTION_DURATION_MS,
  SLOW_MOTION_COOLDOWN_MS,
  AMPULHETA_COMBO_REQ,
  SHIELD_COMBO_REQ,
  SHIELD_COOLDOWN_MS,
  type AuraType,
} from "./space-quest-content.ts";
import { getAllAvailableMedals } from "./medals-catalog.ts";

test("Space Quest Engine — Sorteio de Auras por Probabilidade Atualizada e Anti-Aglomeração", () => {
  // 0.1% Âmbar, 0.5% Rubi, 2% Ametista, 5% Safira, 92.4% Normal
  assert.equal(rollAura(0.0005), "ambar"); // < 0.001
  assert.equal(rollAura(0.003), "rubi"); // 0.001 a 0.006
  assert.equal(rollAura(0.015), "ametista"); // 0.006 a 0.026
  assert.equal(rollAura(0.050), "safira"); // 0.026 a 0.076
  assert.equal(rollAura(0.200), "normal"); // >= 0.076

  // Cooldown de auras especiais
  assert.equal(rollAura(0.0005, { allowSpecial: false }), "normal");
  assert.equal(rollAura(0.050, { allowSpecial: false }), "normal");

  // Exclusão por limite de partida (máx 1 por tipo)
  assert.equal(rollAura(0.0005, { excludedAuras: new Set(["ambar"]) }), "normal");

  // Verificação exata da soma das probabilidades
  const total =
    AURA_CONFIGS.ambar.chance +
    AURA_CONFIGS.rubi.chance +
    AURA_CONFIGS.ametista.chance +
    AURA_CONFIGS.safira.chance +
    AURA_CONFIGS.normal.chance;
  assert.ok(Math.abs(total - 1.0) < 0.0001);
});

test("Space Quest Engine — Geração de Onda Dupla com Dificuldades Distintas (5% Chance)", () => {
  assert.equal(DOUBLE_WAVE_CHANCE, 0.05);

  // Testa 20 ondas duplas consecutivas: cada par deve ter dificuldades diferentes
  for (let i = 0; i < 20; i++) {
    const [q1, q2] = generateDoubleWaveQuestions(1);
    assert.notEqual(
      q1.difficulty,
      q2.difficulty,
      `Onda dupla ${i} gerou mesma dificuldade: ${q1.difficulty}`,
    );
  }
});

test("Space Quest Engine — Constantes de Sobrevivência, Ampulheta e Escudo", () => {
  assert.equal(STARTING_LIVES, 5);
  assert.equal(RECOVER_LIFE_CHANCE, 0.10);
  assert.equal(SLOW_MOTION_DURATION_MS, 10000);
  assert.equal(SLOW_MOTION_COOLDOWN_MS, 5000);
  assert.equal(AMPULHETA_COMBO_REQ, 5);
  assert.equal(SHIELD_COMBO_REQ, 10);
  assert.equal(SHIELD_COOLDOWN_MS, 10000);

  // Verificação de todas as medalhas específicas e geradas para o Space Quest
  const allMedals = getAllAvailableMedals();
  const sqMedalIds = [
    // Medalhas por jogo geradas
    "game_spacequest_lvl_master",
    "game_spacequest_flawless",
    "game_spacequest_matches_10",
    "game_spacequest_matches_20",
    "game_spacequest_matches_30",
    "game_spacequest_matches_40",
    "game_spacequest_matches_50",
    // Auras Especiais
    "sq_safira",
    "sq_ametista",
    "sq_rubi",
    "sq_ambar",
    // Novas Medalhas de Habilidade e Sobrevivência
    "sq_hourglass_3x",
    "sq_shield_2x",
    "sq_divine_luck",
    "sq_purist_pilot",
  ];

  for (const mId of sqMedalIds) {
    const found = allMedals.find((m) => m.id === mId);
    assert.ok(found, `Medalha ${mId} deve existir no catálogo de medalhas`);
  }
});

test("Space Quest Engine — Velocidade de Queda Inversa à Dificuldade", () => {
  const easyMult = getDifficultySpeedMultiplier("easy");
  const medMult = getDifficultySpeedMultiplier("medium");
  const hardMult = getDifficultySpeedMultiplier("hard");

  // Fácil cai mais rápido (maior multiplier de velocidade)
  assert.ok(easyMult > medMult);
  // Difícil cai mais lento (menor multiplier de velocidade)
  assert.ok(medMult > hardMult);

  // Duração de queda: questão difícil demora mais para atingir o chão
  const easyDuration = getStageFallDurationSeconds(1, "easy");
  const hardDuration = getStageFallDurationSeconds(1, "hard");
  assert.ok(hardDuration > easyDuration);

  // Conforme o nível sobe, o tempo de queda diminui (cai mais rápido)
  const lvl1Duration = getStageFallDurationSeconds(1, "medium");
  const lvl5Duration = getStageFallDurationSeconds(5, "medium");
  assert.ok(lvl1Duration > lvl5Duration);
});

test("Space Quest Engine — Geração de Questões Lógicas e Matemáticas", () => {
  // Lógica: Fácil, Médio e Difícil
  const logEasy = generateLogicQuestion("easy", "normal");
  assert.ok(logEasy.prompt.includes("OU") || logEasy.prompt.includes("E"));
  assert.ok(["V", "F"].includes(logEasy.correctAnswer));
  assert.deepEqual(logEasy.options, ["V", "F"]);

  const logMed = generateLogicQuestion("medium", "safira");
  assert.equal(logMed.difficulty, "medium");
  assert.equal(logMed.aura, "safira");
  assert.equal(logMed.pointsOnCorrect, 20); // 2x

  const logHard = generateLogicQuestion("hard", "ametista");
  assert.equal(logHard.difficulty, "hard");
  assert.equal(logHard.pointsOnCorrect, 30); // 3x

  // Matemática: 4 alternativas e resposta correta contida nas opções
  const mathEasy = generateMathQuestion("easy", "normal");
  assert.equal(mathEasy.options.length, 4);
  assert.ok(mathEasy.options.includes(mathEasy.correctAnswer));

  const mathHard = generateMathQuestion("hard", "rubi");
  assert.equal(mathHard.difficulty, "hard");
  assert.equal(mathHard.pointsOnCorrect, 40); // 4x
  assert.equal(mathHard.penaltyOnWrong, 30); // -30
});

test("Space Quest Engine — Resolução de Respostas, Combos e Penalidades", () => {
  const qNormal = generateMathQuestion("easy", "normal");
  
  // Acerto normal inicial
  const res1 = resolveAnswer(qNormal, qNormal.correctAnswer, 0);
  assert.equal(res1.isCorrect, true);
  assert.equal(res1.scoreDelta, 10);
  assert.equal(res1.newCombo, 1);
  assert.equal(res1.comboBonusEarned, false);

  // Quinto acerto consecutivo: Combo de 5 soma +10 extra!
  const resCombo5 = resolveAnswer(qNormal, qNormal.correctAnswer, 4);
  assert.equal(resCombo5.newCombo, 5);
  assert.equal(resCombo5.comboBonusEarned, true);
  assert.equal(resCombo5.scoreDelta, 10 + COMBO_BONUS_POINTS); // 20 pts

  // Erro quebra combo e não concede bônus
  const resWrong = resolveAnswer(qNormal, "9999", 5);
  assert.equal(resWrong.isCorrect, false);
  assert.equal(resWrong.newCombo, 0);
  assert.equal(resWrong.scoreDelta, 0); // normal tem wrongPenalty 0
});

test("Space Quest Engine — Auras Especiais e Concessão de Medalhas", () => {
  // 1. Safira: 20 pts se acertar, -20 pts se errar, concede medalha sq_safira
  const qSafira = generateLogicQuestion("medium", "safira");
  const hitSafira = resolveAnswer(qSafira, qSafira.correctAnswer, 0);
  assert.equal(hitSafira.scoreDelta, 20);
  assert.equal(hitSafira.unlockedMedalId, "sq_safira");
  const missSafira = resolveAnswer(qSafira, qSafira.correctAnswer === "V" ? "F" : "V", 0);
  assert.equal(missSafira.scoreDelta, -20);
  assert.equal(missSafira.unlockedMedalId, undefined);

  // 2. Ametista: 30 pts se acertar, -30 pts se errar, concede medalha sq_ametista
  const qAmetista = generateLogicQuestion("hard", "ametista");
  const hitAmetista = resolveAnswer(qAmetista, qAmetista.correctAnswer, 0);
  assert.equal(hitAmetista.scoreDelta, 30);
  assert.equal(hitAmetista.unlockedMedalId, "sq_ametista");
  const missAmetista = resolveAnswer(qAmetista, "ERRADA", 0);
  assert.equal(missAmetista.scoreDelta, -30);

  // 3. Rubi: 40 pts se acertar, -30 pts se errar, concede medalha sq_rubi
  const qRubi = generateMathQuestion("hard", "rubi");
  const hitRubi = resolveAnswer(qRubi, qRubi.correctAnswer, 0);
  assert.equal(hitRubi.scoreDelta, 40);
  assert.equal(hitRubi.unlockedMedalId, "sq_rubi");
  const missRubi = resolveAnswer(qRubi, "9999", 0);
  assert.equal(missRubi.scoreDelta, -30);

  // 4. Âmbar: 40 pts se acertar, 0 penalidade se errar, mas não ganha medalha se errar
  const qAmbar = generateMathQuestion("hard", "ambar");
  const hitAmbar = resolveAnswer(qAmbar, qAmbar.correctAnswer, 0);
  assert.equal(hitAmbar.scoreDelta, 40);
  assert.equal(hitAmbar.unlockedMedalId, "sq_ambar");
  const missAmbar = resolveAnswer(qAmbar, "9999", 0);
  assert.equal(missAmbar.scoreDelta, 0); // sem penalidade de pontos negativos!
  assert.equal(missAmbar.unlockedMedalId, undefined);
});

test("Space Quest Engine — Assinatura Flexível e Segura de generateSpaceQuestQuestion", () => {
  // 1. Chamada apenas com nível
  const q1 = generateSpaceQuestQuestion(1);
  assert.ok(q1.prompt.length > 0);
  assert.ok(q1.options.length >= 2);

  // 2. Chamada com opções como 2º argumento (evita crash de TypeError)
  const q2 = generateSpaceQuestQuestion(1, {
    allowSpecial: false,
    excludedAuras: new Set<AuraType>(["rubi", "ambar"]),
  });
  assert.equal(q2.aura, "normal");
  assert.ok(q2.options.includes(q2.correctAnswer));

  // 3. Chamada com aura forçada no 2º argumento
  const q3 = generateSpaceQuestQuestion(2, "safira");
  assert.equal(q3.aura, "safira");
  assert.equal(q3.pointsOnCorrect, 20);

  // 4. Chamada com aura forçada e opções no 3º argumento
  const q4 = generateSpaceQuestQuestion(3, "ametista", { allowSpecial: true });
  assert.equal(q4.aura, "ametista");
  assert.equal(q4.pointsOnCorrect, 30);
});
