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
