# Brainrot Blocker — Design V1

**Date :** 2026-10-04
**Statut :** validé en brainstorming, en attente de relecture
**Utilisateur :** Victor uniquement (usage perso, navigateur Brave, extension chargée en mode développeur)

## 1. Objectif

Extension Chrome (Manifest V3) qui fait tourner YouTube en mode **allow-only** : toutes les chaînes sont bloquées par défaut, seules les chaînes de l'allowlist sont visibles et regardables. Une **blacklist** de chaînes de divertissement empêche de les autoriser et déclenche des roasts. Tout ce qui permet de "tricher" (désactiver l'extension, retirer une chaîne de la blacklist) est rendu quasi impossible via un carré à cliquer 100 000 fois.

**Succès =** Victor ne peut plus regarder une vidéo d'une chaîne non autorisée sur YouTube sans désinstaller/désactiver l'extension depuis `brave://extensions`.

### Hors scope V1
- Blocage d'autres sites (réseaux sociaux, Amazon, etc.)
- Horaires / sessions de focus (l'extension tourne en continu)
- Masquage des recommandations, commentaires, etc. (déjà géré par l'extension Unhook)
- Vidéos YouTube intégrées (embeds) sur d'autres sites
- Synchro entre navigateurs, import/export
- Publication sur le Chrome Web Store

## 2. Stack et contraintes

- Manifest V3, **JavaScript pur** (pas de framework, pas de bundler, pas de build). Chargement via "Charger l'extension non empaquetée".
- Permissions : `storage` + host permission `https://www.youtube.com/*` (suffit pour lire l'URL de l'onglet YouTube actif et parler au content script ; pas besoin de `tabs`).
- Aucune dépendance externe.

## 3. Architecture

```
manifest.json
content/
  hide.css        injecté à document_start : cache Shorts + toutes les vignettes par défaut
  rules.js        règles pures (type de page, verdict page, visibilité vignette) — testables sous Node
  youtube.js      branchement DOM : détection de chaîne, révélation des vignettes, écran de blocage
popup/
  popup.html / popup.css / popup.js   3 onglets + interrupteur ON/OFF
shared/
  storage.js      lecture/écriture de l'état, helpers (isAllowed, addToAllow, logAttempt…)
  channel.js      normalisation handle/ID, résolution @handle -> {id, name} via fetch
  clicker.js      composant "carré des 100 000 clics"
  roasts.js       messages par niveau + choix du niveau selon les tentatives du jour
  charts.js       courbe + barres en SVG fait main
data/
  defaults.js     listes de départ (allow + block) avec IDs UC… vérifiés
```

Sans bundler, un content script ne peut pas importer de JSON ni de module ES : chaque fichier partagé s'enregistre sur un namespace global `BB` (`globalThis.BB.channel`, `BB.store`…) et exporte aussi via `module.exports` pour les tests Node. C'est pour ça que les défauts sont en `.js` et non en `.json`.

Pas de service worker en V1 (pas nécessaire : le popup et le content script lisent `chrome.storage` directement).

## 4. Modèle de données (`chrome.storage.local`)

```js
{
  enabled: true,
  allow: [{ id: "UC…", handle: "@apple", name: "Apple", addedAt: 1759… }],
  block: [{ id: "UC…", handle: "@cyprien", name: "Cyprien", addedAt: 1759… }],
  attempts: [{ type: "off" | "allowBlocked" | "unblock" | "visitBlocked", at: 1759… }],
  history: [{ at: 1759…, allow: 25, block: 30 }]
}
```

- Handles stockés en minuscules (YouTube est insensible à la casse), avec le `@`.
- Une chaîne est "reconnue" si son `id` **ou** son `handle` correspond (un handle peut avoir des alias, ex. `@OuahLeouff` / `@OuahMG` → même ID).
- `history` : une entrée ajoutée à chaque modification d'une des deux listes.
- Au premier lancement (`allow` absent), l'état est initialisé depuis `data/defaults.js` (avec `addedAt: null`, pour ne pas compter les défauts dans « ajoutées cette semaine ») avec une première entrée `history`.
- Invariant : une chaîne ne peut pas être dans les deux listes. Blacklister une chaîne autorisée la retire de l'allowlist.

## 5. Blocage sur YouTube (content script)

### Détection de la chaîne
- **Page chaîne** (`/@handle…`, `/channel/UC…`) : depuis l'URL.
- **Page vidéo** (`/watch`) : depuis le lien de la chaîne dans le bloc propriétaire sous la vidéo (`href` en `/@handle` ou `/channel/UC…`).
- **Vignettes** (accueil, recherche, suggestions, abonnements, onglets de chaîne) : depuis le lien de la chaîne contenu dans chaque vignette.
- YouTube est une SPA : le script réagit à l'événement `yt-navigate-finish` et observe le DOM via `MutationObserver` pour les vignettes chargées au scroll.

### Règles
| Situation | Résultat |
|---|---|
| Vignette d'une chaîne autorisée | révélée (classe CSS ajoutée) |
| Toute autre vignette | reste cachée |
| Vignette dont la chaîne n'est pas identifiable (mix, playlist…) | reste cachée (**fail closed**) |
| Page vidéo/chaîne non autorisée | écran de blocage plein écran, vidéo en pause + mute, bouton "Retour" |
| Page vidéo/chaîne blacklistée | écran de blocage + roast, log `visitBlocked` |
| URL `/shorts/…` | bloquée dans tous les cas |
| Shorts dans les feeds / sidebar | cachés par CSS |
| `enabled === false` | aucun blocage (sauf Shorts, toujours cachés) |

- L'écran de blocage **n'a pas** de bouton "Autoriser" (ajout uniquement depuis le popup).
- Le content script écoute `chrome.storage.onChanged` pour réappliquer les règles sans recharger la page.
- Le content script répond au message `getCurrentChannel` du popup avec `{ id, handle, name }` ou `null`.

## 6. Popup

### En-tête
Interrupteur ON/OFF. ON → OFF ouvre le carré des clics (et log `off`). OFF → ON est immédiat.

### Onglet "Actuel"
- Si l'onglet actif est une page YouTube vidéo/chaîne : nom de la chaîne + statut (✅ autorisée / ⛔ bloquée / 🚫 blacklistée).
- Boutons "✅ Autoriser" et "🚫 Blacklister", effet **instantané**.
- "Autoriser" sur une chaîne blacklistée → refus + roast, log `allowBlocked`.
- Hors YouTube : message "Ouvre une vidéo ou une chaîne YouTube".

### Onglet "Listes"
- Champ "Ajouter @handle" + boutons Autoriser / Blacklister. Résolution via `fetch("https://www.youtube.com/@handle")` et extraction de `externalId` et du titre ; erreur claire si introuvable.
- Allowlist : chaque chaîne a un ✕ qui la retire **immédiatement**.
- Blacklist : le ✕ ouvre le carré des clics (log `unblock`) ; la chaîne n'est retirée qu'à 100 000.

### Onglet "Stats"
- Chiffres : nb chaînes allow, nb chaînes block, chaînes ajoutées cette semaine (par liste), tentatives aujourd'hui, tentatives totales.
- Courbe SVG : évolution de `allow` et `block` dans le temps (depuis `history`).
- Barres SVG : tentatives par jour sur les 14 derniers jours.

## 7. Le carré des 100 000 clics (`shared/clicker.js`)

- Composant réutilisable : `openClicker({ goal: 100000, onSuccess })`.
- Affiche un carré cliquable, un compteur `n / 100 000` et un roast qui change tous les 100 clics.
- Ne compte que les clics avec `event.isTrusted === true`.
- Rate limit : au plus 10 clics comptés par seconde (≥ 100 ms entre deux clics comptés).
- Le carré change de position aléatoire tous les 500 clics (anti auto-clicker à position fixe).
- **Progression jamais persistée** : fermer le popup remet à zéro.
- À 100 000 : `onSuccess()` est exécuté (désactivation ou retrait de la blacklist).

## 8. Roasts (`shared/roasts.js`)

Niveau = nombre de tentatives (`attempts`) **du jour** (minuit local), tous types confondus :

| Tentatives aujourd'hui | Niveau | Ton |
|---|---|---|
| 1 | 1 | sec ("Non. Retourne bosser.") |
| 2–3 | 2 | moqueur |
| 4–6 | 3 | agressif |
| 7+ | 4 | brutal, dans l'esprit du message original de Victor (brainrot, sous-merde soumise à l'algo YouTube) |

- ~5 messages par niveau, tirés au hasard.
- Chaque roast affiche "Tentative n°X aujourd'hui".
- Déclencheurs : ouverture du carré OFF, tentative d'autoriser une chaîne blacklistée, ouverture du carré de retrait de blacklist, visite d'une vidéo/chaîne blacklistée.

## 9. Listes par défaut (`data/defaults.js`)

Les IDs `UC…` sont résolus et vérifiés à l'implémentation.

### Allowlist (26)
`@Apple`, `@Matis_cl`, `@ArthurFmv`, `@ArthurSansFiltre`, `@EnzoMahoudeaux`, `@Sebastien.selfmadeprogram`, `@Shubham_Sharma`, `@theodrcn`, `@taysthetic`, `@BenHeath`, `@Notion`, `@lucid_life01`, `@Lucas_HOF`, `@julienOpal`, `@TED`, `@mickaelwu`, `@claude`, `@PrinceEa`, `@anthonybourbon1`, `@landonlimited`, `@Photoroom`, `@maxwellcopy`, `@jokariz6803`, `@Bigslaay`, `@Hasheur`, `@LeoDuff`

### Blacklist
- **Divertissement :** `@cyprien`, `@superkevintran` (ex-Le Rire Jaune), `@superkevintranlempereur`, `@HenryTran`, `@melvynxdev`
- **Clash Royale FR :** `@Ashtax`, `@OuahLeouff`, `@trapaCoC`, `@mohamedlight4980`
- **Clash Royale officiel / EN / pros :** `@ClashRoyale`, `@EsportsRoyale`, `@orangejuice`, `@ChiefPat`, `@MOLT`, `@ClashWithCam`, `@BenTimm1`, `@Eclihpse`, `@SurgicalGoblin`, `@mortenroyale`, `@Ian77-ClashRoyale`, `@ryleycr1`, `@oyassuuCR`, `@Mugi_CR`, `@bradcr`, `@SirTagCR`, `@JudoSloth`, `@KairosGaming`, `@Jynxzi`

Rappel : en mode allow-only, ces chaînes sont déjà bloquées. La blacklist sert à **empêcher de les autoriser** et à déclencher les roasts.

## 10. Gestion d'erreurs

- Résolution d'un `@handle` impossible (réseau, chaîne inexistante) → message dans le popup, rien n'est ajouté.
- Doublon (chaîne déjà dans la liste) → message "déjà dans la liste".
- Changement du DOM de YouTube qui casse la détection → les vignettes restent cachées (fail closed) ; la détection est isolée dans des fonctions dédiées pour être facile à corriger.

## 11. Tests

- **Logique pure** (`storage.js` helpers de correspondance, `roasts.js` choix du niveau, `channel.js` normalisation et parsing HTML, rate limit de `clicker.js`) : tests unitaires avec `node --test` (aucune dépendance).
- **Intégration YouTube** : checklist manuelle dans Brave (accueil, recherche, vidéo autorisée, vidéo non autorisée, vidéo blacklistée, page chaîne, Shorts, navigation SPA, scroll infini, OFF/ON, ajout/retrait depuis le popup).

## Limite connue

Une extension ne peut pas empêcher sa propre désactivation depuis `brave://extensions`. Accepté pour V1 (usage perso).
