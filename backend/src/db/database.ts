// Base SQLite du Hub : les fiches projet et ce qui leur est rattaché.
// Le Hub ne recopie aucune donnée des autres apps : il garde seulement des références (identifiants, chemins, adresses)
// et relit les apps à chaque affichage. Migrations : on n'en modifie jamais une publiée, on en ajoute une.

import Database from 'better-sqlite3'
import { mkdirSync } from 'node:fs'
import { join } from 'node:path'

export type Db = Database.Database

const MIGRATIONS: readonly string[] = [
  // 1 — fiches projet et éléments rattachés
  `
  CREATE TABLE projects (
    id            INTEGER PRIMARY KEY,
    slug          TEXT NOT NULL UNIQUE,
    name          TEXT NOT NULL,
    description   TEXT NOT NULL DEFAULT '',
    keywords      TEXT NOT NULL DEFAULT '',
    projets_id    TEXT,
    projets_name  TEXT,
    wiki_space_id TEXT,
    wiki_space    TEXT,
    tab_project   TEXT,
    created_at    TEXT NOT NULL,
    updated_at    TEXT NOT NULL
  );

  CREATE TABLE links (
    id          INTEGER PRIMARY KEY,
    project_id  INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    app         TEXT NOT NULL,
    kind        TEXT NOT NULL,
    ref         TEXT NOT NULL,
    label       TEXT NOT NULL,
    note        TEXT NOT NULL DEFAULT '',
    position    INTEGER NOT NULL DEFAULT 0,
    created_at  TEXT NOT NULL,
    UNIQUE (project_id, app, kind, ref)
  );
  CREATE INDEX links_project ON links(project_id, app);
  `,
  // 2 — fiche d'une histoire des « Exemples de la suite » : une seule fiche par histoire
  `
  ALTER TABLE projects ADD COLUMN example TEXT;
  CREATE UNIQUE INDEX projects_example ON projects(example) WHERE example IS NOT NULL;
  `,
  // 3 — présentations d'une fiche : structure et texte rédigé seulement (aucune donnée des autres apps)
  `
  CREATE TABLE presentations (
    id          INTEGER PRIMARY KEY,
    project_id  INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    title       TEXT NOT NULL,
    created_at  TEXT NOT NULL,
    updated_at  TEXT NOT NULL
  );
  CREATE INDEX presentations_project ON presentations(project_id, updated_at);

  CREATE TABLE slides (
    id               INTEGER PRIMARY KEY,
    presentation_id  INTEGER NOT NULL REFERENCES presentations(id) ON DELETE CASCADE,
    position         INTEGER NOT NULL,
    kind             TEXT NOT NULL,
    title            TEXT,                          -- NULL : titre automatique, calculé à la lecture
    body             TEXT,                          -- NULL : phrase automatique, calculée à la lecture
    ref              TEXT,                          -- identifiant de l'élément dans son app ; NULL : toute la liste
    ref_label        TEXT,                          -- libellé au moment du choix (affiché si l'app ne répond pas)
    text_source      TEXT NOT NULL DEFAULT 'auto',  -- provenance de body : auto | manual | ollama | claude
    text_model       TEXT,
    text_at          TEXT,
    created_at       TEXT NOT NULL,
    updated_at       TEXT NOT NULL
  );
  CREATE INDEX slides_presentation ON slides(presentation_id, position);
  `,
]

export function migrate(db: Db): void {
  const current = db.pragma('user_version', { simple: true }) as number
  for (let version = current; version < MIGRATIONS.length; version++) {
    db.transaction(() => {
      db.exec(MIGRATIONS[version]!)
      db.pragma(`user_version = ${version + 1}`)
    })()
  }
}

export function openDatabase(dataDir: string | ':memory:'): Db {
  let db: Db
  if (dataDir === ':memory:') db = new Database(':memory:')
  else {
    mkdirSync(dataDir, { recursive: true })
    db = new Database(join(dataDir, 'hub.db'))
    db.pragma('journal_mode = WAL')
  }
  db.pragma('foreign_keys = ON')
  migrate(db)
  return db
}
