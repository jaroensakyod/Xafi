# Full Automate Home Plan

## 1. Goal for This Round
Transform the extension's home page from a dashboard with separate tools into a `Full Automate` page where users configure an entire job set and let the system run continuously.

Three core requirements for this design round:

1. Support multiple topics, each with its own product and link
2. Define how many posts to find/generate per topic and choose between alternating topics or draining one topic before moving to the next
3. Define quote ordering — sequential per product or alternating across products

This document is the pre-implementation plan, grounded in the current project structure built around `background.js`, `content_x.js`, `content_ai.js`, and `sidepanel.*`.

## 2. Problems with the Current Home Page
The current side panel home page is a sequential stack of separate controls: query, product, product link, auto scout, tabs, queue, drafts, and auto quote.

Limitations of the current approach:

- Supports only one product context at a time
- The queue treats items as individual posts, not as a multi-topic plan
- No campaign-level orchestration rules for alternating or draining topics
- The quote flow picks from existing drafts with no clear product distribution policy
- The home page is better suited for operator mode than full automate mode

In summary, the automation engine exists but lacks a `control plane` for end-to-end multi-topic job management.

## 3. New UX Goal
The new home page must function as a `Campaign Builder + Run Control`, not just a settings panel.

Target user experience:

1. User opens the home page
2. Creates multiple topics on a single screen
3. Each topic has its own product and link
4. Specifies a target post count per topic
5. Selects the campaign-level run policy
6. Presses Start — the system queues source discovery, sends to AI, creates drafts, and schedules quotes according to the chosen policy
7. User sees both campaign-level status and per-topic status

## 4. Core Data Concepts
Introduce `campaign` and `topic` data models separate from the existing queue.

### 4.1 Campaign
A campaign represents one full automate run cycle.

Required fields:

- `id`
- `name`
- `status` — e.g. `draft`, `running`, `paused`, `completed`, `error`
- `topicExecutionMode`
- `quoteDistributionMode`
- `createdAt`
- `updatedAt`
- `startedAt`
- `completedAt`
- `activeTopicIndex` — pointer for policies that alternate topics

### 4.2 Topic Item
Each topic is a sub-unit within a campaign.

Required fields:

- `id`
- `topic`
- `productName`
- `productLink`
- `targetPostCount`
- `generatedCount`
- `quotedCount`
- `status` — e.g. `pending`, `running`, `completed`, `error`
- `lastProcessedAt`
- `lastSourceUrl`
- `notes` or `errorMessage`

### 4.3 Execution Queue
Beyond the existing `processQueue`, add an orchestration-level queue that tracks the next action.

Example actions:

- `find-source-posts`
- `generate-draft`
- `enqueue-quote`
- `publish-quote`

Without this separation, the new UI may look better but internal behavior remains overly coupled to the legacy queue.

## 5. New Home Page Structure
The home page should have four main sections on a single screen.

### 5.1 Campaign Header
Displays campaign-level overview data.

- Campaign name
- Campaign status
- Total number of topics
- Combined target post count
- Posts completed so far
- Buttons: `Start`, `Pause`, `Resume`, `Stop`

### 5.2 Topic Builder
The most important section of the new home page.

Each topic row should include these fields:

- `Topic`
- `Product`
- `Link`
- `Target post count`
- Current status
- Delete row button

Required capabilities:

- Add multiple topic rows
- Reorder topics up/down
- Duplicate a topic — useful for reusing the same product with a different target count
- Validate that topics are not empty and that links (if provided) are valid URLs

### 5.3 Automation Rules
Defines the campaign-level policies.

At minimum, two rule groups are needed:

#### A. Topic Execution Mode
Determines how the system cycles through topics.

Required options:

- `round-robin`: Alternates topics one post at a time — e.g. A1 -> B1 -> C1 -> A2
- `drain-topic`: Completes one topic fully before moving on — e.g. A1 -> A2 -> A3 -> B1

#### B. Quote Distribution Mode
Determines how drafts are ordered for quoting.

Required options:

- `sequential-by-product`: Quote all posts from one product before moving to the next
- `alternate-products`: Alternate products/topics to avoid repetitive patterns

### 5.4 Runtime Monitor
Live display of execution progress.

- Which topic is currently running
- What is next in the queue
- How many posts remain per topic
- Drafts created per topic
- Quotes completed per topic
- Most recent error

## 6. Business Rules That Must Be Clearly Defined

### 6.1 Adding Multiple Topics
Each topic is bound to one product to keep prompt and quote context unambiguous.

Recommendation:

- 1 row = 1 topic + 1 product + 1 link
- If the user wants one topic with multiple products, add multiple rows using the same topic

Rationale:

- Cleaner data model
- Simpler prompt builder
- Easier quote distribution control

### 6.2 Defining Target Post Count per Topic
Each topic must have a `targetPostCount`.

Recommended rules:

- Minimum value is 1
- Once the target is met, the topic transitions to `completed`
- If source posts are insufficient, the topic stays in `waiting-source` or `partial`

### 6.3 Alternating Topics vs. Draining One Topic First
This is the core business rule of the campaign.

Clear definitions:

- `round-robin`: Select the next topic that has not reached its target and is not in error
- `drain-topic`: Keep selecting the same topic until its target is met or no source can be found

Edge cases to guard against:

- A single topic error should not halt the entire campaign — the system should skip to the next topic if possible
- The campaign should only close when all topics are either complete or in error

### 6.4 Quote Ordering — Sequential per Product vs. Alternating
This must be defined separately from draft generation rules, because a user may want round-robin generation but sequential quoting.

Clear definitions:

- `sequential-by-product`: Complete quoting for one product/topic before moving to the next
- `alternate-products`: Quote in a round-robin loop across topics — e.g. A quote 1 -> B quote 1 -> C quote 1

Benefits:

- Users get finer control over publishing patterns
- Quote behavior is not forced to mirror generation behavior

## 7. New System Workflow

### Phase A: Setup Campaign
1. User opens the `Full Automate` page
2. Enters a campaign name
3. Adds multiple topics
4. Sets the target post count for each topic
5. Selects the topic execution mode
6. Selects the quote distribution mode
7. Presses Start

### Phase B: Find and Generate
1. System selects the next topic according to `topicExecutionMode`
2. Searches for source posts on X matching the topic
3. Sends context to AI along with the topic's product name and product link
4. Saves the result as a draft tagged with its campaign/topic origin
5. Increments `generatedCount`
6. Evaluates whether the topic has reached its target

### Phase C: Quote Scheduling
1. System picks drafts that are ready for quoting
2. Orders them according to `quoteDistributionMode`
3. Opens the quote composer
4. Fills in the text and submits via the existing flow
5. Updates the topic's `quotedCount`

### Phase D: Completion
A campaign ends when:

- All topics have met both their generation target and quote policy
- The user manually stops it
- Accumulated errors prevent further progress

## 8. Impact on Existing Code
No code changes are made in this round, but to ensure accurate implementation, the scope of impact must be acknowledged — changing the home page is far more than adding a few input fields.

Files expected to be affected:

### 8.1 sidepanel.html
- Redesign the home page with a campaign-oriented layout
- Move away from single `query/product/link` inputs
- Add a topic list builder and rules panel

### 8.2 sidepanel.js
- Shift from single-session controls to a campaign state editor
- Add logic for add/remove/reorder topics
- Add save/load campaign draft support
- Add campaign-level runtime monitoring

### 8.3 background.js
- Add a campaign state machine
- Separate the topic scheduler from the existing AI queue
- Add a quote scheduler aware of `quoteDistributionMode`
- Map drafts/results back to their campaign/topic correctly

### 8.4 content_x.js
- May need to support continuous multi-topic search commands
- May need to bind source selection to topic context more explicitly

### 8.5 Storage Keys
New keys should be added, such as:

- `campaigns`
- `activeCampaignId`
- `campaignRuntime`

These should not be crammed into existing keys like `settings` or `processQueue`.

## 9. Recommended Implementation Plan

### Milestone 1: Data Model Before UI
Goal:

- Define the campaign schema
- Define the topic schema
- Define execution mode and quote mode as clear enums
- Plan migration from the current state without breaking anything

Rationale:

- If UI is built before the data model, rework costs multiply

### Milestone 2: Static Full Automate Page
Goal:

- Redesign the home page with Campaign Header, Topic Builder, Rules, and Runtime Monitor sections
- Not all flows need to work end-to-end yet
- Focus on stable save/load state in storage

### Milestone 3: Topic Scheduler
Goal:

- Implement `round-robin` and `drain-topic` options
- Enable background to select the correct next topic
- Bind generated drafts back to the correct topic

### Milestone 4: Quote Distribution Scheduler
Goal:

- Implement `sequential-by-product` and `alternate-products`
- Enable the quote flow to pull drafts according to the actual policy

### Milestone 5: Runtime Monitoring and Recovery
Goal:

- Show per-topic progress in real time
- Improve resume reliability after service worker sleep
- Display error stage so the user knows exactly where a failure occurred

## 10. Validation Rules to Enforce from Day One

### UI-Side Validation
- At least one topic is required before starting
- Topics must not be empty
- Target post count must be greater than 0
- Links (if provided) must be parseable URLs

### Runtime Validation
- A new campaign must not start if an AI queue is already active without a known origin
- Every created draft must carry a `campaignId` and `topicId`
- The quote queue must not pick drafts from the wrong campaign

## 11. Key Risks

### 11.1 Significantly Increased UI Complexity
Going from a single form to a multi-topic editor — a poor layout will become cluttered fast.

Mitigation:

- Use a table-like card list for readability
- Hide advanced settings inside the rules section

### 11.2 Two Overlapping Schedulers
Both AI generation scheduling and quote distribution scheduling will exist.

Mitigation:

- Separate the `generate` and `quote` state machines
- Do not use a single flag memory to control everything

### 11.3 Recovery After Service Worker Sleep
Over-reliance on in-memory state will make the new campaign system fragile.

Mitigation:

- Persist essential campaign runtime data to storage
- Add a recovery pass when the service worker wakes up

## 12. Out of Scope for This Round
To keep the scope clear, this round does not include:

- A full redesign of the results page
- Advanced analytics or statistics
- Multi-campaign parallel execution
- Complex per-topic prompt template presets

## 13. Definition of Done for the Next Round
The feature is considered minimally usable when all of these are met:

1. The home page supports adding multiple topics
2. Each topic can have its own product and link
3. Target post count can be set per topic
4. `round-robin` or `drain-topic` can be selected
5. `sequential-by-product` or `alternate-products` can be selected
6. Every draft and quote is traceable to its source topic
7. The user can see per-topic progress from the home page

## 14. Decisions Required Before Coding
Three items must be confirmed before starting implementation:

1. Whether one topic binds to exactly one product + one link, or whether a single topic can hold multiple products internally
2. Whether `targetPostCount` refers to the number of drafts created or the number of successfully published quotes
3. Whether the new home page fully replaces the current one, or whether a `Full Automate` tab is added first with the default switch deferred to a later round

## 15. Recommendations
Based on the current codebase, the lowest-risk approach is:

1. Make `Full Automate` the new default home page in the side panel
2. Use the model `1 topic = 1 product = 1 link`
3. Define `targetPostCount` as the number of drafts to be generated
4. Keep `quoteDistributionMode` separate from `topicExecutionMode`

This approach aligns with the stated requirements and builds on the existing architecture without needing to overhaul every flow at once.