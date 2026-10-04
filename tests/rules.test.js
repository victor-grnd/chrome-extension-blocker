const test = require("node:test");
const assert = require("node:assert/strict");
const store = require("../shared/storage.js");
const rules = require("../content/rules.js");

const ALLOWED = { id: "UCAuUUnT6oDeKwE6v1NGQxug", handle: "@ted", name: "TED" };
const BLACK = { id: "UCyWqModMQlbIo8274Wh_ZsQ", handle: "@cyprien", name: "Cyprien" };
const OTHER = { id: null, handle: "@random", name: "Random" };

const state = store.createInitialState({ allow: [ALLOWED], block: [BLACK] }, 0);
const off = { ...state, enabled: false };

test("pageKind", () => {
  assert.equal(rules.pageKind("/watch"), "watch");
  assert.equal(rules.pageKind("/live/abc"), "watch");
  assert.equal(rules.pageKind("/@ted"), "channel");
  assert.equal(rules.pageKind("/@ted/videos"), "channel");
  assert.equal(rules.pageKind("/channel/UCAuUUnT6oDeKwE6v1NGQxug"), "channel");
  assert.equal(rules.pageKind("/c/legacy"), "channel");
  assert.equal(rules.pageKind("/shorts/xyz"), "shorts");
  assert.equal(rules.pageKind("/"), "feed");
  assert.equal(rules.pageKind("/results"), "feed");
  assert.equal(rules.pageKind("/feed/subscriptions"), "feed");
});

test("pageVerdict", () => {
  assert.equal(rules.pageVerdict("watch", ALLOWED, state), "allow");
  assert.equal(rules.pageVerdict("watch", OTHER, state), "block");
  assert.equal(rules.pageVerdict("channel", { id: null, handle: "@cyprien" }, state), "blacklisted");
  assert.equal(rules.pageVerdict("feed", null, state), "none");
  assert.equal(rules.pageVerdict("shorts", null, state), "block");
});

test("pageVerdict fails closed", () => {
  assert.equal(rules.pageVerdict("watch", null, state), "checking");
  assert.equal(rules.pageVerdict("channel", null, state), "block");
});

test("pageVerdict when disabled: nothing blocked except Shorts", () => {
  assert.equal(rules.pageVerdict("watch", OTHER, off), "none");
  assert.equal(rules.pageVerdict("channel", BLACK, off), "none");
  assert.equal(rules.pageVerdict("shorts", null, off), "block");
});

test("tileVisible", () => {
  assert.equal(rules.tileVisible(ALLOWED, { kind: "feed", channel: null }, state), true);
  assert.equal(rules.tileVisible(OTHER, { kind: "feed", channel: null }, state), false);
  assert.equal(rules.tileVisible(BLACK, { kind: "feed", channel: null }, state), false);
  assert.equal(rules.tileVisible(null, { kind: "feed", channel: null }, state), false, "unknown channel stays hidden");
  assert.equal(rules.tileVisible(null, { kind: "channel", channel: ALLOWED }, state), true, "tiles on an allowed channel page inherit it");
  assert.equal(rules.tileVisible(OTHER, { kind: "feed", channel: null }, off), true);
});

function fakeTile(href) {
  const classes = new Set();
  return {
    href,
    querySelector() {
      return this.href ? { getAttribute: () => this.href } : null;
    },
    classList: {
      toggle: (name, force) => (force ? classes.add(name) : classes.delete(name)),
      contains: (name) => classes.has(name),
    },
  };
}

test("applyTiles re-evaluates a recycled tile", () => {
  const tile = fakeTile("/@TED");
  const ctx = { kind: "feed", channel: null };
  rules.applyTiles([tile], ctx, state);
  assert.equal(tile.classList.contains("bb-ok"), true);
  tile.href = "/@cyprien"; // YouTube reused the same element for another video
  rules.applyTiles([tile], ctx, state);
  assert.equal(tile.classList.contains("bb-ok"), false);
  tile.href = null; // no channel link at all
  rules.applyTiles([tile], ctx, state);
  assert.equal(tile.classList.contains("bb-ok"), false);
});

test("overlayKey ignores query params YouTube rewrites (pp=, cbrd=, t=)", () => {
  const a = rules.overlayKey("blacklisted", "watch", BLACK, "https://www.youtube.com/watch?v=X3zi-R-gzBE&pp=ygUM");
  const b = rules.overlayKey("blacklisted", "watch", BLACK, "https://www.youtube.com/watch?v=X3zi-R-gzBE&t=42");
  assert.equal(a, b);
  const c1 = rules.overlayKey("blacklisted", "channel", BLACK, "https://www.youtube.com/@cyprien?cbrd=1");
  const c2 = rules.overlayKey("blacklisted", "channel", BLACK, "https://www.youtube.com/@cyprien/videos");
  assert.equal(c1, c2, "switching tabs on the same channel page is the same visit");
});

test("overlayKey changes with the video or the verdict", () => {
  const a = rules.overlayKey("blacklisted", "watch", BLACK, "https://www.youtube.com/watch?v=aaaaaaaaaaa");
  assert.notEqual(a, rules.overlayKey("blacklisted", "watch", BLACK, "https://www.youtube.com/watch?v=bbbbbbbbbbb"));
  assert.notEqual(a, rules.overlayKey("checking", "watch", null, "https://www.youtube.com/watch?v=aaaaaaaaaaa"));
});

test("pageKind: /clip/ is a watch page, /embed/ and /v/ are embedded players", () => {
  assert.equal(rules.pageKind("/clip/UgkxAbc"), "watch");
  assert.equal(rules.pageKind("/embed/abc123"), "embed");
  assert.equal(rules.pageKind("/v/abc123"), "embed");
});

test("pageVerdict blocks a youtube.com embedded player opened as a page", () => {
  assert.equal(rules.pageVerdict("embed", null, state), "block");
  assert.equal(rules.pageVerdict("embed", null, off), "none");
});

test("watchChannelReady: only trust the owner block once it belongs to the URL's video", () => {
  assert.equal(rules.watchChannelReady("https://www.youtube.com/watch?v=new", "new"), true);
  assert.equal(rules.watchChannelReady("https://www.youtube.com/watch?v=new", "old"), false, "metadata of the previous video");
  assert.equal(rules.watchChannelReady("https://www.youtube.com/watch?v=new", null), false);
  assert.equal(rules.watchChannelReady("https://www.youtube.com/live/abc", "abc"), true);
  assert.equal(rules.watchChannelReady("https://www.youtube.com/clip/Ugkx", "vid"), true, "clip URLs carry no video id");
});

test("hide.css hides every tile type listed in TILE_SELECTOR, and the miniplayer", () => {
  const css = require("node:fs").readFileSync(require("node:path").join(__dirname, "../content/hide.css"), "utf8");
  for (const sel of rules.TILE_SELECTOR.split(",")) assert.ok(css.includes(sel), `hide.css is missing ${sel}`);
  assert.match(css, /ytd-miniplayer/);
});
