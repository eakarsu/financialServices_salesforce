const express = require('express');
const auth = require('../middleware/auth');
const { requireRoles } = require('../middleware/auth');
const sales = require('../services/sales');

const router = express.Router();
router.use(auth);
const run = (handler) => async (req,res,next) => { try { res.json(await handler(req)); } catch(error) { next(error); } };

router.get('/dashboard', run((req)=>sales.dashboard(req.identity)));
router.get('/leads', run((req)=>sales.listLeads(req.identity)));
router.get('/outreach', run((req)=>sales.listOutreach(req.identity)));
router.get('/audit/verify', requireRoles('manager','auditor'), run((req)=>sales.auditStatus(req.identity)));
router.post('/sync/crm/leads', requireRoles('operator','manager'), run((req)=>sales.ingestLead(req.identity,req.body)));
router.post('/sync/enrichment', requireRoles('operator','manager'), run((req)=>sales.ingestEnrichment(req.identity,req.body)));
router.post('/sync/calendar', requireRoles('operator','manager'), run((req)=>sales.ingestCalendar(req.identity,req.body)));
router.post('/consent', requireRoles('operator','manager'), run((req)=>sales.recordConsent(req.identity,req.body)));
router.post('/suppressions', requireRoles('operator','manager'), run((req)=>sales.suppress(req.identity,req.body)));
router.post('/leads/:id/transition', requireRoles('operator','manager'), run((req)=>sales.transitionLead(req.identity,req.params.id,req.body.state,req.body.reason)));
router.post('/leads/:id/handoff', requireRoles('operator','manager'), run((req)=>sales.handoff(req.identity,req.params.id,req.body)));
router.post('/outreach', requireRoles('operator','manager'), run((req)=>sales.requestOutreach(req.identity,req.body)));
router.post('/outreach/:id/review', requireRoles('reviewer','manager'), run((req)=>sales.reviewOutreach(req.identity,req.params.id,req.body)));
router.get('/connectors', requireRoles('manager','auditor'), run((req)=>sales.listConnectors(req.identity)));
router.put('/connectors', requireRoles('manager'), run((req)=>sales.saveConnector(req.identity,req.body)));
router.post('/identities', requireRoles('manager'), run((req)=>sales.createIdentity(req.identity,req.body)));
router.delete('/identities/:id', requireRoles('manager'), run((req)=>sales.deactivateIdentity(req.identity,req.params.id)));

module.exports = router;
