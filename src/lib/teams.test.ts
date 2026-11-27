import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  DEFAULT_TEAMS,
  NORMAL_CONFIG,
  TEAM_COLOR_CLASSES,
  TEAM_NAME_MAX,
  sanitizeTeamName,
  shuffleTeams,
  teamColor,
} from "./teams.ts";

describe("Configuração de modo por equipes (teams)", () => {
  it("expõe equipes padrão e limita nomes em sanitizeTeamName", () => {
    assert.equal(DEFAULT_TEAMS.length, 4);
    assert.equal(NORMAL_CONFIG.mode, "normal");
    assert.equal(TEAM_NAME_MAX, 15);
    assert.equal(sanitizeTeamName("   ", 2), "EQUIPE 3");
    assert.equal(sanitizeTeamName("  NOME_MUITO_GRANDE_AQUI  ", 0).length, TEAM_NAME_MAX);
  });

  it("identifica cores conhecidas e embaralha preservando os mesmos elementos", () => {
    assert.equal(teamColor("sparks"), "verde");
    assert.equal(teamColor("SUPER NEXUS"), "vermelho");
    assert.equal(teamColor("codex"), "amarelo");
    assert.equal(teamColor("Time Logics"), "azul");
    assert.equal(teamColor(null), "cinza");
    assert.ok(TEAM_COLOR_CLASSES[teamColor("NEXUS")].card.includes("rose"));

    const original = [...DEFAULT_TEAMS];
    const shuffled = shuffleTeams(original);
    assert.equal(shuffled.length, original.length);
    assert.deepEqual([...shuffled].sort(), [...original].sort());
    assert.deepEqual(original, DEFAULT_TEAMS);
  });
});
