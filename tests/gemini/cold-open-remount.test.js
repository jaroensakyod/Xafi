import { beforeEach, describe, expect, it } from 'vitest';
import {
  findPromptVisibleInput,
  findReplacementComposer,
} from '../../lib/composer-readiness.js';

function markVisible(element, { width = 320, height = 56 } = {}) {
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

function buildComposer(text = '') {
  const richTextarea = document.createElement('rich-textarea');
  const composer = document.createElement('div');
  composer.setAttribute('contenteditable', 'true');
  composer.setAttribute('role', 'textbox');
  composer.setAttribute('aria-label', 'Ask Gemini');
  composer.textContent = text;
  markVisible(composer);
  richTextarea.appendChild(composer);
  return { richTextarea, composer };
}

describe('cold-open remount proxy behavior', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  it('models a first-attempt prompt disappearing after composer remount', () => {
    const prompt = 'สรุปข่าวน้ำมันโลกให้หน่อย';
    const { richTextarea: firstWrapper, composer: firstComposer } = buildComposer(prompt);
    document.body.appendChild(firstWrapper);

    expect(findPromptVisibleInput(prompt, document)).toBe(firstComposer);

    firstWrapper.remove();

    const { richTextarea: secondWrapper, composer: secondComposer } = buildComposer('');
    document.body.appendChild(secondWrapper);

    expect(findPromptVisibleInput(prompt, document)).toBeNull();
    expect(findReplacementComposer(firstComposer, document)).toBe(secondComposer);
  });

  it('models warm-tab retry success on the replacement composer', () => {
    const prompt = 'สรุปข่าวน้ำมันโลกให้หน่อย';
    const { richTextarea: firstWrapper, composer: firstComposer } = buildComposer(prompt);
    document.body.appendChild(firstWrapper);

    firstWrapper.remove();

    const { richTextarea: secondWrapper, composer: secondComposer } = buildComposer(prompt);
    document.body.appendChild(secondWrapper);

    expect(findReplacementComposer(firstComposer, document)).toBe(secondComposer);
    expect(findPromptVisibleInput(prompt, document)).toBe(secondComposer);
  });
});