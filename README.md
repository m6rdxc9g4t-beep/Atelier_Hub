# Atelier Hub

Une fiche par projet qui rassemble ce que la Suite Atelier en sait, sur un seul écran, à un clic de chaque app :

| Panneau | Ce qu'il montre | Un clic ouvre… |
|---|---|---|
| **Chiffres clés** | temps passé / estimé, features terminées, éléments en cours (dont bloqués), prochaine échéance | — |
| **Projets** | frise des features (début → échéance, avancement, heures), éléments en cours, jalons | l'élément dans Atelier Projets |
| **Wiki** | pages de l'espace rattaché, les plus récentes d'abord (3 affichées, « Tout afficher ») | la page dans Atelier Wiki |
| **Sources** | bases, dossiers, dépôts, présentations : saisis à la main, dépôts du projet Projets, jeux de Viz | l'adresse (un chemin local se copie) |
| **Convert** | historique des conversions du projet (et la table Tab où elles sont parties) | la conversion dans Atelier Convert |
| **Tab** | tables du projet Tab rattaché | Atelier Tab |
| **Viz** | rapports du projet | le rapport dans Atelier Viz |
| **Nexus** | agents qui savent lire les apps de la fiche, avec la raison (« Lit Viz, Tab ») | l'agent dans Atelier Nexus |

Le Hub ne recopie aucune donnée : il garde des **références** (projet Projets, espace Wiki, projet Tab, éléments épinglés, sources) et relit les apps à chaque ouverture de fiche, en parallèle et avec un délai borné. Quand tu reviens sur l'onglet du Hub après un passage dans une app, la fiche se relit toute seule si sa lecture date de plus de 30 secondes (le bouton « Actualiser » dit l'heure de la dernière lecture). Une app arrêtée garde son panneau (icône éteinte, message en rouge) et ses éléments épinglés restent cliquables.

## Comment une fiche trouve ses éléments

1. **Rattachements** (bandeau sous le titre) : un projet d'Atelier Projets, un espace du Wiki, un projet de Tab.
2. **Épinglés** (« + » de chaque panneau, ou « Lier un élément ») : une page, un rapport, un jeu de données, une table, une conversion, un agent.
3. **Mots-clés** de la fiche (par défaut son nom) : un rapport, une table, une conversion ou un jeu de Viz dont le nom les contient apparaît aussi (mots entiers, sans casse ni accents : « KPI CGO » trouve « KPI CGO — Tableau mensuel » et `kpi_cgo_budget_2026`). Sans espace Wiki rattaché, le Wiki est cherché avec le premier mot-clé.

## Lancer en local

```bash
npm ci
npm run dev        # interface http://127.0.0.1:5179, API http://127.0.0.1:3700
```

Version compilée, servie par le backend seul :

```bash
npm run build
npm start          # http://127.0.0.1:3700
```

Aperçu sans la suite (données d'exemple « KPI CGO », lecture seule) :

```bash
cd backend && npx tsx scripts/demo-snapshot.ts && cd ..   # régénère frontend/src/demo/snapshot.json
npm run build:demo                                         # frontend/dist-demo/, à ouvrir avec n'importe quel serveur statique
```

## Réglages (variables d'environnement du backend)

| Variable | Défaut | Rôle |
|---|---|---|
| `HOST` / `PORT` | `127.0.0.1` / `3700` | Adresse d'écoute |
| `HUB_DATA_DIR` | `backend/data` | Base SQLite (`hub.db`) |
| `HUB_STATIC_DIR` | `frontend/dist` s'il existe | Interface compilée (vide = API seule) |
| `ALLOWED_HOSTS` | (vide) | Hôtes publics acceptés en plus du bouclage (ex. `hub.atelier.mondomaine.fr`) |
| `HUB_TIMEOUT_MS` | `2500` | Délai maximal d'une lecture dans une autre app |
| `PROJETS_API_URL` / `PROJETS_URL` | `http://127.0.0.1:3000` / `http://127.0.0.1:4174` | Atelier Projets : API lue / interface ouverte |
| `WIKI_API_URL` / `WIKI_URL` | `http://127.0.0.1:3200` / idem | Atelier Wiki |
| `VIZ_API_URL` / `VIZ_URL` | `http://127.0.0.1:8000` / idem | Atelier Viz |
| `CONVERT_API_URL` / `CONVERT_URL` | `http://127.0.0.1:8010` / idem | Atelier Convert |
| `NEXUS_API_URL` / `NEXUS_URL` | `http://127.0.0.1:8100` / `http://127.0.0.1:3100` | Atelier Nexus |
| `TAB_EXPORTS_DIR` / `TAB_URL` | `~/Atelier_Tab/exports` / `http://127.0.0.1:4175` | Atelier Tab (index `_atelier/index.json`, §7.3) |

Sur le VPS : les `*_API_URL` restent en bouclage, les `*_URL` deviennent les sous-domaines de la suite. Adresses du sélecteur « Suite Atelier » (compilées dans l'interface) : `VITE_ATELIER_*_URL`, comme dans les autres apps.

## Ce que le Hub lit dans chaque app (lecture seule)

| App | Routes |
|---|---|
| Projets | `GET /api/atelier/projects`, `…/projects/{id}/work-items`, `…/projects/{id}/milestones` (nœud `atelier-node/1`) |
| Wiki | `GET /api/atelier/spaces`, `GET /api/atelier/pages?space_id=`, `POST /api/atelier/search` |
| Viz | `GET /api/reports`, `GET /api/datasets` |
| Convert | `GET /api/conversions` |
| Nexus | `GET /api/agents` |
| Tab | fichier `<TAB_EXPORTS_DIR>/_atelier/index.json` |

## Liens profonds

Un clic ouvre l'élément dans son app :

| App | Adresse envoyée | Lue par |
|---|---|---|
| Projets | `?projet=<id>` et `?projet=<id>&element=<id>` | `frontend/src/lib/deep-link.ts` d'Atelier Projets (projet, puis fiche de l'élément) |
| Wiki | `/p/<id>` | routeur du Wiki |
| Viz | `#/rapports/<id>`, `#/donnees` | routeur de Viz |
| Convert | `#/conversions/<id>`, `#/historique` | routeur de Convert |
| Nexus | `?agent=<nom>` | `Workspace.tsx` d'Atelier Nexus (conversation avec cet agent) |

Tab (app de bureau) n'a pas d'adresse par table : le clic ouvre Tab. Toutes ces adresses sont construites à un seul endroit, `backend/src/domain/links.ts`.

## API du Hub

| Route | Rôle |
|---|---|
| `GET/POST /api/projects`, `GET/PATCH/DELETE /api/projects/:id` | Fiches (nom, description, mots-clés, rattachements `projets_id`, `wiki_space_id`, `tab_project`) |
| `GET /api/projects/:id/overview` | Vue d'ensemble (panneaux, chiffres clés) |
| `POST /api/projects/:id/links`, `DELETE /api/projects/:id/links/:linkId` | Épingler / retirer (`app` : `wiki`, `viz`, `tab`, `convert`, `nexus`, `source`) |
| `GET /api/catalog/:app?q=` | Ce qu'une app propose de rattacher ou d'épingler |
| `GET /api/health` | `{ status: "ok", app: "atelier-hub" }` |

Erreurs `{ detail, code }` en français. Gardes Host / Origin comme le Wiki (hôte inconnu ou écriture d'une autre origine → 403).

## Charte

Charte v2 « Linear » de la suite (`Atelier_Deploy/DESIGN.md`) : copies verbatim du design system et de la marque d'Atelier Projets (`frontend/src/styles/atelier-ds/`, `atelier-brand/`, `public/atelier-theme.js`), signature **prune `#9a3e6c`** (accent seulement) et icône Lucide `layout-dashboard`. La signature n'est pas encore dans la source commune : elle est déclarée dans `hub-signature.css`, à reporter en `--atelier-sig-hub` dans Atelier Projets et dans le portail. Chaque panneau porte l'icône de son app ; plat au repos, chiffres dans des cartes `.atelier-kpi`.

## Vérifier

```bash
npm run check      # typage + tests (backend et frontend)
```

## Comment c'est construit

```
backend/   Fastify + TypeScript + SQLite (better-sqlite3)
  src/connectors/  lecteurs des apps (HTTP borné, index Tab), jamais d'écriture
  src/domain/      règles pures : mots-clés, synthèse Projets, classement des agents, liens profonds
  src/services/    fiches et épinglés, vue d'ensemble, catalogue « Lier »
  test/fixtures/   double de la suite (aussi utilisé pour l'aperçu)
frontend/  React + TypeScript + Vite, CSS natif
  src/views/ProjectView.tsx   la fiche et ses panneaux
  src/lib/                    API, aperçu, frise, mise en forme, routeur
```
