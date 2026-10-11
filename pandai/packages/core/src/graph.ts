import type { ParseIssue, Ticket } from './tickets'

export interface TicketGraph {
  tickets: Map<number, Ticket>
  /** Ticket numbers in an order where every blocker precedes its dependents. */
  order: number[]
  issues: ParseIssue[]
}

/** Validates the dependency graph: duplicates, dangling references, self-blocks, cycles. */
export function buildGraph(list: Ticket[]): TicketGraph {
  const issues: ParseIssue[] = []
  const tickets = new Map<number, Ticket>()

  for (const t of list) {
    const existing = tickets.get(t.number)
    if (existing) {
      issues.push({ file: t.file, level: 'error', message: `duplicate ticket number ${t.number} (also ${existing.file})` })
      continue
    }
    tickets.set(t.number, t)
  }

  for (const t of tickets.values()) {
    for (const b of t.blockedBy) {
      if (b === t.number) issues.push({ file: t.file, level: 'error', message: 'ticket blocks itself' })
      else if (!tickets.has(b)) issues.push({ file: t.file, level: 'error', message: `blocked by unknown ticket ${b}` })
    }
  }

  // Kahn's algorithm; whatever cannot be ordered sits on a cycle.
  const indegree = new Map<number, number>()
  const dependents = new Map<number, number[]>()
  for (const t of tickets.values()) {
    const valid = t.blockedBy.filter((b) => b !== t.number && tickets.has(b))
    indegree.set(t.number, valid.length)
    for (const b of valid) dependents.set(b, [...(dependents.get(b) ?? []), t.number])
  }
  const ready = [...indegree].filter(([, d]) => d === 0).map(([n]) => n).sort((a, b) => a - b)
  const order: number[] = []
  while (ready.length > 0) {
    const n = ready.shift() as number
    order.push(n)
    for (const d of (dependents.get(n) ?? []).sort((a, b) => a - b)) {
      const left = (indegree.get(d) ?? 0) - 1
      indegree.set(d, left)
      if (left === 0) {
        ready.push(d)
        ready.sort((a, b) => a - b)
      }
    }
  }
  if (order.length < tickets.size) {
    const stuck = [...tickets.keys()].filter((n) => !order.includes(n)).sort((a, b) => a - b)
    const cycle = findCycle(stuck, tickets)
    issues.push({
      file: tickets.get(stuck[0] as number)?.file ?? '',
      level: 'error',
      message: `dependency cycle: ${(cycle ?? stuck).map((n) => String(n).padStart(2, '0')).join(' → ')}`,
    })
  }

  return { tickets, order, issues }
}

function findCycle(candidates: number[], tickets: Map<number, Ticket>): number[] | undefined {
  const inSet = new Set(candidates)
  for (const start of candidates) {
    const path: number[] = []
    const seen = new Set<number>()
    let cur: number | undefined = start
    while (cur !== undefined && !seen.has(cur)) {
      seen.add(cur)
      path.push(cur)
      cur = tickets.get(cur)?.blockedBy.find((b) => inSet.has(b))
    }
    if (cur !== undefined) {
      const from = path.indexOf(cur)
      return [...path.slice(from), cur]
    }
  }
  return undefined
}

export interface FrontierState {
  /** Tickets whose work is merged into the integration branch. */
  done: ReadonlySet<number>
  /** Tickets currently being worked on. */
  running: ReadonlySet<number>
  /** Status value that marks a ticket as ready for an agent. */
  readyStatus?: string
}

/** Tickets an agent may start now: ready, not done or running, and every blocker done. */
export function frontier(graph: TicketGraph, state: FrontierState): Ticket[] {
  const readyStatus = (state.readyStatus ?? 'ready-for-agent').toLowerCase()
  return graph.order
    .map((n) => graph.tickets.get(n) as Ticket)
    .filter(
      (t) =>
        t.status === readyStatus &&
        !state.done.has(t.number) &&
        !state.running.has(t.number) &&
        t.blockedBy.every((b) => state.done.has(b)),
    )
}
