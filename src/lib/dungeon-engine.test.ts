import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { createCardDefinition, type CardDefinition, type CardRarity } from "./cards-catalog.ts";
import {
  DUNGEON_FALLBACK_TEST_CARDS,
  DUNGEON_MAX_STAMINA,
} from "./dungeon-config.ts";
import {
  advanceToNextDungeonFloor,
  aggregateDungeonLoadout,
  applyEncounterDamage,
  canAdvanceToFloor,
  canStartFromPortal,
  completeGuardianFloor,
  consumeDungeonFloorStamina,
  craftDungeonRecipe,
  createDefaultDungeonState,
  extractDungeonRun,
  generateDungeonInteraction,
  generateDungeonPuzzle,
  generateDungeonQuestion,
  generateFloorEncounters,
  getDungeonAccessForLevel,
  getFloorProgressStats,
  mergeDungeonStates,
  recordExternalMatchForDungeonStamina,
  resolveCardDungeonBonus,
  resolveDungeonDefeat,
  startDungeonRun,
  validateAlignNotes,
  validateDungeonLoadout,
  validateFitKey,
  validateTrapTiles,
} from "./dungeon-engine.ts";

function makeDeterministicRng(seed = 12345): () => number {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(1664525, s) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

function makeCard(
  id: string,
  name: string,
  rarity: CardRarity,
  isFoil = false,
  skill?: CardDefinition["dungeonSkillId"],
): CardDefinition {
  const base = createCardDefinition({
    name,
    description: "Carta de teste",
    rarity,
    imageUrl: "/favicon.png",
    isFoil,
    dungeonSkillId: skill,
  }).card!;
  return { ...base, id };
}

describe("Motor da Masmorra (Expedição Lógica)", () => {
  it("bloqueia acesso abaixo do Nível 5, limita Níveis 5-9 aos Andares 1-10 e libera 1-15 no Nível 10+", () => {
    for (const lvl of [1, 2, 3, 4]) {
      const access = getDungeonAccessForLevel(lvl);
      assert.equal(access.unlocked, false);
      assert.equal(access.maxAllowedFloor, 0);
    }

    for (const lvl of [5, 7, 9]) {
      const access = getDungeonAccessForLevel(lvl);
      assert.equal(access.unlocked, true);
      assert.equal(access.maxAllowedFloor, 10);

      const st = createDefaultDungeonState("2026-11-22");
      st.progression.unlockedCheckpoints = [1, 5, 10];
      assert.equal(canStartFromPortal("portal_crypt", lvl, st).ok, true);
      assert.equal(canStartFromPortal("portal_forge", lvl, st).ok, true);
      assert.equal(canStartFromPortal("portal_observatory", lvl, st).ok, false);
      assert.equal(canAdvanceToFloor(10, lvl, st).ok, true);
      assert.equal(canAdvanceToFloor(11, lvl, st).ok, false);
    }

    const lvl10 = getDungeonAccessForLevel(10);
    assert.equal(lvl10.unlocked, true);
    assert.equal(lvl10.maxAllowedFloor, 15);
    const st10 = createDefaultDungeonState("2026-11-22");
    st10.progression.unlockedCheckpoints = [1, 5, 10];
    assert.equal(canStartFromPortal("portal_observatory", 10, st10).ok, true);
    assert.equal(canAdvanceToFloor(15, 10, st10).ok, true);
  });

  it("consome 1 de estamina por andar e recarrega +1 a cada 3 partidas e 5/5 com 10 partidas em >=3 jogos", () => {
    let state = createDefaultDungeonState("2026-11-22");
    assert.equal(state.stamina.current, DUNGEON_MAX_STAMINA);

    // Gasta toda a estamina (5 andares)
    for (let i = 0; i < 5; i++) {
      const res = consumeDungeonFloorStamina(state);
      assert.equal(res.ok, true);
      state = res.state;
    }
    assert.equal(state.stamina.current, 0);
    const blocked = consumeDungeonFloorStamina(state);
    assert.equal(blocked.ok, false);

    // 3 partidas no mesmo jogo -> +1 estamina
    for (let i = 0; i < 3; i++) {
      const r = recordExternalMatchForDungeonStamina(state, "logica", "2026-11-22");
      state = r.state;
    }
    assert.equal(state.stamina.current, 1);
    assert.equal(state.stamina.matchesSinceLastPoint, 0);

    // Mais 7 partidas no mesmo jogo (< 3 jogos distintos): completa 10 partidas mas NÃO ativa recarga total 5/5
    for (let i = 0; i < 7; i++) {
      const r = recordExternalMatchForDungeonStamina(state, "logica", "2026-11-22");
      state = r.state;
      assert.equal(r.triggeredFullRecharge, false);
    }
    // Total = 10 partidas, ganhou +1 (3), +1 (6), +1 (9) -> estamina = 3, não 5!
    assert.equal(state.stamina.current, 3);
    assert.equal(state.stamina.crossGameCycle.distinctGamesPlayed.length, 1);

    // Novo dia reinicia o ciclo diário cross-game; vamos consumir até 0 e testar 10 partidas em 3 jogos distintos
    while (state.stamina.current > 0) {
      state = consumeDungeonFloorStamina(state).state;
    }
    const rReset = recordExternalMatchForDungeonStamina(state, "cartesiano", "2026-11-23");
    state = rReset.state;
    assert.equal(state.stamina.crossGameCycle.dateKey, "2026-11-23");
    assert.equal(state.stamina.crossGameCycle.totalMatches, 1);

    const games = ["cartesiano", "memoria", "porcentagem", "robogrid"] as const;
    let triggeredFull = false;
    for (let i = 1; i < 10; i++) {
      const res = recordExternalMatchForDungeonStamina(
        state,
        games[i % games.length],
        "2026-11-23",
      );
      state = res.state;
      if (res.triggeredFullRecharge) triggeredFull = true;
    }
    assert.equal(triggeredFull, true);
    assert.equal(state.stamina.current, DUNGEON_MAX_STAMINA);
    assert.equal(state.stamina.crossGameCycle.totalMatches, 0);
  });

  it("exige exatamente 3 cartas possuídas e calcula bônus por raridade, Foil (+3%) e singularidade", () => {
    const catalog = [
      makeCard("c1", "Carta Comum", "comum", false, "chronomancer"),
      makeCard("c2", "Carta Incomum", "incomum", false, "chronomancer"),
      makeCard("c3", "Carta Rara", "rara", false, "chronomancer"),
      makeCard("c4", "Carta Épica", "epica", false, "chronomancer"),
      makeCard("c5", "Carta Lendária", "lendaria", false, "chronomancer"),
      makeCard("c5f", "Carta Lendária", "lendaria", true, "chronomancer"),
    ];

    const bonuses = catalog.slice(0, 5).map(resolveCardDungeonBonus);
    for (let i = 1; i < bonuses.length; i++) {
      assert.ok(
        bonuses[i].totalPowerPercent > bonuses[i - 1].totalPowerPercent,
        "Raridade maior deve conceder bônus maior",
      );
    }

    const normalLeg = resolveCardDungeonBonus(catalog[4]);
    const foilLeg = resolveCardDungeonBonus(catalog[5]);
    assert.equal(foilLeg.foilBonusPercent, 3);
    assert.ok(foilLeg.totalPowerPercent > normalLeg.totalPowerPercent);

    // Duas cartas diferentes da mesma raridade e mesma habilidade têm bônus distintos
    const uniqueA = makeCard("u_alpha", "Alfa", "rara", false, "miner");
    const uniqueB = makeCard("u_beta", "Beta", "rara", false, "miner");
    const bA = resolveCardDungeonBonus(uniqueA);
    const bB = resolveCardDungeonBonus(uniqueB);
    assert.notEqual(
      `${bA.totalPowerPercent}|${bA.secondaryPerkLabel}`,
      `${bB.totalPowerPercent}|${bB.secondaryPerkLabel}`,
    );

    const owned = { c1: 1, c2: 1, c3: 2 };
    assert.equal(validateDungeonLoadout(["c1", "c2"], owned, catalog).valid, false);
    assert.equal(validateDungeonLoadout(["c1", "c1", "c2"], owned, catalog).valid, false);
    assert.equal(validateDungeonLoadout(["c1", "c2", "c4"], owned, catalog).valid, false);
    const valid = validateDungeonLoadout(["c1", "c2", "c3"], owned, catalog);
    assert.equal(valid.valid, true);
    assert.equal(valid.cards.length, 3);

    const agg = aggregateDungeonLoadout([
      makeCard("a1", "Crono", "epica", false, "chronomancer"),
      makeCard("a2", "Égide", "lendaria", true, "aegis"),
      makeCard("a3", "Explorador", "rara", false, "explorer"),
    ]);
    assert.ok(agg.extraTimerSeconds > 0);
    assert.equal(agg.errorShieldsPerFloor, 2);
    assert.equal(agg.revealProgressIcons, true);
  });

  it("gera andares procedurais com 1-3 combates, 1-2 puzzles, 2-6 questões, interações e Guardião nos andares 5/10/15", () => {
    const rng = makeDeterministicRng(99);
    for (const floor of [1, 3, 5, 8, 10, 14, 15]) {
      const encounters = generateFloorEncounters(floor, rng);
      const combats = encounters.filter((e) => e.kind === "combat").length;
      const puzzles = encounters.filter((e) => e.kind === "puzzle").length;
      const questions = encounters.filter((e) => e.kind === "question").length;
      const interactions = encounters.filter((e) => e.kind === "interaction").length;
      const guardians = encounters.filter((e) => e.kind === "guardian").length;

      assert.ok(combats >= 1 && combats <= 3, `Andar ${floor} combates=${combats}`);
      assert.ok(puzzles >= 1 && puzzles <= 2, `Andar ${floor} puzzles=${puzzles}`);
      assert.ok(questions >= 2 && questions <= 6, `Andar ${floor} questoes=${questions}`);
      assert.ok(interactions >= 2 && interactions <= 3, `Andar ${floor} interacoes=${interactions}`);

      if (floor % 5 === 0) {
        assert.equal(guardians, 1);
        assert.equal(encounters[encounters.length - 1].kind, "guardian");
      } else {
        assert.equal(guardians, 0);
      }

      for (const enc of encounters) {
        assert.ok(enc.narrativeIntro.length > 10);
      }
    }

    const cards = DUNGEON_FALLBACK_TEST_CARDS.slice(0, 3);
    const startRes = startDungeonRun({
      state: createDefaultDungeonState("2026-11-22"),
      startFloor: 1,
      level: 6,
      equippedCards: cards,
      rng: makeDeterministicRng(7),
    });
    assert.equal(startRes.ok, true);
    assert.equal(startRes.state.stamina.current, 4);
    assert.deepEqual(
      startRes.state.loadout.equippedCardIds,
      cards.map((c) => c.id),
    );

    const run = startRes.state.currentRun!;
    assert.equal(getFloorProgressStats(run).percent, 0);
    run.encounters[0].completed = true;
    const midProg = getFloorProgressStats(run);
    assert.equal(midProg.completed, 1);
    assert.ok(midProg.percent > 0 && midProg.percent < 100);
  });

  it("gera desafios jogáveis e valida todas as microinterações", () => {
    const rng = makeDeterministicRng(42);
    for (const sub of ["arithmetic", "comparison", "variable", "percent"]) {
      const q = generateDungeonQuestion(7, sub, rng);
      assert.ok(q.prompt.length > 4);
      assert.ok(q.correctIndex >= 0 && q.correctIndex < q.options.length);
    }

    const seq = generateDungeonPuzzle(4, "number_sequence", rng);
    assert.equal(seq.kind, "number_sequence");
    assert.equal(seq.options.length, 4);

    const circuit = generateDungeonPuzzle(8, "logic_circuit", rng);
    assert.equal(circuit.kind, "logic_circuit");
    assert.equal(circuit.options.length, 2);

    const grid = generateDungeonPuzzle(12, "magic_grid", rng);
    assert.equal(grid.kind, "magic_grid");
    if (grid.kind === "magic_grid") {
      assert.equal(grid.cells.filter((c) => c === null).length, 1);
    }

    const key = generateDungeonInteraction(6, "fit_key", rng);
    if (key.kind === "fit_key") {
      assert.equal(validateFitKey(key.targetPins, key.targetPins), true);
      assert.equal(validateFitKey([9, 9, 9, 9], key.targetPins), false);
    }

    const notes = generateDungeonInteraction(3, "align_notes", rng);
    if (notes.kind === "align_notes") {
      assert.equal(validateAlignNotes(notes.initialNotes), false);
      assert.equal(
        validateAlignNotes([...notes.initialNotes].sort((a, b) => a - b)),
        true,
      );
    }

    const traps = generateDungeonInteraction(5, "trap_tiles", rng);
    if (traps.kind === "trap_tiles") {
      const safe = [0, 1, 2, 3, 4, 5, 6, 7, 8].filter(
        (idx) => !traps.trapIndices.includes(idx),
      );
      assert.equal(validateTrapTiles(safe.slice(0, 3), traps.trapIndices), true);
      assert.equal(
        validateTrapTiles([traps.trapIndices[0], safe[0], safe[1]], traps.trapIndices),
        false,
      );
    }

    const crystal = generateDungeonInteraction(11, "clean_crystal", rng);
    if (crystal.kind === "clean_crystal") {
      assert.equal(crystal.dustSpots.length, 4);
    }
  });

  it("gerencia extração 100%, derrota com retenção segura, Guardião + Checkpoint, Forja e merge de nuvem", () => {
    const cards = [
      makeCard("k1", "Bolso", "rara", false, "pocket"),
      makeCard("k2", "Égide", "epica", false, "aegis"),
      makeCard("k3", "Crono", "incomum", false, "chronomancer"),
    ];

    let st = createDefaultDungeonState("2026-11-22");
    st = startDungeonRun({
      state: st,
      startFloor: 1,
      level: 8,
      equippedCards: cards,
      rng: makeDeterministicRng(15),
    }).state;

    // Simula escudo absorvendo 1º dano e depois derrota
    const dmg1 = applyEncounterDamage(st.currentRun!, 25, aggregateDungeonLoadout(cards));
    assert.equal(dmg1.absorbedByShield, true);
    assert.equal(dmg1.damageTaken, 0);
    st.currentRun = dmg1.run;
    st.currentRun.tempBackpack = { paper_fragment: 10, arcane_dust: 10 };

    const defeatRes = resolveDungeonDefeat(st, cards);
    assert.ok(defeatRes.retentionRate > 0.3);
    assert.equal(defeatRes.state.currentRun, null);
    assert.ok((defeatRes.keptResources.paper_fragment ?? 0) >= 5);
    assert.equal(
      (defeatRes.keptResources.paper_fragment ?? 0) +
        (defeatRes.lostResources.paper_fragment ?? 0),
      10,
    );

    // Avança até o Andar 5 e derrota o Guardião -> desbloqueia Checkpoint 5 + extrai + Selo
    st = startDungeonRun({
      state: defeatRes.state,
      startFloor: 1,
      level: 8,
      equippedCards: cards,
      rng: makeDeterministicRng(21),
    }).state;
    st = advanceToNextDungeonFloor({
      state: st,
      level: 8,
      equippedCards: cards,
      rng: makeDeterministicRng(22),
    }).state;
    assert.equal(st.currentRun?.currentFloor, 2);
    st.currentRun!.tempBackpack = { paper_fragment: 4, arcane_dust: 2 };
    st.currentRun!.currentFloor = 5;

    const bossRes = completeGuardianFloor(st, 5);
    assert.equal(bossRes.unlockedCheckpoint, 5);
    assert.equal(bossRes.chestId, "weekly_common");
    assert.ok(bossRes.state.progression.unlockedCheckpoints.includes(5));
    assert.ok((bossRes.state.permanentResources.guardian_sigil ?? 0) >= 1);

    // Extração voluntária guarda 100%
    st = startDungeonRun({
      state: bossRes.state,
      startFloor: 6,
      level: 8,
      equippedCards: cards,
      rng: makeDeterministicRng(33),
    }).state;
    st.currentRun!.tempBackpack = { logic_ore: 5 };
    const ext = extractDungeonRun(st);
    assert.equal(ext.extractedResources.logic_ore, 5);
    assert.equal(ext.state.permanentResources.logic_ore, 5);
    assert.equal(ext.state.currentRun, null);

    // Crafting na aba Forja & Alquimia
    const craftFail = craftDungeonRecipe(ext.state, "craft_pack_supremo");
    assert.equal(craftFail.ok, false);

    const beforePaper = ext.state.permanentResources.paper_fragment ?? 0;
    const beforeDust = ext.state.permanentResources.arcane_dust ?? 0;
    const craftOk = craftDungeonRecipe(ext.state, "craft_pack_basico");
    assert.equal(craftOk.ok, true);
    assert.equal(craftOk.recipe?.targetId, "pack_basico");
    assert.equal(craftOk.state.permanentResources.paper_fragment ?? 0, beforePaper - 4);
    assert.equal(craftOk.state.permanentResources.arcane_dust ?? 0, beforeDust - 2);

    // Merge preserva progressão monotonicamente
    const local = createDefaultDungeonState("2026-11-22");
    local.progression.highestFloorReached = 9;
    local.progression.unlockedCheckpoints = [1, 5];
    local.updatedAt = "2026-11-22T12:00:00.000Z";

    const cloud = createDefaultDungeonState("2026-11-22");
    cloud.progression.highestFloorReached = 4;
    cloud.progression.unlockedCheckpoints = [1, 5, 10];
    cloud.progression.bossesDefeated = [5, 10];
    cloud.updatedAt = "2026-11-22T11:00:00.000Z";

    const merged = mergeDungeonStates(local, cloud, true);
    assert.equal(merged.progression.highestFloorReached, 9);
    assert.deepEqual(merged.progression.unlockedCheckpoints, [1, 5, 10]);
    assert.deepEqual(merged.progression.bossesDefeated, [5, 10]);
  });
});
