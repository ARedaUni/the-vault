# 🛰️ Signal — Technical Roadmap

> The companion to [PROGRESS.md](../PROGRESS.md). That file tracks *progress*;
> this one explains the *technical territory* each quest covers, why it matters,
> and what "actually understanding it" looks like. Written against the skills in
> the BBC Core Data Platform role spec.

---

## The system we're building

```
                        ┌─────────────────────────────────────────────┐
                        │                  AWS Account                │
                        │                                             │
  ┌────────┐  HTTPS     │  ┌─────────────┐      ┌─────────────┐       │
  │ Gallery│───────────▶│  │ API Gateway │─────▶│   Lambda    │       │
  │ (web UI│   JWT      │  │ (REST +     │      │ (catalogue /│       │
  │  /curl)│◀───────────│  │  validation)│      │  signals /  │       │
  └────┬───┘            │  └──────┬──────┘      │  recommend) │       │
       │ images         │         │             └──────┬──────┘       │
  ┌────▼───────┐        │  ┌──────▼──────┐      ┌──────▼──────┐       │
  │ CloudFront │───────▶│  │   Cognito   │      │  DynamoDB   │       │
  │ (CDN)      │  S3    │  │ (user pool) │      │ (metadata + │       │
  └────────────┘ media  │  └─────────────┘      │  signals)   │       │
                        │                       └─────────────┘       │
                        │  ┌───────────────────────────────────┐      │
                        │  │ CloudWatch: logs, metrics, alarms │      │
                        │  └───────────────────────────────────┘      │
                        └─────────────────────────────────────────────┘
                                        ▲
                                        │ deploys via CDK (CloudFormation)
                              GitHub Actions (OIDC, no long-lived keys)
```

**The content is your shitpost collection.** The images live in S3 and are
served through CloudFront to a web gallery (**The Vault**). Metadata — tags,
source, spice level — lives in DynamoDB. A **signal** is one consumption
event: *"Ali viewed shitpost X at time T, reacted 🔥."* The API ingests
signals, stores them per-user, and by the final quest **The Algorithm** folds
them into a personalised For You feed of your own shitposts. This is the
miniature version of what the BBC's personalisation platform does for
iPlayer/Sounds — same architecture, considerably worse content.

## Architecture evolution — including hexagonal

We deliberately **don't** start with hexagonal architecture. The progression:

1. **Quest 0–1: naive.** Handler talks straight to DynamoDB. Minimal layers.
   You need to *feel* the coupling pain before the abstraction earns its keep —
   and Quest 0's job is proving the deploy loop, not architecture.
2. **Quest 2 (refactor step): hexagonal.** Once there are two handlers and an
   HTTP layer, we refactor to ports & adapters. This is TDD's refactor phase
   applied at architecture scale: tests stay green while the shape changes.
3. **Quest 3+: the payoff.** Auth, encryption, and observability slot in as
   adapters/decorators without touching domain logic. This is where you'll see
   why the pattern exists.

### Hexagonal in a serverless context

```
        driving side (in)                          driven side (out)
  ┌────────────────────┐    ┌──────────────────┐    ┌─────────────────────┐
  │ Lambda handler     │    │      DOMAIN      │    │ DynamoDbSignalStore │
  │ (APIGW adapter)    │───▶│  recordSignal()  │───▶│ (implements         │
  │ parse/validate/    │    │  getProfile()    │    │  SignalStore port)  │
  │ map to domain call │    │  recommend()     │    │                     │
  └────────────────────┘    │                  │    ├─────────────────────┤
  ┌────────────────────┐    │ pure functions,  │    │ InMemorySignalStore │
  │ (future: SQS/      │───▶│ zero AWS imports │───▶│ (tests)             │
  │  EventBridge       │    └──────────────────┘    └─────────────────────┘
  │  adapter)          │       ports = TS interfaces defined BY the domain
  └────────────────────┘
```

Key ideas we'll practice:

- **Ports are owned by the domain** — `SignalStore` is a TypeScript interface in
  the domain folder; DynamoDB is a detail that implements it. Dependency
  inversion: the arrow of *knowledge* points inward.
- **The Lambda handler is an adapter, not the app.** It translates
  `APIGatewayProxyEvent` → domain types → `APIGatewayProxyResult`. It should be
  boring and thin.
- **Tests hit the domain through ports** with in-memory fakes — fast, no AWS
  needed. A small number of integration tests hit the real adapters.
- **Serverless nuance:** the "hexagon" lives *per Lambda*, but domain code is
  shared across functions. We'll structure the repo so functions are thin entry
  points over a shared core (`src/domain`, `src/adapters`, `src/handlers`).

Folder shape we'll converge on:

```
src/
  domain/          # pure: types, ports (interfaces), use cases
  adapters/
    in/            # handler-side: event parsing, response mapping
    out/           # infra-side: DynamoDbSignalStore, CloudWatchMetrics
  handlers/        # Lambda entry points: wire adapters to use cases (composition root)
lib/               # CDK stacks (infrastructure)
bin/               # CDK app entry
test/              # domain tests (fakes), adapter tests, CDK assertion tests
```

---

## Quest 0 — First Contact: CDK & the deployment loop

**Goal:** demystify what "infrastructure as code" actually does, end to end.

### Concepts

- **CDK mental model.** You write TypeScript → `cdk synth` compiles it to a
  CloudFormation template (JSON) → CloudFormation diffs & applies it as a
  **stack**. CDK is a *compiler for infrastructure*; CloudFormation is the
  execution engine. The role spec lists both — this is why.
- **Constructs, three levels.** L1 (`Cfn*`, raw CloudFormation), L2 (curated,
  e.g. `lambda.Function` — sane defaults, helper methods like
  `table.grantReadData(fn)`), L3 (patterns, multi-resource). We live at L2.
- **`cdk bootstrap`.** One-time per account/region: creates the S3 bucket, ECR
  repo, and IAM roles CDK needs to upload assets and deploy. Worth reading what
  it creates — it's an IAM lesson in itself.
- **App → Stack → Construct tree**, and how logical IDs map to real resources.
- **`cdk diff`** — the habit of previewing every change before deploying, like
  reading a migration before running it.
- **Lambda Function URLs** — the quickest way to get an HTTPS endpoint on a
  Lambda with zero API Gateway. Perfect for the first ship; replaced in Quest 2.

### Understanding checkpoint

You can explain: what `cdk synth` outputs, what bootstrap created, what happens
in CloudFormation when a deploy fails halfway (rollback), and why `cdk destroy`
is safe.

---

## Quest 1 — The Hoard: S3 & DynamoDB, the shitpost catalogue

**Goal:** get the collection into the cloud, then single-table thinking and
access-pattern-first design — the biggest mindset shift coming from relational
databases.

### Concepts

- **S3 as the media store.** Buckets, keys, why S3 is *object* storage not a
  filesystem; block public access (the bucket stays private — CloudFront gets
  access later via Origin Access Control); bulk ingestion of the existing
  collection with `aws s3 sync`; content types and why they matter for
  serving images.
- **Metadata vs media.** The image bytes live in S3; everything queryable
  about a shitpost (tags, source, spice level, upload date) lives in DynamoDB.
  This split — blob store + key-value catalogue — is the standard pattern for
  media platforms, iPlayer included.
- **Access patterns first.** In DynamoDB you design the table *from the
  queries*, not the entities. Ours: (1) add a shitpost's metadata, (2) list
  the catalogue newest-first, (3) list by tag, (4) record a view/reaction
  signal, (5) get a user's signals newest-first, (6) later: aggregate into a
  taste profile.
- **Key design.** Partition key `PK = USER#<id>` groups a user's data on one
  partition; sort key `SK = SIGNAL#<ISO8601 timestamp>` gives free
  chronological ordering and range queries (`begins_with`, `between`). This
  pattern — entity-prefixed composite keys — is the core DynamoDB idiom.
- **Query vs Scan** (and why Scan is almost always wrong), pagination with
  `LastEvaluatedKey`, eventual vs strong consistency, and what an RCU/WCU is
  (billing *and* throughput model — on-demand mode hides but doesn't remove it).
- **GSIs** (global secondary indexes): a second key-shape over the same data —
  we'll add one when a new access pattern demands it, not before.
- **Marshalling.** DynamoDB's attribute-value format vs plain JS objects;
  `@aws-sdk/lib-dynamodb`'s DocumentClient. SDK v3's modular client design.
- **Encryption at rest** is on by default (AWS-owned key) — Quest 3 upgrades
  this to a customer-managed KMS key and explains why that matters.
- **TDD here:** domain logic tested against an in-memory store; the DynamoDB
  adapter gets a thin integration test. We also meet **CDK assertion tests**
  (`aws-cdk-lib/assertions`) — unit tests for your infrastructure ("the table
  has point-in-time recovery enabled").

### Understanding checkpoint

You can design a key schema for a new access pattern, explain why hot
partitions happen, and say when you'd reach for a GSI vs a new table vs
`Query` with a filter.

---

## Quest 1.5 — The Vault Door: the gallery goes visual

**Goal:** something you can *look at* — a web gallery of the collection,
shipped early so every later quest has a visible payoff. Covers static
hosting and CDN, both on the spec.

### Concepts

- **S3 static website hosting vs CloudFront + private bucket.** Why the
  production answer is a private bucket behind CloudFront with **Origin
  Access Control** (the bucket rejects everyone except the CDN).
- **CloudFront mental model:** edge locations, cache keys, TTLs and
  invalidation, and why the BBC cares (this is how iPlayer survives being
  popular). One distribution, two origins: `/` → the gallery's static files,
  `/media/*` → the shitpost bucket.
- **The gallery itself stays deliberately dumb** — a static page that calls
  the API for the catalogue and renders images from CloudFront. No framework
  ceremony; the point is the AWS plumbing, not React. Every view/reaction it
  sends is a signal, which feeds everything downstream.
- **CORS, for real this time:** the gallery origin talking to the API origin
  is the canonical CORS setup — configured once, understood forever.

### Understanding checkpoint

You can explain why the bucket is private yet the images load, trace an image
request from browser → edge → origin, and say what a cache invalidation
actually does.

---

## Quest 2 — The Gateway: API design & the hexagonal refactor

**Goal:** a production-shaped REST API, and the architecture refactor.

### Concepts

- **REST API Gateway vs HTTP API vs Function URLs** — the real trade-off table
  (request validation, usage plans, WAF support vs cost & simplicity). The BBC
  spec says API development; REST API Gateway teaches the most.
- **Request validation at the edge.** JSON Schema models on API Gateway reject
  malformed payloads *before* your Lambda runs — cheaper, safer, and your
  Lambda's input space shrinks. Defence in depth layer #1.
- **Schema-first with Zod** at the trust boundary (per your CLAUDE.md):
  define the `Signal` schema once, derive the TS type, validate in the adapter.
  Edge validation (API GW) + code validation (Zod) are complementary, not
  redundant — the second protects against the first being misconfigured.
- **Error shape discipline.** Consistent problem-details-style errors; correct
  status codes (400/401/403/404/409/422/500); never leaking internals in 500s.
- **Lambda proxy integration** — what API Gateway actually passes to your
  handler and expects back, and where that mapping belongs (the `in` adapter).
- **The hexagonal refactor itself** (see architecture section above): done as a
  TDD refactor step — behaviour tests unchanged and green throughout. This is
  the session where the architecture earns its name.
- **Idempotency** (intro): what happens when a client retries a POST; designing
  the signal ID so retries don't double-count. Critical for event pipelines.

### Understanding checkpoint

You can justify every layer a request passes through, and add a new endpoint
touching only: one schema, one use case, one handler wiring line.

---

## Quest 3 — The Fortress: security (the role's core)

**Goal:** the deepest quest. "Handling sensitive data and implementing robust
security practices" is essential criteria #1 in the spec.

### Concepts

- **IAM mental model.** Principals, actions, resources, conditions; identity
  vs resource policies; how a request is evaluated (explicit deny > allow >
  implicit deny). **Least privilege in practice:** each Lambda gets its own
  execution role scoped to exactly its table actions (`dynamodb:PutItem` on one
  table ARN — not `dynamodb:*`). CDK's `grant*` methods generate these; we'll
  read the generated policies, not just trust them.
- **KMS.** Customer-managed keys (CMK) vs AWS-managed vs AWS-owned; envelope
  encryption (data key encrypted by the CMK); key policies vs IAM policies;
  why a CMK gives you: audit trail of every decrypt (CloudTrail), the power to
  revoke access instantly, and key rotation. We'll switch the table to a CMK
  and optionally field-level-encrypt one sensitive attribute to see envelope
  encryption by hand.
- **Cognito.** User pools (authentication — who are you) vs identity pools
  (AWS credentials — skip for now). The **JWT flow**: sign-up → sign-in →
  ID/access/refresh tokens → API Gateway **Cognito authorizer** validates the
  JWT signature & expiry before invoking Lambda. Then **authorization** in our
  code: the user ID comes from the *token claims* (`sub`), never from the
  request body — that one rule is what stops users reading each other's data
  (IDOR, OWASP API #1).
- **Threat-model the API** (lightweight STRIDE pass): injection via
  unvalidated fields, oversized payloads (body size limits), replayed tokens,
  enumeration via error-message differences, over-permissive CORS.
- **Secrets hygiene:** why nothing sensitive goes in Lambda env vars in
  plaintext; SSM Parameter Store vs Secrets Manager (cost/rotation trade-off).
- **DevSecOps:** `cdk-nag` (automated policy checks on your synthesized
  stack — like a linter for security posture) wired into the build. This is
  "define and implement scalable security frameworks" made concrete.

### Understanding checkpoint

You can trace an authenticated request end-to-end naming every check it passes,
explain what a stolen JWT does and doesn't allow, and read an IAM policy and
spot the over-permission.

---

## Quest 4 — The Watchtower: observability

**Goal:** operate what you built. "CloudWatch and Grafana … platform health at
scale" per the spec.

### Concepts

- **Three pillars in AWS terms:** logs (CloudWatch Logs), metrics (CloudWatch
  Metrics), traces (X-Ray — intro only).
- **Structured logging.** JSON logs with request ID, user ID (hashed — logs
  are a data-sensitivity surface too!), latency. Then **CloudWatch Logs
  Insights** to query them — this is the analyst-facing skill.
- **EMF (Embedded Metric Format):** emit custom metrics (e.g.
  `SignalsIngested`) from log lines with zero API calls — the modern pattern,
  via `aws-embedded-metrics` or Lambda Powertools.
- **Lambda Powertools (TypeScript)** — logger/metrics/tracer as decorators;
  the idiomatic serverless observability toolkit, and a nice demo of the
  hexagonal payoff (observability as a cross-cutting adapter concern).
- **Alarms & SLOs:** alarm on the *burn rate* signals that matter (API 5xx
  rate, p99 latency, Lambda throttles, DynamoDB throttles) not on vanity
  metrics. Composite alarms. We'll deliberately break the app and watch the
  alarm fire.
- **Dashboards as code** — the CloudWatch dashboard defined in CDK like
  everything else. (Grafana: we'll note how Amazon Managed Grafana would sit on
  top; not worth its cost for this project, but you'll be able to speak to it.)

### Understanding checkpoint

Given "the API feels slow," you can go from dashboard → Logs Insights query →
specific slow request → cause, and you can explain what your alarm thresholds
are protecting.

---

## Quest 4.5 — The Telescope: wide-event observability on a columnar store

**Goal:** practice Honeycomb-style "observability 2.0" with AWS-native parts —
and get hands-on with Athena and ingestion pipelines, both named in the spec.

### Concepts

- **Wide events, the philosophy.** Instead of scattered log lines and
  pre-aggregated metrics, emit **one arbitrarily-wide structured event per
  request**: request ID, user ID, route, status, latency, cold start, retry
  count, media type, signal count — every fact you know. Metrics answer
  questions you predicted; wide events answer questions you *didn't* — you
  slice by any field after the fact. High cardinality (e.g. `user_id`) stops
  being a problem and becomes the point.
- **Why AWS has no Honeycomb.** Honeycomb is a purpose-built columnar event
  store with sub-second interactive queries. AWS's closest *architectural*
  equivalent is assembled: columnar format + serverless scan engine.
- **Stage 1 — CloudWatch Logs Insights (zero setup).** Log the wide event as
  one JSON object; Insights auto-discovers fields; `filter` / `stats` /
  `parse` across arbitrary dimensions. Not columnar underneath, but the
  instrumentation habit is identical. Start here.
- **Stage 2 — the columnar pipeline.** Lambda → **Kinesis Data Firehose**
  (buffers, and converts JSON → **Parquet** on the fly, using a Glue schema)
  → **S3**, partitioned by date (`dt=2026-07-18/`) → **Athena** SQL.
  - **Parquet** is a columnar file format: a query touching 3 of 40 columns
    reads only those column chunks. This is the same storage idea Honeycomb,
    Redshift, and ClickHouse share.
  - **Glue Data Catalog:** the table definition (schema-on-read) that Athena
    and Firehose both reference.
  - **Partitioning:** why `dt=` prefixes cut scan cost/latency, and partition
    projection to avoid `MSCK REPAIR` chores.
  - **Athena mechanics:** $5/TB *scanned* — columnar + partitioned means
    kilobytes per query at our volume; effectively free.
- **The trade-off vs Honeycomb:** Firehose buffering (~60s) + Athena seconds-
  latency = "interactive-ish", not real-time heatmaps. Discussing exactly this
  trade-off (and when Logs Insights is enough) is interview gold.
- **Sensitive-data thread continues:** wide events are a data surface — hash
  or tokenise user identifiers before they leave the Lambda.

### Understanding checkpoint

You can explain why columnar + partitioned storage makes high-cardinality
slicing cheap, walk the Firehose→Parquet→Athena flow, and — the real test —
answer a debugging question with an Athena query you didn't plan for when you
instrumented.

## Quest 5 — The Assembly Line: CI/CD

**Goal:** trust the robot. GitHub Actions is named in the spec.

### Concepts

- **Pipeline shape:** PR → lint + unit tests + `cdk synth` + `cdk-nag` (the
  security gate) → merge → deploy. Tests *gate* the deploy; a red build cannot
  ship.
- **GitHub Actions ↔ AWS via OIDC** — the flagship lesson: the workflow
  assumes an IAM role via OpenID Connect federation. **No long-lived AWS keys
  in GitHub secrets, ever.** Configuring the trust policy (repo/branch
  conditions) is a real-world IAM exercise that interviews love.
- **CDK in CI:** `cdk diff` on PRs (review infra changes like code changes),
  `cdk deploy --require-approval never` on main, least-privilege deploy role.
- **Environments** (concept): how dev/staging/prod would work as separate
  stacks/accounts; why the BBC-scale answer is multi-account. We'll single-
  account it but structure stacks so the story is tellable.
- **GitOps** (concept, from the spec): main branch as the declared desired
  state; the pipeline converges reality to it.

### Understanding checkpoint

You can explain the OIDC handshake step by step and why it beats stored keys,
and your repo demonstrably refuses to deploy failing code.

---

## Quest 6 — The Algorithm: your personal For You page (bonus)

**Goal:** close the personalisation loop and touch the data-platform side.
The Vault learns which of your own shitposts you keep coming back to and
builds you a feed.

### Concepts

- **Taste profile as an aggregation:** fold a user's signals into weighted
  preferences (recency-decayed scores per tag/reaction) — a pure domain
  function, a gift for TDD. The gallery grows a "For You" tab that renders
  the ranked feed — the visual payoff of the whole pipeline.
- **Where aggregation runs:** on-read (compute per request — fine at our
  scale) vs on-write (**DynamoDB Streams** → aggregate Lambda — the
  event-driven pattern; we'll implement this variant if appetite allows, as
  it's the spec's "ingestion pipelines" in miniature).
- **Batch analytics bridge:** how signals would flow S3 → Athena/Redshift for
  the analyst community — the data-lake half of the role spec. Quest 4.5
  builds the real pipeline for *observability* events; here we design how the
  same pattern would serve *business* data (and where Redshift would enter).

---

## Cross-cutting threads (every quest)

- **TDD throughout:** domain via in-memory fakes (fast, no AWS), adapters via
  focused integration tests, infrastructure via CDK assertion tests. Red →
  green → refactor; the hexagonal refactor in Quest 2 is the pattern's biggest
  showcase.
- **Cost awareness:** everything chosen is pay-per-use; at learning volume the
  bill rounds to £0 (Cognito/KMS CMK ~ $1/mo is the only fixed cost, added in
  Quest 3). `cdk destroy` tears down everything. We'll check billing once as a
  learning exercise.
- **Region:** `eu-west-2` (London) — data residency instincts befitting the BBC.
- **The interview thread:** each quest's "understanding checkpoint" is a boss-
  fight question. If you can't explain it, we haven't finished the quest.

## Sequencing note

Quests 0–2 are the critical path and unlock everything. 1.5 (the gallery)
lands early on purpose — it makes every later quest visible. 3 and 4 can
swap. 4.5 needs 4's wide-event instrumentation first. 5 can happen any time
after 2 (earlier = more compounding value). 6 is dessert.

---

*Next step when you're ready: Quest 0, Session 1 — scaffold, bootstrap, deploy,
`curl`, first Ship Log entry.*
