const crypto = require('node:crypto');

function canonicalJson(value) {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (value && typeof value === 'object') return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(',')}}`;
  return JSON.stringify(value);
}

async function appendAudit(client, { tenantId, actorId, leadId = null, action, details }) {
  await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', [tenantId]);
  const prior = await client.query('SELECT sequence,event_hash FROM sales_audit_events WHERE tenant_id=$1 ORDER BY sequence DESC LIMIT 1', [tenantId]);
  const sequence = prior.rowCount ? Number(prior.rows[0].sequence) + 1 : 1;
  const previousHash = prior.rowCount ? prior.rows[0].event_hash : '0'.repeat(64);
  const createdAt = new Date().toISOString();
  const normalized = canonicalJson(details);
  const eventHash = crypto.createHash('sha256').update([previousHash,tenantId,sequence,actorId || '',leadId || '',action,normalized,createdAt].join('|')).digest('hex');
  await client.query(`INSERT INTO sales_audit_events(id,tenant_id,sequence,actor_id,lead_id,action,details,previous_hash,event_hash,created_at)
    VALUES($1,$2,$3,$4,$5,$6,$7::jsonb,$8,$9,$10)`, [crypto.randomUUID(),tenantId,sequence,actorId,leadId,action,normalized,previousHash,eventHash,createdAt]);
}

async function verifyAudit(client, tenantId) {
  const events = (await client.query('SELECT * FROM sales_audit_events WHERE tenant_id=$1 ORDER BY sequence', [tenantId])).rows;
  let previousHash = '0'.repeat(64);
  for (const event of events) {
    const expected = crypto.createHash('sha256').update([previousHash,tenantId,Number(event.sequence),event.actor_id || '',event.lead_id || '',event.action,canonicalJson(event.details),new Date(event.created_at).toISOString()].join('|')).digest('hex');
    if (event.previous_hash !== previousHash || event.event_hash !== expected) return false;
    previousHash = event.event_hash;
  }
  return true;
}

module.exports = { appendAudit, canonicalJson, verifyAudit };
