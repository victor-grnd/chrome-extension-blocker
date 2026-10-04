// Pure blocking rules for YouTube pages and tiles (no DOM globals, testable in Node).
(function (root) {
  "use strict";

  const isNode = typeof module === "object" && module.exports;
  const channel = isNode ? require("../shared/channel.js") : root.BB.channel;
  const store = isNode ? require("../shared/storage.js") : root.BB.store;

  // Keep in sync with the tile list in content/hide.css
  const TILE_SELECTOR = [
    "ytd-rich-item-renderer",
    "ytd-video-renderer",
    "ytd-compact-video-renderer",
    "ytd-grid-video-renderer",
    "ytd-playlist-video-renderer",
    "ytd-playlist-panel-video-renderer",
    "ytd-playlist-renderer",
    "ytd-compact-playlist-renderer",
    "ytd-radio-renderer",
    "ytd-compact-radio-renderer",
    "ytd-channel-renderer",
    "yt-lockup-view-model",
  ].join(",");

  const CHANNEL_LINK = [
    'a[href^="/@"]',
    'a[href^="/channel/UC"]',
    'a[href^="https://www.youtube.com/@"]',
    'a[href^="https://www.youtube.com/channel/UC"]',
  ].join(",");

  function pageKind(pathname) {
    if (pathname === "/shorts" || pathname.startsWith("/shorts/")) return "shorts";
    if (pathname === "/watch" || pathname.startsWith("/live/")) return "watch";
    if (/^\/(@|channel\/|c\/|user\/)/.test(pathname)) return "channel";
    return "feed";
  }

  function pageVerdict(kind, pageChannel, state) {
    if (kind === "shorts") return "block";
    if (!state.enabled || kind === "feed") return "none";
    // fail closed: unidentified watch page = still checking, unidentified channel page = blocked
    if (!pageChannel) return kind === "watch" ? "checking" : "block";
    const status = store.statusOf(state, pageChannel);
    if (status === "allowed") return "allow";
    return status === "blacklisted" ? "blacklisted" : "block";
  }

  function tileVisible(tileChannel, pageCtx, state) {
    if (!state.enabled) return true;
    // Tiles on a channel page (its Videos tab) have no channel link: they belong to the page's channel.
    const ch = tileChannel || (pageCtx.kind === "channel" ? pageCtx.channel : null);
    if (!ch) return false;
    return store.statusOf(state, ch) === "allowed";
  }

  // Recomputed from the current link on every call: YouTube recycles tile elements.
  function applyTiles(tiles, pageCtx, state) {
    for (const tile of tiles) {
      const link = tile.querySelector(CHANNEL_LINK);
      const ch = link ? channel.parseChannelHref(link.getAttribute("href")) : null;
      tile.classList.toggle("bb-ok", tileVisible(ch, pageCtx, state));
    }
  }

  // Identity of a blocked page. YouTube rewrites query params after load (pp=, cbrd=, t=):
  // the same video or channel must not count as a new cheating attempt.
  function overlayKey(verdict, kind, pageChannel, url) {
    const u = new URL(url);
    const who = pageChannel ? pageChannel.id || pageChannel.handle : u.pathname;
    const video = kind === "watch" ? u.searchParams.get("v") || u.pathname : "";
    return [verdict, kind, who, video].join("|");
  }

  const api = { TILE_SELECTOR, CHANNEL_LINK, pageKind, pageVerdict, tileVisible, applyTiles, overlayKey };
  root.BB = root.BB || {};
  root.BB.rules = api;
  if (isNode) module.exports = api;
})(globalThis);
