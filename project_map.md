# Project Map: Xafi

Last updated: 2026-03-19
Project path: /Users/non/dev/opilot/projects/Xafi

## 1) Philosophy
Xafi is a Manifest V3 Chrome Extension for operator-guided content repurposing and affiliate-style posting workflows on X.
The system watches high-attention posts, routes selected source material through browser-automated AI providers without relying on an API, then returns drafts/results into an extension UI where the operator decides what to queue, edit, post, or auto-quote.

Grounded principles in the current snapshot:
- Automation-first, but still operator-visible at every critical step through the Side Panel and Results view.
- DOM automation over official platform APIs, trading speed of iteration for selector fragility.
- Local-first persistence via `chrome.storage.local` for settings, viral finds, queue state, drafts, results, campaign state, trend hints, and auto-quote progress.
- Reliability improvements are focused on long-running session continuity, especially for MV3 service-worker wake/sleep behavior and recovery from stuck AI runtime state.
- Product and topic context are treated as first-class input to prompt generation, so multi-topic campaigns do not collapse into generic summary flow.

## 2) Key Landmarks
Top-level files and their responsibilities:

- `manifest.json`
  - Extension contract for MV3.
  - Declares `background.js` as the service worker and `sidepanel.html` as the primary operator surface.
  - Permissions include `alarms`, `sidePanel`, `storage`, `activeTab`, `tabs`, and `clipboardWrite`.
  - Host permissions cover `x.com`, `twitter.com`, `grok.com`, `gemini.google.com`, and `trends.google.com`.

- `background.js`
  - Runtime coordinator, message bus, and storage authority.
  - Normalizes settings and prompt templates, including built-in prompt modes and product-aware draft shaping.
  - Owns `viralPosts`, `processQueue`, `drafts`, `results`, `googleTrends`, `autoScoutProgress`, `autoQuoteState`, and `campaign` state in storage.
  - Opens/reuses Grok or Gemini tabs, starts queue execution, receives `AI_RESPONSE_READY`, and persists generated output.
  - Drives Auto Quote orchestration with `chrome.alarms`, including next-run and retry alarms for MV3-safe scheduling.
  - Pulls Google Trends RSS, coordinates Full Auto campaign topic execution, and exposes force-stop recovery for stuck AI runs.

- `content_x.js`
  - Runs on X/Twitter and scans timeline/search/explore pages for candidate tweets.
  - Parses view counts, highlights viral posts, and injects the `AI Create Post` action.
  - Handles X compose and quote interactions through DOM automation.
  - Implements Auto Scout with auto mode, manual assist, checkpoint pauses, Top-search enforcement, no-results handling, and topic-aware metadata propagation.

- `content_ai.js`
  - Runs on Grok and Gemini pages.
  - Locates input/send controls heuristically, types prompts with human-like timing, submits, and extracts assistant output.
  - Returns AI output back to the service worker with `requestId` so stale responses can be rejected.

- `sidepanel.html` / `sidepanel.js` / `sidepanel.css`
  - Main operator dashboard.
  - Tabs and views cover Automation, Full Auto, Drafts, Results, Trends, Found posts, Queue, and Settings.
  - Controls Auto Scout query/product context, campaign execution mode, queue actions, prompt mode, rate/typing settings, force-stop recovery, and Auto Quote timing.
  - Reacts to storage changes in real time, including queue status, campaign progress, and Auto Quote countdown/state.

- `results.html` / `results.js` / `results.css`
  - Dedicated Results Library page.
  - Focused on browsing generated results and copy/clear workflows separate from the Side Panel preview.

- `doc/2026-03-19-knowledge-base.md`
  - Grounded runtime snapshot for current architecture, storage keys, provider behavior, and Full Auto campaign model.

- `doc/2026-03-19-full-auto-stability.md`
  - Incident-driven notes for recent Full Auto failures, fixes, and operational guardrails.

- `doc/code_review.md`
  - Grounded review of the implementation, risks, and quality posture.

- `doc/release_readiness.md`
  - Release posture document. Current stance is effectively `usable with caution`.

- `doc/implement_plan.md`
  - Historical implementation intent and execution notes.

## 3) Data Flow
Primary runtime flow:

1. Discovery on X
- `content_x.js` scans feed, explore, or search surfaces, parses visible metrics, and can drive search interaction in campaign mode.
- Tweets that clear the configured threshold are emitted to the service worker as `VIRAL_POST_FOUND` with topic and product metadata when Full Auto is active.

2. State capture and operator surfacing
- `background.js` deduplicates, stores, and timestamps discovered posts in `chrome.storage.local`.
- `sidepanel.js` listens to storage/runtime updates and renders the Found list, campaign progress, and scouting heartbeat.

3. Queue creation and prompt preparation
- The operator or Full Auto campaign moves found posts into `processQueue`.
- `background.js` resolves settings, prompt mode/template, topic/product context, and source content into the generation request.

4. AI execution loop
- `background.js` opens or reuses a Grok or Gemini tab/window and sends the prompt to `content_ai.js`.
- `content_ai.js` types, submits, waits for a stable assistant response, and returns `AI_RESPONSE_READY` tagged with `requestId`.

5. Draft/result persistence
- `background.js` normalizes AI output, rejects stale provider responses, creates draft/result records, and updates queue item status.
- Side Panel and Results Library refresh from storage changes rather than maintaining separate authoritative state.

6. Posting and quote automation
- The operator can manually trigger X posting or enable Auto Quote for drafts with a `sourceUrl`.
- `content_x.js` opens quote/composer surfaces, fills content, clicks post, and performs heuristic success checks.
- `background.js` schedules the next quote cycle through `chrome.alarms` so the flow can continue across MV3 worker suspensions.

Supporting flows:
- Full Auto campaign flow is `Found -> Queue -> Draft -> Quote`, with topic execution and quote distribution modes.
- Auto Scout supports search query normalization, manual step mode, checkpoint pauses, session limits, daily limits, and no-results/topic-skip handling.
- Google Trends feed is used as a lightweight topic signal rather than a hard dependency.
- Auto Quote state is exposed to the UI as a live countdown/status surface.
- Force-stop AI recovery clears stuck in-memory queue state and pauses campaign generation safely.

## 4) Challenges (Known Dragons)
- DOM fragility
  - X, Grok, and Gemini integrations depend on changing selectors, aria labels, menu layouts, and compose flows.

- Service-worker lifecycle complexity
  - MV3 suspension/restart behavior means queue orchestration and Auto Quote continuity must be resilient to partial in-memory loss.

- Split runtime state
  - Some execution context still lives in memory while durable progress lives in `chrome.storage.local`, so reload/crash edges remain a risk.

- AI queue hybrid-state debt
  - `pendingPrompt` and `isProcessingAIQueue` still live in memory while queue truth lives in storage, which is workable but still a major technical debt area.

- Limited verification depth
  - There is still no deterministic automated harness for real browser automation, queue progression, or quote-post verification; live-browser smoke remains mandatory.

- Recovery and observability gaps
  - Error handling and force-stop recovery exist, but there is still no rich UI-facing debug mode or deterministic watchdog for every stuck state.

- Compliance and anti-detection pressure
  - Typing cadence, posting frequency, and automation behavior must stay conservative enough for real platform conditions.

- Monolithic coordinator pressure
  - `background.js` acts as the central authority for many flows at once, which raises refactor risk and makes regressions easier to introduce.

## Database Schema
Not applicable in the current project snapshot.
There is no Prisma schema, migration history, or external database layer.
The effective data model lives in `chrome.storage.local`, centered around:
- `settings`
- `viralPosts`
- `processQueue`
- `drafts`
- `results`
- `googleTrends`
- `autoScoutProgress`
- `autoQuoteState`
- `campaign`

## Current Territory (Quick Signals)
- HEAD is at commit `97047b2` with the theme `Document runtime knowledge and harden auto quote flow`.
- The latest documented release posture is still `usable with caution`, which matches the current DOM-heavy automation profile and lack of deterministic browser verification.
- Runtime knowledge was expanded on 2026-03-19 with dedicated knowledge-base and full-auto stability docs.
- Auto Quote is a first-class reliability concern, backed by `chrome.alarms`, countdown UI, failure summaries, and skip-on-error behavior.
- Full Auto campaign flow now depends on topic-aware metadata propagation across Found, Queue, Draft, and Quote.
- AI provider handling is no longer Grok-only; the live snapshot supports both Grok and Gemini with `requestId`-based stale-response rejection.
- `project_map.md` is currently an untracked local artifact and has been refreshed against source files, docs, and current git history.
