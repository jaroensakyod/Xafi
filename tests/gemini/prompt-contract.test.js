import { describe, it, expect } from 'vitest';
import { loadBackgroundFunctions } from '../helpers/load-background-functions.js';

function getBackgroundPromptHelpers() {
  return loadBackgroundFunctions(
    [
      'normalizePromptMode',
      'sanitizeSourceText',
      'getCharCount',
      'getBodyCharacterBudget',
      'buildPrompt',
      'isAiWrapperOnlyLine',
      'stripAiWrapperLeadIns',
      'stripAiWrapperText',
    ],
    {
      MAX_POST_LENGTH: 280,
      PROMPT_BODY_BUFFER: 24,
      productLink: '',
      DEFAULT_SETTINGS: {
        promptTemplate: 'โครงสร้าง\n{PRODUCT_CONTEXT}\nเนื้อหา:\n{CONTENT}\nลิงก์:{PRODUCT_URL}',
      },
    },
  );
}

function getBackgroundFinalPostHelpers() {
  return loadBackgroundFunctions(
    ['buildFinalPostText'],
    {
      MAX_POST_LENGTH: 280,
      PROMPT_BODY_BUFFER: 24,
    },
  );
}

function getPromptPresetHelpers() {
  return loadBackgroundFunctions(
    [
      'normalizePromptMode',
      'getPromptTemplateForMode',
      'isBuiltInPromptTemplate',
      'getPromptTemplateSource',
      'resolvePromptTemplateUpdate',
    ],
    {
      PROMPT_TEMPLATE_VERSION: 7,
      DEFAULT_PROMPT_TEMPLATE: 'DEFAULT SOFT SELL TEMPLATE',
      HOT_TAKE_PROMPT_TEMPLATE: 'DEFAULT HOT TAKE TEMPLATE',
      LEGACY_DEFAULT_PROMPT_TEMPLATE: 'LEGACY DEFAULT TEMPLATE',
      V4_DEFAULT_PROMPT_TEMPLATE: 'V4 DEFAULT TEMPLATE',
    },
  );
}

describe('background prompt contract: phase 1', () => {
  it('uses a ceiling-based length contract instead of exact-length forcing', () => {
    const { buildPrompt } = getBackgroundPromptHelpers();
    const prompt = buildPrompt(
      {
        text: 'สรุปโพสต์นี้ให้หน่อย #AI พร้อมลิงก์ https://example.com/source',
        productLink: 'https://s.shopee.co.th/product',
      },
      {
        promptMode: 'soft-sell',
        promptTemplate: 'เริ่มต้น\n{PRODUCT_CONTEXT}\nเนื้อหาต้นทาง:\n{CONTENT}',
      },
      'หมอนรองคอ',
    );

    expect(prompt).toContain('ต้องไม่เกิน');
    expect(prompt).toContain('โดยไม่ต้องฝืนให้ครบจำนวน');
    expect(prompt).not.toMatch(/ตัวอักษรพอดี|เท่ากับ 280 ตัวอักษรพอดี|ครบ 280 ตัวอักษรเป๊ะ/);
    expect(prompt).not.toContain('#AI');
    expect(prompt).not.toContain('https://example.com/source');
  });

  it('keeps custom prompt text while adding the canonical ceiling rules', () => {
    const { buildPrompt } = getBackgroundPromptHelpers();
    const prompt = buildPrompt(
      {
        text: 'มีแต่เนื้อหาล้วน ไม่มีลิงก์',
        productLink: '',
      },
      {
        promptMode: 'hot-take',
        promptTemplate: 'CUSTOM HEADER\n{CONTENT}\nCUSTOM FOOTER',
      },
      '',
    );

    expect(prompt).toContain('CUSTOM HEADER');
    expect(prompt).toContain('CUSTOM FOOTER');
    expect(prompt).toContain('ข้อความสุดท้ายทั้งหมดต้องไม่เกิน 280 ตัวอักษร');
    expect(prompt).toContain('ต้องออกมาเป็น 4 บรรทัดเท่านั้น');
  });

  it('respects an explicit prompt contract placeholder without duplicating hidden rules', () => {
    const { buildPrompt } = getBackgroundPromptHelpers();
    const prompt = buildPrompt(
      {
        text: 'โพสต์ต้นทางที่มีประเด็นชัดเจน',
        productLink: '',
      },
      {
        promptMode: 'soft-sell',
        promptTemplate: 'HEADER\n{PROMPT_CONTRACT}\nBODY:\n{CONTENT}\nFOOTER',
      },
      '',
    );

    expect(prompt).toContain('HEADER');
    expect(prompt).toContain('FOOTER');
    expect(prompt).toContain('BODY:\nโพสต์ต้นทางที่มีประเด็นชัดเจน');
    expect(prompt.match(/ต้องออกมาเป็น 4 บรรทัดเท่านั้น/g)?.length).toBe(1);
  });
});

describe('background wrapper stripping: phase 2', () => {
  it('strips Thai and bilingual wrapper lead-ins before saving drafts', () => {
    const { stripAiWrapperText } = getBackgroundPromptHelpers();

    expect(stripAiWrapperText('Gemini บอกว่า\nโพสต์จริงที่พร้อมเซฟ')).toBe('โพสต์จริงที่พร้อมเซฟ');
    expect(stripAiWrapperText('Gemini ตอบว่า: โพสต์จริงที่พร้อมเซฟ')).toBe('โพสต์จริงที่พร้อมเซฟ');
    expect(stripAiWrapperText('คำตอบจาก Gemini\nโพสต์จริงที่พร้อมเซฟ')).toBe('โพสต์จริงที่พร้อมเซฟ');
    expect(stripAiWrapperText('นี่คือโพสต์:\nโพสต์จริงที่พร้อมเซฟ')).toBe('โพสต์จริงที่พร้อมเซฟ');
  });

  it('preserves genuine Thai openings that only resemble wrapper language', () => {
    const { stripAiWrapperText } = getBackgroundPromptHelpers();

    expect(stripAiWrapperText('นี่แหละประเด็นที่คนมองข้ามกันอยู่')).toBe('นี่แหละประเด็นที่คนมองข้ามกันอยู่');
    expect(stripAiWrapperText('นี่คือโพสต์เกี่ยวกับเทคโนโลยี AI ที่น่าสนใจ')).toBe('นี่คือโพสต์เกี่ยวกับเทคโนโลยี AI ที่น่าสนใจ');
  });
});

describe('background final post normalization: phase 3', () => {
  it('compacts an over-budget four-line answer without ellipsis or trailing padding', () => {
    const { buildFinalPostText } = getBackgroundFinalPostHelpers();
    const finalText = buildFinalPostText(
      [
        'ประเด็นนี้ยาวมาก เพราะมีทั้งต้นทุนที่พุ่งขึ้นอย่างต่อเนื่อง และแรงกดดันจากผู้ใช้ที่คาดหวังผลลัพธ์เร็วขึ้นทุกวัน',
        '- ทีมที่ชนะไม่ใช่ทีมที่ทำทุกอย่าง แต่คือทีมที่ตัดของฟุ่มเฟือยออกได้ก่อน แล้วย้ายแรงไปทุ่มกับส่วนที่ลูกค้าเห็นจริง',
        '- ถ้ายังประชุมวนเรื่องเดิมโดยไม่ปิดงานให้เร็วพอ ต้นทุนที่เสียไปจะไม่ได้อยู่แค่เวลา แต่มันลามไปถึงความเชื่อใจของทีมทั้งหมด',
        'สรุปคือคนที่กล้าตัด noise ออกก่อน จะมีพื้นที่พอสำหรับของที่สำคัญจริงในจังหวะที่คนอื่นยังติดหล่มอยู่'
      ].join('\n'),
      'https://example.com/product',
    );

    expect(finalText).not.toContain('...');
    expect(finalText).not.toMatch(/\s+$/);
    expect(finalText).toContain('https://example.com/product');
    expect(finalText.length).toBeLessThanOrEqual(280);

    const bodyLines = finalText.split('\n').slice(0, 4);
    expect(bodyLines).toHaveLength(4);
    expect(bodyLines[1]).toMatch(/^-/);
    expect(bodyLines[2]).toMatch(/^-/);
  });

  it('keeps shorter valid output below the ceiling without padding it to 280', () => {
    const { buildFinalPostText } = getBackgroundFinalPostHelpers();
    const finalText = buildFinalPostText(
      'เปิดให้เห็นเลยว่า AI ไม่ได้แทนคน\n- แต่มันแทนงานจุกจิกที่กินเวลา\n- คนเลยเหลือแรงไปคิดในจุดที่มีมูลค่ากว่า\nสุดท้ายทีมที่ใช้ AI เป็น จะวิ่งไวกว่าแบบเห็นชัด',
      'https://example.com/product',
    );

    expect(finalText.length).toBeLessThan(280);
    expect(finalText).not.toMatch(/\s+$/);
  });
});

describe('background prompt preset resolution: phase 4', () => {
  it('preserves a custom template when prompt mode changes without explicit preset adoption', () => {
    const { resolvePromptTemplateUpdate } = getPromptPresetHelpers();
    const result = resolvePromptTemplateUpdate(
      {
        promptMode: 'soft-sell',
        promptTemplate: 'CUSTOM PROMPT TEMPLATE',
      },
      {
        promptMode: 'hot-take',
      },
    );

    expect(result.promptMode).toBe('hot-take');
    expect(result.promptTemplate).toBe('CUSTOM PROMPT TEMPLATE');
    expect(result.promptTemplateSource).toBe('custom');
  });

  it('swaps to the matching built-in preset when the operator explicitly asks for it', () => {
    const { resolvePromptTemplateUpdate } = getPromptPresetHelpers();
    const result = resolvePromptTemplateUpdate(
      {
        promptMode: 'soft-sell',
        promptTemplate: 'CUSTOM PROMPT TEMPLATE',
      },
      {
        promptMode: 'hot-take',
        applyPromptPreset: true,
      },
    );

    expect(result.promptMode).toBe('hot-take');
    expect(result.promptTemplate).toBe('DEFAULT HOT TAKE TEMPLATE');
    expect(result.promptTemplateSource).toBe('built-in');
  });
});