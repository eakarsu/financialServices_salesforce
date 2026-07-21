const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { z } = require('zod');
const pool = require('../db');
const auth = require('../middleware/auth');
const { loadConfig } = require('../config');

const router = express.Router();
const credentials = z.object({ tenant: z.string().min(1).max(80), email: z.string().email().max(240), password: z.string().min(12).max(200) });

router.post('/register', (_req, res) => res.status(403).json({ error: 'Public registration is disabled; a tenant manager must provision identities' }));

router.post('/login', async (req, res, next) => {
  try {
    const parsed = credentials.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: 'Tenant, valid email, and password of at least 12 characters are required' });
    const result = await pool.query(`SELECT i.*,t.slug FROM sales_identities i JOIN sales_tenants t ON t.id=i.tenant_id
      WHERE lower(i.email)=lower($1) AND t.slug=$2 AND i.active AND t.active`, [parsed.data.email, parsed.data.tenant]);
    const identity = result.rows[0];
    const valid = identity ? await bcrypt.compare(parsed.data.password, identity.password_hash) : false;
    if (!valid) return res.status(401).json({ error: 'Invalid credentials' });
    const token = jwt.sign({ tid:identity.tenant_id,role:identity.role,ver:identity.token_version }, loadConfig().jwtSecret, {
      algorithm:'HS256',subject:identity.id,issuer:'governed-sales',audience:'sales-operations',expiresIn:'15m',
    });
    return res.json({ user:{ id:identity.id,name:identity.display_name,email:identity.email,role:identity.role,tenant:identity.slug },token,expiresInSeconds:900 });
  } catch (error) { return next(error); }
});

router.get('/session', auth, (req,res) => res.json({ user:{ id:req.identity.id,name:req.identity.display_name,email:req.identity.email,role:req.identity.role } }));
module.exports = router;
