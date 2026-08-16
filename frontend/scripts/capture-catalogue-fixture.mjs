// Captures the fixture the hermetic e2e suite serves.
//
// The fixture is a verbatim, contiguous slice of a real catalogue response —
// never hand-authored. A boundary you don't own needs a captured fixture: an
// invented one passes its own tests while quietly diverging from what AWS
// actually sends.
//
//   npm run fixture:capture
//
// The suite re-parses the result through the strict contract schema on every
// run, so a fixture that has drifted fails loudly rather than lying.

import { readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
const frontend = path.join(here, '..')

/** Newest N. Contiguous, so the ordering the API chose survives the slice. */
const SAMPLE_SIZE = 12

const readOrigin = () => {
  if (process.env.AWS_API_ORIGIN) return process.env.AWS_API_ORIGIN

  const env = readFileSync(path.join(frontend, '.env'), 'utf8')
  const origin = env
    .split('\n')
    .find((line) => line.startsWith('AWS_API_ORIGIN='))
    ?.slice('AWS_API_ORIGIN='.length)
    .trim()

  if (!origin) {
    throw new Error('AWS_API_ORIGIN is set neither in the environment nor .env')
  }
  return origin
}

const origin = readOrigin()
const response = await fetch(`${origin}/shitposts`)

if (!response.ok) {
  throw new Error(`The catalogue responded ${response.status}`)
}

const { shitposts } = await response.json()

if (!Array.isArray(shitposts) || shitposts.length === 0) {
  throw new Error('The catalogue returned no shitposts to capture')
}

const captured = { shitposts: shitposts.slice(0, SAMPLE_SIZE) }
const destination = path.join(frontend, 'e2e/fixtures/catalogue.json')

writeFileSync(destination, `${JSON.stringify(captured, null, 2)}\n`)

console.log(
  `Captured ${captured.shitposts.length} of ${shitposts.length} shitposts from ${origin}`,
)
