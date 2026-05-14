const express = require('express');
const fetch = require('node-fetch');
const auth = require('../middleware/auth');
const pool = require('../db');
const router = express.Router();

// ---------------------------------------------------------------------------
// OpenRouter helper – persists every result to ai_results table
// ---------------------------------------------------------------------------
async function callOpenRouter(prompt, systemPrompt, model) {
  const chosenModel = model || process.env.OPENROUTER_MODEL || 'anthropic/claude-haiku-4.5';
  const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`,
      'Content-Type': 'application/json',
      'HTTP-Referer': 'http://localhost:3000',
      'X-Title': 'Financial Services Salesforce',
    },
    body: JSON.stringify({
      model: chosenModel,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: prompt },
      ],
      max_tokens: 3000,
    }),
  });
  const data = await response.json();
  if (data.error) throw new Error(data.error.message || 'OpenRouter API error');
  return {
    content: data.choices[0].message.content,
    model: chosenModel,
    tokens: data.usage?.total_tokens || null,
  };
}

async function persistResult(userId, endpoint, params, result) {
  try {
    await pool.query(
      `INSERT INTO ai_results (user_id, endpoint, request_params, result_text, model_used, tokens_used)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [userId, endpoint, JSON.stringify(params), result.content, result.model, result.tokens]
    );
  } catch (err) {
    console.error('Failed to persist AI result:', err.message);
  }
}

async function ensureAiTables() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS ai_results (
      id SERIAL PRIMARY KEY,
      user_id INTEGER,
      endpoint VARCHAR(100) NOT NULL,
      request_params JSONB,
      result_text TEXT NOT NULL,
      model_used VARCHAR(100),
      tokens_used INTEGER,
      created_at TIMESTAMP DEFAULT NOW()
    );
  `);
}
ensureAiTables().catch((e) => console.error('ensureAiTables', e.message));

// ---------------------------------------------------------------------------
// POST /api/ai/portfolio-analysis – analyze a client's portfolio holdings
// ---------------------------------------------------------------------------
router.post('/portfolio-analysis', auth, async (req, res) => {
  try {
    const { holdings, risk_tolerance, investment_horizon, client_age } = req.body;
    const systemPrompt = `You are a CFA-credentialed portfolio analyst working inside a Salesforce
Financial Services Cloud workflow. Provide concise, regulator-ready commentary. Always include:
allocation gaps, concentration risk, expense ratio observations, and 3 specific rebalancing trades.`;
    const prompt = `Analyze this portfolio:
HOLDINGS: ${JSON.stringify(holdings || [])}
RISK TOLERANCE: ${risk_tolerance || 'moderate'}
INVESTMENT HORIZON: ${investment_horizon || '10y'}
CLIENT AGE: ${client_age || 'unknown'}

Provide:
1. Asset allocation summary (equities / fixed-income / alternatives / cash)
2. Concentration risks (any holding > 5%)
3. Sector / geography overweight or underweight
4. Three specific rebalancing trades with rationale
5. Expense ratio commentary
6. Tax-efficiency comments`;
    const result = await callOpenRouter(prompt, systemPrompt);
    await persistResult(req.user.id, 'portfolio-analysis', { risk_tolerance, investment_horizon }, result);
    res.json({ result: result.content });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// ---------------------------------------------------------------------------
// POST /api/ai/tax-loss-harvest – identify tax-loss harvesting opportunities
// ---------------------------------------------------------------------------
router.post('/tax-loss-harvest', auth, async (req, res) => {
  try {
    const { holdings, year_to_date_gains, account_type } = req.body;
    const systemPrompt = `You are a tax planning specialist. Identify wash-sale-safe tax-loss
harvesting opportunities. Be precise about replacement securities (not substantially identical).`;
    const prompt = `Holdings with cost basis: ${JSON.stringify(holdings || [])}
Realized YTD gains: $${year_to_date_gains || 0}
Account type: ${account_type || 'taxable'}

Output:
1. Lots with unrealized losses ranked by harvestable loss
2. Suggested replacement security for each (avoiding wash-sale)
3. 30-day wash-sale calendar (sell-by / re-entry-after dates)
4. Net offset against YTD gains
5. Carryforward estimate if losses exceed gains`;
    const result = await callOpenRouter(prompt, systemPrompt);
    await persistResult(req.user.id, 'tax-loss-harvest', { account_type }, result);
    res.json({ result: result.content });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// ---------------------------------------------------------------------------
// POST /api/ai/risk-profile – derive a client risk score from KYC inputs
// ---------------------------------------------------------------------------
router.post('/risk-profile', auth, async (req, res) => {
  try {
    const { questionnaire, age, income, net_worth, dependents, time_horizon } = req.body;
    const systemPrompt = `You are a fiduciary risk profiler. Output a numeric risk score
(0-100) plus IPS-style language suitable for Salesforce Financial Services Cloud KYC fields.`;
    const prompt = `KYC inputs:
Age: ${age}
Income: ${income}
Net worth: ${net_worth}
Dependents: ${dependents}
Time horizon: ${time_horizon}
Questionnaire answers: ${JSON.stringify(questionnaire || {})}

Provide:
1. Numeric risk score 0-100 with breakdown
2. Risk capacity vs risk tolerance gap analysis
3. Recommended target asset allocation (six-bucket model)
4. IPS narrative paragraph ready for advisor review`;
    const result = await callOpenRouter(prompt, systemPrompt);
    await persistResult(req.user.id, 'risk-profile', { age, time_horizon }, result);
    res.json({ result: result.content });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// ---------------------------------------------------------------------------
// POST /api/ai/retirement-projection – Monte-Carlo style retirement narrative
// ---------------------------------------------------------------------------
router.post('/retirement-projection', auth, async (req, res) => {
  try {
    const { current_age, retirement_age, current_savings, annual_contribution, target_income } = req.body;
    const systemPrompt = `You are a retirement income planner. Speak in numbers.
Provide a probability of success and a Monte-Carlo style narrative.`;
    const prompt = `Inputs:
Current age: ${current_age}
Target retirement age: ${retirement_age}
Current savings: $${current_savings}
Annual contribution: $${annual_contribution}
Target retirement income: $${target_income}/yr

Provide:
1. Estimated nest-egg at retirement (assume 6% real return)
2. 4% rule withdrawal vs target
3. Probability-of-success narrative (Monte-Carlo style)
4. Three contribution-rate scenarios (current, +20%, max-out 401k+IRA)
5. Sequence-of-returns risk commentary
6. Recommended Roth/Traditional split`;
    const result = await callOpenRouter(prompt, systemPrompt);
    await persistResult(req.user.id, 'retirement-projection', { current_age, retirement_age }, result);
    res.json({ result: result.content });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// ---------------------------------------------------------------------------
// POST /api/ai/compliance-check – check advisor communication for compliance
// ---------------------------------------------------------------------------
router.post('/compliance-check', auth, async (req, res) => {
  try {
    const { communication_text, channel, audience } = req.body;
    const systemPrompt = `You are a FINRA/SEC compliance officer reviewing advisor communications.
Flag prohibited language, missing disclosures, and performance-claim issues. Be specific with regulation citations.`;
    const prompt = `Channel: ${channel || 'email'}
Audience: ${audience || 'retail client'}
Communication:
"""
${communication_text || ''}
"""

Provide:
1. Compliance verdict (PASS / NEEDS REVISION / BLOCK)
2. Issues by severity with regulation citation (FINRA Rule 2210, SEC Marketing Rule 206(4)-1, etc.)
3. Suggested rewrite with required disclosures inserted
4. Required supervisor sign-off level`;
    const result = await callOpenRouter(prompt, systemPrompt);
    await persistResult(req.user.id, 'compliance-check', { channel, audience }, result);
    res.json({ result: result.content });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// ---------------------------------------------------------------------------
// POST /api/ai/client-meeting-prep – generate prep notes for upcoming review
// ---------------------------------------------------------------------------
router.post('/client-meeting-prep', auth, async (req, res) => {
  try {
    const { client_name, last_meeting_notes, recent_activity, life_events, market_conditions } = req.body;
    const systemPrompt = `You are an advisor's chief of staff preparing for an annual client review.
Output structured talking points with discovery questions and a pre-filled agenda.`;
    const prompt = `Client: ${client_name || 'Client'}
Last meeting notes: ${last_meeting_notes || 'None'}
Recent account activity: ${recent_activity || 'None'}
Life events on record: ${life_events || 'None'}
Current market conditions: ${market_conditions || 'unspecified'}

Provide:
1. 30-minute meeting agenda
2. Five high-value discovery questions
3. Three planning opportunities (estate, tax, insurance, education)
4. Cross-sell talking points (where suitable)
5. Risk topics to surface
6. Pre-filled Salesforce activity log entry`;
    const result = await callOpenRouter(prompt, systemPrompt);
    await persistResult(req.user.id, 'client-meeting-prep', { client_name }, result);
    res.json({ result: result.content });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// ---------------------------------------------------------------------------
// POST /api/ai/insurance-needs-analysis – life/disability/LTC needs analysis
// ---------------------------------------------------------------------------
router.post('/insurance-needs-analysis', auth, async (req, res) => {
  try {
    const { household, income, debts, education_goals, existing_coverage } = req.body;
    const systemPrompt = `You are a CLU-credentialed insurance planner. Use a needs-based approach
(DIME/HLV/replacement-income) and reconcile against existing coverage.`;
    const prompt = `Household: ${JSON.stringify(household || {})}
Annual income: $${income}
Debts: ${JSON.stringify(debts || {})}
Education goals: ${education_goals || 'None'}
Existing coverage: ${JSON.stringify(existing_coverage || {})}

Provide:
1. Life insurance gap (DIME and HLV methods, both)
2. Disability insurance gap
3. LTC needs commentary
4. Term vs permanent recommendation with rationale
5. Recommended monthly premium budget
6. Three product structures (level term, blended, hybrid)`;
    const result = await callOpenRouter(prompt, systemPrompt);
    await persistResult(req.user.id, 'insurance-needs-analysis', {}, result);
    res.json({ result: result.content });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// ---------------------------------------------------------------------------
// POST /api/ai/estate-summary – summarize estate plan + flag gaps
// ---------------------------------------------------------------------------
router.post('/estate-summary', auth, async (req, res) => {
  try {
    const { documents_on_file, asset_titling, beneficiary_designations, state, net_worth } = req.body;
    const systemPrompt = `You are an estate planning analyst. Identify titling/beneficiary gaps,
probate exposure, and state-specific issues. Never give legal advice — flag for attorney review.`;
    const prompt = `State of residence: ${state}
Net worth: $${net_worth}
Documents on file: ${JSON.stringify(documents_on_file || [])}
Asset titling summary: ${JSON.stringify(asset_titling || {})}
Beneficiary designations: ${JSON.stringify(beneficiary_designations || {})}

Provide:
1. Documents present vs missing (will, RLT, POA, healthcare directive, HIPAA)
2. Probate exposure summary
3. Beneficiary mismatch flags (e.g., ex-spouse on 401k)
4. State estate-tax exposure
5. Three recommended next steps with attorney prompts`;
    const result = await callOpenRouter(prompt, systemPrompt);
    await persistResult(req.user.id, 'estate-summary', { state }, result);
    res.json({ result: result.content });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// ---------------------------------------------------------------------------
// POST /api/ai/lead-scoring – score a Salesforce lead for advisor follow-up
// ---------------------------------------------------------------------------
router.post('/lead-scoring', auth, async (req, res) => {
  try {
    const { lead } = req.body;
    const systemPrompt = `You are a wealth-management lead scoring engine. Output a 0-100 score
with a one-line "next action" suitable for a Salesforce task record.`;
    const prompt = `Lead profile: ${JSON.stringify(lead || {})}

Provide:
1. Score 0-100 with weighted factors
2. Tier (A / B / C / D)
3. Recommended advisor segment to assign (HNW / mass-affluent / emerging)
4. Recommended outreach channel + first message
5. Likely book of business value (LTV estimate)`;
    const result = await callOpenRouter(prompt, systemPrompt);
    await persistResult(req.user.id, 'lead-scoring', {}, result);
    res.json({ result: result.content });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// ---------------------------------------------------------------------------
// POST /api/ai/market-commentary – produce client-ready market commentary
// ---------------------------------------------------------------------------
router.post('/market-commentary', auth, async (req, res) => {
  try {
    const { period, themes, audience } = req.body;
    const systemPrompt = `You are a market strategist drafting compliant client-facing commentary.
Avoid forward-looking statements that would violate the SEC Marketing Rule. Include required disclosures.`;
    const prompt = `Period: ${period || 'last quarter'}
Themes to cover: ${JSON.stringify(themes || [])}
Audience: ${audience || 'retail clients'}

Provide:
1. 3-paragraph commentary (no specific return promises)
2. Sector heatmap commentary (which led / lagged)
3. Fixed-income commentary
4. Forward-looking factors framed as scenarios (not predictions)
5. Required disclosure footer`;
    const result = await callOpenRouter(prompt, systemPrompt);
    await persistResult(req.user.id, 'market-commentary', { period, audience }, result);
    res.json({ result: result.content });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
