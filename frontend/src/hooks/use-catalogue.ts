import { useCallback, useEffect, useState } from 'react'
import { type Shitpost, fetchShitposts } from '../api/catalogue'

export type CatalogueState =
  | { status: 'loading' }
  | { status: 'ready'; shitposts: readonly Shitpost[] }
  | { status: 'failed'; message: string }

export type Catalogue = {
  state: CatalogueState
  retry: () => void
}

export const useCatalogue = (): Catalogue => {
  const [state, setState] = useState<CatalogueState>({ status: 'loading' })
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    const controller = new AbortController()
    setState({ status: 'loading' })

    fetchShitposts(controller.signal)
      .then((shitposts) => {
        if (!controller.signal.aborted) {
          setState({ status: 'ready', shitposts })
        }
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) return
        setState({
          status: 'failed',
          message:
            error instanceof Error
              ? error.message
              : 'The catalogue sent something unreadable',
        })
      })

    return () => controller.abort()
  }, [attempt])

  const retry = useCallback(() => setAttempt((previous) => previous + 1), [])

  return { state, retry }
}
