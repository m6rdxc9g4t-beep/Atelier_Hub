// Fiche projet : en-tête et rattachements, chiffres clés, puis un panneau par app de la suite.
// Disposition reprise du croquis : Wiki · Projets · Sources, puis Convert · Tab · Viz, puis Nexus sur toute la largeur.

import {
  ArrowRight,
  Bot,
  Copy,
  Database,
  FileText,
  Folder,
  FolderGit2,
  Layers,
  Link2,
  Pencil,
  Presentation,
  RefreshCw,
  ShieldCheck,
  Plus,
  Pin,
  X,
} from 'lucide-react'
import { useState, type ReactNode } from 'react'

import { AppTile } from '../components/AppGlyph.tsx'
import { Panel, PanelEmpty, Row, RowList } from '../components/Panel.tsx'
import { ExtLink } from '../components/ExtLink.tsx'
import { useUi } from '../components/ui.tsx'
import { count, dueIn, hours, plural, relativeDay, shortDate, STATUS_LABELS, STATUS_VARS, TYPE_LABELS } from '../lib/format.ts'
import { clockTime } from '../lib/freshness.ts'
import { buildTimeline } from '../lib/timeline.ts'
import type { AppId, HubLink, LinkApp, Overview, SourceItem, SourceKind, WorkItem } from '../lib/types.ts'

export interface ProjectActions {
  link: (app: AppId) => void
  unpin: (link: HubLink) => void
  addSource: () => void
  edit: () => void
  refresh: () => void
}

const findLink = (links: readonly HubLink[], app: LinkApp, kind: string, ref: string) => links.find((l) => l.app === app && l.kind === kind && l.ref === ref)

// ── En-tête ─────────────────────────────────────────────────────────────────

function Bindings({ overview, actions }: { overview: Overview; actions: ProjectActions }) {
  const p = overview.project
  const chips: { app: AppId; label: string; value: string | null }[] = [
    { app: 'projets', label: 'Projets', value: p.projets_name ?? (p.projets_id ? `n° ${p.projets_id}` : null) },
    { app: 'wiki', label: 'Wiki', value: p.wiki_space },
    { app: 'tab', label: 'Tab', value: p.tab_project },
  ]
  return (
    <ul className="bindings" aria-label="Rattachements">
      {chips.map((c) => (
        <li key={c.app}>
          <button type="button" className={`binding${c.value ? '' : ' binding--empty'}`} onClick={() => actions.link(c.app)} title={c.value ? `Changer le rattachement ${c.label}` : `Rattacher ${c.label}`}>
            <AppTile id={c.app} />
            <span className="binding__app">{c.label}</span>
            <span className="binding__value">{c.value ?? 'non rattaché'}</span>
          </button>
        </li>
      ))}
      <li className="bindings__keywords" title="Mots-clés : une table, un rapport ou une conversion dont le nom les contient apparaît dans la fiche">
        Mots-clés : {p.keywords.trim() || p.name}
      </li>
    </ul>
  )
}

function Kpis({ overview, today }: { overview: Overview; today: string }) {
  const k = overview.kpis
  if (!k) return null
  const ratio = k.hours_estimated > 0 ? Math.round((k.hours_spent / k.hours_estimated) * 100) : null
  return (
    <div className="kpis" role="list" aria-label="Chiffres clés">
      <div className="atelier-kpi" role="listitem">
        <span className="atelier-kpi__label">Temps passé</span>
        <span className="atelier-kpi__value">{hours(k.hours_spent)}</span>
        <span className="atelier-kpi__note">{k.hours_estimated > 0 ? `sur ${hours(k.hours_estimated)} estimées${ratio !== null ? ` · ${ratio} %` : ''}` : 'aucune estimation'}</span>
      </div>
      <div className="atelier-kpi" role="listitem">
        <span className="atelier-kpi__label">Features</span>
        <span className="atelier-kpi__value">
          {count(k.features_done)}
          <span className="kpi-of"> / {count(k.features_total)}</span>
        </span>
        <span className="atelier-kpi__note">terminées</span>
      </div>
      <div className="atelier-kpi" role="listitem">
        <span className="atelier-kpi__label">En cours</span>
        <span className="atelier-kpi__value">{count(k.active)}</span>
        <span className={`atelier-kpi__note${k.blocked > 0 ? ' is-warn' : ''}`}>{k.blocked > 0 ? `dont ${plural(k.blocked, 'bloquée', 'bloquées')}` : 'rien de bloqué'}</span>
      </div>
      <div className="atelier-kpi" role="listitem">
        <span className="atelier-kpi__label">Prochaine échéance</span>
        <span className="atelier-kpi__value">{k.next_due ? shortDate(k.next_due.date, today) : '—'}</span>
        <span className="atelier-kpi__note kpi-note--clip" title={k.next_due?.label}>
          {k.next_due ? `${dueIn(k.next_due.date, today)} · ${k.next_due.kind === 'milestone' ? 'jalon ' : ''}${k.next_due.label}` : 'aucune date à venir'}
        </span>
      </div>
    </div>
  )
}

// ── Projets ─────────────────────────────────────────────────────────────────

function StatusDot({ status }: { status: string }) {
  return <span className="status-dot" style={{ ['--c' as string]: `var(${STATUS_VARS[status] ?? '--status-open'})` }} aria-hidden="true" />
}

function StatusPill({ status }: { status: string }) {
  return (
    <span className="status-pill" style={{ ['--c' as string]: `var(${STATUS_VARS[status] ?? '--status-open'})` }}>
      <StatusDot status={status} />
      {STATUS_LABELS[status] ?? status}
    </span>
  )
}

function Frise({ features, today }: { features: WorkItem[]; today: string }) {
  const timeline = buildTimeline(features, today)
  if (!timeline) return <PanelEmpty text="Les features n’ont pas encore de dates." />
  return (
    <div className="frise">
      <div className="frise__scale" aria-hidden="true">
        <span />
        <span className="frise__months">
          {timeline.months.map((m) => (
            <span key={`${m.label}-${m.left}`} className="frise__month" style={{ left: `${m.left}%` }}>
              {m.label}
            </span>
          ))}
        </span>
        <span />
      </div>
      <ol className="frise__rows">
        {features.map((f, i) => {
          const bar = timeline.bars[i]
          const progress = f.status === 'CLOSED' || f.status === 'RESOLVED' ? 100 : Math.max(0, Math.min(100, f.progress ?? 0))
          return (
            <li key={f.id} className="frise__row">
              <ExtLink href={f.url} className="frise__label" label={`Atelier Projets › ${f.title}`}>
                <StatusDot status={f.status} />
                <span className="frise__title">{f.title}</span>
              </ExtLink>
              <span className="frise__track">
                {timeline.months.map((m) => (
                  <span key={m.left} className="frise__grid" style={{ left: `${m.left}%` }} aria-hidden="true" />
                ))}
                {timeline.today !== null && <span className="frise__today" style={{ left: `${timeline.today}%` }} aria-hidden="true" />}
                {bar && (
                  <span
                    className="frise__bar"
                    style={{ left: `${bar.left}%`, width: `${bar.width}%`, ['--c' as string]: `var(${STATUS_VARS[f.status] ?? '--status-open'})` }}
                    title={`${STATUS_LABELS[f.status] ?? f.status} · ${f.start ? shortDate(f.start, today) : '?'} → ${f.due ? shortDate(f.due, today) : '?'} · ${progress} %`}
                  >
                    <span className="frise__fill" style={{ width: `${progress}%` }} />
                  </span>
                )}
              </span>
              <span className="frise__hours">
                {hours(f.hours_spent)}
                {f.hours_estimated !== null && <span className="frise__est"> / {hours(f.hours_estimated)}</span>}
              </span>
            </li>
          )
        })}
      </ol>
      {timeline.today !== null && (
        <div className="frise__scale frise__scale--foot" aria-hidden="true">
          <span />
          <span className="frise__months">
            <span className="frise__today-label" style={{ left: `${timeline.today}%` }}>
              aujourd’hui
            </span>
          </span>
          <span />
        </div>
      )}
    </div>
  )
}

function ActiveList({ items, today }: { items: WorkItem[]; today: string }) {
  return (
    <RowList
      items={items}
      initial={6}
      empty={<PanelEmpty text="Rien n’est en cours." />}
      render={(item) => {
        const late = item.due !== null && item.due < today
        return (
          <Row
            key={item.id}
            href={item.url}
            appLabel="Atelier Projets"
            title={item.title}
            sub={
              <>
                <StatusPill status={item.status} />
                <span className="tag">{TYPE_LABELS[item.type] ?? item.type}</span>
                {item.story && <span className="row__meta">{item.story}</span>}
              </>
            }
            side={
              <>
                {item.due && <span className={late ? 'is-late' : undefined}>{dueIn(item.due, today)}</span>}
                <span className="row__num">{hours(item.hours_spent)}</span>
              </>
            }
          />
        )
      }}
    />
  )
}

type ProjetsTab = 'features' | 'active' | 'milestones'

function ProjetsPanel({ overview, today, actions }: { overview: Overview; today: string; actions: ProjectActions }) {
  const panel = overview.projets
  const [tab, setTab] = useState<ProjetsTab>('features')
  const tabs: { id: ProjetsTab; label: string; n: number }[] = [
    { id: 'features', label: 'Features', n: panel.features.length },
    { id: 'active', label: 'En cours', n: panel.active.length },
    { id: 'milestones', label: 'Jalons', n: panel.milestones.length },
  ]
  return (
    <Panel
      id="projets"
      app="projets"
      title={panel.project_name ? `Projets · ${panel.project_name}` : 'Projets'}
      state={panel.state}
      message={panel.message}
      url={panel.url}
      onLink={() => actions.link('projets')}
      linkLabel="Rattacher un projet d’Atelier Projets"
      className="panel--projets"
      tools={
        panel.state === 'ok' ? (
          <div className="segmented" role="group" aria-label="Vue du projet">
            {tabs.map((t) => (
              <button key={t.id} type="button" aria-pressed={tab === t.id} onClick={() => setTab(t.id)}>
                {t.label}
                <span className="segmented__n">{t.n}</span>
              </button>
            ))}
          </div>
        ) : null
      }
    >
      {panel.state === 'off' && (
        <PanelEmpty text="Rattache le projet d’Atelier Projets : ses features, ce qui est en cours et le temps passé s’afficheront ici." action={{ label: 'Rattacher un projet', run: () => actions.link('projets') }} />
      )}
      {panel.state === 'ok' && tab === 'features' && (panel.features.length > 0 ? <Frise features={panel.features} today={today} /> : <PanelEmpty text="Aucune feature dans ce projet." />)}
      {panel.state === 'ok' && tab === 'active' && <ActiveList items={panel.active} today={today} />}
      {panel.state === 'ok' && tab === 'milestones' && (
        <RowList
          items={panel.milestones}
          initial={6}
          empty={<PanelEmpty text="Aucun jalon." />}
          render={(m) => (
            <Row
              key={m.id}
              href={panel.url}
              appLabel="Atelier Projets"
              icon={m.reached ? <ShieldCheck aria-label="Atteint" /> : <Layers aria-hidden />}
              title={m.name}
              sub={m.reached ? 'Atteint' : m.date ? dueIn(m.date, today) : 'sans date'}
              side={<span>{shortDate(m.date, today)}</span>}
            />
          )}
        />
      )}
    </Panel>
  )
}

// ── Wiki ────────────────────────────────────────────────────────────────────

/** « Modifiée hier », « Modifiée il y a 3 j », « Modifiée le 9 nov. » */
function modified(value: string, today: string): string {
  const when = relativeDay(value, today)
  return /^\d/.test(when) ? `Modifiée le ${when}` : `Modifiée ${when}`
}

function WikiPanel({ overview, today, actions }: { overview: Overview; today: string; actions: ProjectActions }) {
  const panel = overview.wiki
  const subtitle = panel.mode === 'space' ? `Espace « ${panel.space ?? ''} »` : panel.mode === 'search' ? 'Pages trouvées par mot-clé' : null
  return (
    <Panel id="wiki" app="wiki" title="Wiki" count={panel.items.length} state={panel.state} message={panel.message} url={panel.url} onLink={() => actions.link('wiki')} linkLabel="Lier un espace ou une page du Wiki" className="panel--wiki">
      {subtitle && panel.state === 'ok' && <p className="panel__sub">{subtitle}</p>}
      {panel.state === 'off' ? (
        <PanelEmpty text={panel.message ?? 'Rien de lié.'} action={{ label: 'Rattacher un espace', run: () => actions.link('wiki') }} />
      ) : (
        <RowList
          items={panel.items}
          initial={3}
          empty={<PanelEmpty text="Aucune page trouvée." action={{ label: 'Lier une page', run: () => actions.link('wiki') }} />}
          render={(doc) => {
            const link = findLink(overview.links, 'wiki', 'page', doc.id)
            return (
              <Row
                key={doc.id}
                href={doc.url}
                appLabel="Atelier Wiki"
                icon={<FileText aria-hidden />}
                title={doc.title}
                sub={doc.updated_at ? modified(doc.updated_at, today) : undefined}
                pinned={doc.pinned}
                onUnpin={link ? () => actions.unpin(link) : undefined}
              />
            )
          }}
        />
      )}
    </Panel>
  )
}

// ── Sources ─────────────────────────────────────────────────────────────────

const SOURCE_ICONS: Record<SourceKind, ReactNode> = {
  database: <Database aria-hidden />,
  folder: <Folder aria-hidden />,
  repo: <FolderGit2 aria-hidden />,
  presentation: <Presentation aria-hidden />,
  file: <FileText aria-hidden />,
  link: <Link2 aria-hidden />,
}


const ORIGIN_LABELS: Record<SourceItem['origin'], string | null> = { manual: null, projets: 'Projets', viz: 'Viz' }

function SourceRow({ source, overview, actions }: { source: SourceItem; overview: Overview; actions: ProjectActions }) {
  const { toast } = useUi()
  const link = source.link_id !== null ? overview.links.find((l) => l.id === source.link_id) : undefined
  const origin = ORIGIN_LABELS[source.origin]
  const body = (
    <>
      <span className="row__icon">{SOURCE_ICONS[source.kind]}</span>
      <span className="row__body">
        <span className="row__title">{source.label}</span>
        <span className="row__sub">
          {origin && <span className="tag">{origin}</span>}
          <span className="row__path" title={source.location}>
            {source.location}
          </span>
        </span>
      </span>
    </>
  )
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(source.location)
      toast('Emplacement copié')
    } catch {
      toast('Copie impossible : sélectionne l’emplacement à la main.', 'danger')
    }
  }
  return (
    <li className="row">
      {source.url ? (
        <ExtLink href={source.url} className="row__link" label={source.label}>
          {body}
        </ExtLink>
      ) : (
        <button type="button" className="row__link" onClick={copy} title="Copier l’emplacement">
          {body}
          <span className="row__side">
            <Copy className="row__hint" aria-label="Copier" />
          </span>
        </button>
      )}
      {link && (
        <button type="button" className="row__action btn btn--ghost btn--icon btn--sm" aria-label={`Retirer « ${source.label} » de la fiche`} title="Retirer de la fiche" onClick={() => actions.unpin(link)}>
          <X />
        </button>
      )}
    </li>
  )
}

function SourcesPanel({ overview, actions }: { overview: Overview; actions: ProjectActions }) {
  const items = overview.sources.items
  return (
    <Panel id="sources" icon={<Database />} title="Sources" count={items.length} onLink={actions.addSource} linkLabel="Ajouter une source" className="panel--sources">
      <p className="panel__sub">Bases, dossiers, dépôts et présentations</p>
      <RowList
        items={items}
        initial={4}
        empty={<PanelEmpty text="Ajoute les fichiers qui servent de base : extractions, dossiers partagés, dépôts, supports de présentation." action={{ label: 'Ajouter une source', run: actions.addSource }} />}
        render={(s) => <SourceRow key={s.id} source={s} overview={overview} actions={actions} />}
      />
    </Panel>
  )
}

// ── Convert, Tab, Viz ───────────────────────────────────────────────────────

function ConvertPanel({ overview, today, actions }: { overview: Overview; today: string; actions: ProjectActions }) {
  const panel = overview.convert
  return (
    <Panel id="convert" app="convert" title="Convert" count={panel.items.length} state={panel.state} message={panel.message} url={panel.url} onLink={() => actions.link('convert')} linkLabel="Épingler une conversion">
      <p className="panel__sub">Historique des conversions</p>
      <RowList
        items={panel.items}
        initial={4}
        empty={<PanelEmpty text={panel.state === 'ok' ? 'Aucune conversion liée à ce projet.' : 'Rien d’épinglé.'} />}
        render={(c) => {
          const link = findLink(overview.links, 'convert', 'conversion', c.id)
          return (
            <Row
              key={c.id}
              href={c.url}
              appLabel="Atelier Convert"
              title={c.name}
              sub={
                <>
                  {c.detected && <span className="row__meta">{c.detected}</span>}
                  {c.sent_to.map((t) => (
                    <span key={t} className="tag tag--flow">
                      <ArrowRight aria-hidden />
                      {t}
                    </span>
                  ))}
                </>
              }
              side={<span>{relativeDay(c.created_at, today)}</span>}
              pinned={c.pinned}
              onUnpin={link ? () => actions.unpin(link) : undefined}
            />
          )
        }}
      />
    </Panel>
  )
}

function TabPanel({ overview, today, actions }: { overview: Overview; today: string; actions: ProjectActions }) {
  const panel = overview.tab
  return (
    <Panel id="tab" app="tab" title="Tab" count={panel.items.length} state={panel.state} message={panel.message} url={panel.url} onLink={() => actions.link('tab')} linkLabel="Lier un projet ou une table de Tab">
      <p className="panel__sub">{overview.project.tab_project ? `Tables du projet « ${overview.project.tab_project} »` : 'Tables associées'}</p>
      {panel.state === 'off' && panel.items.length === 0 ? (
        <PanelEmpty text={panel.message ?? 'Rien de lié.'} />
      ) : (
        <RowList
          items={panel.items}
          initial={4}
          empty={<PanelEmpty text="Aucune table associée." action={{ label: 'Rattacher un projet Tab', run: () => actions.link('tab') }} />}
          render={(t) => {
            const link = findLink(overview.links, 'tab', 'table', t.id)
            return (
              <Row
                key={t.id}
                href={t.url}
                appLabel="Atelier Tab"
                title={t.name}
                sub={t.rows !== null ? plural(t.rows, 'ligne', 'lignes') : undefined}
                side={<span>{relativeDay(t.updated_at, today)}</span>}
                pinned={t.pinned}
                onUnpin={link ? () => actions.unpin(link) : undefined}
              />
            )
          }}
        />
      )}
    </Panel>
  )
}

function VizPanel({ overview, today, actions }: { overview: Overview; today: string; actions: ProjectActions }) {
  const panel = overview.viz
  return (
    <Panel id="viz" app="viz" title="Viz" count={panel.items.length} state={panel.state} message={panel.message} url={panel.url} onLink={() => actions.link('viz')} linkLabel="Épingler un rapport ou un jeu de Viz">
      <p className="panel__sub">Rapports</p>
      <RowList
        items={panel.items}
        initial={4}
        empty={<PanelEmpty text={panel.state === 'ok' ? 'Aucun rapport lié à ce projet.' : 'Rien d’épinglé.'} action={{ label: 'Épingler un rapport', run: () => actions.link('viz') }} />}
        render={(r) => {
          const link = findLink(overview.links, 'viz', 'report', r.id)
          return (
            <Row
              key={r.id}
              href={r.url}
              appLabel="Atelier Viz"
              title={r.name}
              sub={r.detail ?? undefined}
              side={<span>{relativeDay(r.updated_at, today)}</span>}
              pinned={r.pinned}
              onUnpin={link ? () => actions.unpin(link) : undefined}
            />
          )
        }}
      />
    </Panel>
  )
}

// ── Nexus ───────────────────────────────────────────────────────────────────

function NexusPanel({ overview, actions }: { overview: Overview; actions: ProjectActions }) {
  const panel = overview.nexus
  return (
    <Panel id="nexus" app="nexus" title="Nexus" count={panel.items.length} state={panel.state} message={panel.message} url={panel.url} onLink={() => actions.link('nexus')} linkLabel="Épingler un agent" className="panel--nexus">
      <p className="panel__sub">Agents qui savent lire ce que contient la fiche</p>
      {panel.items.length === 0 ? (
        <PanelEmpty text={panel.state === 'ok' ? (panel.message ?? 'Aucun agent proposé.') : 'Rien d’épinglé.'} />
      ) : (
        <ul className="agents">
          {panel.items.map((a) => {
            const link = findLink(overview.links, 'nexus', 'agent', a.name)
            return (
              <li key={a.name} className="agent">
                <ExtLink href={a.url} className="agent__link" label={`Atelier Nexus › ${a.display_name}`}>
                  <span className="agent__icon" aria-hidden="true">
                    <Bot />
                  </span>
                  <span className="row__body">
                    <span className="row__title">
                      {a.pinned && <Pin className="row__pin" aria-label="Épinglé" />}
                      {a.display_name}
                      {a.category && <span className="agent__cat">{a.category}</span>}
                    </span>
                    {a.description && <span className="agent__desc">{a.description}</span>}
                    {a.reasons.length > 0 && (
                      <span className="agent__reasons">
                        Lit {a.reasons.join(', ')}
                        {a.local_only && ' · local'}
                      </span>
                    )}
                  </span>
                </ExtLink>
                {link && (
                  <button type="button" className="row__action btn btn--ghost btn--icon btn--sm" aria-label={`Retirer « ${a.display_name} » de la fiche`} title="Retirer de la fiche" onClick={() => actions.unpin(link)}>
                    <X />
                  </button>
                )}
              </li>
            )
          })}
        </ul>
      )}
    </Panel>
  )
}

// ── Vue ─────────────────────────────────────────────────────────────────────

export function ProjectView({ overview, today, actions, refreshing }: { overview: Overview; today: string; actions: ProjectActions; refreshing: boolean }) {
  const p = overview.project
  const readAt = clockTime(overview.generated_at)
  return (
    <div className="project">
      <header className="project__head">
        <div className="project__titles">
          <h1 className="project__name">
            {p.name}
            {p.example && (
              <span className="tag project__example" title="Fiche d’une histoire des « Exemples de la suite » (données fictives). La supprimer ne retire rien des apps.">
                Exemple
              </span>
            )}
          </h1>
          {p.description && <p className="project__desc">{p.description}</p>}
        </div>
        <div className="project__actions">
          <button type="button" className="btn btn--ghost btn--icon" aria-label="Actualiser" title={readAt ? `Relire les apps (lues à ${readAt})` : 'Relire les apps'} onClick={actions.refresh} disabled={refreshing}>
            <RefreshCw className={refreshing ? 'spin' : undefined} />
          </button>
          <button type="button" className="btn" onClick={actions.edit}>
            <Pencil aria-hidden />
            Modifier
          </button>
          <button type="button" className="btn btn--primary" onClick={() => actions.link(p.projets_id ? 'wiki' : 'projets')}>
            <Plus aria-hidden />
            Lier un élément
          </button>
        </div>
        <Bindings overview={overview} actions={actions} />
      </header>

      <Kpis overview={overview} today={today} />

      <div className="board">
        <WikiPanel overview={overview} today={today} actions={actions} />
        <ProjetsPanel overview={overview} today={today} actions={actions} />
        <SourcesPanel overview={overview} actions={actions} />
        <ConvertPanel overview={overview} today={today} actions={actions} />
        <TabPanel overview={overview} today={today} actions={actions} />
        <VizPanel overview={overview} today={today} actions={actions} />
        <NexusPanel overview={overview} actions={actions} />
      </div>
    </div>
  )
}
