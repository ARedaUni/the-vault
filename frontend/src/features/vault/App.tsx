import { useShitposts } from './useShitposts'
import { Tile } from './Tile'

const countLabel = (total: number): string =>
  `${total} ${total === 1 ? 'shitpost' : 'shitposts'}`

export const App = () => {
  const { state, retry, loadMore, remove } = useShitposts()

  return (
    <>
      <header>
        <h1>🔐 The Vault</h1>
        {state.status === 'ready' && (
          <p className="count" aria-live="polite">
            {countLabel(state.shitposts.length)}
          </p>
        )}
      </header>

      <main>
        {state.status === 'loading' && (
          <p role="status" className="notice">
            Opening the vault…
          </p>
        )}

        {state.status === 'failed' && (
          <div role="alert" className="notice">
            <p>The vault would not open. {state.message}</p>
            <button type="button" onClick={retry}>
              Try again
            </button>
          </div>
        )}

        {state.status === 'ready' &&
          (state.shitposts.length === 0 ? (
            <p className="notice">The vault is empty.</p>
          ) : (
            <>
              {state.problem !== undefined && (
                <p role="alert" className="notice">
                  That shitpost would not delete. {state.problem}
                </p>
              )}
              <ul aria-label="Shitposts" className="grid">
                {state.shitposts.map((shitpost) => (
                  <Tile
                    key={shitpost.shitpostKey}
                    shitpost={shitpost}
                    onDelete={() => remove(shitpost.shitpostKey)}
                  />
                ))}
              </ul>
              {state.hasMore && (
                <button type="button" className="more" onClick={loadMore}>
                  Load more
                </button>
              )}
            </>
          ))}
      </main>
    </>
  )
}
