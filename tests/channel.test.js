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
