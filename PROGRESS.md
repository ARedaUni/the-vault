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
- **XP:** 100 / 1900
- **Current quest:** Quest 1 — The Hoard

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
| 1 | **The Hoard** | S3 media bucket, bulk upload, DynamoDB catalogue | 200 | 🔵 In progress |
| 1.5 | **The Vault Door** | Gallery UI, CloudFront, OAC, CORS | 100 | ⚪ |
| 2 | **The Gateway** | API Gateway, Zod, hexagonal refactor | 250 | ⚪ |
| 3 | **The Fortress** | IAM least-privilege, KMS, Cognito, cdk-nag | 300 | ⚪ |
| 4 | **The Watchtower** | Structured logs, EMF metrics, alarms, dashboards | 200 | ⚪ |
| 4.5 | **The Telescope** | Wide events, Firehose→Parquet→S3, Athena | 200 | ⚪ |
| 5 | **The Assembly Line** | GitHub Actions, OIDC, cdk diff gates | 200 | ⚪ |
| 6 | **The Algorithm** | Taste profile, DynamoDB Streams, For You feed | 150 | ⚪ |
| 🐉 | **Boss Fight** | Mock BBC interview — defend every choice | 200 | ⚪ |

**Total: 1900 XP**

## 🚢 Ship Log

*(newest first — every session gets a line, even the scrappy ones)*

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
