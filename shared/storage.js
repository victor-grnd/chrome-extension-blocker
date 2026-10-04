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
