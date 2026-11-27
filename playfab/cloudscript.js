///////////////////////////////////////////////////////////////////////////////
// Microsoft Azure PlayFab — CloudScript Oficial da Plataforma Desafios de Lógica
// Como usar no PlayFab Game Manager:
//   1. Acesse o painel do seu título no PlayFab (https://developer.playfab.com)
//   2. Vá em: Automation -> CloudScript -> Revisions (Legacy)
//   3. Cole este código e clique em "Save and deployrevision"
///////////////////////////////////////////////////////////////////////////////

// Limites máximos plausíveis por partida para validação Anti-Cheat no servidor
var CLOUDSCRIPT_VERSION = "3.0.0";

var MAX_SCORE_BY_GAME = {
  logica: 480,
  cartesiano: 900,
  formas: 800,
  memoria: 800,
  variaveis: 1000,
  robogrid: 1000,
  porcentagem: 900,
  minado: 350,
  completar: 900,
  rpg: 3000,
  spacequest: 3000
};

var CRITICAL_CONFIG_COLLECTIONS = [
  "specialEvents",
  "recurringEvents",
  "noticeSlides",
  "customMedals",
  "customNotifications",
  "inboxMessages",
  "scheduledInboxRules",
  "cardsCatalog",
  "cardPacks",
  "chestsCatalog",
  "avatarsCatalog",
  "aurasCatalog"
];

var DOMAIN_CONFIG_KEYS = {
  games: [
    "enabledGames",
    "gameCodes",
    "masterCode",
    "requireCodeGate",
    "showCodeGateCardOnHome",
    "dailyXpCap",
    "gameLevelRequirements",
    "adminOnlyGames",
    "useVersionedSeasonStats",
    "playfabTitleId",
    "rolloutFlags"
  ],
  x1: [
    "x1Enabled",
    "x1ArenaClosed",
    "x1OpenHour",
    "x1CloseHour",
    "x1MinLevel",
    "x1ForceOpen",
    "x1AvailableGames",
    "x1RotationMinutes",
    "x1MinadoGridSize"
  ],
  notices: [
    "noticeSlides",
    "enabledDefaultNotices",
    "hideAllDefaultNotices",
    "pauseNoticeBoard"
  ],
  events: ["specialEvents", "events", "recurringEvents"],
  medals: ["customMedals", "customNotifications"],
  inbox: ["inboxMessages", "canceledInboxMessageIds", "scheduledInboxRules"],
  cards: ["cardsCatalog", "cardPacks", "foilDuplicatesSeededV2", "cardFoilChancePercent"],
  store: ["chestsCatalog", "avatarsCatalog", "aurasCatalog", "cardPacks", "coinRewardsConfig", "weeklyRoutineConfig"],
  season: [
    "seasonId",
    "seasonName",
    "seasonStartAt",
    "seasonEndAt",
    "seasonDurationDays",
    "autoRenewSeason",
    "lastResetAt",
    "scheduledResetAt",
    "scheduledResetClearXp",
    "activitySeasonId",
    "activitySeasonName",
    "activitySeasonStartAt",
    "activitySeasonEndAt",
    "activitySeasonDurationDays",
    "isBetaActive",
    "rankedSeasonId",
    "rankedSeasonName",
    "rankedSeasonStartAt",
    "rankedSeasonEndAt",
    "rankedSeasonDurationDays",
    "rankedAutoRenewSeason",
    "rankedOpenHour",
    "rankedCloseHour",
    "rankedForceOpen",
    "tournamentEnabled",
    "tournamentGameOverride",
    "rankedMilestoneRewards",
    "resetHistory"
  ]
};

function hasOwn(obj, key) {
  return Boolean(obj) && Object.prototype.hasOwnProperty.call(obj, key);
}

function getObjectKeys(obj) {
  var list = [];
  if (!obj || typeof obj !== "object") return list;
  for (var k in obj) {
    if (hasOwn(obj, k)) list.push(k);
  }
  return list;
}

handlers.GetCloudScriptInfo = function (args, context) {
  return {
    ok: true,
    version: CLOUDSCRIPT_VERSION,
    handlers: getObjectKeys(handlers)
  };
};

handlers.VerifyAdminSession = function (args, context) {
  return {
    ok: true,
    isAdmin: isAuthorizedAdmin(currentPlayerId),
    playFabId: currentPlayerId || null,
    version: CLOUDSCRIPT_VERSION
  };
};

var ALLOWED_SCHOOL_SLUGS = {
  nenhuma: true,
  raimundo_bezerra: true,
  agenor_smith: true,
  elisangela_litaiff: true,
  raimunda_cruz: true,
  maria_de_nazare: true,
  ursulina_souza: true,
  outro: true
};

function getCoariDateKeyFromNow() {
  var now = new Date(Date.now() - 4 * 60 * 60 * 1000);
  var y = now.getUTCFullYear();
  var m = String(now.getUTCMonth() + 1);
  var d = String(now.getUTCDate());
  if (m.length < 2) m = "0" + m;
  if (d.length < 2) d = "0" + d;
  return y + "-" + m + "-" + d;
}

/**
 * Verifica no servidor se o jogador atual (currentPlayerId) é um administrador autorizado.
 * Configure a chave "AdminPlayFabIds" em Title Internal Data no PlayFab Game Manager
 * com os PlayFabIds dos administradores (ex: ["PLAYFAB_ID_1","PLAYFAB_ID_2"]).
 */
function isAuthorizedAdmin(playerId) {
  if (!playerId) return false;
  try {
    var internal = server.GetTitleInternalData({ Keys: ["AdminPlayFabIds"] });
    var raw = internal && internal.Data && internal.Data.AdminPlayFabIds;
    if (raw) {
      var list = JSON.parse(raw);
      if (Array.isArray(list) && list.indexOf(playerId) !== -1) {
        return true;
      }
    }
  } catch (e) {
    // Fallback para UserInternalData abaixo
  }
  try {
    var userInt = server.GetUserInternalData({
      PlayFabId: playerId,
      Keys: ["IsAdmin"]
    });
    if (userInt && userInt.Data && userInt.Data.IsAdmin && userInt.Data.IsAdmin.Value === "true") {
      return true;
    }
  } catch (e2) {
    // Ignora
  }
  return false;
}

function isValidSeasonXpStatName(name) {
  if (name === "XP_Season_Current") return true;
  if (/^XP_Season_etapa_[123]$/.test(name)) return true;
  if (/^XP_Season_S\d+(?:_etapa_[123])?$/.test(name)) return true;
  return false;
}

function parseBestStatGame(name) {
  var m = name.match(/^Best_([a-z0-9]+)(?:_(?:Current|etapa_[123]))?$/);
  if (!m) return "";
  return hasOwn(MAX_SCORE_BY_GAME, m[1]) ? m[1] : "";
}

function mergeAdminConfigWithProtection(existing, incoming, args) {
  var domain = String((args && args.domain) || "all");
  var allowSeasonChange = Boolean(args && args.allowSeasonChange);
  var allowEmpty = Array.isArray(args && args.allowEmptyCollections) ? args.allowEmptyCollections : [];
  var force = Boolean(args && args.force);
  var base = {};
  var k;

  if (existing && typeof existing === "object") {
    for (k in existing) {
      if (hasOwn(existing, k)) base[k] = existing[k];
    }
  }

  if (domain === "all" || !existing || getObjectKeys(existing).length === 0) {
    for (k in incoming) {
      if (hasOwn(incoming, k)) base[k] = incoming[k];
    }
  } else {
    var domainKeys = DOMAIN_CONFIG_KEYS[domain] || [];
    for (var i = 0; i < domainKeys.length; i++) {
      var dk = domainKeys[i];
      if (hasOwn(incoming, dk)) base[dk] = incoming[dk];
    }
  }

  // Trava anti-wipe em coleções críticas (preserva dados existentes contra sobrescrita acidental por array vazio)
  if (!force && existing && typeof existing === "object") {
    for (var j = 0; j < CRITICAL_CONFIG_COLLECTIONS.length; j++) {
      var colKey = CRITICAL_CONFIG_COLLECTIONS[j];
      var prevArr = existing[colKey];
      var nextArr = base[colKey];
      if (
        Array.isArray(prevArr) &&
        prevArr.length > 0 &&
        Array.isArray(nextArr) &&
        nextArr.length === 0 &&
        allowEmpty.indexOf(colKey) === -1
      ) {
        base[colKey] = prevArr;
      }
    }
    if (domain !== "season" && !allowSeasonChange) {
      if (typeof existing.seasonId === "number") base.seasonId = existing.seasonId;
      if (typeof existing.seasonName === "string") base.seasonName = existing.seasonName;
      if (typeof existing.rankedSeasonId === "number") base.rankedSeasonId = existing.rankedSeasonId;
    }
  }

  return base;
}

/**
 * Registra o resultado de uma partida com validação Anti-Cheat no servidor
 * e atualiza os Leaderboards do PlayFab (XP_Total, XP_Season, Best_<gameId>, School_<slug>_XP).
 */
handlers.RecordMatchResult = function (args, context) {
  var gameId = String((args && args.gameId) || "logica");
  var score = Math.max(0, Math.floor(Number(args && args.score) || 0));
  var maxAllowed = MAX_SCORE_BY_GAME[gameId] || 1000;

  // Proteção Anti-Cheat: limita scores adulterados via DevTools
  if (score > maxAllowed) {
    score = maxAllowed;
  }

  var rawStats = Array.isArray(args && args.statistics) ? args.statistics : [];
  var statsToUpdate = [];
  for (var i = 0; i < rawStats.length; i++) {
    var st = rawStats[i];
    if (!st || typeof st.StatisticName !== "string") continue;
    var name = st.StatisticName;
    var val = Math.max(0, Math.floor(Number(st.Value) || 0));

    if (name === "XP_Total" || isValidSeasonXpStatName(name)) {
      if (val > 1000000) val = 1000000;
    } else if (name === "Medals_Total") {
      if (val > 500) val = 500;
    } else if (name.indexOf("Best_") === 0) {
      // Valida contra o teto do próprio jogo da estatística (inclui Best_<game>_Current / Best_<game>_etapa_*)
      var statGame = parseBestStatGame(name);
      if (!statGame) continue;
      var gameCap = MAX_SCORE_BY_GAME[statGame];
      if (val > gameCap) val = gameCap;
    } else if (name.indexOf("School_") === 0) {
      // Aceita apenas estatísticas de escolas oficiais da allowlist (School_<slug>_XP)
      var schoolMatch = name.match(/^School_([a-z0-9_]+)_XP$/);
      if (!schoolMatch || !ALLOWED_SCHOOL_SLUGS[schoolMatch[1]]) continue;
      if (val > 1000000) val = 1000000;
    } else {
      continue;
    }

    statsToUpdate.push({
      StatisticName: name,
      Value: val
    });
  }

  if (statsToUpdate.length > 0) {
    server.UpdatePlayerStatistics({
      PlayFabId: currentPlayerId,
      Statistics: statsToUpdate
    });
  }

  return {
    ok: true,
    validatedScore: score,
    playerId: currentPlayerId
  };
};

handlers.GetPlatformAdminConfig = function (args, context) {
  var existing = server.GetTitleData({ Keys: ["PlatformAdminConfig"] });
  var cfg = null;
  if (existing && existing.Data && existing.Data.PlatformAdminConfig) {
    try {
      cfg = JSON.parse(existing.Data.PlatformAdminConfig);
    } catch (e) {
      cfg = null;
    }
  }
  return {
    ok: true,
    config: cfg,
    version: CLOUDSCRIPT_VERSION
  };
};

/**
 * Salva as configurações globais do Painel do Administrador (ADM) no TitleData do PlayFab
 * com trava de revisão (configRevision), isolamento por domínio e proteção anti-wipe.
 */
handlers.SavePlatformAdminConfig = function (args, context) {
  if (!isAuthorizedAdmin(currentPlayerId)) {
    return { ok: false, error: "Acesso negado: permissão de administrador necessária." };
  }
  if (!args || !args.config || typeof args.config !== "object") {
    return { ok: false, error: "Configuração ausente." };
  }

  var existing = {};
  try {
    var existingRes = server.GetTitleData({ Keys: ["PlatformAdminConfig"] });
    if (existingRes && existingRes.Data && existingRes.Data.PlatformAdminConfig) {
      var parsedExisting = JSON.parse(existingRes.Data.PlatformAdminConfig);
      if (parsedExisting && typeof parsedExisting === "object") existing = parsedExisting;
    }
  } catch (e) {
    existing = {};
  }

  var existingRev = Math.max(0, Math.floor(Number(existing.configRevision) || 0));
  var hasIncomingRev = typeof args.config.configRevision === "number";
  var incomingRev = hasIncomingRev ? Math.max(0, Math.floor(args.config.configRevision)) : existingRev;

  if (existingRev > 0 && args.force !== true && hasIncomingRev && incomingRev < existingRev) {
    return {
      ok: false,
      conflict: true,
      existingRevision: existingRev,
      incomingRevision: incomingRev,
      error: "Conflito de revisão: recarregue a configuração mais recente antes de salvar."
    };
  }

  var merged = mergeAdminConfigWithProtection(existing, args.config, args);
  merged.configRevision = Math.max(existingRev, incomingRev) + 1;
  merged.updatedAt = new Date().toISOString();
  merged.updatedByPlayFabId = currentPlayerId;

  server.SetTitleData({
    Key: "PlatformAdminConfig",
    Value: JSON.stringify(merged)
  });
  return {
    ok: true,
    configRevision: merged.configRevision,
    updatedAt: merged.updatedAt
  };
};

/**
 * Registra no TitleData a abertura de uma nova temporada acionada pelo Administrador.
 */
handlers.AdminResetSeason = function (args, context) {
  if (!isAuthorizedAdmin(currentPlayerId)) {
    return { ok: false, error: "Acesso negado: permissão de administrador necessária." };
  }
  var existing = server.GetTitleData({ Keys: ["PlatformAdminConfig"] });
  var cfg = {};
  if (existing && existing.Data && existing.Data.PlatformAdminConfig) {
    try {
      cfg = JSON.parse(existing.Data.PlatformAdminConfig);
    } catch (e) {
      cfg = {};
    }
  }

  cfg.seasonId = (args && args.seasonId) || ((cfg.seasonId || 1) + 1);
  cfg.seasonName = (args && args.seasonName) || ("Temporada " + cfg.seasonId + " • SEMED Coari");
  cfg.lastResetAt = (args && args.lastResetAt) || new Date().toISOString();
  cfg.scheduledResetAt = null;
  cfg.configRevision = Math.max(0, Math.floor(Number(cfg.configRevision) || 0)) + 1;
  cfg.updatedAt = new Date().toISOString();
  cfg.updatedByPlayFabId = currentPlayerId;

  server.SetTitleData({
    Key: "PlatformAdminConfig",
    Value: JSON.stringify(cfg)
  });

  return { ok: true, seasonId: cfg.seasonId, configRevision: cfg.configRevision };
};

/**
 * Helper interno: anexa uma transação de auditoria ranqueada em UserReadOnlyData["RankedLedger"]
 * (verdade imutável no servidor, preservando os últimos 100 lançamentos com timestamp do servidor).
 */
function appendServerRankedLedger(playFabId, entry) {
  if (!playFabId || !entry) return [];
  var existing = [];
  try {
    var res = server.GetUserReadOnlyData({
      PlayFabId: playFabId,
      Keys: ["RankedLedger"]
    });
    if (res && res.Data && res.Data.RankedLedger && res.Data.RankedLedger.Value) {
      var parsed = JSON.parse(res.Data.RankedLedger.Value);
      if (Array.isArray(parsed)) existing = parsed;
    }
  } catch (e) {
    existing = [];
  }

  var fullEntry = {
    id: entry.id || ("srv_rnk_" + Date.now() + "_" + Math.floor(Math.random() * 100000)),
    type: "tournament_pts",
    source: entry.source || "torneio_semanal",
    amount: Math.round(Number(entry.amount) || 0),
    balanceAfter: Math.max(0, Math.round(Number(entry.balanceAfter) || 0)),
    reason: String(entry.reason || "Movimentação Ranqueada"),
    metadata: entry.metadata || undefined,
    timestamp: new Date().toISOString()
  };

  existing.push(fullEntry);
  if (existing.length > 100) {
    existing = existing.slice(existing.length - 100);
  }

  server.UpdateUserReadOnlyData({
    PlayFabId: playFabId,
    Data: {
      RankedLedger: JSON.stringify(existing)
    },
    Permission: "Public"
  });

  return existing;
}

/**
 * Registra uma partida da Ranqueada de forma autoritativa no servidor:
 * - Valida a pontuação (base 10 - erros, piso 1) e aplica teto anti-abuso;
 * - Atualiza o Leaderboard oficial `Ranked_Season_<N>` no PlayFab;
 * - Grava o lançamento imutável no `UserReadOnlyData["RankedLedger"]`.
 */
handlers.RecordRankedMatch = function (args, context) {
  var seasonId = Math.max(1, Math.floor(Number(args && args.seasonId) || 1));
  var gameId = String((args && args.gameId) || "logica");
  var correct = Math.max(0, Math.floor(Number(args && args.correct) || 0));
  var wrong = Math.max(0, Math.floor(Number(args && args.wrong) || 0));
  var score = Math.max(0, Math.floor(Number(args && args.score) || 0));
  var rawDelta = Math.max(0, Math.floor(Number(args && args.pointsDelta) || 0));
  var requestedDailyBonus = Boolean(args && args.dailyBonusAwarded);

  // Fórmula autoritativa no servidor: base = max(0, 10 - wrong), máx 3x de evento
  var baseMatchPoints = Math.max(0, 10 - wrong);
  var maxMatchDelta = baseMatchPoints * 3;
  var grantedDailyBonus = false;
  var todayKey = getCoariDateKeyFromNow();

  if (requestedDailyBonus && wrong === 0) {
    try {
      var internalBonus = server.GetUserInternalData({
        PlayFabId: currentPlayerId,
        Keys: ["RankedDailyBonusDate"]
      });
      var lastBonusDate =
        internalBonus &&
        internalBonus.Data &&
        internalBonus.Data.RankedDailyBonusDate &&
        internalBonus.Data.RankedDailyBonusDate.Value;
      if (lastBonusDate !== todayKey) {
        grantedDailyBonus = true;
      }
    } catch (e) {
      grantedDailyBonus = false;
    }
  }

  var maxSingleMatchDelta = maxMatchDelta + (grantedDailyBonus ? 25 : 0);
  var safeDelta = Math.min(rawDelta, maxSingleMatchDelta);
  var statName = "Ranked_Season_" + seasonId;

  var currentVal = 0;
  try {
    var curStats = server.GetPlayerStatistics({
      PlayFabId: currentPlayerId,
      StatisticNames: [statName]
    });
    if (curStats && Array.isArray(curStats.Statistics) && curStats.Statistics.length > 0) {
      currentVal = Math.max(0, Math.floor(Number(curStats.Statistics[0].Value) || 0));
    }
  } catch (e) {
    currentVal = 0;
  }

  // Nunca confia em args.newTournamentPoints enviado pelo cliente: soma apenas o delta validado ao saldo real
  var nextTotal = currentVal + safeDelta;

  server.UpdatePlayerStatistics({
    PlayFabId: currentPlayerId,
    Statistics: [{ StatisticName: statName, Value: nextTotal }]
  });

  if (grantedDailyBonus) {
    try {
      server.UpdateUserInternalData({
        PlayFabId: currentPlayerId,
        Data: { RankedDailyBonusDate: todayKey }
      });
    } catch (e2) {
      // Ignora falha não-crítica de marcação de bônus
    }
  }

  if (safeDelta > 0) {
    appendServerRankedLedger(currentPlayerId, {
      source: "torneio_semanal",
      amount: safeDelta,
      balanceAfter: nextTotal,
      reason: "Partida Ranqueada (" + gameId + " • " + correct + " acertos, " + wrong + " erros)" + (grantedDailyBonus ? " + Bônus 10 Perfeitas" : ""),
      metadata: { gameId: gameId, mode: "torneio_semanal", score: score, seasonId: seasonId }
    });
  }

  return { ok: true, seasonId: seasonId, pointsDelta: safeDelta, tournamentPoints: nextTotal };
};

/**
 * Deduz entrada paga (-5 pontos ranqueados) de forma autoritativa no servidor.
 */
handlers.SpendRankedPaidEntry = function (args, context) {
  var seasonId = Math.max(1, Math.floor(Number(args && args.seasonId) || 1));
  var cost = Math.max(1, Math.min(50, Math.floor(Number(args && args.cost) || 5)));
  var statName = "Ranked_Season_" + seasonId;

  var currentVal = 0;
  try {
    var curStats = server.GetPlayerStatistics({
      PlayFabId: currentPlayerId,
      StatisticNames: [statName]
    });
    if (curStats && Array.isArray(curStats.Statistics) && curStats.Statistics.length > 0) {
      currentVal = Math.max(0, Math.floor(Number(curStats.Statistics[0].Value) || 0));
    }
  } catch (e) {
    currentVal = 0;
  }

  // Anti-cheat estrito: rejeita imediatamente se o saldo real no servidor for menor que o custo
  if (currentVal < cost) {
    return {
      ok: false,
      error: "Pontos ranqueados insuficientes para pagar a entrada extra.",
      seasonId: seasonId,
      newPoints: currentVal
    };
  }

  var nextVal = currentVal - cost;

  server.UpdatePlayerStatistics({
    PlayFabId: currentPlayerId,
    Statistics: [{ StatisticName: statName, Value: nextVal }]
  });

  appendServerRankedLedger(currentPlayerId, {
    source: "torneio_semanal",
    amount: -cost,
    balanceAfter: nextVal,
    reason: "Entrada Extra Paga na Ranqueada (-" + cost + " pts)",
    metadata: { mode: "torneio_semanal", seasonId: seasonId }
  });

  return { ok: true, seasonId: seasonId, newPoints: nextVal };
};

/**
 * Ajuste manual administrativo de pontos ranqueados (protegido por isAuthorizedAdmin).
 */
handlers.AdminAdjustRankedPoints = function (args, context) {
  if (!isAuthorizedAdmin(currentPlayerId)) {
    return { ok: false, error: "Acesso negado: permissão de administrador necessária." };
  }
  var targetPlayFabId = String((args && args.targetPlayFabId) || "");
  if (!targetPlayFabId) {
    return { ok: false, error: "targetPlayFabId ausente." };
  }
  var seasonId = Math.max(1, Math.floor(Number(args && args.seasonId) || 1));
  var delta = Math.round(Number(args && args.delta) || 0);
  var explicitTotal = args && typeof args.newPoints === "number" ? Math.max(0, Math.floor(args.newPoints)) : null;
  var reason = String((args && args.reason) || "Ajuste Administrativo na Ranqueada");
  var statName = "Ranked_Season_" + seasonId;

  var currentVal = 0;
  try {
    var curStats = server.GetPlayerStatistics({
      PlayFabId: targetPlayFabId,
      StatisticNames: [statName]
    });
    if (curStats && Array.isArray(curStats.Statistics) && curStats.Statistics.length > 0) {
      currentVal = Math.max(0, Math.floor(Number(curStats.Statistics[0].Value) || 0));
    }
  } catch (e) {
    currentVal = 0;
  }

  var nextVal = explicitTotal !== null ? explicitTotal : Math.max(0, currentVal + delta);
  server.UpdatePlayerStatistics({
    PlayFabId: targetPlayFabId,
    Statistics: [{ StatisticName: statName, Value: nextVal }]
  });

  appendServerRankedLedger(targetPlayFabId, {
    source: "ajuste_adm",
    amount: delta !== 0 ? delta : (nextVal - currentVal),
    balanceAfter: nextVal,
    reason: "Ajuste ADM: " + reason,
    metadata: { adminPlayFabId: currentPlayerId, seasonId: seasonId }
  });

  return { ok: true, targetPlayFabId: targetPlayFabId, seasonId: seasonId, tournamentPoints: nextVal };
};

/**
 * Avança oficialmente a Temporada da Ranqueada no TitleData (apenas ADM).
 */
handlers.AdminResetRankedSeason = function (args, context) {
  if (!isAuthorizedAdmin(currentPlayerId)) {
    return { ok: false, error: "Acesso negado: permissão de administrador necessária." };
  }
  var existing = server.GetTitleData({ Keys: ["PlatformAdminConfig"] });
  var cfg = {};
  if (existing && existing.Data && existing.Data.PlatformAdminConfig) {
    try {
      cfg = JSON.parse(existing.Data.PlatformAdminConfig);
    } catch (e) {
      cfg = {};
    }
  }
  cfg.rankedSeasonId = (args && args.rankedSeasonId) || ((cfg.rankedSeasonId || 1) + 1);
  if (args && args.rankedSeasonName) cfg.rankedSeasonName = String(args.rankedSeasonName);
  cfg.configRevision = Math.max(0, Math.floor(Number(cfg.configRevision) || 0)) + 1;
  cfg.updatedAt = new Date().toISOString();
  cfg.updatedByPlayFabId = currentPlayerId;

  server.SetTitleData({
    Key: "PlatformAdminConfig",
    Value: JSON.stringify(cfg)
  });

  return { ok: true, rankedSeasonId: cfg.rankedSeasonId, configRevision: cfg.configRevision };
};

///////////////////////////////////////////////////////////////////////////////
// Sistema Seguro de Códigos Promocionais e QR Codes (Server-Side)
// Catálogo armazenado em TitleInternalData (invisível para jogadores).
// Rate limit e histórico de resgates do jogador em UserInternalData.
///////////////////////////////////////////////////////////////////////////////

var PROMO_TITLE_KEY_CATALOG = "PromoCodesCatalog";
var PROMO_TITLE_KEY_DELETED = "PromoCodesDeletedIds";
var PROMO_SHARED_GROUP_FALLBACK = "SEMED_PROMO_CODES_V1";

function normalizePromoCodeServer(raw) {
  return String(raw || "")
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "");
}

function getServerPromoCatalog() {
  var catalog = [];
  var deletedIds = [];
  try {
    var internal = server.GetTitleInternalData({
      Keys: [PROMO_TITLE_KEY_CATALOG, PROMO_TITLE_KEY_DELETED]
    });
    if (internal && internal.Data) {
      if (internal.Data[PROMO_TITLE_KEY_CATALOG]) {
        var parsedCat = JSON.parse(internal.Data[PROMO_TITLE_KEY_CATALOG]);
        if (Array.isArray(parsedCat)) catalog = parsedCat;
      }
      if (internal.Data[PROMO_TITLE_KEY_DELETED]) {
        var parsedDel = JSON.parse(internal.Data[PROMO_TITLE_KEY_DELETED]);
        if (Array.isArray(parsedDel)) deletedIds = parsedDel;
      }
    }
  } catch (e) {
    catalog = [];
  }

  // Migração transparente: se TitleInternalData ainda estiver vazio, lê SharedGroup legado
  if (catalog.length === 0) {
    try {
      var sg = server.GetSharedGroupData({
        SharedGroupId: PROMO_SHARED_GROUP_FALLBACK,
        Keys: ["promo_codes_catalog", "promo_codes_deleted_ids"]
      });
      if (sg && sg.Data) {
        if (sg.Data.promo_codes_catalog && sg.Data.promo_codes_catalog.Value) {
          var sgCat = JSON.parse(sg.Data.promo_codes_catalog.Value);
          if (Array.isArray(sgCat) && sgCat.length > 0) catalog = sgCat;
        }
        if (sg.Data.promo_codes_deleted_ids && sg.Data.promo_codes_deleted_ids.Value) {
          var sgDel = JSON.parse(sg.Data.promo_codes_deleted_ids.Value);
          if (Array.isArray(sgDel) && sgDel.length > 0) deletedIds = sgDel;
        }
      }
    } catch (e2) {
      // SharedGroup pode não existir
    }
  }

  return { catalog: catalog, deletedIds: deletedIds };
}

function saveServerPromoCatalog(catalog, deletedIds) {
  server.SetTitleInternalData({
    Key: PROMO_TITLE_KEY_CATALOG,
    Value: JSON.stringify(Array.isArray(catalog) ? catalog : [])
  });
  if (Array.isArray(deletedIds)) {
    server.SetTitleInternalData({
      Key: PROMO_TITLE_KEY_DELETED,
      Value: JSON.stringify(deletedIds)
    });
  }
}

function getServerPromoRateLimit(playFabId) {
  var tracker = { failedAttempts: 0, blockedUntil: 0 };
  try {
    var res = server.GetUserInternalData({
      PlayFabId: playFabId,
      Keys: ["PromoRateLimit"]
    });
    if (res && res.Data && res.Data.PromoRateLimit && res.Data.PromoRateLimit.Value) {
      var parsed = JSON.parse(res.Data.PromoRateLimit.Value);
      if (parsed && typeof parsed.failedAttempts === "number") {
        tracker.failedAttempts = parsed.failedAttempts;
        tracker.blockedUntil = Number(parsed.blockedUntil) || 0;
      }
    }
  } catch (e) {
    // Ignora
  }
  var now = Date.now();
  if (tracker.blockedUntil > now) {
    return {
      blocked: true,
      remainingSeconds: Math.ceil((tracker.blockedUntil - now) / 1000),
      tracker: tracker
    };
  }
  return { blocked: false, remainingSeconds: 0, tracker: tracker };
}

function recordServerPromoFailure(playFabId, tracker) {
  var nextAttempts = (tracker ? tracker.failedAttempts : 0) + 1;
  var cooldownMs = 0;
  if (nextAttempts >= 10) {
    cooldownMs = 60 * 60 * 1000;
  } else if (nextAttempts >= 6) {
    cooldownMs = 5 * 60 * 1000;
  } else if (nextAttempts >= 3) {
    cooldownMs = 60 * 1000;
  }
  var nextTracker = {
    failedAttempts: nextAttempts,
    blockedUntil: cooldownMs > 0 ? (Date.now() + cooldownMs) : 0
  };
  server.UpdateUserInternalData({
    PlayFabId: playFabId,
    Data: { PromoRateLimit: JSON.stringify(nextTracker) }
  });
  return {
    blocked: cooldownMs > 0,
    remainingSeconds: cooldownMs > 0 ? Math.ceil(cooldownMs / 1000) : 0
  };
}

function resetServerPromoFailure(playFabId) {
  try {
    server.UpdateUserInternalData({
      PlayFabId: playFabId,
      Data: { PromoRateLimit: JSON.stringify({ failedAttempts: 0, blockedUntil: 0 }) }
    });
  } catch (e) {
    // Ignora
  }
}

function getServerPlayerPromoClaims(playFabId) {
  var codes = [];
  var batches = [];
  try {
    var res = server.GetUserInternalData({
      PlayFabId: playFabId,
      Keys: ["ClaimedPromoCodes", "ClaimedPromoBatches"]
    });
    if (res && res.Data) {
      if (res.Data.ClaimedPromoCodes && res.Data.ClaimedPromoCodes.Value) {
        var c = JSON.parse(res.Data.ClaimedPromoCodes.Value);
        if (Array.isArray(c)) codes = c;
      }
      if (res.Data.ClaimedPromoBatches && res.Data.ClaimedPromoBatches.Value) {
        var b = JSON.parse(res.Data.ClaimedPromoBatches.Value);
        if (Array.isArray(b)) batches = b;
      }
    }
  } catch (e) {
    // Ignora
  }
  return { codes: codes, batches: batches };
}

/**
 * Inspeciona um código promocional no servidor sem expor o catálogo ou dados de outros alunos.
 */
handlers.InspectPromoCode = function (args, context) {
  var rl = getServerPromoRateLimit(currentPlayerId);
  if (rl.blocked) {
    return {
      ok: true,
      valid: false,
      status: "rate_limited",
      cooldownSeconds: rl.remainingSeconds,
      errorMessage: "Muitas tentativas inválidas. Aguarde " + rl.remainingSeconds + "s antes de tentar novamente."
    };
  }

  var clean = normalizePromoCodeServer(args && args.code);
  if (!clean || clean.length < 6) {
    return {
      ok: true,
      valid: false,
      status: "invalid",
      errorMessage: "Insira um código válido com no mínimo 6 caracteres."
    };
  }

  var store = getServerPromoCatalog();
  var match = null;
  for (var i = 0; i < store.catalog.length; i++) {
    if (store.catalog[i] && store.catalog[i].cleanCode === clean) {
      match = store.catalog[i];
      break;
    }
  }

  if (!match) {
    var pen = recordServerPromoFailure(currentPlayerId, rl.tracker);
    return {
      ok: true,
      valid: false,
      status: pen.blocked ? "rate_limited" : "invalid",
      cooldownSeconds: pen.remainingSeconds,
      errorMessage: pen.blocked
        ? ("Tentativas excessivas bloqueadas por segurança. Aguarde " + pen.remainingSeconds + "s.")
        : "Código não encontrado ou inválido. Verifique os caracteres e tente novamente."
    };
  }

  if (match.status === "claimed") {
    recordServerPromoFailure(currentPlayerId, rl.tracker);
    return {
      ok: true,
      valid: false,
      status: "already_claimed",
      errorMessage: "Este código já foi resgatado anteriormente."
    };
  }

  var claims = getServerPlayerPromoClaims(currentPlayerId);
  if (claims.codes.indexOf(match.cleanCode) !== -1) {
    return {
      ok: true,
      valid: false,
      status: "already_claimed",
      errorMessage: "Este código já foi resgatado na sua conta."
    };
  }

  if (match.allowMultiplePerStudent === false && match.batchId) {
    if (claims.batches.indexOf(match.batchId) !== -1) {
      return {
        ok: true,
        valid: false,
        status: "already_claimed",
        errorMessage: "Você já resgatou uma recompensa desta mesma leva/lote (" + (match.batchName || "") + "). Limite de 1 resgate por aluno atingido."
      };
    }
    var studentIdArg = String((args && args.studentId) || "").toLowerCase().trim();
    for (var j = 0; j < store.catalog.length; j++) {
      var item = store.catalog[j];
      if (
        item &&
        item.batchId === match.batchId &&
        item.status === "claimed" &&
        (item.claimedByPlayFabId === currentPlayerId ||
          (studentIdArg && String(item.claimedByStudentId || "").toLowerCase().trim() === studentIdArg))
      ) {
        return {
          ok: true,
          valid: false,
          status: "already_claimed",
          errorMessage: "Você já resgatou uma recompensa desta mesma leva/lote (" + (match.batchName || "") + "). Limite de 1 resgate por aluno atingido."
        };
      }
    }
  }

  return {
    ok: true,
    valid: true,
    status: "active",
    code: match.code,
    batchId: match.batchId,
    rewards: match.rewards
  };
};

/**
 * Consome um código promocional de forma autoritativa no servidor (TitleInternalData + UserInternalData).
 */
handlers.ClaimPromoCode = function (args, context) {
  var rl = getServerPromoRateLimit(currentPlayerId);
  if (rl.blocked) {
    return {
      ok: false,
      status: "rate_limited",
      cooldownSeconds: rl.remainingSeconds,
      errorMessage: "Acesso temporariamente bloqueado. Aguarde " + rl.remainingSeconds + "s."
    };
  }

  var clean = normalizePromoCodeServer(args && args.code);
  if (!clean || clean.length < 6) {
    return { ok: false, errorMessage: "Código inválido." };
  }

  var store = getServerPromoCatalog();
  var targetIndex = -1;
  for (var i = 0; i < store.catalog.length; i++) {
    if (store.catalog[i] && store.catalog[i].cleanCode === clean) {
      targetIndex = i;
      break;
    }
  }

  if (targetIndex === -1 || store.catalog[targetIndex].status !== "active") {
    recordServerPromoFailure(currentPlayerId, rl.tracker);
    return { ok: false, errorMessage: "Código inválido ou já resgatado." };
  }

  var target = store.catalog[targetIndex];
  var claims = getServerPlayerPromoClaims(currentPlayerId);

  if (claims.codes.indexOf(target.cleanCode) !== -1) {
    return { ok: false, errorMessage: "Este código já foi resgatado na sua conta." };
  }

  if (target.allowMultiplePerStudent === false && target.batchId) {
    if (claims.batches.indexOf(target.batchId) !== -1) {
      return {
        ok: false,
        errorMessage: "Você já resgatou um código desta mesma leva/lote (" + (target.batchName || "") + "). Cada aluno só pode resgatar 1 vez."
      };
    }
    var studentIdArg = String((args && args.studentId) || "").toLowerCase().trim();
    for (var j = 0; j < store.catalog.length; j++) {
      var item = store.catalog[j];
      if (
        item &&
        item.batchId === target.batchId &&
        item.status === "claimed" &&
        (item.claimedByPlayFabId === currentPlayerId ||
          (studentIdArg && String(item.claimedByStudentId || "").toLowerCase().trim() === studentIdArg))
      ) {
        return {
          ok: false,
          errorMessage: "Você já resgatou um código desta mesma leva/lote (" + (target.batchName || "") + "). Cada aluno só pode resgatar 1 vez."
        };
      }
    }
  }

  var nowIso = new Date().toISOString();
  target.status = "claimed";
  target.claimedByPlayFabId = currentPlayerId;
  target.claimedByStudentId = String((args && args.studentId) || currentPlayerId);
  target.claimedByNick = String((args && args.nick) || "");
  target.claimedByFullName = String((args && args.fullName) || "");
  target.claimedBySchool = String((args && args.school) || "");
  target.claimedAt = nowIso;

  store.catalog[targetIndex] = target;
  saveServerPromoCatalog(store.catalog, store.deletedIds);

  claims.codes.push(target.cleanCode);
  if (target.batchId && claims.batches.indexOf(target.batchId) === -1) {
    claims.batches.push(target.batchId);
  }
  server.UpdateUserInternalData({
    PlayFabId: currentPlayerId,
    Data: {
      ClaimedPromoCodes: JSON.stringify(claims.codes),
      ClaimedPromoBatches: JSON.stringify(claims.batches)
    }
  });
  resetServerPromoFailure(currentPlayerId);

  return {
    ok: true,
    code: target.code,
    cleanCode: target.cleanCode,
    batchId: target.batchId,
    rewards: target.rewards,
    claimedAt: nowIso
  };
};

/**
 * Lista o catálogo completo de códigos promocionais para administradores autenticados.
 */
handlers.AdminListPromoCodes = function (args, context) {
  if (!isAuthorizedAdmin(currentPlayerId)) {
    return { ok: false, error: "Acesso negado: permissão de administrador necessária." };
  }
  var store = getServerPromoCatalog();
  return {
    ok: true,
    catalog: store.catalog,
    deletedIds: store.deletedIds
  };
};

/**
 * Salva o catálogo e tombstones de códigos promocionais no TitleInternalData (apenas ADM).
 */
handlers.AdminSavePromoCodes = function (args, context) {
  if (!isAuthorizedAdmin(currentPlayerId)) {
    return { ok: false, error: "Acesso negado: permissão de administrador necessária." };
  }
  var catalog = args && Array.isArray(args.catalog) ? args.catalog : [];
  var deletedIds = args && Array.isArray(args.deletedIds) ? args.deletedIds : [];
  saveServerPromoCatalog(catalog, deletedIds);

  var purgedLegacy = false;
  if (args && args.purgeLegacySharedGroup === true) {
    try {
      server.UpdateSharedGroupData({
        SharedGroupId: PROMO_SHARED_GROUP_FALLBACK,
        KeysToRemove: ["promo_codes_catalog", "promo_codes_deleted_ids"]
      });
      purgedLegacy = true;
    } catch (e) {
      purgedLegacy = false;
    }
  }
  return { ok: true, count: catalog.length, purgedLegacySharedGroup: purgedLegacy };
};

///////////////////////////////////////////////////////////////////////////////
// Economia Autoritativa no Servidor (SEC-08)
// Ledger imutável em UserReadOnlyData["EconomyLedger"] (últimos 100 lançamentos).
///////////////////////////////////////////////////////////////////////////////

function loadServerPlayerProfile(playFabId) {
  var profile = {};
  try {
    var res = server.GetUserData({
      PlayFabId: playFabId,
      Keys: ["PlayerProfile"]
    });
    if (res && res.Data && res.Data.PlayerProfile && res.Data.PlayerProfile.Value) {
      var parsed = JSON.parse(res.Data.PlayerProfile.Value);
      if (parsed && typeof parsed === "object") profile = parsed;
    }
  } catch (e) {
    profile = {};
  }
  return profile;
}

function saveServerPlayerProfile(playFabId, profile) {
  server.UpdateUserData({
    PlayFabId: playFabId,
    Data: {
      PlayerProfile: JSON.stringify(profile)
    },
    Permission: "Public"
  });
}

function appendServerEconomyLedger(playFabId, entry) {
  if (!playFabId || !entry) return [];
  var existing = [];
  try {
    var res = server.GetUserReadOnlyData({
      PlayFabId: playFabId,
      Keys: ["EconomyLedger"]
    });
    if (res && res.Data && res.Data.EconomyLedger && res.Data.EconomyLedger.Value) {
      var parsed = JSON.parse(res.Data.EconomyLedger.Value);
      if (Array.isArray(parsed)) existing = parsed;
    }
  } catch (e) {
    existing = [];
  }

  var fullEntry = {
    id: entry.id || ("srv_eco_" + Date.now() + "_" + Math.floor(Math.random() * 100000)),
    action: String(entry.action || "economy_op"),
    currency: entry.currency ? String(entry.currency) : undefined,
    amount: Math.round(Number(entry.amount) || 0),
    balanceAfter: Math.max(0, Math.round(Number(entry.balanceAfter) || 0)),
    itemId: entry.itemId ? String(entry.itemId) : undefined,
    metadata: entry.metadata || undefined,
    timestamp: new Date().toISOString()
  };

  existing.push(fullEntry);
  if (existing.length > 100) {
    existing = existing.slice(existing.length - 100);
  }

  server.UpdateUserReadOnlyData({
    PlayFabId: playFabId,
    Data: {
      EconomyLedger: JSON.stringify(existing)
    },
    Permission: "Public"
  });

  return existing;
}

function loadServerTitleConfigSafe() {
  try {
    var res = server.GetTitleData({ Keys: ["PlatformAdminConfig"] });
    if (res && res.Data && res.Data.PlatformAdminConfig) {
      var parsed = JSON.parse(res.Data.PlatformAdminConfig);
      if (parsed && typeof parsed === "object") return parsed;
    }
  } catch (e) {
    // Ignora
  }
  return {};
}

function findByIdInArray(arr, itemId) {
  if (!Array.isArray(arr)) return null;
  for (var i = 0; i < arr.length; i++) {
    if (arr[i] && arr[i].id === itemId) return arr[i];
  }
  return null;
}

handlers.ServerPurchaseCosmetic = function (args, context) {
  var itemId = String((args && args.itemId) || "").trim();
  var kind = args && args.kind === "aura" ? "aura" : "avatar";
  var currency = args && args.currency === "points" ? "points" : "coins";
  if (!itemId) {
    return { ok: false, error: "Identificador do item ausente." };
  }

  var titleCfg = loadServerTitleConfigSafe();
  var catalogArr = kind === "aura" ? titleCfg.aurasCatalog : titleCfg.avatarsCatalog;
  var catalogItem = findByIdInArray(catalogArr, itemId);
  if (catalogItem && catalogItem.enabled === false) {
    return { ok: false, error: "Este item não está disponível na loja no momento." };
  }

  var rawPrice =
    catalogItem && currency === "coins" && typeof catalogItem.priceCoins === "number"
      ? catalogItem.priceCoins
      : Number(args && args.price);
  var price = Math.floor(Number(rawPrice) || 0);
  if (price <= 0 || price > 100000) {
    return { ok: false, error: "Preço inválido para compra na loja." };
  }

  var profile = loadServerPlayerProfile(currentPlayerId);
  var unlockedKey = kind === "aura" ? "unlockedAuras" : "unlockedAvatars";
  var unlocked = Array.isArray(profile[unlockedKey]) ? profile[unlockedKey].slice() : [];
  if (unlocked.indexOf(itemId) !== -1) {
    return { ok: false, error: "Você já possui este item cosmético." };
  }

  var balanceKey = currency === "points" ? "pointsBalance" : "coins";
  var spentKey = currency === "points" ? "pointsSpentTotal" : "coinsSpentTotal";
  var curBal = Math.max(0, Math.floor(Number(profile[balanceKey]) || 0));
  if (curBal < price) {
    return { ok: false, error: "Saldo insuficiente para comprar este item." };
  }

  var nextBal = curBal - price;
  profile[balanceKey] = nextBal;
  profile[spentKey] = Math.max(0, Math.floor(Number(profile[spentKey]) || 0)) + price;
  unlocked.push(itemId);
  profile[unlockedKey] = unlocked;

  var purchasedKey = kind + ":" + itemId;
  var purchased = Array.isArray(profile.purchasedCosmeticIds) ? profile.purchasedCosmeticIds.slice() : [];
  if (purchased.indexOf(purchasedKey) === -1) purchased.push(purchasedKey);
  profile.purchasedCosmeticIds = purchased;

  if (currency === "coins") {
    var byItem = profile.storeCoinsSpentByItem && typeof profile.storeCoinsSpentByItem === "object"
      ? profile.storeCoinsSpentByItem
      : {};
    byItem[purchasedKey] = Math.max(0, Math.floor(Number(byItem[purchasedKey]) || 0)) + price;
    profile.storeCoinsSpentByItem = byItem;
  }

  saveServerPlayerProfile(currentPlayerId, profile);
  appendServerEconomyLedger(currentPlayerId, {
    action: "purchase_cosmetic",
    currency: currency,
    amount: -price,
    balanceAfter: nextBal,
    itemId: purchasedKey
  });

  return {
    ok: true,
    itemId: itemId,
    kind: kind,
    currency: currency,
    price: price,
    profile: profile
  };
};

handlers.ServerPurchaseCardPack = function (args, context) {
  var packId = String((args && args.packId) || "").trim();
  var quantity = Math.floor(Number(args && args.quantity) || 1);
  if (!packId) {
    return { ok: false, error: "Pacote inválido." };
  }
  if (quantity < 1 || quantity > 20) {
    return { ok: false, error: "Quantidade inválida de pacotes (1 a 20)." };
  }

  var titleCfg = loadServerTitleConfigSafe();
  var packDef = findByIdInArray(titleCfg.cardPacks, packId);
  if (packDef && (packDef.enabled === false || packDef.showInStore === false)) {
    return { ok: false, error: "Este pacote não está disponível na loja." };
  }

  var unitPrice =
    packDef && typeof packDef.priceCoins === "number"
      ? Math.floor(packDef.priceCoins)
      : Math.floor(Number(args && args.unitPrice) || 0);
  if (unitPrice <= 0 || unitPrice > 100000) {
    return { ok: false, error: "Preço de pacote inválido." };
  }

  var totalCost = unitPrice * quantity;
  var profile = loadServerPlayerProfile(currentPlayerId);
  var curCoins = Math.max(0, Math.floor(Number(profile.coins) || 0));
  if (curCoins < totalCost) {
    return { ok: false, error: "Moedas insuficientes para comprar pacote(s)." };
  }

  var nextCoins = curCoins - totalCost;
  profile.coins = nextCoins;
  profile.coinsSpentTotal = Math.max(0, Math.floor(Number(profile.coinsSpentTotal) || 0)) + totalCost;

  var packs = profile.unopenedPacks && typeof profile.unopenedPacks === "object" ? profile.unopenedPacks : {};
  packs[packId] = Math.max(0, Math.floor(Number(packs[packId]) || 0)) + quantity;
  profile.unopenedPacks = packs;

  var counts = profile.purchasedPackCounts && typeof profile.purchasedPackCounts === "object"
    ? profile.purchasedPackCounts
    : {};
  counts[packId] = Math.max(0, Math.floor(Number(counts[packId]) || 0)) + quantity;
  profile.purchasedPackCounts = counts;

  saveServerPlayerProfile(currentPlayerId, profile);
  appendServerEconomyLedger(currentPlayerId, {
    action: "purchase_card_pack",
    currency: "coins",
    amount: -totalCost,
    balanceAfter: nextCoins,
    itemId: "pack:" + packId,
    metadata: { quantity: quantity, unitPrice: unitPrice }
  });

  return {
    ok: true,
    packId: packId,
    quantity: quantity,
    totalCost: totalCost,
    profile: profile
  };
};

handlers.ServerOpenChest = function (args, context) {
  var chestId = String((args && args.chestId) || "").trim();
  if (!chestId) {
    return { ok: false, error: "Baú inválido." };
  }

  var profile = loadServerPlayerProfile(currentPlayerId);
  var chests = profile.unopenedChests && typeof profile.unopenedChests === "object" ? profile.unopenedChests : {};
  var available = Math.max(0, Math.floor(Number(chests[chestId]) || 0));
  if (available < 1) {
    return { ok: false, error: "Você não possui unidades deste baú no inventário." };
  }

  if (available - 1 > 0) {
    chests[chestId] = available - 1;
  } else {
    delete chests[chestId];
  }
  profile.unopenedChests = chests;
  profile.chestsOpenedTotal = Math.max(0, Math.floor(Number(profile.chestsOpenedTotal) || 0)) + 1;

  var rawRewards = (args && args.rewards && typeof args.rewards === "object") ? args.rewards : {};
  var addCoins = Math.max(0, Math.min(10000, Math.floor(Number(rawRewards.coins) || 0)));
  var addPoints = Math.max(0, Math.min(10000, Math.floor(Number(rawRewards.points) || 0)));
  var rawPackIds = Array.isArray(rawRewards.packIds) ? rawRewards.packIds.slice(0, 10) : [];

  if (addCoins > 0) {
    profile.coins = Math.max(0, Math.floor(Number(profile.coins) || 0)) + addCoins;
    profile.lifetimeCoins = Math.max(0, Math.floor(Number(profile.lifetimeCoins) || 0)) + addCoins;
  }
  if (addPoints > 0) {
    profile.pointsBalance = Math.max(0, Math.floor(Number(profile.pointsBalance) || 0)) + addPoints;
    profile.careerPoints = Math.max(0, Math.floor(Number(profile.careerPoints) || 0)) + addPoints;
  }
  if (rawPackIds.length > 0) {
    var packs = profile.unopenedPacks && typeof profile.unopenedPacks === "object" ? profile.unopenedPacks : {};
    for (var p = 0; p < rawPackIds.length; p++) {
      var pid = String(rawPackIds[p] || "").trim();
      if (!pid) continue;
      packs[pid] = Math.max(0, Math.floor(Number(packs[pid]) || 0)) + 1;
    }
    profile.unopenedPacks = packs;
  }

  saveServerPlayerProfile(currentPlayerId, profile);
  appendServerEconomyLedger(currentPlayerId, {
    action: "open_chest",
    currency: addCoins > 0 ? "coins" : "points",
    amount: addCoins > 0 ? addCoins : addPoints,
    balanceAfter: Math.max(0, Math.floor(Number(addCoins > 0 ? profile.coins : profile.pointsBalance) || 0)),
    itemId: "chest:" + chestId,
    metadata: { coins: addCoins, points: addPoints, packCount: rawPackIds.length }
  });

  return {
    ok: true,
    chestId: chestId,
    credited: { coins: addCoins, points: addPoints, packIds: rawPackIds },
    profile: profile
  };
};

handlers.ServerOpenCardPack = function (args, context) {
  var packId = String((args && args.packId) || "").trim();
  var cardIds = args && Array.isArray(args.cardIds) ? args.cardIds : [];
  if (!packId) {
    return { ok: false, error: "Pacote inválido." };
  }
  if (cardIds.length < 1 || cardIds.length > 10) {
    return { ok: false, error: "Quantidade de cartas inválida para abertura do pacote." };
  }

  var profile = loadServerPlayerProfile(currentPlayerId);
  var packs = profile.unopenedPacks && typeof profile.unopenedPacks === "object" ? profile.unopenedPacks : {};
  var available = Math.max(0, Math.floor(Number(packs[packId]) || 0));
  if (available < 1) {
    return { ok: false, error: "Você não possui unidades deste pacote no inventário." };
  }

  if (available - 1 > 0) {
    packs[packId] = available - 1;
  } else {
    delete packs[packId];
  }
  profile.unopenedPacks = packs;
  profile.packsOpenedTotal = Math.max(0, Math.floor(Number(profile.packsOpenedTotal) || 0)) + 1;

  var cards = profile.cards && typeof profile.cards === "object" ? profile.cards : {};
  var added = [];
  for (var i = 0; i < cardIds.length; i++) {
    var cid = String(cardIds[i] || "").trim();
    if (!cid) continue;
    cards[cid] = Math.max(0, Math.floor(Number(cards[cid]) || 0)) + 1;
    added.push(cid);
  }
  profile.cards = cards;

  saveServerPlayerProfile(currentPlayerId, profile);
  appendServerEconomyLedger(currentPlayerId, {
    action: "open_card_pack",
    amount: added.length,
    balanceAfter: profile.packsOpenedTotal,
    itemId: "pack:" + packId,
    metadata: { cardIds: added }
  });

  return {
    ok: true,
    packId: packId,
    cardsAdded: added,
    profile: profile
  };
};

///////////////////////////////////////////////////////////////////////////////
// Exclusão Definitiva LGPD no Servidor (LGPD-06)
///////////////////////////////////////////////////////////////////////////////

function pushUniqueKey(list, key) {
  if (key && list.indexOf(key) === -1) list.push(key);
}

handlers.AdminPurgeStudentAccount = function (args, context) {
  if (!isAuthorizedAdmin(currentPlayerId)) {
    return { ok: false, error: "Acesso negado: permissão de administrador necessária." };
  }

  var targetPlayFabId = String((args && args.targetPlayFabId) || "").trim();
  var studentId = String((args && args.studentId) || "").trim();
  var nickNormalized = String((args && args.nickNormalized) || "").trim().toLowerCase();
  var rankedSeasonId = Math.max(1, Math.floor(Number(args && args.rankedSeasonId) || 1));

  if (!targetPlayFabId && !studentId && !nickNormalized) {
    return { ok: false, error: "Informe targetPlayFabId, studentId ou nickNormalized para exclusão LGPD." };
  }

  var cleanedGroups = [];
  var banned = false;

  // 1. Limpa UserData, UserReadOnlyData e UserInternalData da conta no PlayFab
  if (targetPlayFabId) {
    try {
      server.UpdateUserData({
        PlayFabId: targetPlayFabId,
        KeysToRemove: ["PlayerProfile", "GameStats", "UnlockedGames"]
      });
    } catch (e1) {
      // Ignora chave ausente
    }
    try {
      server.UpdateUserReadOnlyData({
        PlayFabId: targetPlayFabId,
        KeysToRemove: ["RankedLedger", "EconomyLedger"]
      });
    } catch (e2) {
      // Ignora chave ausente
    }
    try {
      server.UpdateUserInternalData({
        PlayFabId: targetPlayFabId,
        KeysToRemove: [
          "PromoRateLimit",
          "ClaimedPromoCodes",
          "ClaimedPromoBatches",
          "RankedDailyBonusDate"
        ]
      });
    } catch (e3) {
      // Ignora chave ausente
    }
    try {
      server.BanUsers({
        Bans: [
          {
            PlayFabId: targetPlayFabId,
            Reason: "Exclusão definitiva solicitada (LGPD Art. 18, VI)"
          }
        ]
      });
      banned = true;
    } catch (e4) {
      banned = false;
    }
  }

  // 2. Remove chaves do aluno nos SharedGroups principais
  var identifiers = [];
  pushUniqueKey(identifiers, nickNormalized);
  pushUniqueKey(identifiers, studentId);
  pushUniqueKey(identifiers, targetPlayFabId);

  var rosterKeys = [];
  var tourKeys = [];
  var presenceKeys = [];
  for (var i = 0; i < identifiers.length; i++) {
    var ident = identifiers[i];
    pushUniqueKey(rosterKeys, "stu_" + ident);
    pushUniqueKey(rosterKeys, ident);
    pushUniqueKey(tourKeys, "rnk_" + ident);
    pushUniqueKey(tourKeys, "stu_" + ident);
    pushUniqueKey(presenceKeys, "pres_" + ident);
  }

  var removeSharedKeys = function (groupId, keys) {
    if (!keys || keys.length === 0) return;
    try {
      server.UpdateSharedGroupData({
        SharedGroupId: groupId,
        KeysToRemove: keys
      });
      cleanedGroups.push(groupId);
    } catch (err) {
      // SharedGroup pode não existir
    }
  };

  removeSharedKeys("SEMED_STUDENT_ROSTER_V1", rosterKeys);
  removeSharedKeys("TOURNAMENT_SEASON_" + rankedSeasonId, tourKeys);
  removeSharedKeys("SEMED_PRESENCE_V3", presenceKeys);

  // 3. Remove recibos de inbox em SEMED_ADMIN_NOTIFICATIONS_V1
  try {
    var notifRes = server.GetSharedGroupData({
      SharedGroupId: "SEMED_ADMIN_NOTIFICATIONS_V1"
    });
    if (notifRes && notifRes.Data) {
      var notifRemove = [];
      var nKeys = getObjectKeys(notifRes.Data);
      for (var nk = 0; nk < nKeys.length; nk++) {
        var keyName = nKeys[nk];
        for (var idIdx = 0; idIdx < identifiers.length; idIdx++) {
          var tok = identifiers[idIdx];
          if (
            keyName.indexOf("inbox_read_" + tok + "_") === 0 ||
            keyName.indexOf("inbox_claim_" + tok + "_") === 0
          ) {
            pushUniqueKey(notifRemove, keyName);
          }
        }
      }
      if (notifRemove.length > 0) {
        removeSharedKeys("SEMED_ADMIN_NOTIFICATIONS_V1", notifRemove);
      }
    }
  } catch (e5) {
    // SharedGroup pode não existir
  }

  // 4. Remove registros do aluno de SEMED_GAME_RECORDS_V2
  try {
    var recRes = server.GetSharedGroupData({
      SharedGroupId: "SEMED_GAME_RECORDS_V2",
      Keys: ["Records"]
    });
    if (recRes && recRes.Data && recRes.Data.Records && recRes.Data.Records.Value) {
      var recObj = JSON.parse(recRes.Data.Records.Value);
      var changedRecords = false;
      var gameKeys = getObjectKeys(recObj);
      for (var gk = 0; gk < gameKeys.length; gk++) {
        var gameRec = recObj[gameKeys[gk]];
        if (!gameRec || !Array.isArray(gameRec.holders)) continue;
        var filteredHolders = [];
        for (var h = 0; h < gameRec.holders.length; h++) {
          var holder = gameRec.holders[h];
          var hpId = holder && holder.playerId ? String(holder.playerId) : "";
          var hNick = holder && holder.nick ? String(holder.nick).trim().toLowerCase() : "";
          var isTarget =
            (studentId && hpId === studentId) ||
            (targetPlayFabId && hpId === targetPlayFabId) ||
            (nickNormalized && (hpId === nickNormalized || hNick === nickNormalized));
          if (!isTarget) {
            filteredHolders.push(holder);
          } else {
            changedRecords = true;
          }
        }
        if (filteredHolders.length === 0) {
          delete recObj[gameKeys[gk]];
        } else {
          gameRec.holders = filteredHolders;
        }
      }
      if (changedRecords) {
        server.UpdateSharedGroupData({
          SharedGroupId: "SEMED_GAME_RECORDS_V2",
          Data: { Records: JSON.stringify(recObj) }
        });
        cleanedGroups.push("SEMED_GAME_RECORDS_V2");
      }
    }
  } catch (e6) {
    // SharedGroup ou JSON ausente
  }

  // 5. Log de auditoria não-PII em TitleInternalData["LgpdPurgeLog"]
  try {
    var logRes = server.GetTitleInternalData({ Keys: ["LgpdPurgeLog"] });
    var purgeLog = [];
    if (logRes && logRes.Data && logRes.Data.LgpdPurgeLog) {
      var parsedLog = JSON.parse(logRes.Data.LgpdPurgeLog);
      if (Array.isArray(parsedLog)) purgeLog = parsedLog;
    }
    purgeLog.push({
      playFabId: targetPlayFabId || null,
      studentId: studentId || null,
      purgedBy: currentPlayerId,
      purgedAt: new Date().toISOString()
    });
    if (purgeLog.length > 200) {
      purgeLog = purgeLog.slice(purgeLog.length - 200);
    }
    server.SetTitleInternalData({
      Key: "LgpdPurgeLog",
      Value: JSON.stringify(purgeLog)
    });
  } catch (e7) {
    // Ignora erro não-crítico no log de auditoria
  }

  return {
    ok: true,
    purgedPlayFabId: targetPlayFabId || null,
    cleanedGroups: cleanedGroups,
    banned: banned,
    note: "Dados limpos e conta banida. Para remoção definitiva do Master Player Account, execute Admin/DeleteMasterPlayerAccount no Game Manager ou via Azure Function."
  };
};
