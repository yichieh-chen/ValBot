const crypto = require("crypto");
const { fetchPlayerBundle } = require("../services/valorantApiService");

const MODE_COMPETITIVE = "competitive";
const MODE_UNRATED = "unrated";
const BUTTON_PREFIX = "queryrecord:mode:";

const QUERY_COOLDOWN_MS = 5 * 1000;
const CACHE_TTL_MS = 90 * 1000;
const SESSION_TTL_MS = 15 * 60 * 1000;
const MATCH_FETCH_SIZE = 1000;
const CURRENT_SEASON_LABEL = "V26 A2";
const CURRENT_SEASON_START_EPOCH_SECONDS = Math.floor(Date.parse("2026-03-18T21:00:00Z") / 1000);

const queryCooldownMap = new Map();
const profileCache = new Map();
const sessionStore = new Map();

function normalizeRiotId(input) {
  const normalized = input.replace(/＃/g, "#").trim();
  const parts = normalized.split("#");
  if (parts.length !== 2) {
    return null;
  }

  const gameName = parts[0].trim();
  const tagLine = parts[1].trim();

  if (!gameName || !tagLine) {
    return null;
  }

  if (gameName.length > 32 || tagLine.length > 10) {
    return null;
  }

  return `${gameName}#${tagLine}`;
}

function parseRiotId(riotId) {
  const [name, tag] = riotId.split("#");
  return { name, tag };
}

function getCooldownRemainingMs(userId) {
  const lastQueryAt = queryCooldownMap.get(userId);
  if (!lastQueryAt) {
    return 0;
  }

  const elapsed = Date.now() - lastQueryAt;
  return Math.max(0, QUERY_COOLDOWN_MS - elapsed);
}

function markUserQuery(userId) {
  queryCooldownMap.set(userId, Date.now());
}

function getCachedProfile(cacheKey) {
  const cached = profileCache.get(cacheKey);
  if (!cached) {
    return null;
  }

  if (Date.now() > cached.expiresAt) {
    profileCache.delete(cacheKey);
    return null;
  }

  return cached.data;
}

function setCachedProfile(cacheKey, data) {
  profileCache.set(cacheKey, {
    data,
    expiresAt: Date.now() + CACHE_TTL_MS,
  });
}

function getModeFromMatch(match) {
  const modeId = String(match?.metadata?.mode_id || "").toLowerCase();
  if (modeId.includes("competitive")) {
    return MODE_COMPETITIVE;
  }
  if (modeId.includes("unrated")) {
    return MODE_UNRATED;
  }

  const mode = String(match?.metadata?.mode || "").toLowerCase();
  if (mode.includes("competitive")) {
    return MODE_COMPETITIVE;
  }
  if (mode.includes("unrated")) {
    return MODE_UNRATED;
  }

  return null;
}

function getPlayerInMatch(match, targetPuuid, targetName, targetTag) {
  const allPlayers = match?.players?.all_players;
  if (!Array.isArray(allPlayers)) {
    return null;
  }

  if (targetPuuid) {
    const byPuuid = allPlayers.find((player) => player?.puuid === targetPuuid);
    if (byPuuid) {
      return byPuuid;
    }
  }

  const lowerName = targetName.toLowerCase();
  const lowerTag = targetTag.toLowerCase();
  return allPlayers.find((player) => {
    const pName = String(player?.name || "").toLowerCase();
    const pTag = String(player?.tag || "").toLowerCase();
    return pName === lowerName && pTag === lowerTag;
  });
}

function getTeamWon(match, playerTeam) {
  const teamKey = String(playerTeam || "").toLowerCase();
  return Boolean(match?.teams?.[teamKey]?.has_won);
}

function getAllRoundKillEvents(round) {
  const playerStats = Array.isArray(round?.player_stats) ? round.player_stats : [];
  return playerStats.flatMap((stat) => (Array.isArray(stat.kill_events) ? stat.kill_events : []));
}

function getRoundPlayerStats(round, playerPuuid) {
  const playerStats = Array.isArray(round?.player_stats) ? round.player_stats : [];
  return playerStats.find((item) => item?.player_puuid === playerPuuid) || null;
}

function isRoundTraded(roundKillEvents, deathEvent, teammateTeam) {
  if (!deathEvent) {
    return false;
  }

  const killerPuuid = deathEvent.killer_puuid;
  const deathTime = Number(deathEvent.kill_time_in_round || 0);
  return roundKillEvents.some((event) => {
    if (event?.victim_puuid !== killerPuuid) {
      return false;
    }

    if (String(event?.killer_team || "").toLowerCase() !== teammateTeam) {
      return false;
    }

    const t = Number(event?.kill_time_in_round || 0);
    const delta = t - deathTime;
    return delta >= 0 && delta <= 5000;
  });
}

function calculateModeStats({ matches, mode, seasonStartEpochSeconds, playerPuuid, name, tag }) {
  const filtered = matches.filter((match) => {
    const startedAt = Number(match?.metadata?.game_start || 0);
    if (startedAt < seasonStartEpochSeconds) {
      return false;
    }

    return getModeFromMatch(match) === mode;
  });

  let totalKills = 0;
  let totalDeaths = 0;
  let totalScore = 0;
  let totalHeadshots = 0;
  let totalBodyshots = 0;
  let totalLegshots = 0;
  let totalRounds = 0;
  let totalDamage = 0;
  let totalKastRounds = 0;
  let totalWins = 0;

  for (const match of filtered) {
    const player = getPlayerInMatch(match, playerPuuid, name, tag);
    if (!player) {
      continue;
    }

    const stats = player?.stats || {};
    const roundsInMatch = Number(match?.metadata?.rounds_played || match?.rounds?.length || 0);

    totalKills += Number(stats.kills || 0);
    totalDeaths += Number(stats.deaths || 0);
    totalScore += Number(stats.score || 0);
    totalHeadshots += Number(stats.headshots || 0);
    totalBodyshots += Number(stats.bodyshots || 0);
    totalLegshots += Number(stats.legshots || 0);
    totalRounds += roundsInMatch;

    if (getTeamWon(match, player.team)) {
      totalWins += 1;
    }

    const rounds = Array.isArray(match?.rounds) ? match.rounds : [];
    for (const round of rounds) {
      const roundPlayer = getRoundPlayerStats(round, player.puuid);
      if (!roundPlayer) {
        continue;
      }

      totalDamage += Number(roundPlayer.damage || 0);

      const allKillEvents = getAllRoundKillEvents(round);
      const ownKillEvents = Array.isArray(roundPlayer.kill_events) ? roundPlayer.kill_events : [];
      const hadKill = ownKillEvents.length > 0 || Number(roundPlayer.kills || 0) > 0;
      const hadAssist = allKillEvents.some((event) =>
        Array.isArray(event.assistants) &&
        event.assistants.some((assistant) => assistant?.assistant_puuid === player.puuid)
      );

      const deathEvent = allKillEvents.find((event) => event?.victim_puuid === player.puuid) || null;
      const survived = !deathEvent;
      const traded = !survived && isRoundTraded(allKillEvents, deathEvent, String(player.team || "").toLowerCase());

      if (hadKill || hadAssist || survived || traded) {
        totalKastRounds += 1;
      }
    }
  }

  const matchCount = filtered.length;
  const shots = totalHeadshots + totalBodyshots + totalLegshots;

  const headshotRate = shots > 0 ? (totalHeadshots / shots) * 100 : 0;
  const kd = totalDeaths > 0 ? totalKills / totalDeaths : totalKills;
  const acs = totalRounds > 0 ? totalScore / totalRounds : 0;
  const winRate = matchCount > 0 ? (totalWins / matchCount) * 100 : 0;
  const adr = totalRounds > 0 ? totalDamage / totalRounds : 0;
  const kast = totalRounds > 0 ? (totalKastRounds / totalRounds) * 100 : 0;

  return {
    matchCount,
    headshotRate,
    kd,
    acs,
    winRate,
    adr,
    kast,
  };
}

function getModeDisplayLabel(mode) {
  if (mode === MODE_COMPETITIVE) {
    return "Competitive (競技模式)";
  }

  return "Unrated (一般模式)";
}

function cleanExpiredSessions() {
  const now = Date.now();
  for (const [id, session] of sessionStore.entries()) {
    if (session.expiresAt <= now) {
      sessionStore.delete(id);
    }
  }
}

async function loadQueryContext({ apiKey, region, riotId }) {
  const cacheKey = `${region}:${riotId.toLowerCase()}`;
  let cached = getCachedProfile(cacheKey);

  if (!cached) {
    const { name, tag } = parseRiotId(riotId);
    cached = await fetchPlayerBundle({
      apiKey,
      region,
      name,
      tag,
      matchFetchSize: MATCH_FETCH_SIZE,
    });
    setCachedProfile(cacheKey, cached);
  }

  const matches = Array.isArray(cached.matchesData?.data) ? cached.matchesData.data : [];
  const playerPuuid = cached.accountData?.data?.puuid || null;
  const { name, tag } = parseRiotId(riotId);

  return {
    riotId,
    region,
    seasonLabel: CURRENT_SEASON_LABEL,
    seasonStartEpochSeconds: CURRENT_SEASON_START_EPOCH_SECONDS,
    accountData: cached.accountData,
    mmrData: cached.mmrData,
    matches,
    playerPuuid,
    playerName: name,
    playerTag: tag,
  };
}

function createSession({ ownerId, context }) {
  cleanExpiredSessions();

  const id = crypto.randomUUID().slice(0, 8);
  const session = {
    id,
    ownerId,
    ...context,
    expiresAt: Date.now() + SESSION_TTL_MS,
  };

  sessionStore.set(id, session);
  return session;
}

function getSession(sessionId) {
  cleanExpiredSessions();
  return sessionStore.get(sessionId) || null;
}

function calculateModeStatsForSession(session, mode) {
  return calculateModeStats({
    matches: session.matches,
    mode,
    seasonStartEpochSeconds: session.seasonStartEpochSeconds,
    playerPuuid: session.playerPuuid,
    name: session.playerName,
    tag: session.playerTag,
  });
}

function getDefaultModeForSession(session) {
  const competitiveStats = calculateModeStatsForSession(session, MODE_COMPETITIVE);
  const unratedStats = calculateModeStatsForSession(session, MODE_UNRATED);

  if (competitiveStats.matchCount > 0 || unratedStats.matchCount === 0) {
    return MODE_COMPETITIVE;
  }

  return MODE_UNRATED;
}

module.exports = {
  BUTTON_PREFIX,
  MODE_COMPETITIVE,
  MODE_UNRATED,
  normalizeRiotId,
  getCooldownRemainingMs,
  markUserQuery,
  getModeDisplayLabel,
  loadQueryContext,
  createSession,
  getSession,
  calculateModeStatsForSession,
  getDefaultModeForSession,
};
