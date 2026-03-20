// =============================================
// Sanitizer / Normalizer Module
// =============================================
// Pure text processing functions extracted from content_ai.js.
// Source of truth for sanitization logic.
// =============================================

/**
 * Checks if a line is a tool/status indicator (not real content).
 * @param {string} line
 * @returns {boolean}
 */
export function isToolStatusLine(line) {
  return /^(executed code|searching|thinking|analyzing|reasoned for.*|read more|view all|sources?.*|search results?.*|used tools?.*|(gemini|grok)\s+said|assistant)$/i.test(
    String(line || '').trim()
  );
}

/**
 * Checks if text is mostly URLs with little real content.
 * @param {string} text
 * @returns {boolean}
 */
export function isMostlyUrl(text) {
  const trimmed = String(text || '').trim();
  if (!trimmed) return false;
  const withoutUrls = trimmed.replace(/https?:\/\/\S+|www\.\S+/gi, '').trim();
  return withoutUrls.length < 12;
}

export function isUiFollowUpText(text) {
  const cleaned = String(text || '').trim();
  if (!cleaned) return false;

  return /(?:มีอะไรให้ช่วย(?:อีก|เพิ่มเติม)?ไหม|สามารถถาม(?:คำถาม)?(?:อะไร)?ได้เลย|ถาม(?:คำถาม)?(?:อะไร)?ได้เลย|พร้อมช่วย(?:เสมอ)?|anything else|need anything else|how can i help|feel free to ask|ask me anything)/i.test(cleaned);
}

export function isUiChromeText(text) {
  const cleaned = String(text || '').trim();
  if (!cleaned) return false;

  return /(?:chat history|recent chats?|recent activity|saved prompts?|show more|new chat|open sidebar|google ai studio|double-check responses|gemini can make mistakes|draft saved)/i.test(cleaned);
}

/**
 * Cleans raw AI response text by removing tool/status lines and noise.
 * @param {string} text
 * @returns {string}
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
 * @param {string} text
 * @returns {boolean}
 */
export function isSuspiciousAIResponse(text) {
  const cleaned = sanitizeAIResponseText(text);
  if (!cleaned) return true;
  if (isMostlyUrl(cleaned)) return true;
  if (cleaned.length < 18) return true;
  if (isToolStatusLine(cleaned)) return true;
  if (isUiFollowUpText(cleaned)) return true;
  if (isUiChromeText(cleaned)) return true;
  return false;
}
