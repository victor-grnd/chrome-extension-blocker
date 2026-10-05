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
  let timer = null;
  let overlayKey = null;
  let overlayActive = false;
  let quietKey = null; // overlay key of a channel just blacklisted from the page: not a cheating attempt
  let adding = false;

  function currentPageChannel(kind) {
    if (kind === "channel") return channel.parseChannelHref(location.pathname);
    if (kind !== "watch") return null;
    const flexy = document.querySelector("ytd-watch-flexy");
    if (!rules.watchChannelReady(location.href, flexy && flexy.getAttribute("video-id"))) return null;
    const link = document.querySelector(OWNER_LINK);
    const parsed = link ? channel.parseChannelHref(link.getAttribute("href")) : null;
    if (!parsed) return null;
    const nameEl = document.querySelector(OWNER_NAME);
    return { ...parsed, name: nameEl ? nameEl.textContent.trim() : null };
  }

  // data-bb-paused marks videos *we* stopped, so they can resume if the verdict turns to "allow".
  function silenceVideos() {
    document.querySelectorAll("video").forEach((v) => {
      if (!v.paused) {
        v.pause();
        v.dataset.bbPaused = "1";
      }
      if (!v.muted) {
        v.muted = true;
        v.dataset.bbMuted = "1";
      }
    });
  }

  function restoreVideos(resume) {
    document.querySelectorAll('video[data-bb-muted="1"]').forEach((v) => {
      v.muted = false;
      delete v.dataset.bbMuted;
    });
    document.querySelectorAll('video[data-bb-paused="1"]').forEach((v) => {
      delete v.dataset.bbPaused;
      if (resume) v.play().catch(() => {});
    });
  }

  // Same path as the popup: resolve the full channel (id + name) from YouTube, then add it to the list.
  async function addFromPage(listName, ch) {
    const full = ch.handle ? await channel.resolveHandle(ch.handle) : await channel.resolveId(ch.id);
    const { state: next, result } = store.addChannel(state, listName, full, Date.now());
    if (result === "refused") throw new Error("Cette chaîne est blacklistée.");
    if (result !== "added") return;
    if (listName === "block") quietKey = rules.overlayKey("blacklisted", rules.pageKind(location.pathname), ch, location.href);
    state = next;
    await store.save(state, ["allow", "block", "history"]);
  }

  // Blacklisting is almost irreversible (100k clicks to undo), so that button needs a second click.
  function makeAddButton(listName, ch, label, onError) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "bb-add bb-add-" + listName;
    btn.textContent = label;
    let armed = listName === "allow";
    btn.addEventListener("click", async () => {
      if (adding) return;
      if (!armed) {
        armed = true;
        btn.textContent = "Sûr ? Reclique pour blacklister";
        return;
      }
      adding = true;
      btn.disabled = true;
      try {
        await addFromPage(listName, ch);
      } catch (err) {
        btn.disabled = false;
        onError(err.message);
      } finally {
        adding = false;
      }
      schedule();
    });
    return btn;
  }

  // Floating "blacklist" button on the page of an allowed channel.
  function updateFab(show, ch) {
    let fab = document.getElementById("bb-fab");
    const key = show ? ch.id || ch.handle : null;
    if (fab && fab.dataset.key !== key) {
      fab.remove();
      fab = null;
    }
    if (!show || fab || !document.body) return;
    fab = document.createElement("div");
    fab.id = "bb-fab";
    fab.dataset.key = key;
    const msg = document.createElement("span");
    fab.append(msg, makeAddButton("block", ch, "🚫 Blacklister cette chaîne", (text) => (msg.textContent = text)));
    document.body.appendChild(fab);
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
        '<div class="bb-actions"></div><p class="bb-msg"></p>' +
        "<button type=\"button\" class=\"bb-home\">← Retour à l'accueil</button></div>";
      el.querySelector(".bb-home").addEventListener("click", () => location.assign("/"));
      (document.body || document.documentElement).appendChild(el);
    }

    const entry = ch && (store.findIn(state.block, ch) || store.findIn(state.allow, ch));
    const label = (entry && entry.name) || (ch && (ch.name || ch.handle || ch.id)) || "";
    const texts = {
      checking: ["Vérification de la chaîne…", ""],
      block:
        kind === "shorts"
          ? ["⛔ Shorts bloqués", "Pas de Shorts. Jamais."]
          : kind === "embed"
            ? ["⛔ Lecteur intégré bloqué", "Ouvre la vidéo sur YouTube : elle passera si sa chaîne est autorisée."]
            : ["⛔ Chaîne non autorisée", label],
      blacklisted: ["🚫 Chaîne blacklistée", label],
    }[verdict];
    el.querySelector("h1").textContent = texts[0];
    el.querySelector(".bb-sub").textContent = texts[1];

    const actions = el.querySelector(".bb-actions");
    const msg = el.querySelector(".bb-msg");
    actions.textContent = "";
    msg.textContent = "";
    if (rules.canAddFromOverlay(verdict, kind, ch)) {
      const onError = (text) => (msg.textContent = text);
      actions.append(
        makeAddButton("allow", ch, "✅ Ajouter à l'allowlist", onError),
        makeAddButton("block", ch, "🚫 Ajouter à la blacklist", onError)
      );
    }

    let roast = "";
    let count = "";
    if (verdict === "blacklisted" && key !== quietKey) {
      state = store.logAttempt(state, "visitBlocked", Date.now());
      store.save(state, ["attempts"]).catch(() => {});
      const n = store.attemptsToday(state, Date.now());
      roast = roasts.pickRoast(n);
      count = roasts.attemptLabel(n);
    }
    el.querySelector(".bb-roast").textContent = roast;
    el.querySelector(".bb-count").textContent = count;
  }

  // resume: true only when the page itself became allowed (not when leaving it, e.g. Back to the feed).
  function hideOverlay(resume) {
    if (!overlayActive) return;
    overlayActive = false;
    overlayKey = null;
    quietKey = null;
    const el = document.getElementById("bb-overlay");
    if (el) el.remove();
    restoreVideos(resume);
  }

  function scan() {
    timer = null;
    if (!state) return;
    document.documentElement.classList.toggle("bb-off", !state.enabled);
    const kind = rules.pageKind(location.pathname);
    const ch = currentPageChannel(kind);
    rules.applyTiles(document.querySelectorAll(rules.TILE_SELECTOR), { kind, channel: ch }, state);
    const verdict = rules.pageVerdict(kind, ch, state);
    updateFab(kind === "channel" && verdict === "allow", ch);
    if (verdict === "allow" || verdict === "none") hideOverlay(verdict === "allow");
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
      if (overlayActive && event.target instanceof HTMLVideoElement) {
        event.target.pause();
        event.target.dataset.bbPaused = "1";
      }
    },
    true
  );

  document.addEventListener("yt-navigate-start", schedule);
  document.addEventListener("yt-navigate-finish", schedule);

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
