# Atelier Hub — règles du dépôt

Consulte `README.md` pour les fonctions et les réglages. Contrat commun de la suite (charte, nœud `atelier-node/1`) : `Atelier_Projets/docs/SUITE.md` ; règles de la charte : `Atelier_Deploy/DESIGN.md`.

## Architecture

- `backend/` : Fastify + TypeScript + better-sqlite3. **Routes minces** (`src/routes/`) qui valident puis appellent un service ; logique dans `src/services/` ; règles pures dans `src/domain/` ; lecture des autres apps dans `src/connectors/` uniquement.
- **Le Hub ne recopie aucune donnée des autres apps** et **n'écrit jamais chez elles** : il garde des références (`projects`, `links`) et relit les apps à chaque vue d'ensemble. Toute lecture passe par `connectors/http.ts` (délai `HUB_TIMEOUT_MS`) : une app arrêtée devient un panneau `down`, jamais une erreur de la fiche ; ses éléments épinglés restent affichés.
- Seul `services/projects.ts` écrit dans `projects` et `links`. Migrations dans `db/database.ts` : on n'en modifie jamais une publiée, on en ajoute une.
- Liens profonds : un seul endroit, `domain/links.ts`. Formes de l'API : `domain/types.ts`, recopié à l'identique dans `frontend/src/lib/types.ts` (vérifié par `design.test.ts`).
- Erreurs d'API : `ApiError` → `{ detail, code }`, messages en français. Gardes Host / Origin dans `http/guards.ts` (ne pas assouplir) ; un champ inconnu dans un corps est refusé (422).
- `test/fixtures/suite.ts` est le double de la suite : il sert aux tests **et** à l'aperçu (`scripts/demo-snapshot.ts` → `frontend/src/demo/snapshot.json`). Après un changement de forme de l'API, régénérer l'aperçu.
- `frontend/` : React + Vite, CSS natif. `src/styles/atelier-ds/*`, `src/styles/atelier-brand/*` et `public/atelier-theme.js` sont des **copies verbatim** d'Atelier Projets (`design-system/`) : ne pas les modifier ici. Signature du Hub (`#9a3e6c`, icône `layout-dashboard`) dans `hub-signature.css`, interface dans `hub.css` (aucune couleur littérale : jetons `--app-*`, `--accent*`, `--atelier-*`, `--status-*` seulement ; vérifié par `src/lib/design.test.ts`). La couleur d'une app ne sort pas de son icône ; un état nominal reste neutre.
- Fenêtres (`Modal` de `components/ui.tsx`) : le champ à saisir porte `data-autofocus`, jamais `autoFocus` (sans effet avant `showModal()`) ; le focus revient au déclencheur à la fermeture. Au doigt (`@media (pointer: coarse)` de `hub.css`), toute cible fait au moins 40 px.
- La vue d'ensemble se relit par identifiant de fiche (jamais en dépendant de l'objet fiche : chaque relecture interroge toute la suite) et au retour sur l'onglet (`lib/freshness.ts`). Les horodatages des apps sont en UTC : passer par `localDay` de `lib/format.ts` pour en tirer un jour.
- Mode « demo » (`vite --mode demo`) : `lib/hub-api.ts` choisit `demoApi` (lecture seule) ; routeur par fragment, adresses relatives.

## Méthode

- Interface et messages en français, tutoiement.
- Après chaque changement : `npm run check` (typage + tests). Tout comportement nouveau a un test.
- Commits : `feat(scope): …`, `fix(scope): …`, `chore(scope): …`.
