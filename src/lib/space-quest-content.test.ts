import test from "node:test";
import assert from "node:assert/strict";
import {
  rollAura,
  getDifficultySpeedMultiplier,
  getStageFallDurationSeconds,
  generateLogicQuestion,
  generateMathQuestion,
  generateSpaceQuestQuestion,
  resolveAnswer,
  AURA_CONFIGS,
  FLOOR_COLLISION_PENALTY,
  BASE_CORRECT_POINTS,
  COMBO_BONUS_POINTS,
  type AuraType,
} from "./space-quest-content.ts";

test("Space Quest Engine — Sorteio de Auras por Probabilidade", () => {
  // 1% Âmbar, 5% Rubi, 10% Ametista, 20% Safira, 64% Normal
  assert.equal(rollAura(0.005), "ambar");
  assert.equal(rollAura(0.03), "rubi");
  assert.equal(rollAura(0.12), "ametista");
  assert.equal(rollAura(0.25), "safira");
  assert.equal(rollAura(0.70), "normal");
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
