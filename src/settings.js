const fs = require("fs");
const path = require("path");
const { app } = require("electron");

const SETTINGS_PATH = path.join(app.getPath("userData"), "settings.json");

const DEFAULTS = {
  defaultQuality: "720p",
  notifyOnDone: true,
};

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

// All user-facing settings in one object (download folder included), with
// defaults filled in for anything the person hasn't changed yet.
function getAll() {
  return { ...DEFAULTS, ...readSettings(), downloadDir: getDownloadDir() };
}

function set(key, value) {
  const settings = readSettings();
  settings[key] = value;
  writeSettings(settings);
  return getAll();
}

module.exports = { getDownloadDir, setDownloadDir, getAll, set };
