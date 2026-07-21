# Completeness Review: financialServices_salesforce

**Review date:** 2026-07-18

## Assessment basis

Static inspection of project-owned source and configuration only; no dependency installation, build, database migration, external-service call, or runtime launch was performed. The scan considered 45 project files (35 source files), 2 manifest(s), 0 test-like file(s), and 0 CI workflow(s), excluding dependency/generated directories.

## Classification

**Prototype-demo**

This is a prototype/demo for sales/customer operations. Generated gap/demo patterns are present: it contains 35 source files and visible routes/pages in `frontend/`, `routes/`, `middleware/`, but those surfaces are not evidence of durable domain execution, verified integrations, or operational completion.

## Why it is not complete

- Generated gap/visualization routes describe missing capabilities or simulate recommendations; they do not implement the underlying domain operation.
- Generic LLM calls are used as product behavior without enough typed tools, grounded evidence, deterministic rules, or output evaluation.
- Mock, demo, sample, fixture, or placeholder behavior remains in executable/product paths.
- No recognizable project-owned automated tests were found for the main workflow.
- No checked-in CI workflow proves builds, tests, migrations, and security checks on every change.

## Needed features

1. Integrate CRM, email/calendar, enrichment, consent, and suppression sources with bidirectional, deduplicated sync.
2. Implement explicit lead/account lifecycle, ownership, approvals, attribution, and handoff/retry states.
3. Add deliverability, opt-out, regional privacy, rate-limit, and human-review controls for automated outreach.
4. Measure conversion and data quality with representative end-to-end workflow tests rather than generated sample records.
5. Add risk-based unit, integration, and end-to-end tests in CI, including migration and failure-path coverage.

## Risks or launch blockers

- Credential/configuration exposure: environment files are present in the repository tree and must be checked against Git history and rotated if real.
- Weak/fallback secret patterns can permit forged sessions or accidental insecure deployments.
- AI-provider availability, cost, privacy, prompt injection, and unvalidated output are launch risks until bounded and evaluated.
- Regression risk is high because no recognizable project-owned automated tests cover the main path.

## Evidence inspected

- `middleware/auth.js:10`
- `frontend/src/App.jsx:21`
- `server.js`
- `middleware/auth.js`
- `package.json`
- `start.sh`

## Recommended next action

Stop adding generated pages; prove one sales/customer operations workflow against real services and persistent state, with tests and measurable acceptance criteria.

## Implementation progress (2026-07-19)

- Replaced the generated AI/demo surface with a persistent, tenant-isolated PostgreSQL sales domain covering identities and roles, CRM leads, accounts, attribution, data-quality flags, consent, suppression, calendar engagements, outreach, ownership handoff, connector references, provider events, a leased outbox, and a hash-chained append-only audit trail.
- Added checksummed, advisory-locked transactional migrations, replay-safe CRM/enrichment/calendar/consent/suppression ingestion, conflicting-event and stale-source rejection, bidirectional CRM/email/calendar/enrichment delivery evidence, idempotent provider callbacks, partial failure retry with exponential backoff, five-attempt dead lettering, and worker leases using `FOR UPDATE SKIP LOCKED`.
- Added explicit lead/account lifecycle transitions, tenant ownership checks, manager-controlled identity provisioning and revocation, token-version invalidation, account creation on conversion, durable campaign attribution, controlled handoff, and conversion/data-quality dashboards based on stored records.
- Added affirmative channel-consent and suppression enforcement, immediate cancellation on withdrawal/opt-out, EU/UK lawful-basis checks, conservative quiet hours, per-lead and tenant rate limits, mandatory human review, separation of submitter and reviewer, timestamped HMAC callbacks, short scoped JWT sessions, exact CORS origins, runtime-only connector secrets, and fail-closed production configuration.
- Retired the generic LLM routes, fake operations pages, password-grant Salesforce code, public registration, and fallback production secret. Added a real operator UI, safe bootstrap/start/worker guidance, provider acceptance boundaries, and CI for clean installs, migration replay, database-backed tests, builds, dependency audits, and history secret scanning.
- Verified on a fresh disposable PostgreSQL cluster: the migration applied twice and all 22 automated workflow tests passed. Clean backend and frontend installs reported zero dependency vulnerabilities, the Vite 8 production build passed, `git diff --check` passed, and Gitleaks found no secrets in either repository history or the current tree.

## Runtime acceptance (2026-07-20)

The non-suite runtime validator passed on the fresh assigned PostgreSQL/API/UI ports `55647/6104/6105`: `start.sh` required and bound only the assigned loopback API port, the governed migration ran, the explicit bootstrap command provisioned a bcrypt-12 manager in the disposable tenant, login issued the short-lived tenant-scoped JWT, and `/api/auth/session` reloaded the active identity and token version from PostgreSQL. The smoke test recorded `API_VERIFIED — startup_login_session_api`. A separate disposable PostgreSQL run passed all 22 workflow tests, and the frontend production build, launcher/server/bootstrap syntax, package validation, and `git diff --check` passed. All acceptance and test ports were released.
- Remaining external launch gates are explicit rather than simulated: validate each configured source contract against real CRM/email/calendar/enrichment/consent/suppression sandboxes, inject provider credentials through deployment secret storage, establish deliverability/alerting objectives, and obtain privacy/legal approval for the intended jurisdictions.
