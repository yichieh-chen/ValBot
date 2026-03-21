const HENRIK_API_BASE_URL = "https://api.henrikdev.xyz";

function formatErrorMessage(body, fallback) {
  if (Array.isArray(body?.errors) && body.errors.length > 0) {
    return body.errors[0]?.message || fallback;
  }

  return body?.message || fallback;
}

async function fetchHenrikJson(apiKey, endpointPath) {
  const response = await fetch(`${HENRIK_API_BASE_URL}${endpointPath}`, {
    method: "GET",
    headers: {
      Accept: "application/json",
      Authorization: apiKey,
    },
  });

  const contentType = response.headers.get("content-type") || "";
  const body = contentType.includes("application/json")
    ? await response.json()
    : { message: await response.text() };

  if (response.status === 401) {
    throw new Error("Henrik API 金鑰無效或未授權（401）");
  }

  if (response.status === 429) {
    throw new Error("Henrik API 目前觸發速率限制，請稍後再試");
  }

  if (!response.ok) {
    throw new Error(formatErrorMessage(body, `HTTP ${response.status}`));
  }

  return body;
}

function encodePathSegment(value) {
  return encodeURIComponent(value);
}

async function fetchPlayerBundle({ apiKey, region, name, tag, matchFetchSize }) {
  const safeName = encodePathSegment(name);
  const safeTag = encodePathSegment(tag);

  const [accountRes, mmrRes, competitiveMatchesRes, unratedMatchesRes] = await Promise.allSettled([
    fetchHenrikJson(apiKey, `/valorant/v1/account/${safeName}/${safeTag}`),
    fetchHenrikJson(apiKey, `/valorant/v2/mmr/${region}/${safeName}/${safeTag}`),
    fetchHenrikJson(
      apiKey,
      `/valorant/v3/matches/${region}/${safeName}/${safeTag}?size=${matchFetchSize}&mode=competitive`
    ),
    fetchHenrikJson(
      apiKey,
      `/valorant/v3/matches/${region}/${safeName}/${safeTag}?size=${matchFetchSize}&mode=unrated`
    ),
  ]);

  const accountData = accountRes.status === "fulfilled" ? accountRes.value : null;
  const mmrData = mmrRes.status === "fulfilled" ? mmrRes.value : null;
  const competitiveMatchesData =
    competitiveMatchesRes.status === "fulfilled" ? competitiveMatchesRes.value : null;
  const unratedMatchesData =
    unratedMatchesRes.status === "fulfilled" ? unratedMatchesRes.value : null;

  const competitiveMatches = Array.isArray(competitiveMatchesData?.data)
    ? competitiveMatchesData.data
    : [];
  const unratedMatches = Array.isArray(unratedMatchesData?.data)
    ? unratedMatchesData.data
    : [];

  const mergedMatchMap = new Map();
  for (const match of [...competitiveMatches, ...unratedMatches]) {
    const key = String(match?.metadata?.matchid || "");
    if (!key) {
      continue;
    }

    if (!mergedMatchMap.has(key)) {
      mergedMatchMap.set(key, match);
    }
  }

  const mergedMatches = Array.from(mergedMatchMap.values()).sort(
    (a, b) => Number(b?.metadata?.game_start || 0) - Number(a?.metadata?.game_start || 0)
  );

  const matchesData = {
    data: mergedMatches,
  };

  if (!accountData && !mmrData && mergedMatches.length === 0) {
    const firstError =
      accountRes.status === "rejected"
        ? accountRes.reason
        : mmrRes.status === "rejected"
          ? mmrRes.reason
          : competitiveMatchesRes.status === "rejected"
            ? competitiveMatchesRes.reason
            : unratedMatchesRes.reason;
    throw firstError;
  }

  return {
    accountData,
    mmrData,
    matchesData,
  };
}

module.exports = {
  fetchPlayerBundle,
};
