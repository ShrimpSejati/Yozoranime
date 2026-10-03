const main = document.getElementById("app-main");
const sideLinks = document.querySelectorAll(".side-link");
const searchForm = document.getElementById("search-form");
const searchInput = document.getElementById("search-input");

// Fill every [data-icon] placeholder (sidebar, topbar, etc.) with its SVG
// once at startup, so markup stays readable (`data-icon="home"`) while the
// actual icon set lives in one place (icons.js).
function mountStaticIcons(root = document) {
  root.querySelectorAll("[data-icon]").forEach((el) => {
    if (!el.dataset.iconMounted) {
      el.innerHTML = icon(el.dataset.icon, Number(el.dataset.iconSize) || 17);
      el.dataset.iconMounted = "1";
    }
  });
}
mountStaticIcons();

// ---------------- Local persistence (history / bookmarks / watchlist) ----------------
// No backend for this — the source site has no concept of user accounts, so
// these are stored locally in the browser's localStorage only.
// "Koleksi Saya" = watchlist (Tonton Nanti), "Bookmark" = bookmarks, kept as
// two separate lists since the reference design shows them as distinct nav items.

const STORE_KEYS = {
  history: "yozora:history",
  bookmarks: "yozora:bookmarks",
  watchlist: "yozora:watchlist",
  notifications: "yozora:notifications",
  episodeCache: "yozora:episodeCache",
};

function readStore(key) {
  try {
    return JSON.parse(localStorage.getItem(key) || "[]");
  } catch {
    return [];
  }
}
function writeStore(key, value) {
  localStorage.setItem(key, JSON.stringify(value));
}

// entry: { animeEndpoint, animeTitle, animeThumb, episodeEndpoint, episodeTitle }
function pushHistory(entry) {
  const list = readStore(STORE_KEYS.history).filter((h) => h.episodeEndpoint !== entry.episodeEndpoint);
  list.unshift({ ...entry, watchedAt: Date.now() });
  writeStore(STORE_KEYS.history, list.slice(0, 30));
}

function isBookmarked(endpoint) {
  return readStore(STORE_KEYS.bookmarks).some((b) => b.endpoint === endpoint);
}
function toggleBookmark(entry) {
  const list = readStore(STORE_KEYS.bookmarks);
  const idx = list.findIndex((b) => b.endpoint === entry.endpoint);
  if (idx === -1) list.unshift(entry);
  else list.splice(idx, 1);
  writeStore(STORE_KEYS.bookmarks, list);
  return idx === -1;
}

function isInWatchlist(endpoint) {
  return readStore(STORE_KEYS.watchlist).some((b) => b.endpoint === endpoint);
}
function toggleWatchlist(entry) {
  const list = readStore(STORE_KEYS.watchlist);
  const idx = list.findIndex((b) => b.endpoint === entry.endpoint);
  if (idx === -1) list.unshift(entry);
  else list.splice(idx, 1);
  writeStore(STORE_KEYS.watchlist, list);
  return idx === -1;
}

function relativeTime(ts) {
  const diffMin = Math.floor((Date.now() - ts) / 60000);
  if (diffMin < 1) return "Baru saja";
  if (diffMin < 60) return `${diffMin} menit lalu`;
  const diffHour = Math.floor(diffMin / 60);
  if (diffHour < 24) return `${diffHour} jam lalu`;
  return `${Math.floor(diffHour / 24)} hari lalu`;
}

const AUTO_NEXT_KEY = "yozora:autoNext";
function getAutoNextPref() {
  return localStorage.getItem(AUTO_NEXT_KEY) === "1";
}
function setAutoNextPref(value) {
  localStorage.setItem(AUTO_NEXT_KEY, value ? "1" : "0");
}

function extractEpNum(title) {
  const m = String(title || "").match(/(\d+(\.\d+)?)/);
  return m ? parseFloat(m[1]) : null;
}

// Finds the episode with the next-higher number than `currentTitle` inside
// `candidates` — safer than assuming list order, since the dropdown this
// list comes from isn't guaranteed to be ascending or descending.
function findNextEpisode(currentTitle, candidates) {
  const currentNum = extractEpNum(currentTitle);
  if (currentNum === null) return null;
  let best = null;
  for (const c of candidates) {
    const n = extractEpNum(c.title);
    if (n === null || n <= currentNum) continue;
    if (best === null || n < extractEpNum(best.title)) best = c;
  }
  return best;
}

// ---------------- Notifications: background update checking ----------------
// Checks every anime saved in Bookmark + Koleksi Saya against its latest
// episode, and notifies (native OS notification + in-app bell panel) when a
// newer episode number shows up than what we last recorded for it.

function getWatchedAnimeList() {
  const combined = [...readStore(STORE_KEYS.bookmarks), ...readStore(STORE_KEYS.watchlist)];
  const seen = new Set();
  return combined.filter((a) => {
    if (seen.has(a.endpoint)) return false;
    seen.add(a.endpoint);
    return true;
  });
}

function pushNotification(entry) {
  const list = readStore(STORE_KEYS.notifications);
  list.unshift({ ...entry, id: `${entry.animeEndpoint}:${entry.episodeTitle}:${Date.now()}`, read: false, createdAt: Date.now() });
  writeStore(STORE_KEYS.notifications, list.slice(0, 50));
  updateNotifBadge();
}

function unreadNotifCount() {
  return readStore(STORE_KEYS.notifications).filter((n) => !n.read).length;
}

function updateNotifBadge() {
  const badge = document.getElementById("notif-badge");
  if (!badge) return;
  const count = unreadNotifCount();
  badge.style.display = count > 0 ? "flex" : "none";
  badge.textContent = count > 9 ? "9+" : String(count);
}

function fireOsNotification(title, body, icon) {
  try {
    if (typeof Notification === "undefined") return;
    if (Notification.permission === "granted") {
      new Notification(title, { body, icon });
    } else if (Notification.permission !== "denied") {
      Notification.requestPermission().then((perm) => {
        if (perm === "granted") new Notification(title, { body, icon });
      });
    }
  } catch {
    // Notifications aren't critical to the app working — fail silently.
  }
}

let checkingUpdates = false;
async function checkForUpdates({ silent = false } = {}) {
  if (checkingUpdates) return;
  checkingUpdates = true;
  const list = getWatchedAnimeList();
  const cache = readStore(STORE_KEYS.episodeCache);
  const cacheMap = Object.fromEntries(cache.map((c) => [c.endpoint, c]));

  for (const anime of list) {
    try {
      const d = await window.otaku.detail(anime.endpoint);
      if (!d.episodes.length) continue;

      let latest = d.episodes[0];
      for (const ep of d.episodes) {
        if ((extractEpNum(ep.title) ?? -1) > (extractEpNum(latest.title) ?? -1)) latest = ep;
      }

      const prev = cacheMap[anime.endpoint];
      const prevNum = prev ? extractEpNum(prev.lastEpisodeTitle) : null;
      const latestNum = extractEpNum(latest.title);

      if (prev && latestNum !== null && (prevNum === null || latestNum > prevNum)) {
        pushNotification({
          animeEndpoint: anime.endpoint,
          animeTitle: anime.title,
          animeThumb: anime.thumb,
          episodeTitle: latest.title,
          episodeEndpoint: latest.endpoint,
        });
        if (!silent) fireOsNotification("Episode baru rilis!", `${anime.title} — ${latest.title}`, anime.thumb);
      }

      cacheMap[anime.endpoint] = { endpoint: anime.endpoint, lastEpisodeTitle: latest.title };
    } catch {
      // A single anime failing to fetch shouldn't stop the rest of the check.
    }
    await new Promise((r) => setTimeout(r, 600)); // be polite to the source site
  }

  writeStore(STORE_KEYS.episodeCache, Object.values(cacheMap));
  checkingUpdates = false;
}

function renderNotifPanel() {
  const panel = document.getElementById("notif-panel");
  const list = readStore(STORE_KEYS.notifications);
  panel.innerHTML = `
    <div class="notif-header">
      <span>Notifikasi</span>
      ${list.length ? `<button id="notif-clear">Hapus semua</button>` : ""}
    </div>
    ${
      list.length === 0
        ? `<div class="notif-empty">Belum ada update baru dari anime di Bookmark/Koleksi Saya.</div>`
        : list
            .map(
              (n) => `
        <div class="notif-item" data-endpoint="${escapeHtml(n.episodeEndpoint)}" data-anime="${escapeHtml(n.animeEndpoint)}" data-id="${escapeHtml(n.id)}">
          <img src="${escapeHtml(n.animeThumb || "")}" loading="lazy" />
          <div>
            <div class="nt">${escapeHtml(n.animeTitle)}</div>
            <div class="nd">${escapeHtml(n.episodeTitle)} sudah rilis</div>
            <div class="nm">${relativeTime(n.createdAt)}</div>
          </div>
        </div>`
            )
            .join("")
    }`;

  document.getElementById("notif-clear")?.addEventListener("click", (e) => {
    e.stopPropagation();
    writeStore(STORE_KEYS.notifications, []);
    updateNotifBadge();
    renderNotifPanel();
  });

  panel.querySelectorAll(".notif-item").forEach((el) => {
    el.addEventListener("click", () => {
      const list2 = readStore(STORE_KEYS.notifications).map((n) => (n.id === el.dataset.id ? { ...n, read: true } : n));
      writeStore(STORE_KEYS.notifications, list2);
      updateNotifBadge();
      document.getElementById("notif-panel").style.display = "none";
      renderWatch(el.dataset.endpoint, { animeEndpoint: el.dataset.anime });
    });
  });
}

function wireNotifBell() {
  const bellBtn = document.getElementById("bell-btn");
  const panel = document.getElementById("notif-panel");
  bellBtn?.addEventListener("click", (e) => {
    e.stopPropagation();
    const willShow = panel.style.display === "none";
    if (willShow) renderNotifPanel();
    panel.style.display = willShow ? "block" : "none";
  });
  document.addEventListener("click", (e) => {
    if (panel && !panel.contains(e.target) && e.target !== bellBtn) panel.style.display = "none";
  });
  updateNotifBadge();
}

// ---------------- Helpers ----------------

function setActiveNav(view) {
  sideLinks.forEach((btn) => btn.classList.toggle("active", btn.dataset.view === view));
}

function stateLoading(label = "Memuat…") {
  main.innerHTML = `<div class="state"><div class="spinner"></div><p>${label}</p></div>`;
}

function stateError(message, onRetry) {
  main.innerHTML = `
    <div class="state">
      <h3>Gagal memuat data</h3>
      <p>${escapeHtml(message)}</p>
      <button class="retry-btn" id="retry-btn">Coba lagi</button>
    </div>`;
  document.getElementById("retry-btn")?.addEventListener("click", onRetry);
}

function stateEmpty(title, message = "") {
  main.innerHTML = `<div class="state"><h3>${escapeHtml(title)}</h3><p>${escapeHtml(message)}</p></div>`;
}

function escapeHtml(str) {
  return String(str ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

function animeCardHtml(item) {
  const badge = item.episodeInfo
    ? `<span class="badge">${escapeHtml(item.episodeInfo.trim())}</span>`
    : item.status
    ? `<span class="badge">${escapeHtml(item.status)}</span>`
    : "";
  return `
    <div class="card" data-endpoint="${escapeHtml(item.endpoint)}">
      <div class="card-thumb">
        <img src="${escapeHtml(item.thumb || "")}" loading="lazy" />
        ${badge}
      </div>
      <div class="card-body">
        <div class="card-title">${escapeHtml(item.title)}</div>
        ${item.updatedOn ? `<div class="card-meta">${escapeHtml(item.updatedOn.trim())}</div>` : ""}
      </div>
    </div>`;
}

function bindCardClicks(root = main) {
  root.querySelectorAll(".card[data-endpoint]").forEach((card) => {
    card.addEventListener("click", () => renderDetail(card.dataset.endpoint));
  });
}

function sectionTitleHtml(text, iconName) {
  return `<div class="section-title"><span>${iconName ? icon(iconName, 16, "margin-right:8px;color:var(--accent-2)") : ""}${escapeHtml(text)}</span></div>`;
}

// ---------------- Views: browse ----------------

async function renderHome() {
  setActiveNav("home");
  stateLoading("Mengambil daftar ongoing…");
  try {
    const list = await window.otaku.ongoing(1);
    if (list.length === 0) return stateEmpty("Tidak ada data", "Belum ada anime ongoing saat ini.");

    const featured = list[0];
    const history = readStore(STORE_KEYS.history);

    // Background image + gradient set together, inline, in one property —
    // this avoids the tiling bug that happens when an inline `background-image`
    // override splits away from a stylesheet shorthand that set
    // background-size/repeat separately.
    const heroBgStyle = featured.thumb
      ? `background-image: linear-gradient(90deg, rgba(13,11,20,.97) 28%, rgba(13,11,20,.55)), url('${escapeHtml(featured.thumb)}'); background-size: cover; background-position: center; background-repeat: no-repeat;`
      : "";

    const heroHtml = `
      <div class="hero" style="${heroBgStyle}">
        <div class="hero-eyebrow">Sedang Tayang</div>
        <div>
          <h1 class="hero-title">${escapeHtml(featured.title)}</h1>
          <p class="hero-sub">${escapeHtml(featured.episodeInfo || "")} ${escapeHtml(featured.updatedOn || "")}</p>
          <div class="hero-actions">
            <button class="btn-primary" id="hero-watch">${icon("play", 15)} Lihat Detail</button>
            <button class="btn-ghost" id="hero-watchlist">${icon("plus", 15)} Tonton Nanti</button>
          </div>
        </div>
      </div>`;

    const continueHtml = history.length
      ? `
      ${sectionTitleHtml("Lanjutkan Menonton", "history")}
      <div class="row-scroll">
        ${history
          .slice(0, 8)
          .map(
            (h) => `
          <div class="cw-card" data-endpoint="${escapeHtml(h.episodeEndpoint)}">
            <div class="cw-thumb"><img src="${escapeHtml(h.animeThumb || "")}" loading="lazy" /></div>
            <div class="cw-title">${escapeHtml(h.animeTitle)}</div>
            <div class="cw-meta">${escapeHtml(h.episodeTitle)} · ${relativeTime(h.watchedAt)}</div>
          </div>`
          )
          .join("")}
      </div>`
      : "";

    const ongoingGridHtml = `
      ${sectionTitleHtml("Sedang Tayang", "film")}
      <div class="grid">${list.map(animeCardHtml).join("")}</div>`;

    main.innerHTML = heroHtml + continueHtml + ongoingGridHtml;

    document.getElementById("hero-watch")?.addEventListener("click", () => renderDetail(featured.endpoint));
    document.getElementById("hero-watchlist")?.addEventListener("click", (e) => {
      const added = toggleWatchlist({ endpoint: featured.endpoint, title: featured.title, thumb: featured.thumb });
      e.currentTarget.innerHTML = added ? `${icon("check", 15)} Ditambahkan` : `${icon("plus", 15)} Tonton Nanti`;
    });
    main.querySelectorAll(".cw-card[data-endpoint]").forEach((el) => el.addEventListener("click", () => renderWatch(el.dataset.endpoint)));
    bindCardClicks();
  } catch (err) {
    stateError(err.message, () => renderHome());
  }
}

async function renderExplore(tab = "ongoing", page = 1) {
  setActiveNav("explore");
  stateLoading("Mengambil daftar anime…");
  try {
    const list = tab === "completed" ? await window.otaku.completed(page) : await window.otaku.ongoing(page);
    main.innerHTML = `
      <div class="section-title"><span>Jelajahi Anime</span></div>
      <div class="tab-row" style="margin-top:0">
        <button class="tab-btn ${tab === "ongoing" ? "active" : ""}" data-explore-tab="ongoing">Sedang Tayang</button>
        <button class="tab-btn ${tab === "completed" ? "active" : ""}" data-explore-tab="completed">Tamat</button>
        <button class="tab-btn" data-explore-tab="genres">Genre</button>
      </div>
      <div id="explore-body">
        ${
          list.length === 0
            ? `<div class="state"><h3>Tidak ada data</h3></div>`
            : `<div class="grid">${list.map(animeCardHtml).join("")}</div>
               <div class="pagination">
                 <button class="page-btn" id="prev-btn" ${page <= 1 ? "disabled" : ""}>← Sebelumnya</button>
                 <span>Halaman ${page}</span>
                 <button class="page-btn" id="next-btn">Selanjutnya →</button>
               </div>`
        }
      </div>`;
    bindCardClicks();
    document.getElementById("prev-btn")?.addEventListener("click", () => renderExplore(tab, page - 1));
    document.getElementById("next-btn")?.addEventListener("click", () => renderExplore(tab, page + 1));
    main.querySelectorAll("[data-explore-tab]").forEach((btn) => {
      btn.addEventListener("click", () => {
        if (btn.dataset.exploreTab === "genres") renderGenres();
        else renderExplore(btn.dataset.exploreTab, 1);
      });
    });
  } catch (err) {
    stateError(err.message, () => renderExplore(tab, page));
  }
}

async function renderGenres() {
  setActiveNav("explore");
  stateLoading("Mengambil daftar genre…");
  try {
    const genres = await window.otaku.genres();
    if (genres.length === 0) return stateEmpty("Daftar genre tidak tersedia");
    main.innerHTML = `
      <div class="section-title"><span>Jelajahi Genre</span></div>
      <div class="tab-row" style="margin-top:0">
        <button class="tab-btn" data-back-explore>Sedang Tayang</button>
        <button class="tab-btn" data-back-explore-completed>Tamat</button>
        <button class="tab-btn active">Genre</button>
      </div>
      <div class="pill-row">
        ${genres.map((g) => `<span class="pill accent" style="cursor:pointer" data-genre="${escapeHtml(g.endpoint)}">${escapeHtml(g.name)}</span>`).join("")}
      </div>`;
    document.querySelector("[data-back-explore]")?.addEventListener("click", () => renderExplore("ongoing", 1));
    document.querySelector("[data-back-explore-completed]")?.addEventListener("click", () => renderExplore("completed", 1));
    main.querySelectorAll("[data-genre]").forEach((el) => el.addEventListener("click", () => renderGenrePage(el.dataset.genre, 1)));
  } catch (err) {
    stateError(err.message, () => renderGenres());
  }
}

async function renderGenrePage(genre, page = 1) {
  stateLoading(`Mengambil anime genre ${genre}…`);
  try {
    const list = await window.otaku.genrePage(genre, page);
    main.innerHTML = `
      <div class="section-title"><span>Genre: ${escapeHtml(genre)}</span></div>
      <div class="grid">${list.map(animeCardHtml).join("")}</div>
      <div class="pagination">
        <button class="page-btn" id="prev-btn" ${page <= 1 ? "disabled" : ""}>← Sebelumnya</button>
        <span>Halaman ${page}</span>
        <button class="page-btn" id="next-btn">Selanjutnya →</button>
      </div>`;
    bindCardClicks();
    document.getElementById("prev-btn")?.addEventListener("click", () => renderGenrePage(genre, page - 1));
    document.getElementById("next-btn")?.addEventListener("click", () => renderGenrePage(genre, page + 1));
  } catch (err) {
    stateError(err.message, () => renderGenrePage(genre, page));
  }
}

async function renderSearch(query) {
  sideLinks.forEach((btn) => btn.classList.remove("active"));
  stateLoading(`Mencari "${query}"…`);
  try {
    const list = await window.otaku.search(query);
    if (list.length === 0) return stateEmpty("Tidak ditemukan", "Coba kata kunci lain.");
    main.innerHTML = `
      <div class="section-title"><span>Hasil untuk "${escapeHtml(query)}"</span></div>
      <div class="grid">${list.map(animeCardHtml).join("")}</div>`;
    bindCardClicks();
  } catch (err) {
    stateError(err.message, () => renderSearch(query));
  }
}

// ---------------- Views: locally-stored lists ----------------

function renderLocalListView(view, storeKey, title, emptyMsg) {
  setActiveNav(view);
  const list = readStore(storeKey);
  if (list.length === 0) return stateEmpty(title, emptyMsg);
  main.innerHTML = `
    <div class="section-title"><span>${escapeHtml(title)}</span></div>
    <div class="grid">${list.map((item) => animeCardHtml({ ...item, endpoint: item.endpoint })).join("")}</div>`;
  bindCardClicks();
}

function renderWatchlistView() {
  renderLocalListView("watchlist", STORE_KEYS.watchlist, "Koleksi Saya", "Belum ada anime di daftar tonton nanti. Tambahkan dari halaman detail.");
}
function renderBookmarksView() {
  renderLocalListView("bookmarks", STORE_KEYS.bookmarks, "Bookmark", "Belum ada anime yang di-bookmark. Tandai dari halaman detail.");
}
function renderHistoryView() {
  setActiveNav("history");
  const list = readStore(STORE_KEYS.history);
  if (list.length === 0) return stateEmpty("Riwayat kosong", "Episode yang kamu tonton akan muncul di sini.");
  main.innerHTML = `
    <div class="section-title"><span>Riwayat Tontonan</span></div>
    <div class="row-scroll" style="flex-wrap:wrap">
      ${list
        .map(
          (h) => `
        <div class="cw-card" data-endpoint="${escapeHtml(h.episodeEndpoint)}">
          <div class="cw-thumb"><img src="${escapeHtml(h.animeThumb || "")}" loading="lazy" /></div>
          <div class="cw-title">${escapeHtml(h.animeTitle)}</div>
          <div class="cw-meta">${escapeHtml(h.episodeTitle)} · ${relativeTime(h.watchedAt)}</div>
        </div>`
        )
        .join("")}
    </div>`;
  main.querySelectorAll(".cw-card[data-endpoint]").forEach((el) => el.addEventListener("click", () => renderWatch(el.dataset.endpoint)));
}

async function renderSchedule() {
  setActiveNav("schedule");
  stateLoading("Mengambil jadwal rilis…");
  try {
    const days = await window.otaku.schedule();
    if (days.length === 0) return stateEmpty("Jadwal tidak tersedia");

    const order = ["Senin", "Selasa", "Rabu", "Kamis", "Jumat", "Sabtu", "Minggu"];
    const sorted = [...days].sort((a, b) => {
      const ia = order.indexOf(a.day);
      const ib = order.indexOf(b.day);
      return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib);
    });

    main.innerHTML = `
      ${sectionTitleHtml("Jadwal Rilis", "calendar")}
      ${sorted
        .map(
          (d) => `
        <div style="margin-bottom:26px">
          <div style="font-weight:800;font-size:13.5px;color:var(--accent-2);margin-bottom:10px">${escapeHtml(d.day)}</div>
          <div class="row-scroll">
            ${d.anime
              .map(
                (a) => `
              <div class="ep-card" data-endpoint="${escapeHtml(a.endpoint)}">
                <div class="ep-thumb">
                  <img src="${escapeHtml(a.thumb || "")}" loading="lazy" />
                </div>
                <div class="ep-title">${escapeHtml(a.title)}</div>
              </div>`
              )
              .join("")}
          </div>
        </div>`
        )
        .join("")}`;

    main.querySelectorAll(".ep-card[data-endpoint]").forEach((el) => el.addEventListener("click", () => renderDetail(el.dataset.endpoint)));
  } catch (err) {
    stateError(err.message, () => renderSchedule());
  }
}

async function openDownloadPicker(ctx) {
  let overlay = document.getElementById("dl-picker-overlay");
  if (overlay) overlay.remove();

  overlay = document.createElement("div");
  overlay.id = "dl-picker-overlay";
  overlay.className = "modal-overlay";
  overlay.innerHTML = `
    <div class="modal-box">
      <div class="modal-header">
        <span>Download — ${escapeHtml(ctx.episodeTitle)}</span>
        <button class="icon-btn" id="dl-picker-close">✕</button>
      </div>
      <div class="modal-body" id="dl-picker-body">
        <div class="state"><div class="spinner"></div><p>Mengambil daftar link download…</p></div>
      </div>
    </div>`;
  document.body.appendChild(overlay);

  const close = () => overlay.remove();
  document.getElementById("dl-picker-close").addEventListener("click", close);
  overlay.addEventListener("click", (e) => {
    if (e.target === overlay) close();
  });

  const body = document.getElementById("dl-picker-body");
  try {
    const epPage = await window.otaku.episode(ctx.episodeEndpoint);
    const tiers = epPage.downloads || {};
    const tierList = ["low", "medium", "high"].map((k) => tiers[k]).filter((t) => t?.links?.length);

    if (tierList.length === 0) {
      body.innerHTML = `<div class="state"><h3>Tidak ada link download</h3><p>Situs sumber tidak menyediakan link download untuk episode ini.</p></div>`;
      return;
    }

    body.innerHTML = `
      <p style="color:var(--text-faint);font-size:11.5px;margin-bottom:14px">
        Pilih resolusi dan server. Beberapa host butuh langkah manual (klik tunggu/iklan) —
        kalau begitu, linknya otomatis dibuka di jendela baru dalam aplikasi ini (bukan browser) —
        begitu file-nya mulai terdownload di sana, progresnya otomatis muncul di halaman Download,
        dan episode-nya langsung bisa diputar di aplikasi setelah selesai.
      </p>
      ${tierList
        .map(
          (tier) => `
        <div class="dl-tier">
          <div class="dl-tier-head">${escapeHtml(tier.quality || "")}${tier.size ? ` · ${escapeHtml(tier.size.trim())}` : ""}</div>
          <div class="server-row">
            ${tier.links
              .map(
                (l) =>
                  `<button class="server-btn" data-tier="${escapeHtml(tier.quality || "")}" data-host="${escapeHtml(l.host)}" data-link="${escapeHtml(l.link)}">${escapeHtml(l.host)}</button>`
              )
              .join("")}
          </div>
        </div>`
        )
        .join("")}
      <div id="dl-picker-status" style="margin-top:14px;font-size:12px;color:var(--text-muted)"></div>`;

    body.querySelectorAll("[data-link]").forEach((btn) => {
      btn.addEventListener("click", async () => {
        const status = document.getElementById("dl-picker-status");
        btn.disabled = true;
        status.textContent = `Mencoba download dari ${btn.dataset.host}…`;
        const result = await window.otaku.downloadFromLink({
          ...ctx,
          quality: btn.dataset.tier,
          host: btn.dataset.host,
          link: btn.dataset.link,
        });
        btn.disabled = false;
        if (result.ok) {
          status.textContent = `Berhasil diunduh dari ${btn.dataset.host}. Lihat halaman Download untuk detailnya.`;
        } else if (result.needsManual) {
          status.textContent = `${btn.dataset.host} butuh langkah manual — jendela sudah dibuka dalam aplikasi. Begitu file-nya mulai terdownload di sana, progresnya otomatis muncul di halaman Download.`;
        } else {
          status.textContent = `Gagal: ${result.error}`;
        }
      });
    });
  } catch (err) {
    body.innerHTML = `<div class="state"><h3>Gagal memuat</h3><p>${escapeHtml(err.message)}</p></div>`;
  }
}

async function renderDownloadsView() {
  setActiveNav("downloads");
  stateLoading("Memuat daftar unduhan…");
  try {
    const items = await window.otaku.listDownloads();
    if (items.length === 0) {
      stateEmpty("Belum ada unduhan", "Unduh episode dari halaman detail anime — bisa satu per satu, atau semua sekaligus.");
      return;
    }

    const grouped = {};
    for (const item of items) {
      const key = item.animeEndpoint || item.animeTitle;
      if (!grouped[key]) grouped[key] = { animeTitle: item.animeTitle, animeThumb: item.animeThumb, items: [] };
      grouped[key].items.push(item);
    }

    main.innerHTML = `
      ${sectionTitleHtml("Download", "download")}
      ${Object.values(grouped)
        .map(
          (g) => `
        <div style="margin-bottom:22px">
          <div style="font-weight:800;font-size:13.5px;margin-bottom:10px">${escapeHtml(g.animeTitle)}</div>
          <div class="dl-list">
            ${g.items
              .map(
                (it) => `
              <div class="dl-item" data-id="${escapeHtml(it.id)}">
                <div class="dl-info">
                  <div class="dl-title">${escapeHtml(it.episodeTitle)}</div>
                  <div class="dl-sub" id="dl-status-${escapeHtml(it.id)}">${downloadStatusText(it)}</div>
                  <div class="dl-progress"><span style="width:${Math.round((it.percent || 0) * 100)}%" id="dl-bar-${escapeHtml(it.id)}"></span></div>
                </div>
                <div class="dl-actions">
                  ${it.status === "done" ? `<button class="icon-btn" data-play="${escapeHtml(it.episodeEndpoint)}" title="Putar">${icon("play", 15)}</button>` : ""}
                  <button class="icon-btn" data-delete="${escapeHtml(it.id)}" title="Hapus">✕</button>
                </div>
              </div>`
              )
              .join("")}
          </div>
        </div>`
        )
        .join("")}`;

    main.querySelectorAll("[data-play]").forEach((btn) =>
      btn.addEventListener("click", () => renderWatch(btn.dataset.play, { preferLocal: true }))
    );
    main.querySelectorAll("[data-delete]").forEach((btn) =>
      btn.addEventListener("click", async () => {
        await window.otaku.deleteDownload(btn.dataset.delete);
        renderDownloadsView();
      })
    );
  } catch (err) {
    stateError(err.message, () => renderDownloadsView());
  }
}

function downloadStatusText(item) {
  if (item.status === "done") return `Selesai${item.totalBytes ? ` · ${formatBytes(item.totalBytes)}` : ""}`;
  if (item.status === "error") return `Gagal: ${item.error || "unknown error"}`;
  if (item.status === "downloading") return `Mengunduh… ${Math.round((item.percent || 0) * 100)}%`;
  return "Menunggu…";
}

function formatBytes(bytes) {
  if (!bytes) return "";
  const mb = bytes / (1024 * 1024);
  return mb > 1024 ? `${(mb / 1024).toFixed(2)} GB` : `${mb.toFixed(1)} MB`;
}

// Live-updates the Downloads page (if currently open) as progress events
// stream in from the main process, without needing a full re-render.
window.otaku.onDownloadProgress((payload) => {
  const bar = document.getElementById(`dl-bar-${payload.id}`);
  const status = document.getElementById(`dl-status-${payload.id}`);
  if (bar && payload.percent != null) bar.style.width = `${Math.round(payload.percent * 100)}%`;
  if (status) {
    if (payload.status === "done") status.textContent = "Selesai";
    else if (payload.status === "error") status.textContent = `Gagal: ${payload.error || ""}`;
    else if (payload.percent != null) status.textContent = `Mengunduh… ${Math.round(payload.percent * 100)}%`;
  }
});

async function renderSettingsView() {
  setActiveNav("settings");
  const dir = await window.otaku.getDownloadDir();
  main.innerHTML = `
    ${sectionTitleHtml("Pengaturan", "settings")}
    <div class="settings-row">
      <div>
        <div style="font-weight:700;font-size:13.5px;margin-bottom:4px">Folder Download</div>
        <div style="font-size:12px;color:var(--text-muted);word-break:break-all" id="download-dir-value">${escapeHtml(dir)}</div>
      </div>
      <button class="btn-ghost" id="choose-dir-btn" style="flex-shrink:0">${icon("download", 14)} Ganti Folder</button>
    </div>`;

  document.getElementById("choose-dir-btn")?.addEventListener("click", async () => {
    const newDir = await window.otaku.chooseDownloadDir();
    if (newDir) document.getElementById("download-dir-value").textContent = newDir;
  });
}

function renderPlaceholderView(view, title, message) {
  setActiveNav(view);
  stateEmpty(title, message);
}

// ---------------- Detail (with tabs) ----------------

async function renderDetail(endpoint) {
  sideLinks.forEach((btn) => btn.classList.remove("active"));
  stateLoading("Mengambil detail anime…");
  try {
    const d = await window.otaku.detail(endpoint);
    const genresHtml = d.genres.map((g) => `<span class="pill">${escapeHtml(g)}</span>`).join("");
    const bookmarked = isBookmarked(endpoint);
    const inWatchlist = isInWatchlist(endpoint);

    const episodeTabHtml = d.episodes.length
      ? `<div class="episode-list">
           ${d.episodes
             .map(
               (ep, i) => `
             <div class="episode-row" data-endpoint="${escapeHtml(ep.endpoint)}">
               <span class="ep-num">${d.episodes.length - i}</span>
               <span class="ep-row-title">${escapeHtml(ep.title)}</span>
               <span class="ep-row-date">${escapeHtml(ep.date)}</span>
               <button class="icon-btn ep-row-dl" data-dl-endpoint="${escapeHtml(ep.endpoint)}" data-dl-title="${escapeHtml(ep.title)}" title="Download episode ini">${icon("download", 14)}</button>
               <span class="ep-row-play">${icon("play", 14)}</span>
             </div>`
             )
             .join("")}
         </div>`
      : `<p style="color:var(--text-muted)">Tidak ada episode ditemukan.</p>`;

    const infoTabHtml = `
      <div class="info-grid">
        ${d.studio ? `<div><label>Studio</label><span>${escapeHtml(d.studio)}</span></div>` : ""}
        ${d.totalEpisode ? `<div><label>Total Episode</label><span>${escapeHtml(d.totalEpisode)}</span></div>` : ""}
        ${d.status ? `<div><label>Status</label><span>${escapeHtml(d.status)}</span></div>` : ""}
        ${d.score ? `<div><label>Skor</label><span>${escapeHtml(d.score)}</span></div>` : ""}
        ${d.genres.length ? `<div><label>Genre</label><span>${escapeHtml(d.genres.join(", "))}</span></div>` : ""}
      </div>
      <p class="synopsis" style="margin-top:16px">${escapeHtml(d.synopsis)}</p>`;

    main.innerHTML = `
      <div class="detail-hero">
        <div class="detail-poster"><img src="${escapeHtml(d.thumb)}" /></div>
        <div>
          <h1 class="detail-title">${escapeHtml(d.title)}</h1>
          <div class="pill-row">
            ${d.status ? `<span class="pill accent">${escapeHtml(d.status)}</span>` : ""}
            ${d.score ? `<span class="pill">★ ${escapeHtml(d.score)}</span>` : ""}
            ${genresHtml}
          </div>
          <p class="synopsis">${escapeHtml(d.synopsis.slice(0, 220))}${d.synopsis.length > 220 ? "…" : ""}</p>
          <div class="detail-actions">
            ${d.episodes.length ? `<button class="btn-primary" id="watch-latest">${icon("play", 15)} Tonton Sekarang</button>` : ""}
            <button class="btn-ghost" id="toggle-watchlist">${inWatchlist ? icon("check", 15) + " Di Koleksi Saya" : icon("plus", 15) + " Koleksi Saya"}</button>
            <button class="icon-btn" id="toggle-bookmark" title="Bookmark">${icon(bookmarked ? "star" : "bookmarkStack", 16)}</button>
            <button class="icon-btn" id="share-btn" title="Bagikan (belum tersedia)">${icon("share", 16)}</button>
            ${d.episodes.length ? `<button class="btn-ghost" id="download-all-btn">${icon("download", 15)} Download Semua Episode</button>` : ""}
          </div>
        </div>
      </div>

      <div class="tab-row">
        <button class="tab-btn active" data-tab="info">${icon("info", 14)} Informasi</button>
        <button class="tab-btn" data-tab="episode">${icon("film", 14)} Episode</button>
        <button class="tab-btn" data-tab="characters">${icon("user", 14)} Karakter</button>
        <button class="tab-btn" disabled title="Situs sumber tidak menyediakan data ini">${icon("star", 14)} Rekomendasi</button>
        <button class="tab-btn" disabled title="Situs sumber tidak menyediakan data ini">${icon("message", 14)} Komentar</button>
      </div>

      <div id="tab-info">${infoTabHtml}</div>
      <div id="tab-episode" style="display:none">${episodeTabHtml}</div>
      <div id="tab-characters" style="display:none"></div>
    `;

    let charactersLoaded = false;
    async function loadCharactersTab() {
      if (charactersLoaded) return;
      charactersLoaded = true;
      const box = document.getElementById("tab-characters");
      box.innerHTML = `<div class="state"><div class="spinner"></div><p>Mencari data karakter di MyAnimeList…</p></div>`;
      try {
        const { matchedTitle, characters } = await window.otaku.characters(d.title);
        if (characters.length === 0) {
          box.innerHTML = `<div class="state"><h3>Tidak ditemukan</h3><p>Tidak ada data karakter yang cocok di MyAnimeList untuk judul ini.</p></div>`;
          return;
        }
        box.innerHTML = `
          <p style="color:var(--text-faint);font-size:11.5px;margin-bottom:14px">
            Data dari MyAnimeList (lewat Jikan API) — dicocokkan otomatis dari judul "${escapeHtml(matchedTitle)}".
            Kalau judulnya kurang tepat, data karakter di bawah mungkin juga meleset.
          </p>
          <div class="grid">
            ${characters
              .map(
                (c) => `
              <div class="card" style="cursor:default">
                <div class="card-thumb"><img src="${escapeHtml(c.image)}" loading="lazy" /></div>
                <div class="card-body">
                  <div class="card-title">${escapeHtml(c.name)}</div>
                  <div class="card-meta">${escapeHtml(c.role)}${c.voiceActor ? " · " + escapeHtml(c.voiceActor) : ""}</div>
                </div>
              </div>`
              )
              .join("")}
          </div>`;
      } catch (err) {
        box.innerHTML = `<div class="state"><h3>Gagal memuat karakter</h3><p>${escapeHtml(err.message)}</p></div>`;
        charactersLoaded = false;
      }
    }

    main.querySelectorAll(".tab-btn:not([disabled])").forEach((btn) => {
      btn.addEventListener("click", () => {
        main.querySelectorAll(".tab-btn").forEach((b) => b.classList.remove("active"));
        btn.classList.add("active");
        document.getElementById("tab-info").style.display = btn.dataset.tab === "info" ? "" : "none";
        document.getElementById("tab-episode").style.display = btn.dataset.tab === "episode" ? "" : "none";
        document.getElementById("tab-characters").style.display = btn.dataset.tab === "characters" ? "" : "none";
        if (btn.dataset.tab === "characters") loadCharactersTab();
      });
    });

    main.querySelectorAll(".episode-row[data-endpoint]").forEach((el) => {
      el.addEventListener("click", () =>
        renderWatch(el.dataset.endpoint, { animeEndpoint: endpoint, animeTitle: d.title, animeThumb: d.thumb })
      );
    });

    main.querySelectorAll("[data-dl-endpoint]").forEach((btn) => {
      btn.addEventListener("click", async (e) => {
        e.stopPropagation();
        await openDownloadPicker({
          animeEndpoint: endpoint,
          animeTitle: d.title,
          animeThumb: d.thumb,
          episodeEndpoint: btn.dataset.dlEndpoint,
          episodeTitle: btn.dataset.dlTitle,
        });
      });
    });

    document.getElementById("download-all-btn")?.addEventListener("click", (e) => {
      e.currentTarget.disabled = true;
      e.currentTarget.innerHTML = `${icon("download", 15)} Mengunduh… (lihat halaman Download)`;
      window.otaku.downloadAllEpisodes({
        animeEndpoint: endpoint,
        animeTitle: d.title,
        animeThumb: d.thumb,
        episodes: d.episodes,
      });
      renderDownloadsView();
    });

    document.getElementById("watch-latest")?.addEventListener("click", () => {
      const latest = d.episodes[d.episodes.length - 1];
      if (latest) renderWatch(latest.endpoint, { animeEndpoint: endpoint, animeTitle: d.title, animeThumb: d.thumb });
    });

    document.getElementById("toggle-bookmark")?.addEventListener("click", (e) => {
      const added = toggleBookmark({ endpoint, title: d.title, thumb: d.thumb, status: d.status });
      e.currentTarget.innerHTML = icon(added ? "star" : "bookmarkStack", 16);
    });
    document.getElementById("toggle-watchlist")?.addEventListener("click", (e) => {
      const added = toggleWatchlist({ endpoint, title: d.title, thumb: d.thumb, status: d.status });
      e.currentTarget.innerHTML = added ? icon("check", 15) + " Di Koleksi Saya" : icon("plus", 15) + " Koleksi Saya";
    });
  } catch (err) {
    stateError(err.message, () => renderDetail(endpoint));
  }
}

// ---------------- Watch ----------------

async function renderWatch(endpoint, context = {}) {
  stateLoading("Menyiapkan pemutar…");

  // Only play the locally-downloaded file when explicitly asked to (i.e.
  // opened from the Download page) — picking an episode normally should
  // always go to the online player, even if that episode happens to have
  // a downloaded copy sitting around.
  const localFile = context.preferLocal ? await window.otaku.getLocalFile(endpoint) : null;
  if (localFile) {
    main.innerHTML = `
      <div class="watch-topbar">
        <button class="back-btn" id="back-btn">${icon("chevronLeft", 16)}</button>
        <h2>${context.animeTitle ? escapeHtml(context.animeTitle) + " — " : ""}${escapeHtml(localFile.episodeTitle)}</h2>
      </div>
      <div class="player-wrap">
        <video controls autoplay id="local-video" src="file://${localFile.filePath.replace(/\\/g, "/")}">
          Browser ini tidak mendukung pemutaran video.
        </video>
      </div>
      <div class="player-toolbar">
        <button class="icon-btn" id="pip-btn-local" title="Picture-in-Picture">${icon("pip", 16)}</button>
      </div>
      <p style="color:var(--text-faint);font-size:11.5px;margin-top:10px">${icon("download", 12)} Diputar dari file yang sudah diunduh — tidak butuh koneksi internet.</p>
    `;
    document.getElementById("back-btn")?.addEventListener("click", () => window.history.back());
    document.getElementById("pip-btn-local")?.addEventListener("click", async () => {
      const video = document.getElementById("local-video");
      try {
        if (document.pictureInPictureElement) {
          await document.exitPictureInPicture();
        } else {
          await video.requestPictureInPicture();
        }
      } catch (err) {
        alert(`Tidak bisa membuka Picture-in-Picture: ${err.message}`);
      }
    });
    window.otaku.setDiscordActivity({
      animeTitle: context.animeTitle || localFile.animeTitle,
      episodeTitle: localFile.episodeTitle,
      startedAt: Date.now(),
    });
    return;
  }

  try {
    const ep = await window.otaku.episode(endpoint);

    if (ep.type === "batch") {
      main.innerHTML = `
        <div class="watch-topbar"><button class="back-btn" id="back-btn">${icon("chevronLeft", 16)}</button><h2>${escapeHtml(ep.title)}</h2></div>
        <div class="state">
          <h3>Ini link batch/lengkap</h3>
          <p>"${escapeHtml(ep.title)}" adalah halaman download semua episode sekaligus, bukan halaman streaming per-episode. Kembali dan pilih episode individual lain.</p>
        </div>`;
      document.getElementById("back-btn")?.addEventListener("click", () => {
        window.otaku.clearDiscordActivity();
        window.history.back();
      });
      return;
    }

    pushHistory({
      animeEndpoint: context.animeEndpoint || "",
      animeTitle: context.animeTitle || ep.title,
      animeThumb: context.animeThumb || "",
      episodeEndpoint: endpoint,
      episodeTitle: ep.title,
    });

    const watchStartedAt = Date.now();
    window.otaku.setDiscordActivity({
      animeTitle: context.animeTitle || ep.title,
      episodeTitle: ep.title,
      startedAt: watchStartedAt,
    });

    let activeUrl = ep.streamLink;
    let autoNext = getAutoNextPref();
    const nextEp = findNextEpisode(ep.title, ep.otherEpisodes);

    function serverOptionsHtml() {
      const opts = [];
      if (ep.streamLink) opts.push(`<option value="default">Player Default</option>`);
      ep.mirrors.forEach((m, i) => opts.push(`<option value="mirror:${i}">${escapeHtml(m.driver)} (${m.quality})</option>`));
      return opts.join("");
    }

    function resolutionOptionsHtml() {
      const qualities = [...new Set(ep.mirrors.map((m) => m.quality))];
      if (qualities.length === 0) return `<option>Otomatis</option>`;
      return qualities.map((q) => `<option value="${escapeHtml(q)}">${escapeHtml(q)}</option>`).join("");
    }

    function draw() {
      main.innerHTML = `
        <div class="watch-topbar">
          <button class="back-btn" id="back-btn">${icon("chevronLeft", 16)}</button>
          <h2>${context.animeTitle ? escapeHtml(context.animeTitle) + " — " : ""}${escapeHtml(ep.title)}</h2>
        </div>

        <div class="player-wrap" id="player-wrap">
          ${
            activeUrl
              ? `<webview src="${escapeHtml(activeUrl)}" preload="${escapeHtml(window.otaku.webviewPreloadUrl)}" allowpopups></webview>`
              : `<div class="state"><h3>Tidak ada link streaming</h3></div>`
          }
        </div>

        <div class="player-toolbar">
          <label class="autonext-toggle" title="${nextEp ? "" : "Episode berikutnya tidak terdeteksi untuk anime ini"}">
            <input type="checkbox" id="autonext-check" ${autoNext ? "checked" : ""} ${nextEp ? "" : "disabled"} />
            Auto Lanjut Episode
          </label>
          <div style="display:flex;gap:8px">
            <button class="icon-btn" id="pip-btn" title="Picture-in-Picture">${icon("pip", 16)}</button>
            <button class="icon-btn" id="fullscreen-btn" title="Layar penuh">${icon("maximize", 16)}</button>
          </div>
        </div>

        <div class="control-panel">
          <div class="control-field">
            <label>Server</label>
            <select id="server-select">${serverOptionsHtml()}</select>
          </div>
          <div class="control-field">
            <label>Subtitle</label>
            <select disabled><option>Indonesia</option></select>
          </div>
          <div class="control-field">
            <label>Resolusi</label>
            <select id="quality-select">${resolutionOptionsHtml()}</select>
          </div>
        </div>

        ${
          ep.otherEpisodes.length
            ? `<div class="other-eps-row">
                 ${sectionTitleHtml("Episode Lain", "film")}
                 <div class="row-scroll">
                   ${ep.otherEpisodes
                     .map((oe) => `<button class="btn-ghost" data-nav="${escapeHtml(oe.endpoint)}" style="flex-shrink:0">${escapeHtml(oe.title)}</button>`)
                     .join("")}
                 </div>
               </div>`
            : ""
        }

        <div class="feature-grid">
          <div class="feature-card">
            <div class="fic">${icon("cast", 16)}</div>
            <div><div class="ft">Pilih Server</div><div class="fd">Ganti server lewat dropdown di atas kalau video tidak bisa diputar.</div></div>
          </div>
          <div class="feature-card">
            <div class="fic">${icon("maximize", 16)}</div>
            <div><div class="ft">Layar Penuh</div><div class="fd">Player bisa di-maximize lewat tombol layar penuh di atas.</div></div>
          </div>
        </div>
      `;

      document.getElementById("back-btn")?.addEventListener("click", () => {
        window.otaku.clearDiscordActivity();
        window.history.back();
      });

      document.getElementById("autonext-check")?.addEventListener("change", (e) => {
        autoNext = e.target.checked;
        setAutoNextPref(autoNext);
      });

      document.getElementById("server-select")?.addEventListener("change", async (e) => {
        const value = e.target.value;
        if (value === "default") {
          activeUrl = ep.streamLink;
          draw();
          return;
        }
        const idx = Number(value.split(":")[1]);
        const mirror = ep.mirrors[idx];
        e.target.disabled = true;
        try {
          activeUrl = await window.otaku.resolveMirror(mirror.content);
        } catch (err) {
          alert(`Gagal resolve server: ${err.message}`);
        }
        draw();
      });

      document.getElementById("fullscreen-btn")?.addEventListener("click", () => {
        document.querySelector(".player-wrap")?.requestFullscreen?.();
      });

      document.getElementById("pip-btn")?.addEventListener("click", async () => {
        const webviewEl = document.querySelector(".player-wrap webview");
        if (!webviewEl) return;
        try {
          const result = await webviewEl.executeJavaScript(`
            (function() {
              try {
                const video = document.querySelector("video");
                if (!video) return "no-video";
                if (document.pictureInPictureElement) {
                  document.exitPictureInPicture();
                  return "exited";
                }
                if (video.disablePictureInPicture || !document.pictureInPictureEnabled) return "disabled";
                video.requestPictureInPicture();
                return "requested";
              } catch (e) {
                return "error:" + e.message;
              }
            })();
          `);
          if (result === "no-video") {
            alert(
              "Tidak ditemukan tag video langsung di halaman player ini — kemungkinan videonya ada di dalam iframe bersarang lagi, sehingga Picture-in-Picture tidak bisa dipicu dari sini. Coba server/mirror lain."
            );
          } else if (result === "disabled" || String(result).startsWith("error:")) {
            alert("Picture-in-Picture tidak bisa diaktifkan untuk server ini.");
          }
        } catch (err) {
          alert(`Gagal mengaktifkan Picture-in-Picture: ${err.message}`);
        }
      });

      main.querySelectorAll("[data-nav]").forEach((btn) =>
        btn.addEventListener("click", () => renderWatch(btn.dataset.nav, context))
      );

      // Listen for the "video ended" signal forwarded from inside the
      // <webview> guest page (see webview-preload.js). Only fires if that
      // page exposes a plain <video> tag directly — some mirrors nest the
      // real player in a further iframe, which this can't see into.
      const webviewEl = document.querySelector(".player-wrap webview");
      webviewEl?.addEventListener("ipc-message", (e) => {
        if (e.channel !== "yozora:ended") return;
        if (!autoNext || !nextEp) return;
        showAutoNextOverlay(nextEp);
      });
    }

    function showAutoNextOverlay(target) {
      const wrap = document.getElementById("player-wrap");
      if (!wrap || wrap.querySelector(".autonext-overlay")) return;
      let seconds = 5;
      const overlay = document.createElement("div");
      overlay.className = "autonext-overlay";
      overlay.innerHTML = `
        <div class="autonext-box">
          <div>Melanjutkan ke <strong>${escapeHtml(target.title)}</strong> dalam <span id="autonext-count">${seconds}</span> detik…</div>
          <button class="btn-ghost" id="autonext-cancel">Batal</button>
        </div>`;
      wrap.appendChild(overlay);

      const timer = setInterval(() => {
        seconds -= 1;
        const el = document.getElementById("autonext-count");
        if (el) el.textContent = String(seconds);
        if (seconds <= 0) {
          clearInterval(timer);
          renderWatch(target.endpoint, context);
        }
      }, 1000);

      document.getElementById("autonext-cancel")?.addEventListener("click", () => {
        clearInterval(timer);
        overlay.remove();
      });
    }

    draw();
  } catch (err) {
    stateError(err.message, () => renderWatch(endpoint, context));
  }
}

// ---------------- Wiring ----------------

sideLinks.forEach((btn) => {
  btn.addEventListener("click", () => {
    const view = btn.dataset.view;
    if (view === "home") renderHome();
    else if (view === "explore") renderExplore("ongoing", 1);
    else if (view === "schedule") renderSchedule();
    else if (view === "watchlist") renderWatchlistView();
    else if (view === "bookmarks") renderBookmarksView();
    else if (view === "history") renderHistoryView();
    else if (view === "downloads") renderDownloadsView();
    else if (view === "settings") renderSettingsView();
  });
});

searchForm.addEventListener("submit", (e) => {
  e.preventDefault();
  const q = searchInput.value.trim();
  if (q) renderSearch(q);
});

document.addEventListener("keydown", (e) => {
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
    e.preventDefault();
    searchInput.focus();
  }
});

wireNotifBell();
renderHome();

// Check once shortly after startup (silent — no OS popup on first run per
// anime, since we don't have a "last known episode" yet to compare against),
// then keep checking periodically while the app stays open.
setTimeout(() => checkForUpdates({ silent: true }), 5000);
setInterval(() => checkForUpdates(), 20 * 60 * 1000);
