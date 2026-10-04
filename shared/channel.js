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
