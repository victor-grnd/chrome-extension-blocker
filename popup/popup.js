// Popup: ON/OFF switch, current channel, lists management, clicker and roasts.
(function () {
  "use strict";

  const { channel, store, roasts, clicker } = globalThis.BB;
  const $ = (sel) => document.querySelector(sel);
  const STATUS_LABELS = { allowed: "✅ Autorisée", blocked: "⛔ Bloquée", blacklisted: "🚫 Blacklistée" };

  let state = null;
  let current = { error: "Chargement…" };
  let busy = false;

  // ---------- feedback ----------

  let toastTimer = null;
  function toast(text, kind) {
    const el = $("#toast");
    el.textContent = text;
    el.className = "toast " + (kind || "");
    el.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => (el.hidden = true), kind === "roast" ? 6000 : 2500);
  }

  // Logs a cheating attempt and returns the roast for today's count.
  async function logAndRoast(type) {
    state = store.logAttempt(state, type, Date.now());
    await store.save(state, ["attempts"]);
    const n = store.attemptsToday(state, Date.now());
    return roasts.pickRoast(n) + "\n" + roasts.attemptLabel(n);
  }

  async function openClicker(title, attemptType, onSuccess) {
    await logAndRoast(attemptType);
    const modal = $("#modal");
    modal.hidden = false;
    clicker.mountClicker(modal, {
      goal: 100000,
      title,
      getRoast: () => {
        const n = store.attemptsToday(state, Date.now());
        return roasts.pickRoast(n) + " — " + roasts.attemptLabel(n);
      },
      onSuccess: async () => {
        modal.hidden = true;
        await onSuccess();
      },
      onCancel: () => (modal.hidden = true),
    });
  }

  // ---------- actions ----------

  // Duplicate / blacklisted answers that need no network call.
  async function handleRejection(result, name) {
    if (result === "refused") toast(await logAndRoast("allowBlocked"), "roast");
    else toast(`${name} est déjà dans la liste.`);
  }

  async function addTo(listName, rawChannel) {
    if (busy) return false;
    busy = true;
    try {
      const pre = store.addChannel(state, listName, rawChannel, Date.now());
      if (pre.result !== "added") {
        const known = store.findIn(state.allow, rawChannel) || store.findIn(state.block, rawChannel);
        await handleRejection(pre.result, (known && known.name) || rawChannel.handle || rawChannel.id);
        return false;
      }
      let full;
      try {
        full = rawChannel.handle ? await channel.resolveHandle(rawChannel.handle) : await channel.resolveId(rawChannel.id);
      } catch (err) {
        toast(err.message, "error");
        return false;
      }
      // Checked again with the resolved channel: the typed handle may be an alias of a listed channel.
      const { state: next, result } = store.addChannel(state, listName, full, Date.now());
      if (result !== "added") {
        await handleRejection(result, full.name);
        return false;
      }
      state = next;
      await store.save(state, ["allow", "block", "history"]);
      toast(listName === "allow" ? `✅ ${full.name} autorisée` : `🚫 ${full.name} blacklistée`);
      render();
      return true;
    } finally {
      busy = false;
    }
  }

  async function removeFrom(listName, entry) {
    if (listName === "allow") {
      state = store.removeChannel(state, "allow", entry, Date.now());
      await store.save(state, ["allow", "history"]);
      render();
      return;
    }
    await openClicker(`Clique 100 000 fois pour retirer ${entry.name} de la blacklist`, "unblock", async () => {
      state = store.removeChannel(state, "block", entry, Date.now());
      await store.save(state, ["block", "history"]);
      render();
    });
  }

  async function onToggle() {
    if (!state.enabled) {
      state = { ...state, enabled: true };
      await store.save(state, ["enabled"]);
      render();
      return;
    }
    await openClicker("Clique 100 000 fois pour désactiver l'extension", "off", async () => {
      state = { ...state, enabled: false };
      await store.save(state, ["enabled"]);
      render();
    });
  }

  async function onAddSubmit(event) {
    event.preventDefault();
    const listName = event.submitter.dataset.list;
    const raw = $("#add-input").value;
    const handle = channel.normalizeHandle(raw);
    const parsed = channel.parseChannelHref(raw.trim()) || (handle ? { id: null, handle } : null);
    if (!parsed) {
      toast("Handle ou lien invalide.", "error");
      return;
    }
    if (await addTo(listName, parsed)) $("#add-input").value = "";
  }

  // ---------- current tab ----------

  async function getCurrent() {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    // tab.url is only visible for YouTube tabs (our only host permission)
    if (!tab || !tab.url || !tab.url.startsWith("https://www.youtube.com/")) {
      return { error: "Ouvre une vidéo ou une chaîne YouTube." };
    }
    try {
      const res = await chrome.tabs.sendMessage(tab.id, { type: "getCurrentChannel" });
      if (res && res.channel) return { channel: res.channel };
      if (res && res.kind === "watch") return { error: "Chaîne pas encore détectée, réessaie dans une seconde." };
      return { error: "Ouvre une vidéo ou une chaîne YouTube." };
    } catch (_) {
      return { error: "Recharge la page YouTube (l'extension vient d'être installée ou mise à jour)." };
    }
  }

  // ---------- rendering ----------

  function renderCurrent() {
    const box = $("#current-box");
    box.textContent = "";
    if (current.error) {
      const p = document.createElement("p");
      p.className = "muted";
      p.textContent = current.error;
      box.append(p);
      return;
    }
    const ch = current.channel;
    const status = store.statusOf(state, ch);
    const entry = store.findIn(state.allow, ch) || store.findIn(state.block, ch);
    box.innerHTML = `
      <p class="chan-name"></p>
      <p class="status ${status}"></p>
      <div class="add-buttons">
        <button type="button" class="btn allow" data-act="allow">✅ Autoriser</button>
        <button type="button" class="btn block" data-act="block">🚫 Blacklister</button>
      </div>`;
    box.querySelector(".chan-name").textContent = (entry && entry.name) || ch.name || ch.handle || ch.id;
    box.querySelector(".status").textContent = STATUS_LABELS[status];
    // "Autoriser" stays enabled on a blacklisted channel on purpose: clicking it earns a roast.
    box.querySelector('[data-act="allow"]').disabled = status === "allowed";
    box.querySelector('[data-act="block"]').disabled = status === "blacklisted";
    box.querySelectorAll("[data-act]").forEach((btn) => btn.addEventListener("click", () => addTo(btn.dataset.act, ch)));
  }

  function renderList(listName) {
    const ul = $(`#${listName}-list`);
    ul.textContent = "";
    $(`#${listName}-count`).textContent = `(${state[listName].length})`;
    const sorted = [...state[listName]].sort((a, b) => (a.name || "").localeCompare(b.name || "", "fr"));
    for (const entry of sorted) {
      const li = document.createElement("li");
      const name = document.createElement("span");
      name.className = "chan";
      name.textContent = entry.name;
      const handle = document.createElement("span");
      handle.className = "muted";
      handle.textContent = entry.handle || "";
      const del = document.createElement("button");
      del.type = "button";
      del.className = "del";
      del.textContent = "✕";
      del.title = listName === "allow" ? "Retirer" : "Retirer (100 000 clics)";
      del.addEventListener("click", () => removeFrom(listName, entry));
      li.append(name, handle, del);
      ul.append(li);
    }
  }

  // Replaced in Task 8.
  function renderStats() {}

  function render() {
    $("#toggle").setAttribute("aria-checked", String(state.enabled));
    renderCurrent();
    renderList("allow");
    renderList("block");
    renderStats();
  }

  function setupTabs() {
    document.querySelectorAll(".tabs button").forEach((btn) => {
      btn.addEventListener("click", () => {
        document.querySelectorAll(".tabs button").forEach((b) => b.classList.toggle("active", b === btn));
        document.querySelectorAll(".tab").forEach((t) => t.classList.toggle("active", t.id === "tab-" + btn.dataset.tab));
      });
    });
  }

  async function init() {
    setupTabs();
    $("#toggle").addEventListener("click", onToggle);
    $("#add-form").addEventListener("submit", onAddSubmit);
    state = await store.load();
    current = await getCurrent();
    render();
  }

  init();
})();
