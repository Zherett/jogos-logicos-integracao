import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  genShape,
  genTF,
  genMystery,
  genPizzaChoice,
  genPizzaBuild,
  genBonus,
  buildBoard,
  cellLabel,
  ANSWER_SECONDS,
  ANSWER_TIME_OPTIONS,
  POINTS_CORRECT,
  POINTS_WRONG,
  evaluateQuestionAnswer,
  evaluateTimeout,
  evaluateBonusCard,
  GENERAL_SHAPES,
  TRIANGLE_CLASSIFICATIONS,
  type QuestionCard,
  type BonusCard,
} from "./minefield-content.ts";

describe("Campo Minado - Lógica de Conteúdo e Questões de Formas Geométricas", () => {
  it("mantém tempo de resposta fixado em 20 segundos", () => {
    assert.equal(ANSWER_SECONDS, 20);
    assert.deepEqual(ANSWER_TIME_OPTIONS, [20]);
  });

  it("gera coordenadas corretas de A1 até H8 para o tabuleiro 8x8", () => {
    assert.equal(cellLabel(0), "A1");
    assert.equal(cellLabel(7), "H1");
    assert.equal(cellLabel(8), "A2");
    assert.equal(cellLabel(63), "H8");
  });

  it("genShape nunca gera alternativas duplicadas, ambíguas ou redundantes (1000 amostras)", () => {
    const generalLabels = new Set(GENERAL_SHAPES.map((g) => g.label));
    const triangleSubtypes = new Set([
      "Triângulo equilátero",
      "Triângulo isósceles",
      "Triângulo escaleno",
      "Triângulo retângulo",
    ]);

    for (let i = 0; i < 1000; i++) {
      const q = genShape();
      assert.equal(q.kind, "shape");
      assert.equal(q.options.length, 4);

      // Sem alternativas duplicadas
      const uniqueOpts = new Set(q.options);
      assert.equal(uniqueOpts.size, 4);

      // A resposta correta deve sempre estar contida nas alternativas
      assert.ok(q.options.includes(q.answer));

      if (q.prompt === "Qual é o nome desta forma?") {
        // Questão geral: todas as opções devem ser formas gerais
        for (const opt of q.options) {
          assert.ok(generalLabels.has(opt));
          // Jamais pode conter subtipo de triângulo
          assert.equal(triangleSubtypes.has(opt), false);
        }
        // Se a resposta for Triângulo, nenhuma outra opção pode ter a palavra Triângulo
        if (q.answer === "Triângulo") {
          const triangleCount = q.options.filter((o) => o.toLowerCase().includes("triângulo")).length;
          assert.equal(triangleCount, 1);
        }
      } else if (q.prompt === "Quanto aos lados, que tipo de triângulo é este?") {
        // Questão de classificação de triângulos:
        assert.ok(TRIANGLE_CLASSIFICATIONS.map((c) => c.label).includes(q.answer));
        // Todas as 4 alternativas devem ser os tipos de triângulo
        for (const opt of q.options) {
          assert.ok(triangleSubtypes.has(opt));
        }
        // Jamais pode conter a opção genérica 'Triângulo' isolada
        assert.equal(q.options.includes("Triângulo"), false);
      } else {
        assert.fail(`Prompt desconhecido: ${q.prompt}`);
      }
    }
  });

  it("buildBoard cria 64 cartas com ids e labels válidos sem ambiguidade nas cartas de forma", () => {
    const board = buildBoard();
    assert.equal(board.length, 64);

    const ids = new Set(board.map((c) => c.id));
    assert.equal(ids.size, 64);

    for (const card of board) {
      if (card.kind === "shape") {
        assert.equal(card.options.length, 4);
        assert.ok(card.options.includes(card.answer));
        assert.equal(new Set(card.options).size, 4);

        if (card.options.includes("Triângulo")) {
          // Não pode conter subtipos de triângulo junto
          assert.equal(card.options.includes("Triângulo escaleno"), false);
          assert.equal(card.options.includes("Triângulo isósceles"), false);
          assert.equal(card.options.includes("Triângulo equilátero"), false);
        }
      }
    }
  });

  it("genTF gera expressões com respostas corretas", () => {
    for (let i = 0; i < 50; i++) {
      const q = genTF();
      assert.equal(q.kind, "tf");
      assert.deepEqual(q.options, ["Verdadeiro", "Falso"]);
      assert.ok(["Verdadeiro", "Falso"].includes(q.answer));
    }
  });

  it("genMystery gera equações consistentes com 4 opções únicas", () => {
    for (let i = 0; i < 50; i++) {
      const q = genMystery();
      assert.equal(q.kind, "mystery");
      assert.equal(q.options.length, 4);
      assert.equal(new Set(q.options).size, 4);
      assert.ok(q.options.includes(q.answer));
    }
  });

  it("genBonus gera bônus com pontuação não nula", () => {
    for (let i = 0; i < 50; i++) {
      const b = genBonus();
      assert.equal(b.kind, "bonus");
      assert.notEqual(b.points, 0);
      assert.ok(Math.abs(b.points) >= 1);
      assert.ok(Math.abs(b.points) <= 3);
    }
  });

  describe("Sistema de Pontuação e Contabilização de Erros (Campo Minado)", () => {
    const sampleQuestion: QuestionCard = {
      kind: "tf",
      prompt: "Verdadeiro ou Falso?",
      expr: "10 > 5",
      options: ["Verdadeiro", "Falso"],
      answer: "Verdadeiro",
    };

    it("atribui +5 pontos e marca acerto quando a resposta à questão está correta", () => {
      const res = evaluateQuestionAnswer(sampleQuestion, "Verdadeiro");
      assert.equal(res.isCorrect, true);
      assert.equal(res.isError, false);
      assert.equal(res.scoreDelta, POINTS_CORRECT);
      assert.equal(res.scoreDelta, 5);
    });

    it("desconta 3 pontos e contabiliza ERRO quando a resposta à questão está incorreta", () => {
      const res = evaluateQuestionAnswer(sampleQuestion, "Falso");
      assert.equal(res.isCorrect, false);
      assert.equal(res.isError, true);
      assert.equal(res.scoreDelta, -POINTS_WRONG);
      assert.equal(res.scoreDelta, -3);
    });

    it("desconta 3 pontos e contabiliza ERRO quando o tempo limite de 20s esgota", () => {
      const res = evaluateTimeout();
      assert.equal(res.isCorrect, false);
      assert.equal(res.isError, true);
      assert.equal(res.scoreDelta, -POINTS_WRONG);
      assert.equal(res.scoreDelta, -3);
    });

    it("avalia carta bônus positiva como acerto e com pontuação positiva", () => {
      const positiveBonus: BonusCard = { kind: "bonus", points: 2 };
      const res = evaluateBonusCard(positiveBonus);
      assert.equal(res.isCorrect, true);
      assert.equal(res.isError, false);
      assert.equal(res.scoreDelta, 2);
    });

    it("avalia carta mina (bônus negativo) como erro e com desconto de pontuação", () => {
      const negativeMine: BonusCard = { kind: "bonus", points: -2 };
      const res = evaluateBonusCard(negativeMine);
      assert.equal(res.isCorrect, false);
      assert.equal(res.isError, true);
      assert.equal(res.scoreDelta, -2);
    });

    it("contabiliza com fidelidade múltiplos erros cometidos em uma partida (sem limitar a 1)", () => {
      let score = 0;
      let correct = 0;
      let wrong = 0;

      // 1. Acerta 3 questões (+15 pts, 3 acertos)
      for (let i = 0; i < 3; i++) {
        const ev = evaluateQuestionAnswer(sampleQuestion, "Verdadeiro");
        score = Math.max(0, score + ev.scoreDelta);
        if (ev.isCorrect) correct++;
        if (ev.isError) wrong++;
      }
      assert.equal(score, 15);
      assert.equal(correct, 3);
      assert.equal(wrong, 0);

      // 2. Erra 3 questões seguidas (-9 pts, 3 erros)
      for (let i = 0; i < 3; i++) {
        const ev = evaluateQuestionAnswer(sampleQuestion, "Falso");
        score = Math.max(0, score + ev.scoreDelta);
        if (ev.isCorrect) correct++;
        if (ev.isError) wrong++;
      }
      assert.equal(score, 6);
      assert.equal(correct, 3);
      assert.equal(wrong, 3);

      // 3. Esgota o tempo em 1 questão (-3 pts, 1 erro adicional)
      const timeoutEv = evaluateTimeout();
      score = Math.max(0, score + timeoutEv.scoreDelta);
      if (timeoutEv.isError) wrong++;
      assert.equal(score, 3);
      assert.equal(wrong, 4);

      // 4. Pisa em 1 mina (-2 pts, 1 erro adicional)
      const mineEv = evaluateBonusCard({ kind: "bonus", points: -2 });
      score = Math.max(0, score + mineEv.scoreDelta);
      if (mineEv.isError) wrong++;
      assert.equal(score, 1);
      assert.equal(wrong, 5);

      // Total final deve refletir TODOS os 5 erros cometidos, e NUNCA apenas 1!
      assert.equal(correct, 3);
      assert.equal(wrong, 5);
      assert.equal(score, 1);
    });
  });

  describe("Formas complexas e Pizza de 10 partes", () => {
    it("não inclui formas simples (círculo, triângulo, quadrado) em GENERAL_SHAPES", () => {
      const forbidden = new Set(["circle", "triangle", "square"]);
      for (const s of GENERAL_SHAPES) {
        assert.equal(forbidden.has(s.shape), false);
      }
      const labels = new Set(GENERAL_SHAPES.map((s) => s.label));
      assert.ok(labels.has("Pentágono"));
      assert.ok(labels.has("Hexágono"));
    });

    it("genPizzaChoice usa pizza de 10 partes com 4 alternativas únicas de fração", () => {
      for (let i = 0; i < 20; i++) {
        const q = genPizzaChoice();
        assert.equal(q.kind, "pizza-choice");
        assert.equal(q.pizzaParts, 10);
        assert.ok(q.pizzaFilled && q.pizzaFilled >= 1 && q.pizzaFilled <= 9);
        assert.equal(q.options.length, 4);
        assert.equal(new Set(q.options).size, 4);
        assert.ok(q.options.includes(q.answer));
      }
    });

    it("genPizzaBuild usa pizza de 10 partes e evaluateQuestionAnswer valida contagem marcada", () => {
      for (let i = 0; i < 20; i++) {
        const q = genPizzaBuild();
        assert.equal(q.kind, "pizza-build");
        assert.equal(q.pizzaParts, 10);
        assert.ok(q.pizzaTarget && q.pizzaTarget >= 1 && q.pizzaTarget <= 9);
        assert.equal(evaluateQuestionAnswer(q, String(q.pizzaTarget)).isCorrect, true);
        assert.equal(evaluateQuestionAnswer(q, String(q.pizzaTarget === 1 ? 2 : 1)).isCorrect, false);
      }
    });
  });
});
