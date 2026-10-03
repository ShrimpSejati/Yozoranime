const { app, BrowserWindow, ipcMain, shell, dialog } = require("electron");
const path = require("path");
const scraper = require("./src/scraper");
const mal = require("./src/mal");
const discordRpc = require("./src/discordRpc");
const downloader = require("./src/downloader");
const settings = require("./src/settings");

let mainWindow = null;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    backgroundColor: "#0a0d16",
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      webviewTag: true,
    },
  });

  mainWindow.loadFile(path.join(__dirname, "renderer", "index.html"));
}

app.whenReady().then(() => {
  createWindow();
  discordRpc.init();
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("before-quit", () => {
  discordRpc.clearActivity();
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

// ---- IPC bridge: renderer calls these via window.otaku.* (see preload.js) ----

ipcMain.handle("scraper:ongoing", (e, page) => scraper.getOngoing(page));
ipcMain.handle("scraper:completed", (e, page) => scraper.getCompleted(page));
ipcMain.handle("scraper:search", (e, query) => scraper.search(query));
ipcMain.handle("scraper:genres", () => scraper.getGenreList());
ipcMain.handle("scraper:genrePage", (e, genre, page) => scraper.getGenrePage(genre, page));
ipcMain.handle("scraper:detail", (e, endpoint) => scraper.getAnimeDetail(endpoint));
ipcMain.handle("scraper:episode", (e, endpoint) => scraper.getAnimeEpisode(endpoint));
ipcMain.handle("scraper:resolveMirror", (e, content) => scraper.resolveMirror(content));
ipcMain.handle("scraper:batchDownloads", (e, endpoint) => scraper.getBatchLink(endpoint));
ipcMain.handle("scraper:schedule", () => scraper.getSchedule());
ipcMain.handle("scraper:getBaseUrl", () => scraper.getBaseUrl());
ipcMain.handle("scraper:setBaseUrl", (e, url) => scraper.setBaseUrl(url));

ipcMain.handle("mal:characters", (e, title) => mal.getCharactersByTitle(title));

ipcMain.handle("discord:setActivity", (e, payload) => discordRpc.setActivity(payload));
ipcMain.handle("discord:clearActivity", () => discordRpc.clearActivity());

ipcMain.handle("download:list", () => downloader.listDownloads());
ipcMain.handle("download:getLocalFile", (e, episodeEndpoint) => downloader.getLocalFile(episodeEndpoint));
ipcMain.handle("download:delete", (e, id) => downloader.deleteDownload(id));

ipcMain.handle("download:fromLink", async (e, context) => {
  return downloader.downloadFromLink({
    context,
    onProgress: (payload) => mainWindow?.webContents.send("download:progress", payload),
  });
});

ipcMain.handle("download:all", async (e, context) => {
  return downloader.downloadAllEpisodes({
    scraper,
    context,
    onProgress: (payload) => mainWindow?.webContents.send("download:progress", payload),
  });
});

ipcMain.handle("settings:getDownloadDir", () => settings.getDownloadDir());
ipcMain.handle("settings:chooseDownloadDir", async () => {
  const result = await dialog.showOpenDialog(mainWindow, { properties: ["openDirectory", "createDirectory"] });
  if (result.canceled || !result.filePaths[0]) return null;
  return settings.setDownloadDir(result.filePaths[0]);
});

ipcMain.handle("app:openExternal", (e, url) => shell.openExternal(url));
