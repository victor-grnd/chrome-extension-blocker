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
