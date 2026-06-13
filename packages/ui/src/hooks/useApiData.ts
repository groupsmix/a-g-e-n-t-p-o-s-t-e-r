import { useCallback, useEffect, useState } from 'react'

export interface UseApiDataResult<T> {
  data: T | null
  loading: boolean
  error: string | null
  refresh: () => void
}

/**
 * useApiData — wrapper around useState + useEffect for simple API fetches.
 *
 * Usage:
 *   const { data, loading, error, refresh } = useApiData(() => api.getSomething(), [])
 *
 * Replace any page that has the pattern:
 *   const [data, setData] = useState(null)
 *   const [loading, setLoading] = useState(true)
 *   useEffect(() => { api.get().then(setData).finally(() => setLoading(false)) }, [])
 */
export function useApiData<T>(
  fetcher: () => Promise<T>,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  deps: any[] = [],
): UseApiDataResult<T> {
  const [data,    setData]    = useState<T | null>(null)
  const [loading, setLoading] = useState(true)
  const [error,   setError]   = useState<string | null>(null)

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const refresh = useCallback(() => {
    setLoading(true)
    setError(null)
    fetcher()
      .then(setData)
      .catch((e: unknown) =>
        setError(e instanceof Error ? e.message : 'Failed to load data')
      )
      .finally(() => setLoading(false))
  }, deps)

  useEffect(() => { refresh() }, [refresh])

  return { data, loading, error, refresh }
}
