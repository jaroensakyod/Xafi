# Xaffi Auto

Chrome Extension (Manifest V3) for finding viral posts on X, generating drafts via Grok or Gemini through browser automation, and running a Full Auto workflow end-to-end: `Found -> Queue -> Draft -> Quote`.

The current snapshot is built for internal/operator usage and has been hardened through multiple rounds of real-world runtime issues. It should not yet be considered stable against DOM changes by X or AI providers.

## What This Repo Does

- Scan posts on X/Twitter
- Collect posts matching criteria into `Found`
- Send posts to `Queue`
- Open Grok or Gemini to generate drafts without using an API
- Save results as `Drafts` and `Results`
- Post or Quote on X automatically
- Run multi-topic campaigns via the `Full Auto` tab

## Current Feature Set

- AI provider switch between Grok and Gemini
- Full Auto campaign with multiple topics/products
- Topic execution mode: `round-robin` and `drain-topic`
- Quote distribution mode: `sequential-by-product` and `alternate-products`
- Auto Scout with Google Trends helper
- Stateful Auto Quote via `chrome.alarms`
- Auto Quote countdown with minutes + seconds display
- Summary of succeeded/failed/skipped in the Drafts view
- Automatic skip of failed drafts during Auto Quote
- `Force Stop AI` button for recovery of stuck jobs
- Stop-after-N-found for Auto Scout

## Main Files

```text
Xafi/
├── manifest.json
├── background.js
├── content_ai.js
├── content_x.js
├── content_x.css
├── sidepanel.html
├── sidepanel.js
├── sidepanel.css
├── results.html
├── results.js
├── results.css
├── README.md
└── doc/
    ├── 2026-03-19-knowledge-base.md
    ├── 2026-03-19-update.md
    ├── 2026-03-19-full-auto-stability.md
    ├── code_review.md
    ├── implement_plan.md
    └── release_readiness.md
```

## Architecture Summary

### `background.js`

Service worker that controls all central orchestration:

- Settings/state persistence
- AI popup lifecycle
- Queue processing
- Drafts/results persistence
- Campaign orchestration
- Auto Quote scheduling
- Text normalization

### `content_x.js`

Content script on the X/Twitter side:

- Scan tweet cards
- Parse views
- Inject action buttons
- Open quote flow
- Fill compose input
- Auto submit with verification
- Run search/scout behavior

### `content_ai.js`

Content script on the Grok/Gemini side:

- Detect composer
- Type prompt in a human-like manner
- Click send
- Wait for and extract response
- Strip tool-status noise
- Send response back with `requestId`

### `sidepanel.*`

Main operator UI with tabs:

- Automation
- Full Auto
- Drafts
- Results
- Trends
- Found
- Queue
- Settings

## Key Runtime Behavior

### Full Auto

The intended flow is:

1. Select a topic from the campaign
2. Search on X using `Top` results
3. Collect source posts into `Found`
4. Add to `processQueue`
5. Generate draft using the topic's product/productLink
6. Send to Auto Quote according to policy

Hardened behaviors:

- Does not use `Latest` tab
- Types query and presses Enter in the real page
- No-results will skip the topic
- Hitting a limit will pause the campaign instead of endlessly reloading
- Each topic carries metadata all the way through found/queue/draft/quote

### AI Response Safety

Measures added to prevent context contamination:

- `requestId` per prompt
- Reject stale responses
- Strip wrapper text such as `Gemini said`
- Use per-item `productName`/`productLink` instead of relying solely on global state

### Auto Quote

Current capabilities:

- Schedule next run via `chrome.alarms`
- Countdown displayed in the Drafts section
- Displays minutes + seconds
- If a draft fails, it is marked as `post_error` and skipped automatically
- Summary shows how many succeeded, failed, and were skipped
- Shows the most recent failure reason

## Installation

1. Open Chrome at `chrome://extensions/`
2. Enable `Developer mode`
3. Click `Load unpacked`
4. Select this folder
5. Click `Reload` after code updates if permissions or service worker changed

## Typical Usage

### Manual Flow

1. Open an X feed or search page
2. Let the extension scan posts
3. Select posts into `Found` or `Queue`
4. Generate drafts with AI
5. Review drafts in the Drafts tab
6. Click `Post to X` or use Auto Quote

### Full Auto Flow

1. Go to the `Full Auto` tab
2. Name the campaign
3. Add multiple topics with products and links
4. Set target count per topic
5. Choose execution/quote mode
6. Start the campaign
7. Monitor progress in `Found`, `Queue`, `Drafts`, and the campaign monitor

### Recovery Flow

If the AI popup or queue gets stuck:

1. Click `Force Stop AI`
2. Check queue/draft state
3. Resume the run

## Current Limits

- Heavy reliance on the DOM structure of X, Grok, and Gemini
- No automated tests
- `background.js` is large and mixes multiple responsibilities
- AI queue uses both in-memory and storage state
- Google Trends is a best-effort helper
- If X changes its search/composer DOM, selectors or timing may need updates

## Documentation

- `doc/2026-03-19-knowledge-base.md`: Core knowledge base for the current snapshot
- `doc/2026-03-19-update.md`: Changelog for the current implementation round
- `doc/2026-03-19-full-auto-stability.md`: Runtime issues and fixes for Full Auto
- `doc/code_review.md`: Grounded code review
- `doc/release_readiness.md`: Release risk and smoke-test checklist
- `doc/implement_plan.md`: Full Automate Home plan used as the implementation base

## Recommended Next Work

1. Split `background.js` into multiple modules
2. Add a queue watchdog
3. Add a debug mode to the UI
4. Add unit tests for text utilities and prompt builder
5. Run a smoke test after every X or AI provider UI change
