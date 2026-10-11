import { useCallback, useEffect, useState } from 'react'
import type { Column, Workspace } from '../../shared/types'

export function useWorkspace() {
  const [data, setData] = useState<Workspace | null>(null)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/workspace')
      if (!res.ok) throw new Error(`Server menjawab ${res.status}`)
      setData((await res.json()) as Workspace)
      setError(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    }
  }, [])

  useEffect(() => {
    void load()
    const t = setInterval(() => void load(), 30_000)
    return () => clearInterval(t)
  }, [load])

  /** Optimistic move; reverts by reloading if the server refuses. */
  const moveCard = useCallback(
    async (cardId: string, column: Column) => {
      setData((d) => (d ? { ...d, cards: d.cards.map((c) => (c.id === cardId ? { ...c, column } : c)) } : d))
      const [repoPath, number] = cardId.split('#')
      const res = await fetch(`/api/cards/${repoPath}/${number}/move`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ column }),
      }).catch(() => null)
      if (!res?.ok) await load()
    },
    [load],
  )

  return { data, error, reload: load, moveCard }
}
