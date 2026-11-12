// agent/loop.js - the closed loop the hackathon is scored on:
//   plan -> Kane runs -> agent reads NDJSON -> agent acts -> Kane re-runs -> verdict
const fs = require('fs');
const path = require('path');
const { runKane } = require('./kane');
const { makeBrain } = require('./brain');

const RUNS_DIR = path.join(__dirname, '..', 'runs');

/**
 * Run the full agent loop for one job.
 * emit(type, data) streams progress to the UI.
 */
async function runLoop({ url, goal, emit }) {
  const brain = makeBrain();
  const id = `run-${Date.now()}`;
  const dir = path.join(RUNS_DIR, id);
  fs.mkdirSync(dir, { recursive: true });

  emit('phase', { phase: 'planning', brain: brain.name });
  const checks = await brain.plan({ url, goal });
  emit('plan', { checks });

  const results = [];
  for (const check of checks) {
    let objective = check.objective;
    let attempt = 0;
    let final = null;
    const attempts = [];
    while (attempt < 2) {
      attempt++;
      emit('kane_start', { check: check.id, attempt, objective });
      const eventsPath = path.join(dir, `${check.id}-attempt-${attempt}.ndjson`);
      const evtFile = fs.createWriteStream(eventsPath);
      const { runEnd, exitCode } = await runKane({
        objective, url, timeoutSec: 480,
        onEvent: (evt) => { evtFile.write(JSON.stringify(evt) + '\n'); emit('kane_event', { check: check.id, attempt, evt }); },
      });
      evtFile.end();
      attempts.push({ attempt, objective, runEnd, exitCode });
      emit('kane_end', { check: check.id, attempt, status: runEnd.status, one_liner: runEnd.one_liner, test_url: runEnd.test_url || null, credits: runEnd.credits });

      if (runEnd.status === 'passed') { final = { verdict: 'pass', reason: runEnd.reason || 'objective met' }; break; }

      emit('phase', { phase: 'analyzing', check: check.id, attempt });
      const analysis = await brain.analyze({ objective, runEnd });
      if (analysis.verdict === 'refine' && analysis.refinedObjective && attempt < 2) {
        emit('refine', { check: check.id, from: objective, to: analysis.refinedObjective, reason: analysis.reason });
        objective = analysis.refinedObjective;
        continue;
      }
      final = { verdict: 'bug', reason: analysis.reason, evidence: analysis.evidence || { one_liner: runEnd.one_liner, test_url: runEnd.test_url || null } };
      break;
    }
    results.push({ check, attempts, final });
    if (final.verdict === 'bug') break; // fail fast: a founder wants the first real bug, not a queue of them
  }

  const passed = results.filter((r) => r.final.verdict === 'pass').length;
  const bugs = results.filter((r) => r.final.verdict === 'bug');
  const verdict = bugs.length === 0 ? 'green' : 'bug_found';
  const report = {
    id, url, goal, brain: brain.name, verdict,
    summary: verdict === 'green'
      ? `All ${passed} check${passed === 1 ? '' : 's'} pass. Kane verified the flow end to end.`
      : `Kane found a real problem: ${bugs[0].final.reason}`,
    results: results.map((r) => ({
      id: r.check.id, objective: r.check.objective, verdict: r.final.verdict, reason: r.final.reason,
      attempts: r.attempts.map((a) => ({ attempt: a.attempt, status: a.runEnd.status, one_liner: a.runEnd.one_liner, test_url: a.runEnd.test_url || null })),
      evidence: r.final.evidence || null,
    })),
    finishedAt: new Date().toISOString(),
  };
  fs.writeFileSync(path.join(dir, 'report.json'), JSON.stringify(report, null, 2));
  emit('done', report);
  return report;
}

module.exports = { runLoop };
