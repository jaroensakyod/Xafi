# 2026-03-19 Full Auto Stability Notes

This document summarizes the latest round of fixes for `Xaffi Auto` after sustained real-world Full Auto usage revealed stalling/looping issues at runtime that were not apparent from normal static review.

## Goals of This Round

Stabilize Full Auto so it can reliably run through the following sequence:

1. Search for posts on X
2. Collect posts into `Found`
3. Send them to `Queue`
4. Generate a `Draft`
5. Enter `Auto Quote`

Additionally, provide the operator with a recovery button when AI state becomes stuck.

## Issues Encountered

### 1. X Opens on Latest Instead of Top

Impact:

- Post ordering does not match operator expectations
- Full Auto appears to be running on a different page than intended

Fix:

- Removed `f=live` from the search URL
- Added logic to verify the search page is not set to `Latest`

## 2. Search Page Opens but Does Not Actually Execute the Search

Impact:

- The URL is loaded but the full X search flow is not triggered
- In some cycles, the search page does not update with the new query

Fix:

- Campaign mode now types the query directly
- Presses Enter before falling back to form submit or direct URL navigation

## 3. Posts Found but Not Saved to Found/Queue with Topic Context

Impact:

- Found entries have no information about which topic the post belongs to
- Queue and Draft entries lack campaign/topic context

Fix:

- Attach `campaignId`, `topicId`, `topic`, `productName`, `productLink` at the time of saving a Found post
- Carry the same data set through to queue/draft/quote

## 4. Posts Found but Not Reaching the Topic's Target Count

Impact:

- The campaign appears to be running but `foundCount` does not reach the target
- Some topics are switched away too early or never revisited

Fix:

- Added per-topic `foundCount` tracking
- Use `foundCount` instead of `generatedCount` during the collect phase
- Adjusted topic switching to align with `round-robin` and `drain-topic` modes

## 5. Stalling or Reload Loop When Moving to the Next Topic

Impact:

- X gets reloaded repeatedly
- The next topic never actually starts
- The campaign appears to be running but makes no progress

Fix:

- Added heartbeat logic in `autoScoutProgress`
- Separated `requestedAt` from `lastUpdated`
- Do not consider scout healthy simply because the background just issued a start command
- Added a guard to prevent `campaign.tick` from re-activating the scout when the current topic is still healthy

## 6. No Results Found or Limit Reached Causing Reload Loop

Impact:

- The system keeps reloading the same topic
- The campaign does not skip topics or stop gracefully

Fix:

- If no results are found consecutively, send `AUTO_SCOUT_NO_RESULTS` back to background
- The topic is marked as skipped/errored and the system moves to the next topic
- If a `session limit` or `daily limit` is hit during the collect phase, the campaign is paused instead of looping

## 7. AI Busy State Gets Stuck, Preventing New Work

Symptoms the operator encounters:

- An alert saying "AI is currently working, please wait for it to finish"
- But in reality, the queue or popup may already be stuck

Fix:

- Added a `FORCE_STOP_AI` command in background
- Added a "⛔ Force Stop AI" button in the side panel
- This command will:
  - Clear `pendingPrompt`
  - Flush the in-memory AI queue
  - Reset `isProcessingAIQueue`
  - Close the AI popup window
  - Mark the currently `processing` queue item as `error`
  - Pause the campaign if stuck in the `generating` phase

## Architecture Summary

This round did not primarily add new features. Instead, it focused on making the Full Auto and AI queue state machines reflect actual runtime behavior more accurately, specifically:

- The collect phase genuinely uses the `Found -> Queue` pipeline
- Topic progress uses counters appropriate to each phase
- The search flow on X does not rely solely on URL navigation
- There is a recovery path for operators when AI becomes stuck

## Remaining Limitations

- X search/results selectors are still fragile to UI changes
- AI providers still rely heavily on DOM
- No automated tests exist for campaign runtime
- The best way to verify results is still through live browser runs

## Recommendations Before Production Use

1. Start testing with a small campaign first, e.g., 2 topics with 1-2 posts each
2. If AI becomes stuck, use "Force Stop AI" before restarting
3. If X changes the search page DOM, immediately re-test `Top` tab navigation, query typing, and no-results behavior