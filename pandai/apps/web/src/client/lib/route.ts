import { useEffect, useState } from 'react'

export type Route = { page: 'overview' } | { page: 'project'; projectId: string }

function parse(hash: string): Route {
  const m = /^#\/p\/([a-z0-9-]+)$/.exec(hash)
  return m ? { page: 'project', projectId: m[1] as string } : { page: 'overview' }
}

export function useRoute(): Route {
  const [route, setRoute] = useState(() => parse(location.hash))
  useEffect(() => {
    const on = () => setRoute(parse(location.hash))
    addEventListener('hashchange', on)
    return () => removeEventListener('hashchange', on)
  }, [])
  return route
}

export const href = {
  overview: '#/',
  project: (id: string) => `#/p/${id}`,
}
