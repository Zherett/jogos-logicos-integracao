import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  applyClashTick,
  evaluateClashAnswer,
  generateClashQuestion,
  getRobotBoss,
  NORMAL_HIT_DAMAGE,
  ROBOT_BOSSES,
  SUPER_HIT_DAMAGE,
  SUPER_RESET_BLUE_SHARE,
  type ClashQuestion,
} from "./rpg-content.ts";

describe("Batalha de Robôs Geométricos (RPG da Lógica)", () => {
  it("possui 5 chefes robóticos progressivos com velocidades e vidas crescentes", () => {
    assert.equal(ROBOT_BOSSES.length, 5);
    for (let i = 1; i < ROBOT_BOSSES.length; i++) {
      assert.ok(ROBOT_BOSSES[i].maxHp > ROBOT_BOSSES[i - 1].maxHp);
      assert.ok(ROBOT_BOSSES[i].redPushPerSec > ROBOT_BOSSES[i - 1].redPushPerSec);
    }
  });

  it("empurra a barra para a esquerda (lado vermelho) conforme o tempo passa", () => {
    const boss = getRobotBoss(1);
    const tick1 = applyClashTick(50, 2, boss);
    assert.ok(tick1.blueShare < 50);
    assert.equal(tick1.redOvertookAll, false);

    // Tempo suficiente para o vermelho tomar 100% da barra
    const tickFull = applyClashTick(10, 10, boss);
    assert.equal(tickFull.blueShare, 0);
    assert.equal(tickFull.redOvertookAll, true);
  });

  it("aplica golpe normal (-1 HP) ao acertar e Super Golpe (-3 HP) quando a barra azul chega em 100%", () => {
    const boss = getRobotBoss(1); // blueGainOnCorrect = 24
    const question: ClashQuestion = {
      text: "50% de 40 é igual a 20",
      answer: true,
      category: "porcentagem",
      categoryLabel: "Porcentagem",
    };

    // Golpe normal: barra azul avança de 50% para 74%, inimigo perde 1 de vida
    const normalHit = evaluateClashAnswer({
      question,
      chosenAnswer: true,
      currentBlueShare: 50,
      currentEnemyHp: 5,
      boss,
    });
    assert.equal(normalHit.isCorrect, true);
    assert.equal(normalHit.isSuperHit, false);
    assert.equal(normalHit.damageToEnemy, NORMAL_HIT_DAMAGE);
    assert.equal(normalHit.nextEnemyHp, 4);
    assert.equal(normalHit.nextBlueShare, 74);

    // Super golpe: barra azul em 85% + 24% >= 100% -> causa 3 de dano e reseta barra para 55%
    const superHit = evaluateClashAnswer({
      question,
      chosenAnswer: true,
      currentBlueShare: 85,
      currentEnemyHp: 4,
      boss,
    });
    assert.equal(superHit.isCorrect, true);
    assert.equal(superHit.isSuperHit, true);
    assert.equal(superHit.damageToEnemy, SUPER_HIT_DAMAGE);
    assert.equal(superHit.nextEnemyHp, 1);
    assert.equal(superHit.nextBlueShare, SUPER_RESET_BLUE_SHARE);

    // Erro: empurra barra para o vermelho e não tira vida do inimigo
    const wrongHit = evaluateClashAnswer({
      question,
      chosenAnswer: false,
      currentBlueShare: 50,
      currentEnemyHp: 4,
      boss,
    });
    assert.equal(wrongHit.isCorrect, false);
    assert.equal(wrongHit.damageToEnemy, 0);
    assert.equal(wrongHit.nextEnemyHp, 4);
    assert.ok(wrongHit.nextBlueShare < 50);
  });

  it("gera questões variadas de Verdadeiro ou Falso (lógica, matemática, porcentagem e geometria)", () => {
    const categories = new Set<string>();
    const recent: string[] = [];
    const recentAns: boolean[] = [];

    for (let i = 0; i < 40; i++) {
      const q = generateClashQuestion((i % 5) + 1, recent, recentAns);
      assert.ok(q.text.length > 0);
      assert.equal(typeof q.answer, "boolean");
      categories.add(q.category);
      recent.push(q.text);
      recentAns.push(q.answer);
    }

    assert.ok(categories.size >= 3);
  });

  it("gera temas de formas geométricas correspondentes aos 5 estágios e gerencia robôs especiais", () => {
    // 5 temas distintos
    const themes = [1, 2, 3, 4, 5].map((s) => getRobotBoss(s).shapeTheme);
    assert.deepEqual(themes, ["triangle", "diamond", "hexagon", "octagon", "star"]);

    // Robô Especial Ametista (estágios 2-4)
    const ametista = getRobotBoss(2, true);
    assert.equal(ametista.isSpecial, true);
    assert.equal(ametista.specialType, "ametista");
    assert.equal(ametista.scoreMultiplier, 2);
    assert.equal(ametista.accentColor, "#a855f7");

    const ametistaCorrect = evaluateClashAnswer({
      question: { text: "1 + 1 = 2", answer: true, category: "matematica", categoryLabel: "Matemática" },
      chosenAnswer: true,
      currentBlueShare: 50,
      currentEnemyHp: 5,
      boss: ametista,
    });
    assert.equal(ametistaCorrect.scoreDelta, 20); // +10 * 2

    const ametistaWrong = evaluateClashAnswer({
      question: { text: "1 + 1 = 2", answer: true, category: "matematica", categoryLabel: "Matemática" },
      chosenAnswer: false,
      currentBlueShare: 50,
      currentEnemyHp: 5,
      boss: ametista,
    });
    assert.equal(ametistaWrong.scoreDelta, -10); // -5 * 2

    // Robô Especial Carmesim (estágio 5)
    const carmesim = getRobotBoss(5, true);
    assert.equal(carmesim.isSpecial, true);
    assert.equal(carmesim.specialType, "carmesim");
    assert.equal(carmesim.scoreMultiplier, 3);
    assert.equal(carmesim.accentColor, "#dc2626");
    assert.equal(carmesim.rewardPoints, ROBOT_BOSSES[4].rewardPoints + 100); // +100 bônus

    const carmesimCorrect = evaluateClashAnswer({
      question: { text: "1 + 1 = 2", answer: true, category: "matematica", categoryLabel: "Matemática" },
      chosenAnswer: true,
      currentBlueShare: 50,
      currentEnemyHp: 5,
      boss: carmesim,
    });
    assert.equal(carmesimCorrect.scoreDelta, 30); // +10 * 3

    const carmesimWrong = evaluateClashAnswer({
      question: { text: "1 + 1 = 2", answer: true, category: "matematica", categoryLabel: "Matemática" },
      chosenAnswer: false,
      currentBlueShare: 50,
      currentEnemyHp: 5,
      boss: carmesim,
    });
    assert.equal(carmesimWrong.scoreDelta, -15); // -5 * 3
  });

  it("GAME-15: nunca gera valores negativos como distratores nas questões de porcentagem/matemática do RPG", () => {
    for (let i = 0; i < 600; i++) {
      const q = generateClashQuestion((i % 5) + 1);
      assert.equal(
        /(?:é igual a|=\s*)-\d+/.test(q.text),
        false,
        `Não deve gerar distrator negativo no RPG: ${q.text}`,
      );
    }
  });
});
