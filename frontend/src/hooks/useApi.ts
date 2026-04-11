import { useState, useEffect, useCallback, useRef } from 'react'

interface ApiState<T> {
  data: T | null
  loading: boolean
  error: string | null
  refetch: () => void
}

export function useApi<T>(
  fetcher: () => Promise<T>,
  deps: unknown[] = [],
): ApiState<T> {
  const [data, setData] = useState<T | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const cancelRef = useRef(false)

  const fetch = useCallback(async () => {
    cancelRef.current = false
    setLoading(true)
    setError(null)
    try {
      const result = await fetcher()
      if (!cancelRef.current) {
        setData(result)
      }
    } catch (e) {
      if (!cancelRef.current) {
        setError(e instanceof Error ? e.message : String(e))
      }
    } finally {
      if (!cancelRef.current) {
        setLoading(false)
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps)

  useEffect(() => {
    fetch()
    return () => { cancelRef.current = true }
  }, [fetch])

  return { data, loading, error, refetch: fetch }
}

export function usePoll<T>(
  fetcher: () => Promise<T>,
  intervalMs: number,
  deps: unknown[] = [],
): ApiState<T> {
  const state = useApi<T>(fetcher, deps)
  const { refetch } = state

  useEffect(() => {
    const id = setInterval(refetch, intervalMs)
    return () => clearInterval(id)
  }, [refetch, intervalMs])

  return state
}
