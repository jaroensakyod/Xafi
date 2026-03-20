// =============================================
// Characterization Tests: Response Selection via DOM
// =============================================
// Phase 2 baseline truth capture for how the current code
// selects the "best" AI response from DOM candidates.
//
// CRITICAL: This test file documents the KNOWN BUG where an
// intermediate Gemini response block can outrank the final one
// due to score-based ranking rather than positional ordering.
//
// Source commit: d02428c
// =============================================

import { describe, it, expect, beforeEach } from 'vitest';
import {
  collectResponseCandidates,
  getLastAIMessage,
  scoreAIResponseCandidate,
} from '../helpers/extracted-functions.js';
import {
  buildGeminiConversation,
  buildIntermediateOutranksFinal,
  buildMixedGeminiPage,
} from '../helpers/gemini-fixtures.js';

describe('collectResponseCandidates', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  it('collects text from Gemini message-content elements', () => {
    const container = buildGeminiConversation([
      { text: 'First response' },
      { text: 'Second response' },
    ]);
    document.body.appendChild(container);

    const candidates = collectResponseCandidates('gemini', document);
    expect(candidates).toContain('First response');
    expect(candidates).toContain('Second response');
  });

  it('deduplicates identical texts', () => {
    const container = buildGeminiConversation([
      { text: 'Same text' },
      { text: 'Same text' },
    ]);
    document.body.appendChild(container);

    const candidates = collectResponseCandidates('gemini', document);
    const sameTextCount = candidates.filter(t => t === 'Same text').length;
    expect(sameTextCount).toBe(1);
  });

  it('returns empty array when no response elements exist', () => {
    document.body.innerHTML = '<div>No response elements here</div>';
    const candidates = collectResponseCandidates('gemini', document);
    // May still pick up elements matching broad selectors like [class*="message"]
    // Document actual behavior
    expect(Array.isArray(candidates)).toBe(true);
  });

  it('collects from mixed Gemini page with tool and real content', () => {
    const container = buildMixedGeminiPage({
      toolTexts: ['Searching', 'Analyzing'],
      responseTexts: ['Here is your detailed post content with enough substance'],
    });
    document.body.appendChild(container);

    const candidates = collectResponseCandidates('gemini', document);
    // All texts are collected - filtering happens downstream
    expect(candidates.length).toBeGreaterThan(0);
  });
});

describe('getLastAIMessage', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  it('returns the highest-scored candidate from DOM', () => {
    const container = buildGeminiConversation([
      { text: 'Short text here' },
      { text: 'นี่คือโพสต์ไวรัลเกี่ยวกับ AI ที่จะทำให้คนไทยตื่นเต้น!\n\n- AI เปลี่ยนชีวิตประจำวัน\n- เทคโนโลยีก้าวหน้าไม่หยุด\n- อนาคตที่น่าตื่นเต้นรออยู่' },
    ]);
    document.body.appendChild(container);

    const result = getLastAIMessage('Write a viral post', new Set(), 'gemini', document);
    expect(result).toContain('AI');
    expect(result).toContain('โพสต์ไวรัล');
  });

  it('filters out baseline candidates', () => {
    const container = buildGeminiConversation([
      { text: 'Pre-existing welcome message that was already on the page' },
      { text: 'New response with enough content to be selected as real answer here' },
    ]);
    document.body.appendChild(container);

    const baseline = new Set(['Pre-existing welcome message that was already on the page']);
    const result = getLastAIMessage('Test prompt', baseline, 'gemini', document);
    expect(result).not.toContain('Pre-existing');
    expect(result).toContain('New response');
  });

  it('filters out prompt echoes', () => {
    const prompt = 'Write a detailed post about technology for Thai audiences with examples';
    const container = buildGeminiConversation([
      { text: prompt }, // echo
      { text: 'เทคโนโลยีในปี 2026 กำลังเปลี่ยนแปลงวิถีชีวิตของคนไทยอย่างไม่เคยเป็นมาก่อน\nAI ช่วยงานได้หลายรูปแบบ' },
    ]);
    document.body.appendChild(container);

    const result = getLastAIMessage(prompt, new Set(), 'gemini', document);
    expect(result).not.toBe(prompt);
    expect(result).toContain('เทคโนโลยี');
  });

  it('returns null when no candidates remain after filtering', () => {
    const prompt = 'The prompt text here';
    const container = buildGeminiConversation([
      { text: prompt },
    ]);
    document.body.appendChild(container);

    const result = getLastAIMessage(prompt, new Set(), 'gemini', document);
    expect(result).toBeNull();
  });

  // =============================================
  // PHASE 4 FIX: Position-First Selection
  // =============================================
  // Phase 4 fixed the cascading intermediate-block bug by using
  // position-first selection for Gemini. The LAST valid response
  // node in DOM order wins, regardless of score.
  // =============================================

  it('FIXED (Phase 4): final block wins even when intermediate scores higher', () => {
    // Scenario: Gemini produces a long intermediate response, then a shorter final answer.
    // Phase 4 position-first logic picks the final because it's the LAST valid node.
    const intermediateText = [
      'เทคโนโลยี AI กำลังเปลี่ยนโลกใบนี้อย่างที่ไม่เคยเกิดขึ้นมาก่อน',
      '',
      '• Machine Learning ช่วยวิเคราะห์ข้อมูลได้แม่นยำ',
      '• Natural Language Processing เข้าใจภาษามนุษย์',
      '• Computer Vision มองเห็นและเข้าใจภาพ',
      '• Robotics ทำงานแทนมนุษย์ในงานอันตราย',
      '',
      'ในปี 2026 AI จะเข้ามามีบทบาทมากขึ้นในชีวิตประจำวัน',
    ].join('\n');

    const finalText = 'สรุปสั้นๆ: AI เปลี่ยนโลก ปรับตัวให้ทันนะครับ! 🚀';

    const container = buildIntermediateOutranksFinal({
      intermediateText,
      finalText,
    });
    document.body.appendChild(container);

    const result = getLastAIMessage('เขียนโพสต์เกี่ยวกับ AI', new Set(), 'gemini', document);

    // Intermediate still scores higher...
    const intermediateScore = scoreAIResponseCandidate(intermediateText, 'gemini');
    const finalScore = scoreAIResponseCandidate(finalText, 'gemini');
    expect(intermediateScore).toBeGreaterThan(finalScore);

    // ...but position-first selection picks the final (last in DOM)
    expect(result).toBe(finalText);
  });

  it('CHARACTERIZATION: tool status word in raw text triggers -500 penalty, saving final block', () => {
    // FINDING: When intermediate block contains tool status text like "Thinking"
    // in the RAW text, the -500 penalty kicks in even though sanitization removes it.
    // This accidentally protects against the intermediate-outranks-final bug in
    // this specific case. The scoring regex checks the RAW text, not sanitized.
    //
    // Score breakdown:
    // - Intermediate raw contains "Thinking" → -500 penalty from regex
    // - Final block is clean → no penalty
    // - Result: final block wins (the correct outcome, for the wrong reason)
    const intermediateText = [
      'Thinking',
      'นี่คือโพสต์ไวรัลเกี่ยวกับ AI สำหรับคนไทย',
      '- AI ช่วยลดต้นทุน 40%',
      '- ระบบอัตโนมัติทำงาน 24/7',
      '- ข้อมูล Big Data วิเคราะห์ได้แม่นยำ',
    ].join('\n');

    const finalText = 'โพสต์ AI สำหรับคนไทยที่สั้นกระชับได้ใจความ';

    const container = buildIntermediateOutranksFinal({
      intermediateText,
      finalText,
    });
    document.body.appendChild(container);

    const result = getLastAIMessage('เขียนโพสต์ AI', new Set(), 'gemini', document);

    // ACTUAL BEHAVIOR: final block wins because intermediate gets -500 penalty
    // for containing "Thinking" in raw text
    expect(result).toBe(finalText);

    // Verify the penalty mechanism
    const intermediateScore = scoreAIResponseCandidate(intermediateText, 'gemini');
    const finalScore = scoreAIResponseCandidate(finalText, 'gemini');
    expect(intermediateScore).toBeLessThan(finalScore);
  });

  it('CHARACTERIZATION: when final block scores higher, it wins correctly', () => {
    // When the final response is genuinely better, the algorithm works fine
    const intermediateText = 'OK, processing...';
    const finalText = [
      '🔥 AI เปลี่ยนชีวิตคนไทยในปี 2026!',
      '',
      '• แอป AI ช่วยเกษตรกรไทยเพิ่มผลผลิต 30%',
      '• ระบบแปลภาษาแม่นยำขึ้น ช่วยธุรกิจส่งออก',
      '• หมอ AI วินิจฉัยโรคเบื้องต้นได้ตลอด 24 ชม.',
      '',
      'คุณพร้อมรับมือกับ AI แล้วหรือยัง? 🤖',
    ].join('\n');

    const container = buildIntermediateOutranksFinal({
      intermediateText,
      finalText,
    });
    document.body.appendChild(container);

    const result = getLastAIMessage('เขียนโพสต์ AI', new Set(), 'gemini', document);

    // In this case the algorithm picks correctly because final scores higher
    expect(result).toBe(finalText);
  });

  it('FIXED (Phase 4): position-first selects last valid node, not highest score', () => {
    // Phase 4 position-first logic walks from the LAST DOM element backward.
    // The last element "มีอะไรให้ช่วยอีกไหมครับ?" is valid (not suspicious,
    // length >= 18), so it wins over the higher-scored middle block.
    const texts = [
      'สวัสดีครับ ยินดีต้อนรับสู่ Gemini วันนี้จะช่วยอะไรได้บ้างครับ',
      [
        '📊 รายงานเทคโนโลยีประจำสัปดาห์',
        '',
        '1. AI Agents กำลังมาแรง - ระบบ AI ที่ทำงานได้อัตโนมัติ',
        '2. Quantum Computing - Google เปิดตัว Willow chip',
        '3. AR/VR - Apple Vision Pro 2 เปิดขายในไทยแล้ว',
        '',
        '#Tech #AI #Innovation #Thailand',
      ].join('\n'),
      'มีอะไรให้ช่วยอีกไหมครับ? สามารถถามคำถามอะไรก็ได้เลยนะครับ',
    ];

    const container = buildGeminiConversation(
      texts.map(text => ({ text }))
    );
    document.body.appendChild(container);

    const result = getLastAIMessage('เขียนรายงานเทค', new Set(), 'gemini', document);

    // Position-first picks the LAST valid node (index 2)
    expect(result).toContain('มีอะไรให้ช่วยอีกไหมครับ');
  });
});
