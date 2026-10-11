import { Hono } from 'hono'
import { COLUMNS, type Column, type MoveRequest } from '../shared/types'
import { sampleWorkspace } from './sample'

type Env = { Bindings: Record<string, never> }

const app = new Hono<Env>()

app.get('/api/health', (c) => c.json({ ok: true }))

// Until the GitHub App is wired, the workspace is sample data.
app.get('/api/workspace', (c) => c.json(sampleWorkspace()))

app.post('/api/cards/:owner/:repo/:number/move', async (c) => {
  const body = await c.req.json<Partial<MoveRequest>>().catch(() => ({}) as Partial<MoveRequest>)
  if (!body.column || !(COLUMNS as readonly string[]).includes(body.column)) {
    return c.json({ error: `column must be one of: ${COLUMNS.join(', ')}` }, 400)
  }
  // Will set the `pandai:<column>` label on the GitHub issue.
  return c.json({ ok: true, sample: true, column: body.column as Column })
})

app.all('/api/*', (c) => c.json({ error: 'not found' }, 404))

export default app
