import { beforeEach, describe, expect, it } from 'vitest';
import {
  buildSendStateSnapshot,
  collectSendControlCandidates,
  findSendReadyControl,
  getControlDescriptor,
  isStopControl,
  scoreSendControl,
} from '../../lib/send-readiness.js';

function markVisible(element, { top = 0, left = 0, width = 40, height = 40 } = {}) {
  Object.defineProperty(element, 'getBoundingClientRect', {
    configurable: true,
    value: () => ({
      width,
      height,
      top,
      left,
      right: left + width,
      bottom: top + height,
    }),
  });
}

describe('send readiness helpers', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  it('prefers nearby actionable send control over disabled or distant controls', () => {
    const form = document.createElement('form');
    const input = document.createElement('textarea');
    input.value = 'เขียนโพสต์เกี่ยวกับ AI';
    markVisible(input, { top: 100, left: 100, width: 320, height: 80 });

    const disabled = document.createElement('button');
    disabled.type = 'submit';
    disabled.disabled = true;
    disabled.setAttribute('aria-label', 'Send prompt');
    markVisible(disabled, { top: 110, left: 430, width: 40, height: 40 });

    const actionable = document.createElement('button');
    actionable.type = 'submit';
    actionable.setAttribute('aria-label', 'Send message');
    markVisible(actionable, { top: 150, left: 430, width: 40, height: 40 });

    const distant = document.createElement('button');
    distant.setAttribute('aria-label', 'Send');
    markVisible(distant, { top: 500, left: 900, width: 40, height: 40 });

    form.append(input, disabled, actionable, distant);
    document.body.appendChild(form);

    expect(findSendReadyControl(input, document)).toBe(actionable);
    expect(scoreSendControl(actionable, input, document)).toBeGreaterThan(scoreSendControl(distant, input, document));
  });

  it('ignores stop and microphone controls even when visible', () => {
    const form = document.createElement('form');
    const input = document.createElement('textarea');
    input.value = 'prompt พร้อมส่ง';
    markVisible(input, { top: 100, left: 100, width: 320, height: 80 });

    const stop = document.createElement('button');
    stop.setAttribute('aria-label', 'Stop generating');
    markVisible(stop, { top: 150, left: 420, width: 40, height: 40 });

    const mic = document.createElement('button');
    mic.setAttribute('aria-label', 'Microphone');
    markVisible(mic, { top: 150, left: 470, width: 40, height: 40 });

    form.append(input, stop, mic);
    document.body.appendChild(form);

    expect(isStopControl(stop)).toBe(true);
    expect(findSendReadyControl(input, document)).toBeNull();
  });

  it('reports readiness gap when composer has text but no actionable send control exists', () => {
    const form = document.createElement('form');
    const input = document.createElement('textarea');
    input.value = 'มีข้อความใน composer แล้ว';
    markVisible(input, { top: 40, left: 20, width: 320, height: 80 });

    const disabled = document.createElement('button');
    disabled.type = 'submit';
    disabled.disabled = true;
    disabled.setAttribute('aria-label', 'Send prompt');
    markVisible(disabled, { top: 90, left: 350, width: 40, height: 40 });

    form.append(input, disabled);
    document.body.appendChild(form);

    const snapshot = buildSendStateSnapshot(input, document);
    expect(snapshot.composerHasText).toBe(true);
    expect(snapshot.visibleControlCount).toBe(1);
    expect(snapshot.actionableCount).toBe(0);
    expect(snapshot.readyControl).toBeNull();
  });

  it('detects cold-to-warm progression when send control becomes enabled', () => {
    const form = document.createElement('form');
    const input = document.createElement('textarea');
    input.value = 'prompt บน cold-open';
    markVisible(input, { top: 40, left: 20, width: 320, height: 80 });

    const send = document.createElement('button');
    send.type = 'submit';
    send.disabled = true;
    send.setAttribute('aria-label', 'Send prompt');
    markVisible(send, { top: 90, left: 350, width: 40, height: 40 });

    form.append(input, send);
    document.body.appendChild(form);

    const coldState = buildSendStateSnapshot(input, document);
    expect(coldState.readyControl).toBeNull();

    send.disabled = false;

    const warmState = buildSendStateSnapshot(input, document);
    expect(warmState.readyControl).toBe(send);
    expect(warmState.actionableCount).toBe(1);
  });

  it('deduplicates overlapping send selectors', () => {
    const form = document.createElement('form');
    const input = document.createElement('textarea');
    input.value = 'ข้อความ';
    markVisible(input, { top: 0, left: 0, width: 300, height: 70 });

    const send = document.createElement('button');
    send.type = 'submit';
    send.setAttribute('aria-label', 'Send prompt');
    markVisible(send, { top: 30, left: 320, width: 40, height: 40 });

    form.append(input, send);
    document.body.appendChild(form);

    const candidates = collectSendControlCandidates(input, document);
    expect(candidates).toHaveLength(1);
    expect(getControlDescriptor(send)).toContain('send prompt');
  });
});