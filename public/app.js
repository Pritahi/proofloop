const $ = (id) => document.getElementById(id);
const timeline = $('timeline'), stream = $('stream');

function addStep(html) {
  const li = document.createElement('li');
  li.innerHTML = html;
  timeline.appendChild(li);
}
function streamLine(text, cls) {
  const div = document.createElement('div');
  if (cls) div.className = cls;
  div.textContent = text;
  stream.appendChild(div);
  stream.scrollTop = stream.scrollHeight;
}
const esc = (s) => String(s ?? '').replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));

function handle(evt) {
  const { type, data } = evt;
  if (type === 'phase') {
    $('phase').textContent = data.phase + (data.brain ? ` (brain: ${data.brain})` : '');
  } else if (type === 'plan') {
    $('phase').textContent = `planned ${data.checks.length} check(s)`;
    data.checks.forEach((c) => addStep(`<b>${esc(c.id)}</b>: ${esc(c.objective)}`));
  } else if (type === 'kane_start') {
    addStep(`Kane runs check <b>${esc(data.check)}</b>${data.attempt > 1 ? ` (attempt ${data.attempt}, rephrased)` : ''}...`);
    streamLine(`\n--- kane-cli run "${data.objective}" --agent --headless`);
  } else if (type === 'kane_event') {
    const e = data.evt;
    if (e.step && e.status === 'running') streamLine(`  [${e.step}] ${e.remark}`);
    else if (e.step && e.status) streamLine(`  [${e.step}] ${e.status}: ${e.remark}`, e.status === 'failed' ? 'failed' : null);
    else if (e.type === 'run_end') streamLine(`run_end: ${e.status} - ${e.one_liner || e.reason || ''}`, e.status === 'passed' ? 'passed' : 'failed');
  } else if (type === 'kane_end') {
    const ok = data.status === 'passed';
    addStep(`Check <b>${esc(data.check)}</b>: <span class="${ok ? 'ok' : 'bad'}">${esc(data.status.toUpperCase())}</span> - ${esc(data.one_liner || '')}${data.test_url ? ` <a href="${esc(data.test_url)}" target="_blank">evidence</a>` : ''}`);
  } else if (type === 'refine') {
    addStep(`Agent read the failure and <b>rephrased the check</b>: ${esc(data.reason)}`);
    $('phase').textContent = 'agent re-prompting from Kane output';
  } else if (type === 'done') {
    showVerdict(data);
  } else if (type === 'error') {
    $('phase').textContent = 'error';
    addStep(`<span class="bad">Error: ${esc(data.message)}</span>`);
    $('run-btn').disabled = false;
  }
}

function showVerdict(r) {
  $('verdict-card').classList.remove('hidden', 'green', 'bug');
  $('verdict-card').classList.add(r.verdict === 'green' ? 'green' : 'bug');
  $('verdict-title').textContent = r.verdict === 'green' ? 'GREEN - Kane proved it works' : 'BUG FOUND - here is the proof';
  $('verdict-summary').textContent = r.summary;
  $('verdict-details').innerHTML = r.results.map((res) => `
    <div class="evidence">
      <b>${esc(res.id)}</b> ${esc(res.objective)}<br>
      Verdict: <b>${esc(res.verdict.toUpperCase())}</b> - ${esc(res.reason)}
      ${res.attempts.map((a) => `<br>Attempt ${a.attempt}: ${esc(a.status)} ${esc(a.one_liner || '')} ${a.test_url ? `<a href="${esc(a.test_url)}" target="_blank">Kane evidence &rarr;</a>` : ''}`).join('')}
    </div>`).join('');
  $('verdict-card').scrollIntoView({ behavior: 'smooth' });
  $('phase').textContent = 'loop closed';
  $('run-btn').disabled = false;
}

$('run-btn').onclick = async () => {
  const url = $('url').value.trim(), goal = $('goal').value.trim();
  if (!url || !goal) return alert('Give me a URL and what should work.');
  $('run-btn').disabled = true;
  timeline.innerHTML = ''; stream.innerHTML = '';
  $('live-card').classList.remove('hidden');
  $('verdict-card').classList.add('hidden');
  $('phase').textContent = 'starting';
  const es = new EventSource('/api/stream');
  es.onmessage = (m) => handle(JSON.parse(m.data));
  const r = await fetch('/api/runs', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ url, goal }) });
  if (!r.ok) {
    const j = await r.json().catch(() => ({}));
    alert(j.error || 'failed to start');
    $('run-btn').disabled = false;
    es.close();
  }
};
$('again-btn').onclick = () => {
  $('verdict-card').classList.add('hidden');
  $('live-card').classList.add('hidden');
  $('input-card').scrollIntoView({ behavior: 'smooth' });
};
