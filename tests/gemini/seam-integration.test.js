// =============================================
// Phase 3: Seam Tests for lib/ Modules
// =============================================
// Tests that the extracted lib/ modules work correctly
// as standalone units and in combination. Covers edge cases
// and cross-module integration not in Phase 2 characterization.
// =============================================

import { describe, it, expect, beforeEach } from 'vitest';
import {
  sanitizeAIResponseText,
  isToolStatusLine,
  isMostlyUrl,
  isSuspiciousAIResponse,
} from '../../lib/sanitizer.js';
import {
  isPromptEcho,
  sanitizeComparableText,
  longestCommonPrefix,
} from '../../lib/prompt-echo.js';
import {
  scoreAIResponseCandidate,
  collectResponseCandidates,
  collectResponseElements,
  getLastAIMessage,
} from '../../lib/response-collector.js';
import {
  RESPONSE_SELECTORS,
  INPUT_SELECTORS,
  SEND_BUTTON_SELECTORS,
  STOP_BUTTON_SELECTORS,
} from '../../lib/selectors.js';
import {
  buildGeminiConversation,
  buildMixedGeminiPage,
  buildIntermediateOutranksFinal,
  buildContaminatedGeminiPage,
} from '../helpers/gemini-fixtures.js';

// =============================================
// Sanitizer Seam Tests
// =============================================
describe('sanitizer seam: edge cases', () => {
  it('handles text with only tool lines → empty', () => {
    const text = 'Searching\nThinking\nAnalyzing';
    expect(sanitizeAIResponseText(text)).toBe('');
  });

  it('preserves single real line among many tool lines', () => {
    const text = 'Thinking\nSearching\nนี่คือคำตอบจริงที่มีเนื้อหา\nSources\nRead more';
    const result = sanitizeAIResponseText(text);
    expect(result).toBe('นี่คือคำตอบจริงที่มีเนื้อหา');
  });

  it('strips Grok said prefix same as Gemini', () => {
    expect(sanitizeAIResponseText('Grok said Here is your content'))
      .toBe('Here is your content');
  });

  it('treats "Reasoned for 30 seconds" as tool status', () => {
    expect(isToolStatusLine('Reasoned for 30 seconds')).toBe(true);
    expect(isToolStatusLine('Reasoned for 2 minutes')).toBe(true);
  });

  it('isMostlyUrl: mixed with short non-URL text still returns true', () => {
    expect(isMostlyUrl('see https://example.com/path')).toBe(true);
  });

  it('isMostlyUrl: longer text around URL returns false', () => {
    expect(isMostlyUrl('Please visit https://example.com for comprehensive details'))
      .toBe(false);
  });
});

describe('isSuspiciousAIResponse seam: boundary cases', () => {
  it('text with exactly 18 chars is not suspicious', () => {
    expect(isSuspiciousAIResponse('twelve34567890abcd')).toBe(false);
  });

  it('text with exactly 17 chars IS suspicious', () => {
    expect(isSuspiciousAIResponse('twelve345678901ab')).toBe(true);
  });

  it('multi-line text where every line is tool status → suspicious', () => {
    expect(isSuspiciousAIResponse('Searching\nThinking')).toBe(true);
  });
});

// =============================================
// Prompt Echo Seam Tests
// =============================================
describe('prompt-echo seam: cross-module with sanitizer', () => {
  it('prompt echo detection is independent of sanitizer', () => {
    // isPromptEcho uses sanitizeComparableText, NOT sanitizeAIResponseText
    const prompt = 'Searching for information about AI';
    const candidate = 'Searching for information about AI';
    // Even though "Searching" is a tool status line, isPromptEcho
    // works on raw text comparison, not sanitized content
    expect(isPromptEcho(candidate, prompt)).toBe(true);
  });

  it('does not false-positive on content that shares short prefix with prompt', () => {
    const prompt = 'Write a post about AI technology';
    const candidate = 'Write your own adventure story about dragons and magic in Thailand';
    // The common prefix is only "Write " (6 chars) — well below thresholds
    expect(isPromptEcho(candidate, prompt)).toBe(false);
  });
});

// =============================================
// Response Collector Seam Tests
// =============================================
describe('response-collector seam: scorer integration', () => {
  it('scorer uses sanitizer internally — tool text in raw penalizes', () => {
    const rawWithTool = 'Executed code and here is the result for you to review';
    const rawClean = 'Here is the computed result for you to review and use';
    expect(scoreAIResponseCandidate(rawWithTool)).toBeLessThan(
      scoreAIResponseCandidate(rawClean)
    );
  });

  it('scorer returns consistent results across providers for pure text', () => {
    const text = 'Simple single-line response that is just text for testing';
    const geminiScore = scoreAIResponseCandidate(text, 'gemini');
    const grokScore = scoreAIResponseCandidate(text, 'grok');
    // Single-line: no multi-line bonus difference
    expect(geminiScore).toBe(grokScore);
  });
});

describe('response-collector seam: DOM integration', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  it('collectResponseCandidates uses selectors from lib/selectors.js', () => {
    // Verify that the selectors constant is used — if selectors were wrong,
    // fixture elements would not be found
    const container = buildGeminiConversation([
      { text: 'Response from Gemini model via conversation container' },
    ]);
    document.body.appendChild(container);

    const candidates = collectResponseCandidates('gemini', document);
    expect(candidates).toContain('Response from Gemini model via conversation container');
  });

  it('getLastAIMessage chains sanitizer + echo filter + scorer correctly', () => {
    const prompt = 'เขียนโพสต์เกี่ยวกับอาหารไทย';
    const container = buildGeminiConversation([
      { text: prompt }, // echo → filtered
      { text: 'Searching' }, // tool noise → sanitized to empty → score -1000
      { text: 'อาหารไทยเป็นที่นิยมทั่วโลก ทั้งต้มยำ ผัดไทย และแกงเขียวหวาน ลองชิมแล้วจะติดใจ' },
    ]);
    document.body.appendChild(container);

    const result = getLastAIMessage(prompt, new Set(), 'gemini', document);
    expect(result).toContain('อาหารไทย');
    expect(result).not.toBe(prompt);
    expect(result).not.toBe('Searching');
  });

  it('getLastAIMessage excludes baseline candidates correctly', () => {
    const container = buildGeminiConversation([
      { text: 'Welcome message already on page before our prompt was sent' },
      { text: 'The new response that appeared after we sent our prompt here' },
    ]);
    document.body.appendChild(container);

    const baseline = new Set(['Welcome message already on page before our prompt was sent']);
    const result = getLastAIMessage('test', baseline, 'gemini', document);
    expect(result).toContain('new response');
  });

  it('collectResponseElements ignores sidebar/history contamination when active conversation root exists', () => {
    const container = buildContaminatedGeminiPage({
      answerText: 'คำตอบจริงใน active conversation',
      sidebarText: 'ข้อความจาก sidebar ที่ไม่ควรถูกเก็บมาปน',
      historyText: 'recent history ที่ไม่เกี่ยวข้อง',
    });
    document.body.appendChild(container);

    const elements = collectResponseElements('gemini', document);
    const texts = elements.map((element) => element.text);

    expect(texts).toContain('คำตอบจริงใน active conversation');
    expect(texts).not.toContain('ข้อความจาก sidebar ที่ไม่ควรถูกเก็บมาปน');
    expect(texts).not.toContain('recent history ที่ไม่เกี่ยวข้อง');
  });

  it('prefers the leaf answer node over ancestor wrappers with combined text', () => {
    const container = buildContaminatedGeminiPage({
      answerText: 'โพสต์สุดท้ายที่ควรถูกเลือก',
      helperText: 'มีอะไรให้ช่วยอีกไหมครับ สามารถถามคำถามได้เลยนะครับ',
    });
    document.body.appendChild(container);

    const result = getLastAIMessage('ช่วยเขียนโพสต์', new Set(), 'gemini', document);

    expect(result).toBe('โพสต์สุดท้ายที่ควรถูกเลือก');
  });
});

// =============================================
// Selectors Seam Tests
// =============================================
describe('selectors seam: completeness', () => {
  it('RESPONSE_SELECTORS includes all model-response variants', () => {
    const joined = RESPONSE_SELECTORS.join(' ');
    expect(joined).toContain('model-response');
    expect(joined).toContain('message-content');
    expect(joined).toContain('.markdown');
  });

  it('INPUT_SELECTORS starts with the most specific Gemini selectors', () => {
    expect(INPUT_SELECTORS[0]).toContain('contenteditable');
  });

  it('SEND_BUTTON_SELECTORS includes Thai label', () => {
    const hasThai = SEND_BUTTON_SELECTORS.some(s => /ส่ง/.test(s));
    expect(hasThai).toBe(true);
  });

  it('STOP_BUTTON_SELECTORS includes Thai label', () => {
    const hasThai = STOP_BUTTON_SELECTORS.some(s => /หยุด/.test(s));
    expect(hasThai).toBe(true);
  });
});

// =============================================
// Regression Net: Known Baseline Failure Classes
// =============================================
describe('regression net: position-first selection (Phase 4 fix)', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  it('FIXED: position-first selection picks final block over higher-scored intermediate', () => {
    // Phase 4 fix: the LAST valid response node in DOM wins.
    // This regression test ensures the fix doesn't regress back to pure score ranking.
    const intermediate = 'เนื้อหายาวๆ ที่มีรายละเอียดเยอะ\n- จุดที่ 1 มีข้อมูลสำคัญ\n- จุดที่ 2 แสดงให้เห็นว่า AI ช่วยได้จริง\n- จุดที่ 3 สรุปผลงานวิจัย\n\nนี่คือ intermediate block';
    const final = 'สรุป: AI ดีมาก ปรับตัวให้ทันเทคโนโลยีครับ! 🚀';

    const container = buildIntermediateOutranksFinal({
      intermediateText: intermediate,
      finalText: final,
    });
    document.body.appendChild(container);

    const result = getLastAIMessage('เขียนโพสต์', new Set(), 'gemini', document);
    // Position-first picks the final (last in DOM), not the intermediate
    expect(result).toBe(final);
  });
});

describe('regression net: tool-text false penalty', () => {
  it('REGRESSION: raw text containing "executed code" gets -500 even if content is real', () => {
    const text = 'I executed code to analyze the data and found these Thai results: สวัสดีครับ';
    const score = scoreAIResponseCandidate(text);
    // The -500 penalty fires on raw text, not sanitized
    expect(score).toBeLessThan(200);
  });
});
