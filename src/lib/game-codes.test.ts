import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  DEFAULT_ADMIN_CONFIG,
  DEFAULT_MASTER_CODE,
  loadAdminConfig,
  saveAdminConfig,
  redeemCode,
  loadUnlocked,
  clearUnlocked,
} from "./game-codes.ts";
import { ALL_GAME_IDS } from "./game-storage.ts";

describe("Liberação Inicial de Jogos e Controle de Bloqueio com SEMED26", () => {
  it("inicia por padrão com jogos liberados (requireCodeGate === false)", () => {
    assert.equal(DEFAULT_ADMIN_CONFIG.requireCodeGate, false);
    assert.equal(DEFAULT_ADMIN_CONFIG.masterCode, "SEMED26");
  });

  it("permite resgatar o código Master SEMED26 para liberar todos os jogos habilitados", () => {
    clearUnlocked();
    const res = redeemCode("SEMED26", {
      ...DEFAULT_ADMIN_CONFIG,
      requireCodeGate: true,
      masterCode: "SEMED26",
    });
    assert.equal(res.status, "all");
    if (res.status === "all") {
      assert.ok(res.games.length >= ALL_GAME_IDS.length);
    }
  });

  it("respeita jogos desmarcados para que não sejam visíveis ou resgatados", () => {
    const customConfig = {
      ...DEFAULT_ADMIN_CONFIG,
      enabledGames: {
        ...DEFAULT_ADMIN_CONFIG.enabledGames,
        logica: false, // desmarcado pelo ADM
      },
    };
    assert.equal(customConfig.enabledGames.logica, false);
    assert.equal(customConfig.enabledGames.cartesiano, true);

    const res = redeemCode(customConfig.gameCodes.logica, customConfig);
    assert.equal(res.status, "disabled");

    // Master code SEMED26 também ignora jogos desmarcados
    const allRes = redeemCode("SEMED26", customConfig);
    if (allRes.status === "all") {
      assert.equal(allRes.games.includes("logica"), false);
      assert.equal(allRes.games.includes("cartesiano"), true);
    }
  });

  it("salva e carrega configuração permitindo travar com SEMED26 e destravar", () => {
    const locked = saveAdminConfig({
      ...DEFAULT_ADMIN_CONFIG,
      requireCodeGate: true,
    });
    assert.equal(locked.requireCodeGate, true);

    const unlocked = saveAdminConfig({
      ...DEFAULT_ADMIN_CONFIG,
      requireCodeGate: false,
    });
    assert.equal(unlocked.requireCodeGate, false);
  });

  it("salva e carrega avisos personalizados com duração de exibição customizada em segundos", () => {
    const configWithNotices = saveAdminConfig({
      ...DEFAULT_ADMIN_CONFIG,
      noticeSlides: [
        {
          id: "notice_1",
          title: "Aviso Rápido",
          message: "Este slide dura 5 segundos",
          badgeLabel: "NOVIDADE",
          type: "announcement",
          durationSeconds: 5,
          active: true,
          createdAt: new Date().toISOString(),
        },
        {
          id: "notice_2",
          title: "Aviso Longo",
          message: "Este slide dura 15 segundos",
          badgeLabel: "DESTAQUE",
          type: "game_highlight",
          featuredGameId: "rpg",
          durationSeconds: 15,
          active: true,
          createdAt: new Date().toISOString(),
        },
      ],
    });

    assert.equal(configWithNotices.noticeSlides?.length, 2);
    assert.equal(configWithNotices.noticeSlides?.[0].durationSeconds, 5);
    assert.equal(configWithNotices.noticeSlides?.[1].durationSeconds, 15);
  });

  it("inicia por padrão com todos os jogos no nível 1 e spacequest em modo apenas ADM", () => {
    const cfg = loadAdminConfig();
    assert.equal(cfg.gameLevelRequirements?.logica, 1);
    assert.equal(cfg.gameLevelRequirements?.spacequest, 1);
    assert.equal(cfg.adminOnlyGames?.spacequest, true);
  });

  it("salva e carrega requisitos de nível e modos apenas ADM por jogo", () => {
    const updated = saveAdminConfig({
      ...DEFAULT_ADMIN_CONFIG,
      gameLevelRequirements: {
        ...DEFAULT_ADMIN_CONFIG.gameLevelRequirements!,
        spacequest: 4,
        rpg: 2,
      },
      adminOnlyGames: {
        ...DEFAULT_ADMIN_CONFIG.adminOnlyGames,
        spacequest: false, // ADM liberou para todos
        rpg: true, // ADM colocou em manutenção
      },
    });

    assert.equal(updated.gameLevelRequirements?.spacequest, 4);
    assert.equal(updated.gameLevelRequirements?.rpg, 2);
    assert.equal(updated.adminOnlyGames?.spacequest, false);
    assert.equal(updated.adminOnlyGames?.rpg, true);
  });
});
