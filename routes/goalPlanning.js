// Goal-based planning agent — Monte Carlo outcomes + AI plan tweaks.
const express = require('express');
const fetch = require('node-fetch');
const auth = require('../middleware/auth');
const router = express.Router();

function monteCarlo({ initial, annualContribution, years, meanReturn = 0.07, vol = 0.12, runs = 5000 }) {
  const results = [];
  for (let i = 0; i < runs; i++) {
    let bal = initial;
    for (let y = 0; y < years; y++) {
      // Box-Muller for normal draw
      const u1 = Math.random(), u2 = Math.random();
      const z = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
      const r = meanReturn + vol * z;
      bal = (bal + annualContribution) * (1 + r);
    }
    results.push(bal);
  }
  results.sort((a, b) => a - b);
  const pct = (p) => results[Math.floor(p * runs)];
  return { p10: pct(0.1), p50: pct(0.5), p90: pct(0.9), worst: results[0], best: results[runs - 1] };
}

async function aiAdvise(scenario, distribution) {
  if (!process.env.OPENROUTER_API_KEY) return 'AI not configured';
  const r = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      model: process.env.OPENROUTER_MODEL || 'anthropic/claude-haiku-4.5',
      messages: [
        { role: 'system', content: 'You are a CFP-style retirement planner. Return 3 specific tweaks in bullet form.' },
        { role: 'user', content: `Scenario: ${JSON.stringify(scenario)}. Outcome p10/p50/p90: ${JSON.stringify(distribution)}.` }
      ],
      max_tokens: 400
    })
  });
  const j = await r.json();
  return j.choices?.[0]?.message?.content || 'No advice';
}

// POST /api/goal-planning/simulate — run a goal projection.
router.post('/simulate', auth, async (req, res) => {
  try {
    const { initial = 0, annualContribution = 12000, years = 30, meanReturn, vol, target } = req.body;
    const distribution = monteCarlo({ initial, annualContribution, years, meanReturn, vol });
    const probSuccess = target
      ? Math.round(((distribution.p90 >= target ? 0.9 : 0) + (distribution.p50 >= target ? 0.5 : 0)) * 100) / 100
      : null;
    const advice = await aiAdvise({ initial, annualContribution, years, target }, distribution).catch(e => 'AI: ' + e.message);
    res.json({ inputs: { initial, annualContribution, years, target }, distribution, probSuccess, advice });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
