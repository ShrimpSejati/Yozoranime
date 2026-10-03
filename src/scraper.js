const axios = require("axios");
const cheerio = require("cheerio");

let BASE_URL = "https://otakudesu.blog";

function getBaseUrl() {
  return BASE_URL;
}

function setBaseUrl(url) {
  BASE_URL = url.replace(/\/+$/, "");
  return BASE_URL;
}

const userAgents = [
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36",
];

const randomUserAgent = () => userAgents[Math.floor(Math.random() * userAgents.length)];
const randomDelay = (min, max) => Math.floor(Math.random() * (max - min + 1) + min);

async function fetchHtml(url, maxRetries = 3) {
  let lastError = null;
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      await new Promise((r) => setTimeout(r, attempt === 0 ? randomDelay(200, 700) : Math.min(1000 * 2 ** attempt, 8000)));
      const response = await axios.get(url, {
        timeout: 15000,
        headers: {
          "User-Agent": randomUserAgent(),
          Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        },
        validateStatus: (s) => s >= 200 && s < 500,
      });
      if (response.status === 200) return response.data;
      lastError = new Error(`Situs sumber merespons status ${response.status} untuk ${url}`);
    } catch (err) {
      lastError = err;
    }
  }
  throw lastError || new Error(`Gagal mengambil ${url}`);
}

function stripEndpoint(href) {
  if (!href) return "";
  let v = href;
  for (const p of [`${BASE_URL}/anime/`, `${BASE_URL}/episode/`, `${BASE_URL}/batch/`, `${BASE_URL}/lengkap/`]) {
    v = v.replace(p, "");
  }
  return v.replace(/\/+$/, "");
}

async function getOngoing(page = 1) {
  const url = page === 1 ? `${BASE_URL}/ongoing-anime/` : `${BASE_URL}/ongoing-anime/page/${page}/`;
  const html = await fetchHtml(url);
  const $ = cheerio.load(html);
  const list = [];
  $(".rapi")
    .find("ul > li")
    .each((i, el) => {
      list.push({
        title: $(el).find("h2").text().trim(),
        thumb: $(el).find("img").attr("src"),
        episodeInfo: $(el).find(".epz").text().trim(),
        updatedOn: $(el).find(".newnime").text().trim(),
        endpoint: stripEndpoint($(el).find(".thumb > a").attr("href")),
      });
    });
  return list;
}

async function getCompleted(page = 1) {
  const url = page === 1 ? `${BASE_URL}/complete-anime/` : `${BASE_URL}/complete-anime/page/${page}/`;
  const html = await fetchHtml(url);
  const $ = cheerio.load(html);
  const list = [];
  $(".rapi")
    .find("ul > li")
    .each((i, el) => {
      list.push({
        title: $(el).find("h2").text().trim(),
        thumb: $(el).find("img").attr("src"),
        episodeInfo: $(el).find(".epz").text().trim(),
        status: $(el).find(".epztipe").text().trim(),
        updatedOn: $(el).find(".newnime").text().trim(),
        endpoint: stripEndpoint($(el).find(".thumb > a").attr("href")),
      });
    });
  return list;
}

async function search(query) {
  const url = `${BASE_URL}/?s=${encodeURIComponent(query)}&post_type=anime`;
  const html = await fetchHtml(url);
  const $ = cheerio.load(html);
  const list = [];
  $(".page")
    .find("li")
    .each((i, el) => {
      list.push({
        title: $(el).find("h2 > a").text().trim(),
        thumb: $(el).find("img").attr("src"),
        status: $(el).find(".set").text().trim(),
        endpoint: stripEndpoint($(el).find("h2 > a").attr("href")),
      });
    });
  return list;
}

async function getGenreList() {
  const html = await fetchHtml(`${BASE_URL}/genre-list/`);
  const $ = cheerio.load(html);
  const list = [];
  $(".genres")
    .find("a")
    .each((i, el) => {
      list.push({
        name: $(el).text().trim(),
        endpoint: ($(el).attr("href") || "").replace("/genres/", "").replace(/\/+$/, ""),
      });
    });
  return list;
}

async function getGenrePage(genre, page = 1) {
  const url = page === 1 ? `${BASE_URL}/genres/${genre}` : `${BASE_URL}/genres/${genre}/page/${page}`;
  const html = await fetchHtml(url);
  const $ = cheerio.load(html);
  const list = [];
  $(".col-anime-con").each((i, el) => {
    list.push({
      title: $(el).find(".col-anime-title > a").text().trim(),
      thumb: $(el).find(".col-anime-cover > img").attr("src"),
      episodeInfo: $(el).find(".col-anime-eps").text().trim(),
      endpoint: stripEndpoint($(el).find(".col-anime-title > a").attr("href")),
    });
  });
  return list;
}

// Real release-schedule page confirmed at /jadwal-rilis/ — grouped under
// <h2> day headings (Senin..Minggu, plus an occasional "Random" section)
// each followed by a <ul> of anime links. We scan siblings between one <h2>
// and the next rather than assuming a fixed wrapper element, since that's
// resilient to the exact DOM nesting changing between theme versions.
//
// The schedule page itself has no thumbnail images at all — just plain
// text links. Since its own heading literally says "Jadwal Rilis Anime
// On-Going", every entry on it is also on the ongoing-anime list, which
// does have thumbnails. So we cross-reference by endpoint (slug) to fill
// in an image for each entry instead of leaving it text-only.
async function getSchedule() {
  const html = await fetchHtml(`${BASE_URL}/jadwal-rilis/`);
  const $ = cheerio.load(html);
  const days = [];

  $("h2").each((i, el) => {
    const dayName = $(el).text().trim();
    if (!dayName) return;
    const anime = [];
    $(el)
      .nextUntil("h2")
      .find("li > a, ul a")
      .each((j, a) => {
        const endpoint = stripEndpoint($(a).attr("href"));
        const title = $(a).text().trim();
        if (endpoint && title) anime.push({ title, endpoint, thumb: "" });
      });
    if (anime.length > 0) days.push({ day: dayName, anime });
  });

  // Build a thumbnail lookup from a few pages of the ongoing list. A few
  // pages is enough since the schedule only lists currently-ongoing anime,
  // which is exactly what this list contains, newest first.
  const thumbByEndpoint = {};
  const ongoingPages = await Promise.all([1, 2, 3, 4].map((p) => getOngoing(p).catch(() => [])));
  for (const page of ongoingPages) {
    for (const item of page) {
      if (item.endpoint && item.thumb) thumbByEndpoint[item.endpoint] = item.thumb;
    }
  }

  for (const day of days) {
    for (const a of day.anime) {
      a.thumb = thumbByEndpoint[a.endpoint] || "";
    }
  }

  return days;
}

async function getAnimeDetail(endpoint) {
  const url = `${BASE_URL}/anime/${endpoint}/`;
  const html = await fetchHtml(url);
  const $ = cheerio.load(html);

  const infoEl = $(".fotoanime").first();
  const thumb = infoEl.find("img").attr("src") || "";
  const sinopsis = infoEl
    .find(".sinopc > p")
    .map((i, p) => $(p).text())
    .get()
    .join("\n\n");
  const detailLines = infoEl
    .find(".infozingle > p")
    .map((i, p) => $(p).text())
    .get();

  const detailMap = {};
  for (const line of detailLines) {
    const idx = line.indexOf(":");
    if (idx === -1) continue;
    detailMap[line.slice(0, idx).trim().toLowerCase()] = line.slice(idx + 1).trim();
  }

  const title = $(".jdlrx > h1").text().trim();

  const episodes = [];
  $(".episodelist")
    .find("li")
    .each((i, el) => {
      const epEndpoint = stripEndpoint($(el).find("span > a").attr("href"));
      if (!epEndpoint) return;
      episodes.push({
        title: $(el).find("span > a").text().trim(),
        date: $(el).find(".zeebr").text().trim(),
        endpoint: epEndpoint,
      });
    });

  return {
    title,
    thumb,
    synopsis: sinopsis,
    status: detailMap["status"] || "",
    studio: detailMap["studio"] || "",
    totalEpisode: detailMap["total episode"] || detailMap["episode"] || "",
    score: detailMap["skor"] || detailMap["score"] || "",
    genres: (detailMap["genre"] || "").split(",").map((g) => g.trim()).filter(Boolean),
    episodes,
  };
}

function extractQualityStandard(html, num) {
  const $ = cheerio.load(html);
  const links = [];
  let out;
  $(".download")
    .find("ul")
    .each(function () {
      const quality = $(this).find("li").eq(num).find("strong").text();
      const size = $(this).find("li").eq(num).find("i").text();
      $(this)
        .find("li")
        .eq(num)
        .find("a")
        .each(function () {
          links.push({ host: $(this).text().trim(), link: $(this).attr("href") });
        });
      if (quality) out = { quality, size, links };
    });
  return out;
}

function extractEpisodeDownloads(html) {
  return {
    low: extractQualityStandard(html, 0),
    medium: extractQualityStandard(html, 1),
    high: extractQualityStandard(html, 2),
  };
}

async function getAnimeEpisode(endpoint) {
  const url = `${BASE_URL}/episode/${endpoint}/`;
  const html = await fetchHtml(url);
  const $ = cheerio.load(html);

  const isBatchPage = $(".venutama > h1").length === 0 && $(".batchlink").length > 0;
  if (isBatchPage) {
    return {
      type: "batch",
      title: $(".batchlink > h4").text().trim() || endpoint,
      endpoint,
    };
  }

  const title = $(".venutama > h1").text().trim();
  const streamLink =
    $("#lightsVideo #embed_holder .responsive-embed-stream > iframe").attr("src") || null;

  const otherEpisodes = [];
  $("#selectcog > option").each((i, el) => {
    const value = $(el).attr("value");
    const epEndpoint = value ? stripEndpoint(value) : "";
    if (epEndpoint) otherEpisodes.push({ title: $(el).text().trim(), endpoint: epEndpoint });
  });

  const mirrors = [];
  for (const [cls, label] of [["m360p", "360p"], ["m480p", "480p"], ["m720p", "720p"]]) {
    $(`.mirrorstream > .${cls} > li`).each((i, el) => {
      const content = $(el).find("a").data("content");
      if (content) mirrors.push({ driver: $(el).text().trim(), quality: label, content: String(content) });
    });
  }

  return {
    type: "episode",
    title,
    streamLink,
    otherEpisodes,
    mirrors,
    downloads: extractEpisodeDownloads(html),
  };
}

const NONCE_ACTION = "aa1208d27f29ca340c92c66d1926f13f";
const RESOLVE_ACTION = "2a3505c93b0035d3f455df82bf976b84";

async function getNonce() {
  const body = new URLSearchParams({ action: NONCE_ACTION }).toString();
  const { data } = await axios.post(`${BASE_URL}/wp-admin/admin-ajax.php`, body, {
    timeout: 15000,
    headers: {
      Origin: BASE_URL,
      Referer: BASE_URL,
      "X-Requested-With": "XMLHttpRequest",
      "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
    },
  });
  return data?.data || null;
}

async function resolveMirror(content) {
  const nonce = await getNonce();
  if (!nonce) throw new Error("Gagal mendapatkan nonce dari situs sumber.");

  const decoded = JSON.parse(Buffer.from(content, "base64").toString("utf8"));
  const body = new URLSearchParams({ ...decoded, nonce, action: RESOLVE_ACTION }).toString();

  const { data } = await axios.post(`${BASE_URL}/wp-admin/admin-ajax.php`, body, {
    timeout: 15000,
    headers: {
      Origin: BASE_URL,
      Referer: BASE_URL,
      "X-Requested-With": "XMLHttpRequest",
      "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
    },
  });

  if (!data?.data) throw new Error("Situs sumber tidak mengembalikan data streaming untuk server ini.");
  const html = Buffer.from(data.data, "base64").toString("utf8");
  const $ = cheerio.load(html);
  const link = $("iframe").attr("src");
  if (!link) throw new Error("Tidak ditemukan iframe pada hasil resolve.");
  return link;
}

async function getBatchLink(endpoint) {
  const url = `${BASE_URL}/batch/${endpoint}`;
  const html = await fetchHtml(url);
  const $ = cheerio.load(html);
  const title = $(".batchlink > h4").text().trim();

  const extract = (num) => {
    const links = [];
    let out;
    $(".batchlink")
      .find("ul")
      .each(function () {
        const quality = $(this).find("li").eq(num).find("strong").text();
        const size = $(this).find("li").eq(num).find("i").text();
        $(this)
          .find("li")
          .eq(num)
          .find("a")
          .each(function () {
            links.push({ host: $(this).text().trim(), link: $(this).attr("href") });
          });
        if (quality) out = { quality, size, links };
      });
    return out;
  };

  return {
    title,
    low: extract(0),
    medium: extract(1),
    high: extract(2),
  };
}

module.exports = {
  getBaseUrl,
  setBaseUrl,
  getOngoing,
  getCompleted,
  search,
  getGenreList,
  getGenrePage,
  getSchedule,
  getAnimeDetail,
  getAnimeEpisode,
  resolveMirror,
  getBatchLink,
};
