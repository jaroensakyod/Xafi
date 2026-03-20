import { beforeEach, describe, expect, it } from 'vitest';
import {
  collectComposerCandidates,
  composerContainsText,
  findPromptVisibleInput,
  findVisibleComposerInput,
  isWritableComposerInput,
  scoreComposerCandidate,
} from '../../lib/composer-readiness.js';

function markVisible(element, { width = 320, height = 48 } = {}) {
  Object.defineProperty(element, 'getBoundingClientRect', {
    configurable: true,
    value: () => ({
      width,
      height,
      top: 0,
      left: 0,
      right: width,
      bottom: height,
    }),
  });
}

describe('composer readiness helpers', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  it('prefers visible composer over hidden textbox trap', () => {
    const hidden = document.createElement('div');
    hidden.setAttribute('contenteditable', 'true');
    hidden.setAttribute('role', 'textbox');
    hidden.setAttribute('aria-label', 'Ask Gemini hidden');
    hidden.style.display = 'none';

    const richTextarea = document.createElement('rich-textarea');
    const visible = document.createElement('div');
    visible.setAttribute('contenteditable', 'true');
    visible.setAttribute('role', 'textbox');
    visible.setAttribute('aria-label', 'Ask Gemini');
    visible.textContent = '';
    markVisible(visible);

    richTextarea.appendChild(visible);
    document.body.append(hidden, richTextarea);

    expect(findVisibleComposerInput(document)).toBe(visible);
  });

  it('prefers rich-textarea candidate over generic textarea fallback', () => {
    const fallback = document.createElement('textarea');
    fallback.setAttribute('placeholder', 'Generic textarea');
    markVisible(fallback);

    const richTextarea = document.createElement('rich-textarea');
    const preferred = document.createElement('div');
    preferred.setAttribute('contenteditable', 'true');
    preferred.setAttribute('role', 'textbox');
    preferred.setAttribute('aria-label', 'ป้อนความช่วยเหลือจาก Gemini 3');
    markVisible(preferred);
    richTextarea.appendChild(preferred);

    document.body.append(fallback, richTextarea);

    expect(findVisibleComposerInput(document)).toBe(preferred);
    expect(scoreComposerCandidate(preferred, document)).toBeGreaterThan(
      scoreComposerCandidate(fallback, document)
    );
  });

  it('finds prompt only in the visible composer', () => {
    const hidden = document.createElement('textarea');
    hidden.value = 'เขียนโพสต์เกี่ยวกับ AI ให้หน่อยนะ';
    hidden.style.display = 'none';

    const visible = document.createElement('textarea');
    visible.setAttribute('placeholder', 'ป้อนความช่วยเหลือจาก Gemini 3');
    visible.value = 'เขียนโพสต์เกี่ยวกับ AI ให้หน่อยนะ';
    markVisible(visible);

    document.body.append(hidden, visible);

    expect(findPromptVisibleInput('เขียนโพสต์เกี่ยวกับ AI ให้หน่อยนะ', document)).toBe(visible);
  });

  it('returns null when only hidden or readonly candidates exist', () => {
    const hidden = document.createElement('textarea');
    hidden.style.display = 'none';

    const readOnly = document.createElement('textarea');
    readOnly.readOnly = true;
    readOnly.setAttribute('placeholder', 'Ask Gemini');
    markVisible(readOnly);

    document.body.append(hidden, readOnly);

    expect(findVisibleComposerInput(document)).toBeNull();
  });

  it('composerContainsText uses normalized prompt matching', () => {
    const visible = document.createElement('textarea');
    visible.value = 'เขียนโพสต์   เกี่ยวกับ AI\nให้หน่อยนะ';
    markVisible(visible);

    expect(composerContainsText(visible, 'เขียนโพสต์ เกี่ยวกับ AI ให้หน่อยนะ')).toBe(true);
  });

  it('collectComposerCandidates deduplicates overlapping selectors', () => {
    const visible = document.createElement('div');
    visible.setAttribute('contenteditable', 'true');
    visible.setAttribute('role', 'textbox');
    visible.setAttribute('aria-label', 'Ask Gemini');
    markVisible(visible);
    document.body.appendChild(visible);

    const candidates = collectComposerCandidates(document);
    expect(candidates).toHaveLength(1);
  });

  it('writable check rejects disabled and readonly controls', () => {
    const disabled = document.createElement('textarea');
    disabled.disabled = true;

    const readOnly = document.createElement('textarea');
    readOnly.readOnly = true;

    const writable = document.createElement('div');
    writable.setAttribute('contenteditable', 'true');

    expect(isWritableComposerInput(disabled)).toBe(false);
    expect(isWritableComposerInput(readOnly)).toBe(false);
    expect(isWritableComposerInput(writable)).toBe(true);
  });
});