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
