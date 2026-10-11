import { parse as parseYaml } from 'yaml'
import { z } from 'zod'

// `pandai.yml` lives at the root of each repo. It declares one project, or
// several projects that share the repo (monorepo), each scoped to a path.

const Gate = z
  .object({
    test: z.string().min(1),
    typecheck: z.string().min(1).optional(),
    lint: z.string().min(1).optional(),
  })
  .strict()

const Budget = z
  .object({
    ticket_usd: z.number().positive().default(3),
    month_usd: z.number().positive().optional(),
  })
  .strict()

const Models = z
  .object({
    coder: z.string().min(1).optional(),
    reviewer: z.string().min(1).optional(),
    chat: z.string().min(1).optional(),
  })
  .strict()

const Secrets = z
  .object({
    doppler_project: z.string().min(1),
    doppler_config: z.string().min(1).default('pandai-agent'),
  })
  .strict()

const ProjectFields = {
  id: z.string().regex(/^[a-z0-9][a-z0-9-]*$/, 'lowercase letters, digits and dashes'),
  path: z.string().default('.'),
  setup: z.string().min(1).optional(),
  gate: Gate,
  protected_tests: z.array(z.string().min(1)).default([]),
  models: Models.default({}),
  budget: Budget.default({ ticket_usd: 3 }),
  concurrency: z.number().int().min(1).max(10).default(2),
  priority: z.enum(['high', 'normal', 'low']).default('normal'),
  node: z.object({ requires: z.array(z.string().min(1)).default([]) }).strict().default({ requires: [] }),
  secrets: Secrets.optional(),
}

const Project = z.object(ProjectFields).strict()
export type ProjectConfig = z.infer<typeof Project>

// Single-project form uses `project:` for the id; monorepo form lists `projects:`.
const SingleFile = z.object({ project: ProjectFields.id, ...omitId(ProjectFields) }).strict()
const MultiFile = z.object({ projects: z.array(Project).min(1) }).strict()

function omitId<T extends { id: unknown }>(fields: T): Omit<T, 'id'> {
  const { id: _id, ...rest } = fields
  return rest
}

export interface RepoConfig {
  projects: ProjectConfig[]
}

export class ConfigError extends Error {
  constructor(
    message: string,
    readonly problems: string[],
  ) {
    super(message)
  }
}

export function parseRepoConfig(source: string): RepoConfig {
  let data: unknown
  try {
    data = parseYaml(source)
  } catch (err) {
    throw new ConfigError('pandai.yml is not valid YAML', [String(err)])
  }

  const isMulti = typeof data === 'object' && data !== null && 'projects' in data
  const result = isMulti ? MultiFile.safeParse(data) : SingleFile.safeParse(data)
  if (!result.success) {
    const problems = result.error.issues.map((i) => `${i.path.join('.') || '(root)'}: ${i.message}`)
    throw new ConfigError('pandai.yml has invalid settings', problems)
  }

  const projects: ProjectConfig[] =
    'projects' in result.data ? result.data.projects : [{ ...omitProject(result.data), id: result.data.project }]

  const ids = new Set<string>()
  const problems: string[] = []
  for (const p of projects) {
    if (ids.has(p.id)) problems.push(`projects: duplicate id "${p.id}"`)
    ids.add(p.id)
  }
  if (problems.length > 0) throw new ConfigError('pandai.yml has invalid settings', problems)
  return { projects }
}

function omitProject<T extends { project: string }>(data: T): Omit<T, 'project'> {
  const { project: _p, ...rest } = data
  return rest
}

/** Picks the project that owns a changed file path (longest matching `path` wins). */
export function projectForPath(config: RepoConfig, file: string): ProjectConfig | undefined {
  const norm = (p: string) => p.replace(/^\.\/?/, '').replace(/\/+$/, '')
  let best: ProjectConfig | undefined
  let bestLen = -1
  for (const p of config.projects) {
    const base = norm(p.path)
    const matches = base === '' || file === base || file.startsWith(`${base}/`)
    if (matches && base.length > bestLen) {
      best = p
      bestLen = base.length
    }
  }
  return best
}
