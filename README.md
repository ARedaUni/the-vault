# 🛰️ The Vault

A personal audience-personalisation engine, inspired by the BBC's Core Data
Platform — the team that ingests behavioural signals from iPlayer and turns
them into recommendations on a mountain of AWS.

Mine ingests shitposts.

The engine is generic — signals in, taste profiles out — but the dataset is
my own meme archive. Every view and reaction becomes a signal, and the end
goal is **The Algorithm**: a recommender that learns my taste in my own
shitposts and serves me a private For You page of my own archive. The BBC's
architecture, the internet's worst content.

## Status

```
$ curl <function-url>
{"service":"signal","status":"online","quest":0}
```

Quest 0 complete: CDK deploy loop proven end-to-end (test-first, including
CDK assertion tests on the infrastructure). Currently a single Lambda behind
a public function URL; everything below gets built quest by quest.

## The build

This is structured as a quest log — see [PROGRESS.md](PROGRESS.md) for the
game and [docs/TECHNICAL_ROADMAP.md](docs/TECHNICAL_ROADMAP.md) for the full
syllabus. The short version:

| Quest | Ships | Tech |
|-------|-------|------|
| 0 | Deploy loop | CDK (TypeScript), Lambda, Function URLs |
| 1 | The catalogue | S3, DynamoDB single-table design |
| 1.5 | The gallery | CloudFront, Origin Access Control, CORS |
| 2 | Real API + hexagonal refactor | API Gateway REST, Zod, ports & adapters |
| 3 | Security hardening | IAM least-privilege, KMS CMK, Cognito, cdk-nag |
| 4 | Observability | CloudWatch, EMF metrics, Lambda Powertools, alarms |
| 4.5 | Wide events | Firehose → Parquet → S3 → Glue → Athena |
| 5 | CI/CD | GitHub Actions, OIDC federation (no stored AWS keys) |
| 6 | The Algorithm | DynamoDB Streams, recency-decayed taste profiles |

Built strictly TDD: no production code without a failing test first, and the
infrastructure is tested too (`aws-cdk-lib/assertions`).

## Running it

```sh
npm install
npx jest                 # domain + infrastructure tests
npx cdk synth            # compile TypeScript → CloudFormation
npx cdk diff             # preview changes against the deployed stack
npx cdk deploy           # ship it (bring your own AWS account)
```

## Battle scars

- **Since October 2025, public Lambda function URLs need two permissions** —
  `lambda:InvokeFunctionUrl` *and* `lambda:InvokeFunction` (condition
  `InvokedViaFunctionUrl: true`). A policy that was correct for years now
  403s on new accounts, and most tutorials haven't caught up. Diagnosed
  layer-by-layer in Quest 0; fixed test-first via aws-cdk-lib ≥ 2.216.

More in the [Ship Log](PROGRESS.md#-ship-log).
