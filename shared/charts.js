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
