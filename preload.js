const { contextBridge, ipcRenderer } = require("electron");
const path = require("path");
const { pathToFileURL } = require("url");

const webviewPreloadUrl = pathToFileURL(path.join(__dirname, "renderer", "webview-preload.js")).href;

contextBridge.exposeInMainWorld("otaku", {
  ongoing: (page) => ipcRenderer.invoke("scraper:ongoing", page),
  completed: (page) => ipcRenderer.invoke("scraper:completed", page),
  search: (query) => ipcRenderer.invoke("scraper:search", query),
  genres: () => ipcRenderer.invoke("scraper:genres"),
  genrePage: (genre, page) => ipcRenderer.invoke("scraper:genrePage", genre, page),
  schedule: () => ipcRenderer.invoke("scraper:schedule"),
  detail: (endpoint) => ipcRenderer.invoke("scraper:detail", endpoint),
  episode: (endpoint) => ipcRenderer.invoke("scraper:episode", endpoint),
  resolveMirror: (content) => ipcRenderer.invoke("scraper:resolveMirror", content),
  batchDownloads: (endpoint) => ipcRenderer.invoke("scraper:batchDownloads", endpoint),
  getBaseUrl: () => ipcRenderer.invoke("scraper:getBaseUrl"),
  setBaseUrl: (url) => ipcRenderer.invoke("scraper:setBaseUrl", url),
  characters: (title) => ipcRenderer.invoke("mal:characters", title),
  setDiscordActivity: (payload) => ipcRenderer.invoke("discord:setActivity", payload),
  clearDiscordActivity: () => ipcRenderer.invoke("discord:clearActivity"),
  listDownloads: () => ipcRenderer.invoke("download:list"),
  getLocalFile: (episodeEndpoint) => ipcRenderer.invoke("download:getLocalFile", episodeEndpoint),
  deleteDownload: (id) => ipcRenderer.invoke("download:delete", id),
  downloadFromLink: (context) => ipcRenderer.invoke("download:fromLink", context),
  downloadAllEpisodes: (context) => ipcRenderer.invoke("download:all", context),
  getDownloadDir: () => ipcRenderer.invoke("settings:getDownloadDir"),
  chooseDownloadDir: () => ipcRenderer.invoke("settings:chooseDownloadDir"),
  onDownloadProgress: (callback) => {
    const handler = (e, payload) => callback(payload);
    ipcRenderer.on("download:progress", handler);
    return () => ipcRenderer.removeListener("download:progress", handler);
  },
  openExternal: (url) => ipcRenderer.invoke("app:openExternal", url),
  webviewPreloadUrl,
});
