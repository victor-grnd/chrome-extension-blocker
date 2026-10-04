# Brainrot Blocker

Extension navigateur (Brave / Chrome) qui fait tourner YouTube en mode **allow-only** : toutes les chaînes sont bloquées sauf celles de ton allowlist.

- Les vignettes des chaînes non autorisées sont cachées partout (accueil, recherche, suggestions, abonnements).
- Une vidéo ou une page de chaîne non autorisée est recouverte d'un écran de blocage.
- Les Shorts sont toujours bloqués.
- Une **blacklist** empêche d'autoriser certaines chaînes et déclenche des roasts de plus en plus violents.
- Désactiver l'extension ou retirer une chaîne de la blacklist demande **100 000 clics**.
- Onglet Stats : évolution des listes et tentatives de triche.

## Installation (mode développeur)

1. Ouvre `brave://extensions` (ou `chrome://extensions`).
2. Active **Mode développeur**.
3. **Charger l'extension non empaquetée** → sélectionne ce dossier.
4. Recharge les onglets YouTube déjà ouverts.

Après une modification du code : bouton ↻ sur la carte de l'extension, puis recharge YouTube.

## Tests

```bash
npm test
```

Aucune dépendance : les tests utilisent le runner intégré de Node (`node --test`).

## Structure

| Dossier | Rôle |
|---|---|
| `content/` | Script injecté dans YouTube (règles, CSS, overlay) |
| `popup/` | Interface de l'extension |
| `shared/` | Logique partagée (chaînes, état, roasts, clicker, graphiques) |
| `data/defaults.js` | Listes par défaut |
| `docs/superpowers/` | Spec et plan d'implémentation |
