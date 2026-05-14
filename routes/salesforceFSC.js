// Salesforce Financial Services Cloud connector — sync households, policies, goals.
// TODO: configure credentials for Salesforce (process.env.SF_CLIENT_ID, SF_CLIENT_SECRET, SF_USERNAME, SF_PASSWORD, SF_LOGIN_URL).
const express = require('express');
const fetch = require('node-fetch');
const auth = require('../middleware/auth');
const router = express.Router();

let sfToken = null;
let sfInstanceUrl = null;

async function getToken() {
  if (sfToken) return { sfToken, sfInstanceUrl };
  const { SF_CLIENT_ID, SF_CLIENT_SECRET, SF_USERNAME, SF_PASSWORD, SF_LOGIN_URL } = process.env;
  if (!SF_CLIENT_ID || !SF_USERNAME) {
    throw new Error('Salesforce credentials not configured');
  }
  const body = new URLSearchParams({
    grant_type: 'password',
    client_id: SF_CLIENT_ID,
    client_secret: SF_CLIENT_SECRET,
    username: SF_USERNAME,
    password: SF_PASSWORD
  });
  const r = await fetch(`${SF_LOGIN_URL || 'https://login.salesforce.com'}/services/oauth2/token`, {
    method: 'POST',
    body
  });
  const j = await r.json();
  if (!j.access_token) throw new Error(j.error_description || 'Salesforce auth failed');
  sfToken = j.access_token;
  sfInstanceUrl = j.instance_url;
  return { sfToken, sfInstanceUrl };
}

async function sfQuery(soql) {
  const { sfToken: tk, sfInstanceUrl: url } = await getToken();
  const r = await fetch(`${url}/services/data/v59.0/query/?q=${encodeURIComponent(soql)}`, {
    headers: { Authorization: `Bearer ${tk}` }
  });
  return r.json();
}

// GET /api/salesforce-fsc/households — list FSC households.
router.get('/households', auth, async (req, res) => {
  try {
    const data = await sfQuery('SELECT Id, Name FROM Account WHERE RecordType.Name = \'Household\' LIMIT 50');
    res.json({ records: data.records || [], totalSize: data.totalSize || 0 });
  } catch (e) {
    res.status(503).json({ error: 'Salesforce not configured', detail: e.message });
  }
});

// GET /api/salesforce-fsc/policies/:accountId — list policies for an account.
router.get('/policies/:accountId', auth, async (req, res) => {
  try {
    const data = await sfQuery(
      `SELECT Id, Name, FinServ__PolicyName__c, FinServ__PolicyNumber__c, FinServ__PolicyType__c FROM FinServ__InsurancePolicy__c WHERE FinServ__PrimaryOwner__c = '${req.params.accountId}'`
    );
    res.json({ records: data.records || [] });
  } catch (e) {
    res.status(503).json({ error: 'Salesforce not configured', detail: e.message });
  }
});

// POST /api/salesforce-fsc/goals/sync — push a goal back into FSC.
router.post('/goals/sync', auth, async (req, res) => {
  try {
    const { accountId, name, targetAmount, targetDate } = req.body;
    if (!accountId || !name) return res.status(400).json({ error: 'accountId and name required' });
    const { sfToken: tk, sfInstanceUrl: url } = await getToken();
    const r = await fetch(`${url}/services/data/v59.0/sobjects/FinServ__FinancialGoal__c`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${tk}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        Name: name,
        FinServ__PrimaryOwner__c: accountId,
        FinServ__TargetAmount__c: targetAmount,
        FinServ__TargetDate__c: targetDate
      })
    });
    const j = await r.json();
    res.json(j);
  } catch (e) {
    res.status(503).json({ error: 'Salesforce not configured', detail: e.message });
  }
});

module.exports = router;
