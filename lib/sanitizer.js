// =============================================
// Sanitizer / Normalizer Module
// =============================================
// Pure text processing functions extracted from content_ai.js.
// Source of truth for sanitization logic.
// =============================================

const AI_WRAPPER_ONLY_LINE_PATTERNS = [
  /^(?:(?:gemini|grok)\s+(?:said|says|ตอบว่า|บอกว่า)|(?:คำตอบจาก|คำตอบของ)\s*(?:gemini|grok)|assistant)\s*[:：-]?$/i,
  /^(?:นี่คือ(?:โพสต์|คำตอบ)|โพสต์(?:สำหรับ\s*(?:x|twitter|ทวิตเตอร์))?|คำตอบ(?:ด้านล่าง)?|สรุปให้แล้ว)(?:\s+(?:สำหรับ\s*(?:x|twitter|ทวิตเตอร์)|ที่(?:เขียน|สรุป)?ให้))?\s*[:：-]?$/i,
];

const AI_WRAPPER_PREFIX_PATTERNS = [
  /^(?:(?:gemini|grok)\s+(?:said|says|ตอบว่า|บอกว่า)|(?:คำตอบจาก|คำตอบของ)\s*(?:gemini|grok))\s*[:：-]?\s*/i,
  /^(?:นี่คือ(?:โพสต์|คำตอบ)|โพสต์(?:สำหรับ\s*(?:x|twitter|ทวิตเตอร์))?|คำตอบ(?:ด้านล่าง)?|สรุปให้แล้ว)(?:\s+(?:สำหรับ\s*(?:x|twitter|ทวิตเตอร์)|ที่(?:เขียน|สรุป)?ให้))?\s*[:：-]\s*/i,
];

function isAiWrapperOnlyLine(line) {
  const cleaned = String(line || '').trim();
  if (!cleaned) return false;
  return AI_WRAPPER_ONLY_LINE_PATTERNS.some((pattern) => pattern.test(cleaned));
}

function stripAiWrapperLeadIns(text) {
  let current = String(text || '').trim();

  for (let attempt = 0; attempt < 5; attempt += 1) {
    const next = AI_WRAPPER_PREFIX_PATTERNS.reduce(
      (value, pattern) => value.replace(pattern, ''),
      current,
    ).trim();

    if (next === current) break;
    current = next;
  }

  return current;
}

/**
 * Checks if a line is a tool/status indicator (not real content).
 * @param {string} line
 * @returns {boolean}
 */
export function isToolStatusLine(line) {
  if (isAiWrapperOnlyLine(line)) {
    return true;
  }

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

  const cleaned = stripAiWrapperLeadIns(String(text)
    .split('\n')
    .map(line => line.trim())
    .filter(line => line && !isToolStatusLine(line))
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/^(gemini|grok)\s+said\s*/i, '')
    .trim());

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
