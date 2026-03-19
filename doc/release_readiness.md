# Release Readiness

This document summarizes the current snapshot's release readiness level and what additional work should be done before pushing or sharing publicly.

## Current Status

Readiness level: `usable with caution`

Meaning:

- Functional for the main workflow
- Suitable for internal use or by someone who understands the system
- Should not be communicated as a stable extension against UI changes from X/Grok

## What Is Ready

- Manifest and permissions are complete for the current flow
- Side panel is functional for real use
- Draft/result persistence is implemented
- Queue persistence is implemented
- Auto Quote has guards to prevent conflicts with the AI queue
- Auto Quote scheduler uses `chrome.alarms`, making it more suitable for MV3 than before
- Side panel has countdown and Auto Quote status reflecting actual state
- Prompt mode and output normalization make drafts more consistently formatted
- Prompt and final text have normalization on the background side
- No error diagnostics from the editor at this time

## Outstanding Technical Debt

### 1. No Automated Tests

Impact:

- Regressions are caught late
- Refactoring `background.js` is risky
- Parser/formatter changes are hard to verify with confidence

### 2. No Separate `.git` in This Folder

Git inspection shows this folder is under a large and very dirty parent repo.

Impact:

- To push this project separately, a dedicated git repo must be created in this folder
- Do not use the parent repo directly if the goal is to upload to a new GitHub repo for this project

### 3. High DOM Change Risk

The system can break from:

- Changes to `data-testid`
- Changes to menu order
- Changes to composer structure
- Changes to aria-label text

### 4. Insufficient Debug Support

When users report:

- "Queued but nothing happens"
- "Grok opened but did not send"
- "Quote opened but did not type"

Currently, debugging still requires going through console logs and code manually.

### 5. No End-to-End Verification Harness

Although `content_x.js` has post verification after clicking submit, the verification is still heuristic-based using DOM/live-region from X, not a deterministic browser test.

## Recommended Actions Before Public Release

1. Add `.gitignore` and set up a separate repo
2. Add watchdog queue timeout for the AI generation flow
3. Add debug stage logging readable from the UI
4. Reduce blocking popup usage in the side panel
5. Add a smoke test checklist before every release
6. Test Auto Quote after `chrome://extensions` reload to confirm the `alarms` permission works as expected

## Smoke Test Checklist

### X Scan

- Can open X and scan tweets
- Tweets exceeding the threshold are highlighted
- The `AI Create Post` button is injected in the correct position

### AI Generation

- Can open the Grok popup
- Can find the input field
- Can type the prompt
- Can send the prompt
- Receives a real response, not a prompt echo

### Queue

- Can add multiple items to the queue
- Starting the queue changes the first item to `processing`
- The next item is processed automatically
- Failed items become `error`
- Completed items remain in the UI as `done`

### Draft and Results

- Drafts are saved
- Results page loads correctly
- Copy function works
- Editing a draft updates state correctly

### Quote Flow

- Can open the source tweet
- Can open the quote composer
- Can insert text into the compose box
- Can auto-submit the post
- After countdown expires, the next cycle continues working

## Recommended Next Milestone

The highest-value next milestone:

- Refactor service worker
- Add queue watchdog
- Add debug mode
- Add unit tests for text utilities

## Snapshot Notes

- If updating from an older snapshot to this round, you must `Reload` the extension to receive the `alarms` permission
- From a grounded review perspective, Auto Quote has clearly improved this round, but it should not be communicated as stable against DOM changes from X

Completing these 4 items before a major release will significantly reduce the project's primary risks.