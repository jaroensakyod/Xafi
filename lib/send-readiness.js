import { SEND_BUTTON_SELECTORS, STOP_BUTTON_SELECTORS } from './selectors.js';

export function normalizeUiText(text) {
  return String(text || '')
    .replace(/\s+/g, ' ')
    .trim();
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

export function getComposerText(element) {
  if (!element) return '';
  if (element.getAttribute('contenteditable') !== null || element.getAttribute('role') === 'textbox') {
    return element.innerText || element.textContent || '';
  }
  return element.value || '';
}

export function isStopControl(element, stopSelectors = STOP_BUTTON_SELECTORS) {
  if (!element) return false;

  if (stopSelectors.some((selector) => matchesSelector(element, selector))) {
    return true;
  }

  const descriptor = getControlDescriptor(element);
  return /stop|หยุด|cancel generation|stop generating|stop response/i.test(descriptor);
}

export function getControlDescriptor(element) {
  return normalizeUiText([
    element?.getAttribute?.('aria-label') || '',
    element?.getAttribute?.('title') || '',
    element?.getAttribute?.('mattooltip') || '',
    element?.textContent || '',
    element?.innerHTML || '',
  ].join(' ')).toLowerCase();
}

export function collectSendControlCandidates(input, root = document, selectors = SEND_BUTTON_SELECTORS) {
  const seen = new Set();
  const buttons = [];

  const pushButton = (button) => {
    if (!button || seen.has(button)) return;
    seen.add(button);
    buttons.push(button);
  };

  const form = input?.closest('form');
  if (form) {
    Array.from(form.querySelectorAll('button')).forEach(pushButton);
  }

  const composerRoot = input?.closest('[class*="composer"], [class*="input"], [class*="chat"], [role="group"]') || input?.parentElement;
  if (composerRoot) {
    Array.from(composerRoot.querySelectorAll('button')).forEach(pushButton);
  }

  const providerRoot = input?.closest('form, rich-textarea, .conversation-container, .chat-input-container, body') || root.body || root;
  if (providerRoot?.querySelectorAll) {
    Array.from(providerRoot.querySelectorAll('button')).forEach(pushButton);
  }

  for (const selector of selectors) {
    root.querySelectorAll(selector).forEach(pushButton);
  }

  return buttons;
}

export function scoreSendControl(button, input, doc = document) {
  if (!button || !isElementVisible(button) || isStopControl(button)) {
    return -1000;
  }

  const ariaDisabled = button.getAttribute('aria-disabled');
  if (button.disabled || ariaDisabled === 'true') {
    return -1000;
  }

  const descriptor = getControlDescriptor(button);
  if (/mic|microphone|voice|upload|attach|image|gallery|plus|menu/i.test(descriptor)) {
    return -1000;
  }

  let score = 0;

  if (button.type === 'submit') score += 80;
  if (/send|submit|ส่ง|run|arrow up|paper plane|rocket/i.test(descriptor)) score += 140;
  if (/gemini|prompt|message/i.test(descriptor)) score += 25;
  if (button.closest('message-actions, form, rich-textarea, [class*="composer"], [class*="input"]')) score += 40;
  if (button.querySelector('svg')) score += 10;
  if (button === doc.activeElement) score += 15;

  const sameForm = Boolean(input?.closest('form') && button.closest('form') && input.closest('form') === button.closest('form'));
  if (sameForm) score += 100;

  const inputRect = getRect(input);
  const buttonRect = getRect(button);
  if (inputRect && buttonRect) {
    const deltaX = Math.abs((buttonRect.left + buttonRect.width / 2) - (inputRect.right));
    const deltaY = Math.abs((buttonRect.top + buttonRect.height / 2) - (inputRect.bottom));
    score += Math.max(0, 120 - Math.min(deltaX + deltaY, 120));
  }

  return score;
}

export function findSendReadyControl(input, root = document, selectors = SEND_BUTTON_SELECTORS) {
  const ranked = collectSendControlCandidates(input, root, selectors)
    .map((element) => ({ element, score: scoreSendControl(element, input, root) }))
    .filter((candidate) => candidate.score > -1000)
    .sort((a, b) => b.score - a.score);

  return ranked[0]?.element || null;
}

export function buildSendStateSnapshot(input, root = document, selectors = SEND_BUTTON_SELECTORS, stopSelectors = STOP_BUTTON_SELECTORS) {
  const ranked = collectSendControlCandidates(input, root, selectors)
    .map((element) => ({ element, score: scoreSendControl(element, input, root) }))
    .sort((a, b) => b.score - a.score);

  const readyControl = ranked.find((candidate) => candidate.score > -1000)?.element || null;
  const composerText = normalizeUiText(getComposerText(input));

  return {
    readyControl,
    readyControlDescriptor: readyControl ? getControlDescriptor(readyControl) : '',
    visibleControlCount: ranked.filter((candidate) => isElementVisible(candidate.element)).length,
    actionableCount: ranked.filter((candidate) => candidate.score > -1000).length,
    stopVisible: stopSelectors.some((selector) => {
      const node = root.querySelector(selector);
      return Boolean(node && isElementVisible(node));
    }),
    composerHasText: Boolean(composerText),
    composerTextSample: composerText.slice(0, 48),
  };
}

function matchesSelector(element, selector) {
  if (!element?.matches) return false;

  try {
    return element.matches(selector);
  } catch {
    return false;
  }
}

function getRect(element) {
  if (!element || typeof element.getBoundingClientRect !== 'function') {
    return null;
  }

  return element.getBoundingClientRect();
}