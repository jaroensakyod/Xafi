// =============================================
// Response Collector & Scorer Module
// =============================================
// Handles DOM-based response candidate collection, scoring,
// and selection. Depends on sanitizer and prompt-echo modules.
// =============================================

import { sanitizeAIResponseText, isMostlyUrl, isToolStatusLine, isSuspiciousAIResponse } from './sanitizer.js';
import { isPromptEcho } from './prompt-echo.js';
import { RESPONSE_SELECTORS } from './selectors.js';

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
 * @returns {Array<{text: string, index: number}>}
 */
export function collectResponseElements(aiProviderKey = 'gemini', doc = document) {
  const seen = new Set();
  const results = [];

  const addElement = (element) => {
    const text = getElementText(element);
    if (!text || seen.has(text)) return;
    seen.add(text);
    results.push({ text, index: results.length });
  };

  if (aiProviderKey === 'gemini') {
    doc.querySelectorAll('message-content, model-response, .response-content, .markdown, .model-response-text').forEach(addElement);
  }

  for (const selector of RESPONSE_SELECTORS) {
    doc.querySelectorAll(selector).forEach(addElement);
  }

  doc.querySelectorAll('[class*="message"], [class*="Message"], .prose, [class*="markdown"], [class*="Markdown"]').forEach(addElement);

  return results;
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

  // Walk from newest (last in DOM) to oldest
  for (let i = filtered.length - 1; i >= 0; i--) {
    const candidate = filtered[i];
    const clean = sanitizeAIResponseText(candidate.text);
    if (clean && !isSuspiciousAIResponse(candidate.text)) {
      return candidate.text;
    }
  }

  // Fallback: all candidates are suspicious — pick the best-scored one
  const ranked = filtered
    .map(el => ({ raw: el.text, score: scoreAIResponseCandidate(el.text, 'gemini') }))
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
