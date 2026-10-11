import { describe, expect, test } from 'bun:test'
import { mkdtemp, mkdir, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { buildGraph, frontier, hasErrors, loadFeature, parseTicket, resolveBlockers, splitBlockers } from '../src'

// Exact shape of mattpocock/skills to-tickets <local-ticket-template>.
const TEMPLATE = `# 03: Retry failed payment notification

**What to build:** When a payment fails, the buyer gets a WhatsApp message,
retried up to 3 times.

**Blocked by:** 01, 02

**Status:** ready-for-agent

- [ ] Buyer receives a message within a minute of the failure
- [x] Retries stop after 3 attempts
`

describe('parseTicket', () => {
  test('reads the canonical to-tickets template', () => {
    const { ticket, issues } = parseTicket('.scratch/pay/issues/03-retry-notification.md', TEMPLATE)
    expect(issues).toEqual([])
    expect(ticket?.number).toBe(3)
    expect(ticket?.slug).toBe('retry-notification')
    expect(ticket?.title).toBe('Retry failed payment notification')
    expect(ticket?.whatToBuild).toBe('When a payment fails, the buyer gets a WhatsApp message,\nretried up to 3 times.')
    expect(ticket?.blockerTokens).toEqual(['01', '02'])
    expect(ticket?.status).toBe('ready-for-agent')
    expect(ticket?.criteria).toEqual([
      { text: 'Buyer receives a message within a minute of the failure', done: false },
      { text: 'Retries stop after 3 attempts', done: true },
    ])
  })

  test('accepts plain labels and the GitHub-style H2 sections', () => {
    const md = `# 02: Store notification log

## What to build

A table recording each notification attempt.

## Acceptance criteria

- [ ] Each attempt is stored

## Blocked by

- #1

Status: ready-for-agent
`
    const { ticket } = parseTicket('02-store-log.md', md)
    expect(ticket?.whatToBuild).toBe('A table recording each notification attempt.')
    expect(ticket?.blockerTokens).toEqual(['#1'])
    expect(ticket?.criteria).toHaveLength(1)
  })

  test('separates the Comments section and ignores its checkboxes', () => {
    const md = `${TEMPLATE}\n## Comments\n\nPandai: blocked on API key\n- [ ] not a criterion\n`
    const { ticket } = parseTicket('03-x.md', md)
    expect(ticket?.criteria).toHaveLength(2)
    expect(ticket?.comments).toContain('blocked on API key')
  })

  test('rejects file names that are not NN-slug.md', () => {
    expect(parseTicket('tickets.md', TEMPLATE).issues[0]?.level).toBe('error')
  })

  test('warns when heading and file numbers disagree, trusting the file', () => {
    const { ticket, issues } = parseTicket('04-x.md', TEMPLATE)
    expect(ticket?.number).toBe(4)
    expect(issues.some((i) => i.message.includes('differs'))).toBe(true)
  })
})

describe('splitBlockers', () => {
  test.each([
    ['None (can start immediately)', []],
    ['none', []],
    ['N/A', []],
    ['01, 02 and 05', ['01', '02', '05']],
    ['#3; #4', ['#3', '#4']],
    ['01 dan 02', ['01', '02']],
  ])('%p', (input, expected) => {
    expect(splitBlockers(input)).toEqual(expected)
  })
})

describe('resolveBlockers', () => {
  const raw = (number: number, title: string, blockerTokens: string[]) => ({
    number,
    slug: `t${number}`,
    title,
    file: `${number}.md`,
    whatToBuild: 'x',
    blockerTokens,
    status: 'ready-for-agent',
    criteria: [],
    comments: undefined,
  })

  test('resolves numbers, hashes, slugs, links and titles', () => {
    const { tickets, issues } = resolveBlockers([
      raw(1, 'Schema', []),
      raw(2, 'API endpoint', []),
      raw(3, 'UI', ['01-schema', '#2']),
      raw(4, 'Docs', ['Ticket 3', 'API endpoint', '[Schema](./01-schema.md)']),
    ])
    expect(issues).toEqual([])
    expect(tickets.find((t) => t.number === 3)?.blockedBy).toEqual([1, 2])
    expect(tickets.find((t) => t.number === 4)?.blockedBy).toEqual([1, 2, 3])
  })

  test('reports references it cannot resolve', () => {
    const { issues } = resolveBlockers([raw(1, 'A', ['the database thing'])])
    expect(issues[0]?.level).toBe('error')
  })
})

describe('graph and frontier', () => {
  const t = (number: number, blockedBy: number[], status = 'ready-for-agent') => ({
    number,
    slug: `t${number}`,
    title: `T${number}`,
    file: `${number}.md`,
    whatToBuild: 'x',
    blockedBy,
    status,
    criteria: [],
    comments: undefined,
  })

  test('orders blockers first and computes the frontier from merged work', () => {
    const graph = buildGraph([t(3, [1, 2]), t(1, []), t(2, [1]), t(4, [], 'ready-for-human')])
    expect(graph.issues).toEqual([])
    expect(graph.order).toEqual([1, 2, 3, 4])
    const ids = (done: number[], running: number[] = []) =>
      frontier(graph, { done: new Set(done), running: new Set(running) }).map((x) => x.number)
    expect(ids([])).toEqual([1])
    expect(ids([1])).toEqual([2])
    expect(ids([1], [2])).toEqual([])
    expect(ids([1, 2])).toEqual([3])
    expect(ids([1, 2, 3])).toEqual([])
  })

  test('detects cycles, self-blocks, duplicates and dangling references', () => {
    const cyc = buildGraph([t(1, [3]), t(2, [1]), t(3, [2])])
    expect(cyc.issues.map((i) => i.message)).toContain('dependency cycle: 01 → 03 → 02 → 01')
    expect(buildGraph([t(1, [1])]).issues[0]?.message).toBe('ticket blocks itself')
    expect(buildGraph([t(1, []), t(1, [])]).issues[0]?.message).toContain('duplicate')
    expect(buildGraph([t(1, [9])]).issues[0]?.message).toBe('blocked by unknown ticket 9')
  })
})

describe('loadFeature', () => {
  test('loads a .scratch feature directory end to end', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'pandai-'))
    await mkdir(join(dir, 'issues'))
    await writeFile(join(dir, 'spec.md'), '## Problem Statement\n\nx\n')
    await writeFile(
      join(dir, 'issues', '01-schema.md'),
      '# 01: Schema\n\n**What to build:** table\n\n**Blocked by:** None (can start immediately)\n\n**Status:** ready-for-agent\n\n- [ ] migrated\n',
    )
    await writeFile(join(dir, 'issues', '02-api.md'), TEMPLATE.replace('# 03:', '# 02:').replace('01, 02', '01'))
    const feature = await loadFeature(dir)
    expect(hasErrors(feature.issues)).toBe(false)
    expect(feature.graph.order).toEqual([1, 2])
    expect(frontier(feature.graph, { done: new Set(), running: new Set() }).map((x) => x.number)).toEqual([1])
  })

  test('flags the legacy combined tickets.md file', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'pandai-'))
    await writeFile(join(dir, 'tickets.md'), '# tickets')
    const feature = await loadFeature(dir)
    expect(hasErrors(feature.issues)).toBe(true)
  })
})
