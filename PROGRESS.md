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
- **XP:** 400 / 1900
- **Current quest:** Quest 2 — The Gateway

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
| 2 | **The Gateway** | API Gateway, Zod, hexagonal refactor | 250 | 🔵 Next |
| 3 | **The Fortress** | IAM least-privilege, KMS, Cognito, cdk-nag | 300 | ⚪ |
| 4 | **The Watchtower** | Structured logs, EMF metrics, alarms, dashboards | 200 | ⚪ |
| 4.5 | **The Telescope** | Wide events, Firehose→Parquet→S3, Athena | 200 | ⚪ |
| 5 | **The Assembly Line** | GitHub Actions, OIDC, cdk diff gates | 200 | ⚪ |
| 6 | **The Algorithm** | Taste profile, DynamoDB Streams, For You feed | 150 | ⚪ |
| 🐉 | **Boss Fight** | Mock BBC interview — defend every choice | 200 | ⚪ |

**Total: 1900 XP**

## 🚢 Ship Log

*(newest first — every session gets a line, even the scrappy ones)*

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
