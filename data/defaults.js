// Default lists installed on first run. IDs resolved from youtube.com on 2026-10-04.
(function (root) {
  "use strict";

  const defaults = {
    allow: [
      { id: "UCE_M8A5yxnLfW0KghEeajjw", handle: "@apple", name: "Apple" },
      { id: "UCkB6qN-IeFNsBSj1aT7yZnQ", handle: "@matis_cl", name: "Matis Clouet" },
      { id: "UCvkyo1Q0B-l9e_4yBY4UEYw", handle: "@arthurfmv", name: "Arthur" },
      { id: "UCR9ioNT5pWkzKw9BcRe5DiQ", handle: "@arthursansfiltre", name: "ArthurSansFiltre" },
      { id: "UC8lpl3qqR5sqLQhtimtQ0Gg", handle: "@enzomahoudeaux", name: "Enzo Mahoudeaux" },
      { id: "UCR0_xCL9YguqHQoEhZPV3hw", handle: "@sebastien.selfmadeprogram", name: "Self-Made Program | Sébastien" },
      { id: "UCLKx4-_XO5sR0AO0j8ye7zQ", handle: "@shubham_sharma", name: "Shubham SHARMA" },
      { id: "UCKkhgJUqG-HzD13m726-4ww", handle: "@theodrcn", name: "Théodrcn" },
      { id: "UC-EWUG269UNvB2LI78bh54w", handle: "@taysthetic", name: "taysthetic." },
      { id: "UC5Dv8i_vH5M9rB3HOZDCkng", handle: "@benheath", name: "Ben Heath" },
      { id: "UCoSvlWS5XcwaSzIcbuJ-Ysg", handle: "@notion", name: "Notion" },
      { id: "UCC27NaAvcjgwJUxC7dfbU8w", handle: "@lucid_life01", name: "Lucid Life" },
      { id: "UCJoLShltMmdcYh7O4jikOgg", handle: "@lucas_hof", name: "Lucas Hof" },
      { id: "UCvxOHcznnavyowy2WZkMOzQ", handle: "@julienopal", name: "OPAL" },
      { id: "UCAuUUnT6oDeKwE6v1NGQxug", handle: "@ted", name: "TED" },
      { id: "UCwkGQN1N7gncsUA6HltXGpA", handle: "@mickaelwu", name: "Mickaël Wu" },
      { id: "UCV03SRZXJEz-hchIAogeJOg", handle: "@claude", name: "Claude" },
      { id: "UCDgUAAHgsV2fFZQm2fIWBnA", handle: "@princeea", name: "Prince Ea" },
      { id: "UCUlBCcvwXAKKskj3h5n6ziw", handle: "@anthonybourbon1", name: "Anthony Bourbon ⚔️" },
      { id: "UCeNCdeGR9dLrc5kAsAeSKsw", handle: "@landonlimited", name: "LANDON" },
      { id: "UCtiMtERGs1XBNdmrwSW5lIA", handle: "@photoroom", name: "Photoroom" },
      { id: "UCEM2sO7E5KSMIqonVgb98ug", handle: "@maxwellcopy", name: "Max Sturtevant" },
      { id: "UCtSNggS2fln1-a9FVL13g4g", handle: "@jokariz6803", name: "Jokariz" },
      { id: "UCAY5rwrIePDzurGeCo2qRBA", handle: "@bigslaay", name: "Bigslaay" },
      { id: "UChlTcWDE8gd4tsl_L727NrQ", handle: "@hasheur", name: "Hasheur" },
      { id: "UCNiauGTV7XhkOpUAIXod4xA", handle: "@leoduff", name: "Léo Duff" },
    ],
    block: [
      // Entertainment
      { id: "UCyWqModMQlbIo8274Wh_ZsQ", handle: "@cyprien", name: "Cyprien" },
      { id: "UCTt2AnK--mnRmICnf-CCcrw", handle: "@superkevintran", name: "Kevin Tran 陈科伟" },
      { id: "UCYD22MFqaNqXp-ogTMosW_A", handle: "@superkevintranlempereur", name: "Kevin Tran L'Empereur" },
      { id: "UC3DVTbnJNVFbDq1gVLVFdvw", handle: "@henrytran", name: "Henry Tran" },
      { id: "UC5HDIVwuqoIuKKw-WbQ4CvA", handle: "@melvynxdev", name: "Melvynx" },
      // Clash Royale FR
      { id: "UC1q7LRamyojZuAbhsBWWgAA", handle: "@ashtax", name: "Ashtax" },
      { id: "UCvcVcuOdDtu0UCV-YcfUgHA", handle: "@ouahleouff", name: "Ouah Leouff" },
      { id: "UC3xgl_-XSyRjv8C_P4ZX0Zg", handle: "@trapacoc", name: "Trapa" },
      { id: "UCjFrTvMA5zvCnb9EAX9MNVw", handle: "@mohamedlight4980", name: "Mohamed Light" },
      // Clash Royale official / EN / pros
      { id: "UC_F8DoJf9MZogEOU51TpTbQ", handle: "@clashroyale", name: "Clash Royale" },
      { id: "UCL9wK9vQjmgyx7jGt20ZOkg", handle: "@esportsroyale", name: "Clash Royale Esports" },
      { id: "UC3S6nIDGJ5OtpC-mbvFA8Ew", handle: "@orangejuice", name: "Orange Juice Gaming" },
      { id: "UCxNMYToYIBPYV829BJcmUQg", handle: "@chiefpat", name: "Chief Pat" },
      { id: "UCpk3zQzLnN5WwcA8gRcPgiw", handle: "@molt", name: "MOLT" },
      { id: "UCT2x1vuvgYdhk-kQdlzn6yA", handle: "@clashwithcam", name: "Clash with Cam" },
      { id: "UCMYdLBEudBeU-c0AguEaiHA", handle: "@bentimm1", name: "BenTimm1" },
      { id: "UCLAOdac7WmMXQKhOP-8lmrQ", handle: "@eclihpse", name: "Eclihpse" },
      { id: "UCFaV5im11vfhDs1BaaF9a0A", handle: "@surgicalgoblin", name: "Surgical Goblin" },
      { id: "UCn2AA9OCYnZZ1T82RaGUYPw", handle: "@mortenroyale", name: "mortenroyale" },
      { id: "UCraJG1NiZLjNDBQLhUZqWAg", handle: "@ian77-clashroyale", name: "Ian77 - Clash Royale" },
      { id: "UCAw2ZHAIP177ryD3WF9iXmw", handle: "@ryleycr1", name: "Ryley - Clash Royale" },
      { id: "UCe2TWF-BqZUqzEz3dHaYa8g", handle: "@oyassuucr", name: "OYASSUU" },
      { id: "UClWUQjL966gilJUUHBZ5-4g", handle: "@mugi_cr", name: "むぎ" },
      { id: "UCo3ixhcZiwcmwVnqJlFJ2Iw", handle: "@bradcr", name: "B-rad" },
      { id: "UCvje1_OaZUZVZDzxeyOFf6A", handle: "@sirtagcr", name: "SirTagCR - Clash Royale" },
      { id: "UC85aYbNSFjsJdxfpxgQr8tA", handle: "@judosloth", name: "Judo Sloth Gaming" },
      { id: "UCmG2EhfOwSjpPMX4LjGY__A", handle: "@kairosgaming", name: "KairosTime Gaming" },
      { id: "UCjiXtODGCCulmhwypZAWSag", handle: "@jynxzi", name: "Jynxzi" },
    ],
  };

  root.BB = root.BB || {};
  root.BB.defaults = defaults;
  if (typeof module === "object" && module.exports) module.exports = defaults;
})(globalThis);
