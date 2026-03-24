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