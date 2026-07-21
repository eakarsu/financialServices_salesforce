const pool = require('../db');
const { loadConfig } = require('../config');

function secretName(reference) {
  return `CONNECTOR_SECRET_${reference.replace(/[^a-zA-Z0-9]/g, '_').toUpperCase()}`;
}

async function loadConnector(tenantId, kind) {
  const result = await pool.query(`SELECT * FROM sales_connectors
    WHERE tenant_id=$1 AND kind=$2 AND enabled ORDER BY created_at LIMIT 1`, [tenantId, kind]);
  if (!result.rowCount) throw Object.assign(new Error(`No enabled ${kind} connector`), { retryable: false });
  return result.rows[0];
}

async function deliver({ tenantId, kind, eventType, payload, idempotencyKey }) {
  const connector = await loadConnector(tenantId, kind);
  const endpoint = new URL(connector.endpoint);
  if (loadConfig().production && endpoint.protocol !== 'https:') {
    throw Object.assign(new Error('Production connectors require HTTPS'), { retryable: false });
  }
  if (!['http:', 'https:'].includes(endpoint.protocol)) {
    throw Object.assign(new Error('Unsupported connector protocol'), { retryable: false });
  }
  const credential = process.env[secretName(connector.credential_reference)];
  if (!credential) throw Object.assign(new Error('Connector credential is unavailable'), { retryable: false });
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8_000);
  try {
    const response = await fetch(endpoint, {
      method: 'POST', signal: controller.signal,
      headers: {
        authorization: `Bearer ${credential}`,
        'content-type': 'application/json',
        'idempotency-key': idempotencyKey,
        'x-sales-event': eventType,
      },
      body: JSON.stringify(payload),
    });
    if (!response.ok) {
      const error = new Error(`Connector returned HTTP ${response.status}`);
      error.retryable = response.status === 408 || response.status === 429 || response.status >= 500;
      throw error;
    }
    const body = await response.json().catch(() => ({}));
    return { provider: connector.provider, providerMessageId: body.messageId || body.id || null };
  } finally { clearTimeout(timer); }
}

module.exports = { deliver, loadConnector, secretName };
