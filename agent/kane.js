// agent/kane.js - spawns Kane CLI in agent mode and parses its NDJSON stream.
// Kane CLI is the only hard dependency of the verification layer:
//   npm install -g @testmuai/kane-cli   (then `kane-cli login` once)
const { spawn } = require('child_process');

/**
 * Run one Kane CLI objective against a URL.
 * onEvent(evt) is called for every parsed NDJSON line (progress + typed events).
 * Resolves with { runEnd, events, exitCode }.
 */
function runKane({ objective, url, maxSteps = 40, timeoutSec = 600, onEvent = () => {} }) {
  return new Promise((resolve, reject) => {
    const args = ['run', objective, '--agent', '--headless', '--max-steps', String(maxSteps), '--timeout', String(timeoutSec)];
    if (url) args.push('--url', url);
    const os = require('os');
    const env = { ...process.env, PATH: `${os.homedir()}/.npm-global/bin:${process.env.PATH}` };
    const bin = process.env.KANE_BIN || 'kane-cli';
    const child = spawn(bin, args, { env });
    let buf = '';
    const events = [];
    let runEnd = null;
    let stderrTail = '';

    child.stdout.on('data', (d) => {
      buf += d.toString();
      let i;
      while ((i = buf.indexOf('\n')) >= 0) {
        const line = buf.slice(0, i).trim();
        buf = buf.slice(i + 1);
        if (!line) continue;
        let evt;
        try { evt = JSON.parse(line); } catch { continue; }
        events.push(evt);
        if (evt.type === 'run_end') runEnd = evt;
        onEvent(evt);
      }
    });
    child.stderr.on('data', (d) => { stderrTail = (stderrTail + d.toString()).slice(-4000); });
    child.on('error', (err) => reject(new Error(`failed to spawn kane-cli: ${err.message}. Is it installed? (npm install -g @testmuai/kane-cli)`)));
    child.on('close', (code) => {
      if (!runEnd && code !== 0 && events.length === 0) {
        return reject(new Error(`kane-cli exited ${code} with no output. stderr: ${stderrTail.slice(-500)}`));
      }
      resolve({ runEnd: runEnd || { type: 'run_end', status: 'failed', reason: 'process ended without run_end' }, events, exitCode: code });
    });
  });
}

module.exports = { runKane };
