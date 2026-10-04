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
