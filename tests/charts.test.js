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
