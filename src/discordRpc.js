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
    setIdleActivity();
  });

  try {
    await client.login({ clientId });
  } catch (err) {
    // Most common cause: the Discord desktop app isn't running at all.
    // This isn't fatal to the rest of the app, so just log it.
    console.log("[discord-rpc] Gagal terhubung ke Discord (kemungkinan Discord tidak sedang berjalan):", err.message);
  }
}

// discord-rpc's own client.setActivity() builds a hardcoded field whitelist
// internally (state/details/timestamps/assets/party/secrets/buttons/instance)
// and silently drops anything else — including an activity "type" — so it's
// not possible to get "Watching X" (or any non-"Playing" verb) through that
// wrapper. We instead send the SET_ACTIVITY IPC command ourselves with the
// type included. Note: Discord's local Rich Presence only accepts type 0
// (Playing) or type 3 (Watching) — type 1 (Streaming) is rejected by Discord
// itself, so "Watching" is the closest match to "Streaming" achievable here.
const ACTIVITY_TYPE_WATCHING = 3;

function sendActivity(activity) {
  if (!ready || !client) return;
  client.request("SET_ACTIVITY", { pid: process.pid, activity }).catch(() => {});
}

function setActivity({ animeTitle, episodeTitle, startedAt, endedAt, paused }) {
  // With both startTimestamp and endTimestamp set, Discord renders a
  // scrubber-style progress bar (elapsed — total) like the YouTube example,
  // computed from the actual video position instead of "time since opened".
  // Discord doesn't support pausing that bar, so while paused we fall back
  // to a plain elapsed-time counter (startTimestamp only) — closest visual
  // equivalent without the bar silently drifting while nothing is playing.
  const timestamps = { start: startedAt || Date.now() };
  if (endedAt && !paused) timestamps.end = endedAt;

  const assets = {
    large_image: "yozora_logo",
    large_text: "Yozora",
  };
  if (paused) {
    assets.small_image = "pause";
    assets.small_text = "Dijeda";
  }

  sendActivity({
    type: ACTIVITY_TYPE_WATCHING,
    details: animeTitle ? truncate(animeTitle) : "Menjelajahi Yozora",
    state: episodeTitle ? truncate(episodeTitle) : undefined,
    timestamps,
    assets,
    instance: false,
  });
}

// Shown whenever the app is open but nothing is playing yet — browsing the
// home page, searching, or reading an anime's detail page before hitting
// "watch". Without this, Rich Presence would just show nothing at all until
// the first episode starts, which reads as if the app silently died.
function setIdleActivity() {
  sendActivity({
    type: ACTIVITY_TYPE_WATCHING,
    details: "Menjelajahi Yozora",
    state: "Mencari anime buat ditonton…",
    timestamps: { start: Date.now() },
    assets: { large_image: "yozora_logo", large_text: "Yozora" },
    instance: false,
  });
}

// Fully hides the "Watching X" line — only used when the app is quitting.
// Going back from an episode to browsing uses setIdleActivity() instead, so
// Rich Presence stays visible the whole time the app is open.
function clearActivity() {
  if (!ready || !client) return;
  client.clearActivity().catch(() => {});
}

function truncate(str, max = 120) {
  return str.length > max ? str.slice(0, max - 1) + "…" : str;
}

module.exports = { init, setActivity, setIdleActivity, clearActivity };
