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

## Exemples de la suite

Au pied de la barre latérale, « Exemples de la suite » ouvre les histoires fictives qui traversent la suite (Studio Garance, Rénovation Urbaine 2026… générées par `Atelier_Deploy/exemples`). Le Hub n'en livre aucune et n'en charge aucune : elles vivent dans les apps, qui les chargent chacune de leur côté. Le Hub, lui :

1. **lit** ce que chaque app en dit (lecture seule, en parallèle, délai borné) et montre, pour l'histoire choisie, où elle est chargée : Convert, Tab, Viz, Nexus, Projets, Wiki. Une app arrêtée le dit sur sa ligne, sans gêner les autres. (Trésorerie fait partie du parcours des histoires, mais le Hub ne la lit pas.)
2. **ouvre l'app** : « Ouvrir » mène à ce qui est chargé (le projet, la page d'entrée du Wiki, les jeux de Viz, l'historique de Convert), « Charger » à l'endroit de l'app où l'on charge l'exemple. Une app qui répond mais ne livre pas l'histoire (dépôt pas encore mis à jour) le dit sur sa ligne, sans lien « Charger » : rien ne peut y être chargé. Au retour sur l'onglet, la fenêtre relit les apps.
3. **crée la fiche** de l'histoire (« Créer la fiche ») : une fiche ordinaire, à son nom, rattachée à ce que les apps ont chargé. Si une app charge l'histoire plus tard (ou si tu as changé depuis un rattachement de la fiche à la main), le bouton devient « Mettre à jour la fiche » ; sinon « Ouvrir la fiche ». Une seule fiche par histoire, marquée « Exemple ».

Retirer l'exemple du Hub, c'est supprimer cette fiche (Modifier → Supprimer la fiche) : les apps gardent ce qu'elles ont chargé, chacune le retire de son côté.

| App | L'histoire y est « chargée » quand… | La fiche s'y rattache par… |
|---|---|---|
| Projets | `charge` de `GET /api/exemples-suite` | l'identifiant du projet (`projectId`) |
| Wiki | `charge` | l'identifiant de l'espace (`spaceId`) |
| Tab | l'index contient des tables `tbl_ex_<histoire>_<n>` | le nom de leur projet Tab |
| Viz | `charge` | le mot-clé de la fiche (le titre de l'histoire figure dans le nom des jeux et du rapport « Exemple — … ») |
| Convert | une conversion porte le titre de l'histoire (« Relevé octobre 2026 — Studio Garance ») | le même mot-clé |
| Nexus | des workflows `[exemple:<histoire>]` existent | rien (la fiche montre les agents, pas les workflows) |

« Mettre à jour la fiche » remet les rattachements Projets, Wiki et Tab sur ce que les apps ont chargé pour l'histoire ; un rattachement dont l'app n'a rien chargé (ou ne répond pas) n'est pas touché, ni le nom, la description, les mots-clés ou les éléments épinglés.

## Présentations

Depuis une fiche, « Présentations » ouvre ses présentations : des diapositives 16:9 bâties sur ce que le Hub lit du projet, lues dans le Hub, montrées en plein écran, exportées en PDF. Pas de fichier PowerPoint.

- **Nouvelle présentation** : le Hub lit la fiche et propose le plan, sans IA et toujours dans le même ordre : titre, synthèse, chiffres clés, avancement des features, en cours et points de blocage, jalons, documentation, rapports (plus une diapositive par rapport épinglé, 3 au plus), tables, conversions, agents, sources. Une section n'entre que si la fiche a quelque chose à y montrer ; celles de Projets, du Wiki, de Viz et de Tab entrent aussi quand leur app ne répond pas ce jour-là (la diapositive le dit, puis se remplit). « Vide » ne crée que la diapositive de titre.
- **Lire** : les diapositives s'empilent dans l'ordre. Viz et Tab y sont des chiffres et des listes (ceux que la fiche montre déjà), avec le lien vers le rapport ou vers l'app ; aucune image n'est reprise. Une app arrêtée garde sa diapositive (icône éteinte, message en rouge).
- **Présenter** : plein écran, une diapositive à la fois. → ↓ PageDown Espace Entrée avancent, ← ↑ PageUp Maj+Espace reculent, Début / Fin, Échap quitte ; au doigt, les boutons de la barre du bas. Sur un téléphone tenu debout, la diapositive prend l'écran et défile. Les chiffres sont ceux lus à l'ouverture.
- **Exporter en PDF** : ouvre l'impression du navigateur ; choisis « Enregistrer au format PDF ». Une diapositive par page 16:9, en clair même si le Hub est en sombre, sous le nom « Titre — Fiche ». Si le navigateur ignore la taille de page demandée, choisis le paysage : une diapositive par page, jamais coupée. Vérifié dans Chromium ; pas encore dans Safari ni Firefox.
- **Modifier** : sous chaque diapositive, son titre et son texte (600 caractères, paragraphes et listes « - »), enregistrés à la sortie du champ ; « Phrase automatique » et un titre vidé reviennent à l'automatique. Monter, descendre, supprimer, « Ajouter une diapositive » (texte libre, ou une sorte qui lit la fiche — toute la liste, ou une seule page, un seul rapport, une seule table…) : tout se fait au clavier. La sorte d'une diapositive et l'élément qu'elle vise ne changent pas : on la supprime et on en ajoute une.

### Texte rédigé contre chiffres vivants

| | Ce que c'est | Où ça vit | Fraîcheur |
|---|---|---|---|
| **Structure** | quelles diapositives, dans quel ordre, de quelle sorte, visant quel élément | base du Hub (`presentations`, `slides`) | contenu du Hub |
| **Texte rédigé** | le titre et le texte que tu as écrits | base du Hub (`slides.title`, `slides.body`), avec sa provenance et sa date | **daté**, jamais mis à jour tout seul |
| **Chiffres vivants** | cartes de chiffres, listes, états, liens, titre automatique, phrase automatique | **nulle part** : calculés à chaque lecture, les apps sont relues | toujours du jour |

Une diapositive **référence, elle ne copie pas** : elle garde sa sorte et, si elle vise un élément, son identifiant dans son app et son libellé au moment du choix (affiché si l'app ne répond pas, comme pour un élément épinglé). Aucun chiffre, aucune ligne, aucun extrait n'entre dans la base. Un titre ou un texte laissé vide est **automatique** : relu et recalculé à chaque ouverture, donc toujours juste. Ce que tu écris, lui, reste tel quel : l'éditeur le rappelle sous le champ (« Ton texte, modifié le 12 nov. »). Si un élément visé n'est plus dans la fiche, sa diapositive le dit au lieu de montrer un ancien chiffre.

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

Aperçu sans la suite (données d'exemple « KPI CGO » et fiche de l'histoire « Studio Garance », lecture seule : « Exemples de la suite » s'y consulte, « Créer la fiche » y est inactif) :

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
| Projets, Wiki, Viz, Convert, Nexus | `GET /api/exemples-suite` (histoires d'exemple et ce que l'app en a chargé) ; Convert : aussi `GET /api/conversions` |
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
| `GET /api/exemples-suite` | Histoires d'exemple lues dans les apps : où chacune est chargée (`loaded` / `absent` / `unavailable` : l'app ne livre pas cette histoire, rien à y charger / `down`), lien vers l'app, fiche du Hub si elle existe |
| `POST /api/exemples-suite/:histoire` | Sans corps (tout champ est refusé, 422). Crée la fiche de l'histoire (201) ou la remet sur ce que les apps ont chargé depuis (200) ; les apps sont relues, rien n'y est écrit. Pas de `DELETE` : la fiche se supprime comme une autre |
| `GET /api/projects/:id/presentations` | Présentations d'une fiche, les plus récentes d'abord (les apps ne sont pas lues) |
| `POST /api/projects/:id/presentations` | `{ title?, plan? }` : crée une présentation. `plan` (vrai par défaut) : le Hub lit la fiche et bâtit le plan ; faux : la seule diapositive de titre |
| `GET /api/presentations/:pid` | Présentation **résolue** : chaque diapositive enregistrée, plus sa partie vivante (`live` : cartes, lignes, lien, état, titre et phrase automatiques) relue dans les apps |
| `PATCH /api/presentations/:pid`, `DELETE /api/presentations/:pid` | Renommer (`{ title }`), supprimer. Supprimer une fiche supprime ses présentations |
| `POST /api/presentations/:pid/slides` | `{ kind, title?, body?, ref?, ref_label?, after? }` : ajoute une diapositive (40 au plus, 409 au-delà). `ref` seulement pour `wiki`, `viz`, `tab`, `convert`, `nexus`, avec `ref_label` |
| `PATCH /api/presentations/:pid/slides/:sid` | `{ title?, body? }` : vide ou `null` = automatique ; un texte écrit devient `manual`, daté. La sorte et l'élément visé ne changent pas |
| `DELETE /api/presentations/:pid/slides/:sid`, `PUT /api/presentations/:pid/order` | Supprimer une diapositive ; nouvel ordre `{ slide_ids }` (chaque diapositive une seule fois, 422 sinon) |
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
  src/connectors/  lecteurs des apps (HTTP borné, index Tab, exemples de la suite), jamais d'écriture
  src/domain/      règles pures : mots-clés, synthèse Projets, classement des agents, liens profonds, exemples,
                   diapositives (slides.ts : partie vivante de chaque sorte ; plan.ts : plan proposé)
  src/services/    fiches et épinglés, vue d'ensemble, catalogue « Lier », exemples de la suite,
                   présentations (presentations.ts : seul à écrire ; decks.ts : lecture résolue)
  test/fixtures/   double de la suite (aussi utilisé pour l'aperçu)
frontend/  React + TypeScript + Vite, CSS natif
  src/views/ProjectView.tsx   la fiche et ses panneaux
  src/components/ExamplesDialog.tsx   « Exemples de la suite » (règles : src/lib/examples.ts)
  src/views/PresentationsView.tsx, DeckView.tsx   présentations d'une fiche, lecture et édition d'une présentation
  src/components/Slide.tsx, Presenter.tsx, SlideEditor.tsx   la diapositive, le plein écran, l'éditeur
                              (règles : src/lib/deck.ts, presenter.ts, print.ts ; styles : src/styles/slides.css)
  src/lib/                    API, aperçu, frise, mise en forme, routeur
```
