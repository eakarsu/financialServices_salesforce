const crypto = require('node:crypto');
const express = require('express');
const pool = require('../db');
const { loadConfig } = require('../config');
const sales = require('../services/sales');

const router = express.Router();
router.post('/:provider', async (req,res,next)=>{
  try{
    const timestamp=req.get('x-webhook-timestamp')||''; const signature=req.get('x-webhook-signature')||''; const tenantSlug=req.get('x-sales-tenant')||'';
    const seconds=Number(timestamp); if(!Number.isFinite(seconds)||Math.abs(Date.now()/1000-seconds)>300)return res.status(401).json({error:'Expired webhook timestamp'});
    const expected=crypto.createHmac('sha256',loadConfig().webhookSecret).update(`${timestamp}.${req.rawBody||''}`).digest('hex');
    const a=Buffer.from(signature);const b=Buffer.from(expected);if(a.length!==b.length||!crypto.timingSafeEqual(a,b))return res.status(401).json({error:'Invalid webhook signature'});
    const tenant=(await pool.query('SELECT id FROM sales_tenants WHERE slug=$1 AND active',[tenantSlug])).rows[0];if(!tenant)return res.status(404).json({error:'Tenant not found'});
    return res.json(await sales.providerEvent(tenant.id,req.params.provider,req.body));
  }catch(error){return next(error);}
});
module.exports=router;
