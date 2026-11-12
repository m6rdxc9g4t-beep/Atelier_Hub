import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { describe, it } from 'node:test'

import {
  ALWAYS_SENT,
  answering,
  claudeBlocked,
  DEFAULT_PREFS,
  effectiveChoice,
  effectiveEngine,
  engineLabel,
  engineRequest,
  engineTrouble,
  KIND_SENDS,
  modelSize,
  PREFS_KEY,
  readPrefs,
  resultLabel,
  sends,
  sendsLine,
  writePrefs,
  type EnginePrefs,
} from './engine.ts'
import { SLIDE_KINDS, type AiStatus } from './types.ts'

/** Espaces insécables (milliers, unités) ramenées à l'espace : les textes se comparent tels qu'on les lit. */
const plain = (text: string) => text.replace(/[  ]/g, ' ')

const OFFLINE = 'Mode hors ligne : rien ne part vers Claude. Passe « En ligne » (en haut de la page) pour l’utiliser.'

function status(more: { online?: boolean; claude?: Partial<AiStatus['claude']>; ollama?: Partial<AiStatus['ollama']> } = {}): AiStatus {
  const online = more.online ?? false
  const claude: AiStatus['claude'] = {
    available: online,
    installed: online,
    mode: 'cli',
    error: online ? null : OFFLINE,
    warning: null,
    models: ['sonnet', 'opus', 'haiku'],
    default_model: 'sonnet',
    ...more.claude,
  }
  return {
    online,
    auto: online && claude.available ? 'claude' : 'ollama',
    ollama: { reachable: true, error: null, default_model: 'llama3.1:8b', default_installed: true, models: [{ name: 'llama3.1:8b', size: 4_900_000_000 }, { name: 'llama3.2:1b', size: 1_300_000_000 }], ...more.ollama },
    claude,
    max_chars: 12_000,
  }
}

const prefs = (more: Partial<EnginePrefs> = {}): EnginePrefs => ({ ...DEFAULT_PREFS, ...more })
const store = (value: string | null) => ({ getItem: (key: string) => (key === PREFS_KEY ? value : null) })

describe('choix du moteur', () => {
  it('relit les préférences, et reprend les défauts pour ce qui est illisible', () => {
    assert.deepEqual(readPrefs(store(null)), { engine: 'auto', ollamaModel: null, claudeModel: 'sonnet' })
    assert.deepEqual(readPrefs(store(JSON.stringify({ engine: 'claude', ollamaModel: 'llama3.2:1b', claudeModel: 'opus' }))), { engine: 'claude', ollamaModel: 'llama3.2:1b', claudeModel: 'opus' })
    // Stockage modifié à la main : chaque valeur inconnue reprend son défaut, les autres restent.
    assert.deepEqual(readPrefs(store(JSON.stringify({ engine: 'gpt', ollamaModel: 'un modèle; rm -rf', claudeModel: 'opus' }))), { engine: 'auto', ollamaModel: null, claudeModel: 'opus' })
    assert.deepEqual(readPrefs(store(JSON.stringify({ ollamaModel: 'x'.repeat(101), claudeModel: 42 }))), DEFAULT_PREFS)
    for (const broken of ['{pas du json', '"texte"', '[1,2]', 'null', '42']) assert.deepEqual(readPrefs(store(broken)), DEFAULT_PREFS, broken)
    // Stockage indisponible (navigation privée) : défauts à la lecture, rien ne casse à l'écriture.
    const refused = { getItem: () => { throw new Error('SecurityError') }, setItem: () => { throw new Error('QuotaExceededError') } }
    assert.deepEqual(readPrefs(refused), DEFAULT_PREFS)
    assert.doesNotThrow(() => writePrefs(refused, DEFAULT_PREFS))
    // Ce qui est écrit se relit.
    const kept = new Map<string, string>()
    writePrefs({ setItem: (key, value) => void kept.set(key, value) }, prefs({ engine: 'ollama', ollamaModel: 'llama3.2:1b' }))
    assert.deepEqual(readPrefs({ getItem: (key) => kept.get(key) ?? null }), prefs({ engine: 'ollama', ollamaModel: 'llama3.2:1b' }))
  })

  it('hors ligne, Claude est grisé avec son explication et rien ne le retient', () => {
    const offline = status()
    assert.equal(claudeBlocked(offline), 'Hors ligne : rien ne part vers Claude. Passe « En ligne », en haut de la page, pour l’utiliser.')
    // Un « Claude » mémorisé retombe sur « Auto », et « Auto » retient Ollama.
    assert.equal(effectiveChoice('claude', offline), 'auto')
    for (const choice of ['auto', 'ollama', 'claude'] as const) assert.equal(effectiveEngine(choice, offline), 'ollama', choice)
    // Même si l'état disait le contraire (réponse incohérente du Hub) : hors ligne, jamais Claude.
    assert.equal(effectiveEngine('auto', { ...offline, auto: 'claude', claude: { ...offline.claude, available: true } }), 'ollama')
    // La demande nomme le moteur annoncé, jamais « auto » : le Hub ne peut pas en retenir un autre.
    assert.deepEqual(engineRequest(prefs({ engine: 'claude', claudeModel: 'opus' }), offline), { engine: 'ollama' })
    assert.deepEqual(engineRequest(prefs({ engine: 'auto', ollamaModel: 'llama3.2:1b' }), offline), { engine: 'ollama', model: 'llama3.2:1b' })
    // Tant que l'état n'est pas connu : Claude grisé, Ollama annoncé.
    assert.ok(claudeBlocked(null))
    assert.equal(effectiveEngine('claude', null), 'ollama')
    assert.deepEqual(engineRequest(prefs({ engine: 'claude' }), null), { engine: 'ollama' })
  })

  it('en ligne, Auto retient Claude s’il est disponible, sinon Ollama', () => {
    const online = status({ online: true })
    assert.equal(claudeBlocked(online), null)
    assert.equal(effectiveEngine('auto', online), 'claude')
    assert.equal(effectiveEngine('claude', online), 'claude')
    assert.equal(effectiveEngine('ollama', online), 'ollama')
    assert.deepEqual(engineRequest(prefs({ engine: 'auto', claudeModel: 'haiku', ollamaModel: 'llama3.2:1b' }), online), { engine: 'claude', claude_model: 'haiku' })
    assert.equal(answering(prefs({ engine: 'auto', claudeModel: 'opus' }), online), 'Claude (Opus)')
    assert.equal(answering(prefs({ engine: 'ollama', ollamaModel: 'llama3.2:1b' }), online), 'Ollama (llama3.2:1b)')
    assert.equal(answering(prefs({ engine: 'ollama' }), online), 'Ollama (llama3.1:8b)')
    // En ligne mais Claude absent : grisé avec la raison du Hub, Auto et un « Claude » mémorisé reviennent à Ollama.
    const absent = status({ online: true, claude: { available: false, installed: false, error: 'Claude n’est pas installé sur cette machine' } })
    assert.equal(claudeBlocked(absent), 'Claude n’est pas installé sur cette machine.')
    assert.equal(effectiveChoice('claude', absent), 'auto')
    assert.equal(effectiveEngine('auto', absent), 'ollama')
    assert.equal(effectiveEngine('claude', absent), 'ollama')
    assert.equal(claudeBlocked(status({ online: true, claude: { available: false, error: null } })), 'Claude n’est pas disponible.')
  })

  it('dit pourquoi le moteur retenu ne peut pas répondre', () => {
    assert.equal(engineTrouble(prefs(), status()), null)
    assert.equal(engineTrouble(prefs({ ollamaModel: 'llama3.2:1b' }), status()), null)
    assert.equal(engineTrouble(prefs(), status({ online: true })), null)
    const down = status({ ollama: { reachable: false, error: 'Ollama est injoignable sur http://127.0.0.1:11434 : lance Ollama. La présentation garde ses phrases automatiques.', models: [], default_installed: false } })
    assert.match(engineTrouble(prefs(), down) ?? '', /^Ollama est injoignable/)
    // Claude répond : l'état d'Ollama ne compte pas.
    assert.equal(engineTrouble(prefs(), { ...down, online: true, auto: 'claude', claude: { ...down.claude, available: true, error: null } }), null)
    // Modèle du Hub absent, d'autres installés ; modèle choisi puis désinstallé ; aucun modèle.
    assert.equal(engineTrouble(prefs(), status({ ollama: { default_installed: false, models: [{ name: 'llama3.2:1b', size: 1 }] } })), 'Modèle absent d’Ollama (llama3.1:8b) : installe-le avec « ollama pull llama3.1:8b », ou choisis un modèle installé.')
    assert.equal(engineTrouble(prefs({ ollamaModel: 'qwen2.5:7b' }), status()), 'Modèle absent d’Ollama (qwen2.5:7b) : installe-le avec « ollama pull qwen2.5:7b », ou choisis un modèle installé.')
    assert.equal(engineTrouble(prefs(), status({ ollama: { default_installed: false, models: [] } })), 'Modèle absent d’Ollama (llama3.1:8b) : installe-le avec « ollama pull llama3.1:8b ».')
  })

  it('nomme le moteur, son modèle et ce qu’il a rédigé', () => {
    assert.equal(engineLabel('ollama', 'llama3.2:1b'), 'Ollama (llama3.2:1b)')
    assert.equal(engineLabel('claude', 'sonnet'), 'Claude (Sonnet)')
    assert.equal(engineLabel('claude', 'claude-nouveau'), 'Claude (Claude-nouveau)')
    assert.equal(engineLabel('claude', null), 'Claude')
    assert.equal(resultLabel({ engine: 'ollama', model: 'llama3.2:1b', written: [1, 2, 3, 4, 5, 6, 7] }), '7 textes rédigés · Ollama (llama3.2:1b)')
    assert.equal(resultLabel({ engine: 'claude', model: 'sonnet', written: [4] }), '1 texte rédigé · Claude (Sonnet)')
    assert.equal(resultLabel({ engine: 'ollama', model: 'llama3.1:8b', written: [] }), 'Aucun texte rédigé · Ollama (llama3.1:8b)')
    assert.equal(plain(modelSize(1_300_000_000)), '1,3 Go')
    assert.equal(plain(modelSize(640_000_000)), '640 Mo')
    assert.equal(modelSize(0), '')
  })
})

describe('ligne bouclier', () => {
  it('avec Ollama, rien ne quitte la machine', () => {
    assert.equal(sendsLine(['kpis', 'features'], 12_000, 'ollama'), 'Avec Ollama, rien ne quitte la machine qui héberge le Hub.')
  })

  it('vers Claude, nomme ce que montre chaque sorte choisie, et rien d’autre', () => {
    const line = plain(sendsLine(['title', 'kpis', 'features', 'features', 'wiki', 'sources'], 12_000, 'claude'))
    assert.match(line, /^Vers Claude part seulement ce que montrent les 6 diapositives choisies : /)
    for (const always of ALWAYS_SENT) assert.ok(line.includes(always), always)
    for (const kind of ['title', 'features', 'wiki', 'sources'] as const) assert.ok(line.includes(KIND_SENDS[kind]!), kind)
    // Chaque sorte est dite une fois, dans l'ordre des sortes du Hub.
    assert.equal(line.split(KIND_SENDS.features!).length, 2)
    assert.ok(line.indexOf(KIND_SENDS.title!) < line.indexOf(KIND_SENDS.features!) && line.indexOf(KIND_SENDS.features!) < line.indexOf(KIND_SENDS.wiki!))
    // Rien de ce que montrent les sortes qui ne sont pas choisies.
    for (const kind of ['summary', 'active', 'milestones', 'viz', 'tab', 'convert', 'nexus'] as const) assert.ok(!line.includes(KIND_SENDS[kind]!), kind)
    assert.match(line, /les consignes que tu écris ici\. 12 000 caractères au plus par appel\.$/)
    assert.match(plain(sendsLine(['viz'], 6000, 'claude')), /^Vers Claude part seulement ce que montre la diapositive choisie : .*les noms, tailles et dates des rapports de Viz ; les consignes que tu écris ici\. 6 000 caractères au plus par appel\.$/)
    assert.equal(sendsLine([], 12_000, 'claude'), 'Rien à rédiger dans cette sélection : rien ne part vers Claude.')
  })

  it('se lit aussi en liste : une chose qui part par entrée', () => {
    assert.deepEqual(sends(['kpis', 'viz'], 12_000, 'ollama'), { lead: 'Avec Ollama, rien ne quitte la machine qui héberge le Hub.', items: [], tail: '' })
    const sent = sends(['kpis', 'viz', 'viz'], 12_000, 'claude')
    assert.equal(sent.lead, 'Vers Claude part seulement ce que montrent les 3 diapositives choisies :')
    assert.deepEqual(sent.items, [...ALWAYS_SENT, KIND_SENDS.viz, 'les consignes que tu écris ici'])
    assert.equal(plain(sent.tail), '12 000 caractères au plus par appel.')
    // La phrase et la liste disent la même chose.
    assert.equal(sendsLine(['kpis', 'viz', 'viz'], 12_000, 'claude'), `${sent.lead} ${sent.items.join(' ; ')}. ${sent.tail}`)
    assert.deepEqual(sends([], 12_000, 'claude'), { lead: 'Rien à rédiger dans cette sélection : rien ne part vers Claude.', items: [], tail: '' })
  })

  it('chaque sorte a sa ligne, et la nommer toutes les dit toutes', () => {
    assert.deepEqual(Object.keys(KIND_SENDS).sort(), [...SLIDE_KINDS].sort())
    // Seuls le texte libre (jamais rédigé) et les chiffres clés (toujours envoyés, dits à part) n'ajoutent rien.
    assert.deepEqual(SLIDE_KINDS.filter((kind) => KIND_SENDS[kind] === null), ['kpis', 'text'])
    assert.ok(ALWAYS_SENT.some((part) => part.includes('chiffres clés')))
    const line = sendsLine(SLIDE_KINDS, 12_000, 'claude')
    for (const kind of SLIDE_KINDS) if (KIND_SENDS[kind]) assert.ok(line.includes(KIND_SENDS[kind]), kind)
  })

  it('ne promet jamais plus que le Hub : du Wiki les titres, des sources ni adresse ni chemin', () => {
    assert.match(KIND_SENDS.wiki!, /titres/)
    assert.match(KIND_SENDS.wiki!, /jamais leur contenu/)
    assert.doesNotMatch(Object.values(KIND_SENDS).join(' '), /extrait/)
    assert.match(KIND_SENDS.sources!, /jamais leurs adresses, leurs chemins ni leurs notes/)
    // Le Hub tient ces promesses dans `slideFacts` : pas d'adresse dans un fait, pas de détail pour une page du Wiki,
    // et une diapositive d'une page n'a aucun fait.
    const facts = readFileSync(new URL('../../../backend/src/domain/facts.ts', import.meta.url), 'utf8')
    assert.match(facts, /if \(live\.state !== 'ok' \|\| isPageContent\(slide\)\) return \[\]/)
    assert.match(facts, /rowFact\(row, !wiki\)/)
    assert.doesNotMatch(facts.replace(/\/\/.*|\/\*[\s\S]*?\*\//g, ''), /\.url\b|\blocation\b/)
  })
})
