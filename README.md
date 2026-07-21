# Governed Sales Operations

This project is a tenant-isolated sales operations application. It replaces the earlier generated AI workbench with a deterministic workflow backed by PostgreSQL: CRM and enrichment intake, consent and suppression evidence, explicit lifecycle/ownership, independent outreach review, retryable provider delivery, signed callbacks, calendar activity, account conversion, and measurable data quality.

## Safe local start

Requirements: Node.js 22.12 or newer and PostgreSQL 15 or newer. Never place production credentials in the repository.

1. Create a database and copy `.env.example` to an ignored `.env`. Generate independent random values for `JWT_SECRET` and `OUTREACH_WEBHOOK_SECRET`.
2. Install with `npm ci` and `npm --prefix frontend ci`.
3. Apply migrations explicitly with `npm run migrate`. Run it twice in deployment rehearsal to prove replay safety.
4. Provision the first manager without putting a password in shell history:

   ```sh
   read -s BOOTSTRAP_MANAGER_PASSWORD
   export BOOTSTRAP_MANAGER_PASSWORD
   BOOTSTRAP_TENANT_SLUG=acme \
   BOOTSTRAP_TENANT_NAME='Acme Advisors' \
   BOOTSTRAP_MANAGER_EMAIL=manager@example.com \
   npm run bootstrap
   unset BOOTSTRAP_MANAGER_PASSWORD
   ```

5. Start the API with `npm start`, the durable delivery worker with `npm run worker`, and the UI with `npm --prefix frontend run dev`.

The API does not migrate on startup. `/api/health` returns 503 until the checked migration is present. Production configuration fails closed unless it has `DATABASE_URL`, 32+ character secrets, and exact HTTPS origins.

## Integrations and controls

Managers configure connectors through `PUT /api/sales/connectors`. A connector record contains an HTTPS endpoint, a non-secret credential reference, and a source-contract reference. The actual credential must be injected as `CONNECTOR_SECRET_<NORMALIZED_REFERENCE>`. Delivery uses an idempotency key, an 8-second timeout, exponential retry, five-attempt dead lettering, and a leased `SKIP LOCKED` worker claim.

Inbound CRM, enrichment, calendar, consent, suppression, and provider events require stable event IDs. Exact replays are accepted without a second side effect; conflicting or stale replays are rejected. Email/provider callbacks require a timestamp and HMAC over `<timestamp>.<raw JSON>` and reject callbacks older than five minutes.

Outreach requires current affirmative channel consent, no suppression, a conservative 08:00–20:00 UTC window, one lead/channel attempt per 24 hours, a tenant daily cap, and approval by someone other than the submitter. EU and UK records require `consent` as the lawful basis. Consent withdrawal or provider opt-out cancels queued work.

Public registration and legacy AI endpoints are disabled. Managers provision and deactivate tenant identities; deactivation increments token version and invalidates outstanding sessions. Access tokens expire after 15 minutes. The audit chain is append-only and hash-verifiable.

## Verification

`npm test` executes the real migration and end-to-end HTTP/domain workflow against PostgreSQL. It covers tenant isolation, replay conflicts, stale events, lifecycle enforcement, consent, regional privacy, human review, retry/resume, signed callbacks, opt-out, handoff, enrichment, calendar sync, connector references, account conversion, identity revocation, metrics, and audit immutability.

Run `npm audit`, `npm --prefix frontend audit`, and `npm --prefix frontend run build` before release. External acceptance still requires real provider sandbox credentials, contract validation, deliverability monitoring, and jurisdiction-specific legal approval.
