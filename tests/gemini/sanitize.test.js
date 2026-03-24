// =============================================
// Characterization Tests: sanitizeAIResponseText
// =============================================
// Phase 2 baseline truth capture for text sanitization.
// Tests what the rolled-back code ACTUALLY does.
// Source commit: d02428c
// =============================================

import { describe, it, expect } from 'vitest';
import {
  sanitizeAIResponseText,
  isToolStatusLine,
  isMostlyUrl,
} from '../helpers/extracted-functions.js';

describe('isToolStatusLine', () => {
  it('detects known tool/status lines', () => {
    expect(isToolStatusLine('Executed code')).toBe(true);
    expect(isToolStatusLine('Searching')).toBe(true);
    expect(isToolStatusLine('Thinking')).toBe(true);
    expect(isToolStatusLine('Analyzing')).toBe(true);
    expect(isToolStatusLine('Read more')).toBe(true);
    expect(isToolStatusLine('View all')).toBe(true);
    expect(isToolStatusLine('Sources')).toBe(true);
    expect(isToolStatusLine('Search results')).toBe(true);
    expect(isToolStatusLine('Used tools')).toBe(true);
    expect(isToolStatusLine('Gemini said')).toBe(true);
    expect(isToolStatusLine('Grok said')).toBe(true);
    expect(isToolStatusLine('Gemini บอกว่า')).toBe(true);
    expect(isToolStatusLine('Gemini ตอบว่า')).toBe(true);
    expect(isToolStatusLine('คำตอบจาก Gemini')).toBe(true);
    expect(isToolStatusLine('นี่คือโพสต์')).toBe(true);
    expect(isToolStatusLine('Reasoned for 5 seconds')).toBe(true);
    expect(isToolStatusLine('Assistant')).toBe(true);
  });

  it('rejects real content lines', () => {
    expect(isToolStatusLine('Here is your social media post')).toBe(false);
    expect(isToolStatusLine('สวัสดีครับ นี่คือโพสต์ของคุณ')).toBe(false);
    expect(isToolStatusLine('The weather today is sunny')).toBe(false);
  });

  it('handles empty/null input', () => {
    expect(isToolStatusLine('')).toBe(false);
    expect(isToolStatusLine(null)).toBe(false);
    expect(isToolStatusLine(undefined)).toBe(false);
  });
});

describe('isMostlyUrl', () => {
  it('detects URL-only text', () => {
    expect(isMostlyUrl('https://example.com/path')).toBe(true);
    expect(isMostlyUrl('Visit https://google.com')).toBe(true);
  });

  it('returns false for text with real content around URLs', () => {
    expect(isMostlyUrl('Check this article at https://example.com for more details about the topic')).toBe(false);
  });

  it('returns false for normal text', () => {
    expect(isMostlyUrl('This is a normal social media post about technology')).toBe(false);
  });

  it('handles empty input', () => {
    expect(isMostlyUrl('')).toBe(false);
    expect(isMostlyUrl(null)).toBe(false);
  });
});

describe('sanitizeAIResponseText', () => {
  it('removes tool/status lines from multi-line text', () => {
    const input = 'Searching\nHere is your answer\nSources';
    const result = sanitizeAIResponseText(input);
    expect(result).toBe('Here is your answer');
  });

  it('CHARACTERIZATION: empty lines are REMOVED, not collapsed to double', () => {
    // The algorithm splits by \n, trims each line, then FILTERS out empty lines.
    // This means multi-newline gaps become single newlines, NOT double.
    // The .replace(/\n{3,}/g, '\n\n') never triggers because empty lines
    // are already removed by the filter step.
    const input = 'Line one\n\n\n\n\nLine two';
    const result = sanitizeAIResponseText(input);
    expect(result).toBe('Line one\nLine two');
  });

  it('strips Gemini/Grok said prefix', () => {
    const input = 'Gemini said Here is your post';
    const result = sanitizeAIResponseText(input);
    expect(result).toBe('Here is your post');
  });

  it('strips Thai Gemini wrapper prefixes and keeps the real body', () => {
    expect(sanitizeAIResponseText('Gemini บอกว่า\nนี่คือคำตอบจริงที่พร้อมใช้')).toBe('นี่คือคำตอบจริงที่พร้อมใช้');
    expect(sanitizeAIResponseText('Gemini ตอบว่า: นี่คือคำตอบจริงที่พร้อมใช้')).toBe('นี่คือคำตอบจริงที่พร้อมใช้');
    expect(sanitizeAIResponseText('คำตอบจาก Gemini\nนี่คือคำตอบจริงที่พร้อมใช้')).toBe('นี่คือคำตอบจริงที่พร้อมใช้');
  });

  it('strips generic Thai wrapper lead-ins but preserves genuine Thai openings', () => {
    expect(sanitizeAIResponseText('นี่คือโพสต์:\nประเด็นนี้คนยังมองข้ามกันอยู่')).toBe('ประเด็นนี้คนยังมองข้ามกันอยู่');
    expect(sanitizeAIResponseText('นี่แหละประเด็นที่คนมองข้ามกันอยู่')).toBe('นี่แหละประเด็นที่คนมองข้ามกันอยู่');
    expect(sanitizeAIResponseText('นี่คือโพสต์เกี่ยวกับเทคโนโลยี AI ที่น่าสนใจ')).toBe('นี่คือโพสต์เกี่ยวกับเทคโนโลยี AI ที่น่าสนใจ');
  });

  it('returns empty for Google AI Studio disclaimer text', () => {
    expect(sanitizeAIResponseText('Google AI Studio')).toBe('');
    expect(sanitizeAIResponseText('Double-check responses')).toBe('');
    expect(sanitizeAIResponseText('Gemini can make mistakes')).toBe('');
    expect(sanitizeAIResponseText('Draft saved')).toBe('');
  });

  it('returns empty for URL-only content', () => {
    expect(sanitizeAIResponseText('https://example.com/long/path/here')).toBe('');
  });

  it('preserves valid multi-line Thai content', () => {
    const input = 'สวัสดีครับ นี่คือโพสต์ของคุณ\nมีเนื้อหาเกี่ยวกับเทคโนโลยี\nหวังว่าจะชอบนะครับ';
    const result = sanitizeAIResponseText(input);
    expect(result).toContain('สวัสดีครับ');
    expect(result).toContain('เทคโนโลยี');
  });

  it('handles empty/null input', () => {
    expect(sanitizeAIResponseText('')).toBe('');
    expect(sanitizeAIResponseText(null)).toBe('');
    expect(sanitizeAIResponseText(undefined)).toBe('');
  });

  it('strips leading whitespace from each line', () => {
    const input = '  Leading spaces  \n  Another line  ';
    const result = sanitizeAIResponseText(input);
    expect(result).toBe('Leading spaces\nAnother line');
  });

  it('filters out lines that are purely tool status', () => {
    const input = 'Thinking\nAnalyzing\nHere is the actual content with enough text to matter\nView all';
    const result = sanitizeAIResponseText(input);
    expect(result).toBe('Here is the actual content with enough text to matter');
  });
});
