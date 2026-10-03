const axios = require("axios");
const fs = require("fs");
const path = require("path");
const { app, BrowserWindow } = require("electron");
const settings = require("./settings");

const MANIFEST_PATH = path.join(app.getPath("userData"), "downloads-manifest.json");

function readManifest() {
  try {
    return JSON.parse(fs.readFileSync(MANIFEST_PATH, "utf8"));
  } catch {
    return { items: [] };
  }
}

function writeManifest(manifest) {
  fs.writeFileSync(MANIFEST_PATH, JSON.stringify(manifest, null, 2), "utf8");
}

function safeName(name) {
  return String(name || "untitled").replace(/[\\/:*?"<>|]+/g, "-").trim().slice(0, 120);
}

function listDownloads() {
  return readManifest().items;
}

function getLocalFile(episodeEndpoint) {
  const item = readManifest().items.find((i) => i.episodeEndpoint === episodeEndpoint && i.status === "done");
  return item || null;
}

function deleteDownload(id) {
  const manifest = readManifest();
  const item = manifest.items.find((i) => i.id === id);
  if (item?.filePath && fs.existsSync(item.filePath)) {
    try {
      fs.unlinkSync(item.filePath);
    } catch {
      // If the file is locked/already gone, still remove the manifest entry.
    }
  }
  manifest.items = manifest.items.filter((i) => i.id !== id);
  writeManifest(manifest);
}

function upsertManifestItem(item) {
  const manifest = readManifest();
  const idx = manifest.items.findIndex((i) => i.id === item.id);
  if (idx === -1) manifest.items.push(item);
  else manifest.items[idx] = { ...manifest.items[idx], ...item };
  writeManifest(manifest);
}

function guessExtFromFilename(filename, mimeType) {
  const fromName = path.extname(filename || "").replace(".", "");
  if (fromName) return fromName.slice(0, 4);
  if (mimeType?.includes("matroska")) return "mkv";
  return "mp4";
}

/**
 * Opens a manual-download host page in its own window that's still part of
 * this app (not the system's default browser), and — the important part —
 * actually captures whatever file gets downloaded inside it via Electron's
 * `will-download` event, redirects it into our managed downloads folder,
 * tracks its progress, and records it in the manifest exactly like an
 * automatic download. This is what lets an episode downloaded this way
 * become playable in-app afterwards, instead of just landing in the
 * system's normal Downloads folder with no link back to the app.
 *
 * Each call uses a fresh, isolated (non-persistent) session partition so
 * this doesn't interfere with the main app's session or with other
 * download windows open at the same time.
 */
function openInAppBrowser(url, { title, onProgress, manifestId, animeTitle, episodeTitle, quality } = {}) {
  const win = new BrowserWindow({
    width: 1000,
    height: 720,
    title: title || "Yozora — Download",
    autoHideMenuBar: true,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      partition: `download-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    },
  });

  win.webContents.session.on("will-download", (event, item) => {
    const ext = guessExtFromFilename(item.getFilename(), item.getMimeType());
    const destPath = path.join(
      settings.getDownloadDir(),
      safeName(animeTitle),
      `${safeName(episodeTitle)}${quality ? ` [${quality}]` : ""}.${ext}`
    );
    fs.mkdirSync(path.dirname(destPath), { recursive: true });
    item.setSavePath(destPath);

    item.on("updated", (e, state) => {
      if (state !== "progressing") return;
      const total = item.getTotalBytes();
      const received = item.getReceivedBytes();
      const percent = total ? received / total : null;
      upsertManifestItem({ id: manifestId, status: "downloading", percent, downloadedBytes: received, totalBytes: total });
      onProgress?.({ id: manifestId, status: "downloading", percent });
    });

    item.once("done", (e, state) => {
      if (state === "completed") {
        upsertManifestItem({ id: manifestId, status: "done", percent: 1, filePath: destPath, finishedAt: Date.now() });
        onProgress?.({ id: manifestId, status: "done", filePath: destPath, percent: 1 });
        win.close();
      } else {
        upsertManifestItem({ id: manifestId, status: "error", error: `Download tidak selesai (${state})` });
        onProgress?.({ id: manifestId, status: "error", error: state });
      }
    });
  });

  win.loadURL(url);
  return win;
}

/**
 * Downloads a single quality+host combo the user picked from the real
 * scraped download links (see scraper.js's extractEpisodeDownloads /
 * getBatchLink — Mp4/MKV per resolution, each with several file-hosting
 * providers). File hosts vary wildly in how "direct" their links are:
 * some serve the actual file straight away, many serve an HTML landing
 * page first (countdown timer, ads, a real "click here" button) that a
 * plain HTTP GET can't get past.
 *
 * We detect this by checking the response's Content-Type: if it looks
 * like a real media/binary file, we stream-save it like normal. If it
 * looks like an HTML page instead, we don't guess further — we open it
 * in a separate window that's still part of this app (not the system's
 * default browser), where any of that host's normal interactive steps
 * work exactly as they would visiting the site directly.
 */
async function downloadFromLink({ context, onProgress }) {
  const { animeEndpoint, animeTitle, animeThumb, episodeEndpoint, episodeTitle, quality, host, link } = context;
  const id = `${episodeEndpoint}::${quality}::${host}`;

  upsertManifestItem({
    id,
    type: "episode",
    status: "downloading",
    animeEndpoint,
    animeTitle,
    animeThumb,
    episodeEndpoint,
    episodeTitle,
    quality,
    host,
    percent: 0,
    startedAt: Date.now(),
  });

  try {
    const response = await axios.get(link, {
      responseType: "stream",
      timeout: 30000,
      maxRedirects: 10,
      headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)" },
      validateStatus: (s) => s < 400,
    });

    const contentType = String(response.headers["content-type"] || "").toLowerCase();
    const looksLikeWebpage = contentType.includes("text/html");

    if (looksLikeWebpage) {
      response.data.destroy();
      openInAppBrowser(link, {
        title: `Yozora — Download (${host})`,
        onProgress,
        manifestId: id,
        animeTitle,
        episodeTitle,
        quality,
      });
      upsertManifestItem({
        id,
        status: "manual",
        note: "Jendela dibuka dalam aplikasi — begitu file mulai terdownload di sana, progresnya otomatis muncul di sini.",
      });
      onProgress?.({ id, status: "manual", host });
      return { ok: false, needsManual: true, host };
    }

    const total = parseInt(response.headers["content-length"] || "0", 10);
    let downloaded = 0;

    const disposition = response.headers["content-disposition"] || "";
    const nameMatch = disposition.match(/filename="?([^";]+)"?/i);
    const guessedExt = (nameMatch?.[1]?.split(".").pop() || "mp4").slice(0, 4);
    const destPath = path.join(
      settings.getDownloadDir(),
      safeName(animeTitle),
      `${safeName(episodeTitle)} [${quality}].${guessedExt}`
    );
    fs.mkdirSync(path.dirname(destPath), { recursive: true });

    const writer = fs.createWriteStream(destPath);
    response.data.on("data", (chunk) => {
      downloaded += chunk.length;
      const percent = total ? downloaded / total : null;
      upsertManifestItem({ id, percent, downloadedBytes: downloaded, totalBytes: total });
      onProgress?.({ id, percent, downloaded, total, status: "downloading" });
    });

    await new Promise((resolve, reject) => {
      response.data.pipe(writer);
      writer.on("finish", resolve);
      writer.on("error", reject);
      response.data.on("error", reject);
    });

    upsertManifestItem({ id, status: "done", percent: 1, filePath: destPath, finishedAt: Date.now() });
    onProgress?.({ id, percent: 1, status: "done", filePath: destPath });
    return { ok: true, filePath: destPath };
  } catch (err) {
    upsertManifestItem({ id, status: "error", error: err.message });
    onProgress?.({ id, status: "error", error: err.message });
    return { ok: false, error: err.message };
  }
}

/**
 * Bulk "download all episodes" — picks a sensible default quality/host per
 * episode automatically (medium quality tier, first host listed) since
 * there's no per-episode picker in a bulk flow. See README for why this
 * doesn't try to fetch the source site's own combined batch archive.
 */
async function downloadAllEpisodes({ scraper, context, onProgress }) {
  const { animeEndpoint, animeTitle, animeThumb, episodes } = context;
  const results = [];

  for (const ep of episodes) {
    onProgress?.({ id: ep.endpoint, status: "starting", episodeTitle: ep.title });
    try {
      const page = await scraper.getAnimeEpisode(ep.endpoint);
      const tier = page.downloads?.medium || page.downloads?.low || page.downloads?.high;
      const firstLink = tier?.links?.[0];
      if (!firstLink?.link) {
        results.push({ endpoint: ep.endpoint, ok: false, error: "Tidak ada link download untuk episode ini." });
        onProgress?.({ id: ep.endpoint, status: "error", error: "Tidak ada link download untuk episode ini." });
        continue;
      }
      const result = await downloadFromLink({
        context: {
          animeEndpoint,
          animeTitle,
          animeThumb,
          episodeEndpoint: ep.endpoint,
          episodeTitle: page.title || ep.title,
          quality: tier.quality || "auto",
          host: firstLink.host || "unknown",
          link: firstLink.link,
        },
        onProgress,
      });
      results.push({ endpoint: ep.endpoint, ...result });
    } catch (err) {
      results.push({ endpoint: ep.endpoint, ok: false, error: err.message });
      onProgress?.({ id: ep.endpoint, status: "error", error: err.message });
    }
    await new Promise((r) => setTimeout(r, 500)); // be polite to the source site between episodes
  }

  return results;
}

module.exports = {
  listDownloads,
  getLocalFile,
  deleteDownload,
  downloadFromLink,
  downloadAllEpisodes,
};
