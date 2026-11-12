// agent/brain.js - the reasoning layer around Kane CLI.
// Two brains, same interface:
//   - GeminiBrain: uses a free-tier Gemini key for planning + failure analysis (best demo)
//   - HeuristicBrain: zero-key fallback that still closes the loop (offline, deterministic)
//
// Interface:
//   plan({url, goal})            -> [{ id, objective, expect }]
//   analyze({objective, runEnd}) -> { verdict: 'pass'|'bug'|'refine', reason, refinedObjective? }

class HeuristicBrain {
  name = 'heuristic';
  async plan({ url, goal }) {
    // Split the goal into 1-3 concrete, observable checks. Kane objectives are plain English,
    // so the plan is mostly about making each check independently verifiable.
    const goalText = goal.trim().replace(/\.+$/, '');
    const objectives = [{ id: 'ac-1', objective: `${goalText}. If anything blocks this flow, stop and report what you saw.`, expect: 'flow completes' }];
    return objectives;
  }
  async analyze({ objective, runEnd }) {
    if (runEnd.status === 'passed') return { verdict: 'pass', reason: runEnd.reason || 'objective met' };
    const why = `${runEnd.reason || ''} ${runEnd.summary || ''}`.toLowerCase();
    // Kane could not find an element the objective asserted -> either the copy differs (refine) or it is a real bug.
    const looksLikeBug = /not found|missing|did not|no .* (button|link|field|page)|error|broken|failed to/.test(why);
    if (looksLikeBug) {
      return {
        verdict: 'bug',
        reason: runEnd.reason || runEnd.summary || 'Kane could not complete the flow',
        evidence: { one_liner: runEnd.one_liner, test_url: runEnd.test_url || null },
      };
    }
    return { verdict: 'bug', reason: runEnd.reason || 'unknown failure' };
  }
}

class GeminiBrain {
  name = 'gemini';
  constructor(apiKey, model = 'gemini-2.5-flash-lite') {
    this.apiKey = apiKey;
    this.model = model;
  }
  async ask(prompt) {
    const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${this.model}:generateContent?key=${this.apiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] }),
    });
    if (!r.ok) throw new Error(`gemini ${r.status}: ${(await r.text()).slice(0, 200)}`);
    const j = await r.json();
    return j.candidates?.[0]?.content?.parts?.[0]?.text || '';
  }
  async plan({ url, goal }) {
    const text = await this.ask(
      `You are a QA planner. A non-technical founder gave this goal for their web app at ${url}:\n"""${goal}"""\n` +
      `Break it into 1 to 4 acceptance checks, each independently verifiable in a browser by an AI testing agent that understands plain English.\n` +
      `Return JSON only: [{"id":"ac-1","objective":"...","expect":"..."}]. Each objective must be a single browser flow starting at the URL, phrased as an instruction, ending with what to assert.`
    );
    const m = text.match(/\[[\s\S]*\]/);
    if (!m) throw new Error('planner returned no JSON');
    return JSON.parse(m[0]).slice(0, 4);
  }
  async analyze({ objective, runEnd }) {
    if (runEnd.status === 'passed') return { verdict: 'pass', reason: runEnd.reason || 'objective met' };
    const text = await this.ask(
      `An AI browser-testing agent ran this check: """${objective}"""\n` +
      `It FAILED. Raw result: ${JSON.stringify({ reason: runEnd.reason, summary: runEnd.summary, one_liner: runEnd.one_liner }).slice(0, 1500)}\n` +
      `Decide: is this a real product bug a founder must fix ("bug"), or should the check be rephrased and retried once ("refine")?\n` +
      `Return JSON only: {"verdict":"bug"|"refine","reason":"one plain sentence for a non-technical founder","refinedObjective":"only if refine"}`
    );
    const m = text.match(/\{[\s\S]*\}/);
    if (!m) return { verdict: 'bug', reason: 'unparseable analysis' };
    return JSON.parse(m[0]);
  }
}

function makeBrain() {
  if (process.env.GEMINI_API_KEY) {
    try { return new GeminiBrain(process.env.GEMINI_API_KEY, process.env.GEMINI_MODEL); } catch { /* fall through */ }
  }
  return new HeuristicBrain();
}

module.exports = { makeBrain, HeuristicBrain, GeminiBrain };
