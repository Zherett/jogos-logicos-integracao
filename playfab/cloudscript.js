///////////////////////////////////////////////////////////////////////////////
// Microsoft Azure PlayFab — CloudScript Oficial da Plataforma Desafios de Lógica
// Como usar no PlayFab Game Manager:
//   1. Acesse o painel do seu título no PlayFab (https://developer.playfab.com)
//   2. Vá em: Automation -> CloudScript -> Revisions (Legacy)
//   3. Cole este código e clique em "Save and deployrevision"
///////////////////////////////////////////////////////////////////////////////

// Limites máximos plausíveis por partida para validação Anti-Cheat no servidor
var MAX_SCORE_BY_GAME = {
  logica: 1200,
  cartesiano: 900,
  formas: 800,
  memoria: 800,
  variaveis: 1000,
  robogrid: 1000,
  porcentagem: 900,
  minado: 350,
  completar: 900,
  rpg: 3000
};

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

/**
 * Registra o resultado de uma partida com validação Anti-Cheat no servidor
 * e atualiza os Leaderboards do PlayFab (XP_Total, XP_Season, Best_<gameId>, School_<slug>_XP).
 */
handlers.RecordMatchResult = function (args, context) {
  var gameId = String(args.gameId || "logica");
  var score = Math.max(0, Math.floor(Number(args.score) || 0));
  var maxAllowed = MAX_SCORE_BY_GAME[gameId] || 1500;

  // Proteção Anti-Cheat: limita scores adulterados via DevTools
  if (score > maxAllowed) {
    score = maxAllowed;
  }

  var rawStats = Array.isArray(args.statistics) ? args.statistics : [];
  var statsToUpdate = [];
  for (var i = 0; i < rawStats.length; i++) {
    var st = rawStats[i];
    if (!st || typeof st.StatisticName !== "string") continue;
    var name = st.StatisticName;
    var isAllowed =
      name === "XP_Total" ||
      name === "Medals_Total" ||
      name.indexOf("XP_Season_") === 0 ||
      name.indexOf("Best_") === 0 ||
      name.indexOf("School_") === 0;
    if (!isAllowed) continue;

    var val = Math.max(0, Math.floor(Number(st.Value) || 0));
    if (name.indexOf("Best_") === 0 && val > maxAllowed) {
      val = maxAllowed;
    } else if (val > 1000000) {
      val = 1000000;
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

/**
 * Salva as configurações globais do Painel do Administrador (ADM) no TitleData do PlayFab
 * para que todos os dispositivos recebam os mesmos códigos de jogos, jogos ativos e resets agendados.
 */
handlers.SavePlatformAdminConfig = function (args, context) {
  if (!isAuthorizedAdmin(currentPlayerId)) {
    return { ok: false, error: "Acesso negado: permissão de administrador necessária." };
  }
  if (!args || !args.config) {
    return { ok: false, error: "Configuração ausente." };
  }
  server.SetTitleData({
    Key: "PlatformAdminConfig",
    Value: JSON.stringify(args.config)
  });
  return { ok: true };
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

  cfg.seasonId = args.seasonId || ((cfg.seasonId || 1) + 1);
  cfg.seasonName = args.seasonName || ("Temporada " + cfg.seasonId + " • SEMED Coari");
  cfg.lastResetAt = args.lastResetAt || new Date().toISOString();
  cfg.scheduledResetAt = null;
  cfg.updatedAt = new Date().toISOString();

  server.SetTitleData({
    Key: "PlatformAdminConfig",
    Value: JSON.stringify(cfg)
  });

  return { ok: true, seasonId: cfg.seasonId };
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
  var dailyBonusAwarded = Boolean(args && args.dailyBonusAwarded);

  // Validação anti-cheat de teto por partida (máx 10 base * 3x evento + 25 bônus diário)
  var maxSingleMatchDelta = dailyBonusAwarded ? 55 : 30;
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

  var clientTotal = Math.max(0, Math.floor(Number(args && args.newTournamentPoints) || 0));
  var nextTotal = currentVal > 0 ? (currentVal + safeDelta) : Math.max(safeDelta, clientTotal);

  server.UpdatePlayerStatistics({
    PlayFabId: currentPlayerId,
    Statistics: [{ StatisticName: statName, Value: nextTotal }]
  });

  if (safeDelta > 0) {
    appendServerRankedLedger(currentPlayerId, {
      source: "torneio_semanal",
      amount: safeDelta,
      balanceAfter: nextTotal,
      reason: "Partida Ranqueada (" + gameId + " • " + correct + " acertos, " + wrong + " erros)" + (dailyBonusAwarded ? " + Bônus 10 Perfeitas" : ""),
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

  var clientNewPoints = Math.max(0, Math.floor(Number(args && args.newPoints) || 0));
  var nextVal = currentVal >= cost ? (currentVal - cost) : clientNewPoints;

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
  cfg.updatedAt = new Date().toISOString();

  server.SetTitleData({
    Key: "PlatformAdminConfig",
    Value: JSON.stringify(cfg)
  });

  return { ok: true, rankedSeasonId: cfg.rankedSeasonId };
};
