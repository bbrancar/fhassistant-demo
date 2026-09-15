# FHAssistant — demonstration build

Demo site for the FHAssistant training session: a non-functional sign-in
screen, a landing page listing the six modules, and a working
**Identify Respondents and Key Records Collection** module backed by Claude.

## Pages

- `index.html` — sign-in prop; validates, stores, and transmits nothing.
- `home.html` — landing page. Only the Respondents module is live; the other
  five cards show a "not enabled in this demonstration" notice.
- `respondents.html` + `respondents.js` — the live module: intake form →
  streamed respondent/records report → one-click draft records-request emails
  to public agencies → free-form follow-up questions, all in one conversation.

## Demo setup (required once per presenting browser)

The module calls the Claude API directly from the presenter's browser — there
is no backend. Before the session, open the Respondents module, click
**Demo setup** (top right), and paste an Anthropic API key. The key is kept in
that browser's localStorage only; it is never committed to this repository or
sent to the page's host.

Recommended: create a dedicated API key in the Anthropic Console with a low
monthly spend limit for the training, and revoke it afterward.

Model: `claude-opus-5` (see the top of `respondents.js`). Each report run
costs on the order of a few cents. `effort` is set to `"medium"` for snappy
live responses; raise it to `"high"` for deeper reports. Server-side refusal
fallbacks are enabled so a safety-classifier decline re-routes automatically
instead of stalling the demo.

## Rehearsal checklist

1. Open the site → sign in with anything → Respondents module.
2. Demo setup → paste key → **Load sample case** → **Run respondent report**.
3. Click an agency chip to generate a draft records-request email.
4. Keep a PDF of a successful run as a fallback for the live session.

No build step; host on GitHub Pages or any static host.
