// =============================================
// Re-exports from canonical lib/ modules
// =============================================
// Phase 3: These functions are now maintained in lib/.
// This file re-exports them for backward compatibility
// with existing test imports.
// =============================================

export {
  sanitizeComparableText,
  longestCommonPrefix,
  isPromptEcho,
} from '../../lib/prompt-echo.js';

export {
  isToolStatusLine,
  isMostlyUrl,
  sanitizeAIResponseText,
  isSuspiciousAIResponse,
} from '../../lib/sanitizer.js';

export {
  scoreAIResponseCandidate,
  collectResponseCandidates,
  collectResponseElements,
  selectGeminiResponse,
  getLastAIMessage,
} from '../../lib/response-collector.js';
