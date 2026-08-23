import { useCallback, useEffect, useState } from 'react'
import { type Shitpost, fetchShitposts } from '../api/shitposts'

export type ShitpostsState =
  | { status: 'loading' }
  | { status: 'ready'; shitposts: readonly Shitpost[] }
  | { status: 'failed'; message: string }

export type UseShitposts = {
  state: ShitpostsState
  retry: () => void
}

export const useShitposts = (): UseShitposts => {
  const [state, setState] = useState<ShitpostsState>({ status: 'loading' })
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
              : 'The shitposts API sent something unreadable',
        })
      })

    return () => controller.abort()
  }, [attempt])

  const retry = useCallback(() => setAttempt((previous) => previous + 1), [])

  return { state, retry }
}
