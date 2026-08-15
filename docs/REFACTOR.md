# 🔧 Refactor Ledger

> Debt worth paying down, parked here so it doesn't block a quest. Each entry
> is a standalone refactor: green tests before, near-empty `cdk diff` after.

## R1 — Extract constructs from `SignalStack`

**Status:** ⚪ not started
**Trigger:** [lib/signal-stack.ts](../lib/signal-stack.ts) is 564 lines in one
`constructor`. Adding the Tagger (Q7) and Harvester (Q8) on top pushes it past
900. Not blocking Act 7 — this is "pay down before it hurts," not "or you're
stuck."

**Not the fix:** more stacks. Cross-stack refs are a real tax (we already felt
it with `crossRegionReferences` for the WAF stack). Split a stack only for
**region, lifecycle, or blast-radius** — never "the file is long." The two
existing splits are the legitimate ones: `GithubOidcStack` (lifecycle) and
`WafStack` (region).

**The fix:** construct extraction, same move as [Telescope](../lib/telescope.ts).
Thin stack = glue; each construct owns one concern **and its own
`NagSuppressions`** (they currently sit in a 150-line pile at the bottom,
divorced from what they defend — co-locating them matches "the suppression
lives with the threat model").

**Naming rule:** construct classes and filenames are production code — they say
what they *are*, not the lore. Lore stays in output descriptions, PROGRESS.md,
and quest names.

| Construct | Owns | Current lines |
|-----------|------|---------------|
| `DataStore` | KMS key, `CatalogueTable`, media bucket (the RETAIN core) | 58–139 |
| `StaticSite` | CloudFront + shell bucket + access-log bucket + deployment | 77–123 |
| `CatalogueApi` | HttpApi, Cognito pool/client, catalogue Lambda, routes, access logs | 141–283 |
| `StreamProcessor` | profile-builder Lambda + `DynamoEventSource` consumer | 157–187 |
| `Monitoring` | SNS topic, both alarms, dashboard | 285–404 |
| `Telescope` | ✅ already extracted | — |

**Along the way:** delete `HelloFunction` (the Quest 0 relic, lines 33–56) —
still deployed with a public function URL, dead weight in every `cdk diff`.
Confirm it isn't serving as a deliberate health check first.

**Preserve logical IDs** during the move (pass the same construct `id`s /
override where needed) so `cdk diff` stays near-empty — this is a
reorganisation, not a redeploy.

## R2 — Stateful/stateless stack split (optional)

**Status:** ⚪ not started — candidate for its own Quest, not a prerequisite.
**Idea studied back at Quest 1, never applied.** A *real* stack boundary that's
defensible at the Boss Fight:

- `SignalDataStack` — `HoardKey`, `CatalogueTable`, media bucket. All `RETAIN`.
  Changes almost never.
- `SignalAppStack` — everything else. Torn down and rebuilt freely.

**Benefit:** an app mistake's blast radius can't reach the hoard — `cdk destroy`
the app, redeploy, data untouched. **Cost:** cross-stack refs for table name +
key ARN — but *same-region*, so plain CloudFormation exports, none of the
`crossRegionReferences` pain from WAF.

**Do R1 first.** R1 is pure upside and unblocks Act 7; R2 is worth doing for the
lesson but don't let it block anything.
