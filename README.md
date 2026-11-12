# ProofLoop

**Point it at your app's URL. An agent writes the checks, Kane CLI runs them in a real browser, the agent reads Kane's NDJSON output and iterates until green - or hands you a bug report with proof.**

Built during the [Kane CLI Online Hackathon](https://luma.com/kanecli-online-hackathon) (12-19 Nov 2026) by an AI coding agent. Kane CLI is the only test dependency.

## Who it's for

Non-technical founders who ship with AI coding tools and have no QA. They can't write Playwright. They *can* write "a visitor can sign up and see a welcome message." ProofLoop turns that sentence into verified proof - or a bug report their coding agent can fix.

## The closed loop (what the judges asked to see)

```
founder's plain English
        |
        v
 [agent brain]  plans 1-4 acceptance checks
        |
        v
 kane-cli run "<objective>" --agent --headless      <- real Chrome, real NDJSON
        |
        v
 [agent brain] reads run_end { status, reason, one_liner, test_url }
        |
        +-- passed -> next check
        +-- failed -> bug or bad check? -> rephrase once and re-run Kane
        |
        v
 verdict: GREEN (all checks pass, evidence linked) or BUG FOUND (what broke, in founder language, with Kane's evidence deep-link)
```

The tighter version, straight from the brief: the agent's output triggers the Kane run, Kane's output triggers the agent. No human in the middle.

## Quickstart (one command)

Prereqs once: `npm install -g @testmuai/kane-cli` and `kane-cli login` (free - 10,000 credits at [testmuai.com/register](https://www.testmuai.com/register/)).

```bash
git clone https://github.com/Pritahi/proofloop && cd proofloop
npm start          # zero dependencies - no npm install needed
# open http://localhost:7860
```

Optional: `GEMINI_API_KEY=<free AI Studio key> npm start` upgrades the brain from the built-in heuristic reasoner to Gemini (free tier). Without a key the loop still closes - planning and failure analysis are deterministic.

**Try it in 30 seconds:** the repo ships a demo target at `http://localhost:7860/demo/` (a fake waitlist page).

- Goal: `A visitor can type their email, click Join the waiting list, and see a welcome message.`
- Against `http://localhost:7860/demo/?bug=1` ProofLoop **catches a real bug**: the Join button silently does nothing. You get a failed Kane run, a plain-English explanation, and the evidence link.
- Against `http://localhost:7860/demo/` the same check goes **green**.

## Evidence (all real runs, committed)

`evidence/` holds verbatim NDJSON streams and reports:

| Run | What happened |
| --- | --- |
| `demo/buggy-build-caught/` | Kane clicked Join, no welcome message -> agent analyzed -> **bug report** |
| `demo/fixed-build-green/` | Same check on the fixed build -> **green** |
| `demo/the-internet-login-green/` | Real login flow on the-internet.herokuapp.com -> green |
| `build-time/` | Two bugs Kane+ProofLoop caught in *this project's own server* while it was being built (a directory 404 and a JSON-stringified Buffer), then re-verified after the fix |

Every `run_end` includes `test_url` - a deep link into the TestMu test manager with the full trace.

## What Kane is doing in the flow

Kane CLI is not a summary step. It is the verification layer: every acceptance check runs as `kane-cli run <objective> --agent --headless`, the agent parses Kane's NDJSON (`run_end` events), and the next agent action depends on Kane's verdict. Screenshots and mocks are never used as proof.

## Stack

Node 18+ standard library only (zero npm dependencies), `kane-cli`, optional Gemini free tier for the reasoning brain. Video demo: see submission. Built entirely by an AI agent; verified by Kane CLI at every step - including the two bugs it caught in its own server during the build.
