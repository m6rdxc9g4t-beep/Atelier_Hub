import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { readFileSync } from 'node:fs'

import {
  applyOrder,
  applyRecord,
  defaultTitle,
  draftValue,
  elementChoices,
  KIND_CHOICES,
  longDay,
  moreText,
  moveIds,
  presentationMeta,
  provenance,
  shownText,
  isLongTitle,
  LONG_TITLE,
  shownTitle,
  SLIDE_TITLE_MAX,
  staleNotice,
  syncedDraft,
  unsavedFields,
  unsavedNotice,
  unsavedPatch,
  withoutSlide,
} from './deck.ts'
import { SLIDE_KINDS, type Deck, type DeckSlide, type Overview, type SlideLive, type SlideRecord } from './types.ts'

const live = (more: Partial<SlideLive> = {}): SlideLive => ({
  state: 'ok',
  message: null,
  app: null,
  url: null,
  url_label: null,
  figures: [],
  rows: [],
  more: 0,
  auto_title: 'Chiffres clés',
  auto_text: '5 features terminées sur 8 (63 %).',
  ...more,
})

const slide = (more: Partial<DeckSlide> = {}): DeckSlide => ({
  id: 1,
  presentation_id: 1,
  position: 0,
  kind: 'kpis',
  title: null,
  body: null,
  ref: null,
  ref_label: null,
  text_source: 'auto',
  text_model: null,
  text_at: null,
  updated_at: '2026-11-10T09:00:00.000Z',
  live: live(),
  stale: [],
  ...more,
})

describe('présentations', () => {
  it('propose le titre « fiche — mois année »', () => {
    assert.equal(defaultTitle('KPI CGO', '2026-11-10'), 'KPI CGO — novembre 2026')
    assert.equal(defaultTitle('Clôture', '2027-01-02'), 'Clôture — janvier 2027')
    assert.equal(defaultTitle('Clôture', '2026-08-31'), 'Clôture — août 2026')
    assert.equal(defaultTitle('Clôture', 'pas une date'), 'Clôture')
    // Un long nom de fiche est abrégé pour que le titre tienne dans la borne du Hub : le mois reste lisible.
    assert.equal(defaultTitle('KPI CGO', '2026-11-10', SLIDE_TITLE_MAX), 'KPI CGO — novembre 2026')
    assert.equal(defaultTitle('Contrôle de gestion', '2026-11-10', 30), 'Contrôle de g… — novembre 2026')
    const long = defaultTitle('x'.repeat(120), '2026-11-10', 120)
    assert.equal(long.length, 120)
    assert.match(long, /x… — novembre 2026$/)
    // La même règle que le Hub (`defaultTitle` de backend/src/domain/plan.ts), qui pose ce titre quand il est laissé vide.
    const hub = readFileSync(new URL('../../../backend/src/domain/plan.ts', import.meta.url), 'utf8')
    assert.match(hub, /projectName\.slice\(0, room - 1\)\.trimEnd\(\)\}…/)
  })

  it('résume une présentation dans la liste', () => {
    const today = '2026-11-10'
    assert.equal(presentationMeta({ slides: 9, updated_at: '2026-11-09T10:00:00' }, today), '9 diapositives · modifiée hier')
    assert.equal(presentationMeta({ slides: 1, updated_at: '2026-11-10T08:00:00' }, today), '1 diapositive · modifiée aujourd’hui')
    assert.equal(presentationMeta({ slides: 12, updated_at: '2026-11-07T08:00:00' }, today), '12 diapositives · modifiée il y a 3 j')
    assert.equal(presentationMeta({ slides: 3, updated_at: '2026-10-02T08:00:00' }, today), '3 diapositives · modifiée le 2 oct.')
    assert.equal(presentationMeta({ slides: 3, updated_at: '' }, today), '3 diapositives')
  })

  it('affiche le titre rédigé, sinon le titre automatique', () => {
    assert.equal(shownTitle(slide()), 'Chiffres clés')
    assert.equal(shownTitle(slide({ title: 'Où en est-on ?' })), 'Où en est-on ?')
    // Le titre automatique d'un élément suit son nom dans l'app.
    assert.equal(shownTitle(slide({ kind: 'viz', ref: 'a1', ref_label: 'Ancien nom', live: live({ auto_title: 'Tableau mensuel' }) })), 'Tableau mensuel')
  })

  it('affiche le texte rédigé, sinon la phrase automatique', () => {
    assert.equal(shownText(slide()), '5 features terminées sur 8 (63 %).')
    assert.equal(shownText(slide({ body: 'Le projet tient ses délais.', text_source: 'manual' })), 'Le projet tient ses délais.')
    // Un texte rédigé vide reste vide : la phrase automatique ne revient que quand `body` est nul.
    assert.equal(shownText(slide({ body: '', text_source: 'manual' })), '')
    assert.equal(shownText(slide({ kind: 'text', live: live({ state: 'none', auto_title: 'Texte', auto_text: '' }) })), '')
  })

  it('écrit le jour de la lecture en toutes lettres', () => {
    assert.equal(longDay('2026-11-12'), '12 novembre 2026')
    assert.equal(longDay('2026-03-01'), '1er mars 2026')
    assert.equal(longDay('2026-11-12T08:00:00Z'), '12 novembre 2026')
    assert.equal(longDay('hier'), '')
  })

  it('compte ce qu’une liste ne montre pas', () => {
    assert.equal(moreText(0), '')
    assert.equal(moreText(1), 'et 1 autre')
    assert.equal(moreText(4), 'et 4 autres')
  })

  // ─── Édition ───────────────────────────────────────────────────

  const deck = (): Deck => ({
    presentation: { id: 7, project_id: 1, title: 'Comité', slides: 3, created_at: '2026-11-01T08:00:00.000Z', updated_at: '2026-11-10T09:00:00.000Z' },
    project: { id: 1 } as Deck['project'],
    slides: [
      slide({ id: 1, position: 0, kind: 'title', live: live({ auto_title: 'Comité', auto_text: 'Présentation du projet.' }) }),
      slide({ id: 2, position: 1, body: 'Écrit par un modèle : 63 %.', text_source: 'ollama', text_model: 'llama3.2:1b', text_at: '2026-11-09T10:00:00.000Z', stale: ['63 %'] }),
      slide({ id: 3, position: 2, kind: 'features', live: live({ auto_title: 'Avancement', rows: [{ id: 'f1', label: 'Connexion', detail: null, date: null, status: 'CLOSED', url: null }] }) }),
    ],
    generated_at: '2026-11-10T09:00:00.000Z',
  })
  const record = (source: DeckSlide, more: Partial<SlideRecord>): SlideRecord => {
    const { live: _live, stale: _stale, ...rest } = source
    return { ...rest, ...more }
  }

  it('fusionne un enregistrement sans perdre la partie vivante', () => {
    const before = deck()
    const saved = record(before.slides[2]!, { title: 'Où en sont les features ?', body: 'Deux sont terminées.', text_source: 'manual', text_at: '2026-11-10T14:32:00.000Z', updated_at: '2026-11-10T14:32:00.000Z' })
    const after = applyRecord(before, saved)
    const merged = after.slides[2]!
    assert.equal(merged.title, 'Où en sont les features ?')
    assert.equal(merged.body, 'Deux sont terminées.')
    assert.equal(merged.text_source, 'manual')
    // Cartes, lignes et titre automatique restent ceux de la dernière lecture des apps.
    assert.deepEqual(merged.live, before.slides[2]!.live)
    assert.equal(shownTitle(merged), 'Où en sont les features ?')
    assert.equal(after.presentation.updated_at, '2026-11-10T14:32:00.000Z')
    // Les autres diapositives ne bougent pas, la présentation d'origine non plus.
    assert.equal(after.slides[0], before.slides[0])
    assert.equal(before.slides[2]!.title, null)
  })

  it('revient à la phrase automatique sans relire la suite', () => {
    const before = deck()
    const after = applyRecord(before, record(before.slides[1]!, { body: null, text_source: 'auto', text_model: null, text_at: null }))
    assert.equal(shownText(after.slides[1]!), '5 features terminées sur 8 (63 %).')
    // « À relire » jugeait l'ancien texte : il tombe avec lui.
    assert.deepEqual(after.slides[1]!.stale, [])
  })

  it('garde « à relire » tant que le texte ne change pas, et ignore une diapositive inconnue', () => {
    const before = deck()
    assert.deepEqual(applyRecord(before, record(before.slides[1]!, { title: 'Avancement' })).slides[1]!.stale, ['63 %'])
    assert.equal(applyRecord(before, record(before.slides[1]!, { id: 99 })), before)
  })

  it('applique l’ordre rendu par le Hub', () => {
    const before = deck()
    const order = [before.slides[2]!, before.slides[0]!, before.slides[1]!].map((s, position) => record(s, { position }))
    const after = applyOrder(before, order)
    assert.deepEqual(after.slides.map((s) => [s.id, s.position]), [[3, 0], [1, 1], [2, 2]])
    assert.deepEqual(after.slides[0]!.live, before.slides[2]!.live)
    assert.deepEqual(after.slides[2]!.stale, ['63 %'])
    assert.equal(after.presentation.slides, 3)
  })

  it('retire une diapositive et resserre les positions', () => {
    const after = withoutSlide(deck(), 2)
    assert.deepEqual(after.slides.map((s) => [s.id, s.position]), [[1, 0], [3, 1]])
    assert.equal(after.presentation.slides, 2)
    assert.equal(withoutSlide(deck(), 99).slides.length, 3)
  })

  it('monte et descend une diapositive, sauf aux bords', () => {
    assert.deepEqual(moveIds([1, 2, 3], 2, -1), [2, 1, 3])
    assert.deepEqual(moveIds([1, 2, 3], 2, 1), [1, 3, 2])
    assert.equal(moveIds([1, 2, 3], 1, -1), null)
    assert.equal(moveIds([1, 2, 3], 3, 1), null)
    assert.equal(moveIds([1, 2, 3], 9, 1), null)
    assert.equal(moveIds([1], 1, 1), null)
    // L'ordre reçu n'est pas modifié.
    const ids = [1, 2, 3]
    moveIds(ids, 1, 1)
    assert.deepEqual(ids, [1, 2, 3])
  })

  it('reconnaît un long titre, que la diapositive de titre écrit moins grand', () => {
    assert.equal(isLongTitle('KPI CGO — novembre 2026'), false)
    assert.equal(isLongTitle('x'.repeat(LONG_TITLE)), false)
    assert.equal(isLongTitle('x'.repeat(LONG_TITLE + 1)), true)
    assert.equal(isLongTitle('x'.repeat(SLIDE_TITLE_MAX)), true)
  })

  it('sait ce qui reste à enregistrer', () => {
    const saved = { title: null, body: 'Le budget tient.' }
    assert.equal(draftValue('  Mon titre '), 'Mon titre')
    assert.equal(draftValue('   '), null)
    // Rien de tapé : rien à enregistrer (les espaces de bord ne comptent pas).
    assert.equal(unsavedPatch({ title: '', body: 'Le budget tient. ' }, saved), null)
    assert.deepEqual(unsavedFields({ title: ' ', body: 'Le budget tient.' }, saved), [])
    // Un champ modifié ; un champ vidé revient à l'automatique (null).
    assert.deepEqual(unsavedPatch({ title: ' Où en est-on ? ', body: 'Le budget tient.' }, saved), { title: 'Où en est-on ?' })
    assert.deepEqual(unsavedPatch({ title: '', body: '  ' }, saved), { body: null })
    // Le texte dont l'enregistrement a échoué reste à enregistrer : il part avec le titre qu'on modifie ensuite.
    const afterFailure = { title: 'Nouveau titre', body: 'Texte tapé pendant la coupure.' }
    assert.deepEqual(unsavedPatch(afterFailure, saved), { title: 'Nouveau titre', body: 'Texte tapé pendant la coupure.' })
    assert.deepEqual(unsavedFields(afterFailure, saved), ['title', 'body'])
    // Le titre enregistré, le texte attend toujours : il n'est pas « enregistré » parce qu'un autre champ l'a été.
    assert.deepEqual(unsavedFields(afterFailure, { ...saved, title: 'Nouveau titre' }), ['body'])
    assert.deepEqual(unsavedPatch(afterFailure, { ...saved, title: 'Nouveau titre' }), { body: 'Texte tapé pendant la coupure.' })
    // Une valeur déjà partie et sans réponse n'est pas renvoyée ; ce qui a été tapé depuis, si.
    assert.equal(unsavedPatch({ title: '', body: 'abc' }, saved, { body: 'abc' }), null)
    assert.deepEqual(unsavedPatch({ title: '', body: 'abc def' }, saved, { body: 'abc' }), { body: 'abc def' })
    assert.deepEqual(unsavedPatch({ title: 'T', body: '' }, { title: 'T', body: null }, { body: null }), null)
    assert.deepEqual(unsavedPatch({ title: '', body: 'abc' }, { title: 'T', body: 'abc' }, { body: null }), { title: null })
  })

  it('ne remplace une saisie par l’enregistré que si elle n’a pas bougé', () => {
    // Réponse d'un enregistrement (envoyé « abc ») alors qu'on a continué à taper : la saisie reste.
    assert.equal(syncedDraft('abc def', 'abc', 'abc'), 'abc def')
    assert.equal(syncedDraft('abc def', null, 'abc'), 'abc def')
    // La saisie est ce que le Hub garde, aux espaces de bord près : le champ n'est pas touché (une espace tapée y reste).
    assert.equal(syncedDraft('abc ', 'abc', 'abc'), 'abc ')
    assert.equal(syncedDraft('abc', null, 'abc'), 'abc')
    // Le Hub a nettoyé la valeur envoyée et la saisie n'a pas bougé : elle prend la valeur gardée.
    assert.equal(syncedDraft('a  b', 'a  b', 'a b'), 'a b')
    // Champ intact quand l'enregistré change ailleurs (actualisation, retour à l'automatique) : il suit.
    assert.equal(syncedDraft('Ancien', 'Ancien', 'Nouveau'), 'Nouveau')
    assert.equal(syncedDraft(' Ancien ', 'Ancien', null), '')
    assert.equal(syncedDraft('', null, 'Écrit ailleurs'), 'Écrit ailleurs')
    // Une saisie en échec (différente de l'ancien enregistré) reste dans le champ quoi qu'il arrive à l'enregistré.
    assert.equal(syncedDraft('Texte tapé pendant la coupure.', null, null), 'Texte tapé pendant la coupure.')
    assert.equal(syncedDraft('Texte tapé pendant la coupure.', 'Ancien', 'Nouveau'), 'Texte tapé pendant la coupure.')
  })

  it('annonce un champ en échec tant qu’il attend, jamais après', () => {
    const down = 'Le Hub ne répond pas.'
    assert.equal(unsavedNotice({ body: down }, ['body']), 'Le texte n’a pas été enregistré : Le Hub ne répond pas.')
    assert.equal(unsavedNotice({ title: down }, ['title']), 'Le titre n’a pas été enregistré : Le Hub ne répond pas.')
    // Le titre vient d'être enregistré, le texte en échec attend encore : son message reste.
    assert.equal(unsavedNotice({ body: down }, ['body']), unsavedNotice({ title: down, body: down }, ['body']))
    assert.equal(unsavedNotice({ title: down, body: down }, ['title', 'body']), 'Le titre et le texte n’ont pas été enregistrés : Le Hub ne répond pas.')
    assert.equal(
      unsavedNotice({ title: 'Titre : 120 caractères au plus', body: down }, ['title', 'body']),
      'Le titre n’a pas été enregistré : Titre : 120 caractères au plus. Le texte n’a pas été enregistré : Le Hub ne répond pas.',
    )
    // Plus rien à enregistrer (le champ a été retenté avec succès, ou remis à ce que le Hub garde) : plus de message.
    assert.equal(unsavedNotice({ body: down }, []), '')
    // Une saisie en cours, sans échec, n'est pas une erreur.
    assert.equal(unsavedNotice({}, ['title', 'body']), '')
    assert.equal(unsavedNotice({ title: down }, ['body']), '')
  })

  it('dit d’où vient le texte, et de quand', () => {
    const today = '2026-11-12'
    assert.equal(provenance(slide(), today), 'Phrase automatique, toujours à jour')
    assert.equal(provenance(slide({ kind: 'text' }), today), 'Pas encore de texte')
    assert.equal(provenance(slide({ body: 'Mon texte.', text_source: 'manual', text_at: '2026-11-12T12:00:00.000Z' }), today), 'Ton texte, modifié le 12 nov.')
    assert.equal(provenance(slide({ body: 'Texte.', text_source: 'ollama', text_model: 'llama3.2:1b', text_at: '2026-11-12T12:00:00.000Z' }), today), 'Rédigé par Ollama (llama3.2:1b) le 12 nov.')
    assert.equal(provenance(slide({ body: 'Texte.', text_source: 'claude', text_model: 'sonnet', text_at: '2026-11-12T12:00:00.000Z' }), today), 'Rédigé par Claude (Sonnet) le 12 nov.')
    // Une autre année s'écrit ; un modèle ou une date absents ne laissent pas de trou dans la phrase.
    assert.equal(provenance(slide({ body: 'Mon texte.', text_source: 'manual', text_at: '2025-12-03T12:00:00.000Z' }), today), 'Ton texte, modifié le 3 déc. 2025')
    assert.equal(provenance(slide({ body: 'Texte.', text_source: 'claude', text_model: null, text_at: null }), today), 'Rédigé par Claude')
  })

  it('dit quels nombres d’un texte d’IA sont à relire', () => {
    assert.equal(staleNotice([]), '')
    assert.equal(staleNotice(['63 %']), 'Texte à relire : 63 % ne correspond plus aux chiffres du jour')
    assert.equal(staleNotice(['33 %', '2']), 'Texte à relire : 33 % et 2 ne correspondent plus aux chiffres du jour')
    assert.equal(staleNotice(['33 %', '2', '12 h']), 'Texte à relire : 33 %, 2 et 12 h ne correspondent plus aux chiffres du jour')
  })

  it('propose toutes les sortes du Hub, sous les mêmes noms, « Texte libre » en tête', () => {
    assert.equal(KIND_CHOICES[0]!.kind, 'text')
    assert.deepEqual([...KIND_CHOICES.map((c) => c.kind)].sort(), [...SLIDE_KINDS].sort())
    // `KIND_INFO` du Hub fait foi : nom de la sorte, et si elle peut viser un élément.
    const source = readFileSync(new URL('../../../backend/src/domain/slides.ts', import.meta.url), 'utf8')
    for (const choice of KIND_CHOICES) {
      const info = source.match(new RegExp(`^  ${choice.kind}: \\{ label: '([^']+)',.*refKind: (null|'[a-z]+'),`, 'm'))
      assert.ok(info, `${choice.kind} est dans KIND_INFO`)
      assert.equal(choice.label, info[1], choice.kind)
      assert.equal(choice.element !== null, info[2] !== 'null', `${choice.kind} : vise un élément`)
      assert.equal(choice.elementLabel !== null, choice.element !== null, choice.kind)
    }
  })

  it('propose les éléments que la fiche montre, avec l’identifiant que le Hub compare', () => {
    const panel = <T,>(items: T[], state = 'ok') => ({ state, message: null, url: 'http://127.0.0.1/', items })
    const overview = {
      wiki: { ...panel([{ id: '12', title: 'Dictionnaire des indicateurs' }]), space: null, mode: 'space' },
      viz: panel([{ id: 'a1', name: 'Tableau mensuel' }]),
      tab: panel([{ id: 'tbl_1', name: 'Réalisé mensuel' }]),
      convert: panel([{ id: 'c9', name: 'Extraction SAP' }], 'down'),
      nexus: panel([{ name: 'data_analyst', display_name: 'Data Analyst / Power BI' }]),
    } as unknown as Overview
    assert.deepEqual(elementChoices(overview, 'wiki'), [{ ref: '12', label: 'Dictionnaire des indicateurs' }])
    assert.deepEqual(elementChoices(overview, 'viz'), [{ ref: 'a1', label: 'Tableau mensuel' }])
    assert.deepEqual(elementChoices(overview, 'tab'), [{ ref: 'tbl_1', label: 'Réalisé mensuel' }])
    assert.deepEqual(elementChoices(overview, 'nexus'), [{ ref: 'data_analyst', label: 'Data Analyst / Power BI' }])
    // Une app arrêtée ne propose rien : seuls les libellés gardés par le Hub resteraient, sans garantie d'exister.
    assert.deepEqual(elementChoices(overview, 'convert'), [])
  })
})
