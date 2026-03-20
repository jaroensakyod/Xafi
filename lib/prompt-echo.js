// =============================================
// Prompt Echo Detection Module
// =============================================
// Pure text comparison functions for detecting when a
// candidate response is just an echo of the original prompt.
// =============================================

/**
 * Normalizes text for comparison: lowercase, collapse whitespace, trim.
 * @param {string} text
 * @returns {string}
 */
export function sanitizeComparableText(text) {
  return String(text || '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

/**
 * Finds the longest common prefix between two strings.
 * @param {string} a
 * @param {string} b
 * @returns {string}
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
 * @param {string} candidateText
 * @param {string} promptText
 * @returns {boolean}
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
