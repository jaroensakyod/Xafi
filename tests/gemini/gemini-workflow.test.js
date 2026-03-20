// =============================================
// Phase 4: Gemini Workflow Tests
// =============================================
// Tests for the position-first response selection that fixes
// the intermediate-outranks-final bug. Verifies that:
// - Last valid DOM node wins for Gemini
// - Grok still uses legacy score-based ranking
// - Suspicious last nodes fall back correctly
// - Response node locking semantics work
// =============================================

import { describe, it, expect, beforeEach } from 'vitest';
import {
  selectGeminiResponse,
  collectResponseElements,
  getLastAIMessage,
  scoreAIResponseCandidate,
} from '../../lib/response-collector.js';
import {
  buildGeminiConversation,
  buildIntermediateOutranksFinal,
  buildMixedGeminiPage,
  buildContaminatedGeminiPage,
} from '../helpers/gemini-fixtures.js';

// =============================================
// selectGeminiResponse unit tests
// =============================================
describe('selectGeminiResponse', () => {
  it('picks the last valid element in DOM order', () => {
    const elements = [
      { text: 'เนื้อหายาวมากที่น่าจะดีกว่า มีรายละเอียด\n- จุด 1\n- จุด 2', index: 0 },
      { text: 'คำตอบสุดท้ายที่สั้นกว่าแต่เป็นคำตอบจริงนะครับ', index: 1 },
    ];
    expect(selectGeminiResponse(elements)).toBe('คำตอบสุดท้ายที่สั้นกว่าแต่เป็นคำตอบจริงนะครับ');
  });

  it('skips suspicious last element and picks previous valid one', () => {
    const elements = [
      { text: 'นี่คือคำตอบจริงที่มีเนื้อหาเพียงพอสำหรับการใช้งาน', index: 0 },
      { text: 'OK', index: 1 }, // too short → suspicious
    ];
    expect(selectGeminiResponse(elements)).toBe('นี่คือคำตอบจริงที่มีเนื้อหาเพียงพอสำหรับการใช้งาน');
  });

  it('skips elements that are tool status noise', () => {
    const elements = [
      { text: 'เนื้อหาจริงที่มีคุณค่าสำหรับการโพสต์', index: 0 },
      { text: 'Searching', index: 1 },
    ];
    expect(selectGeminiResponse(elements)).toBe('เนื้อหาจริงที่มีคุณค่าสำหรับการโพสต์');
  });

  it('filters out prompt echoes', () => {
    const prompt = 'เขียนโพสต์เกี่ยวกับ AI สำหรับคนไทย';
    const elements = [
      { text: prompt, index: 0 },
      { text: 'AI กำลังเปลี่ยนแปลงวิถีชีวิตของคนไทยอย่างมาก! มาดูกันว่ามีอะไรบ้าง', index: 1 },
    ];
    expect(selectGeminiResponse(elements, prompt)).toBe(
      'AI กำลังเปลี่ยนแปลงวิถีชีวิตของคนไทยอย่างมาก! มาดูกันว่ามีอะไรบ้าง'
    );
  });

  it('filters out baseline candidates', () => {
    const baseline = new Set(['ข้อความที่มีอยู่ก่อนแล้วบนหน้าเว็บ']);
    const elements = [
      { text: 'ข้อความที่มีอยู่ก่อนแล้วบนหน้าเว็บ', index: 0 },
      { text: 'คำตอบใหม่จาก Gemini ที่ตอบคำถามของเรา', index: 1 },
    ];
    expect(selectGeminiResponse(elements, '', baseline)).toBe(
      'คำตอบใหม่จาก Gemini ที่ตอบคำถามของเรา'
    );
  });

  it('returns null when all candidates are filtered out', () => {
    const prompt = 'เขียนโพสต์';
    const elements = [
      { text: 'เขียนโพสต์', index: 0 },
    ];
    expect(selectGeminiResponse(elements, prompt)).toBeNull();
  });

  it('falls back to score-based when all remaining candidates are suspicious', () => {
    const elements = [
      { text: 'Short but real', index: 0 }, // 14 chars < 18 → suspicious
      { text: 'Even shorter!', index: 1 },  // 13 chars < 18 → suspicious
    ];
    const result = selectGeminiResponse(elements);
    // Both are suspicious, so fallback scores them
    // "Short but real" is longer → higher score
    expect(result).toBe('Short but real');
  });

  it('returns null when all candidates sanitize to empty', () => {
    const elements = [
      { text: 'Searching', index: 0 },
      { text: 'Thinking', index: 1 },
    ];
    expect(selectGeminiResponse(elements)).toBeNull();
  });
});

// =============================================
// DOM integration tests with position-first
// =============================================
describe('getLastAIMessage: Gemini position-first', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  it('picks final block even when intermediate has Thai + bullets + multiline', () => {
    const intermediateText = [
      '🔥 โพสต์ไวรัลเรื่อง AI',
      '',
      '• AI ช่วยเกษตรกรเพิ่มผลผลิต 40%',
      '• ระบบอัตโนมัติลดต้นทุน',
      '• Big Data วิเคราะห์ตลาดแม่นยำ',
      '',
      'นี่คือยุคของ AI! 🚀',
    ].join('\n');

    const finalText = 'สรุป: AI เปลี่ยนชีวิตคนไทยในทุกมิติ ปรับตัวเร็วได้เปรียบ 💡';

    const container = buildIntermediateOutranksFinal({
      intermediateText,
      finalText,
    });
    document.body.appendChild(container);

    const result = getLastAIMessage('เขียนโพสต์ AI', new Set(), 'gemini', document);
    expect(result).toBe(finalText);
  });

  it('walks back to intermediate when final is just "Gemini can make mistakes"', () => {
    const goodText = 'เนื้อหาที่ดีมากสำหรับโพสต์ไวรัลเกี่ยวกับเทคโนโลยี AI ในปี 2026';
    const disclaimerText = 'Gemini can make mistakes';

    const container = buildGeminiConversation([
      { text: goodText },
      { text: disclaimerText },
    ]);
    document.body.appendChild(container);

    const result = getLastAIMessage('เขียนโพสต์', new Set(), 'gemini', document);
    // Disclaimer sanitizes to empty → suspicious → walk back to previous
    expect(result).toBe(goodText);
  });

  it('handles mixed tool status + real content in DOM order', () => {
    const container = buildMixedGeminiPage({
      toolTexts: ['Searching', 'Analyzing data'],
      responseTexts: ['นี่คือคำตอบจริงที่มีเนื้อหาที่ดีมากสำหรับโพสต์'],
    });
    document.body.appendChild(container);

    const result = getLastAIMessage('test', new Set(), 'gemini', document);
    expect(result).toContain('คำตอบจริง');
  });

  it('does not let helper follow-up text outrank the real answer', () => {
    const container = buildGeminiConversation([
      { text: 'ข้อความต้อนรับจาก Gemini ยินดีต้อนรับครับ' },
      { text: 'เนื้อหาด้านเทคโนโลยีที่ยาวมากๆ\n- จุดที่ 1\n- จุดที่ 2\n- จุดที่ 3\n\n#AI #Tech' },
      { text: 'ใช่ครับ มีอะไรให้ช่วยอีกไหมครับ สามารถถามได้เลยนะครับ' },
    ]);
    document.body.appendChild(container);

    const result = getLastAIMessage('เขียนโพสต์', new Set(), 'gemini', document);
    expect(result).toContain('เนื้อหาด้านเทคโนโลยีที่ยาวมากๆ');
    expect(result).not.toContain('มีอะไรให้ช่วยอีกไหมครับ');
  });

  it('anchors Gemini extraction to the active conversation when sidebar text is longer', () => {
    const container = buildContaminatedGeminiPage({
      answerText: 'โพสต์ขายของจริงที่ Gemini เพิ่งสร้างเสร็จและอยู่ใน active conversation',
      sidebarText: 'ข้อความยาวมากจาก sidebar history ที่ไม่เกี่ยวกันแต่เคยทำให้ตัวเลือก document-wide เลือกผิดได้ง่าย',
      helperText: 'มีอะไรให้ช่วยอีกไหมครับ',
    });
    document.body.appendChild(container);

    const result = getLastAIMessage('ช่วยเขียนโพสต์ขายของ', new Set(), 'gemini', document);

    expect(result).toBe('โพสต์ขายของจริงที่ Gemini เพิ่งสร้างเสร็จและอยู่ใน active conversation');
  });
});

// =============================================
// Grok legacy path preservation
// =============================================
describe('getLastAIMessage: Grok legacy score-based path', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  it('Grok still uses score-based ranking (highest score wins)', () => {
    // For Grok, we intentionally keep the old behavior
    const container = buildGeminiConversation([
      { text: 'Short welcome text for the user' },
      { text: 'นี่คือเนื้อหาที่ดีมากสำหรับโพสต์ไวรัล เนื้อหายาวและมีคุณค่า\n- จุดที่ 1\n- จุดที่ 2\n#AI #Thailand' },
      { text: 'OK, need anything else my friend?' },
    ]);
    document.body.appendChild(container);

    const result = getLastAIMessage('Write a post', new Set(), 'grok', document);
    // Grok uses score-based: the longest Thai content with bullets wins
    expect(result).toContain('โพสต์ไวรัล');
  });
});

// =============================================
// Edge cases
// =============================================
describe('selectGeminiResponse: edge cases', () => {
  it('handles empty elements array', () => {
    expect(selectGeminiResponse([])).toBeNull();
  });

  it('handles single valid element', () => {
    const elements = [
      { text: 'คำตอบเดียวที่มีเนื้อหาเพียงพอสำหรับการใช้งาน', index: 0 },
    ];
    expect(selectGeminiResponse(elements)).toBe('คำตอบเดียวที่มีเนื้อหาเพียงพอสำหรับการใช้งาน');
  });

  it('handles all elements being baseline → returns null', () => {
    const baseline = new Set(['text A is already there', 'text B is already there too']);
    const elements = [
      { text: 'text A is already there', index: 0 },
      { text: 'text B is already there too', index: 1 },
    ];
    expect(selectGeminiResponse(elements, '', baseline)).toBeNull();
  });
});
