// Parser for tickets written by mattpocock/skills `to-tickets`.
//
// Local tracker layout: `.scratch/<feature>/issues/NN-slug.md`, one ticket per
// file. The markdown is LLM-written, so the parser accepts the common
// variations (bold or plain labels, inline label or H2 section) and reports
// anything it cannot interpret instead of guessing.

export interface Criterion {
  text: string
  done: boolean
}

export interface Ticket {
  number: number
  slug: string
  title: string
  file: string
  whatToBuild: string
  /** Resolved ticket numbers that must be done before this one can start. */
  blockedBy: number[]
  /** Lower-cased `Status:` value, or undefined when the ticket has none. */
  status: string | undefined
  criteria: Criterion[]
  /** Raw text under `## Comments`, if present. */
  comments: string | undefined
}

export type IssueLevel = 'error' | 'warning'

export interface ParseIssue {
  file: string
  level: IssueLevel
  message: string
}

/** A ticket whose blockers are still raw text, before cross-ticket resolution. */
export interface RawTicket extends Omit<Ticket, 'blockedBy'> {
  blockerTokens: string[]
}

const FILE_RE = /^(\d{1,3})-([a-z0-9][a-z0-9-]*)\.md$/i
const HEADING_RE = /^#\s+(.+?)\s*$/m
const HEADING_NUMBER_RE = /^(\d{1,3})\s*[:.)\-–—]\s*(.+)$/
const CRITERION_RE = /^\s*[-*]\s+\[([ xX])\]\s+(.+?)\s*$/
const COMMENTS_RE = /^##\s+Comments\s*$/im
const NONE_RE = /^(none|n\/a|na|nothing|tidak ada|-|—)\b/i

const FIELD_NAMES = {
  whatToBuild: ['what to build'],
  blockedBy: ['blocked by'],
  status: ['status'],
} as const

function basename(path: string): string {
  const i = Math.max(path.lastIndexOf('/'), path.lastIndexOf('\\'))
  return i === -1 ? path : path.slice(i + 1)
}

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/**
 * Reads a labelled field written either inline (`**Blocked by:** 01, 02`,
 * `Blocked by: 01`) or as an H2 section (`## Blocked by` followed by lines).
 * Inline values continue onto following lines until a blank line.
 */
function readField(body: string, names: readonly string[]): string | undefined {
  const lines = body.split('\n')
  const alt = names.map(escapeRe).join('|')
  const inline = new RegExp(`^\\s*(?:\\*\\*|__)?\\s*(?:${alt})\\s*:?\\s*(?:\\*\\*|__)?\\s*:?\\s*(.*)$`, 'i')
  const section = new RegExp(`^##\\s+(?:${alt})\\s*:?\\s*$`, 'i')

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] ?? ''
    if (section.test(line)) {
      const out: string[] = []
      for (let j = i + 1; j < lines.length; j++) {
        const next = lines[j] ?? ''
        if (/^#{1,6}\s/.test(next)) break
        if (Object.values(FIELD_NAMES).some((group) => readsAsLabel(next, group))) break
        out.push(next)
      }
      return out.join('\n').trim()
    }
    const m = inline.exec(line)
    if (m && !/^#/.test(line)) {
      const out = [m[1] ?? '']
      for (let j = i + 1; j < lines.length; j++) {
        const next = lines[j] ?? ''
        if (next.trim() === '' || inline.test(next) || CRITERION_RE.test(next) || /^#/.test(next)) break
        if (Object.values(FIELD_NAMES).some((group) => readsAsLabel(next, group))) break
        out.push(next)
      }
      return out.join('\n').trim()
    }
  }
  return undefined
}

function readsAsLabel(line: string, names: readonly string[]): boolean {
  const alt = names.map(escapeRe).join('|')
  return new RegExp(`^\\s*(?:\\*\\*|__)?\\s*(?:${alt})\\s*:`, 'i').test(line)
}

/** Splits a `Blocked by` value into reference tokens; empty for "None …". */
export function splitBlockers(value: string | undefined): string[] {
  if (value === undefined) return []
  const cleaned = value
    .split('\n')
    .map((l) => l.replace(/^\s*[-*]\s+/, '').trim())
    .filter((l) => l !== '')
    .join(', ')
    .replace(/\*\*/g, '')
    .trim()
  if (cleaned === '' || NONE_RE.test(cleaned)) return []
  return cleaned
    .split(/\s*(?:,|;|\band\b|&|\bdan\b)\s*/i)
    .map((t) => t.trim())
    .filter((t) => t !== '' && !NONE_RE.test(t))
}

export function parseTicket(file: string, content: string): { ticket?: RawTicket; issues: ParseIssue[] } {
  const issues: ParseIssue[] = []
  const name = basename(file)
  const fm = FILE_RE.exec(name)
  if (!fm) {
    issues.push({ file, level: 'error', message: `file name "${name}" does not match NN-slug.md` })
    return { issues }
  }
  const number = Number(fm[1])
  const slug = (fm[2] ?? '').toLowerCase()

  const text = content.replace(/\r\n/g, '\n')
  const commentsAt = text.search(COMMENTS_RE)
  const body = commentsAt === -1 ? text : text.slice(0, commentsAt)
  const comments = commentsAt === -1 ? undefined : text.slice(commentsAt).replace(COMMENTS_RE, '').trim()

  let title = slug.replace(/-/g, ' ')
  const hm = HEADING_RE.exec(body)
  if (hm) {
    const heading = (hm[1] ?? '').trim()
    const hn = HEADING_NUMBER_RE.exec(heading)
    if (hn) {
      title = (hn[2] ?? '').trim()
      if (Number(hn[1]) !== number) {
        issues.push({
          file,
          level: 'warning',
          message: `heading number ${hn[1]} differs from file number ${fm[1]}; using the file number`,
        })
      }
    } else {
      title = heading
    }
  } else {
    issues.push({ file, level: 'warning', message: 'no "# NN: Title" heading; title taken from the file name' })
  }

  const whatToBuild = readField(body, FIELD_NAMES.whatToBuild) ?? ''
  if (whatToBuild === '') {
    issues.push({ file, level: 'warning', message: 'no "What to build" content' })
  }

  const statusRaw = readField(body, FIELD_NAMES.status)
  const status = statusRaw === undefined || statusRaw === '' ? undefined : statusRaw.replace(/[`*_]/g, '').trim().toLowerCase()

  const blockedRaw = readField(body, FIELD_NAMES.blockedBy)
  if (blockedRaw === undefined) {
    issues.push({ file, level: 'warning', message: 'no "Blocked by" field; treating as unblocked' })
  }

  const criteria: Criterion[] = []
  for (const line of body.split('\n')) {
    const cm = CRITERION_RE.exec(line)
    if (cm) criteria.push({ text: (cm[2] ?? '').trim(), done: (cm[1] ?? ' ').toLowerCase() === 'x' })
  }
  if (criteria.length === 0) {
    issues.push({ file, level: 'warning', message: 'no acceptance criteria checkboxes' })
  }

  return {
    ticket: {
      number,
      slug,
      title,
      file,
      whatToBuild,
      blockerTokens: splitBlockers(blockedRaw),
      status,
      criteria,
      comments,
    },
    issues,
  }
}

function normaliseTitle(s: string): string {
  return s
    .toLowerCase()
    .replace(/^\s*(?:ticket\s*)?#?\d{1,3}\s*[:.)\-–—]?\s*/, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

/**
 * Resolves raw blocker tokens to ticket numbers. Accepts `03`, `#3`,
 * `03-slug`, `Ticket 3`, `03: Title` and plain titles.
 */
export function resolveBlockers(raw: RawTicket[]): { tickets: Ticket[]; issues: ParseIssue[] } {
  const issues: ParseIssue[] = []
  const byTitle = new Map<string, number>()
  for (const t of raw) byTitle.set(normaliseTitle(t.title), t.number)

  const tickets = raw.map(({ blockerTokens, ...rest }): Ticket => {
    const blockedBy = new Set<number>()
    for (const token of blockerTokens) {
      const num = /^(?:ticket\s*)?#?(\d{1,3})\b/i.exec(token.trim())
      if (num) {
        blockedBy.add(Number(num[1]))
        continue
      }
      const linked = /\(([^)]*?)(\d{1,3})-[a-z0-9-]+\.md\)/i.exec(token)
      if (linked) {
        blockedBy.add(Number(linked[2]))
        continue
      }
      const byName = byTitle.get(normaliseTitle(token.replace(/[[\]]/g, '')))
      if (byName !== undefined) {
        blockedBy.add(byName)
        continue
      }
      issues.push({ file: rest.file, level: 'error', message: `cannot resolve blocker "${token}"` })
    }
    return { ...rest, blockedBy: [...blockedBy].sort((a, b) => a - b) }
  })
  return { tickets, issues }
}
