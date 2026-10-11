import { readdir, readFile, stat } from 'node:fs/promises'
import { join } from 'node:path'
import { buildGraph, type TicketGraph } from './graph'
import { parseTicket, resolveBlockers, type ParseIssue, type RawTicket } from './tickets'

export interface Feature {
  dir: string
  spec: string | undefined
  graph: TicketGraph
  /** All parse and graph issues; any `error` means the feature must not run unattended. */
  issues: ParseIssue[]
}

async function exists(path: string): Promise<boolean> {
  try {
    await stat(path)
    return true
  } catch {
    return false
  }
}

/** Loads `.scratch/<feature>/` written by mattpocock/skills (local tracker). */
export async function loadFeature(dir: string): Promise<Feature> {
  const issues: ParseIssue[] = []
  const specPath = join(dir, 'spec.md')
  const spec = (await exists(specPath)) ? await readFile(specPath, 'utf8') : undefined
  if (spec === undefined) issues.push({ file: specPath, level: 'warning', message: 'no spec.md' })

  if (await exists(join(dir, 'tickets.md'))) {
    issues.push({
      file: join(dir, 'tickets.md'),
      level: 'error',
      message: 'single combined tickets.md is not supported; re-run to-tickets to write one file per ticket',
    })
  }

  const issuesDir = join(dir, 'issues')
  const names = (await exists(issuesDir)) ? (await readdir(issuesDir)).filter((n) => n.endsWith('.md')).sort() : []
  if (names.length === 0) issues.push({ file: issuesDir, level: 'error', message: 'no ticket files found' })

  const raw: RawTicket[] = []
  for (const name of names) {
    const file = join(issuesDir, name)
    const parsed = parseTicket(file, await readFile(file, 'utf8'))
    issues.push(...parsed.issues)
    if (parsed.ticket) raw.push(parsed.ticket)
  }

  const resolved = resolveBlockers(raw)
  issues.push(...resolved.issues)
  const graph = buildGraph(resolved.tickets)
  issues.push(...graph.issues)

  return { dir, spec, graph, issues }
}

export function hasErrors(issues: readonly ParseIssue[]): boolean {
  return issues.some((i) => i.level === 'error')
}
