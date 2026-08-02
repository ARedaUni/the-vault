# 🛰️ Signal — Quest Log

> **The mission:** build **The Vault** — a private shitpost archive with a web
> gallery — and **The Algorithm**, a personalisation engine that learns which
> of your own shitposts you keep coming back to. Secretly, this is the BBC
> Core Data Platform job spec in disguise: CDK, Lambda, API Gateway, DynamoDB,
> S3/CloudFront, IAM/KMS, Cognito, CloudWatch, Athena, GitHub Actions.
>
> Technical detail lives in [docs/TECHNICAL_ROADMAP.md](docs/TECHNICAL_ROADMAP.md).

## 🧙 Character Sheet

- **Player:** Ali (Intermediate class)
- **Specialisations:** Serverless & APIs · Cloud Security
- **XP:** 1700 / 1900
- **Current quest:** Quest 7 — The Tagger

## 📜 Rules of the Realm

1. **Ship every session.** Each session ends with something deployed, however
   small. No session ends in a broken state.
2. **Sessions are 30–60 minutes.** When time's up, ship what's shippable and
   log it. Momentum beats marathon.
3. **TDD always.** No production code without a failing test first.
4. **XP is only earned when the understanding checkpoint is passed** — if you
   can't explain it, the quest isn't done.
5. **Log every ship** in the Ship Log below, same session.
6. **`--profile personal` on every mutating AWS command.** The default profile
   is the work account. Verify with `aws sts get-caller-identity --profile
   personal` → account `983401047748` before any deploy.

## ⚔️ Quests

| Quest | Name | Covers | XP | Status |
|-------|------|--------|----|--------|
| 0 | **First Contact** | CDK, deploy loop, Lambda Function URL | 100 | ✅ 2026-07-19 |
| 1 | **The Hoard** | S3 media bucket, bulk upload, DynamoDB catalogue | 200 | ✅ 2026-07-19 |
| 1.5 | **The Vault Door** | Gallery UI, CloudFront, OAC, CORS | 100 | ✅ 2026-07-20 |
| 2 | **The Gateway** | API Gateway, Zod, hexagonal refactor | 250 | ✅ 2026-07-22 |
| 3 | **The Fortress** | IAM least-privilege, KMS, Cognito, cdk-nag | 300 | ✅ 2026-07-25 |
| 4 | **The Watchtower** | Structured logs, EMF metrics, alarms, dashboards | 200 | ✅ 2026-07-26 |
| 4.5 | **The Telescope** | Wide events, Firehose→Parquet→S3, Athena | 200 | ✅ 2026-07-28 |
| 5 | **The Assembly Line** | GitHub Actions, OIDC, cdk diff gates | 200 | ✅ 2026-07-30 |
| 6 | **The Algorithm** | Taste profile, DynamoDB Streams, For You feed | 150 | ✅ 2026-08-02 |
| 7 | **The Tagger** | Bedrock Claude vision, auto-tagging, backfill over the untagged hoard | 150 | ⚪ |
| 8 | **The Harvester** | Reddit saved-posts client (hexagonal port/adapter), Secrets Manager, EventBridge Scheduler pipeline | 250 | ⚪ |
| 9 | **The Viewing Room** | Real frontend: login UI, ❤️ buttons, For You tab | 200 | ⚪ |
| 🐉 | **Boss Fight** | Mock BBC interview — defend every choice | 200 | ⚪ |

**Total: 2500 XP**

## 🚢 Ship Log

*(newest first — every session gets a line, even the scrappy ones)*

- **2026-08-02 (session 9) — Quest 6 COMPLETE: checkpoint passed 🟡
  (+150 XP → 1700/1900). 🧮** The Algorithm lives: ❤️ → POST /signals
  (Cognito JWT) writes a SIGNAL item with the shitpost's tags copied in
  at write time (Event-Carried State Transfer — the receipt is frozen
  truth); the table's stream (NEW_AND_OLD_IMAGES) feeds a profile-builder
  Lambda through an ESM filtered to `INSERT ∧ SK begins SIGNAL#` (the
  filter is also the loop-breaker — the builder's own tally writes hit
  the same tape); tallies live as per-tag items (`PROFILE#TAG#cats`,
  atomic `ADD`); GET /feed ranks the hoard by tag affinity in one Query,
  degrading to newest-first for strangers. Tags added to the domain via
  lazy migration — `.default([])` at the Zod boundary, zero backfill,
  verified live against the 91 pre-tags rows. End-to-end proven in prod:
  2 signals → 1 builder invocation → `spongebob: 2, memes: 2` →
  spongebob promoted over newer posts. Exam 🟡🟡🔴🟢🟡 + retake taught:
  ESM checkpoints are per-consumer (poison batch ≠ contagion), REMOVEs
  are invisible to an INSERT-only filter. Debt: partial batch responses
  / retryAttempts / bisect / DLQ on the ESM (double-count drift),
  userId from body not JWT claim, feed auth waits on login UI, signals
  not yet in the lake (Telescope carries ops telemetry only — the
  batch lane can't yet recompute tallies). Ideas banked: the Harvester
  (Reddit saved-posts ingestion + LLM auto-tagging), frontend quest.
  Next: campaign extended — Quest 7: The Harvester. 🌾

- **2026-07-30 (session 8, close) — Quest 5 COMPLETE: checkpoint PASSED
  (+200 XP → 1550/1900). 🏭** The Vault deploys itself: push to main →
  tests → OIDC handshake → cdk diff → deploy, no stored credentials
  anywhere. `GithubOidcStack` TDD'd (provider, deploy role, nag-clean):
  trust policy pins repo+branch with StringEquals; the role's only power
  is assuming the `cdk-*` bootstrap roles (two-door design). Researched
  the professional landscape first — AWS's own sample construct fails
  its industry's hardening guides (AdministratorAccess on the CI role,
  `ForAllValues` in an Allow, `repo:*` default filter); ours is stricter
  than the official example. **First automated deploy failed live:**
  `Not authorized to perform sts:AssumeRoleWithWebIdentity` — CloudTrail
  showed the real sub claim carries immutable numeric IDs
  (`repo:ARedaUni@124036817/the-vault@1305146249:...`), which no guide
  documents yet. RED→GREEN on the pin, redeploy, rerun: every step green;
  keyring retired. Exam 🟡🔴🟡🟡🔴 first round, redemption 🟢🟡 (CloudTrail
  ground truth; `needs:` structural gate). Debt carried: `needs:` refactor
  to one workflow, Environments approval gate, SHA-pinned actions,
  read-only diff role for PRs. Next: The Algorithm. 🧮
- **2026-07-28 (session 7, close) — Quest 4.5 COMPLETE: checkpoint PASSED
  (+200 XP → 1350/1900). 🔭** The Telescope live end-to-end: catalogue wide
  events → log subscription → Firehose → unwrap Lambda → Parquet → S3 →
  Glue → Athena. First query answered (15 requests, avg 105ms, 1 cold
  start) scanning 289 bytes — per-byte pricing taught on a real receipt.
  Built as an L3 construct from line one (god-constructor remedy applied
  into the change); coupling audit mid-quest birthed the Glue↔wide-event
  contract test. **Production bug shipped and caught:** unit tests green,
  pipeline dropped 100% of events — the Node runtime prefixes console.log
  with `timestamp<TAB>requestId<TAB>INFO<TAB>`, killing JSON.parse; fix
  parses from the first `{`, guarded by a fixture captured verbatim from
  the live log group. Exam 60/100 first round (🟡🟢🟢🔴🟡), redemption
  swept 🟢🟢 (DefaultPolicy race; precompute-offline/read-online split).
  Debt carried: SNS alarm email, burn-rate alerting, Athena workgroup +
  date partitions, `as LogsEnvelope` Zod. Next: The Assembly Line. 🏭
- **2026-07-26 (session 6, close) — Quest 4 COMPLETE: checkpoint PASSED
  (+200 XP → 1150/1900). 🗼** Lightning round 🟡🔴🔴🟡🟢, redemption swept
  🟢🟢🟡. Nailed: cardinality (ghost dead on third encounter), distrust-the-
  metric-first, detection/diagnosis doctrine with the right tools. Corrected:
  EMF's silent failure leaves the LOGS looking healthy (only extraction
  dies — hence the envelope tests are the only guard); a p99 spike sends you
  to Logs Insights, not back to the graph (aggregation is a one-way door);
  the error alarm's threshold of 1 follows from the ~3-error monthly budget
  (thresholds follow budgets, not convention); `treatMissingData:
  notBreaching` by name. New concept banked for a future quest: burn-rate
  alerting — alarm on the PACE of budget spend, not after the tank is empty
  ("alarm at 300 errors" = fuel light that comes on when empty). Open debt
  carried forward: alarm→email SNS publish failure. Next: The Telescope. 🔭

- **2026-07-26 (session 6, continued) — Quest 4 parts 5–7: the stopped watch,
  the watchtower screen, the debts repaid. 📺** Logs Insights lesson paid off
  immediately: querying the live breakage data exposed a real observability
  bug — failed requests showed `repositoryDurationMs: 0` because the decorator
  only recorded after a successful await, so the 840ms spent waiting for IAM
  to say no was invisible. TDD'd the fix (duration in `finally`, items on
  success). Then the five-widget golden-signals dashboard as code: alarm
  state top-left, errors, p50-vs-p99 (the tail made visible — p99 spiked to
  1.1s on cold starts while p50 barely moved), traffic via the SampleCount
  trick (every request emits errorCount, so its sample count IS request
  count), saturation from free Lambda/DynamoDB metrics; tests pin the
  five-widget budget and alarm-first ordering. Finally repaid the two
  suppressions that named Quest 4 as their due date: real API Gateway access
  logs (JSON to CloudWatch, 30-day retention — the gateway sees the 401s/404s
  the Lambda never receives) and CloudFront viewer logs to a dedicated S3
  bucket (90-day expiry — the future Athena data source). APIG1 + CFR3
  suppressions deleted; one honest S1 added (log buckets can't log
  themselves). 73/73 green. Undeployed: part 7. Remaining: push, checkpoint.

- **2026-07-25 (session 6) — Quest 4 parts 1–4: the Watchtower is LIVE and
  the smoke detector proved itself. 🚨** Validated folder structure against
  bedrock-chat (routes/usecases/repositories match name-for-name; our
  domain/ is a stricter hexagon) then fixed a connascence-of-identity bug:
  decorator and drain must be the same instance, so the factory now returns
  the married pair — illegal states unrepresentable. EMF taught and TDD'd
  (customs declaration on the parcel: `_aws` envelope, metrics extracted at
  ingestion, zero API calls, log and metric can never disagree; dimensions
  stay low-cardinality, requestId stays in the parcel). SLO chosen: 99.9%
  per 30 days — at Vault traffic that's a ~3-error monthly budget, so the
  error alarm fires on the FIRST error (Sum ≥ 1 per 5 min) and latency on
  p99 > 1s for 3 consecutive periods; `treatMissingData: notBreaching`
  because quiet nights have no datapoints, not failures. SNS pager topic
  (masterKey + enforceSSL — SNS2/SNS3 fixed, not suppressed). Deployed and
  ran the deliberate-breakage ceremony: pointed the Lambda at
  TableThatDoesNotExist → AccessDeniedException 500s (IAM refused before
  DynamoDB checked existence — least privilege demonstrated), wide events
  told the story, CatalogueErrorAlarm → ALARM in 5 minutes, healed by
  restoring the env var (drift lesson: cdk deploy diffs templates, not
  reality — it cannot see console/CLI drift). **Open debt: the alarm's SNS
  publish failed ("Failed to execute action") — the pager never emailed.
  Prime suspect: topic access policy missing sns:Publish for
  cloudwatch.amazonaws.com. Deferred, not forgotten.** Cold-start anatomy
  captured live: 1041ms total / 802ms repository (SDK first-connection
  ceremony), warm 6–42ms.

- **2026-07-25 (session 5, close) — Quest 3 COMPLETE: checkpoint PASSED
  (+300 XP → 950/1900). Halfway point of the campaign.** First round
  🟢🟡🟢🔴🟢🔴: banked JWKS, nailed WAF-at-layer-7, and killed the CORS
  reflex mid-sentence ("SIKE") — the ghost is dead on its fifth appearance.
  Missed the envelope chain (second slip) and suppression legitimacy;
  redemption recovered both: three dolls named with homes (data key beside
  the object ← bucket key at S3 ← HoardKey never leaving KMS), and the
  suppression triad — threat-model reason, single-resource scope, repayment
  condition. New machinery taught: CloudFront as generic reverse proxy
  (any HTTPS endpoint is an origin) and the x-origin-verify pattern — the
  secret never transits the browser, OAC for APIs. Parts 3+4 shipped same
  session: WAF built/tested behind -c waf=true (~$7/mo not worth it, tests
  keep it honest for free), cdk-nag as a build gate — 27 findings became
  3 fixes (Node 24, PITR, 12-char password policy — all deployed and
  verified live) + 24 signed suppressions. Next: The Watchtower.

- **2026-07-24 (session 5) — Quest 3 parts 1+2: the membership office and the
  locksmith. 🔐** Cognito user pool (self-signup OFF — members minted by admin
  only) + `HttpUserPoolAuthorizer` on POST /shitposts; GET pinned public *by
  declared intent* (`AuthorizationType: 'NONE'`, not absent). Live-proved the
  whole ladder: no token → 401, forged token → 401 (killed at the gateway by
  offline JWKS verification — Lambda never invoked, rejection is free), real
  ID token → 201. Deep-dives: Cognito as identity *broker* (one issuer ever,
  even with Google/SAML behind it), auth-flow menu (SRP vs USER_PASSWORD vs
  choice-based OTP/passkeys), asymmetric crypto's one sentence — *the secret
  stays home; the world gets the verifier*. Then KMS: `HoardKey`
  (rotate-yearly, RETAIN — a key you can lose is data you can lose) sealing
  vault bucket + catalogue table; keys map to data classifications, not
  services (public shell keeps defaults — proven by test). 4 red → 45/45
  green, deployed, smoke-tested the classic outage: uploaded a KMS-sealed
  object and fetched it through CloudFront (200 — CDK really did put the
  distribution on the key policy). Known debt, accepted: the 91 pre-key
  objects stay SSE-S3. Remaining for Quest 3: WAF, cdk-nag, checkpoint.

- **2026-07-22 (session 4, close) — Quest 2 COMPLETE: final checkpoint PASSED
  (+100 XP → 650/1900).** First round 🔴🔴🟡🟡🟡 — the "CORS token"
  misconception died on its third appearance (full wire transcript: preflight
  is an automatic browser OPTIONS, the reply is plain read-once headers,
  nothing is carried; unapproved writes never leave the browser). 400-must-be-
  a-no-op (validate before side effects), contract-suite-as-membership-test
  (round-trip catches stale reads), orphaned-bytes named. Redemption 3/3.
  Deep-dives delivered: distributed-transaction ladder (choose your orphan →
  compensate/saga → reconcile — the backfill script IS a primitive reconciler
  → presigned-URL + event-driven flow, Quest 6) and the ladder of proof
  (fake → stubbed contract → smoke test; the ':pkk' typo shows why rung 3 is
  load-bearing). Quest 2 ✅ — next stop, The Fortress.

- **2026-07-22 (session 4, addendum) — Quest 2 part-1 checkpoint PASSED
  (+150 XP, 100 rides on the write path).** First round 🟡🟢🟢🔴🔴: nailed
  CORS-is-browser-etiquette and API-is-public-until-Cognito, plus
  types-check-shapes-contracts-check-behaviour; dropped the DI/port/adapter
  names, marshalling (didn't know DynamoDB always stores typed envelopes —
  DocumentClient is client-side gloves), and pattern-matched an IAM
  AccessDenied to CORS. Redemption swept 3/3: DI/port/adapter named, raw
  client returns `{S: …}` (storage never changes), and the PutItem infra red
  in signal.test.ts is what forces grantReadData → grantReadWriteData.
  Watch: answers getting terser — names without reasons bank nothing at the
  Boss Fight.

- **2026-07-20 (session 4) — Quest 2 part 1: the Gateway is LIVE; the gallery
  runs on its own API. 🚪** Full hexagonal catalogue Lambda TDD'd
  (domain/usecases/repositories/routes, exemplar's folder dialect; Zod at every
  trust boundary — env, DB rows; Ali's audit then killed 4 vendor/plumbing
  tests and renamed the suite to plain behaviour specs — analogies stay in
  teaching, out of tests). Article-driven hardening: repository contract suite
  runs ONE spec against both the in-memory fake and the DynamoDB adapter (fake
  can't drift silently), and the handler maps repo failures to a leak-free 500.
  HTTP API v2 (exemplar's flavour) with CORS pinned to the gallery's origin
  alone, `grantReadData` (least privilege — read-only until a write use case
  demands more). Backfilled all 91 vault objects into the catalogue
  (BatchWrite, 25-per-chunk, uploadedAt from S3 LastModified). Gallery flipped
  from frozen manifest.json (deleted — debt repaid) to cross-origin
  `GET /shitposts`; CORS verified live (right origin gets the consent header,
  evil.example.com gets silence). Deploys: 74s + 90s. New debt: API_URL
  hardcoded in index.html → build-time env injection when Vite arrives.
  Remaining for Quest 2: write path (POST + port `save()` + contract growth +
  test/support extraction), checkpoint.

- **2026-07-20 (session 3, addendum) — Quest 1.5 checkpoint PASSED (+100 XP).**
  First round was rough (two reds: claimed both buckets RETAIN; reached for
  lower-TTL instead of invalidation/rename) — every miss taught, then a
  redemption round swept 3/3: destroy-behaviour per bucket with the
  replaceability rule, invalidation-now vs exclusive-IDs-forever, and the
  badge/pin distinction (SourceArn pins the *distribution* ARN — which embeds
  the account). Also nailed first try: CORS wasn't needed because everything
  is same-origin; it fires when Quest 2's API lands on its own domain — and
  CORS is enforced by the browser, the server merely consents. Quest 1.5 ✅.

- **2026-07-19 (session 3, part 2) — the Gallery is LIVE: all 91 shitposts on
  one page. 🖼️** Applied the lifecycles rule to buckets: disposable
  DESTROY+autoDeleteObjects shell bucket for the page, vault stays RETAIN; one
  door, two rooms (default → shell, `media/*` → vault — why we prefixed media/).
  TDD (4 red → 20/20 green); two more over-pinned tests diagnosed on sight and
  refactored (Lambda count, single-origin array) — the badge test now demands
  OAC on *every* origin. BucketDeployment ships index.html + manifest.json and
  invalidates both paths each deploy (Q2's cache lesson, automated). Verified:
  `/` 200 html, `/manifest.json` 200 with 91 keys, `/media/*` 200 png.
  Taught: WAF (the bouncer: managed rules, rate-based rules = system-wide rate
  limiting at the edge, us-east-1 quirk, real cost — hence Quest 3 not now) and
  the defence-in-depth ladder (WAF/CloudFront ✓/Cognito/IAM ✓/KMS). CORS not
  needed today — same origin; fires for real at Quest 2. manifest.json is
  admitted tech debt, repaid by Quest 2's API. Remaining for Quest 1.5:
  checkpoint.

- **2026-07-19 (session 3) — the Vault Door opens: first light on the hoard. 🚪**
  CloudFront + OAC over the sealed vault, TDD'd (4 red → 16/16 green: HTTPS-only
  door, OAC-not-OAI, bucket policy pinned to our distribution ARN, GalleryUrl
  output). Casualty on the way: Quest 1's TLS test was *over-pinned* (asserted
  the whole Statement array) and broke when OAC legitimately appended its allow —
  refactored to `Match.arrayWith`; behaviour-not-implementation applies to infra
  tests too. Deployed in 201s (edge propagation is the slow part), then proved
  all three beats: 200 via the door, 403 on raw S3 for the same object, and
  `x-cache: Miss` → `Hit` on back-to-back requests. Gotcha logged: object keys
  with spaces need percent-encoding — gallery UI must `encodeURIComponent`.
  Taught: OAC = badge + guest list + pin; identity-based vs resource-based
  policies; the entrance map (humans → Identity Center, AWS services → badge +
  guest list, your code → execution role). Remaining for Quest 1.5: gallery UI,
  CORS, checkpoint.

- **2026-07-19 (session 2, addendum) — Quest 1 checkpoint PASSED (+200 XP).**
  Defended: the Scan trap (signals for one shitpost aren't co-located → no
  nameable drawer), hot partitions (one PK = one drawer = one machine's ~3k/s
  ceiling; fix = shard the key `SHITPOST#0..9`, query in parallel, merge), and
  the judgement call: **filters tune a query you have; GSIs create a query
  you don't; separate tables separate lifecycles** (TTL, removal policy,
  backups, IAM are *table-level* — data needing different settings needs a
  different table). Quest 1 ✅. Metadata backfill rolls into next session
  alongside the DocumentClient/marshalling lesson.

- **2026-07-19 (session 2) — the Catalogue is live: DynamoDB joins the party.**
  Learned single-table design from scratch (WhatsApp-chats mental model: PK
  picks the chat, SK is the order inside it, Query opens one chat, Scan trawls
  every chat on the phone). Designed the table access-patterns-first — six
  patterns, generic `PK`/`SK` entity-prefixed keys so *any* signal kind is
  plug-and-play. TDD'd it (4 red → 11/11 green: key schema, PAY_PER_REQUEST,
  RETAIN pin, output), deployed in 21s, then proved the design from the CLI:
  wrote a VIEW + a REACT signal into `USER#ali`'s drawer and queried them back
  newest-first with `begins_with(SK, 'SIGNAL#')`. Security review: table is
  default-deny private; first real grant arrives with Quest 2's Lambda.
  Bonus round: studied bedrock-chat's frontend construct (OAC one-liner, SPA
  error rewrites, DESTROY-able asset bucket = removal policy tracks
  *replaceability*), met CDK Aspects via their log-retention checker — then
  applied the lesson: TDD'd 30-day log retention onto HelloFunction
  (12/12 green), deployed, deleted the orphaned 731-day log group.
  Next: Quest 1 checkpoint (hot partitions, GSI vs filter), then metadata
  backfill for the 91 shitposts.

- **2026-07-19 — Quest 0 checkpoint passed (+100 XP); Quest 1 begun: the Vault
  exists.** TDD'd the media bucket (4 red assertion tests → green: Block Public
  Access, TLS-only bucket policy, RETAIN so the hoard survives destroy),
  `cdk diff` reviewed, deployed in 33s, then `aws s3 sync`ed the collection:
  **91 shitposts / 16.4MB in the vault**, verified by listing. Concepts today:
  SSO identity flow (roles-as-costumes), policy vs role, L1/L2/L3 constructs,
  how real CDK apps scale (studied bedrock-chat: custom constructs as L3s,
  stateful/stateless stack splits). Next: DynamoDB catalogue.

- **2026-07-18 — Quest 0 shipped. 🛰️ Signal is ONLINE.** Bootstrapped
  TheWeeDonkey, deployed SignalStack (Lambda + public function URL), curled it:
  `{"service":"signal","status":"online","quest":0}`. Fought a real production
  bug on the way: AWS's October 2025 rule change requires function URL
  policies to grant `lambda:InvokeFunction` as well as
  `lambda:InvokeFunctionUrl`; our CDK version predated the fix. Diagnosed
  layer-by-layer (direct invoke ✓ → URL ✗ → read the actual policy → docs),
  fixed test-first, upgraded aws-cdk-lib 2.215→2.261, 6-second incremental
  redeploy. Earlier in the quest: built the AWS org (Hastings + TheWeeDonkey),
  Identity Center SSO, `--profile personal` guardrails. **Bonus twist:
  project reskinned — Signal now personalises Ali's shitpost collection**
  (The Vault + The Algorithm; see roadmap).

## 🧠 Learnings

- **The write path must not know its readers.** Option A (update the profile
  inline) died on coupling: every new consumer means editing POST /signals.
  The stream inverts it — the table write is atomic with its tape record, and
  each consumer attaches with its own ESM and its own checkpoint. Adding
  "trending" later = one new consumer, zero write-path edits; one consumer
  crash-looping on a poison batch stalls only its own bookmark.
- **Events are frozen facts; copy state in at write time.** The signal carries
  the shitpost's tags as of the moment of liking (Event-Carried State
  Transfer). Cost accepted: re-tagging the post never updates old signals —
  which is correct, because receipts that get edited can't audit anything.
  Corollary: "clean up signals when the post is deleted" manufactures
  inconsistency — the REMOVEs are invisible to an INSERT-only filter, so
  tallies would keep claiming likes whose receipts are gone.
- **At-least-once delivery means your increments will eventually double.**
  Batch of 3, crash on #3, full-batch retry recounts #1–2. `ADD` is atomic
  but not idempotent. Defenses in cost order: partial batch responses,
  retryAttempts/maxRecordAge/bisect/DLQ, idempotent writes — or let the
  batch lane (recompute from all history) correct the streaming lane's
  drift. Streaming = fast and approximately right; batch = slow and exactly
  right; real platforms run both.
- **NoSQL schema changes are code changes, not migrations.** No ALTER TABLE
  exists; the schema lives in the Zod file. Additive field + sensible
  default = `.default([])` at the boundary (AWS calls it lazy migration /
  application tolerance) — 91 legacy rows parsed clean in prod, zero items
  rewritten. A Put on an existing key is the write-back upgrade. Reserve
  `schemaVersion` stamps for fields that change *meaning*.
- **Counters want their own items.** `ADD tally :1` on `PROFILE#TAG#<tag>`
  is atomic and creates-if-missing; a map inside one profile item can't be
  atomically incremented into existence. The read side pays one
  `begins_with` Query for the whole profile — CQRS in miniature: writer
  (builder) holds a write-only port and IAM, reader (feed) holds a
  read-only one; the item shape is their only contract, pinned by tests
  on both sides.

- **OIDC removes the secret instead of hiding it better.** An access key in
  repo secrets is a permanent password in someone else's cloud; OIDC stores
  nothing — GitHub signs a per-run passport (repo, branch, immutable IDs)
  and STS trades it for a one-hour keycard, but only if the trust policy's
  `StringEquals` matches exactly. The role ARN in secrets is an address,
  not a credential.
- **When three configs all look correct, stop guessing and pull the evidence.**
  Trust policy, repo casing, provider — all verified "right" — yet STS said
  no. CloudTrail logs the rejected `AssumeRoleWithWebIdentity` WITH the
  actual sub the token carried: GitHub now embeds immutable numeric IDs
  (`ARedaUni@124036817`) that no guide documents. Same doctrine as the
  captured fixture: production's own record beats reasoning from docs.
  Bonus: pinning IDs beats pinning names — names are reusable after account
  deletion, IDs never.
- **The CI role opens the lobby, not the vault.** Its single permission is
  `sts:AssumeRole` on the `cdk-*` bootstrap roles; the heavy permissions
  live behind that second door, pre-installed by `cdk bootstrap`. Leaked
  badge = "whatever a CDK deploy can do, one hour, from main only" — never
  direct S3/DynamoDB access. AWS's own sample attaches AdministratorAccess;
  don't copy the vendor's homework.
- **A gate you don't enforce is a decoration.** Two workflows racing on the
  same push means deploy merely HOPES CI passed; either duplicate the tests
  in the deploy job (our v1) or make it structural with `needs:` in one
  workflow — GitHub keeps no dependency graph between separate files.
- **A boundary you don't own needs a captured fixture, not an invented one.**
  Five green unit tests; production dropped 100% of wide events. The
  hand-rolled CloudWatch envelope omitted what the docs never mention: Node's
  runtime prefixes every console.log with `timestamp<TAB>requestId<TAB>INFO<TAB>`.
  Contract tests work between parties you control; against AWS, paste a real
  payload from the live log group into the test — the mock can't lie if it
  IS production.
- **CDK grants live in a separate DefaultPolicy resource, and some services
  check their permissions at creation time.** Referencing `roleArn` makes
  CloudFormation wait for the Role only — which can exist while still empty.
  Firehose validates on create → race. `node.addDependency(role)` on the
  whole construct waits for the role AND its children.
- **A data lake is one durable store wearing three disposable services.**
  Delete Glue (metadata), Athena (stateless), or Firehose (minutes of
  buffer) and no data is lost; only S3 is stateful. Parquet is columnar so
  Athena — billed per byte SCANNED, not compute — reads only the columns the
  query names (289 bytes from a 1,824-byte file on the first query).
- **Precompute offline, read online.** Athena aggregates slowly-and-cheaply
  once (nightly `GROUP BY tag` = taste profile); the result lands in DynamoDB
  under `USER#ali` for 5ms hot-path reads. That split — batch brain, fast
  memory — is the backbone of every recommender.
- **Metrics for detection, logs for diagnosis.** Aggregation is a one-way
  door: the p99 line can say THAT you're slow, never WHICH requests or WHY —
  everything not on the EMF declaration was thrown away at extraction. The
  dashboard points at the fire; Logs Insights reads the individual parcels
  (still holding requestId, errorName, itemCount) to find the cause. Corollary:
  requestId can never be a metric dimension — per-request series balloon the
  bill (caught twice; exam material).
- **The time a dependency spends failing is the most important time to
  measure.** Recording duration only on the success path made an 840ms IAM
  refusal look like 0ms of repository time. Stopwatches belong in `finally`.
  You find the gaps in your instruments by using them, not by writing them.

- **CloudFront is a chain of newspaper kiosks.** The origin is one sealed
  warehouse; ~600 edge kiosks keep shelf copies governed by TTL — S3 never
  notifies CloudFront of changes (five minutes after an overwrite you still get
  the old cat). Fresh content = invalidation (emergency lever) or versioned/
  hashed filenames (the strategy). OAC is the loading dock: CloudFront signs
  requests as `cloudfront.amazonaws.com` (badge), a resource-based bucket
  policy admits it (guest list), and an `AWS:SourceArn` condition pins it to
  *our* distribution (delivery number) — the bucket stays `BLOCK_ALL` throughout.
- **The entrance map — three credential paths, one guard.** Humans enter via
  Identity Center (temporary costume); AWS services acting as themselves enter
  via service principal + resource policy (badge + guest list, e.g. OAC); your
  own code enters via an execution role (tailored costume, trust policy names
  the service). Every path converges on the same IAM evaluation engine.
- **DynamoDB is WhatsApp chats.** PK = which chat, SK = position within it
  (timestamp-prefixed SKs make every chat a free timeline). Query = open one
  named chat (fast at any scale); Scan = search every message in every chat.
  A question is only fast if some drawer is already organised around it —
  hence access-patterns-first design. Attributes are schemaless per item
  (only keys are enforced), which is what makes new signal kinds plug-and-play.
- **DynamoDB is private by default — there is no public mode to switch off.**
  Only signed IAM-evaluated API calls reach it; default-deny does the rest.
  Security work starts when the first non-human consumer appears
  (`table.grantReadWriteData(fn)` = least privilege derived from the object
  graph). Defer security decisions to the last responsible moment — and know
  when that moment is (Quest 2).
- **Infra tests: driving vs pinning.** Some assertions force code into the
  template (Block Public Access — CDK omits it otherwise); others pin a
  default so it can't silently change under a CDK/AWS upgrade (RETAIN).
  Both legit, different jobs. Don't assert construction trivia.
- **Role = assumable identity ("who"); policy = permission document
  ("may they"). ** Every role has a trust policy (who can wear it) plus
  permission policies (what it can do). Member accounts have no passwords —
  identity lives in Identity Center, access is a borrowed costume via STS.

- **Since Oct 2025, public Lambda function URLs need TWO permissions:**
  `lambda:InvokeFunctionUrl` AND `lambda:InvokeFunction` (with
  `InvokedViaFunctionUrl: true`). A correct-looking single-permission policy
  403s. Old tutorials and CDK < ~2.216 are wrong for new accounts.
- **Debug access-denied from the inside out:** direct SDK invoke proved the
  function worked; that isolated the fault to the URL's auth layer; reading
  the actual resource policy (not the CDK code) found the gap.
- **Commit early.** The original scaffold was lost to a mystery file wipe with
  zero commits to recover from. Never again.
- **Check the account before you deploy.** Nearly deployed to the work account
  via the default profile. Hence Rule 6.
