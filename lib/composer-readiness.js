import { INPUT_SELECTORS } from './selectors.js';

export function normalizePromptText(text) {
  return String(text || '')
    .replace(/\s+/g, ' ')
    .trim();
}

export function collectComposerCandidates(root = document, selectors = INPUT_SELECTORS) {
  const seen = new Set();
  const results = [];

  for (const selector of selectors) {
    root.querySelectorAll(selector).forEach((element) => {
      if (seen.has(element)) return;
      seen.add(element);
      results.push(element);
    });
  }

  return results;
}

export function isElementVisible(element) {
  if (!element) return false;

  const view = element.ownerDocument?.defaultView;
  const style = view?.getComputedStyle ? view.getComputedStyle(element) : null;
  const rect = typeof element.getBoundingClientRect === 'function'
    ? element.getBoundingClientRect()
    : { width: 0, height: 0 };

  return style?.display !== 'none'
    && style?.visibility !== 'hidden'
    && rect.width > 0
    && rect.height > 0;
}

export function isWritableComposerInput(element) {
  if (!element) return false;
  if (typeof element.disabled === 'boolean' && element.disabled) return false;
  if (typeof element.readOnly === 'boolean' && element.readOnly) return false;

  const contentEditable = element.getAttribute('contenteditable');
  if (contentEditable !== null) {
    return contentEditable !== 'false';
  }

  return element.matches('textarea, input, [role="textbox"]');
}

export function scoreComposerCandidate(element, doc = document) {
  if (!element || !isWritableComposerInput(element) || !isElementVisible(element)) {
    return -1000;
  }

  const descriptor = `${element.getAttribute('aria-label') || ''} ${element.getAttribute('placeholder') || ''} ${element.getAttribute('data-placeholder') || ''}`.toLowerCase();
  let score = 0;

  if (element.matches('rich-textarea div[contenteditable="true"]')) score += 180;
  if (element.closest('rich-textarea')) score += 120;
  if (element.closest('form')) score += 40;
  if (element.matches('[contenteditable="true"]')) score += 35;
  if (element.matches('textarea')) score += 25;
  if (element.getAttribute('role') === 'textbox') score += 20;
  if (/enter a prompt|ask gemini|gemini 3|gemini|ป้อนความช่วยเหลือจาก gemini|เขียนอะไร/i.test(descriptor)) score += 140;
  if (element === doc.activeElement) score += 30;
  if (element.closest('[aria-hidden="true"], [hidden], [inert]')) score -= 500;

  return score;
}

export function findVisibleComposerInput(root = document, selectors = INPUT_SELECTORS) {
  const candidates = collectComposerCandidates(root, selectors)
    .map((element) => ({ element, score: scoreComposerCandidate(element, root) }))
    .filter((candidate) => candidate.score > -1000)
    .sort((a, b) => b.score - a.score);

  return candidates[0]?.element || null;
}

export function composerContainsText(element, promptText) {
  const current = normalizePromptText(getComposerText(element));
  const expected = normalizePromptText(promptText);
  if (!current || !expected) return false;

  const sample = expected.slice(0, Math.min(expected.length, 24));
  return current.includes(sample);
}

export function findPromptVisibleInput(promptText, root = document, selectors = INPUT_SELECTORS) {
  const normalizedPrompt = normalizePromptText(promptText);
  if (!normalizedPrompt) return null;

  const candidates = collectComposerCandidates(root, selectors)
    .map((element) => ({ element, score: scoreComposerCandidate(element, root) }))
    .filter((candidate) => candidate.score > -1000)
    .sort((a, b) => b.score - a.score);

  return candidates.find((candidate) => composerContainsText(candidate.element, normalizedPrompt))?.element || null;
}

function getComposerText(element) {
  if (!element) return '';
  if (element.getAttribute('contenteditable') !== null || element.getAttribute('role') === 'textbox') {
    return element.innerText || element.textContent || '';
  }
  return element.value || '';
}