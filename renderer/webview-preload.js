// This runs *inside* the streaming iframe loaded by <webview> (a different
// origin than our app). Electron allows a webview to have its own preload
// script with Node access regardless of the guest page's origin — that's
// what lets us detect the video's "ended" event and report it back to the
// host app via ipcRenderer.sendToHost().
//
// Caveat: this only works if the player uses a plain HTML5 <video> element
// directly on this page. Some mirror servers nest the actual player inside
// a further iframe, which browsers block cross-origin access to even from
// here — in that case this script simply never fires, and auto-next stays
// off for that server without breaking anything else.

const { ipcRenderer } = require("electron");

function attachToVideo(video) {
  if (video.dataset.yozoraWatched) return;
  video.dataset.yozoraWatched = "1";
  video.addEventListener("ended", () => {
    ipcRenderer.sendToHost("yozora:ended");
  });
}

function scan() {
  document.querySelectorAll("video").forEach(attachToVideo);
}

scan();
const observer = new MutationObserver(scan);
observer.observe(document.documentElement, { childList: true, subtree: true });
