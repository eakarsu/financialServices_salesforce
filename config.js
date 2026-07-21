function required(name, minimum = 1) {
  const value = process.env[name]?.trim();
  if (!value || value.length < minimum) throw new Error(`${name} is required and must be at least ${minimum} characters`);
  return value;
}

function loadConfig() {
  const production = process.env.NODE_ENV === 'production';
  const jwtSecret = production ? required('JWT_SECRET', 32) : (process.env.JWT_SECRET || 'local-sales-jwt-secret-at-least-32-characters');
  const webhookSecret = production ? required('OUTREACH_WEBHOOK_SECRET', 32) : (process.env.OUTREACH_WEBHOOK_SECRET || 'local-outreach-webhook-secret-32-chars');
  const allowedOrigins = (process.env.ALLOWED_ORIGINS || 'http://127.0.0.1:5173,http://localhost:5173').split(',').map((value) => value.trim()).filter(Boolean);
  if (production && (!process.env.DATABASE_URL || allowedOrigins.includes('*') || allowedOrigins.some((origin) => !origin.startsWith('https://')))) {
    throw new Error('Production requires DATABASE_URL and exact HTTPS origins');
  }
  return { production, jwtSecret, webhookSecret, allowedOrigins };
}

module.exports = { loadConfig };
