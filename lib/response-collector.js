// =============================================
// Response Collector & Scorer Module
// =============================================
// Handles DOM-based response candidate collection, scoring,
// and selection. Depends on sanitizer and prompt-echo modules.
// =============================================

import {
  sanitizeAIResponseText,
  isMostlyUrl,
  isToolStatusLine,
  isSuspiciousAIResponse,
  isUiFollowUpText,
  isUiChromeText,
} from './sanitizer.js';
import { isPromptEcho } from './prompt-echo.js';
import { RESPONSE_SELECTORS } from './selectors.js';

const GEMINI_ACTIVE_ROOT_SELECTORS = [
  '.conversation-container',
  '[data-testid*="conversation"]',
  '[class*="conversation"][class*="container"]',
  '[class*="conversation"]',
];

const GEMINI_ACTIVE_RESPONSE_SELECTORS = [
  'model-response .markdown',
  'message-content .markdown',
  '.model-response-text',
  '.message-content',
  '.markdown-content',
  '[data-testid="message-content"]',
  'message-content',
  'model-response',
  '[role="article"]',
];

const GEMINI_FALLBACK_RESPONSE_SELECTORS = [
  'model-response',
  'message-content',
  '.model-response-text',
  '.message-content',
  '.markdown-content',
  '[data-testid="message-content"]',
  '[role="article"]',
];

/**
 * Scores an AI response candidate for ranking.
 * @param {string} text - raw candidate text
 * @param {string} aiProviderKey - 'gemini' or 'grok'
 * @returns {number}
 */
export function scoreAIResponseCandidate(text, aiProviderKey = 'gemini') {
  const clean = sanitizeAIResponseText(text);
  if (!clean) return -1000;

  let score = 0;
  score += Math.min(clean.length, 400);

  if (/[ก-๙]/.test(clean)) score += 120;
  if (/\n/.test(clean)) score += 30;
  if (/^[-•]/m.test(clean)) score += 25;
  if (aiProviderKey === 'gemini' && /\n/.test(clean)) score += 40;
  if (isMostlyUrl(clean)) score -= 300;
  if (/executed code|searching|thinking|analyzing|read more|sources?|search results?|used tools?|reasoned for|google ai studio|gemini can make mistakes|draft saved/i.test(text)) score -= 500;
  if (isUiFollowUpText(clean)) score -= 450;
  if (isUiChromeText(clean)) score -= 450;

  return score;
}

/**
 * Gets text from an element, falling back to textContent for jsdom.
 * @param {Element} element
 * @returns {string}
 */
function getElementText(element) {
  return (element.innerText || element.textContent || '').trim();
}

/**
 * Collects response elements from the DOM with their text and position.
 * Returns elements in DOM order (first = oldest, last = newest).
 * @param {string} aiProviderKey - 'gemini' or 'grok'
 * @param {Document} doc
 * @returns {Array<{text: string, index: number, element: Element, selector: string, source: string, surfaceRank: number, isLeaf: boolean, documentOrder: number}>}
 */
export function collectResponseElements(aiProviderKey = 'gemini', doc = document) {
  if (aiProviderKey === 'gemini') {
    const activeRoot = findGeminiActiveConversationRoot(doc);
    if (activeRoot) {
      const rootedCandidates = collectCandidateElementsFromRoot(
        activeRoot,
        GEMINI_ACTIVE_RESPONSE_SELECTORS,
        {
          source: 'active-conversation',
          surfaceRank: 300,
        }
      );

      if (rootedCandidates.length) {
        return rootedCandidates;
      }
    }

    return collectCandidateElementsFromRoot(
      doc,
      GEMINI_FALLBACK_RESPONSE_SELECTORS,
      {
        source: 'document-fallback',
        surfaceRank: 100,
      }
    );
  }

  return collectCandidateElementsFromRoot(
    doc,
    [
      ...RESPONSE_SELECTORS,
      '[class*="message"]',
      '[class*="Message"]',
      '.prose',
      '[class*="markdown"]',
      '[class*="Markdown"]',
    ],
    {
      source: 'document',
      surfaceRank: 100,
    }
  );
}

/**
 * Collects all response candidate texts from the DOM.
 * @param {string} aiProviderKey - 'gemini' or 'grok'
 * @param {Document} doc - document to query
 * @returns {string[]}
 */
export function collectResponseCandidates(aiProviderKey = 'gemini', doc = document) {
  return collectResponseElements(aiProviderKey, doc).map(el => el.text);
}

/**
 * Selects the best Gemini response using position-first, score-second logic.
 *
 * Strategy: Walk backwards from the LAST response node in DOM order.
 * Return the first (newest) candidate that has valid, non-suspicious content.
 * Only fall back to score-based ranking if all positional candidates are
 * suspicious or empty.
 *
 * This fixes the KNOWN BUG where an intermediate block with higher score
 * outranked the actual final answer.
 *
 * @param {Array<{text: string, index: number}>} elements
 * @param {string} promptText
 * @param {Set<string>} baselineCandidates
 * @returns {string|null}
 */
export function selectGeminiResponse(elements, promptText = '', baselineCandidates = new Set()) {
  const filtered = elements
    .filter(el => !baselineCandidates.has(el.text))
    .filter(el => !isPromptEcho(el.text, promptText));

  if (!filtered.length) return null;

  const viable = filtered.filter((candidate) => {
    const clean = sanitizeAIResponseText(candidate.text);
    return clean && !isSuspiciousAIResponse(candidate.text);
  });

  if (viable.length) {
    const bestSurfaceRank = Math.max(...viable.map(candidate => candidate.surfaceRank || 0));
    const bestSurfaceCandidates = viable.filter(candidate => (candidate.surfaceRank || 0) === bestSurfaceRank);
    const preferredCandidates = bestSurfaceCandidates.some(candidate => candidate.isLeaf)
      ? bestSurfaceCandidates.filter(candidate => candidate.isLeaf)
      : bestSurfaceCandidates;

    return preferredCandidates[preferredCandidates.length - 1]?.text || null;
  }

  const ranked = filtered
    .map(el => ({
      raw: el.text,
      score: scoreAIResponseCandidate(el.text, 'gemini')
        + (el.surfaceRank || 0)
        + (el.isLeaf ? 40 : 0),
    }))
    .filter(el => el.score > -1000)
    .sort((a, b) => b.score - a.score);

  return ranked[0]?.raw || null;
}

/**
 * Selects the best AI response from DOM candidates.
 *
 * For Gemini: uses position-first selection (last valid response node wins).
 * For Grok/other: uses legacy score-based ranking.
 *
 * @param {string} promptText
 * @param {Set<string>} baselineCandidates - texts to exclude (pre-existing)
 * @param {string} aiProviderKey
 * @param {Document} doc
 * @returns {string|null}
 */
export function getLastAIMessage(promptText = '', baselineCandidates = new Set(), aiProviderKey = 'gemini', doc = document) {
  if (aiProviderKey === 'gemini') {
    const elements = collectResponseElements(aiProviderKey, doc);
    return selectGeminiResponse(elements, promptText, baselineCandidates);
  }

  // Legacy score-based path for Grok/other providers
  const candidates = collectResponseCandidates(aiProviderKey, doc)
    .filter(text => !baselineCandidates.has(text))
    .filter(text => !isPromptEcho(text, promptText));

  if (!candidates.length) return null;

  const ranked = candidates
    .map(text => ({
      raw: text,
      clean: sanitizeAIResponseText(text),
      score: scoreAIResponseCandidate(text, aiProviderKey),
    }))
    .sort((a, b) => b.score - a.score);

  return ranked[0]?.raw || null;
}

function findGeminiActiveConversationRoot(doc) {
  const seeds = Array.from(
    doc.querySelectorAll('model-response, message-content, .model-response-text, .message-content, .markdown-content, [data-testid="message-content"]')
  ).filter((element) => Boolean(getElementText(element)));

  const latestSeed = seeds.at(-1);
  if (!latestSeed) return null;

  for (const selector of GEMINI_ACTIVE_ROOT_SELECTORS) {
    const root = latestSeed.closest(selector);
    if (root && root.querySelector('model-response, message-content')) {
      return root;
    }
  }

  const modelResponse = latestSeed.closest('model-response');
  if (modelResponse?.parentElement) {
    return modelResponse.parentElement;
  }

  return null;
}

function collectCandidateElementsFromRoot(root, selectors, { source, surfaceRank }) {
  const doc = root.nodeType === 9 ? root : root.ownerDocument;
  const candidatesByText = new Map();
  let discoveryOrder = 0;

  for (const selector of selectors) {
    root.querySelectorAll(selector).forEach((element) => {
      const text = getElementText(element);
      if (!text) return;

      const candidate = {
        text,
        element,
        selector,
        source,
        surfaceRank,
        isLeaf: isLeafResponseElement(element),
        discoveryOrder,
      };
      discoveryOrder += 1;

      const existing = candidatesByText.get(text);
      if (!existing || isPreferredDuplicateCandidate(candidate, existing)) {
        candidatesByText.set(text, candidate);
      }
    });
  }

  return finalizeCandidates(candidatesByText, doc);
}

function isPreferredDuplicateCandidate(candidate, existing) {
  if ((candidate.surfaceRank || 0) !== (existing.surfaceRank || 0)) {
    return (candidate.surfaceRank || 0) > (existing.surfaceRank || 0);
  }

  if (Boolean(candidate.isLeaf) !== Boolean(existing.isLeaf)) {
    return Boolean(candidate.isLeaf);
  }

  return candidate.discoveryOrder < existing.discoveryOrder;
}

function finalizeCandidates(candidatesByText, doc) {
  const orderMap = new Map(
    Array.from(doc.querySelectorAll('*')).map((element, index) => [element, index])
  );

  return Array.from(candidatesByText.values())
    .sort((a, b) => (orderMap.get(a.element) ?? 0) - (orderMap.get(b.element) ?? 0))
    .map((candidate, index) => ({
      ...candidate,
      documentOrder: orderMap.get(candidate.element) ?? index,
      index,
    }));
}

function isLeafResponseElement(element) {
  if (!element?.matches) return true;
  if (element.matches('.markdown, .model-response-text, .markdown-content')) return true;

  if (element.matches('message-content, .message-content, [data-testid="message-content"]')) {
    return !element.querySelector('.markdown, .model-response-text, .markdown-content');
  }

  return !element.querySelector('model-response, message-content, .model-response-text, .message-content, .markdown, .markdown-content, [data-testid="message-content"]');
}
