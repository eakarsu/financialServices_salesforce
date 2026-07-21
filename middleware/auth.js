const jwt = require('jsonwebtoken');
const pool = require('../db');
const { loadConfig } = require('../config');

function bearer(req) {
  const value = req.get('authorization') || '';
  return value.startsWith('Bearer ') ? value.slice(7).trim() : null;
}

async function auth(req, res, next) {
  try {
    const token = bearer(req);
    if (!token) return res.status(401).json({ error: 'Authentication required' });
    const decoded = jwt.verify(token, loadConfig().jwtSecret, {
      algorithms: ['HS256'], issuer: 'governed-sales', audience: 'sales-operations',
    });
    const result = await pool.query(`SELECT i.id,i.tenant_id,i.email,i.display_name,i.role,i.token_version
      FROM sales_identities i JOIN sales_tenants t ON t.id=i.tenant_id
      WHERE i.id=$1 AND i.tenant_id=$2 AND i.active AND t.active`, [decoded.sub, decoded.tid]);
    const identity = result.rows[0];
    if (!identity || Number(identity.token_version) !== Number(decoded.ver)) {
      return res.status(401).json({ error: 'Session is no longer active' });
    }
    req.identity = identity;
    return next();
  } catch (error) {
    if (error.name === 'JsonWebTokenError' || error.name === 'TokenExpiredError') {
      return res.status(401).json({ error: 'Invalid or expired session' });
    }
    return next(error);
  }
}

function requireRoles(...roles) {
  return (req, res, next) => roles.includes(req.identity?.role)
    ? next()
    : res.status(403).json({ error: 'Role is not permitted for this operation' });
}

module.exports = auth;
module.exports.requireRoles = requireRoles;
