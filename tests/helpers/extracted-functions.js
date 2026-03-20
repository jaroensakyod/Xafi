// =============================================
// Characterization Extraction from content_ai.js
// =============================================
// These are EXACT COPIES of pure/near-pure functions from the
// content_ai.js IIFE, extracted here for characterization testing.
//
// PURPOSE: Test what the rolled-back baseline code ACTUALLY does,
// without modifying production code.
//
// WARNING: If content_ai.js changes, these copies may drift.
// Phase 3 will replace this with proper module extraction.
//
// Source commit: d02428c (rollback baseline)
// =============================================

/**
 * Normalizes text for comparison.
 * Source: content_ai.js sanitizeComparableText()
 */
export function sanitizeComparableText(text) {
  return String(text || '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

/**
 * Finds the longest common prefix between two strings.
 * Source: content_ai.js longestCommonPrefix()
 */
export function longestCommonPrefix(a, b) {
  const max = Math.min(a.length, b.length);
  let index = 0;
  while (index < max && a[index] === b[index]) {
    index += 1;
  }
  return a.slice(0, index);
}

/**
 * Checks if a candidate response text is just an echo of the prompt.
 * Source: content_ai.js isPromptEcho()
 */
export function isPromptEcho(candidateText, promptText) {
  const candidate = sanitizeComparableText(candidateText);
  const prompt = sanitizeComparableText(promptText);

  if (!candidate || !prompt) return false;

  if (candidate === prompt) return true;
  if (candidate.startsWith(prompt.slice(0, Math.min(prompt.length, 80)))) return true;
  if (prompt.startsWith(candidate) && candidate.length > 60) return true;

  const overlap = longestCommonPrefix(candidate, prompt).length;
  return overlap >= Math.min(120, Math.floor(prompt.length * 0.6));
}

/**
 * Checks if a line is a tool/status indicator (not real content).
 * Source: content_ai.js isToolStatusLine()
 */
export function isToolStatusLine(line) {
  return /^(executed code|searching|thinking|analyzing|reasoned for.*|read more|view all|sources?.*|search results?.*|used tools?.*|(gemini|grok)\s+said|assistant)$/i.test(String(line || '').trim());
}

/**
 * Checks if text is mostly URLs with little real content.
 * Source: content_ai.js isMostlyUrl()
 */
export function isMostlyUrl(text) {
  const trimmed = String(text || '').trim();
  if (!trimmed) return false;

  const withoutUrls = trimmed.replace(/https?:\/\/\S+|www\.\S+/gi, '').trim();
  return withoutUrls.length < 12;
}

/**
 * Cleans raw AI response text by removing tool/status lines and noise.
 * Source: content_ai.js sanitizeAIResponseText()
 */
export function sanitizeAIResponseText(text) {
  if (!text) return '';

  const cleaned = String(text)
    .split('\n')
    .map(line => line.trim())
    .filter(line => line && !isToolStatusLine(line))
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/^(gemini|grok)\s+said\s*/i, '')
    .trim();

  if (!cleaned || isMostlyUrl(cleaned) || isToolStatusLine(cleaned)) {
    return '';
  }

  if (/google ai studio|double-check responses|gemini can make mistakes|draft saved/i.test(cleaned)) {
    return '';
  }

  return cleaned;
}

/**
 * Checks if a response looks suspicious (too short, URL-only, tool noise).
 * Source: content_ai.js isSuspiciousAIResponse()
 */
export function isSuspiciousAIResponse(text) {
  const cleaned = sanitizeAIResponseText(text);
  if (!cleaned) return true;

  if (isMostlyUrl(cleaned)) return true;
  if (cleaned.length < 18) return true;
  if (isToolStatusLine(cleaned)) return true;

  return false;
}

/**
 * Scores an AI response candidate for ranking.
 * Source: content_ai.js scoreAIResponseCandidate()
 * @param {string} text - raw candidate text
 * @param {string} aiProviderKey - 'gemini' or 'grok'
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

// =============================================
// DOM-dependent functions (require document)
// =============================================

/** Response element selectors (from content_ai.js RESPONSE_SELECTORS) */
const RESPONSE_SELECTORS = [
  '.conversation-container model-response',
  '.conversation-container .response-content',
  '.conversation-container .markdown',
  'message-content .markdown',
  'message-content',
  'model-response',
  '.model-response-text',
  '[class*="response-content"]',
  '[class*="model-response"]',
  '[data-testid="message-content"]',
  '.message-content',
  '.markdown-content',
  '[class*="message"][class*="assistant"]',
  '[class*="response"]',
  '[role="article"]',
];

/**
 * Collects all response candidate texts from the DOM.
 * Source: content_ai.js collectResponseCandidates()
 *
 * NOTE: Production code uses element.innerText. In jsdom, innerText may not
 * work on custom elements (no layout engine), so we fall back to textContent.
 * This is a known characterization gap: innerText respects CSS visibility while
 * textContent does not. For fixture-based tests this is acceptable.
 *
 * @param {string} aiProviderKey - 'gemini' or 'grok'
 * @param {Document} doc - document to query (defaults to global)
 */
function getElementText(element) {
  return (element.innerText || element.textContent || '').trim();
}

export function collectResponseCandidates(aiProviderKey = 'gemini', doc = document) {
  const texts = [];

  if (aiProviderKey === 'gemini') {
    doc.querySelectorAll('message-content, model-response, .response-content, .markdown, .model-response-text').forEach((element) => {
      const text = getElementText(element);
      if (text) texts.push(text);
    });
  }

  for (const selector of RESPONSE_SELECTORS) {
    doc.querySelectorAll(selector).forEach((element) => {
      const text = getElementText(element);
      if (text) texts.push(text);
    });
  }

  doc.querySelectorAll('[class*="message"], [class*="Message"], .prose, [class*="markdown"], [class*="Markdown"]').forEach((element) => {
    const text = getElementText(element);
    if (text) texts.push(text);
  });

  return Array.from(new Set(texts));
}

/**
 * Selects the best AI response from DOM candidates.
 * Source: content_ai.js getLastAIMessage()
 * @param {string} promptText - the original prompt
 * @param {Set<string>} baselineCandidates - texts to exclude (pre-existing)
 * @param {string} aiProviderKey - 'gemini' or 'grok'
 * @param {Document} doc - document to query
 */
export function getLastAIMessage(promptText = '', baselineCandidates = new Set(), aiProviderKey = 'gemini', doc = document) {
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
