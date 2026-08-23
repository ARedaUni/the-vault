import { z } from 'zod'

/**
 * The shitposts wire format, as *this consumer* needs it.
 *
 * Deliberately not imported from lambda/shared/domain: that is the backend's
 * internal model, and the frontend depends on the deployed HTTP response
 * instead. The two are kept honest by the contract spec, which parses a real
 * API response — a runtime check against what is actually deployed, rather
 * than a compile-time check against whatever happens to be in the tree.
 */
const shitpostShape = {
  shitpostKey: z.string().min(1),
  uploadedAt: z.iso.datetime(),
  tags: z.array(z.string().min(1)),
}

/** Tolerant read: unknown keys are stripped, so a new field cannot break the UI. */
export const shitpostSchema = z.object(shitpostShape)

/**
 * `nextCursor` is opaque and optional: opaque because only the API knows
 * how it pages and this consumer must never parse one, optional because its
 * absence is how the last page announces itself.
 */
const pageShape = {
  shitposts: z.array(shitpostSchema),
  nextCursor: z.string().min(1).optional(),
}

export const shitpostsResponseSchema = z.object(pageShape)

export type Shitpost = z.infer<typeof shitpostSchema>

export type ShitpostPage = z.infer<typeof shitpostsResponseSchema>

/**
 * Drift canary, for the contract spec only. Rejects unknown keys, so the API
 * growing or renaming a field turns into a failing test rather than a silent
 * divergence between the two halves of the system.
 */
export const exactShitpostsResponseSchema = z.strictObject({
  ...pageShape,
  shitposts: z.array(z.strictObject(shitpostShape)),
})
