const crypto = require('node:crypto');
const express = require('express');
const auth = require('../middleware/auth');
const pool = require('../db');

const router = express.Router();

router.post('/sales-advice', auth, async (req, res, next) => {
  try {
    const prompt = String(req.body?.prompt || '').trim();
    if (!prompt) return res.status(400).json({ error: 'prompt is required' });
    const apiKey = process.env.OPENROUTER_API_KEY;
    const baseUrl = process.env.OPENROUTER_BASE_URL;
    const model = process.env.OPENROUTER_MODEL;
    if (!apiKey || !baseUrl || !model) throw Object.assign(new Error('OpenRouter is not configured'), { statusCode: 503 });
    const response = await fetch(`${baseUrl.replace(/\/$/, '')}/chat/completions`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model,
        messages: [
          { role: 'system', content: 'Provide concise, compliant financial-services sales operations advice with explicit next actions and risks.' },
          { role: 'user', content: prompt },
        ],
        temperature: 0.2,
      }),
      signal: AbortSignal.timeout(45_000),
    });
    if (!response.ok) throw Object.assign(new Error(`OpenRouter returned ${response.status}`), { statusCode: 502 });
    const payload = await response.json();
    const content = payload.choices?.[0]?.message?.content?.trim();
    if (!content) throw Object.assign(new Error('OpenRouter returned empty content'), { statusCode: 502 });
    const id = crypto.randomUUID();
    await pool.query(
      `INSERT INTO sales_ai_results(id,tenant_id,identity_id,prompt,content,provider,model)
       VALUES($1,$2,$3,$4,$5,'openrouter',$6)`,
      [id, req.identity.tenant_id, req.identity.id, prompt, content, model],
    );
    return res.json({ content, provider: 'openrouter', model, persistedId: id });
  } catch (error) { return next(error); }
});

module.exports = router;
