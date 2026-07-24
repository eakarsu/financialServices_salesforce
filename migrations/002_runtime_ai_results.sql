CREATE TABLE IF NOT EXISTS sales_ai_results (
  id UUID PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES sales_tenants(id),
  identity_id UUID NOT NULL REFERENCES sales_identities(id),
  prompt TEXT NOT NULL,
  content TEXT NOT NULL CHECK (length(content) > 0),
  provider TEXT NOT NULL CHECK (provider = 'openrouter'),
  model TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS sales_ai_results_tenant_created_idx
  ON sales_ai_results(tenant_id, created_at DESC);
