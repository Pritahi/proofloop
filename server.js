// server.js - zero-dependency Node server: static UI + JSON API + SSE run stream.
// One command to run locally: `npm start` (no npm install needed, no native deps).
const http = require('http');
const fs = require('fs');
const path = require('path');
const { runLoop } = require('./agent/loop');

const PORT = process.env.PORT || 7860;
const PUBLIC = path.join(__dirname, 'public');
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png' };

const jobs = new Map(); // id -> { events: [], listeners: Set<res>, report }

function send(res, code, body, type = 'application/json') {
  res.writeHead(code, { 'Content-Type': type, 'Cache-Control': 'no-store' });
  res.end(typeof body === 'string' || Buffer.isBuffer(body) ? body : JSON.stringify(body));
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let b = '';
    req.on('data', (d) => { b += d; if (b.length > 1e5) req.destroy(); });
    req.on('end', () => { try { resolve(JSON.parse(b || '{}')); } catch (e) { reject(e); } });
    req.on('error', reject);
  });
}

const server = http.createServer(async (req, res) => {
  const u = new URL(req.url, `http://${req.headers.host}`);

  if (u.pathname === '/api/health') {
    return send(res, 200, { ok: true, brain: process.env.GEMINI_API_KEY ? 'gemini' : 'heuristic' });
  }

  if (u.pathname === '/api/runs' && req.method === 'POST') {
    let body;
    try { body = await readBody(req); } catch { return send(res, 400, { error: 'bad json' }); }
    const { url, goal } = body;
    if (!url || !goal || typeof url !== 'string' || typeof goal !== 'string') return send(res, 400, { error: 'url and goal are required' });
    if (!/^https?:\/\//i.test(url)) return send(res, 400, { error: 'url must start with http:// or https://' });
    if (goal.length > 2000) return send(res, 400, { error: 'goal too long' });

    const job = { events: [], listeners: new Set(), report: null };
    jobs.set('current', job);
    const emit = (type, data) => {
      const evt = { type, data, t: Date.now() };
      job.events.push(evt);
      for (const l of job.listeners) l.write(`data: ${JSON.stringify(evt)}\n\n`);
    };
    runLoop({ url: url.trim(), goal: goal.trim(), emit })
      .then((report) => { job.report = report; })
      .catch((err) => emit('error', { message: err.message }))
      .finally(() => { for (const l of job.listeners) l.end(); });
    return send(res, 202, { started: true });
  }

  if (u.pathname === '/api/stream') {
    const job = jobs.get('current');
    res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-store', Connection: 'keep-alive' });
    res.write('\n');
    if (!job) return res.end();
    for (const evt of job.events) res.write(`data: ${JSON.stringify(evt)}\n\n`);
    if (job.report) return res.end();
    job.listeners.add(res);
    req.on('close', () => job.listeners.delete(res));
    return;
  }

  if (u.pathname.startsWith('/api/report/')) {
    const id = u.pathname.split('/').pop().replace(/[^a-zA-Z0-9-]/g, '');
    const p = path.join(__dirname, 'runs', id, 'report.json');
    if (!fs.existsSync(p)) return send(res, 404, { error: 'no such run' });
    return send(res, 200, fs.readFileSync(p, 'utf8'));
  }

  // static
  let fp = path.normalize(path.join(PUBLIC, u.pathname === '/' ? 'index.html' : u.pathname));
  if (!fp.startsWith(PUBLIC)) return send(res, 403, { error: 'nope' });
  if (fs.existsSync(fp) && fs.statSync(fp).isDirectory()) fp = path.join(fp, 'index.html');
  if (!fs.existsSync(fp)) return send(res, 404, { error: 'not found' });
  return send(res, 200, fs.readFileSync(fp), MIME[path.extname(fp)] || 'application/octet-stream');
});

server.listen(PORT, () => console.log(`proofloop listening on http://localhost:${PORT}`));
