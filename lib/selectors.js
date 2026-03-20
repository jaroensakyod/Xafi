// =============================================
// Shared Selectors (Source of Truth)
// =============================================
// Canonical selector lists used by content_ai.js and tests.
// content_ai.js currently has inline copies; this is the
// authoritative source for Phase 4+ integration.
// =============================================

export const INPUT_SELECTORS = [
  'rich-textarea div[contenteditable="true"]',
  'textarea[aria-label*="Enter a prompt" i]',
  'textarea[aria-label*="Ask Gemini" i]',
  'textarea[placeholder*="Enter a prompt" i]',
  'textarea[placeholder*="Ask Gemini" i]',
  '[contenteditable="true"][aria-label*="Enter a prompt" i]',
  '[contenteditable="true"][aria-label*="Ask Gemini" i]',
  'ms-autosize-textarea textarea',
  'textarea[placeholder]',
  '[contenteditable="true"][role="textbox"]',
  '[contenteditable="true"][data-placeholder]',
  '[contenteditable="true"]',
  'textarea',
  '[role="textbox"]',
];

export const SEND_BUTTON_SELECTORS = [
  'button[type="submit"]',
  'button[aria-label*="Send message" i]',
  'button[aria-label*="Send prompt" i]',
  'button[aria-label*="Run" i]',
  'button[aria-label*="Send" i]',
  'button[aria-label*="send" i]',
  'button[aria-label*="Submit" i]',
  'button[data-test-id*="send"]',
  'button[mattooltip*="Send" i]',
  'button[mattooltip*="ส่ง" i]',
  'button[aria-label*="ส่ง"]',
  'button[data-testid="send-button"]',
  'message-actions button',
  'form button:last-of-type',
];

export const STOP_BUTTON_SELECTORS = [
  'button[aria-label*="Stop generating" i]',
  'button[aria-label*="Stop response" i]',
  'button[aria-label*="Stop" i]',
  'button[mattooltip*="Stop" i]',
  'button[aria-label*="หยุด"]',
];

export const RESPONSE_SELECTORS = [
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
