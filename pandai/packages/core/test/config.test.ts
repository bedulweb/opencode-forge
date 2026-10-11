import { describe, expect, test } from 'bun:test'
import { ConfigError, parseRepoConfig, projectForPath } from '../src'

describe('parseRepoConfig', () => {
  test('single-project form with defaults', () => {
    const cfg = parseRepoConfig(`
project: wazapin-api
setup: pnpm install --frozen-lockfile
gate:
  test: pnpm test
  typecheck: pnpm typecheck
`)
    expect(cfg.projects).toHaveLength(1)
    const p = cfg.projects[0]
    expect(p?.id).toBe('wazapin-api')
    expect(p?.path).toBe('.')
    expect(p?.concurrency).toBe(2)
    expect(p?.priority).toBe('normal')
    expect(p?.budget.ticket_usd).toBe(3)
    expect(p?.node.requires).toEqual([])
  })

  test('monorepo form', () => {
    const cfg = parseRepoConfig(`
projects:
  - id: api
    path: apps/api
    gate: { test: pnpm --filter api test }
    priority: high
  - id: web
    path: apps/web
    gate: { test: pnpm --filter web test }
    budget: { ticket_usd: 2, month_usd: 50 }
`)
    expect(cfg.projects.map((p) => p.id)).toEqual(['api', 'web'])
    expect(cfg.projects[1]?.budget).toEqual({ ticket_usd: 2, month_usd: 50 })
  })

  test('reports every invalid setting with its path', () => {
    try {
      parseRepoConfig('project: Bad_Id\ngate: {}\nconcurrency: 0\nunknown: 1\n')
      throw new Error('expected ConfigError')
    } catch (err) {
      expect(err).toBeInstanceOf(ConfigError)
      const problems = (err as ConfigError).problems.join('\n')
      expect(problems).toContain('project')
      expect(problems).toContain('gate.test')
      expect(problems).toContain('concurrency')
      expect(problems).toContain('unknown')
    }
  })

  test('rejects duplicate project ids and bad YAML', () => {
    expect(() =>
      parseRepoConfig('projects:\n  - { id: a, gate: { test: x } }\n  - { id: a, gate: { test: y } }\n'),
    ).toThrow(ConfigError)
    expect(() => parseRepoConfig('project: [')).toThrow(ConfigError)
  })
})

describe('projectForPath', () => {
  const cfg = parseRepoConfig(`
projects:
  - { id: root, path: ".", gate: { test: x } }
  - { id: api, path: apps/api, gate: { test: x } }
  - { id: api-worker, path: apps/api/worker, gate: { test: x } }
`)
  test.each([
    ['apps/api/src/a.ts', 'api'],
    ['apps/api/worker/q.ts', 'api-worker'],
    ['README.md', 'root'],
    ['apps/apix/a.ts', 'root'],
  ])('%p → %p', (file, id) => {
    expect(projectForPath(cfg, file)?.id).toBe(id)
  })
})
