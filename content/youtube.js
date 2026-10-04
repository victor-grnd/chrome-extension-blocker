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
    const key = rules.overlayKey(verdict, kind, ch, location.href);
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
