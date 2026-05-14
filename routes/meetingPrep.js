// Client meeting prep AI — pre-read summary, talking points from CRM activity.
const express = require('express');
const fetch = require('node-fetch');
const auth = require('../middleware/auth');
const router = express.Router();

// POST /api/meeting-prep/brief — generate a pre-meeting brief.
router.post('/brief', auth, async (req, res) => {
  try {
    const { clientName, recentActivity = [], portfolioSnapshot = {}, lastMeetingNotes = '' } = req.body;
    if (!clientName) return res.status(400).json({ error: 'clientName required' });

    if (!process.env.OPENROUTER_API_KEY) {
      return res.status(503).json({ error: 'AI not configured' });
    }

    const sys = `You are a financial advisor's chief of staff. Produce a meeting prep brief with:
1) 3-sentence client summary
2) Portfolio highlights (numbers from snapshot)
3) Talking points (3-5 bullets)
4) Open follow-ups from last meeting
5) Suggested agenda (4 items, time-boxed).
Return as Markdown.`;
    const usr = `Client: ${clientName}
Recent activity (last 90 days):
${recentActivity.slice(0, 20).map(a => `- ${a.date}: ${a.type} — ${a.summary}`).join('\n')}

Portfolio: ${JSON.stringify(portfolioSnapshot)}

Last meeting notes: ${lastMeetingNotes.slice(0, 2000)}`;

    const r = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: process.env.OPENROUTER_MODEL || 'anthropic/claude-haiku-4.5',
        messages: [{ role: 'system', content: sys }, { role: 'user', content: usr }],
        max_tokens: 1200,
        temperature: 0.4
      })
    });
    const j = await r.json();
    if (j.error) return res.status(502).json({ error: j.error.message });

    res.json({ clientName, brief: j.choices?.[0]?.message?.content || '', generatedAt: new Date() });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// POST /api/meeting-prep/talking-points — quick punchy bullets only.
router.post('/talking-points', auth, async (req, res) => {
  try {
    const { context } = req.body;
    if (!context) return res.status(400).json({ error: 'context required' });
    if (!process.env.OPENROUTER_API_KEY) return res.status(503).json({ error: 'AI not configured' });

    const r = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: process.env.OPENROUTER_MODEL || 'anthropic/claude-haiku-4.5',
        messages: [
          { role: 'system', content: 'Return exactly 5 sharp talking-point bullets as a JSON array of strings.' },
          { role: 'user', content: context.slice(0, 4000) }
        ],
        max_tokens: 400
      })
    });
    const j = await r.json();
    const text = j.choices?.[0]?.message?.content || '[]';
    let bullets;
    try { bullets = JSON.parse(text.match(/\[[\s\S]*\]/)?.[0] || '[]'); } catch { bullets = text.split('\n').filter(Boolean); }
    res.json({ bullets });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
