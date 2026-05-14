// Compliance copilot — suitability checks, ADV/Form CRS Q&A.
const express = require('express');
const fetch = require('node-fetch');
const auth = require('../middleware/auth');
const router = express.Router();

async function ask(systemPrompt, userPrompt) {
  if (!process.env.OPENROUTER_API_KEY) {
    return { text: 'AI not configured', configured: false };
  }
  const r = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: process.env.OPENROUTER_MODEL || 'anthropic/claude-haiku-4.5',
      messages: [{ role: 'system', content: systemPrompt }, { role: 'user', content: userPrompt }],
      max_tokens: 800,
      temperature: 0.2
    })
  });
  const j = await r.json();
  return { text: j.choices?.[0]?.message?.content || '', configured: true };
}

// POST /api/compliance-copilot/suitability — evaluate a client/product fit.
router.post('/suitability', auth, async (req, res) => {
  try {
    const { client, product } = req.body;
    if (!client || !product) return res.status(400).json({ error: 'client and product required' });

    const checks = [];
    if (client.age >= 65 && (product.risk || '').toLowerCase() === 'high') {
      checks.push({ severity: 'warn', code: 'AGE_RISK', detail: 'High-risk product for senior — review needed.' });
    }
    if (client.netWorth && product.minNetWorth && client.netWorth < product.minNetWorth) {
      checks.push({ severity: 'fail', code: 'NET_WORTH', detail: 'Below product minimum net worth.' });
    }
    if (client.riskTolerance && product.risk && client.riskTolerance !== product.risk) {
      checks.push({ severity: 'warn', code: 'RISK_MISMATCH', detail: `Client risk tolerance ${client.riskTolerance} vs product ${product.risk}.` });
    }
    if (!checks.length) checks.push({ severity: 'ok', code: 'PASS', detail: 'No rule violations detected.' });

    const ai = await ask(
      'You are a securities compliance assistant. Reference FINRA Rule 2111 (suitability).',
      `Client: ${JSON.stringify(client)}\nProduct: ${JSON.stringify(product)}\nChecks: ${JSON.stringify(checks)}`
    ).catch(e => ({ text: 'AI error: ' + e.message, configured: false }));

    res.json({ checks, narrative: ai.text, aiConfigured: ai.configured });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// POST /api/compliance-copilot/adv-qa — answer ADV/Form CRS questions.
router.post('/adv-qa', auth, async (req, res) => {
  try {
    const { question, advText } = req.body;
    if (!question) return res.status(400).json({ error: 'question required' });

    const sys = 'You answer SEC Form ADV / Form CRS questions strictly using provided ADV text. If not found, say so.';
    const usr = `ADV text:\n${(advText || '').slice(0, 6000)}\n\nQuestion: ${question}`;
    const ai = await ask(sys, usr).catch(e => ({ text: 'AI error: ' + e.message }));
    res.json({ question, answer: ai.text });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
