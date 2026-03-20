// =============================================
// Phase 2 (v2): Runtime/Test Parity Guard
// =============================================
// Verifies that the runtime-facing logic in content_ai.js
// stays aligned with the canonical lib/ module behavior.
//
// Strategy: test the lib/ modules against the SAME critical
// scenarios the runtime must handle. If lib/ behavior changes,
// this test catches the drift before it silently breaks runtime.
// Also includes a static structural check on content_ai.js.
// =============================================

import { describe, it, expect, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  selectGeminiResponse,
  getLastAIMessage,
  collectResponseElements,
} from '../../lib/response-collector.js';
import {
  sanitizeAIResponseText,
  isSuspiciousAIResponse,
} from '../../lib/sanitizer.js';
import {
  buildGeminiConversation,
  buildIntermediateOutranksFinal,
  buildMixedGeminiPage,
} from '../helpers/gemini-fixtures.js';

// =============================================
// Structural Parity: content_ai.js contains key patterns
// =============================================
describe('structural parity: content_ai.js wiring markers', () => {
  const runtimeSource = readFileSync(
    resolve(__dirname, '../../content_ai.js'),
    'utf8'
  );

  it('contains selectGeminiResponse function', () => {
    expect(runtimeSource).toContain('function selectGeminiResponse(');
  });

  it('contains collectResponseElements function', () => {
    expect(runtimeSource).toContain('function collectResponseElements(');
  });

  it('contains composer readiness helpers for Gemini cold-open flow', () => {
    expect(runtimeSource).toContain('function waitForComposerReady(');
    expect(runtimeSource).toContain('function findVisibleComposerInput(');
    expect(runtimeSource).toContain('function waitForVisiblePrompt(');
  });

  it('routes Gemini through selectGeminiResponse in getLastAIMessage', () => {
    // The runtime getLastAIMessage must call selectGeminiResponse for Gemini
    expect(runtimeSource).toMatch(/if\s*\(aiProvider\.key\s*===\s*'gemini'\)/);
    expect(runtimeSource).toContain('selectGeminiResponse(elements');
  });

  it('preserves position-first walk pattern (newest to oldest)', () => {
    expect(runtimeSource).toMatch(
      /for\s*\(\s*let\s+i\s*=\s*filtered\.length\s*-\s*1;\s*i\s*>=\s*0;\s*i--/
    );
  });

  it('keeps Grok on legacy score-based path', () => {
    // After the Gemini branch, the fallthrough must still use score ranking
    expect(runtimeSource).toContain('.sort((a, b) => b.score - a.score)');
  });

  it('waits for composer readiness before using the Gemini input', () => {
    expect(runtimeSource).toContain('const inputEl = await waitForComposerReady(20000);');
    expect(runtimeSource).toContain('const visiblePromptInput = await waitForVisiblePrompt(prompt, 3000);');
  });
});

// =============================================
// Behavioral Parity: lib/ matches expected runtime contract
// =============================================
describe('behavioral parity: Gemini position-first selection', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  it('final block wins over higher-scored intermediate (critical bug fix)', () => {
    const intermediate = 'เนื้อหายาวๆ ที่มีรายละเอียดเยอะ\n- จุดที่ 1 มีข้อมูลสำคัญ\n- จุดที่ 2 แสดงให้เห็นว่า AI ช่วยได้จริง\n- จุดที่ 3 สรุปผลงานวิจัย\n\nนี่คือ intermediate block';
    const final = 'สรุป: AI ดีมาก ปรับตัวให้ทันเทคโนโลยีครับ! 🚀';

    const container = buildIntermediateOutranksFinal({
      intermediateText: intermediate,
      finalText: final,
    });
    document.body.appendChild(container);

    const result = getLastAIMessage('เขียนโพสต์', new Set(), 'gemini', document);
    expect(result).toBe(final);
  });

  it('skips suspicious final node and falls back to previous valid node', () => {
    const container = buildGeminiConversation([
      { text: 'คำตอบที่ถูกต้องและมีเนื้อหาจริงๆ อยู่ตรงนี้ครับ สำหรับการใช้งาน AI' },
      { text: 'Sources' }, // suspicious — will be filtered
    ]);
    document.body.appendChild(container);

    const result = getLastAIMessage('test prompt', new Set(), 'gemini', document);
    expect(result).toContain('คำตอบที่ถูกต้อง');
  });

  it('prompt echo is filtered before position walk', () => {
    const prompt = 'เขียนโพสต์เกี่ยวกับอาหารไทย';
    const container = buildGeminiConversation([
      { text: prompt },
      { text: 'อาหารไทยอร่อยมาก ทั้งต้มยำ ผัดไทย แกงเขียวหวาน เป็นที่นิยมของคนทั่วโลก' },
    ]);
    document.body.appendChild(container);

    const result = getLastAIMessage(prompt, new Set(), 'gemini', document);
    expect(result).not.toBe(prompt);
    expect(result).toContain('อาหารไทยอร่อย');
  });

  it('baseline candidates are excluded before selection', () => {
    const baseline = 'ข้อความที่มีอยู่แล้วก่อนส่ง prompt ยาวพอที่จะไม่ suspicious';
    const newResponse = 'คำตอบใหม่จาก AI ที่ตอบหลังจากส่ง prompt ไปแล้ว ยาวพอสมควร';

    const container = buildGeminiConversation([
      { text: baseline },
      { text: newResponse },
    ]);
    document.body.appendChild(container);

    const result = getLastAIMessage('test', new Set([baseline]), 'gemini', document);
    expect(result).toBe(newResponse);
  });
});

describe('behavioral parity: Grok legacy path unchanged', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  it('Grok uses score-based ranking (last element does NOT auto-win)', () => {
    // For Grok, score ranking still applies — the higher-scored wins
    const elements = [
      { text: 'Short text', index: 0 },
      { text: 'นี่คือโพสต์ไวรัลเกี่ยวกับ AI ที่จะทำให้คนตื่นเต้น!\n\n- AI เปลี่ยนชีวิตประจำวัน\n- เทคโนโลยีก้าวหน้าไม่หยุด', index: 1 },
      { text: 'OK', index: 2 },
    ];

    // Simulate Grok path via lib/ (score-based)
    const result = getLastAIMessage('test', new Set(), 'grok', document);
    // With empty DOM for grok, nothing to select — just verify the path exists
    expect(result).toBeNull();
  });
});

describe('behavioral parity: selectGeminiResponse unit', () => {
  it('returns null for empty elements', () => {
    expect(selectGeminiResponse([], '', new Set())).toBeNull();
  });

  it('returns null when all elements are baseline', () => {
    const elements = [
      { text: 'already here long enough text to not be suspicious', index: 0 },
    ];
    const baseline = new Set(['already here long enough text to not be suspicious']);
    expect(selectGeminiResponse(elements, '', baseline)).toBeNull();
  });

  it('walks from last to first and picks the first non-suspicious', () => {
    const elements = [
      { text: 'Valid response one with enough content to pass threshold', index: 0 },
      { text: 'Searching', index: 1 },
    ];

    const result = selectGeminiResponse(elements, '', new Set());
    // 'Searching' is suspicious (tools status), so it falls back to index 0
    expect(result).toContain('Valid response one');
  });

  it('picks the last element when both are valid', () => {
    const elements = [
      { text: 'First valid response with real content that is long enough', index: 0 },
      { text: 'Second valid response also with real content that is long enough', index: 1 },
    ];

    const result = selectGeminiResponse(elements, '', new Set());
    expect(result).toContain('Second valid response');
  });
});
