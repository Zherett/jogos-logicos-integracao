import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { ALL_GAME_IDS } from "./game-storage.ts";
import { getGameInstructions } from "./game-instructions.ts";

describe("Instruções e Orientações Pedagógicas dos Jogos", () => {
  it("contém instruções completas para todos os jogos registrados na plataforma", () => {
    for (const id of ALL_GAME_IDS) {
      const info = getGameInstructions(id);
      assert.ok(info.objective.length > 10, `Objetivo do jogo ${id} deve ser descritivo`);
      assert.ok(info.howToPlay.length >= 2, `Jogo ${id} deve ter pelo menos 2 passos de como jogar`);
      assert.ok(info.controls.length > 5, `Jogo ${id} deve especificar comandos`);
      assert.ok(info.tips.length > 5, `Jogo ${id} deve ter dicas estratégicas`);
      assert.ok(info.scoring.length > 5, `Jogo ${id} deve descrever pontuação`);
    }
  });

  it("GAME-13: instruções refletem exatamente as regras e pontuações reais dos 11 jogos", () => {
    assert.ok(getGameInstructions("logica").scoring.includes("−10"));
    assert.ok(getGameInstructions("minado").scoring.includes("+5") && getGameInstructions("minado").scoring.includes("−3"));
    assert.ok(getGameInstructions("robogrid").howToPlay.join(" ").includes("10×10"));
    assert.ok(getGameInstructions("variaveis").howToPlay.join(" ").includes("5 vidas"));
    assert.ok(getGameInstructions("rpg").howToPlay.join(" ").includes("5 chefes"));
  });

  it("retorna fallback consistente para IDs desconhecidos", () => {
    // @ts-expect-error teste com id inválido
    const fallback = getGameInstructions("jogo_inexistente");
    assert.ok(fallback.objective.length > 0);
    assert.ok(fallback.howToPlay.length > 0);
  });
});
