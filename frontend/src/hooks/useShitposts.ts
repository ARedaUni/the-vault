import { useCallback, useEffect, useRef, useState } from 'react'
import { type Shitpost, fetchShitposts } from '../api/shitposts'

export type ShitpostsState =
  | { status: 'loading' }
  | { status: 'ready'; shitposts: readonly Shitpost[]; hasMore: boolean }
  | { status: 'failed'; message: string }

export type UseShitposts = {
  state: ShitpostsState
  retry: () => void
  loadMore: () => void
}

const messageFrom = (error: unknown): string =>
  error instanceof Error
    ? error.message
    : 'The shitposts API sent something unreadable'

export const useShitposts = (): UseShitposts => {
  const [state, setState] = useState<ShitpostsState>({ status: 'loading' })
  const [attempt, setAttempt] = useState(0)

  /**
   * Held in a ref rather than state: it is what the *next* request needs, not
   * something the view renders. `hasMore` is the rendered shadow of it.
   * Cleared while a page is in flight, so a second click cannot fetch the same
   * cursor twice and append the same shitposts twice.
   */
  const nextCursor = useRef<string | undefined>(undefined)

  useEffect(() => {
    const controller = new AbortController()
    setState({ status: 'loading' })

    fetchShitposts({ signal: controller.signal })
      .then((page) => {
        if (controller.signal.aborted) return
        nextCursor.current = page.nextCursor
        setState({
          status: 'ready',
          shitposts: page.shitposts,
          hasMore: page.nextCursor !== undefined,
        })
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) return
        setState({ status: 'failed', message: messageFrom(error) })
      })

    return () => controller.abort()
  }, [attempt])

  const retry = useCallback(() => setAttempt((previous) => previous + 1), [])

  const loadMore = useCallback(() => {
    const cursor = nextCursor.current
    if (cursor === undefined) return
    nextCursor.current = undefined

    fetchShitposts({ cursor })
      .then((page) => {
        nextCursor.current = page.nextCursor
        setState((previous) =>
          previous.status === 'ready'
            ? {
                status: 'ready',
                shitposts: [...previous.shitposts, ...page.shitposts],
                hasMore: page.nextCursor !== undefined,
              }
            : previous,
        )
      })
      .catch((error: unknown) => {
        setState({ status: 'failed', message: messageFrom(error) })
      })
  }, [])

  return { state, retry, loadMore }
}
