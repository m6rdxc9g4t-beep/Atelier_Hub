// Recherche de l'exécutable de Claude Code (docs/SUITE.md §5.3 et §9.6 d'Atelier Projets), reprise de
// `Atelier_Projets/backend/src/ai-bridge/claude-cli.ts` sans la session interactive du terminal.
// Le chemin retenu est toujours absolu : `CLAUDE_CLI` (un chemin relatif est refusé), sinon le PATH — sans entrée
// relative ni `node_modules/.bin` —, puis les dossiers habituels de l'installeur.

import { constants, existsSync, readFileSync } from 'node:fs'
import { access, stat } from 'node:fs/promises'
import { homedir } from 'node:os'
import path from 'node:path'

/**
 * Dossier du PATH digne de confiance pour chercher ou lancer Claude : absolu, et hors des dossiers ajoutés par npm
 * (`node_modules/.bin`, `node-gyp-bin`), qui imposeraient les outils du Hub — ou d'un dépôt quelconque — à la place
 * de la vraie CLI. Une entrée relative (« . », « bin ») dépend du dossier courant : ignorée.
 */
export function trustedPathEntry(entry: string, platform: NodeJS.Platform = process.platform): boolean {
  const paths = platform === 'win32' ? path.win32 : path.posix
  return entry !== '' && paths.isAbsolute(entry) && !/[\\/]node_modules[\\/]\.bin[\\/]?$/.test(entry) && !/node-gyp-bin/.test(entry)
}

/** Dossiers retenus d'un PATH (ordre gardé, doublons retirés), voir `trustedPathEntry`. */
export function searchDirs(searchPath: string | undefined, platform: NodeJS.Platform = process.platform): string[] {
  const delimiter = platform === 'win32' ? ';' : ':'
  return [...new Set((searchPath ?? '').split(delimiter).filter((entry) => trustedPathEntry(entry, platform)))]
}

/**
 * PATH transmis à la CLI : les dossiers retenus du PATH du Hub, précédés du dossier de l'exécutable (une CLI
 * installée par npm doit trouver `node` à côté d'elle).
 */
export function sessionPath(searchPath: string | undefined, executable: string, platform: NodeJS.Platform = process.platform): string {
  const paths = platform === 'win32' ? path.win32 : path.posix
  const own = paths.isAbsolute(executable) ? [paths.dirname(executable)] : []
  const fallback = platform === 'win32' ? '' : '/usr/bin:/bin'
  return [...new Set([...own, ...searchDirs(searchPath ?? fallback, platform)])].join(platform === 'win32' ? ';' : ':')
}

/** Commande donnée comme chemin relatif (« ./claude », « bin/claude ») : refusée, elle dépendrait du dossier courant. */
export function isRelativeCommand(command: string): boolean {
  return /[\\/]/.test(command) && !path.isAbsolute(command)
}

export function relativeCommandMessage(command: string): string {
  return `CLAUDE_CLI doit être un chemin absolu (« ${command} » refusé)`
}

/**
 * Noms essayés pour une commande : sous Windows, « claude » désigne `claude.exe` (installeur), puis `claude.cmd`
 * (installation npm, résolu ensuite par `resolveClaudeLaunch`). Un `.bat` ou toute autre extension n'est jamais retenu.
 */
export function executableNames(command: string, platform: NodeJS.Platform = process.platform): string[] {
  if (platform !== 'win32') return [command]
  const extension = path.win32.extname(command).toLowerCase()
  if (extension === '.exe' || extension === '.cmd') return [command]
  if (extension !== '') return []
  return path.win32.isAbsolute(command) ? [`${command}.exe`, `${command}.cmd`, command] : [`${command}.exe`, `${command}.cmd`]
}

/** Lancement effectif de la CLI : exécutable, et arguments placés avant ceux de Claude (`node.exe` + `cli.js`). */
export interface ClaudeLaunch {
  executable: string
  args: string[]
}

export interface ResolveLaunchOptions {
  platform?: NodeJS.Platform
  /** PATH où chercher `node.exe` quand il n'est pas à côté de `claude.cmd`. */
  searchPath?: string
  exists?: (file: string) => boolean
  readFile?: (file: string) => string
}

/**
 * Lancement d'un exécutable trouvé : tel quel, sauf sous Windows un `claude.cmd` installé par npm, résolu en
 * `node.exe <dossier>\node_modules\@anthropic-ai\claude-code\<bin>`. Non résolu → null : refusé. Jamais de
 * `cmd.exe`, qui réinterpréterait le prompt système et le schéma JSON passés en arguments.
 */
export function resolveClaudeLaunch(found: string, options: ResolveLaunchOptions = {}): ClaudeLaunch | null {
  const { platform = process.platform, exists = existsSync, readFile = (file: string) => readFileSync(file, 'utf8') } = options
  if (platform !== 'win32') return { executable: found, args: [] }
  const win = path.win32
  if (win.extname(found).toLowerCase() !== '.cmd') return { executable: found, args: [] }
  const dir = win.dirname(found)
  const packageDir = win.join(dir, 'node_modules', '@anthropic-ai', 'claude-code')
  let entry = 'cli.js'
  try {
    const bin = (JSON.parse(readFile(win.join(packageDir, 'package.json'))) as { bin?: unknown }).bin
    const declared = typeof bin === 'string' ? bin : typeof bin === 'object' && bin !== null ? (bin as Record<string, unknown>).claude : undefined
    if (typeof declared === 'string' && declared.trim() !== '') entry = declared
  } catch {
    /* package.json illisible : cli.js */
  }
  const script = win.resolve(packageDir, entry)
  // Le script reste dans le paquet, et c'est un fichier JavaScript lancé par node.exe.
  if (!script.toLowerCase().startsWith(`${packageDir.toLowerCase()}\\`) || !/\.(c|m)?js$/i.test(script) || !exists(script)) return null
  const nodeCandidates = [win.join(dir, 'node.exe'), ...searchDirs(options.searchPath, platform).map((entryDir) => win.join(entryDir, 'node.exe'))]
  const node = nodeCandidates.find((file) => exists(file))
  return node ? { executable: node, args: [script] } : null
}

export function unresolvedCmdMessage(found: string): string {
  return `« ${found} » ne se résout pas en node.exe + cli.js de @anthropic-ai/claude-code : refusé (jamais lancé par cmd.exe) ; installe Claude Code avec son installeur (claude.exe) ou renseigne CLAUDE_CLI`
}

/**
 * Exécutable trouvé : chemin absolu donné tel quel, sinon nom cherché dans les dossiers retenus du PATH. Un chemin
 * relatif n'est jamais accepté. Renvoie toujours un chemin absolu, ou null.
 */
export async function findExecutable(command: string, searchPath: string | undefined): Promise<string | null> {
  if (isRelativeCommand(command)) return null
  const names = executableNames(command)
  const candidates = path.isAbsolute(command) ? names : searchDirs(searchPath).flatMap((dir) => names.map((name) => path.join(dir, name)))
  for (const candidate of candidates) {
    try {
      await access(candidate, constants.X_OK)
      if ((await stat(candidate)).isFile()) return candidate
    } catch {
      /* suivant */
    }
  }
  return null
}

/**
 * Dossiers où chercher Claude après le PATH : un service n'hérite pas toujours du PATH du terminal, et l'installeur
 * de Claude Code place la CLI dans `~/.local/bin` (Windows : `%USERPROFILE%\.local\bin\claude.exe`).
 */
export function claudeFallbackDirs(home: string = homedir(), platform: NodeJS.Platform = process.platform): string[] {
  if (platform === 'win32') return [path.win32.join(home, '.local', 'bin')]
  return [path.posix.join(home, '.local', 'bin'), '/opt/homebrew/bin', '/usr/local/bin']
}

/**
 * Exécutable de Claude : chemin absolu donné (`CLAUDE_CLI`), sinon PATH — sans entrée relative ni
 * `node_modules/.bin` —, puis les dossiers habituels. null s'il est introuvable ou si `CLAUDE_CLI` est relatif.
 */
export async function findClaudeExecutable(command: string, searchPath: string | undefined, fallbackDirs: readonly string[] = claudeFallbackDirs()): Promise<string | null> {
  const found = await findExecutable(command, searchPath)
  if (found !== null || path.isAbsolute(command) || isRelativeCommand(command)) return found
  return findExecutable(command, fallbackDirs.join(path.delimiter))
}
