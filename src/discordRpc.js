const RPC = require("discord-rpc");
const { clientId } = require("./discordConfig");

let client = null;
let ready = false;

async function init() {
  if (!clientId) {
    console.log("[discord-rpc] clientId kosong di src/discordConfig.js — Rich Presence dinonaktifkan.");
    return;
  }

  client = new RPC.Client({ transport: "ipc" });

  client.on("ready", () => {
    ready = true;
    console.log("[discord-rpc] Terhubung ke Discord.");
  });

  try {
    await client.login({ clientId });
  } catch (err) {
    // Most common cause: the Discord desktop app isn't running at all.
    // This isn't fatal to the rest of the app, so just log it.
    console.log("[discord-rpc] Gagal terhubung ke Discord (kemungkinan Discord tidak sedang berjalan):", err.message);
  }
}

function setActivity({ animeTitle, episodeTitle, startedAt }) {
  if (!ready || !client) return;
  client
    .setActivity({
      details: animeTitle ? `Menonton ${truncate(animeTitle)}` : "Menjelajahi Yozora",
      state: episodeTitle ? truncate(episodeTitle) : undefined,
      startTimestamp: startedAt || Date.now(),
      largeImageKey: "yozora_logo",
      largeImageText: "Yozora",
      instance: false,
    })
    .catch(() => {});
}

function clearActivity() {
  if (!ready || !client) return;
  client.clearActivity().catch(() => {});
}

function truncate(str, max = 120) {
  return str.length > max ? str.slice(0, max - 1) + "…" : str;
}

module.exports = { init, setActivity, clearActivity };
