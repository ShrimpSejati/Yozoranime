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
  const all = readStore(STORE_KEYS.history);
  const prev = all.find((h) => h.episodeEndpoint === entry.episodeEndpoint);
  const list = all.filter((h) => h.episodeEndpoint !== entry.episodeEndpoint);
  list.unshift({ ...entry, progress: prev?.progress || 0, watchedAt: Date.now() });
  writeStore(STORE_KEYS.history, list.slice(0, 30));
}

// Real playback progress (0..1), reported by the player when it can see it.
function updateHistoryProgress(episodeEndpoint, progress) {
  const list = readStore(STORE_KEYS.history);
  const item = list.find((h) => h.episodeEndpoint === episodeEndpoint);
  if (!item) return;
  item.progress = Math.min(1, Math.max(0, progress));
  writeStore(STORE_KEYS.history, list);
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
  const text = String(title || "");
  // Prefer the number right after "Episode"/"Eps"/"Ep" so titles like
  // "Ao Ashi Season 2 Episode 5" give 5, not the season number 2.
  const keyed = text.match(/(?:episode|eps|ep)(?![a-z])\.?\s*(\d+(?:\.\d+)?)/i);
  if (keyed) return parseFloat(keyed[1]);
  // Fallback: the last number in the title (season numbers come first).
  const all = text.match(/\d+(?:\.\d+)?/g);
  return all ? parseFloat(all[all.length - 1]) : null;
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


// ---------------- Simple back-navigation ----------------
// Each view registers itself with setView(); detail/watch views push the
// view they came from onto a stack so the back arrow really goes back
// (root views, i.e. the sidebar pages, reset the stack).

let currentView = null;
const backStack = [];
let suppressPush = false;

function setView(key, fn, { root = false, replace = false } = {}) {
  if (currentView?.key.startsWith("watch:") && !key.startsWith("watch:")) {
    window.otaku.clearDiscordActivity();
  }
  if (root) backStack.length = 0;
  else if (!suppressPush && !replace && currentView && currentView.key !== key) backStack.push(currentView);
  currentView = { key, fn };
}

function goBack() {
  const prev = backStack.pop();
  if (!prev) return renderHome();
  suppressPush = true;
  try {
    prev.fn();
  } finally {
    suppressPush = false;
  }
}

function toFileUrl(p) {
  const parts = String(p).replace(/\\/g, "/").split("/");
  return "file:///" + parts.map((seg, i) => (i === 0 && /^[A-Za-z]:$/.test(seg) ? seg : encodeURIComponent(seg))).join("/");
}

function epLabel(title) {
  const n = extractEpNum(title);
  return n !== null ? `Episode ${n}` : String(title || "");
}

function stripSubtitleSuffix(title) {
  return String(title || "").replace(/\s*subtitle indonesia\s*$/i, "");
}

function continueCardHtml(h) {
  const pct = Math.round((h.progress || 0) * 100);
  return `
    <div class="cw-card" data-ep="${escapeHtml(h.episodeEndpoint)}" data-anime="${escapeHtml(h.animeEndpoint || "")}" data-title="${escapeHtml(h.animeTitle)}" data-thumb="${escapeHtml(h.animeThumb || "")}">
      <div class="cw-thumb"><img src="${escapeHtml(h.animeThumb || "")}" loading="lazy" /><div class="play-overlay">${icon("play", 26)}</div></div>
      <div class="cw-body">
        <div class="cw-title">${escapeHtml(h.animeTitle)}</div>
        <div class="cw-meta"><span>${escapeHtml(epLabel(h.episodeTitle))}</span>${pct > 0 ? `<span>${pct}%</span>` : `<span>${relativeTime(h.watchedAt)}</span>`}</div>
        ${pct > 0 ? `<div class="cw-bar"><span style="width:${pct}%"></span></div>` : ""}
      </div>
    </div>`;
}

function bindContinueCards(root) {
  root.querySelectorAll(".cw-card[data-ep]").forEach((el) =>
    el.addEventListener("click", () =>
      renderWatch(el.dataset.ep, { animeEndpoint: el.dataset.anime, animeTitle: el.dataset.title, animeThumb: el.dataset.thumb })
    )
  );
}

async function watchLatestEpisode(endpoint) {
  try {
    const d = await window.otaku.detail(endpoint);
    if (!d.episodes.length) return renderDetail(endpoint);
    let latest = d.episodes[0];
    for (const ep of d.episodes) {
      if ((extractEpNum(ep.title) ?? -1) > (extractEpNum(latest.title) ?? -1)) latest = ep;
    }
    renderWatch(latest.endpoint, { animeEndpoint: endpoint, animeTitle: d.title, animeThumb: d.thumb });
  } catch {
    renderDetail(endpoint);
  }
}

function uniqueByEndpoint(list) {
  const seen = new Set();
  return list.filter((a) => (seen.has(a.endpoint) ? false : seen.add(a.endpoint)));
}

// ---------------- Views: browse ----------------

const heroSynopsisCache = {};
let heroTimer = null;

async function renderHome() {
  setView("home", () => renderHome(), { root: true });
  setActiveNav("home");
  stateLoading("Mengambil daftar ongoing…");
  try {
    const ongoing = await window.otaku.ongoing(1);
    if (ongoing.length === 0) return stateEmpty("Tidak ada data", "Belum ada anime ongoing saat ini.");

    const slides = ongoing.slice(0, 5);
    const history = readStore(STORE_KEYS.history);
    let completedCache = null;
    let heroIndex = 0;

    main.innerHTML = `
      <div id="hero-slot"></div>
      ${
        history.length
          ? `<div class="section-head"><h2>Lanjutkan Menonton</h2><button class="see-all" id="cw-all">Lihat Semua ${icon("chevronRight", 13)}</button></div>
             <div class="row-scroll" id="cw-row">${history.slice(0, 8).map(continueCardHtml).join("")}</div>`
          : ""
      }
      <div class="section-head">
        <h2>Anime Terbaru</h2>
        <div class="chip-row" id="latest-chips">
          <button class="chip active" data-tab="ongoing">Ongoing</button>
          <button class="chip" data-tab="completed">Completed</button>
          <button class="chip" data-tab="all">Semua</button>
        </div>
        <button class="see-all" id="latest-all">Lihat Semua ${icon("chevronRight", 13)}</button>
      </div>
      <div class="grid" id="latest-grid"></div>`;

    // ----- hero carousel -----
    function drawHero(i, dir = "none") {
      heroIndex = i;
      const s = slides[i];
      const slot = document.getElementById("hero-slot");
      if (!slot) return;
      slot.innerHTML = `
        <div class="hero ${dir === "next" ? "anim-next" : dir === "prev" ? "anim-prev" : ""}">
          <div class="hero-bg" style="background-image:url('${escapeHtml(s.thumb || "")}')"></div>
          <div class="hero-body">
            <div class="hero-badge">${icon("flame", 13)} Sedang Tayang</div>
            <h1 class="hero-title">${escapeHtml(s.title)}</h1>
            <p class="hero-sub" id="hero-sub">${escapeHtml(heroSynopsisCache[s.endpoint] || [s.episodeInfo, s.updatedOn].filter(Boolean).join(" · "))}</p>
            <div class="hero-actions">
              <button class="btn-primary" id="hero-watch">${icon("play", 14)} Tonton Sekarang</button>
              <button class="btn-ghost" id="hero-detail">${icon("info", 14)} Detail</button>
            </div>
          </div>
          <div class="hero-poster"><img draggable="false" src="${escapeHtml(s.thumb || "")}" /></div>
          <button class="hero-nav prev" id="hero-prev" title="Sebelumnya">${icon("chevronLeft", 18)}</button>
          <button class="hero-nav next" id="hero-next" title="Berikutnya">${icon("chevronRight", 18)}</button>
          <div class="hero-dots">${slides.map((_, k) => `<span class="dot ${k === i ? "active" : ""}" data-i="${k}"></span>`).join("")}</div>
        </div>`;
      document.getElementById("hero-watch")?.addEventListener("click", () => watchLatestEpisode(s.endpoint));
      document.getElementById("hero-detail")?.addEventListener("click", () => renderDetail(s.endpoint));
      document.getElementById("hero-prev")?.addEventListener("click", () => stepHero(-1));
      document.getElementById("hero-next")?.addEventListener("click", () => stepHero(1));
      slot.querySelectorAll(".dot").forEach((dot) =>
        dot.addEventListener("click", () => {
          const k = Number(dot.dataset.i);
          if (k === i) return;
          drawHero(k, k > i ? "next" : "prev");
          restartHeroTimer();
        })
      );
      loadHeroSynopsis(s, i);
    }

    function stepHero(delta) {
      const n = slides.length;
      drawHero((heroIndex + delta + n) % n, delta > 0 ? "next" : "prev");
      restartHeroTimer();
    }

    function restartHeroTimer() {
      clearInterval(heroTimer);
      heroTimer = setInterval(() => {
        if (!document.getElementById("hero-slot")) return clearInterval(heroTimer);
        drawHero((heroIndex + 1) % slides.length, "next");
      }, 8000);
    }

    // The ongoing list has no synopsis, so fetch it lazily for the slide on screen.
    async function loadHeroSynopsis(s, i) {
      if (heroSynopsisCache[s.endpoint] === undefined) {
        try {
          heroSynopsisCache[s.endpoint] = (await window.otaku.detail(s.endpoint)).synopsis || "";
        } catch {
          heroSynopsisCache[s.endpoint] = "";
        }
      }
      const el = document.getElementById("hero-sub");
      if (el && heroIndex === i && heroSynopsisCache[s.endpoint]) el.textContent = heroSynopsisCache[s.endpoint];
    }

    drawHero(0);
    restartHeroTimer();

    // Swipe / drag left-right (mouse, touch, pen) and horizontal trackpad
    // scroll move to the next or previous recommendation.
    const heroSlot = document.getElementById("hero-slot");
    let swipeStart = null;
    heroSlot.addEventListener("pointerdown", (e) => {
      if (e.target.closest("button")) return;
      swipeStart = { x: e.clientX, y: e.clientY };
      heroSlot.setPointerCapture?.(e.pointerId);
    });
    heroSlot.addEventListener("pointerup", (e) => {
      if (!swipeStart) return;
      const dx = e.clientX - swipeStart.x;
      const dy = e.clientY - swipeStart.y;
      swipeStart = null;
      if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy) * 1.2) stepHero(dx < 0 ? 1 : -1);
    });
    heroSlot.addEventListener("pointercancel", () => (swipeStart = null));
    let wheelLock = false;
    heroSlot.addEventListener(
      "wheel",
      (e) => {
        if (Math.abs(e.deltaX) <= Math.abs(e.deltaY) || Math.abs(e.deltaX) < 30) return;
        e.preventDefault();
        if (wheelLock) return;
        wheelLock = true;
        stepHero(e.deltaX > 0 ? 1 : -1);
        setTimeout(() => (wheelLock = false), 650);
      },
      { passive: false }
    );

    // ----- continue watching -----
    bindContinueCards(main);
    document.getElementById("cw-all")?.addEventListener("click", () => renderHistoryView());

    // ----- latest anime chips -----
    async function drawLatest(tab) {
      const grid = document.getElementById("latest-grid");
      if (!grid) return;
      grid.innerHTML = `<div class="state" style="grid-column:1/-1;padding:30px"><div class="spinner"></div></div>`;
      let list = ongoing;
      try {
        if (tab !== "ongoing") {
          completedCache = completedCache || (await window.otaku.completed(1));
          if (tab === "completed") list = completedCache;
          else list = ongoing.slice(0, 9).concat(completedCache.slice(0, 9));
        }
      } catch (err) {
        grid.innerHTML = `<div class="state" style="grid-column:1/-1"><p>${escapeHtml(err.message)}</p></div>`;
        return;
      }
      grid.innerHTML = list.slice(0, 18).map(animeCardHtml).join("");
      bindCardClicks(grid);
    }
    drawLatest("ongoing");

    let latestTab = "ongoing";
    main.querySelectorAll("#latest-chips .chip").forEach((chip) =>
      chip.addEventListener("click", () => {
        main.querySelectorAll("#latest-chips .chip").forEach((c) => c.classList.remove("active"));
        chip.classList.add("active");
        latestTab = chip.dataset.tab;
        drawLatest(latestTab);
      })
    );
    document.getElementById("latest-all")?.addEventListener("click", () => renderExplore(latestTab === "completed" ? "completed" : "ongoing", 1));
  } catch (err) {
    stateError(err.message, () => renderHome());
  }
}

async function renderExplore(tab = "ongoing", page = 1) {
  setView("explore", () => renderExplore(tab, page));
  setActiveNav("");
  stateLoading("Mengambil daftar anime…");
  try {
    const list = tab === "completed" ? await window.otaku.completed(page) : await window.otaku.ongoing(page);
    main.innerHTML = `
      <div class="section-head"><h2>Semua Anime</h2>
        <div class="chip-row">
          <button class="chip ${tab === "ongoing" ? "active" : ""}" data-explore-tab="ongoing">Ongoing</button>
          <button class="chip ${tab === "completed" ? "active" : ""}" data-explore-tab="completed">Completed</button>
        </div>
      </div>
      ${
        list.length === 0
          ? `<div class="state"><h3>Tidak ada data</h3></div>`
          : `<div class="grid">${list.map(animeCardHtml).join("")}</div>
             <div class="pagination">
               <button class="page-btn" id="prev-btn" ${page <= 1 ? "disabled" : ""}>← Sebelumnya</button>
               <span>Halaman ${page}</span>
               <button class="page-btn" id="next-btn">Selanjutnya →</button>
             </div>`
      }`;
    bindCardClicks();
    document.getElementById("prev-btn")?.addEventListener("click", () => renderExplore(tab, page - 1));
    document.getElementById("next-btn")?.addEventListener("click", () => renderExplore(tab, page + 1));
    main.querySelectorAll("[data-explore-tab]").forEach((btn) => btn.addEventListener("click", () => renderExplore(btn.dataset.exploreTab, 1)));
  } catch (err) {
    stateError(err.message, () => renderExplore(tab, page));
  }
}

async function renderGenres() {
  setView("genres", () => renderGenres(), { root: true });
  setActiveNav("genres");
  stateLoading("Mengambil daftar genre…");
  try {
    const genres = await window.otaku.genres();
    if (genres.length === 0) return stateEmpty("Daftar genre tidak tersedia");
    main.innerHTML = `
      <div class="section-head"><h2>Genre</h2></div>
      <div class="pill-row">
        ${genres.map((g) => `<span class="pill accent" data-genre="${escapeHtml(g.endpoint)}">${escapeHtml(g.name)}</span>`).join("")}
      </div>`;
    main.querySelectorAll("[data-genre]").forEach((el) => el.addEventListener("click", () => renderGenrePage(el.dataset.genre, 1)));
  } catch (err) {
    stateError(err.message, () => renderGenres());
  }
}

function renderSearchHome() {
  setView("search-home", () => renderSearchHome(), { root: true });
  setActiveNav("search");
  main.innerHTML = `<div class="state"><h3>Cari anime</h3><p>Ketik judul di kolom pencarian di atas, lalu tekan Enter.</p></div>`;
  searchInput.focus();
}

async function renderGenrePage(genre, page = 1) {
  setView("genre", () => renderGenrePage(genre, page));
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
  setView("search-results", () => renderSearch(query));
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

function renderBookmarksView() {
  setView("bookmarks", () => renderBookmarksView(), { root: true });
  setActiveNav("bookmarks");
  const list = uniqueByEndpoint([...readStore(STORE_KEYS.bookmarks), ...readStore(STORE_KEYS.watchlist)]);
  if (list.length === 0) return stateEmpty("Bookmark kosong", "Tandai anime dari halaman detail dengan tombol Bookmark.");
  main.innerHTML = `
    <div class="section-head"><h2>Bookmark</h2></div>
    <div class="grid">${list.map((item) => animeCardHtml({ ...item })).join("")}</div>`;
  bindCardClicks();
}

function renderHistoryView() {
  setView("history", () => renderHistoryView(), { root: true });
  setActiveNav("history");
  const list = readStore(STORE_KEYS.history);
  if (list.length === 0) return stateEmpty("Riwayat kosong", "Episode yang kamu tonton akan muncul di sini.");
  main.innerHTML = `
    <div class="section-head"><h2>Riwayat Tontonan</h2></div>
    <div class="row-scroll" style="flex-wrap:wrap">${list.map(continueCardHtml).join("")}</div>`;
  bindContinueCards(main);
}

async function renderSchedule() {
  setView("schedule", () => renderSchedule(), { root: true });
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

// ---------------- Download manager & settings ----------------

function formatBytes(bytes) {
  if (!bytes) return "0 MB";
  const mb = bytes / (1024 * 1024);
  return mb >= 1024 ? `${(mb / 1024).toFixed(2)} GB` : `${mb.toFixed(mb >= 100 ? 0 : 1)} MB`;
}

const speedSamples = {};

function dmSizeText(it) {
  if (it.status === "done") return formatBytes(it.totalBytes || it.downloadedBytes);
  if (it.totalBytes) return `${formatBytes(it.downloadedBytes)} / ${formatBytes(it.totalBytes)}`;
  return it.downloadedBytes ? formatBytes(it.downloadedBytes) : "";
}

function dmActiveItemHtml(it) {
  const pct = Math.round((it.percent || 0) * 100);
  const failed = it.status === "error";
  const waiting = it.status === "manual";
  const status = failed ? "Gagal" : waiting ? "Menunggu file…" : "Mengunduh";
  const id = escapeHtml(it.id);
  return `
    <div class="dm-item" data-id="${id}">
      <div class="thumb"><img src="${escapeHtml(it.animeThumb || "")}" /></div>
      <div class="mid">
        <div class="t1">${escapeHtml(it.animeTitle)} - ${escapeHtml(epLabel(it.episodeTitle))}</div>
        <div class="t2">${escapeHtml(it.quality || "")} • Subtitle Indonesia${it.host ? ` • ${escapeHtml(it.host)}` : ""}</div>
        ${
          failed
            ? `<div class="dm-err">${escapeHtml(it.error || "Download gagal")}</div>`
            : waiting
            ? `<div class="t2" style="margin-top:6px">Selesaikan langkah di jendela download — progres muncul otomatis begitu file mulai terunduh.</div>`
            : `<div class="dm-bar"><div class="track"><span id="dl-bar-${id}" style="width:${pct}%"></span></div><span class="pct" id="dl-pct-${id}">${pct}%</span></div>`
        }
      </div>
      <div class="stats">
        <div class="st" id="dl-status-${id}">${status}</div>
        <div id="dl-size-${id}">${escapeHtml(dmSizeText(it))}</div>
      </div>
      <button class="icon-btn" data-cancel="${id}" title="Batalkan">${icon("x", 15)}</button>
    </div>`;
}

function dmDoneItemHtml(it) {
  const id = escapeHtml(it.id);
  return `
    <div class="dm-item">
      <div class="thumb"><img src="${escapeHtml(it.animeThumb || "")}" /></div>
      <div class="mid">
        <div class="t1">${escapeHtml(it.animeTitle)} - ${escapeHtml(epLabel(it.episodeTitle))}</div>
        <div class="t2">${escapeHtml(it.quality || "")} • Subtitle Indonesia</div>
      </div>
      <div class="size">${escapeHtml(dmSizeText(it))}</div>
      <span class="dm-done">${icon("check", 14)} Selesai</span>
      <button class="btn-outline" data-play="${escapeHtml(it.episodeEndpoint)}" data-anime="${escapeHtml(it.animeEndpoint || "")}" data-title="${escapeHtml(it.animeTitle)}" data-thumb="${escapeHtml(it.animeThumb || "")}">${icon("offline", 14)} Tonton Offline</button>
      <button class="icon-btn" data-delete="${id}" title="Hapus">${icon("trash", 15)}</button>
    </div>`;
}

function miniItemsHtml(items, kind) {
  if (items.length === 0) return `<p style="color:var(--faint);font-size:12px;margin:0">Belum ada.</p>`;
  return items
    .map((x) =>
      kind === "history"
        ? `<div class="mini-item" data-ep="${escapeHtml(x.episodeEndpoint)}" data-anime="${escapeHtml(x.animeEndpoint || "")}" data-title="${escapeHtml(x.animeTitle)}" data-thumb="${escapeHtml(x.animeThumb || "")}">
             <img src="${escapeHtml(x.animeThumb || "")}" /><div><div class="m1">${escapeHtml(x.animeTitle)}</div><div class="m2">${escapeHtml(epLabel(x.episodeTitle))} · ${relativeTime(x.watchedAt)}</div></div></div>`
        : `<div class="mini-item" data-bm="${escapeHtml(x.endpoint)}">
             <img src="${escapeHtml(x.thumb || "")}" /><div><div class="m1">${escapeHtml(x.title)}</div><div class="m2">${escapeHtml(x.status || "")}</div></div></div>`
    )
    .join("");
}

function downloadSettingsHtml(s) {
  return `
    <div class="set-field">
      <label class="lbl">Folder Download</label>
      <div class="set-folder"><div class="path" id="set-dir">${escapeHtml(s.downloadDir)}</div><button class="icon-btn" id="set-dir-btn" title="Ganti folder">${icon("folder", 16)}</button></div>
    </div>
    <div class="set-field">
      <label class="lbl">Kualitas Default (untuk Download Semua)</label>
      <select class="set-select" id="set-quality">${["360p", "480p", "720p", "1080p"].map((q) => `<option ${q === s.defaultQuality ? "selected" : ""}>${q}</option>`).join("")}</select>
    </div>
    <div class="set-field">
      <div class="set-switch"><span>Beri notifikasi jika download selesai</span>
        <label class="switch"><input type="checkbox" id="set-notify" ${s.notifyOnDone ? "checked" : ""} /><span class="slider"></span></label>
      </div>
    </div>`;
}

function wireDownloadSettings() {
  document.getElementById("set-dir-btn")?.addEventListener("click", async () => {
    const dir = await window.otaku.chooseDownloadDir();
    if (dir) document.getElementById("set-dir").textContent = dir;
  });
  document.getElementById("set-quality")?.addEventListener("change", (e) => window.otaku.setSetting("defaultQuality", e.target.value));
  document.getElementById("set-notify")?.addEventListener("change", (e) => window.otaku.setSetting("notifyOnDone", e.target.checked));
}

async function renderDownloadsView() {
  setView("downloads", () => renderDownloadsView(), { root: true });
  setActiveNav("downloads");
  try {
    const [items, settings] = await Promise.all([window.otaku.listDownloads(), window.otaku.getSettings()]);
    const active = items.filter((i) => i.status !== "done");
    const done = items.filter((i) => i.status === "done");
    const running = active.filter((i) => i.status === "downloading").length;
    const history = readStore(STORE_KEYS.history).slice(0, 3);
    const bookmarks = uniqueByEndpoint([...readStore(STORE_KEYS.bookmarks), ...readStore(STORE_KEYS.watchlist)]).slice(0, 3);

    main.innerHTML = `
      <div class="dm-head">
        <h1>Download Manager</h1>
        ${running ? `<span class="run-chip">${running} Sedang Berjalan</span>` : ""}
        <div class="grow"></div>
        <button class="btn-outline" id="open-folder">${icon("folder", 15)} Buka Folder</button>
        <button class="btn-outline" id="clear-done">${icon("trash", 15)} Hapus Selesai</button>
      </div>
      ${active.length ? `<div class="dm-list">${active.map(dmActiveItemHtml).join("")}</div>` : ""}
      <div class="dm-sub-title">Download Selesai (${done.length})</div>
      ${done.length ? `<div class="dm-list">${done.map(dmDoneItemHtml).join("")}</div>` : `<p style="color:var(--faint);font-size:12.5px">Belum ada unduhan selesai. Unduh episode dari halaman detail anime.</p>`}

      <div class="dm-grid">
        <div class="dm-card"><h3>Riwayat Tontonan <button class="see-all" id="dm-hist-all">Lihat Semua ${icon("chevronRight", 12)}</button></h3>${miniItemsHtml(history, "history")}</div>
        <div class="dm-card"><h3>Bookmark Saya <button class="see-all" id="dm-bm-all">Lihat Semua ${icon("chevronRight", 12)}</button></h3>${miniItemsHtml(bookmarks, "bookmark")}</div>
        <div class="dm-card"><h3>${icon("settings", 15)} Pengaturan Download</h3>${downloadSettingsHtml(settings)}</div>
      </div>`;

    document.getElementById("open-folder")?.addEventListener("click", () => window.otaku.openDownloadFolder());
    document.getElementById("clear-done")?.addEventListener("click", async () => {
      await window.otaku.clearCompletedDownloads();
      renderDownloadsView();
    });
    document.getElementById("dm-hist-all")?.addEventListener("click", () => renderHistoryView());
    document.getElementById("dm-bm-all")?.addEventListener("click", () => renderBookmarksView());
    main.querySelectorAll("[data-cancel]").forEach((b) =>
      b.addEventListener("click", async () => {
        await window.otaku.cancelDownload(b.dataset.cancel);
        renderDownloadsView();
      })
    );
    main.querySelectorAll("[data-delete]").forEach((b) =>
      b.addEventListener("click", async () => {
        await window.otaku.deleteDownload(b.dataset.delete);
        renderDownloadsView();
      })
    );
    main.querySelectorAll("[data-play]").forEach((b) =>
      b.addEventListener("click", () =>
        renderWatch(b.dataset.play, { preferLocal: true, animeEndpoint: b.dataset.anime, animeTitle: b.dataset.title, animeThumb: b.dataset.thumb })
      )
    );
    bindContinueMini(main);
    wireDownloadSettings();
  } catch (err) {
    stateError(err.message, () => renderDownloadsView());
  }
}

function bindContinueMini(root) {
  root.querySelectorAll(".mini-item[data-ep]").forEach((el) =>
    el.addEventListener("click", () =>
      renderWatch(el.dataset.ep, { animeEndpoint: el.dataset.anime, animeTitle: el.dataset.title, animeThumb: el.dataset.thumb })
    )
  );
  root.querySelectorAll(".mini-item[data-bm]").forEach((el) => el.addEventListener("click", () => renderDetail(el.dataset.bm)));
}

// Live-updates the open Download page as progress events stream in.
window.otaku.onDownloadProgress((p) => {
  const onPage = currentView?.key === "downloads";
  if (p.status !== "downloading") {
    if (onPage) renderDownloadsView();
    return;
  }
  const now = Date.now();
  const prev = speedSamples[p.id];
  let speed = prev?.speed || 0;
  if (!prev) {
    speedSamples[p.id] = { bytes: p.downloaded || 0, ts: now, speed: 0 };
  } else if (now - prev.ts >= 700) {
    const inst = ((p.downloaded || 0) - prev.bytes) / ((now - prev.ts) / 1000);
    speed = prev.speed ? prev.speed * 0.6 + inst * 0.4 : inst;
    speedSamples[p.id] = { bytes: p.downloaded || 0, ts: now, speed };
  }
  if (!onPage) return;
  const pct = p.percent != null ? Math.round(p.percent * 100) : null;
  const bar = document.getElementById(`dl-bar-${p.id}`);
  const pctEl = document.getElementById(`dl-pct-${p.id}`);
  const sizeEl = document.getElementById(`dl-size-${p.id}`);
  if (bar && pct != null) bar.style.width = `${pct}%`;
  if (pctEl && pct != null) pctEl.textContent = `${pct}%`;
  if (sizeEl) {
    const sizes = p.total ? `${formatBytes(p.downloaded)} / ${formatBytes(p.total)}` : formatBytes(p.downloaded);
    sizeEl.textContent = speed > 0 ? `${sizes} • ${formatBytes(speed)}/s` : sizes;
  }
});

async function renderSettingsView() {
  setView("settings", () => renderSettingsView(), { root: true });
  setActiveNav("settings");
  const settings = await window.otaku.getSettings();
  main.innerHTML = `
    <div class="section-head"><h2>Pengaturan</h2></div>
    <div class="dm-card settings-page"><h3>${icon("download", 15)} Download</h3>${downloadSettingsHtml(settings)}</div>`;
  wireDownloadSettings();
}

function renderPlaceholderView(view, title, message) {
  setActiveNav(view);
  stateEmpty(title, message);
}

// ---------------- Detail (with tabs) ----------------

async function renderDetail(endpoint) {
  setView("detail:" + endpoint, () => renderDetail(endpoint));
  setActiveNav("");
  stateLoading("Mengambil detail anime…");
  try {
    const d = await window.otaku.detail(endpoint);
    const saved = isBookmarked(endpoint) || isInWatchlist(endpoint);
    const eps = d.episodes.map((ep, i) => ({ ...ep, num: extractEpNum(ep.title) ?? d.episodes.length - i }));
    const first = [...eps].sort((a, b) => a.num - b.num)[0];
    const watchCtx = { animeEndpoint: endpoint, animeTitle: d.title, animeThumb: d.thumb };

    const episodeTabHtml = eps.length
      ? `<div class="ep-list">
          ${eps
            .map(
              (ep) => `
            <div class="ep-row" data-endpoint="${escapeHtml(ep.endpoint)}">
              <div class="thumb"><img src="${escapeHtml(d.thumb)}" loading="lazy" /><div class="play-overlay">${icon("play", 22)}</div></div>
              <div class="txt">
                <div class="t1">Episode ${ep.num}</div>
                <div class="t2">${escapeHtml(stripSubtitleSuffix(ep.title))}</div>
              </div>
              <span class="date">${escapeHtml(ep.date)}</span>
              <span class="round-play">${icon("play", 14)}</span>
              <button class="icon-btn" data-dl-endpoint="${escapeHtml(ep.endpoint)}" data-dl-title="${escapeHtml(ep.title)}" title="Download episode ini">${icon("download", 15)}</button>
            </div>`
            )
            .join("")}
        </div>`
      : `<p style="color:var(--muted)">Tidak ada episode ditemukan.</p>`;

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
      <div class="back-row"><button class="icon-btn" id="back-btn" title="Kembali">${icon("chevronLeft", 16)}</button></div>
      <div class="detail-top">
        <div class="detail-poster"><img src="${escapeHtml(d.thumb)}" /></div>
        <div class="detail-info">
          <h1 class="detail-title">${escapeHtml(d.title)}</h1>
          <div class="meta-line">
            ${d.score ? `<span class="star">★ ${escapeHtml(d.score)}</span><span class="sep"></span>` : ""}
            ${d.totalEpisode ? `<span>${escapeHtml(d.totalEpisode)} Episode</span><span class="sep"></span>` : ""}
            ${d.status ? `<span>${escapeHtml(d.status)}</span>` : ""}
          </div>
          <div class="pill-row">${d.genres.map((g) => `<span class="pill">${escapeHtml(g)}</span>`).join("")}</div>
          <p class="synopsis">${escapeHtml(d.synopsis.slice(0, 320))}${d.synopsis.length > 320 ? "…" : ""}</p>
          <dl class="info-lines">
            ${d.studio ? `<dt>Studio</dt><dd>${escapeHtml(d.studio)}</dd>` : ""}
            ${d.totalEpisode ? `<dt>Total Episode</dt><dd>${escapeHtml(d.totalEpisode)}</dd>` : ""}
            ${d.status ? `<dt>Status</dt><dd>${escapeHtml(d.status)}</dd>` : ""}
          </dl>
          <div class="detail-actions">
            ${first ? `<button class="btn-primary" id="watch-first">${icon("play", 14)} Tonton Episode ${first.num}</button>` : ""}
            <button class="btn-outline" id="toggle-bookmark">${icon("bookmarkStack", 15)} <span id="bm-label">${saved ? "Tersimpan" : "Bookmark"}</span></button>
            ${eps.length ? `<button class="btn-primary" id="download-all-btn">${icon("download", 15)} Download Semua</button>` : ""}
          </div>
        </div>
      </div>

      <div class="tabs">
        <button class="tab-btn active" data-tab="episode">Episode</button>
        <button class="tab-btn" data-tab="info">Informasi</button>
        <button class="tab-btn" data-tab="characters">Karakter</button>
        <button class="tab-btn" disabled title="Situs sumber tidak menyediakan data ini">Rekomendasi</button>
        <button class="tab-btn" disabled title="Situs sumber tidak menyediakan data ini">Komentar</button>
      </div>
      <div id="tab-episode">${episodeTabHtml}</div>
      <div id="tab-info" style="display:none">${infoTabHtml}</div>
      <div id="tab-characters" style="display:none"></div>`;

    document.getElementById("back-btn")?.addEventListener("click", goBack);

    // ----- tabs (characters load lazily from MyAnimeList via Jikan) -----
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
          <p style="color:var(--faint);font-size:11.5px;margin-bottom:14px">
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

    main.querySelectorAll(".tab-btn:not([disabled])").forEach((btn) =>
      btn.addEventListener("click", () => {
        main.querySelectorAll(".tab-btn").forEach((b) => b.classList.remove("active"));
        btn.classList.add("active");
        for (const name of ["episode", "info", "characters"]) {
          document.getElementById(`tab-${name}`).style.display = btn.dataset.tab === name ? "" : "none";
        }
        if (btn.dataset.tab === "characters") loadCharactersTab();
      })
    );

    // ----- episodes -----
    main.querySelectorAll(".ep-row[data-endpoint]").forEach((el) =>
      el.addEventListener("click", () => renderWatch(el.dataset.endpoint, watchCtx))
    );
    main.querySelectorAll("[data-dl-endpoint]").forEach((btn) =>
      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        openDownloadPicker({ ...watchCtx, episodeEndpoint: btn.dataset.dlEndpoint, episodeTitle: btn.dataset.dlTitle });
      })
    );

    // ----- actions -----
    document.getElementById("watch-first")?.addEventListener("click", () => first && renderWatch(first.endpoint, watchCtx));
    document.getElementById("toggle-bookmark")?.addEventListener("click", () => {
      const entry = { endpoint, title: d.title, thumb: d.thumb, status: d.status };
      const nowSaved = isBookmarked(endpoint) || isInWatchlist(endpoint);
      if (nowSaved) {
        if (isBookmarked(endpoint)) toggleBookmark(entry);
        if (isInWatchlist(endpoint)) toggleWatchlist(entry);
      } else {
        toggleBookmark(entry);
      }
      document.getElementById("bm-label").textContent = nowSaved ? "Bookmark" : "Tersimpan";
    });
    document.getElementById("download-all-btn")?.addEventListener("click", () => {
      window.otaku.downloadAllEpisodes({ animeEndpoint: endpoint, animeTitle: d.title, animeThumb: d.thumb, episodes: d.episodes });
      setTimeout(renderDownloadsView, 400);
    });
  } catch (err) {
    stateError(err.message, () => renderDetail(endpoint));
  }
}

// ---------------- Watch ----------------

async function renderWatch(endpoint, context = {}) {
  const { preferLocal, replace, ...ctx } = context;
  setView("watch:" + endpoint, () => renderWatch(endpoint, context), { replace });
  setActiveNav("");
  stateLoading("Menyiapkan pemutar…");

  // Local (downloaded) playback only when explicitly requested — e.g. from
  // the Download page — never just because a copy happens to exist.
  const localFile = preferLocal ? await window.otaku.getLocalFile(endpoint) : null;
  if (localFile) {
    const animeTitle = ctx.animeTitle || localFile.animeTitle;
    pushHistory({
      animeEndpoint: ctx.animeEndpoint || localFile.animeEndpoint || "",
      animeTitle,
      animeThumb: ctx.animeThumb || localFile.animeThumb || "",
      episodeEndpoint: endpoint,
      episodeTitle: localFile.episodeTitle,
    });
    main.innerHTML = `
      <div class="watch-head">
        <button class="icon-btn" id="back-btn" title="Kembali">${icon("chevronLeft", 16)}</button>
        <div><h2>${escapeHtml(animeTitle)} - ${escapeHtml(epLabel(localFile.episodeTitle))}</h2><p>${escapeHtml(stripSubtitleSuffix(localFile.episodeTitle))}</p></div>
      </div>
      <div class="player-wrap">
        <video controls autoplay id="local-video" src="${toFileUrl(localFile.filePath)}">Browser ini tidak mendukung pemutaran video.</video>
      </div>
      <div class="player-toolbar"><button class="icon-btn" id="pip-btn-local" title="Picture-in-Picture">${icon("pip", 16)}</button></div>
      <p style="color:var(--faint);font-size:11.5px;margin-top:10px">${icon("download", 12)} Diputar dari file yang sudah diunduh — tidak butuh koneksi internet.</p>`;
    document.getElementById("back-btn")?.addEventListener("click", goBack);

    const video = document.getElementById("local-video");
    let lastSave = 0;
    video.addEventListener("timeupdate", () => {
      const now = Date.now();
      if (now - lastSave < 3000 || !video.duration) return;
      lastSave = now;
      updateHistoryProgress(endpoint, video.currentTime / video.duration);
    });
    video.addEventListener("ended", () => updateHistoryProgress(endpoint, 1));
    document.getElementById("pip-btn-local")?.addEventListener("click", async () => {
      try {
        if (document.pictureInPictureElement) await document.exitPictureInPicture();
        else await video.requestPictureInPicture();
      } catch (err) {
        alert(`Tidak bisa membuka Picture-in-Picture: ${err.message}`);
      }
    });
    window.otaku.setDiscordActivity({ animeTitle, episodeTitle: localFile.episodeTitle, startedAt: Date.now() });
    return;
  }

  try {
    const ep = await window.otaku.episode(endpoint);

    if (ep.type === "batch") {
      main.innerHTML = `
        <div class="watch-head"><button class="icon-btn" id="back-btn">${icon("chevronLeft", 16)}</button><div><h2>${escapeHtml(ep.title)}</h2></div></div>
        <div class="state">
          <h3>Ini link batch/lengkap</h3>
          <p>"${escapeHtml(ep.title)}" adalah halaman download semua episode sekaligus, bukan halaman streaming per-episode. Kembali dan pilih episode individual.</p>
        </div>`;
      document.getElementById("back-btn")?.addEventListener("click", goBack);
      return;
    }

    const animeTitle = ctx.animeTitle || ep.title;
    pushHistory({
      animeEndpoint: ctx.animeEndpoint || "",
      animeTitle,
      animeThumb: ctx.animeThumb || "",
      episodeEndpoint: endpoint,
      episodeTitle: ep.title,
    });
    window.otaku.setDiscordActivity({ animeTitle, episodeTitle: ep.title, startedAt: Date.now() });

    let activeUrl = ep.streamLink;
    let quality = "auto"; // "auto" | "360p" | "480p" | ...
    let serverValue = ep.streamLink ? "default" : "";
    let autoNext = getAutoNextPref();
    const nextEp = findNextEpisode(ep.title, ep.otherEpisodes);
    const qualities = [...new Set(ep.mirrors.map((m) => m.quality))];

    function serverOptionsHtml() {
      const opts = [];
      if (quality === "auto" && ep.streamLink) {
        opts.push(`<option value="default" ${serverValue === "default" ? "selected" : ""}>Player Default</option>`);
      }
      ep.mirrors.forEach((m, i) => {
        if (quality !== "auto" && m.quality !== quality) return;
        const label = quality === "auto" ? `${m.driver} (${m.quality})` : m.driver;
        opts.push(`<option value="mirror:${i}" ${serverValue === `mirror:${i}` ? "selected" : ""}>${escapeHtml(label)}</option>`);
      });
      if (opts.length === 0) opts.push(`<option value="">Tidak ada server</option>`);
      return opts.join("");
    }

    async function useServer(value) {
      if (value === "default") {
        activeUrl = ep.streamLink;
        serverValue = "default";
        return draw();
      }
      const mirror = ep.mirrors[Number(value.split(":")[1])];
      if (!mirror) return;
      try {
        activeUrl = await window.otaku.resolveMirror(mirror.content);
        serverValue = value;
      } catch (err) {
        alert(`Gagal resolve server: ${err.message}`);
      }
      draw();
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
          renderWatch(target.endpoint, { ...ctx, replace: true });
        }
      }, 1000);
      document.getElementById("autonext-cancel")?.addEventListener("click", () => {
        clearInterval(timer);
        overlay.remove();
      });
    }

    function draw() {
      main.innerHTML = `
        <div class="watch-head">
          <button class="icon-btn" id="back-btn" title="Kembali">${icon("chevronLeft", 16)}</button>
          <div><h2>${escapeHtml(animeTitle)} - ${escapeHtml(epLabel(ep.title))}</h2><p>${escapeHtml(stripSubtitleSuffix(ep.title))}</p></div>
        </div>

        <div class="player-wrap" id="player-wrap">
          ${
            activeUrl
              ? `<webview src="${escapeHtml(activeUrl)}" preload="${escapeHtml(window.otaku.webviewPreloadUrl)}" allowpopups></webview>`
              : `<div class="state"><h3>Pilih server untuk mulai menonton</h3></div>`
          }
        </div>

        <div class="player-toolbar">
          <button class="icon-btn" id="pip-btn" title="Picture-in-Picture">${icon("pip", 16)}</button>
          <button class="icon-btn" id="fullscreen-btn" title="Layar penuh">${icon("maximize", 16)}</button>
        </div>

        <div class="watch-controls">
          <div class="ctl">
            <label class="lbl">Server / Mirror</label>
            <select id="server-select">${serverOptionsHtml()}</select>
          </div>
          <div class="ctl">
            <label class="lbl">Subtitle</label>
            <select disabled><option>Indonesia</option></select>
          </div>
          <div class="ctl">
            <label class="lbl">Kualitas Video</label>
            <div class="qchips">
              <button class="qchip ${quality === "auto" ? "active" : ""}" data-q="auto">Auto</button>
              ${qualities.map((q) => `<button class="qchip ${quality === q ? "active" : ""}" data-q="${escapeHtml(q)}">${escapeHtml(q)}</button>`).join("")}
            </div>
          </div>
          <div class="ctl">
            <div class="switch-row">
              <label class="lbl" style="margin:0">Auto Next Episode</label>
              <label class="switch"><input type="checkbox" id="autonext-check" ${autoNext ? "checked" : ""} ${nextEp ? "" : "disabled"} /><span class="slider"></span></label>
            </div>
            <div class="desc">${nextEp ? "Otomatis memutar episode berikutnya" : "Episode berikutnya tidak terdeteksi"}</div>
          </div>
        </div>

        ${
          ep.otherEpisodes.length
            ? `<div class="section-head"><h2>Episode Lain</h2></div>
               <div class="row-scroll">${ep.otherEpisodes
                 .map((oe) => `<button class="btn-ghost" data-nav="${escapeHtml(oe.endpoint)}" style="flex-shrink:0">${escapeHtml(epLabel(oe.title))}</button>`)
                 .join("")}</div>`
            : ""
        }`;

      document.getElementById("back-btn")?.addEventListener("click", goBack);
      document.getElementById("autonext-check")?.addEventListener("change", (e) => {
        autoNext = e.target.checked;
        setAutoNextPref(autoNext);
      });
      document.getElementById("server-select")?.addEventListener("change", (e) => e.target.value && useServer(e.target.value));
      main.querySelectorAll(".qchip").forEach((chip) =>
        chip.addEventListener("click", () => {
          quality = chip.dataset.q;
          if (quality === "auto") {
            if (ep.streamLink) return useServer("default");
            const i = ep.mirrors.findIndex(() => true);
            return i >= 0 ? useServer(`mirror:${i}`) : draw();
          }
          const i = ep.mirrors.findIndex((m) => m.quality === quality);
          if (i >= 0) useServer(`mirror:${i}`);
        })
      );
      document.getElementById("fullscreen-btn")?.addEventListener("click", () => document.getElementById("player-wrap")?.requestFullscreen?.());
      document.getElementById("pip-btn")?.addEventListener("click", async () => {
        const webviewEl = document.querySelector(".player-wrap webview");
        if (!webviewEl) return;
        try {
          const result = await webviewEl.executeJavaScript(`
            (function () {
              try {
                const video = document.querySelector("video");
                if (!video) return "no-video";
                if (document.pictureInPictureElement) { document.exitPictureInPicture(); return "exited"; }
                if (video.disablePictureInPicture || !document.pictureInPictureEnabled) return "disabled";
                video.requestPictureInPicture();
                return "requested";
              } catch (e) { return "error:" + e.message; }
            })();
          `);
          if (result === "no-video") {
            alert("Tidak ditemukan tag video langsung di halaman player ini — kemungkinan videonya ada di dalam iframe bersarang, sehingga Picture-in-Picture tidak bisa dipicu dari sini. Coba server/mirror lain.");
          } else if (result === "disabled" || String(result).startsWith("error:")) {
            alert("Picture-in-Picture tidak bisa diaktifkan untuk server ini.");
          }
        } catch (err) {
          alert(`Gagal mengaktifkan Picture-in-Picture: ${err.message}`);
        }
      });
      main.querySelectorAll("[data-nav]").forEach((btn) =>
        btn.addEventListener("click", () => renderWatch(btn.dataset.nav, { ...ctx, replace: true }))
      );

      // Signals forwarded from inside the streaming iframe (see
      // webview-preload.js): playback progress and "video ended".
      const webviewEl = document.querySelector(".player-wrap webview");
      webviewEl?.addEventListener("ipc-message", (e) => {
        if (e.channel === "yozora:progress") {
          const { t, d } = e.args[0] || {};
          if (d) updateHistoryProgress(endpoint, t / d);
        } else if (e.channel === "yozora:ended") {
          updateHistoryProgress(endpoint, 1);
          if (autoNext && nextEp) showAutoNextOverlay(nextEp);
        }
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
    else if (view === "search") renderSearchHome();
    else if (view === "genres") renderGenres();
    else if (view === "schedule") renderSchedule();
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

