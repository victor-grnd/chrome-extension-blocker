# Brainrot Blocker V1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A Manifest V3 browser extension (Brave/Chrome) that runs YouTube in allow-only mode: only allowlisted channels are visible/watchable, blacklisted channels trigger escalating roasts, and disabling the extension or un-blacklisting a channel requires 100,000 clicks.

**Architecture:** Plain JS, no build. Pure logic lives in small files that register on a global `BB` namespace (for the browser) and also `module.exports` (for `node --test`). A content script injected at `document_start` hides every video tile by CSS, then reveals tiles of allowed channels and covers non-allowed watch/channel pages with a blocking overlay. A popup (3 tabs + ON/OFF switch) manages lists, the 100k-click square, roasts and SVG stats. State lives in `chrome.storage.local`.

**Tech Stack:** Manifest V3, vanilla JS (ES2022), CSS, `chrome.storage.local`, Node 26 built-in test runner (`node --test`) — zero npm dependencies.

**Spec:** `docs/superpowers/specs/2026-10-04-youtube-allow-only-design.md`

## Global Constraints

- Manifest V3, plain JavaScript, **no framework, no bundler, no build step, no npm dependencies** (Node is only used to run `node --test`).
- Permissions: exactly `"storage"` + host permission `"https://www.youtube.com/*"`. No `tabs`, no service worker.
- Every shared file uses the same wrapper: registers on `globalThis.BB.<name>` and, when `module` exists, sets `module.exports`.
- **Fail closed:** when a channel cannot be identified, hide the tile / cover the page.
- Clicker: goal `100000`, at most 1 counted click per `100` ms, only `event.isTrusted` clicks, square moves every `500` counted clicks, roast changes every `100` counted clicks, progress never persisted.
- Roast levels from today's attempt count: `1` → level 1, `2–3` → 2, `4–6` → 3, `7+` → 4.
- Removing from the allowlist is instant; removing from the blacklist and switching OFF require the clicker.
- All user-facing text in **French**. Code identifiers and comments in English.
- Commit messages in **English**, ending with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. **Commit and push to `origin main` at the end of every task.**
- Run tests with `npm test` (which runs `node --test`) from the repo root.

## Review Focus

1. **YouTube recycles tile DOM nodes** (the same `ytd-rich-item-renderer` shows a different video after scroll/navigation) → visibility must be recomputed from the tile's *current* channel link every scan, never cached. Pinned by `applyTiles re-evaluates a recycled tile` in Task 6.
2. **Handles pasted with invisible Unicode/bidi marks, URLs or mixed case** (Victor's list contained `@Matis_cl⁩`, `‎⁨@Arthur…`) → all normalize to the same lowercase handle. Pinned by `normalizeHandle strips invisible characters` in Task 1.
3. **Non-latin / percent-encoded handles in links** (`/@%E3%82%80%E3%81%8E`) → decoded so they match stored handles. Pinned by `parseChannelHref decodes percent-encoded handles` in Task 1.
4. **Watch page whose channel is not identified yet** (SPA navigation, owner block not rendered) → page stays covered ("checking"), video never shown. Pinned by `pageVerdict fails closed` in Task 6.
5. **Attempts around local midnight** → "today" counter and daily bars reset at local midnight, not UTC. Pinned by `attemptsToday resets at local midnight` (Task 2) and `dailyCounts buckets by local day` (Task 5).

---

## File Structure

```
package.json            "npm test" → node --test (no dependencies)
manifest.json           MV3 manifest
data/defaults.js        default allow/block lists (resolved UC… IDs)          → BB.defaults
shared/channel.js       handle/href/page parsing, resolve via fetch, sameChannel → BB.channel
shared/storage.js       pure state transitions + chrome.storage load/save      → BB.store
shared/roasts.js        roast messages + level selection                      → BB.roasts
shared/clicker.js       100k counter (pure) + DOM mount                       → BB.clicker
shared/charts.js        daily buckets, history series, SVG line/bar charts    → BB.charts
content/rules.js        pure page/tile rules                                  → BB.rules
content/hide.css        hide tiles by default, hide Shorts, overlay styles
content/youtube.js      DOM wiring on YouTube (scan, overlay, messages)
popup/popup.html        popup markup
popup/popup.css         popup styles (light/dark)
popup/popup.js          popup logic
tests/*.test.js         node:test suites for every shared/ and content/rules.js file
README.md               install + usage
```

---

### Task 1: Channel parsing and resolution (`shared/channel.js`)

**Files:**
- Create: `package.json`
- Create: `shared/channel.js`
- Test: `tests/channel.test.js`

**Interfaces:**
- Consumes: nothing.
- Produces (`BB.channel` / `require("../shared/channel.js")`):
  - `normalizeHandle(input: string) → string | null` — `"@lowercase"` or `null` if invalid.
  - `isChannelId(s: string) → boolean` — matches `UC` + 22 chars `[A-Za-z0-9_-]`.
  - `parseChannelHref(href: string) → { id: string|null, handle: string|null } | null`
  - `parseChannelPage(html: string) → { id: string, handle: string|null, name: string } | null`
  - `resolveHandle(input: string, fetchFn?) → Promise<{ id, handle, name }>` — rejects with French `Error` messages.
  - `resolveId(id: string, fetchFn?) → Promise<{ id, handle, name }>`
  - `sameChannel(a, b) → boolean` — ids compared when both present, else handles.

- [ ] **Step 1: Create `package.json`**

```json
{
  "name": "brainrot-blocker",
  "version": "0.1.0",
  "private": true,
  "description": "YouTube allow-only channel blocker (browser extension)",
  "scripts": {
    "test": "node --test"
  }
}
```

- [ ] **Step 2: Write the failing tests** — `tests/channel.test.js`

```js
const test = require("node:test");
const assert = require("node:assert/strict");
const channel = require("../shared/channel.js");

const ID_ASHTAX = "UC1q7LRamyojZuAbhsBWWgAA";

test("normalizeHandle lowercases and adds @", () => {
  assert.equal(channel.normalizeHandle("Shubham_Sharma"), "@shubham_sharma");
  assert.equal(channel.normalizeHandle("@TED"), "@ted");
  assert.equal(channel.normalizeHandle("  @Sebastien.selfmadeprogram  "), "@sebastien.selfmadeprogram");
});

test("normalizeHandle strips invisible characters", () => {
  assert.equal(channel.normalizeHandle("@Matis_cl⁩"), "@matis_cl");
  assert.equal(channel.normalizeHandle("‎⁨@ArthurFmv"), "@arthurfmv");
  assert.equal(channel.normalizeHandle("﻿@Notion​"), "@notion");
});

test("normalizeHandle accepts channel URLs", () => {
  assert.equal(channel.normalizeHandle("https://www.youtube.com/@TED/videos"), "@ted");
  assert.equal(channel.normalizeHandle("youtube.com/@LeoDuff?si=abc"), "@leoduff");
});

test("normalizeHandle rejects invalid input", () => {
  assert.equal(channel.normalizeHandle(""), null);
  assert.equal(channel.normalizeHandle("@has space"), null);
  assert.equal(channel.normalizeHandle(null), null);
  assert.equal(channel.normalizeHandle(42), null);
});

test("isChannelId", () => {
  assert.equal(channel.isChannelId(ID_ASHTAX), true);
  assert.equal(channel.isChannelId("UC123"), false);
  assert.equal(channel.isChannelId("@ashtax"), false);
});

test("parseChannelHref handles /@handle paths and URLs", () => {
  assert.deepEqual(channel.parseChannelHref("/@Ashtax"), { id: null, handle: "@ashtax" });
  assert.deepEqual(channel.parseChannelHref("/@Ashtax/videos"), { id: null, handle: "@ashtax" });
  assert.deepEqual(channel.parseChannelHref("https://www.youtube.com/@Ashtax"), { id: null, handle: "@ashtax" });
});

test("parseChannelHref handles /channel/UC… paths", () => {
  assert.deepEqual(channel.parseChannelHref(`/channel/${ID_ASHTAX}`), { id: ID_ASHTAX, handle: null });
  assert.deepEqual(channel.parseChannelHref(`https://www.youtube.com/channel/${ID_ASHTAX}/featured`), { id: ID_ASHTAX, handle: null });
});

test("parseChannelHref decodes percent-encoded handles", () => {
  assert.deepEqual(channel.parseChannelHref("/@%E3%82%80%E3%81%8E"), { id: null, handle: "@むぎ" });
});

test("parseChannelHref returns null for non-channel links", () => {
  assert.equal(channel.parseChannelHref("/watch?v=abc123"), null);
  assert.equal(channel.parseChannelHref("/c/SomeLegacyName"), null);
  assert.equal(channel.parseChannelHref("/channel/UCshort"), null);
  assert.equal(channel.parseChannelHref(undefined), null);
});

const PAGE = `<html><head><meta property="og:title" content="Ouah Leouff &amp; Co"></head>
<script>var x = {"externalId":"UCvcVcuOdDtu0UCV-YcfUgHA","vanityChannelUrl":"http://www.youtube.com/@OuahLeouff"};</script></html>`;

test("parseChannelPage extracts id, canonical handle and name", () => {
  assert.deepEqual(channel.parseChannelPage(PAGE), {
    id: "UCvcVcuOdDtu0UCV-YcfUgHA",
    handle: "@ouahleouff",
    name: "Ouah Leouff & Co",
  });
});

test("parseChannelPage returns null without externalId", () => {
  assert.equal(channel.parseChannelPage("<html>consent page</html>"), null);
});

function fakeFetch(map) {
  return async (url) => {
    if (map[url] instanceof Error) throw map[url];
    if (!(url in map)) return { ok: false, status: 404, text: async () => "" };
    return { ok: true, status: 200, text: async () => map[url] };
  };
}

test("resolveHandle fetches the channel page", async () => {
  const f = fakeFetch({ "https://www.youtube.com/@ouahleouff": PAGE });
  assert.deepEqual(await channel.resolveHandle("@OuahLeouff", f), {
    id: "UCvcVcuOdDtu0UCV-YcfUgHA",
    handle: "@ouahleouff",
    name: "Ouah Leouff & Co",
  });
});

test("resolveHandle keeps the typed handle when the page has no vanity URL", async () => {
  const page = `<meta property="og:title" content="TED">{"externalId":"UCAuUUnT6oDeKwE6v1NGQxug"}`;
  const f = fakeFetch({ "https://www.youtube.com/@ted": page });
  assert.deepEqual(await channel.resolveHandle("TED", f), { id: "UCAuUUnT6oDeKwE6v1NGQxug", handle: "@ted", name: "TED" });
});

test("resolveHandle rejects unknown, unreachable and invalid handles", async () => {
  await assert.rejects(channel.resolveHandle("@nope", fakeFetch({})), /introuvable/);
  await assert.rejects(
    channel.resolveHandle("@ted", fakeFetch({ "https://www.youtube.com/@ted": new Error("offline") })),
    /joindre YouTube/
  );
  await assert.rejects(channel.resolveHandle("@has space", fakeFetch({})), /invalide/);
});

test("resolveId fetches /channel/UC…", async () => {
  const f = fakeFetch({ "https://www.youtube.com/channel/UCvcVcuOdDtu0UCV-YcfUgHA": PAGE });
  const res = await channel.resolveId("UCvcVcuOdDtu0UCV-YcfUgHA", f);
  assert.equal(res.handle, "@ouahleouff");
  await assert.rejects(channel.resolveId("UCbad", f), /invalide/);
});

test("sameChannel compares ids first, then handles", () => {
  assert.equal(channel.sameChannel({ id: ID_ASHTAX, handle: "@a" }, { id: ID_ASHTAX, handle: "@b" }), true);
  assert.equal(channel.sameChannel({ id: ID_ASHTAX, handle: "@a" }, { id: "UCvcVcuOdDtu0UCV-YcfUgHA", handle: "@a" }), false);
  assert.equal(channel.sameChannel({ id: ID_ASHTAX, handle: "@ashtax" }, { id: null, handle: "@ashtax" }), true);
  assert.equal(channel.sameChannel({ id: null, handle: null }, { id: null, handle: null }), false);
  assert.equal(channel.sameChannel(null, { id: ID_ASHTAX }), false);
});
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `npm test`
Expected: FAIL with `Cannot find module '../shared/channel.js'`.

- [ ] **Step 4: Implement `shared/channel.js`**

```js
// Channel identity helpers: handles (@name), channel IDs (UC…), link and page parsing.
(function (root) {
  "use strict";

  // Zero-width and bidi control characters that sneak in when copy-pasting handles.
  const INVISIBLE = /[​-‏‪-‮⁦-⁩﻿]/g;
  const HANDLE_RE = /^@[\p{L}\p{N}._-]{1,100}$/u;
  const ID_RE = /^UC[\w-]{22}$/;

  // "@Matis_cl⁩", "matis_cl", "https://www.youtube.com/@Matis_cl/videos" -> "@matis_cl"
  function normalizeHandle(input) {
    if (typeof input !== "string") return null;
    let s = input.trim();
    const fromUrl = s.match(/youtube\.com\/(@[^/?#\s]+)/i);
    if (fromUrl) s = fromUrl[1];
    try {
      s = decodeURIComponent(s);
    } catch (_) {
      // keep the raw string if it is not valid percent-encoding
    }
    s = s.replace(INVISIBLE, "").trim();
    if (!s.startsWith("@")) s = "@" + s;
    s = s.toLowerCase();
    return HANDLE_RE.test(s) ? s : null;
  }

  function isChannelId(s) {
    return typeof s === "string" && ID_RE.test(s);
  }

  // Link href or pathname -> { id, handle } (one of them null), or null if not a channel link.
  function parseChannelHref(href) {
    if (typeof href !== "string") return null;
    let path;
    try {
      path = new URL(href, "https://www.youtube.com").pathname;
    } catch (_) {
      return null;
    }
    const idMatch = path.match(/^\/channel\/(UC[\w-]{22})(?:\/|$)/);
    if (idMatch) return { id: idMatch[1], handle: null };
    const handleMatch = path.match(/^\/(@[^/]+)(?:\/|$)/);
    if (handleMatch) {
      const handle = normalizeHandle(handleMatch[1]);
      return handle ? { id: null, handle } : null;
    }
    return null;
  }

  function decodeEntities(s) {
    // &amp; last, so "&amp;lt;" becomes "&lt;" and not "<"
    return s
      .replace(/&#39;/g, "'")
      .replace(/&quot;/g, '"')
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&amp;/g, "&");
  }

  // HTML of a channel page -> { id, handle, name } or null.
  function parseChannelPage(html) {
    if (typeof html !== "string") return null;
    const id = (html.match(/"externalId":"(UC[\w-]{22})"/) || [])[1];
    if (!id) return null;
    const rawName = (html.match(/<meta property="og:title" content="([^"]*)"/) || [])[1] || "";
    const vanity = (html.match(/"vanityChannelUrl":"https?:\/\/www\.youtube\.com\/(@[^"]+)"/) || [])[1];
    return { id, handle: vanity ? normalizeHandle(vanity) : null, name: decodeEntities(rawName).trim() };
  }

  async function fetchChannel(path, label, fetchFn) {
    const doFetch = fetchFn || root.fetch.bind(root);
    let res;
    try {
      res = await doFetch("https://www.youtube.com" + path);
    } catch (_) {
      throw new Error("Impossible de joindre YouTube");
    }
    if (!res.ok) throw new Error("Chaîne introuvable : " + label);
    const parsed = parseChannelPage(await res.text());
    if (!parsed) throw new Error("Chaîne introuvable : " + label);
    return parsed;
  }

  async function resolveHandle(input, fetchFn) {
    const handle = normalizeHandle(input);
    if (!handle) throw new Error("Handle invalide : " + input);
    const parsed = await fetchChannel("/" + encodeURI(handle), handle, fetchFn);
    return { id: parsed.id, handle: parsed.handle || handle, name: parsed.name || handle };
  }

  async function resolveId(id, fetchFn) {
    if (!isChannelId(id)) throw new Error("ID de chaîne invalide : " + id);
    const parsed = await fetchChannel("/channel/" + id, id, fetchFn);
    return { id: parsed.id, handle: parsed.handle, name: parsed.name || id };
  }

  function sameChannel(a, b) {
    if (!a || !b) return false;
    if (a.id && b.id) return a.id === b.id;
    return Boolean(a.handle && b.handle && a.handle === b.handle);
  }

  const api = { normalizeHandle, isChannelId, parseChannelHref, parseChannelPage, resolveHandle, resolveId, sameChannel };
  root.BB = root.BB || {};
  root.BB.channel = api;
  if (typeof module === "object" && module.exports) module.exports = api;
})(globalThis);
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npm test`
Expected: all `channel.test.js` tests PASS.

- [ ] **Step 6: Commit and push**

```bash
git add package.json shared/channel.js tests/channel.test.js
git commit -m "feat: add channel handle/ID parsing and resolution" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
git push
```

---

### Task 2: Default lists and state logic (`data/defaults.js`, `shared/storage.js`)

**Files:**
- Create: `data/defaults.js`
- Create: `shared/storage.js`
- Test: `tests/storage.test.js`

**Interfaces:**
- Consumes: `channel.sameChannel`, `channel.isChannelId`, `channel.normalizeHandle` (Task 1).
- Produces:
  - `BB.defaults` / `require("../data/defaults.js")` → `{ allow: Channel[], block: Channel[] }` where `Channel = { id, handle, name }`.
  - `BB.store` / `require("../shared/storage.js")`:
    - `KEYS = ["enabled", "allow", "block", "attempts", "history"]`
    - `createInitialState(defaults, now) → State` (`State = { enabled, allow, block, attempts, history }`, entries get `addedAt: null`)
    - `findIn(list, ch) → entry | undefined`
    - `statusOf(state, ch) → "allowed" | "blocked" | "blacklisted"`
    - `addChannel(state, listName: "allow"|"block", ch, now) → { state, result: "added"|"duplicate"|"refused" }`
    - `removeChannel(state, listName, ch, now) → State` (same object if nothing removed)
    - `logAttempt(state, type: "off"|"allowBlocked"|"unblock"|"visitBlocked", now) → State`
    - `startOfDay(now) → number` (local midnight timestamp)
    - `attemptsToday(state, now) → number`
    - `load() → Promise<State>` (initializes storage from `BB.defaults` on first run)
    - `save(state, keys: string[]) → Promise<void>` (writes only those keys)
  - All transition functions are pure: they never mutate their input.

- [ ] **Step 1: Write `data/defaults.js`** (IDs resolved from youtube.com on 2026-10-04)

```js
// Default lists installed on first run. IDs resolved from youtube.com on 2026-10-04.
(function (root) {
  "use strict";

  const defaults = {
    allow: [
      { id: "UCE_M8A5yxnLfW0KghEeajjw", handle: "@apple", name: "Apple" },
      { id: "UCkB6qN-IeFNsBSj1aT7yZnQ", handle: "@matis_cl", name: "Matis Clouet" },
      { id: "UCvkyo1Q0B-l9e_4yBY4UEYw", handle: "@arthurfmv", name: "Arthur" },
      { id: "UCR9ioNT5pWkzKw9BcRe5DiQ", handle: "@arthursansfiltre", name: "ArthurSansFiltre" },
      { id: "UC8lpl3qqR5sqLQhtimtQ0Gg", handle: "@enzomahoudeaux", name: "Enzo Mahoudeaux" },
      { id: "UCR0_xCL9YguqHQoEhZPV3hw", handle: "@sebastien.selfmadeprogram", name: "Self-Made Program | Sébastien" },
      { id: "UCLKx4-_XO5sR0AO0j8ye7zQ", handle: "@shubham_sharma", name: "Shubham SHARMA" },
      { id: "UCKkhgJUqG-HzD13m726-4ww", handle: "@theodrcn", name: "Théodrcn" },
      { id: "UC-EWUG269UNvB2LI78bh54w", handle: "@taysthetic", name: "taysthetic." },
      { id: "UC5Dv8i_vH5M9rB3HOZDCkng", handle: "@benheath", name: "Ben Heath" },
      { id: "UCoSvlWS5XcwaSzIcbuJ-Ysg", handle: "@notion", name: "Notion" },
      { id: "UCC27NaAvcjgwJUxC7dfbU8w", handle: "@lucid_life01", name: "Lucid Life" },
      { id: "UCJoLShltMmdcYh7O4jikOgg", handle: "@lucas_hof", name: "Lucas Hof" },
      { id: "UCvxOHcznnavyowy2WZkMOzQ", handle: "@julienopal", name: "OPAL" },
      { id: "UCAuUUnT6oDeKwE6v1NGQxug", handle: "@ted", name: "TED" },
      { id: "UCwkGQN1N7gncsUA6HltXGpA", handle: "@mickaelwu", name: "Mickaël Wu" },
      { id: "UCV03SRZXJEz-hchIAogeJOg", handle: "@claude", name: "Claude" },
      { id: "UCDgUAAHgsV2fFZQm2fIWBnA", handle: "@princeea", name: "Prince Ea" },
      { id: "UCUlBCcvwXAKKskj3h5n6ziw", handle: "@anthonybourbon1", name: "Anthony Bourbon ⚔️" },
      { id: "UCeNCdeGR9dLrc5kAsAeSKsw", handle: "@landonlimited", name: "LANDON" },
      { id: "UCtiMtERGs1XBNdmrwSW5lIA", handle: "@photoroom", name: "Photoroom" },
      { id: "UCEM2sO7E5KSMIqonVgb98ug", handle: "@maxwellcopy", name: "Max Sturtevant" },
      { id: "UCtSNggS2fln1-a9FVL13g4g", handle: "@jokariz6803", name: "Jokariz" },
      { id: "UCAY5rwrIePDzurGeCo2qRBA", handle: "@bigslaay", name: "Bigslaay" },
      { id: "UChlTcWDE8gd4tsl_L727NrQ", handle: "@hasheur", name: "Hasheur" },
      { id: "UCNiauGTV7XhkOpUAIXod4xA", handle: "@leoduff", name: "Léo Duff" },
    ],
    block: [
      // Entertainment
      { id: "UCyWqModMQlbIo8274Wh_ZsQ", handle: "@cyprien", name: "Cyprien" },
      { id: "UCTt2AnK--mnRmICnf-CCcrw", handle: "@superkevintran", name: "Kevin Tran 陈科伟" },
      { id: "UCYD22MFqaNqXp-ogTMosW_A", handle: "@superkevintranlempereur", name: "Kevin Tran L'Empereur" },
      { id: "UC3DVTbnJNVFbDq1gVLVFdvw", handle: "@henrytran", name: "Henry Tran" },
      { id: "UC5HDIVwuqoIuKKw-WbQ4CvA", handle: "@melvynxdev", name: "Melvynx" },
      // Clash Royale FR
      { id: "UC1q7LRamyojZuAbhsBWWgAA", handle: "@ashtax", name: "Ashtax" },
      { id: "UCvcVcuOdDtu0UCV-YcfUgHA", handle: "@ouahleouff", name: "Ouah Leouff" },
      { id: "UC3xgl_-XSyRjv8C_P4ZX0Zg", handle: "@trapacoc", name: "Trapa" },
      { id: "UCjFrTvMA5zvCnb9EAX9MNVw", handle: "@mohamedlight4980", name: "Mohamed Light" },
      // Clash Royale official / EN / pros
      { id: "UC_F8DoJf9MZogEOU51TpTbQ", handle: "@clashroyale", name: "Clash Royale" },
      { id: "UCL9wK9vQjmgyx7jGt20ZOkg", handle: "@esportsroyale", name: "Clash Royale Esports" },
      { id: "UC3S6nIDGJ5OtpC-mbvFA8Ew", handle: "@orangejuice", name: "Orange Juice Gaming" },
      { id: "UCxNMYToYIBPYV829BJcmUQg", handle: "@chiefpat", name: "Chief Pat" },
      { id: "UCpk3zQzLnN5WwcA8gRcPgiw", handle: "@molt", name: "MOLT" },
      { id: "UCT2x1vuvgYdhk-kQdlzn6yA", handle: "@clashwithcam", name: "Clash with Cam" },
      { id: "UCMYdLBEudBeU-c0AguEaiHA", handle: "@bentimm1", name: "BenTimm1" },
      { id: "UCLAOdac7WmMXQKhOP-8lmrQ", handle: "@eclihpse", name: "Eclihpse" },
      { id: "UCFaV5im11vfhDs1BaaF9a0A", handle: "@surgicalgoblin", name: "Surgical Goblin" },
      { id: "UCn2AA9OCYnZZ1T82RaGUYPw", handle: "@mortenroyale", name: "mortenroyale" },
      { id: "UCraJG1NiZLjNDBQLhUZqWAg", handle: "@ian77-clashroyale", name: "Ian77 - Clash Royale" },
      { id: "UCAw2ZHAIP177ryD3WF9iXmw", handle: "@ryleycr1", name: "Ryley - Clash Royale" },
      { id: "UCe2TWF-BqZUqzEz3dHaYa8g", handle: "@oyassuucr", name: "OYASSUU" },
      { id: "UClWUQjL966gilJUUHBZ5-4g", handle: "@mugi_cr", name: "むぎ" },
      { id: "UCo3ixhcZiwcmwVnqJlFJ2Iw", handle: "@bradcr", name: "B-rad" },
      { id: "UCvje1_OaZUZVZDzxeyOFf6A", handle: "@sirtagcr", name: "SirTagCR - Clash Royale" },
      { id: "UC85aYbNSFjsJdxfpxgQr8tA", handle: "@judosloth", name: "Judo Sloth Gaming" },
      { id: "UCmG2EhfOwSjpPMX4LjGY__A", handle: "@kairosgaming", name: "KairosTime Gaming" },
      { id: "UCjiXtODGCCulmhwypZAWSag", handle: "@jynxzi", name: "Jynxzi" },
    ],
  };

  root.BB = root.BB || {};
  root.BB.defaults = defaults;
  if (typeof module === "object" && module.exports) module.exports = defaults;
})(globalThis);
```

- [ ] **Step 2: Write the failing tests** — `tests/storage.test.js`

```js
const test = require("node:test");
const assert = require("node:assert/strict");
const channel = require("../shared/channel.js");
const defaults = require("../data/defaults.js");
const store = require("../shared/storage.js");

const NOW = new Date(2026, 9, 4, 15, 0).getTime(); // 4 Oct 2026 15:00 local
const A = { id: "UCE_M8A5yxnLfW0KghEeajjw", handle: "@apple", name: "Apple" };
const B = { id: "UCyWqModMQlbIo8274Wh_ZsQ", handle: "@cyprien", name: "Cyprien" };
const C = { id: "UCAuUUnT6oDeKwE6v1NGQxug", handle: "@ted", name: "TED" };

function baseState() {
  return store.createInitialState({ allow: [A], block: [B] }, NOW);
}

test("defaults: valid ids, normalized handles, no duplicates, no overlap", () => {
  const all = [...defaults.allow, ...defaults.block];
  for (const ch of all) {
    assert.ok(channel.isChannelId(ch.id), `bad id for ${ch.name}`);
    assert.equal(channel.normalizeHandle(ch.handle), ch.handle, `handle not normalized: ${ch.handle}`);
    assert.ok(ch.name.length > 0);
  }
  const ids = all.map((c) => c.id);
  assert.equal(new Set(ids).size, ids.length, "duplicate channel in defaults");
  assert.equal(defaults.allow.length, 26);
  assert.equal(defaults.block.length, 28);
});

test("createInitialState", () => {
  const s = store.createInitialState(defaults, NOW);
  assert.equal(s.enabled, true);
  assert.equal(s.allow.length, 26);
  assert.equal(s.block.length, 28);
  assert.deepEqual(s.attempts, []);
  assert.deepEqual(s.history, [{ at: NOW, allow: 26, block: 28 }]);
  assert.equal(s.allow[0].addedAt, null);
});

test("statusOf", () => {
  const s = baseState();
  assert.equal(store.statusOf(s, A), "allowed");
  assert.equal(store.statusOf(s, { id: null, handle: "@cyprien" }), "blacklisted");
  assert.equal(store.statusOf(s, C), "blocked");
});

test("addChannel to allow", () => {
  const s = baseState();
  const { state, result } = store.addChannel(s, "allow", C, NOW + 1);
  assert.equal(result, "added");
  assert.equal(state.allow.length, 2);
  assert.deepEqual(state.allow[1], { ...C, addedAt: NOW + 1 });
  assert.deepEqual(state.history.at(-1), { at: NOW + 1, allow: 2, block: 1 });
  assert.equal(s.allow.length, 1, "input state must not be mutated");
});

test("addChannel duplicate and refused", () => {
  const s = baseState();
  assert.equal(store.addChannel(s, "allow", A, NOW).result, "duplicate");
  const refused = store.addChannel(s, "allow", B, NOW);
  assert.equal(refused.result, "refused");
  assert.equal(refused.state, s);
});

test("addChannel to block moves the channel out of the allowlist", () => {
  const s = baseState();
  const { state, result } = store.addChannel(s, "block", A, NOW + 5);
  assert.equal(result, "added");
  assert.equal(state.allow.length, 0);
  assert.equal(state.block.length, 2);
  assert.deepEqual(state.history.at(-1), { at: NOW + 5, allow: 0, block: 2 });
});

test("removeChannel", () => {
  const s = baseState();
  const next = store.removeChannel(s, "allow", A, NOW + 9);
  assert.equal(next.allow.length, 0);
  assert.deepEqual(next.history.at(-1), { at: NOW + 9, allow: 0, block: 1 });
  assert.equal(store.removeChannel(s, "allow", C, NOW), s, "no-op returns same state");
});

test("logAttempt", () => {
  const s = store.logAttempt(baseState(), "off", NOW);
  assert.deepEqual(s.attempts, [{ type: "off", at: NOW }]);
});

test("attemptsToday resets at local midnight", () => {
  const lateYesterday = new Date(2026, 9, 3, 23, 59).getTime();
  const earlyToday = new Date(2026, 9, 4, 0, 1).getTime();
  let s = baseState();
  s = store.logAttempt(s, "off", lateYesterday);
  s = store.logAttempt(s, "unblock", earlyToday);
  assert.equal(store.attemptsToday(s, NOW), 1);
  assert.equal(store.startOfDay(NOW), new Date(2026, 9, 4, 0, 0).getTime());
});
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `npm test`
Expected: FAIL with `Cannot find module '../shared/storage.js'`.

- [ ] **Step 4: Implement `shared/storage.js`**

```js
// Extension state: pure transitions (testable) + chrome.storage.local load/save.
(function (root) {
  "use strict";

  const isNode = typeof module === "object" && module.exports;
  const channel = isNode ? require("./channel.js") : root.BB.channel;

  const KEYS = ["enabled", "allow", "block", "attempts", "history"];

  function createInitialState(defaults, now) {
    // addedAt: null so defaults don't count as "added this week" in stats
    const stamp = (c) => ({ id: c.id, handle: c.handle, name: c.name, addedAt: null });
    const allow = defaults.allow.map(stamp);
    const block = defaults.block.map(stamp);
    return {
      enabled: true,
      allow,
      block,
      attempts: [],
      history: [{ at: now, allow: allow.length, block: block.length }],
    };
  }

  function findIn(list, ch) {
    return list.find((entry) => channel.sameChannel(entry, ch));
  }

  function statusOf(state, ch) {
    if (findIn(state.block, ch)) return "blacklisted";
    if (findIn(state.allow, ch)) return "allowed";
    return "blocked";
  }

  function withSnapshot(state, now) {
    return { ...state, history: state.history.concat({ at: now, allow: state.allow.length, block: state.block.length }) };
  }

  function addChannel(state, listName, ch, now) {
    if (findIn(state[listName], ch)) return { state, result: "duplicate" };
    if (listName === "allow" && findIn(state.block, ch)) return { state, result: "refused" };
    const entry = { id: ch.id || null, handle: ch.handle || null, name: ch.name || ch.handle || ch.id, addedAt: now };
    const next = { ...state };
    if (listName === "block") {
      next.allow = state.allow.filter((e) => !channel.sameChannel(e, ch));
      next.block = state.block.concat(entry);
    } else {
      next.allow = state.allow.concat(entry);
    }
    return { state: withSnapshot(next, now), result: "added" };
  }

  function removeChannel(state, listName, ch, now) {
    const filtered = state[listName].filter((e) => !channel.sameChannel(e, ch));
    if (filtered.length === state[listName].length) return state;
    return withSnapshot({ ...state, [listName]: filtered }, now);
  }

  function logAttempt(state, type, now) {
    return { ...state, attempts: state.attempts.concat({ type, at: now }) };
  }

  function startOfDay(now) {
    const d = new Date(now);
    d.setHours(0, 0, 0, 0);
    return d.getTime();
  }

  function attemptsToday(state, now) {
    const start = startOfDay(now);
    return state.attempts.filter((a) => a.at >= start && a.at <= now).length;
  }

  async function load() {
    const data = await chrome.storage.local.get(KEYS);
    if (Array.isArray(data.allow)) {
      return {
        enabled: data.enabled !== false,
        allow: data.allow,
        block: data.block || [],
        attempts: data.attempts || [],
        history: data.history || [],
      };
    }
    const initial = createInitialState(root.BB.defaults, Date.now());
    await chrome.storage.local.set(initial);
    return initial;
  }

  // Writes only the given keys, so the popup and the content script don't overwrite each other's changes.
  function save(state, keys) {
    const patch = {};
    for (const k of keys) patch[k] = state[k];
    return chrome.storage.local.set(patch);
  }

  const api = {
    KEYS,
    createInitialState,
    findIn,
    statusOf,
    addChannel,
    removeChannel,
    logAttempt,
    startOfDay,
    attemptsToday,
    load,
    save,
  };
  root.BB = root.BB || {};
  root.BB.store = api;
  if (isNode) module.exports = api;
})(globalThis);
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npm test`
Expected: all tests PASS (channel + storage).

- [ ] **Step 6: Commit and push**

```bash
git add data/defaults.js shared/storage.js tests/storage.test.js
git commit -m "feat: add default channel lists and state transitions" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
git push
```

---

### Task 3: Roasts (`shared/roasts.js`)

**Files:**
- Create: `shared/roasts.js`
- Test: `tests/roasts.test.js`

**Interfaces:**
- Consumes: nothing.
- Produces (`BB.roasts`):
  - `ROASTS: { 1: string[], 2: string[], 3: string[], 4: string[] }`
  - `levelFor(count: number) → 1|2|3|4`
  - `pickRoast(count: number, rand?: () => number) → string`
  - `attemptLabel(count: number) → string` — `"Tentative n°X aujourd'hui"`

- [ ] **Step 1: Write the failing tests** — `tests/roasts.test.js`

```js
const test = require("node:test");
const assert = require("node:assert/strict");
const roasts = require("../shared/roasts.js");

test("levelFor boundaries", () => {
  assert.equal(roasts.levelFor(0), 1);
  assert.equal(roasts.levelFor(1), 1);
  assert.equal(roasts.levelFor(2), 2);
  assert.equal(roasts.levelFor(3), 2);
  assert.equal(roasts.levelFor(4), 3);
  assert.equal(roasts.levelFor(6), 3);
  assert.equal(roasts.levelFor(7), 4);
  assert.equal(roasts.levelFor(500), 4);
});

test("every level has at least 5 messages", () => {
  for (const level of [1, 2, 3, 4]) assert.ok(roasts.ROASTS[level].length >= 5, `level ${level}`);
});

test("pickRoast picks from the right level", () => {
  assert.equal(roasts.pickRoast(1, () => 0), roasts.ROASTS[1][0]);
  assert.equal(roasts.pickRoast(5, () => 0.999), roasts.ROASTS[3].at(-1));
  assert.ok(roasts.ROASTS[4].includes(roasts.pickRoast(12)));
});

test("attemptLabel", () => {
  assert.equal(roasts.attemptLabel(3), "Tentative n°3 aujourd'hui");
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test`
Expected: FAIL with `Cannot find module '../shared/roasts.js'`.

- [ ] **Step 3: Implement `shared/roasts.js`**

```js
// Roast messages, escalating with the number of cheating attempts today.
(function (root) {
  "use strict";

  const ROASTS = {
    1: [
      "Non. Retourne bosser.",
      "Tu sais très bien pourquoi tu as installé cette extension.",
      "Ferme cet onglet et ouvre ton éditeur de code.",
      "Pas aujourd'hui. Au travail.",
      "Ton futur toi te regarde. Il est déçu.",
    ],
    2: [
      "Encore toi ? T'as vraiment rien de mieux à faire ?",
      "Ah oui, la petite vidéo « juste 5 minutes ». On connaît la chanson.",
      "Bravo, tu viens de perdre 30 secondes. Tu veux en perdre 3 heures ?",
      "L'algo siffle et tu accours. Bon toutou.",
      "Ton compte en banque ne te remercie pas pour cette pause.",
    ],
    3: [
      "Sérieusement ? Tes concurrents bossent pendant que tu cherches du divertissement.",
      "Chaque clic ici, c'est un projet que tu ne finiras jamais.",
      "T'as la discipline d'un poisson rouge sous caféine.",
      "Le brainrot t'appelle et tu décroches à la première sonnerie. Pathétique.",
      "Tu veux vraiment rester « quelqu'un qui avait du potentiel » ? Retourne bosser.",
    ],
    4: [
      "Espèce de grosse merde, retourne travailler au lieu de faire du brainrot comme une sous-merde soumise à l'algo YouTube.",
      "Sous-merde soumise à l'algo, ferme YouTube et va coder.",
      "T'as rien dans le crâne à part des Shorts ? Retourne bosser, grosse merde.",
      "L'algo YouTube a gagné et toi t'as perdu. Grosse merde.",
      "Encore une tentative ? T'es la définition du brainrot. Retourne travailler, sous-merde.",
    ],
  };

  function levelFor(count) {
    if (count >= 7) return 4;
    if (count >= 4) return 3;
    if (count >= 2) return 2;
    return 1;
  }

  function pickRoast(count, rand) {
    const r = typeof rand === "function" ? rand : Math.random;
    const list = ROASTS[levelFor(count)];
    return list[Math.floor(r() * list.length) % list.length];
  }

  function attemptLabel(count) {
    return "Tentative n°" + count + " aujourd'hui";
  }

  const api = { ROASTS, levelFor, pickRoast, attemptLabel };
  root.BB = root.BB || {};
  root.BB.roasts = api;
  if (typeof module === "object" && module.exports) module.exports = api;
})(globalThis);
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test`
Expected: all tests PASS.

- [ ] **Step 5: Commit and push**

```bash
git add shared/roasts.js tests/roasts.test.js
git commit -m "feat: add escalating roast messages" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
git push
```

---

### Task 4: 100k-click square (`shared/clicker.js`)

**Files:**
- Create: `shared/clicker.js`
- Test: `tests/clicker.test.js`

**Interfaces:**
- Consumes: nothing (the DOM part receives `getRoast` as a callback).
- Produces (`BB.clicker`):
  - `createCounter({ goal = 100000, minIntervalMs = 100, moveEvery = 500, roastEvery = 100 }) → { count: number (getter), click(isTrusted: boolean, now: number) → { counted, count, done, move, newRoast } }`
  - `mountClicker(host: Element, { goal, title: string, getRoast: () => string, onSuccess: () => void, onCancel?: () => void }) → destroy: () => void`
  - DOM classes used by `popup/popup.css`: `.bb-clicker`, `.bb-clicker-title`, `.bb-clicker-roast`, `.bb-clicker-arena`, `.bb-clicker-square`, `.bb-clicker-count`, `.bb-clicker-cancel`.

- [ ] **Step 1: Write the failing tests** — `tests/clicker.test.js`

```js
const test = require("node:test");
const assert = require("node:assert/strict");
const { createCounter } = require("../shared/clicker.js");

test("untrusted clicks (scripts) are ignored", () => {
  const c = createCounter({});
  assert.equal(c.click(false, 1000).counted, false);
  assert.equal(c.count, 0);
});

test("rate limit: at most one counted click per 100 ms", () => {
  const c = createCounter({});
  assert.equal(c.click(true, 1000).counted, true);
  assert.equal(c.click(true, 1050).counted, false);
  assert.equal(c.click(true, 1100).counted, true);
  assert.equal(c.count, 2);
});

test("move every 500 and new roast every 100 counted clicks", () => {
  const c = createCounter({});
  let t = 0;
  let last;
  for (let i = 0; i < 500; i++) {
    t += 100;
    last = c.click(true, t);
    if (i === 99) assert.equal(last.newRoast, true);
    if (i === 100) assert.equal(last.newRoast, false);
  }
  assert.equal(last.count, 500);
  assert.equal(last.move, true);
});

test("done at goal, nothing counted after", () => {
  const c = createCounter({ goal: 3 });
  c.click(true, 100);
  c.click(true, 200);
  const r = c.click(true, 300);
  assert.equal(r.done, true);
  const after = c.click(true, 400);
  assert.equal(after.counted, false);
  assert.equal(after.count, 3);
});

test("default goal is 100000", () => {
  const c = createCounter({});
  let r;
  for (let i = 1; i <= 99999; i++) r = c.click(true, i * 100);
  assert.equal(r.done, false);
  assert.equal(c.click(true, 100000 * 100).done, true);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test`
Expected: FAIL with `Cannot find module '../shared/clicker.js'`.

- [ ] **Step 3: Implement `shared/clicker.js`**

```js
// The "click 100,000 times" square. createCounter is pure; mountClicker wires it to the DOM.
(function (root) {
  "use strict";

  function createCounter(opts) {
    const o = opts || {};
    const goal = o.goal || 100000;
    const minIntervalMs = o.minIntervalMs != null ? o.minIntervalMs : 100;
    const moveEvery = o.moveEvery || 500;
    const roastEvery = o.roastEvery || 100;
    let count = 0;
    let last = -Infinity;

    return {
      get count() {
        return count;
      },
      click(isTrusted, now) {
        if (!isTrusted || count >= goal || now - last < minIntervalMs) {
          return { counted: false, count, done: count >= goal, move: false, newRoast: false };
        }
        last = now;
        count += 1;
        return {
          counted: true,
          count,
          done: count >= goal,
          move: count % moveEvery === 0,
          newRoast: count % roastEvery === 0,
        };
      },
    };
  }

  function mountClicker(host, { goal = 100000, title, getRoast, onSuccess, onCancel }) {
    const counter = createCounter({ goal });
    const wrap = document.createElement("div");
    wrap.className = "bb-clicker";
    // The square is a <div>, not a <button>, so holding Enter/Space can't click it.
    wrap.innerHTML = `
      <p class="bb-clicker-title"></p>
      <p class="bb-clicker-roast"></p>
      <div class="bb-clicker-arena"><div class="bb-clicker-square">CLIQUE</div></div>
      <p class="bb-clicker-count"></p>
      <button class="bb-clicker-cancel" type="button">J'abandonne (sage décision)</button>`;
    host.appendChild(wrap);

    const $ = (sel) => wrap.querySelector(sel);
    const square = $(".bb-clicker-square");
    const arena = $(".bb-clicker-arena");
    const fmt = (n) => n.toLocaleString("fr-FR");

    $(".bb-clicker-title").textContent = title;
    $(".bb-clicker-roast").textContent = getRoast();
    const renderCount = () => {
      $(".bb-clicker-count").textContent = `${fmt(counter.count)} / ${fmt(goal)}`;
    };

    function moveSquare() {
      const maxX = Math.max(0, arena.clientWidth - square.offsetWidth);
      const maxY = Math.max(0, arena.clientHeight - square.offsetHeight);
      square.style.left = Math.floor(Math.random() * maxX) + "px";
      square.style.top = Math.floor(Math.random() * maxY) + "px";
    }

    function destroy() {
      wrap.remove();
    }

    square.addEventListener("click", (event) => {
      const r = counter.click(event.isTrusted, performance.now());
      if (!r.counted) return;
      renderCount();
      if (r.newRoast) $(".bb-clicker-roast").textContent = getRoast();
      if (r.move) moveSquare();
      if (r.done) {
        destroy();
        onSuccess();
      }
    });
    $(".bb-clicker-cancel").addEventListener("click", () => {
      destroy();
      if (onCancel) onCancel();
    });

    renderCount();
    moveSquare();
    return destroy;
  }

  const api = { createCounter, mountClicker };
  root.BB = root.BB || {};
  root.BB.clicker = api;
  if (typeof module === "object" && module.exports) module.exports = api;
})(globalThis);
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test`
Expected: all tests PASS.

- [ ] **Step 5: Commit and push**

```bash
git add shared/clicker.js tests/clicker.test.js
git commit -m "feat: add 100k-click square with anti-autoclicker rules" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
git push
```

---

### Task 5: Stats helpers and SVG charts (`shared/charts.js`)

**Files:**
- Create: `shared/charts.js`
- Test: `tests/charts.test.js`

**Interfaces:**
- Consumes: nothing.
- Produces (`BB.charts`):
  - `dailyCounts(attempts: {at}[], now: number, days = 14) → { label: "DD/MM", value: number }[]` (oldest first, last = today)
  - `historyToSeries(history: {at, allow, block}[], now) → [{ name: "Allowlist", color: "var(--allow)", points: {x, y}[] }, { name: "Blacklist", color: "var(--block)", points }]`
  - `lineChart(series, { width = 320, height = 150 }?) → string` (SVG markup, one `<polyline>` per series)
  - `barChart(bars, { width = 320, height = 130 }?) → string` (SVG markup, one `<rect>` per bar)
  - Colors are applied through `style="…"` so CSS variables (`--allow`, `--block`, `--muted`, `--border`, `--fg`) from `popup.css` work.

- [ ] **Step 1: Write the failing tests** — `tests/charts.test.js`

```js
const test = require("node:test");
const assert = require("node:assert/strict");
const charts = require("../shared/charts.js");

const NOW = new Date(2026, 9, 4, 15, 0).getTime();
const at = (d, h, m) => new Date(2026, 9, d, h, m).getTime();

test("dailyCounts buckets by local day", () => {
  const attempts = [
    { at: at(4, 0, 1) },
    { at: at(4, 14, 0) },
    { at: at(3, 23, 59) },
    { at: at(1, 12, 0) },
    { at: new Date(2026, 8, 1).getTime() }, // older than 14 days
  ];
  const days = charts.dailyCounts(attempts, NOW, 14);
  assert.equal(days.length, 14);
  assert.deepEqual(days.at(-1), { label: "04/10", value: 2 });
  assert.deepEqual(days.at(-2), { label: "03/10", value: 1 });
  assert.equal(days.at(-4).value, 1);
  assert.equal(days.reduce((s, d) => s + d.value, 0), 4);
});

test("historyToSeries extends the last point to now", () => {
  const series = charts.historyToSeries([{ at: 1000, allow: 26, block: 28 }, { at: 2000, allow: 27, block: 28 }], 5000);
  assert.equal(series[0].name, "Allowlist");
  assert.deepEqual(series[0].points, [{ x: 1000, y: 26 }, { x: 2000, y: 27 }, { x: 5000, y: 27 }]);
  assert.deepEqual(series[1].points.at(-1), { x: 5000, y: 28 });
  assert.deepEqual(charts.historyToSeries([], 5000)[0].points, []);
});

test("lineChart draws one polyline per series", () => {
  const svg = charts.lineChart(charts.historyToSeries([{ at: 1000, allow: 1, block: 2 }], 5000));
  assert.match(svg, /^<svg/);
  assert.equal(svg.match(/<polyline/g).length, 2);
  assert.match(svg, /Allowlist : 1/);
});

test("lineChart empty state", () => {
  assert.match(charts.lineChart(charts.historyToSeries([], 5000)), /Pas encore de données/);
});

test("barChart draws one rect per bar", () => {
  const svg = charts.barChart(charts.dailyCounts([], NOW, 14));
  assert.equal(svg.match(/<rect/g).length, 14);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test`
Expected: FAIL with `Cannot find module '../shared/charts.js'`.

- [ ] **Step 3: Implement `shared/charts.js`**

```js
// Stats helpers and tiny hand-made SVG charts (no library).
(function (root) {
  "use strict";

  function escapeXml(s) {
    return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  }

  function fmtDay(ts) {
    const d = new Date(ts);
    return String(d.getDate()).padStart(2, "0") + "/" + String(d.getMonth() + 1).padStart(2, "0");
  }

  function dailyCounts(attempts, now, days) {
    const n = days || 14;
    const today = new Date(now);
    today.setHours(0, 0, 0, 0);
    const out = [];
    for (let i = n - 1; i >= 0; i--) {
      const start = new Date(today);
      start.setDate(today.getDate() - i); // setDate handles DST and month boundaries
      const end = new Date(start);
      end.setDate(start.getDate() + 1);
      const value = attempts.filter((a) => a.at >= start.getTime() && a.at < end.getTime()).length;
      out.push({ label: fmtDay(start.getTime()), value });
    }
    return out;
  }

  function historyToSeries(history, now) {
    const points = history.length ? history.concat({ ...history[history.length - 1], at: now }) : [];
    return [
      { name: "Allowlist", color: "var(--allow)", points: points.map((h) => ({ x: h.at, y: h.allow })) },
      { name: "Blacklist", color: "var(--block)", points: points.map((h) => ({ x: h.at, y: h.block })) },
    ];
  }

  function svgOpen(w, h) {
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="100%" role="img" class="bb-chart">`;
  }

  function lineChart(series, opts) {
    const w = (opts && opts.width) || 320;
    const h = (opts && opts.height) || 150;
    const pad = 28;
    const pts = series.flatMap((s) => s.points);
    if (pts.length === 0) {
      return `${svgOpen(w, h)}<text x="${w / 2}" y="${h / 2}" text-anchor="middle" font-size="12" style="fill: var(--muted)">Pas encore de données</text></svg>`;
    }
    const xs = pts.map((p) => p.x);
    const ys = pts.map((p) => p.y);
    const minX = Math.min(...xs);
    const maxX = Math.max(...xs);
    const maxY = Math.max(1, ...ys);
    const sx = (x) => (maxX === minX ? w / 2 : pad + ((x - minX) / (maxX - minX)) * (w - 2 * pad));
    const sy = (y) => h - pad - (y / maxY) * (h - 2 * pad);

    const axis =
      `<line x1="${pad}" y1="${h - pad}" x2="${w - pad}" y2="${h - pad}" style="stroke: var(--border)"/>` +
      `<text x="${pad}" y="${h - 8}" font-size="10" style="fill: var(--muted)">${fmtDay(minX)}</text>` +
      `<text x="${w - pad}" y="${h - 8}" font-size="10" text-anchor="end" style="fill: var(--muted)">${fmtDay(maxX)}</text>` +
      `<text x="4" y="${pad + 4}" font-size="10" style="fill: var(--muted)">${maxY}</text>`;

    const lines = series
      .map((s) => {
        const coords = s.points.map((p) => `${sx(p.x).toFixed(1)},${sy(p.y).toFixed(1)}`).join(" ");
        const last = s.points[s.points.length - 1];
        const dot = last
          ? `<circle cx="${sx(last.x).toFixed(1)}" cy="${sy(last.y).toFixed(1)}" r="3" style="fill: ${s.color}"/>`
          : "";
        return `<polyline fill="none" stroke-width="2" style="stroke: ${s.color}" points="${coords}"/>${dot}`;
      })
      .join("");

    const legend = series
      .map((s, i) => {
        const last = s.points[s.points.length - 1];
        return `<text x="${pad + i * 130}" y="14" font-size="11" font-weight="600" style="fill: ${s.color}">${escapeXml(s.name)} : ${last ? last.y : 0}</text>`;
      })
      .join("");

    return `${svgOpen(w, h)}${axis}${lines}${legend}</svg>`;
  }

  function barChart(bars, opts) {
    const w = (opts && opts.width) || 320;
    const h = (opts && opts.height) || 130;
    const pad = 20;
    const maxV = Math.max(1, ...bars.map((b) => b.value));
    const slot = (w - 2 * pad) / Math.max(1, bars.length);
    const bw = Math.max(2, slot * 0.7);

    const rects = bars
      .map((b, i) => {
        const bh = (b.value / maxV) * (h - 2 * pad);
        const x = pad + i * slot + (slot - bw) / 2;
        const y = h - pad - bh;
        const cx = (x + bw / 2).toFixed(1);
        const value =
          b.value > 0
            ? `<text x="${cx}" y="${(y - 3).toFixed(1)}" font-size="9" text-anchor="middle" style="fill: var(--fg)">${b.value}</text>`
            : "";
        // label every other day, always including today (the last bar)
        const label =
          (bars.length - 1 - i) % 2 === 0
            ? `<text x="${cx}" y="${h - 6}" font-size="9" text-anchor="middle" style="fill: var(--muted)">${escapeXml(b.label)}</text>`
            : "";
        return `<rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${bw.toFixed(1)}" height="${bh.toFixed(1)}" rx="2" style="fill: var(--block)"/>${value}${label}`;
      })
      .join("");

    const axis = `<line x1="${pad}" y1="${h - pad}" x2="${w - pad}" y2="${h - pad}" style="stroke: var(--border)"/>`;
    return `${svgOpen(w, h)}${axis}${rects}</svg>`;
  }

  const api = { dailyCounts, historyToSeries, lineChart, barChart };
  root.BB = root.BB || {};
  root.BB.charts = api;
  if (typeof module === "object" && module.exports) module.exports = api;
})(globalThis);
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test`
Expected: all tests PASS.

- [ ] **Step 5: Commit and push**

```bash
git add shared/charts.js tests/charts.test.js
git commit -m "feat: add stats helpers and SVG charts" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
git push
```

---

### Task 6: YouTube blocking (manifest, `content/rules.js`, `content/hide.css`, `content/youtube.js`)

**Files:**
- Create: `manifest.json`
- Create: `content/rules.js`
- Create: `content/hide.css`
- Create: `content/youtube.js`
- Test: `tests/rules.test.js`

**Interfaces:**
- Consumes: `channel.parseChannelHref` (Task 1); `store.statusOf`, `store.findIn`, `store.load`, `store.save`, `store.logAttempt`, `store.attemptsToday` (Task 2); `roasts.pickRoast`, `roasts.attemptLabel` (Task 3).
- Produces:
  - `BB.rules`:
    - `TILE_SELECTOR: string` (must match the tile list in `content/hide.css`)
    - `CHANNEL_LINK: string`
    - `pageKind(pathname) → "watch" | "channel" | "shorts" | "feed"`
    - `pageVerdict(kind, pageChannel|null, state) → "allow" | "block" | "blacklisted" | "checking" | "none"`
    - `tileVisible(tileChannel|null, { kind, channel }, state) → boolean`
    - `applyTiles(tiles: Iterable<Element>, { kind, channel }, state) → void` (toggles class `bb-ok`)
  - Content script message API (used by the popup in Task 7): `chrome.tabs.sendMessage(tabId, { type: "getCurrentChannel" })` → `{ kind, channel: { id, handle, name } | null }`.
  - Overlay element `#bb-overlay`, html class `bb-off` when disabled.

- [ ] **Step 1: Write the failing tests** — `tests/rules.test.js`

```js
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
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test`
Expected: FAIL with `Cannot find module '../content/rules.js'`.

- [ ] **Step 3: Implement `content/rules.js`**

```js
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

  const api = { TILE_SELECTOR, CHANNEL_LINK, pageKind, pageVerdict, tileVisible, applyTiles };
  root.BB = root.BB || {};
  root.BB.rules = api;
  if (isNode) module.exports = api;
})(globalThis);
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test`
Expected: all tests PASS.

- [ ] **Step 5: Create `manifest.json`**

```json
{
  "manifest_version": 3,
  "name": "Brainrot Blocker",
  "version": "0.1.0",
  "description": "YouTube en mode allow-only : seules les chaînes autorisées passent.",
  "permissions": ["storage"],
  "host_permissions": ["https://www.youtube.com/*"],
  "action": {
    "default_title": "Brainrot Blocker",
    "default_popup": "popup/popup.html"
  },
  "content_scripts": [
    {
      "matches": ["https://www.youtube.com/*"],
      "css": ["content/hide.css"],
      "js": [
        "data/defaults.js",
        "shared/channel.js",
        "shared/storage.js",
        "shared/roasts.js",
        "content/rules.js",
        "content/youtube.js"
      ],
      "run_at": "document_start"
    }
  ]
}
```

- [ ] **Step 6: Create `content/hide.css`**

```css
/* 1. Allow-only: every video tile is hidden until youtube.js marks it .bb-ok.
      Keep this list in sync with TILE_SELECTOR in content/rules.js. */
html:not(.bb-off) :is(
  ytd-rich-item-renderer,
  ytd-video-renderer,
  ytd-compact-video-renderer,
  ytd-grid-video-renderer,
  ytd-playlist-video-renderer,
  ytd-playlist-panel-video-renderer,
  ytd-playlist-renderer,
  ytd-compact-playlist-renderer,
  ytd-radio-renderer,
  ytd-compact-radio-renderer,
  ytd-channel-renderer,
  yt-lockup-view-model
):not(.bb-ok) {
  display: none !important;
}

/* 2. Shorts: always hidden, even when the extension is OFF. */
ytd-reel-shelf-renderer,
ytd-rich-shelf-renderer[is-shorts],
ytd-rich-section-renderer:has(ytd-rich-shelf-renderer[is-shorts]),
grid-shelf-view-model:has(ytm-shorts-lockup-view-model),
ytm-shorts-lockup-view-model,
ytm-shorts-lockup-view-model-v2,
ytd-reel-item-renderer,
:is(ytd-rich-item-renderer, ytd-video-renderer, ytd-compact-video-renderer, ytd-grid-video-renderer, yt-lockup-view-model):has(a[href^="/shorts/"]),
ytd-guide-entry-renderer:has(a[title="Shorts"]),
ytd-mini-guide-entry-renderer:has(a[title="Shorts"]),
ytd-mini-guide-entry-renderer[aria-label="Shorts"],
yt-tab-shape[tab-title="Shorts"] {
  display: none !important;
}

/* 3. Blocking overlay */
#bb-overlay {
  position: fixed;
  inset: 0;
  z-index: 2147483647;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px;
  background: #0b0b0f;
  color: #f5f5f5;
  font-family: system-ui, -apple-system, sans-serif;
  text-align: center;
}
#bb-overlay .bb-box { max-width: 560px; }
#bb-overlay h1 { font-size: 32px; margin: 0 0 12px; }
#bb-overlay .bb-sub { font-size: 18px; opacity: 0.7; margin: 0 0 24px; }
#bb-overlay .bb-roast { font-size: 22px; font-weight: 700; color: #ff4d4f; margin: 0 0 8px; }
#bb-overlay .bb-count { font-size: 14px; opacity: 0.6; margin: 0 0 24px; }
#bb-overlay button {
  font: inherit;
  font-size: 16px;
  padding: 10px 20px;
  border-radius: 999px;
  border: 1px solid #444;
  background: #1c1c22;
  color: inherit;
  cursor: pointer;
}
```

- [ ] **Step 7: Create `content/youtube.js`**

```js
// Content script: applies the allow-only rules to the live YouTube page.
(function () {
  "use strict";

  const { channel, store, rules, roasts } = globalThis.BB;

  const OWNER_LINK = [
    'ytd-watch-metadata #owner a[href^="/@"]',
    'ytd-watch-metadata #owner a[href^="/channel/UC"]',
    'ytd-video-owner-renderer a[href^="/@"]',
    'ytd-video-owner-renderer a[href^="/channel/UC"]',
  ].join(",");
  const OWNER_NAME = "ytd-watch-metadata #owner ytd-channel-name a, ytd-video-owner-renderer ytd-channel-name a";

  let state = null;
  let navigating = false;
  let timer = null;
  let overlayKey = null;
  let overlayActive = false;

  function currentPageChannel(kind) {
    if (kind === "channel") return channel.parseChannelHref(location.pathname);
    if (kind !== "watch") return null;
    const link = document.querySelector(OWNER_LINK);
    const parsed = link ? channel.parseChannelHref(link.getAttribute("href")) : null;
    if (!parsed) return null;
    const nameEl = document.querySelector(OWNER_NAME);
    return { ...parsed, name: nameEl ? nameEl.textContent.trim() : null };
  }

  function silenceVideos() {
    document.querySelectorAll("video").forEach((v) => {
      if (!v.paused) v.pause();
      if (!v.muted) {
        v.muted = true;
        v.dataset.bbMuted = "1";
      }
    });
  }

  function restoreVideos() {
    document.querySelectorAll('video[data-bb-muted="1"]').forEach((v) => {
      v.muted = false;
      delete v.dataset.bbMuted;
    });
  }

  function showOverlay(verdict, kind, ch) {
    overlayActive = true;
    silenceVideos();
    const key = verdict + "|" + location.href;
    if (key === overlayKey) return; // same page, same verdict: don't re-roast or re-log
    overlayKey = key;

    let el = document.getElementById("bb-overlay");
    if (!el) {
      el = document.createElement("div");
      el.id = "bb-overlay";
      el.innerHTML =
        '<div class="bb-box"><h1></h1><p class="bb-sub"></p><p class="bb-roast"></p><p class="bb-count"></p>' +
        "<button type=\"button\">← Retour à l'accueil</button></div>";
      el.querySelector("button").addEventListener("click", () => location.assign("/"));
      (document.body || document.documentElement).appendChild(el);
    }

    const entry = ch && (store.findIn(state.block, ch) || store.findIn(state.allow, ch));
    const label = (entry && entry.name) || (ch && (ch.name || ch.handle || ch.id)) || "";
    const texts = {
      checking: ["Vérification de la chaîne…", ""],
      block: kind === "shorts" ? ["⛔ Shorts bloqués", "Pas de Shorts. Jamais."] : ["⛔ Chaîne non autorisée", label],
      blacklisted: ["🚫 Chaîne blacklistée", label],
    }[verdict];
    el.querySelector("h1").textContent = texts[0];
    el.querySelector(".bb-sub").textContent = texts[1];

    let roast = "";
    let count = "";
    if (verdict === "blacklisted") {
      state = store.logAttempt(state, "visitBlocked", Date.now());
      store.save(state, ["attempts"]).catch(() => {});
      const n = store.attemptsToday(state, Date.now());
      roast = roasts.pickRoast(n);
      count = roasts.attemptLabel(n);
    }
    el.querySelector(".bb-roast").textContent = roast;
    el.querySelector(".bb-count").textContent = count;
  }

  function hideOverlay() {
    if (!overlayActive) return;
    overlayActive = false;
    overlayKey = null;
    const el = document.getElementById("bb-overlay");
    if (el) el.remove();
    restoreVideos();
  }

  function scan() {
    timer = null;
    if (!state) return;
    document.documentElement.classList.toggle("bb-off", !state.enabled);
    const kind = rules.pageKind(location.pathname);
    // During SPA navigation the owner block still shows the previous video's channel: ignore it.
    const ch = navigating && kind === "watch" ? null : currentPageChannel(kind);
    rules.applyTiles(document.querySelectorAll(rules.TILE_SELECTOR), { kind, channel: ch }, state);
    const verdict = rules.pageVerdict(kind, ch, state);
    if (verdict === "allow" || verdict === "none") hideOverlay();
    else showOverlay(verdict, kind, ch);
  }

  // setTimeout (not requestAnimationFrame) so it also runs in background tabs.
  function schedule() {
    if (timer === null) timer = setTimeout(scan, 80);
  }

  // A blocked video must not start playing behind the overlay.
  document.addEventListener(
    "play",
    (event) => {
      if (overlayActive && event.target instanceof HTMLVideoElement) event.target.pause();
    },
    true
  );

  document.addEventListener("yt-navigate-start", () => {
    navigating = true;
    schedule();
  });
  document.addEventListener("yt-navigate-finish", () => {
    navigating = false;
    schedule();
  });

  new MutationObserver(schedule).observe(document.documentElement, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ["href"],
  });

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== "local" || !state) return;
    for (const [key, { newValue }] of Object.entries(changes)) {
      if (key in state) state[key] = newValue;
    }
    schedule();
  });

  chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
    if (msg && msg.type === "getCurrentChannel") {
      const kind = rules.pageKind(location.pathname);
      sendResponse({ kind, channel: currentPageChannel(kind) });
    }
  });

  store.load().then((loaded) => {
    state = loaded;
    schedule();
  });
})();
```

- [ ] **Step 8: Run unit tests**

Run: `npm test`
Expected: all tests PASS.

- [ ] **Step 9: Manual check in Brave**

1. Open `brave://extensions`, enable **Developer mode**, click **Load unpacked**, select the repo folder. Expected: "Brainrot Blocker" loads with no errors.
2. Open `https://www.youtube.com/` → only tiles from allowlisted channels are visible (the page may be nearly empty — that's expected; Unhook may hide the home feed entirely).
3. Search `TED talk` → TED results visible, other channels hidden.
4. Search `Clash Royale` → no results visible.
5. Open a TED video → plays normally.
6. Open `https://www.youtube.com/@cyprien` → overlay "🚫 Chaîne blacklistée" + roast + "Tentative n°1 aujourd'hui". Reload → "Tentative n°2".
7. Open any non-listed video (e.g. from a direct link) → overlay "⛔ Chaîne non autorisée", no sound.
8. From a TED video, click a sidebar/end-screen link to another channel → overlay appears without a page reload (SPA navigation).
9. Open `https://www.youtube.com/shorts/` + any Shorts ID → overlay "⛔ Shorts bloqués". No Shorts shelf/tab anywhere.
10. Open `https://www.youtube.com/@TED/videos` → TED's video grid is visible.
11. Scroll search results for an allowed channel → newly loaded tiles keep the right visibility.
12. In DevTools console on YouTube, check there are no errors from the extension.

- [ ] **Step 10: Commit and push**

```bash
git add manifest.json content/rules.js content/hide.css content/youtube.js tests/rules.test.js
git commit -m "feat: block non-allowed YouTube channels with allow-only rules" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
git push
```

---

### Task 7: Popup — switch, current channel, lists, clicker and roasts

**Files:**
- Create: `popup/popup.html`
- Create: `popup/popup.css`
- Create: `popup/popup.js`

**Interfaces:**
- Consumes: `BB.channel.resolveHandle`, `BB.channel.resolveId`, `BB.channel.parseChannelHref`, `BB.channel.normalizeHandle` (Task 1); `BB.store.*` (Task 2); `BB.roasts.pickRoast`, `BB.roasts.attemptLabel` (Task 3); `BB.clicker.mountClicker` (Task 4); content script message `{ type: "getCurrentChannel" }` → `{ kind, channel }` (Task 6).
- Produces: `renderStats()` placeholder function in `popup.js` that Task 8 replaces; `#stats-box` container in `popup.html`; CSS variables `--allow`, `--block`, `--muted`, `--border`, `--fg` used by charts (Task 5).

- [ ] **Step 1: Create `popup/popup.html`**

```html
<!doctype html>
<html lang="fr">
  <head>
    <meta charset="utf-8" />
    <title>Brainrot Blocker</title>
    <link rel="stylesheet" href="popup.css" />
  </head>
  <body>
    <header class="top">
      <h1>Brainrot Blocker</h1>
      <button id="toggle" class="toggle" type="button" role="switch" aria-checked="true" aria-label="Activer / désactiver">
        <span class="toggle-knob"></span>
      </button>
    </header>

    <nav class="tabs">
      <button type="button" data-tab="current" class="active">Actuel</button>
      <button type="button" data-tab="lists">Listes</button>
      <button type="button" data-tab="stats">Stats</button>
    </nav>

    <main>
      <section id="tab-current" class="tab active">
        <div id="current-box"><p class="muted">Chargement…</p></div>
      </section>

      <section id="tab-lists" class="tab">
        <form id="add-form" class="add-form">
          <input id="add-input" type="text" placeholder="@handle ou lien de la chaîne" autocomplete="off" required />
          <div class="add-buttons">
            <button type="submit" data-list="allow" class="btn allow">✅ Autoriser</button>
            <button type="submit" data-list="block" class="btn block">🚫 Blacklister</button>
          </div>
        </form>
        <h2>Allowlist <span id="allow-count"></span></h2>
        <ul id="allow-list" class="chan-list"></ul>
        <h2>Blacklist <span id="block-count"></span></h2>
        <ul id="block-list" class="chan-list"></ul>
      </section>

      <section id="tab-stats" class="tab">
        <div id="stats-box"></div>
      </section>
    </main>

    <div id="toast" class="toast" hidden></div>
    <div id="modal" class="modal" hidden></div>

    <script src="../data/defaults.js"></script>
    <script src="../shared/channel.js"></script>
    <script src="../shared/storage.js"></script>
    <script src="../shared/roasts.js"></script>
    <script src="../shared/clicker.js"></script>
    <script src="../shared/charts.js"></script>
    <script src="popup.js"></script>
  </body>
</html>
```

- [ ] **Step 2: Create `popup/popup.css`**

```css
:root {
  --bg: #ffffff;
  --fg: #16161a;
  --muted: #6b6b76;
  --card: #f4f4f6;
  --border: #e2e2e8;
  --allow: #1f9d55;
  --block: #d63c3c;
  --accent: #5b5bd6;
  color-scheme: light dark;
}
@media (prefers-color-scheme: dark) {
  :root {
    --bg: #141418;
    --fg: #f2f2f5;
    --muted: #9a9aa6;
    --card: #1e1e24;
    --border: #2c2c34;
    --allow: #3ccf7a;
    --block: #ff5a5a;
    --accent: #8b8bff;
  }
}

* { box-sizing: border-box; }
body {
  margin: 0;
  width: 360px;
  min-height: 440px;
  font: 14px/1.4 system-ui, -apple-system, sans-serif;
  background: var(--bg);
  color: var(--fg);
}

.top { display: flex; align-items: center; justify-content: space-between; padding: 12px 16px; border-bottom: 1px solid var(--border); }
.top h1 { font-size: 16px; margin: 0; }

.toggle { position: relative; width: 44px; height: 24px; padding: 0; border: none; border-radius: 999px; background: var(--muted); cursor: pointer; }
.toggle[aria-checked="true"] { background: var(--allow); }
.toggle-knob { position: absolute; top: 3px; left: 3px; width: 18px; height: 18px; border-radius: 50%; background: #fff; transition: transform 0.15s; }
.toggle[aria-checked="true"] .toggle-knob { transform: translateX(20px); }

.tabs { display: flex; border-bottom: 1px solid var(--border); }
.tabs button { flex: 1; padding: 10px; background: none; border: none; border-bottom: 2px solid transparent; color: var(--muted); font: inherit; cursor: pointer; }
.tabs button.active { color: var(--fg); border-bottom-color: var(--accent); font-weight: 600; }

main { padding: 16px; }
.tab { display: none; }
.tab.active { display: block; }

h2 { font-size: 12px; text-transform: uppercase; letter-spacing: 0.04em; color: var(--muted); margin: 16px 0 8px; }
.muted { color: var(--muted); }

.chan-name { font-size: 18px; font-weight: 600; margin: 0 0 4px; }
.status { margin: 0 0 16px; font-weight: 600; }
.status.allowed { color: var(--allow); }
.status.blocked { color: var(--muted); }
.status.blacklisted { color: var(--block); }

.add-buttons { display: flex; gap: 8px; }
.btn { flex: 1; padding: 8px 10px; border-radius: 8px; border: 1px solid var(--border); background: var(--card); color: var(--fg); font: inherit; cursor: pointer; }
.btn:disabled { opacity: 0.4; cursor: default; }
.btn.allow:not(:disabled):hover { border-color: var(--allow); }
.btn.block:not(:disabled):hover { border-color: var(--block); }

.add-form input { width: 100%; margin-bottom: 8px; padding: 8px 10px; border-radius: 8px; border: 1px solid var(--border); background: var(--card); color: var(--fg); font: inherit; }

.chan-list { list-style: none; margin: 0; padding: 0; max-height: 180px; overflow-y: auto; border: 1px solid var(--border); border-radius: 8px; }
.chan-list li { display: flex; align-items: center; gap: 8px; padding: 6px 10px; border-bottom: 1px solid var(--border); }
.chan-list li:last-child { border-bottom: none; }
.chan { flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.chan-list .muted { max-width: 120px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 12px; }
.del { padding: 2px 4px; background: none; border: none; color: var(--muted); font-size: 14px; cursor: pointer; }
.del:hover { color: var(--block); }

.kpis { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
.kpi { display: flex; flex-direction: column; padding: 10px; border-radius: 8px; background: var(--card); }
.kpi-value { font-size: 22px; font-weight: 700; }
.kpi-label { font-size: 12px; color: var(--muted); }

.toast { position: fixed; left: 12px; right: 12px; bottom: 12px; z-index: 20; padding: 10px 12px; border-radius: 8px; background: var(--fg); color: var(--bg); white-space: pre-line; font-weight: 500; }
.toast.error { background: var(--block); color: #fff; }
.toast.roast { background: var(--block); color: #fff; font-size: 15px; font-weight: 700; }

.modal { position: fixed; inset: 0; z-index: 10; padding: 16px; background: var(--bg); }

.bb-clicker-title { margin: 0 0 8px; font-weight: 700; }
.bb-clicker-roast { min-height: 3em; margin: 0 0 8px; color: var(--block); font-weight: 700; }
.bb-clicker-arena { position: relative; height: 220px; margin-bottom: 8px; border: 1px dashed var(--border); border-radius: 8px; }
.bb-clicker-square { position: absolute; left: 0; top: 0; display: flex; align-items: center; justify-content: center; width: 64px; height: 64px; border-radius: 8px; background: var(--block); color: #fff; font-size: 11px; font-weight: 700; cursor: pointer; user-select: none; }
.bb-clicker-count { margin: 0 0 8px; text-align: center; font-variant-numeric: tabular-nums; }
.bb-clicker-cancel { width: 100%; padding: 8px; border-radius: 8px; border: 1px solid var(--border); background: var(--card); color: var(--fg); font: inherit; cursor: pointer; }
```

- [ ] **Step 3: Create `popup/popup.js`**

```js
// Popup: ON/OFF switch, current channel, lists management, clicker and roasts.
(function () {
  "use strict";

  const { channel, store, roasts, clicker } = globalThis.BB;
  const $ = (sel) => document.querySelector(sel);
  const STATUS_LABELS = { allowed: "✅ Autorisée", blocked: "⛔ Bloquée", blacklisted: "🚫 Blacklistée" };

  let state = null;
  let current = { error: "Chargement…" };
  let busy = false;

  // ---------- feedback ----------

  let toastTimer = null;
  function toast(text, kind) {
    const el = $("#toast");
    el.textContent = text;
    el.className = "toast " + (kind || "");
    el.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => (el.hidden = true), kind === "roast" ? 6000 : 2500);
  }

  // Logs a cheating attempt and returns the roast for today's count.
  async function logAndRoast(type) {
    state = store.logAttempt(state, type, Date.now());
    await store.save(state, ["attempts"]);
    const n = store.attemptsToday(state, Date.now());
    return roasts.pickRoast(n) + "\n" + roasts.attemptLabel(n);
  }

  async function openClicker(title, attemptType, onSuccess) {
    await logAndRoast(attemptType);
    const modal = $("#modal");
    modal.hidden = false;
    clicker.mountClicker(modal, {
      goal: 100000,
      title,
      getRoast: () => {
        const n = store.attemptsToday(state, Date.now());
        return roasts.pickRoast(n) + " — " + roasts.attemptLabel(n);
      },
      onSuccess: async () => {
        modal.hidden = true;
        await onSuccess();
      },
      onCancel: () => (modal.hidden = true),
    });
  }

  // ---------- actions ----------

  async function addTo(listName, rawChannel) {
    if (busy) return false;
    busy = true;
    try {
      let full;
      try {
        full = rawChannel.handle ? await channel.resolveHandle(rawChannel.handle) : await channel.resolveId(rawChannel.id);
      } catch (err) {
        toast(err.message, "error");
        return false;
      }
      const { state: next, result } = store.addChannel(state, listName, full, Date.now());
      if (result === "refused") {
        toast(await logAndRoast("allowBlocked"), "roast");
        return false;
      }
      if (result === "duplicate") {
        toast(`${full.name} est déjà dans la liste.`);
        return false;
      }
      state = next;
      await store.save(state, ["allow", "block", "history"]);
      toast(listName === "allow" ? `✅ ${full.name} autorisée` : `🚫 ${full.name} blacklistée`);
      render();
      return true;
    } finally {
      busy = false;
    }
  }

  async function removeFrom(listName, entry) {
    if (listName === "allow") {
      state = store.removeChannel(state, "allow", entry, Date.now());
      await store.save(state, ["allow", "history"]);
      render();
      return;
    }
    await openClicker(`Clique 100 000 fois pour retirer ${entry.name} de la blacklist`, "unblock", async () => {
      state = store.removeChannel(state, "block", entry, Date.now());
      await store.save(state, ["block", "history"]);
      render();
    });
  }

  async function onToggle() {
    if (!state.enabled) {
      state = { ...state, enabled: true };
      await store.save(state, ["enabled"]);
      render();
      return;
    }
    await openClicker("Clique 100 000 fois pour désactiver l'extension", "off", async () => {
      state = { ...state, enabled: false };
      await store.save(state, ["enabled"]);
      render();
    });
  }

  async function onAddSubmit(event) {
    event.preventDefault();
    const listName = event.submitter.dataset.list;
    const raw = $("#add-input").value;
    const handle = channel.normalizeHandle(raw);
    const parsed = channel.parseChannelHref(raw.trim()) || (handle ? { id: null, handle } : null);
    if (!parsed) {
      toast("Handle ou lien invalide.", "error");
      return;
    }
    if (await addTo(listName, parsed)) $("#add-input").value = "";
  }

  // ---------- current tab ----------

  async function getCurrent() {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    // tab.url is only visible for YouTube tabs (our only host permission)
    if (!tab || !tab.url || !tab.url.startsWith("https://www.youtube.com/")) {
      return { error: "Ouvre une vidéo ou une chaîne YouTube." };
    }
    try {
      const res = await chrome.tabs.sendMessage(tab.id, { type: "getCurrentChannel" });
      if (res && res.channel) return { channel: res.channel };
      if (res && res.kind === "watch") return { error: "Chaîne pas encore détectée, réessaie dans une seconde." };
      return { error: "Ouvre une vidéo ou une chaîne YouTube." };
    } catch (_) {
      return { error: "Recharge la page YouTube (l'extension vient d'être installée ou mise à jour)." };
    }
  }

  // ---------- rendering ----------

  function renderCurrent() {
    const box = $("#current-box");
    box.textContent = "";
    if (current.error) {
      const p = document.createElement("p");
      p.className = "muted";
      p.textContent = current.error;
      box.append(p);
      return;
    }
    const ch = current.channel;
    const status = store.statusOf(state, ch);
    const entry = store.findIn(state.allow, ch) || store.findIn(state.block, ch);
    box.innerHTML = `
      <p class="chan-name"></p>
      <p class="status ${status}"></p>
      <div class="add-buttons">
        <button type="button" class="btn allow" data-act="allow">✅ Autoriser</button>
        <button type="button" class="btn block" data-act="block">🚫 Blacklister</button>
      </div>`;
    box.querySelector(".chan-name").textContent = (entry && entry.name) || ch.name || ch.handle || ch.id;
    box.querySelector(".status").textContent = STATUS_LABELS[status];
    // "Autoriser" stays enabled on a blacklisted channel on purpose: clicking it earns a roast.
    box.querySelector('[data-act="allow"]').disabled = status === "allowed";
    box.querySelector('[data-act="block"]').disabled = status === "blacklisted";
    box.querySelectorAll("[data-act]").forEach((btn) => btn.addEventListener("click", () => addTo(btn.dataset.act, ch)));
  }

  function renderList(listName) {
    const ul = $(`#${listName}-list`);
    ul.textContent = "";
    $(`#${listName}-count`).textContent = `(${state[listName].length})`;
    const sorted = [...state[listName]].sort((a, b) => (a.name || "").localeCompare(b.name || "", "fr"));
    for (const entry of sorted) {
      const li = document.createElement("li");
      const name = document.createElement("span");
      name.className = "chan";
      name.textContent = entry.name;
      const handle = document.createElement("span");
      handle.className = "muted";
      handle.textContent = entry.handle || "";
      const del = document.createElement("button");
      del.type = "button";
      del.className = "del";
      del.textContent = "✕";
      del.title = listName === "allow" ? "Retirer" : "Retirer (100 000 clics)";
      del.addEventListener("click", () => removeFrom(listName, entry));
      li.append(name, handle, del);
      ul.append(li);
    }
  }

  // Replaced in Task 8.
  function renderStats() {}

  function render() {
    $("#toggle").setAttribute("aria-checked", String(state.enabled));
    renderCurrent();
    renderList("allow");
    renderList("block");
    renderStats();
  }

  function setupTabs() {
    document.querySelectorAll(".tabs button").forEach((btn) => {
      btn.addEventListener("click", () => {
        document.querySelectorAll(".tabs button").forEach((b) => b.classList.toggle("active", b === btn));
        document.querySelectorAll(".tab").forEach((t) => t.classList.toggle("active", t.id === "tab-" + btn.dataset.tab));
      });
    });
  }

  async function init() {
    setupTabs();
    $("#toggle").addEventListener("click", onToggle);
    $("#add-form").addEventListener("submit", onAddSubmit);
    state = await store.load();
    current = await getCurrent();
    render();
  }

  init();
})();
```

- [ ] **Step 4: Run unit tests (regression)**

Run: `npm test`
Expected: all tests PASS.

- [ ] **Step 5: Manual check in Brave**

Reload the extension in `brave://extensions` (↻ button), then reload any YouTube tab.

1. On a TED video, open the popup → "TED", "✅ Autorisée", "Autoriser" disabled.
2. On a non-listed video → "⛔ Bloquée". Click "✅ Autoriser" → toast "✅ … autorisée", the YouTube tab un-blocks by itself (storage change → rescan).
3. On `@cyprien` → "🚫 Blacklistée". Click "✅ Autoriser" → red roast toast with "Tentative n°X aujourd'hui"; channel stays blacklisted. Repeat 7+ times → level 4 messages appear.
4. Tab "Listes": type `@Matis_cl⁩` (paste with the invisible char) + "Autoriser" → "déjà dans la liste". Type `https://www.youtube.com/@MrBeast` + "Blacklister" → added to blacklist. Type `@zzzz_not_a_channel_123456` → "Chaîne introuvable".
5. Allowlist ✕ on a channel → removed immediately, counter updates.
6. Blacklist ✕ → clicker modal opens with roast; clicks count at most ~10/s; the square jumps after 500; click outside the popup and reopen → back to the lists, nothing removed.
7. Click the ON/OFF switch → clicker opens. "J'abandonne" → modal closes, still ON.
8. On `brave://newtab` open the popup → "Ouvre une vidéo ou une chaîne YouTube."
9. Dark mode (system setting) → popup readable.

- [ ] **Step 6: Commit and push**

```bash
git add popup/popup.html popup/popup.css popup/popup.js
git commit -m "feat: add popup with lists, 100k-click switch and roasts" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
git push
```

---

### Task 8: Stats tab and README

**Files:**
- Modify: `popup/popup.js` (replace the `renderStats` placeholder and the `BB` destructuring line)
- Modify: `README.md`

**Interfaces:**
- Consumes: `BB.charts.dailyCounts`, `BB.charts.historyToSeries`, `BB.charts.lineChart`, `BB.charts.barChart` (Task 5); `BB.store.attemptsToday` (Task 2); `#stats-box` (Task 7).
- Produces: final V1.

- [ ] **Step 1: Import `charts` in `popup/popup.js`**

Replace:

```js
  const { channel, store, roasts, clicker } = globalThis.BB;
```

with:

```js
  const { channel, store, roasts, clicker, charts } = globalThis.BB;
```

- [ ] **Step 2: Replace the `renderStats` placeholder in `popup/popup.js`**

Replace:

```js
  // Replaced in Task 8.
  function renderStats() {}
```

with:

```js
  function renderStats() {
    const now = Date.now();
    const weekAgo = now - 7 * 24 * 60 * 60 * 1000;
    const addedThisWeek = (list) => list.filter((e) => e.addedAt && e.addedAt >= weekAgo).length;
    // Only numbers and SVG built from numbers go into innerHTML: no user text here.
    $("#stats-box").innerHTML = `
      <div class="kpis">
        <div class="kpi"><span class="kpi-value">${state.allow.length}</span><span class="kpi-label">Allowlist (+${addedThisWeek(state.allow)} cette semaine)</span></div>
        <div class="kpi"><span class="kpi-value">${state.block.length}</span><span class="kpi-label">Blacklist (+${addedThisWeek(state.block)} cette semaine)</span></div>
        <div class="kpi"><span class="kpi-value">${store.attemptsToday(state, now)}</span><span class="kpi-label">Tentatives aujourd'hui</span></div>
        <div class="kpi"><span class="kpi-value">${state.attempts.length}</span><span class="kpi-label">Tentatives au total</span></div>
      </div>
      <h2>Évolution des listes</h2>
      ${charts.lineChart(charts.historyToSeries(state.history, now))}
      <h2>Tentatives de triche (14 jours)</h2>
      ${charts.barChart(charts.dailyCounts(state.attempts, now, 14))}`;
  }
```

- [ ] **Step 3: Replace `README.md`**

````markdown
# Brainrot Blocker

Extension navigateur (Brave / Chrome) qui fait tourner YouTube en mode **allow-only** : toutes les chaînes sont bloquées sauf celles de ton allowlist.

- Les vignettes des chaînes non autorisées sont cachées partout (accueil, recherche, suggestions, abonnements).
- Une vidéo ou une page de chaîne non autorisée est recouverte d'un écran de blocage.
- Les Shorts sont toujours bloqués.
- Une **blacklist** empêche d'autoriser certaines chaînes et déclenche des roasts de plus en plus violents.
- Désactiver l'extension ou retirer une chaîne de la blacklist demande **100 000 clics**.
- Onglet Stats : évolution des listes et tentatives de triche.

## Installation (mode développeur)

1. Ouvre `brave://extensions` (ou `chrome://extensions`).
2. Active **Mode développeur**.
3. **Charger l'extension non empaquetée** → sélectionne ce dossier.
4. Recharge les onglets YouTube déjà ouverts.

Après une modification du code : bouton ↻ sur la carte de l'extension, puis recharge YouTube.

## Tests

```bash
npm test
```

Aucune dépendance : les tests utilisent le runner intégré de Node (`node --test`).

## Structure

| Dossier | Rôle |
|---|---|
| `content/` | Script injecté dans YouTube (règles, CSS, overlay) |
| `popup/` | Interface de l'extension |
| `shared/` | Logique partagée (chaînes, état, roasts, clicker, graphiques) |
| `data/defaults.js` | Listes par défaut |
| `docs/superpowers/` | Spec et plan d'implémentation |
````

- [ ] **Step 4: Run unit tests (regression)**

Run: `npm test`
Expected: all tests PASS.

- [ ] **Step 5: Manual check in Brave**

Reload the extension, open the popup → tab "Stats":
1. Four KPI tiles: 26 (+0 cette semaine), 28 (+0), today's attempts, total attempts. (+N reflects channels you added in Task 7 checks.)
2. "Évolution des listes" shows two lines (green allow, red block) with current values in the legend.
3. "Tentatives de triche (14 jours)" shows 14 bars, today's bar matches "Tentatives aujourd'hui".
4. Add a channel to the allowlist → reopen popup → line and "+1 cette semaine" update.

- [ ] **Step 6: Commit and push**

```bash
git add popup/popup.js README.md
git commit -m "feat: add stats tab and README" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
git push
```
