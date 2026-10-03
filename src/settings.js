const fs = require("fs");
const path = require("path");
const { app } = require("electron");

const SETTINGS_PATH = path.join(app.getPath("userData"), "settings.json");

function readSettings() {
  try {
    return JSON.parse(fs.readFileSync(SETTINGS_PATH, "utf8"));
  } catch {
    return {};
  }
}

function writeSettings(settings) {
  fs.writeFileSync(SETTINGS_PATH, JSON.stringify(settings, null, 2), "utf8");
}

function getDownloadDir() {
  const settings = readSettings();
  return settings.downloadDir || path.join(app.getPath("downloads"), "Yozora");
}

function setDownloadDir(dir) {
  const settings = readSettings();
  settings.downloadDir = dir;
  writeSettings(settings);
  return dir;
}

module.exports = { getDownloadDir, setDownloadDir };
