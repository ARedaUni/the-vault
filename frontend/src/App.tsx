import { useEffect, useState } from 'react'

const API_BASE = import.meta.env.DEV
  ? '/api'
  : 'https://iv2saq46m9.execute-api.eu-west-2.amazonaws.com'

const VIDEO = /\.(mp4|webm|mov)$/i

type Shitpost = { shitpostKey: string }

const toUrl = (key: string) =>
  '/' + key.split('/').map(encodeURIComponent).join('/')

const Tile = ({ shitpostKey }: Shitpost) =>
  VIDEO.test(shitpostKey) ? (
    <video src={toUrl(shitpostKey)} title={shitpostKey} controls muted preload="metadata" />
  ) : (
    <img src={toUrl(shitpostKey)} alt={shitpostKey} loading="lazy" />
  )

export const App = () => {
  const [shitposts, setShitposts] = useState<Shitpost[]>([])

  useEffect(() => {
    fetch(`${API_BASE}/shitposts`)
      .then((res) => res.json())
      .then((body: { shitposts: Shitpost[] }) => setShitposts(body.shitposts))
  }, [])

  return (
    <>
      <h1>🔐 The Vault — {shitposts.length} shitposts</h1>
      <div id="grid">
        {shitposts.map((s) => (
          <Tile key={s.shitpostKey} shitpostKey={s.shitpostKey} />
        ))}
      </div>
    </>
  )
}
