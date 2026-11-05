const axios = require("axios");

const JIKAN_BASE = "https://api.jikan.moe/v4";

async function requestWithRetry(url, params, maxRetries = 3) {
  let lastError = null;
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      if (attempt > 0) {
        // Jikan's free tier is rate-limited and occasionally returns 5xx
        // when its own MAL-scraping backend is slow — a short backoff
        // before retrying clears up most of these.
        await new Promise((r) => setTimeout(r, 1000 * attempt));
      }
      const { data } = await axios.get(url, { params, timeout: 15000 });
      return data;
    } catch (err) {
      lastError = err;
      const status = err.response?.status;
      // Only retry on transient server-side errors / rate limiting; a 404
      // (no such anime) won't fix itself with a retry.
      if (status && status !== 429 && status < 500) break;
    }
  }
  const status = lastError?.response?.status;
  if (status === 429) {
    throw new Error("Terlalu banyak request ke Jikan API (rate limit). Coba lagi sebentar lagi.");
  }
  throw new Error(
    `Jikan API (layanan gratis pihak ketiga untuk data MyAnimeList) sedang tidak merespons${status ? ` (HTTP ${status})` : ""}. Coba lagi sebentar lagi.`
  );
}

// Otakudesu titles don't carry a MyAnimeList ID, so we look one up by fuzzy
// title search first. This is a best-effort match — unusual/abbreviated
// titles can occasionally resolve to the wrong entry, since it's matching
// on title text rather than a curated ID mapping.
async function findMalId(title) {
  const data = await requestWithRetry(`${JIKAN_BASE}/anime`, { q: title, limit: 1 });
  const match = data?.data?.[0];
  return match ? { mal_id: match.mal_id, matchedTitle: match.title } : null;
}

async function getCharactersByTitle(title) {
  const found = await findMalId(title);
  if (!found) return { matchedTitle: null, characters: [] };

  const data = await requestWithRetry(`${JIKAN_BASE}/anime/${found.mal_id}/characters`);

  const characters = (data?.data || []).map((c) => ({
    name: c.character?.name || "",
    image: c.character?.images?.jpg?.image_url || c.character?.images?.webp?.image_url || "",
    role: c.role || "",
    voiceActor: (c.voice_actors || []).find((v) => v.language === "Japanese")?.person?.name || "",
  }));

  return { matchedTitle: found.matchedTitle, characters };
}

module.exports = { getCharactersByTitle };
