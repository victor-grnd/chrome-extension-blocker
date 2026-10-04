// Roast messages, escalating with the number of cheating attempts today.
(function (root) {
  "use strict";

  const ROASTS = {
    1: [
      "Non. Retourne bosser.",
      "Tu sais très bien pourquoi tu as installé cette extension.",
      "Ferme cet onglet et ouvre ton éditeur de code.",
      "Pas aujourd'hui. Au travail.",
      "Ton futur toi te regarde. Il est déçu.",
    ],
    2: [
      "Encore toi ? T'as vraiment rien de mieux à faire ?",
      "Ah oui, la petite vidéo « juste 5 minutes ». On connaît la chanson.",
      "Bravo, tu viens de perdre 30 secondes. Tu veux en perdre 3 heures ?",
      "L'algo siffle et tu accours. Bon toutou.",
      "Ton compte en banque ne te remercie pas pour cette pause.",
    ],
    3: [
      "Sérieusement ? Tes concurrents bossent pendant que tu cherches du divertissement.",
      "Chaque clic ici, c'est un projet que tu ne finiras jamais.",
      "T'as la discipline d'un poisson rouge sous caféine.",
      "Le brainrot t'appelle et tu décroches à la première sonnerie. Pathétique.",
      "Tu veux vraiment rester « quelqu'un qui avait du potentiel » ? Retourne bosser.",
    ],
    4: [
      "Espèce de grosse merde, retourne travailler au lieu de faire du brainrot comme une sous-merde soumise à l'algo YouTube.",
      "Sous-merde soumise à l'algo, ferme YouTube et va coder.",
      "T'as rien dans le crâne à part des Shorts ? Retourne bosser, grosse merde.",
      "L'algo YouTube a gagné et toi t'as perdu. Grosse merde.",
      "Encore une tentative ? T'es la définition du brainrot. Retourne travailler, sous-merde.",
    ],
  };

  function levelFor(count) {
    if (count >= 7) return 4;
    if (count >= 4) return 3;
    if (count >= 2) return 2;
    return 1;
  }

  function pickRoast(count, rand) {
    const r = typeof rand === "function" ? rand : Math.random;
    const list = ROASTS[levelFor(count)];
    return list[Math.floor(r() * list.length) % list.length];
  }

  function attemptLabel(count) {
    return "Tentative n°" + count + " aujourd'hui";
  }

  const api = { ROASTS, levelFor, pickRoast, attemptLabel };
  root.BB = root.BB || {};
  root.BB.roasts = api;
  if (typeof module === "object" && module.exports) module.exports = api;
})(globalThis);
