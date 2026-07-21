CREATE TABLE IF NOT EXISTS sales_tenants (
  id uuid PRIMARY KEY,
  slug text NOT NULL UNIQUE,
  name text NOT NULL,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS sales_identities (
  id uuid PRIMARY KEY,
  tenant_id uuid NOT NULL REFERENCES sales_tenants(id),
  email text NOT NULL,
  password_hash text NOT NULL,
  display_name text NOT NULL,
  role text NOT NULL CHECK (role IN ('operator','reviewer','manager','auditor')),
  active boolean NOT NULL DEFAULT true,
  token_version integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id,email)
);

CREATE TABLE IF NOT EXISTS sales_connectors (
  id uuid PRIMARY KEY,
  tenant_id uuid NOT NULL REFERENCES sales_tenants(id),
  kind text NOT NULL CHECK (kind IN ('crm','email','calendar','enrichment','consent','suppression')),
  provider text NOT NULL,
  endpoint text NOT NULL,
  credential_reference text NOT NULL,
  source_contract_reference text NOT NULL,
  enabled boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id,kind,provider)
);

CREATE TABLE IF NOT EXISTS sales_accounts (
  id uuid PRIMARY KEY,
  tenant_id uuid NOT NULL REFERENCES sales_tenants(id),
  external_crm_id text NOT NULL,
  display_name text NOT NULL,
  lifecycle_state text NOT NULL DEFAULT 'prospect' CHECK (lifecycle_state IN ('prospect','active','churned')),
  owner_id uuid REFERENCES sales_identities(id),
  attribution jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id,external_crm_id)
);

CREATE TABLE IF NOT EXISTS sales_leads (
  id uuid PRIMARY KEY,
  tenant_id uuid NOT NULL REFERENCES sales_tenants(id),
  external_crm_id text NOT NULL,
  display_name text NOT NULL,
  contact_reference text NOT NULL,
  region text NOT NULL CHECK (region IN ('US','CA','EU','UK')),
  lifecycle_state text NOT NULL DEFAULT 'new' CHECK (lifecycle_state IN ('new','qualified','outreach_pending','outreach_approved','contacted','converted','disqualified','handed_off','exception')),
  owner_id uuid REFERENCES sales_identities(id),
  source_system text NOT NULL,
  source_revision text NOT NULL,
  source_observed_at timestamptz NOT NULL,
  attribution jsonb NOT NULL DEFAULT '{}'::jsonb,
  quality_flags jsonb NOT NULL DEFAULT '[]'::jsonb,
  account_id uuid REFERENCES sales_accounts(id),
  version integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id,external_crm_id)
);

CREATE TABLE IF NOT EXISTS sales_sync_events (
  id uuid PRIMARY KEY,
  tenant_id uuid NOT NULL REFERENCES sales_tenants(id),
  connector_kind text NOT NULL CHECK (connector_kind IN ('crm','email','calendar','enrichment','consent','suppression')),
  direction text NOT NULL CHECK (direction IN ('inbound','outbound')),
  source_event_id text NOT NULL,
  payload_sha256 char(64) NOT NULL CHECK (payload_sha256 ~ '^[0-9a-f]{64}$'),
  payload jsonb NOT NULL,
  source_observed_at timestamptz NOT NULL,
  state text NOT NULL DEFAULT 'applied' CHECK (state IN ('applied','queued','processing','retry','succeeded','dead_letter','conflict','stale')),
  attempts integer NOT NULL DEFAULT 0,
  last_error text,
  received_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id,connector_kind,direction,source_event_id)
);

CREATE TABLE IF NOT EXISTS sales_consent_events (
  id uuid PRIMARY KEY,
  tenant_id uuid NOT NULL REFERENCES sales_tenants(id),
  lead_id uuid NOT NULL REFERENCES sales_leads(id),
  channel text NOT NULL CHECK (channel IN ('email','sms','phone')),
  purpose text NOT NULL,
  state text NOT NULL CHECK (state IN ('granted','withdrawn')),
  lawful_basis text NOT NULL,
  source_system text NOT NULL,
  source_event_id text NOT NULL,
  source_observed_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id,source_system,source_event_id)
);

CREATE TABLE IF NOT EXISTS sales_suppressions (
  id uuid PRIMARY KEY,
  tenant_id uuid NOT NULL REFERENCES sales_tenants(id),
  lead_id uuid NOT NULL REFERENCES sales_leads(id),
  channel text NOT NULL CHECK (channel IN ('email','sms','phone','all')),
  reason text NOT NULL,
  source_system text NOT NULL,
  source_event_id text NOT NULL,
  active boolean NOT NULL DEFAULT true,
  source_observed_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id,source_system,source_event_id)
);

CREATE TABLE IF NOT EXISTS sales_outreach (
  id uuid PRIMARY KEY,
  tenant_id uuid NOT NULL REFERENCES sales_tenants(id),
  lead_id uuid NOT NULL REFERENCES sales_leads(id),
  channel text NOT NULL CHECK (channel IN ('email','sms','phone')),
  template_id text NOT NULL,
  campaign_id text NOT NULL,
  idempotency_key text NOT NULL,
  state text NOT NULL CHECK (state IN ('review_required','approved','queued','sent','suppressed','failed','cancelled')),
  submitted_by uuid NOT NULL REFERENCES sales_identities(id),
  reviewed_by uuid REFERENCES sales_identities(id),
  review_notes text,
  scheduled_at timestamptz NOT NULL,
  sent_at timestamptz,
  provider_message_id text,
  failure_code text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id,idempotency_key)
);

CREATE TABLE IF NOT EXISTS sales_outbox (
  id uuid PRIMARY KEY,
  tenant_id uuid NOT NULL REFERENCES sales_tenants(id),
  aggregate_type text NOT NULL,
  aggregate_id uuid NOT NULL,
  connector_kind text NOT NULL CHECK (connector_kind IN ('crm','email','calendar','enrichment')),
  event_type text NOT NULL,
  idempotency_key text NOT NULL,
  payload jsonb NOT NULL,
  state text NOT NULL DEFAULT 'queued' CHECK (state IN ('queued','processing','retry','succeeded','dead_letter')),
  attempts integer NOT NULL DEFAULT 0,
  next_attempt_at timestamptz NOT NULL DEFAULT now(),
  lease_owner text,
  lease_expires_at timestamptz,
  last_error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id,connector_kind,idempotency_key)
);

CREATE TABLE IF NOT EXISTS sales_provider_events (
  id uuid PRIMARY KEY,
  tenant_id uuid NOT NULL REFERENCES sales_tenants(id),
  provider text NOT NULL,
  provider_event_id text NOT NULL,
  event_type text NOT NULL,
  payload jsonb NOT NULL,
  payload_sha256 char(64) NOT NULL,
  handled_at timestamptz,
  received_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id,provider,provider_event_id)
);

CREATE TABLE IF NOT EXISTS sales_handoffs (
  id uuid PRIMARY KEY,
  tenant_id uuid NOT NULL REFERENCES sales_tenants(id),
  lead_id uuid NOT NULL REFERENCES sales_leads(id),
  from_owner_id uuid REFERENCES sales_identities(id),
  to_owner_id uuid NOT NULL REFERENCES sales_identities(id),
  reason text NOT NULL,
  status text NOT NULL CHECK (status IN ('accepted','rejected')),
  created_by uuid NOT NULL REFERENCES sales_identities(id),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS sales_calendar_engagements (
  id uuid PRIMARY KEY,
  tenant_id uuid NOT NULL REFERENCES sales_tenants(id),
  lead_id uuid NOT NULL REFERENCES sales_leads(id),
  external_event_id text NOT NULL,
  state text NOT NULL CHECK (state IN ('booked','cancelled','completed','no_show')),
  starts_at timestamptz NOT NULL,
  source_system text NOT NULL,
  source_observed_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id,source_system,external_event_id)
);

CREATE TABLE IF NOT EXISTS sales_audit_events (
  id uuid PRIMARY KEY,
  tenant_id uuid NOT NULL REFERENCES sales_tenants(id),
  sequence bigint NOT NULL,
  actor_id uuid REFERENCES sales_identities(id),
  lead_id uuid REFERENCES sales_leads(id),
  action text NOT NULL,
  details jsonb NOT NULL,
  previous_hash char(64) NOT NULL,
  event_hash char(64) NOT NULL,
  created_at timestamptz NOT NULL,
  UNIQUE (tenant_id,sequence),
  UNIQUE (tenant_id,event_hash)
);

CREATE OR REPLACE FUNCTION sales_reject_audit_mutation() RETURNS trigger AS $$
BEGIN RAISE EXCEPTION 'sales audit is append-only'; END;
$$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS sales_audit_immutable ON sales_audit_events;
CREATE TRIGGER sales_audit_immutable BEFORE UPDATE OR DELETE ON sales_audit_events
FOR EACH ROW EXECUTE FUNCTION sales_reject_audit_mutation();

CREATE INDEX IF NOT EXISTS sales_leads_tenant_state_idx ON sales_leads(tenant_id,lifecycle_state,updated_at DESC);
CREATE INDEX IF NOT EXISTS sales_outbox_due_idx ON sales_outbox(state,next_attempt_at);
CREATE INDEX IF NOT EXISTS sales_outreach_lead_idx ON sales_outreach(tenant_id,lead_id,created_at DESC);
CREATE INDEX IF NOT EXISTS sales_audit_sequence_idx ON sales_audit_events(tenant_id,sequence);
