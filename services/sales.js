const crypto = require('node:crypto');
const bcrypt = require('bcryptjs');
const { z } = require('zod');
const pool = require('../db');
const { transaction } = require('../db');
const { appendAudit, canonicalJson, verifyAudit } = require('./audit');
const connectors = require('./connectors');

class DomainError extends Error {
  constructor(status, message, code = 'invalid_request') { super(message); this.statusCode = status; this.code = code; }
}

const leadSchema = z.object({
  eventId: z.string().min(1).max(160), externalCrmId: z.string().min(1).max(160),
  displayName: z.string().min(1).max(200), contactReference: z.string().min(1).max(300),
  region: z.enum(['US','CA','EU','UK']), sourceSystem: z.string().min(1).max(80),
  sourceRevision: z.string().min(1).max(120), sourceObservedAt: z.coerce.date(),
  ownerId: z.string().uuid().nullable().optional(), attribution: z.record(z.string(), z.unknown()).default({}),
});
const consentSchema = z.object({
  leadId: z.string().uuid(), channel: z.enum(['email','sms','phone']), purpose: z.string().min(1).max(120),
  state: z.enum(['granted','withdrawn']), lawfulBasis: z.string().min(1).max(120), sourceSystem: z.string().min(1).max(80),
  eventId: z.string().min(1).max(160), sourceObservedAt: z.coerce.date(),
});
const suppressionSchema = z.object({
  leadId: z.string().uuid(), channel: z.enum(['email','sms','phone','all']), reason: z.string().min(1).max(240),
  sourceSystem: z.string().min(1).max(80), eventId: z.string().min(1).max(160), sourceObservedAt: z.coerce.date(),
});

function parse(schema, value) {
  const result = schema.safeParse(value);
  if (!result.success) throw new DomainError(400, result.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`).join('; '), 'validation_failed');
  return result.data;
}
function digest(value) { return crypto.createHash('sha256').update(canonicalJson(value)).digest('hex'); }
function uuid() { return crypto.randomUUID(); }
function own(identity, lead) {
  if (identity.role !== 'manager' && lead.owner_id && lead.owner_id !== identity.id) throw new DomainError(403, 'Only the owner or a manager may change this lead', 'ownership_required');
}
async function identityInTenant(client, tenantId, identityId) {
  const found = await client.query('SELECT id FROM sales_identities WHERE id=$1 AND tenant_id=$2 AND active', [identityId, tenantId]);
  if (!found.rowCount) throw new DomainError(400, 'Owner is not an active identity in this tenant', 'invalid_owner');
}
async function leadForUpdate(client, tenantId, leadId) {
  const found = await client.query('SELECT * FROM sales_leads WHERE id=$1 AND tenant_id=$2 FOR UPDATE', [leadId, tenantId]);
  if (!found.rowCount) throw new DomainError(404, 'Lead not found', 'not_found');
  return found.rows[0];
}
async function recordSync(client, { tenantId, kind, direction, eventId, payload, observedAt, state = 'applied' }) {
  const sha = digest(payload);
  const prior = await client.query(`SELECT payload_sha256,state FROM sales_sync_events
    WHERE tenant_id=$1 AND connector_kind=$2 AND direction=$3 AND source_event_id=$4`, [tenantId,kind,direction,eventId]);
  if (prior.rowCount) {
    if (prior.rows[0].payload_sha256 !== sha) {
      await client.query(`UPDATE sales_sync_events SET state='conflict',last_error='same event id with different payload' WHERE tenant_id=$1 AND connector_kind=$2 AND direction=$3 AND source_event_id=$4`, [tenantId,kind,direction,eventId]);
      throw new DomainError(409, 'Event identifier was already used with a different payload', 'sync_conflict');
    }
    return false;
  }
  await client.query(`INSERT INTO sales_sync_events(id,tenant_id,connector_kind,direction,source_event_id,payload_sha256,payload,source_observed_at,state)
    VALUES($1,$2,$3,$4,$5,$6,$7::jsonb,$8,$9)`, [uuid(),tenantId,kind,direction,eventId,sha,JSON.stringify(payload),observedAt,state]);
  return true;
}
async function queue(client, tenantId, aggregateType, aggregateId, kind, eventType, key, payload) {
  await client.query(`INSERT INTO sales_outbox(id,tenant_id,aggregate_type,aggregate_id,connector_kind,event_type,idempotency_key,payload)
    VALUES($1,$2,$3,$4,$5,$6,$7,$8::jsonb) ON CONFLICT (tenant_id,connector_kind,idempotency_key) DO NOTHING`,
  [uuid(),tenantId,aggregateType,aggregateId,kind,eventType,key,JSON.stringify(payload)]);
  await recordSync(client, { tenantId,kind,direction:'outbound',eventId:key,payload,observedAt:new Date(),state:'queued' });
}

async function ingestLead(identity, input) {
  const data = parse(leadSchema, input);
  return transaction(async (client) => {
    const inserted = await recordSync(client, { tenantId:identity.tenant_id,kind:'crm',direction:'inbound',eventId:data.eventId,payload:input,observedAt:data.sourceObservedAt });
    if (!inserted) return { replay: true };
    if (data.ownerId) await identityInTenant(client, identity.tenant_id, data.ownerId);
    const current = await client.query('SELECT * FROM sales_leads WHERE tenant_id=$1 AND external_crm_id=$2 FOR UPDATE', [identity.tenant_id,data.externalCrmId]);
    if (current.rowCount && new Date(current.rows[0].source_observed_at) >= data.sourceObservedAt) {
      await client.query(`UPDATE sales_sync_events SET state='stale',last_error='source timestamp did not advance' WHERE tenant_id=$1 AND source_event_id=$2`, [identity.tenant_id,data.eventId]);
      throw new DomainError(409, 'Stale CRM update rejected', 'stale_sync');
    }
    const quality = [];
    if (!Object.keys(data.attribution).length) quality.push('missing_attribution');
    const result = await client.query(`INSERT INTO sales_leads(id,tenant_id,external_crm_id,display_name,contact_reference,region,owner_id,source_system,source_revision,source_observed_at,attribution,quality_flags)
      VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11::jsonb,$12::jsonb)
      ON CONFLICT (tenant_id,external_crm_id) DO UPDATE SET display_name=EXCLUDED.display_name,contact_reference=EXCLUDED.contact_reference,region=EXCLUDED.region,
      owner_id=COALESCE(EXCLUDED.owner_id,sales_leads.owner_id),source_system=EXCLUDED.source_system,source_revision=EXCLUDED.source_revision,
      source_observed_at=EXCLUDED.source_observed_at,attribution=EXCLUDED.attribution,quality_flags=EXCLUDED.quality_flags,version=sales_leads.version+1,updated_at=now()
      RETURNING *`, [uuid(),identity.tenant_id,data.externalCrmId,data.displayName,data.contactReference,data.region,data.ownerId || identity.id,data.sourceSystem,data.sourceRevision,data.sourceObservedAt,JSON.stringify(data.attribution),JSON.stringify(quality)]);
    await appendAudit(client, { tenantId:identity.tenant_id,actorId:identity.id,leadId:result.rows[0].id,action:current.rowCount?'lead.synced':'lead.created',details:{ eventId:data.eventId, sourceSystem:data.sourceSystem, sourceRevision:data.sourceRevision, quality } });
    if (!current.rowCount) await queue(client,identity.tenant_id,'lead',result.rows[0].id,'enrichment','lead.enrichment.requested',`enrich:${result.rows[0].id}:${data.sourceRevision}`,{leadId:result.rows[0].id,externalCrmId:data.externalCrmId,contactReference:data.contactReference,region:data.region,sourceContract:data.sourceSystem});
    return { replay:false, lead:result.rows[0] };
  });
}

async function recordConsent(identity, input) {
  const data = parse(consentSchema, input);
  return transaction(async (client) => {
    const lead = await leadForUpdate(client, identity.tenant_id, data.leadId); own(identity, lead);
    const inserted = await recordSync(client,{tenantId:identity.tenant_id,kind:'consent',direction:'inbound',eventId:data.eventId,payload:input,observedAt:data.sourceObservedAt});
    if (!inserted) return { replay:true };
    const latest = await client.query(`SELECT source_observed_at FROM sales_consent_events WHERE tenant_id=$1 AND lead_id=$2 AND channel=$3 AND purpose=$4 ORDER BY source_observed_at DESC LIMIT 1`, [identity.tenant_id,data.leadId,data.channel,data.purpose]);
    if (latest.rowCount && new Date(latest.rows[0].source_observed_at) >= data.sourceObservedAt) throw new DomainError(409,'Stale consent event rejected','stale_sync');
    await client.query(`INSERT INTO sales_consent_events(id,tenant_id,lead_id,channel,purpose,state,lawful_basis,source_system,source_event_id,source_observed_at)
      VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`, [uuid(),identity.tenant_id,data.leadId,data.channel,data.purpose,data.state,data.lawfulBasis,data.sourceSystem,data.eventId,data.sourceObservedAt]);
    if (data.state === 'withdrawn') {
      await client.query(`INSERT INTO sales_suppressions(id,tenant_id,lead_id,channel,reason,source_system,source_event_id,source_observed_at)
        VALUES($1,$2,$3,$4,'consent withdrawn',$5,$6,$7) ON CONFLICT DO NOTHING`, [uuid(),identity.tenant_id,data.leadId,data.channel,data.sourceSystem,`${data.eventId}:suppression`,data.sourceObservedAt]);
      await client.query(`UPDATE sales_outreach SET state='cancelled',updated_at=now(),failure_code='consent_withdrawn' WHERE tenant_id=$1 AND lead_id=$2 AND channel=$3 AND state IN ('review_required','approved','queued')`, [identity.tenant_id,data.leadId,data.channel]);
    }
    await appendAudit(client,{tenantId:identity.tenant_id,actorId:identity.id,leadId:data.leadId,action:`consent.${data.state}`,details:{channel:data.channel,purpose:data.purpose,eventId:data.eventId}});
    return { replay:false, state:data.state };
  });
}

async function suppress(identity, input) {
  const data = parse(suppressionSchema,input);
  return transaction(async (client) => {
    const lead = await leadForUpdate(client,identity.tenant_id,data.leadId); own(identity,lead);
    const inserted = await recordSync(client,{tenantId:identity.tenant_id,kind:'suppression',direction:'inbound',eventId:data.eventId,payload:input,observedAt:data.sourceObservedAt});
    if (!inserted) return { replay:true };
    await client.query(`INSERT INTO sales_suppressions(id,tenant_id,lead_id,channel,reason,source_system,source_event_id,source_observed_at)
      VALUES($1,$2,$3,$4,$5,$6,$7,$8)`,[uuid(),identity.tenant_id,data.leadId,data.channel,data.reason,data.sourceSystem,data.eventId,data.sourceObservedAt]);
    await client.query(`UPDATE sales_outreach SET state='cancelled',failure_code='suppressed',updated_at=now() WHERE tenant_id=$1 AND lead_id=$2 AND state IN ('review_required','approved','queued') AND ($3='all' OR channel=$3)`,[identity.tenant_id,data.leadId,data.channel]);
    await appendAudit(client,{tenantId:identity.tenant_id,actorId:identity.id,leadId:data.leadId,action:'lead.suppressed',details:{channel:data.channel,reason:data.reason,eventId:data.eventId}});
    return { replay:false };
  });
}

const transitions = {
  new:['qualified','disqualified','exception'], qualified:['outreach_pending','disqualified','handed_off','exception'],
  outreach_pending:['outreach_approved','qualified','disqualified','exception'], outreach_approved:['contacted','qualified','exception'],
  contacted:['converted','disqualified','handed_off','exception'], handed_off:['qualified','contacted','exception'], exception:['qualified','disqualified'],
  converted:[], disqualified:[],
};
async function transitionLead(identity, leadId, nextState, reason) {
  if (!Object.hasOwn(transitions,nextState)) throw new DomainError(400,'Unknown lifecycle state');
  return transaction(async (client) => {
    const lead=await leadForUpdate(client,identity.tenant_id,leadId); own(identity,lead);
    if (!transitions[lead.lifecycle_state].includes(nextState)) throw new DomainError(409,`Cannot transition ${lead.lifecycle_state} to ${nextState}`,'invalid_transition');
    let accountId=lead.account_id;
    if (nextState==='converted') {
      const account=await client.query(`INSERT INTO sales_accounts(id,tenant_id,external_crm_id,display_name,lifecycle_state,owner_id,attribution)
        VALUES($1,$2,$3,$4,'active',$5,$6) ON CONFLICT (tenant_id,external_crm_id) DO UPDATE SET lifecycle_state='active',owner_id=EXCLUDED.owner_id,attribution=EXCLUDED.attribution,updated_at=now() RETURNING id`,
      [uuid(),identity.tenant_id,lead.external_crm_id,lead.display_name,lead.owner_id,lead.attribution]); accountId=account.rows[0].id;
      await queue(client,identity.tenant_id,'account',accountId,'calendar','account.onboarding.requested',`onboarding:${accountId}`,{accountId,leadId,ownerId:lead.owner_id,region:lead.region});
    }
    const updated=(await client.query(`UPDATE sales_leads SET lifecycle_state=$3,account_id=$4,version=version+1,updated_at=now() WHERE id=$1 AND tenant_id=$2 RETURNING *`,[leadId,identity.tenant_id,nextState,accountId])).rows[0];
    await queue(client,identity.tenant_id,'lead',leadId,'crm','lead.lifecycle.changed',`lifecycle:${leadId}:${updated.version}`,{leadId,externalCrmId:lead.external_crm_id,from:lead.lifecycle_state,to:nextState,reason,accountId});
    await appendAudit(client,{tenantId:identity.tenant_id,actorId:identity.id,leadId,action:'lead.transitioned',details:{from:lead.lifecycle_state,to:nextState,reason,accountId}});
    return updated;
  });
}

async function handoff(identity, leadId, input) {
  const data=parse(z.object({toOwnerId:z.string().uuid(),reason:z.string().min(3).max(500)}),input);
  return transaction(async(client)=>{
    const lead=await leadForUpdate(client,identity.tenant_id,leadId); own(identity,lead); await identityInTenant(client,identity.tenant_id,data.toOwnerId);
    if(data.toOwnerId===lead.owner_id) throw new DomainError(409,'Destination owner is already assigned');
    const handoffId=uuid();
    await client.query(`INSERT INTO sales_handoffs(id,tenant_id,lead_id,from_owner_id,to_owner_id,reason,status,created_by) VALUES($1,$2,$3,$4,$5,$6,'accepted',$7)`,[handoffId,identity.tenant_id,leadId,lead.owner_id,data.toOwnerId,data.reason,identity.id]);
    await client.query(`UPDATE sales_leads SET owner_id=$3,lifecycle_state='handed_off',version=version+1,updated_at=now() WHERE id=$1 AND tenant_id=$2`,[leadId,identity.tenant_id,data.toOwnerId]);
    await queue(client,identity.tenant_id,'lead',leadId,'crm','lead.handed_off',`handoff:${handoffId}`,{leadId,fromOwnerId:lead.owner_id,toOwnerId:data.toOwnerId,reason:data.reason});
    await appendAudit(client,{tenantId:identity.tenant_id,actorId:identity.id,leadId,action:'lead.handed_off',details:{handoffId,fromOwnerId:lead.owner_id,toOwnerId:data.toOwnerId,reason:data.reason}});
    return {id:handoffId,status:'accepted'};
  });
}

async function eligibility(client,tenantId,lead,channel,scheduledAt,excludeOutreachId=null) {
  const suppression=await client.query(`SELECT 1 FROM sales_suppressions WHERE tenant_id=$1 AND lead_id=$2 AND active AND channel IN ($3,'all') LIMIT 1`,[tenantId,lead.id,channel]);
  if(suppression.rowCount) throw new DomainError(409,'Lead is suppressed for this channel','suppressed');
  const consent=await client.query(`SELECT state,lawful_basis FROM sales_consent_events WHERE tenant_id=$1 AND lead_id=$2 AND channel=$3 ORDER BY source_observed_at DESC,created_at DESC LIMIT 1`,[tenantId,lead.id,channel]);
  if(!consent.rowCount||consent.rows[0].state!=='granted') throw new DomainError(409,'Current affirmative consent is required','consent_required');
  if(['EU','UK'].includes(lead.region)&&consent.rows[0].lawful_basis.toLowerCase()!=='consent') throw new DomainError(409,'EU/UK outreach requires consent as the recorded lawful basis','regional_privacy');
  const hour=scheduledAt.getUTCHours(); if(hour<8||hour>=20) throw new DomainError(409,'Schedule must be inside the conservative 08:00-20:00 UTC contact window','quiet_hours');
  const recent=await client.query(`SELECT 1 FROM sales_outreach WHERE tenant_id=$1 AND lead_id=$2 AND channel=$3 AND created_at>now()-interval '24 hours' AND state NOT IN ('cancelled','suppressed','failed') AND ($4::uuid IS NULL OR id<>$4) LIMIT 1`,[tenantId,lead.id,channel,excludeOutreachId]);
  if(recent.rowCount) throw new DomainError(429,'Lead/channel rate limit is one outreach per 24 hours','rate_limited');
  const daily=await client.query(`SELECT count(*)::int AS count FROM sales_outreach WHERE tenant_id=$1 AND created_at>now()-interval '24 hours' AND state NOT IN ('cancelled','suppressed','failed')`,[tenantId]);
  if(daily.rows[0].count>=1000) throw new DomainError(429,'Tenant daily outreach limit reached','rate_limited');
}
async function requestOutreach(identity,input){
  const data=parse(z.object({leadId:z.string().uuid(),channel:z.enum(['email','sms','phone']),templateId:z.string().min(1).max(120),campaignId:z.string().min(1).max(120),idempotencyKey:z.string().min(8).max(160),scheduledAt:z.coerce.date()}),input);
  return transaction(async(client)=>{
    const prior=await client.query('SELECT * FROM sales_outreach WHERE tenant_id=$1 AND idempotency_key=$2',[identity.tenant_id,data.idempotencyKey]); if(prior.rowCount)return {replay:true,outreach:prior.rows[0]};
    const lead=await leadForUpdate(client,identity.tenant_id,data.leadId); own(identity,lead); if(!['qualified','outreach_pending'].includes(lead.lifecycle_state))throw new DomainError(409,'Lead must be qualified before outreach');
    await eligibility(client,identity.tenant_id,lead,data.channel,data.scheduledAt);
    const outreachId=uuid(); const result=(await client.query(`INSERT INTO sales_outreach(id,tenant_id,lead_id,channel,template_id,campaign_id,idempotency_key,state,submitted_by,scheduled_at)
      VALUES($1,$2,$3,$4,$5,$6,$7,'review_required',$8,$9) RETURNING *`,[outreachId,identity.tenant_id,data.leadId,data.channel,data.templateId,data.campaignId,data.idempotencyKey,identity.id,data.scheduledAt])).rows[0];
    await client.query(`UPDATE sales_leads SET lifecycle_state='outreach_pending',version=version+1,updated_at=now() WHERE id=$1`,[data.leadId]);
    await appendAudit(client,{tenantId:identity.tenant_id,actorId:identity.id,leadId:data.leadId,action:'outreach.review_requested',details:{outreachId,channel:data.channel,campaignId:data.campaignId,scheduledAt:data.scheduledAt.toISOString()}});
    return {replay:false,outreach:result};
  });
}
async function reviewOutreach(identity,outreachId,input){
  const data=parse(z.object({decision:z.enum(['approve','reject']),notes:z.string().min(3).max(1000)}),input);
  return transaction(async(client)=>{
    const found=await client.query(`SELECT o.*,l.region,l.owner_id,l.lifecycle_state,l.external_crm_id,l.contact_reference FROM sales_outreach o JOIN sales_leads l ON l.id=o.lead_id WHERE o.id=$1 AND o.tenant_id=$2 FOR UPDATE OF o,l`,[outreachId,identity.tenant_id]);
    if(!found.rowCount)throw new DomainError(404,'Outreach not found'); const outreach=found.rows[0]; if(outreach.state!=='review_required')throw new DomainError(409,'Outreach is not awaiting review'); if(outreach.submitted_by===identity.id)throw new DomainError(409,'A different identity must perform human review','separation_of_duties');
    if(data.decision==='reject'){
      await client.query(`UPDATE sales_outreach SET state='cancelled',reviewed_by=$2,review_notes=$3,updated_at=now() WHERE id=$1`,[outreachId,identity.id,data.notes]);
      await client.query(`UPDATE sales_leads SET lifecycle_state='qualified',version=version+1,updated_at=now() WHERE id=$1`,[outreach.lead_id]);
      await appendAudit(client,{tenantId:identity.tenant_id,actorId:identity.id,leadId:outreach.lead_id,action:'outreach.rejected',details:{outreachId,notes:data.notes}}); return {state:'cancelled'};
    }
    await eligibility(client,identity.tenant_id,{id:outreach.lead_id,region:outreach.region},outreach.channel,new Date(outreach.scheduled_at),outreach.id);
    await client.query(`UPDATE sales_outreach SET state='queued',reviewed_by=$2,review_notes=$3,updated_at=now() WHERE id=$1`,[outreachId,identity.id,data.notes]);
    await client.query(`UPDATE sales_leads SET lifecycle_state='outreach_approved',version=version+1,updated_at=now() WHERE id=$1`,[outreach.lead_id]);
    await queue(client,identity.tenant_id,'outreach',outreachId,outreach.channel==='email'?'email':'crm','outreach.send',`outreach:${outreach.id}`,{outreachId,leadId:outreach.lead_id,externalCrmId:outreach.external_crm_id,contactReference:outreach.contact_reference,channel:outreach.channel,templateId:outreach.template_id,campaignId:outreach.campaign_id,scheduledAt:outreach.scheduled_at});
    await appendAudit(client,{tenantId:identity.tenant_id,actorId:identity.id,leadId:outreach.lead_id,action:'outreach.approved',details:{outreachId,notes:data.notes}}); return {state:'queued'};
  });
}

async function processNextOutbox(workerId='sales-worker'){
  const job=await transaction(async(client)=>{
    const picked=await client.query(`SELECT * FROM sales_outbox WHERE state IN ('queued','retry') AND next_attempt_at<=now() AND (lease_expires_at IS NULL OR lease_expires_at<now()) ORDER BY created_at FOR UPDATE SKIP LOCKED LIMIT 1`);
    if(!picked.rowCount)return null; const row=picked.rows[0]; await client.query(`UPDATE sales_outbox SET state='processing',attempts=attempts+1,lease_owner=$2,lease_expires_at=now()+interval '30 seconds',updated_at=now() WHERE id=$1`,[row.id,workerId]); return {...row,attempts:Number(row.attempts)+1};
  });
  if(!job)return null;
  try{
    const delivered=await connectors.deliver({tenantId:job.tenant_id,kind:job.connector_kind,eventType:job.event_type,payload:job.payload,idempotencyKey:job.idempotency_key});
    await transaction(async(client)=>{await client.query(`UPDATE sales_outbox SET state='succeeded',lease_owner=NULL,lease_expires_at=NULL,last_error=NULL,updated_at=now() WHERE id=$1`,[job.id]); await client.query(`UPDATE sales_sync_events SET state='succeeded',attempts=$2,last_error=NULL WHERE tenant_id=$1 AND direction='outbound' AND source_event_id=$3`,[job.tenant_id,job.attempts,job.idempotency_key]); if(job.aggregate_type==='outreach')await client.query(`UPDATE sales_outreach SET provider_message_id=COALESCE($2,provider_message_id),state='sent',sent_at=now(),updated_at=now() WHERE id=$1`,[job.aggregate_id,delivered.providerMessageId]);}); return {id:job.id,state:'succeeded'};
  }catch(error){
    const dead=error.retryable===false||job.attempts>=5; const delay=Math.min(3600,2**job.attempts*15);
    await transaction(async(client)=>{await client.query(`UPDATE sales_outbox SET state=$2,next_attempt_at=now()+($3*interval '1 second'),lease_owner=NULL,lease_expires_at=NULL,last_error=$4,updated_at=now() WHERE id=$1`,[job.id,dead?'dead_letter':'retry',delay,error.message.slice(0,500)]); await client.query(`UPDATE sales_sync_events SET state=$2,attempts=$3,last_error=$4 WHERE tenant_id=$1 AND direction='outbound' AND source_event_id=$5`,[job.tenant_id,dead?'dead_letter':'retry',job.attempts,error.message.slice(0,500),job.idempotency_key]); if(dead&&job.aggregate_type==='outreach')await client.query(`UPDATE sales_outreach SET state='failed',failure_code='connector_delivery_failed',updated_at=now() WHERE id=$1`,[job.aggregate_id]);}); return {id:job.id,state:dead?'dead_letter':'retry'};
  }
}

async function providerEvent(tenantId,provider,input){
  const data=parse(z.object({eventId:z.string().min(1).max(160),type:z.enum(['outreach.sent','outreach.delivered','outreach.failed','contact.opted_out','calendar.booked']),outreachId:z.string().uuid().optional(),leadId:z.string().uuid(),channel:z.enum(['email','sms','phone']).optional(),occurredAt:z.coerce.date(),providerMessageId:z.string().max(240).optional()}),input);
  return transaction(async(client)=>{
    const hash=digest(input); const prior=await client.query('SELECT payload_sha256 FROM sales_provider_events WHERE tenant_id=$1 AND provider=$2 AND provider_event_id=$3',[tenantId,provider,data.eventId]); if(prior.rowCount){if(prior.rows[0].payload_sha256!==hash)throw new DomainError(409,'Provider event id conflicts with prior payload');return {replay:true};}
    const lead=await leadForUpdate(client,tenantId,data.leadId); await client.query(`INSERT INTO sales_provider_events(id,tenant_id,provider,provider_event_id,event_type,payload,payload_sha256,handled_at) VALUES($1,$2,$3,$4,$5,$6::jsonb,$7,now())`,[uuid(),tenantId,provider,data.eventId,data.type,JSON.stringify(input),hash]);
    if(data.type==='contact.opted_out'){
      await client.query(`INSERT INTO sales_suppressions(id,tenant_id,lead_id,channel,reason,source_system,source_event_id,source_observed_at) VALUES($1,$2,$3,$4,'provider opt-out',$5,$6,$7)`,[uuid(),tenantId,data.leadId,data.channel||'all',provider,data.eventId,data.occurredAt]);
      await client.query(`UPDATE sales_outreach SET state='cancelled',failure_code='provider_opt_out',updated_at=now() WHERE tenant_id=$1 AND lead_id=$2 AND state IN ('review_required','approved','queued')`,[tenantId,data.leadId]);
    }else if(data.type==='outreach.failed'&&data.outreachId){await client.query(`UPDATE sales_outreach SET state='failed',failure_code='provider_reported_failure',updated_at=now() WHERE id=$1 AND tenant_id=$2`,[data.outreachId,tenantId]);}
    else if(data.type.startsWith('outreach.')&&data.outreachId){await client.query(`UPDATE sales_outreach SET state='sent',sent_at=COALESCE(sent_at,$3),provider_message_id=COALESCE($4,provider_message_id),updated_at=now() WHERE id=$1 AND tenant_id=$2`,[data.outreachId,tenantId,data.occurredAt,data.providerMessageId||null]); if(lead.lifecycle_state==='outreach_approved')await client.query(`UPDATE sales_leads SET lifecycle_state='contacted',version=version+1,updated_at=now() WHERE id=$1`,[data.leadId]);}
    await appendAudit(client,{tenantId,actorId:null,leadId:data.leadId,action:`provider.${data.type}`,details:{provider,eventId:data.eventId,outreachId:data.outreachId||null}}); return {replay:false};
  });
}

async function ingestEnrichment(identity,input){
  const data=parse(z.object({eventId:z.string().min(1).max(160),leadId:z.string().uuid(),sourceSystem:z.string().min(1).max(80),sourceObservedAt:z.coerce.date(),attributes:z.record(z.string(),z.union([z.string(),z.number(),z.boolean(),z.null()])),qualityFlags:z.array(z.string().min(1).max(120)).max(30).default([])}),input);
  return transaction(async(client)=>{const lead=await leadForUpdate(client,identity.tenant_id,data.leadId);own(identity,lead);const inserted=await recordSync(client,{tenantId:identity.tenant_id,kind:'enrichment',direction:'inbound',eventId:data.eventId,payload:input,observedAt:data.sourceObservedAt});if(!inserted)return{replay:true};
    if(data.sourceObservedAt<=new Date(lead.source_observed_at))throw new DomainError(409,'Stale enrichment update rejected','stale_sync');
    const attribution={...(lead.attribution||{}),enrichment:{source:data.sourceSystem,observedAt:data.sourceObservedAt.toISOString(),attributes:data.attributes}};const flags=[...new Set([...(lead.quality_flags||[]),...data.qualityFlags])];await client.query(`UPDATE sales_leads SET attribution=$3::jsonb,quality_flags=$4::jsonb,source_observed_at=$5,version=version+1,updated_at=now() WHERE id=$1 AND tenant_id=$2`,[data.leadId,identity.tenant_id,JSON.stringify(attribution),JSON.stringify(flags),data.sourceObservedAt]);await appendAudit(client,{tenantId:identity.tenant_id,actorId:identity.id,leadId:data.leadId,action:'lead.enriched',details:{eventId:data.eventId,sourceSystem:data.sourceSystem,attributeNames:Object.keys(data.attributes).sort(),qualityFlags:data.qualityFlags}});return{replay:false};});
}

async function ingestCalendar(identity,input){
  const data=parse(z.object({eventId:z.string().min(1).max(160),externalEventId:z.string().min(1).max(160),leadId:z.string().uuid(),state:z.enum(['booked','cancelled','completed','no_show']),startsAt:z.coerce.date(),sourceSystem:z.string().min(1).max(80),sourceObservedAt:z.coerce.date()}),input);
  return transaction(async(client)=>{const lead=await leadForUpdate(client,identity.tenant_id,data.leadId);own(identity,lead);const inserted=await recordSync(client,{tenantId:identity.tenant_id,kind:'calendar',direction:'inbound',eventId:data.eventId,payload:input,observedAt:data.sourceObservedAt});if(!inserted)return{replay:true};const prior=await client.query(`SELECT source_observed_at FROM sales_calendar_engagements WHERE tenant_id=$1 AND source_system=$2 AND external_event_id=$3 FOR UPDATE`,[identity.tenant_id,data.sourceSystem,data.externalEventId]);if(prior.rowCount&&new Date(prior.rows[0].source_observed_at)>=data.sourceObservedAt)throw new DomainError(409,'Stale calendar event rejected','stale_sync');await client.query(`INSERT INTO sales_calendar_engagements(id,tenant_id,lead_id,external_event_id,state,starts_at,source_system,source_observed_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8) ON CONFLICT(tenant_id,source_system,external_event_id) DO UPDATE SET state=EXCLUDED.state,starts_at=EXCLUDED.starts_at,source_observed_at=EXCLUDED.source_observed_at,updated_at=now()`,[uuid(),identity.tenant_id,data.leadId,data.externalEventId,data.state,data.startsAt,data.sourceSystem,data.sourceObservedAt]);if(data.state==='completed'&&['outreach_approved','handed_off'].includes(lead.lifecycle_state))await client.query(`UPDATE sales_leads SET lifecycle_state='contacted',version=version+1,updated_at=now() WHERE id=$1`,[data.leadId]);await appendAudit(client,{tenantId:identity.tenant_id,actorId:identity.id,leadId:data.leadId,action:`calendar.${data.state}`,details:{eventId:data.eventId,externalEventId:data.externalEventId,startsAt:data.startsAt.toISOString(),sourceSystem:data.sourceSystem}});return{replay:false};});
}

async function listConnectors(identity){return(await pool.query(`SELECT id,kind,provider,endpoint,credential_reference,source_contract_reference,enabled,created_at FROM sales_connectors WHERE tenant_id=$1 ORDER BY kind,provider`,[identity.tenant_id])).rows;}
async function saveConnector(identity,input){const data=parse(z.object({kind:z.enum(['crm','email','calendar','enrichment','consent','suppression']),provider:z.string().min(1).max(80),endpoint:z.string().url().max(500),credentialReference:z.string().regex(/^[a-zA-Z0-9_-]{2,120}$/),sourceContractReference:z.string().min(1).max(240),enabled:z.boolean().default(true)}),input);const protocol=new URL(data.endpoint).protocol;if(!['http:','https:'].includes(protocol))throw new DomainError(400,'Connector must use HTTP or HTTPS');return transaction(async(client)=>{const row=(await client.query(`INSERT INTO sales_connectors(id,tenant_id,kind,provider,endpoint,credential_reference,source_contract_reference,enabled) VALUES($1,$2,$3,$4,$5,$6,$7,$8) ON CONFLICT(tenant_id,kind,provider) DO UPDATE SET endpoint=EXCLUDED.endpoint,credential_reference=EXCLUDED.credential_reference,source_contract_reference=EXCLUDED.source_contract_reference,enabled=EXCLUDED.enabled RETURNING id,kind,provider,endpoint,credential_reference,source_contract_reference,enabled`,[uuid(),identity.tenant_id,data.kind,data.provider,data.endpoint,data.credentialReference,data.sourceContractReference,data.enabled])).rows[0];await appendAudit(client,{tenantId:identity.tenant_id,actorId:identity.id,action:'connector.configured',details:{connectorId:row.id,kind:row.kind,provider:row.provider,endpoint:row.endpoint,credentialReference:row.credential_reference,enabled:row.enabled}});return row;});}
async function createIdentity(identity,input){const data=parse(z.object({email:z.string().email().max(240),displayName:z.string().min(1).max(160),role:z.enum(['operator','reviewer','manager','auditor']),password:z.string().min(16).max(200)}),input);return transaction(async(client)=>{const id=uuid();const hash=await bcrypt.hash(data.password,12);try{const row=(await client.query(`INSERT INTO sales_identities(id,tenant_id,email,password_hash,display_name,role) VALUES($1,$2,lower($3),$4,$5,$6) RETURNING id,email,display_name,role,active`,[id,identity.tenant_id,data.email,hash,data.displayName,data.role])).rows[0];await appendAudit(client,{tenantId:identity.tenant_id,actorId:identity.id,action:'identity.provisioned',details:{identityId:id,email:data.email.toLowerCase(),role:data.role}});return row;}catch(error){if(error.code==='23505')throw new DomainError(409,'Identity email already exists');throw error;}});}
async function deactivateIdentity(identity,identityId){if(identity.id===identityId)throw new DomainError(409,'Managers cannot deactivate their current identity');return transaction(async(client)=>{const row=(await client.query(`UPDATE sales_identities SET active=false,token_version=token_version+1 WHERE id=$1 AND tenant_id=$2 AND active RETURNING id,email,role`,[identityId,identity.tenant_id])).rows[0];if(!row)throw new DomainError(404,'Identity not found');await appendAudit(client,{tenantId:identity.tenant_id,actorId:identity.id,action:'identity.deactivated',details:{identityId,email:row.email,role:row.role}});return row;});}

async function dashboard(identity){
  const [metrics,states,quality,outreach]=await Promise.all([
    pool.query(`SELECT count(*)::int AS total,count(*) FILTER(WHERE lifecycle_state='converted')::int AS converted FROM sales_leads WHERE tenant_id=$1`,[identity.tenant_id]),
    pool.query(`SELECT lifecycle_state,count(*)::int FROM sales_leads WHERE tenant_id=$1 GROUP BY lifecycle_state ORDER BY lifecycle_state`,[identity.tenant_id]),
    pool.query(`SELECT count(*) FILTER(WHERE jsonb_array_length(quality_flags)>0)::int AS flagged,count(*) FILTER(WHERE source_observed_at<now()-interval '7 days')::int AS stale FROM sales_leads WHERE tenant_id=$1`,[identity.tenant_id]),
    pool.query(`SELECT state,count(*)::int FROM sales_outreach WHERE tenant_id=$1 GROUP BY state ORDER BY state`,[identity.tenant_id]),
  ]); const total=metrics.rows[0].total;return{totalLeads:total,converted:metrics.rows[0].converted,conversionRate:total?metrics.rows[0].converted/total:0,flagged:quality.rows[0].flagged,stale:quality.rows[0].stale,lifecycle:states.rows,outreach:outreach.rows};
}
async function listLeads(identity){return (await pool.query(`SELECT l.*,a.display_name AS account_name FROM sales_leads l LEFT JOIN sales_accounts a ON a.id=l.account_id WHERE l.tenant_id=$1 ORDER BY l.updated_at DESC LIMIT 200`,[identity.tenant_id])).rows;}
async function listOutreach(identity){return (await pool.query(`SELECT o.*,l.display_name AS lead_name FROM sales_outreach o JOIN sales_leads l ON l.id=o.lead_id WHERE o.tenant_id=$1 ORDER BY o.created_at DESC LIMIT 200`,[identity.tenant_id])).rows;}
async function auditStatus(identity){return {valid:await verifyAudit(pool,identity.tenant_id)};}

module.exports={DomainError,ingestLead,recordConsent,suppress,transitionLead,handoff,requestOutreach,reviewOutreach,processNextOutbox,providerEvent,ingestEnrichment,ingestCalendar,dashboard,listLeads,listOutreach,auditStatus,listConnectors,saveConnector,createIdentity,deactivateIdentity};
