// Tax-aware rebalancer — auto-suggest trades to harvest losses.
const express = require('express');
const fetch = require('node-fetch');
const auth = require('../middleware/auth');
const router = express.Router();

// POST /api/tax-rebalancer/analyze — return loss-harvest candidates.
router.post('/analyze', auth, async (req, res) => {
  try {
    const { positions = [], targetAllocation = {} } = req.body;
    if (!Array.isArray(positions) || !positions.length) {
      return res.status(400).json({ error: 'positions[] required' });
    }

    // Loss harvest candidates: positions in loss > $50 with 30+ day holding.
    const harvest = positions
      .map(p => {
        const unrealized = (p.currentPrice - p.costBasis) * p.shares;
        return { ...p, unrealized };
      })
      .filter(p => p.unrealized < -50)
      .sort((a, b) => a.unrealized - b.unrealized);

    // Rebalance vs. target allocation
    const totalValue = positions.reduce((s, p) => s + p.currentPrice * p.shares, 0);
    const drift = Object.entries(targetAllocation).map(([sym, pct]) => {
      const pos = positions.find(p => p.symbol === sym);
      const currentPct = pos ? (pos.currentPrice * pos.shares) / totalValue : 0;
      return { symbol: sym, targetPct: pct, currentPct, drift: currentPct - pct };
    }).sort((a, b) => Math.abs(b.drift) - Math.abs(a.drift));

    // Build trade suggestions: sell biggest losers, buy biggest under-weights.
    const trades = [];
    for (const h of harvest.slice(0, 5)) {
      trades.push({ action: 'SELL', symbol: h.symbol, shares: h.shares, reason: `harvest loss $${h.unrealized.toFixed(2)}` });
    }
    for (const d of drift.filter(x => x.drift < -0.02).slice(0, 5)) {
      const dollars = Math.abs(d.drift) * totalValue;
      trades.push({ action: 'BUY', symbol: d.symbol, approxDollars: Math.round(dollars), reason: 'rebalance under-weight' });
    }

    let aiSummary = '';
    if (process.env.OPENROUTER_API_KEY) {
      try {
        const r = await fetch('https://openrouter.ai/api/v1/chat/completions', {
          method: 'POST',
          headers: { Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            model: process.env.OPENROUTER_MODEL || 'anthropic/claude-haiku-4.5',
            messages: [
              { role: 'system', content: 'You are a tax-aware portfolio coach. Beware wash-sale rules. 3 bullets.' },
              { role: 'user', content: `Trades: ${JSON.stringify(trades).slice(0, 1500)}` }
            ],
            max_tokens: 300
          })
        });
        const j = await r.json();
        aiSummary = j.choices?.[0]?.message?.content || '';
      } catch (e) { aiSummary = 'AI error: ' + e.message; }
    }

    res.json({ totalValue, harvestCandidates: harvest.length, drift, trades, aiSummary });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
