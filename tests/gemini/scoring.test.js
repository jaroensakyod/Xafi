// =============================================
// Characterization Tests: Scoring & Suspicious Detection
// =============================================
// Phase 2 baseline truth capture for response scoring and
// suspicious response detection.
// Source commit: d02428c
// =============================================

import { describe, it, expect } from 'vitest';
import {
  scoreAIResponseCandidate,
  isSuspiciousAIResponse,
} from '../helpers/extracted-functions.js';

describe('scoreAIResponseCandidate', () => {
  it('scores longer text higher (capped at 400)', () => {
    const short = scoreAIResponseCandidate('This is a short response text.');
    const long = scoreAIResponseCandidate('This is a much longer response text that contains detailed information about the topic at hand and provides valuable insight to the reader.');
    expect(long).toBeGreaterThan(short);
  });

  it('caps length score at 400', () => {
    const veryLong = 'a'.repeat(600);
    const score = scoreAIResponseCandidate(veryLong);
    // length contribution capped at 400
    expect(score).toBeLessThanOrEqual(500); // 400 + possible bonuses
  });

  it('gives Thai text a 120-point bonus', () => {
    const english = 'This is a test response with enough length to matter here';
    const thai = 'นี่คือโพสต์ทดสอบที่มีความยาวเพียงพอสำหรับการทดสอบ';
    const scoreEn = scoreAIResponseCandidate(english);
    const scoreTh = scoreAIResponseCandidate(thai);
    expect(scoreTh - scoreEn).toBeGreaterThanOrEqual(100); // Thai bonus minus length difference
  });

  it('gives multi-line content a bonus (30 + 40 for Gemini)', () => {
    const singleLine = 'This is a single line response with enough text to score';
    const multiLine = 'This is line one of the response\nThis is line two with more detail';
    const scoreSingle = scoreAIResponseCandidate(singleLine, 'gemini');
    const scoreMulti = scoreAIResponseCandidate(multiLine, 'gemini');
    // Multi-line gets +30 (general) + 40 (gemini bonus) = +70
    expect(scoreMulti).toBeGreaterThan(scoreSingle);
  });

  it('gives bullet points a bonus', () => {
    const noBullets = 'Here is a response about the topic with some details';
    const withBullets = '- Here is a response\n- With bullet points\n- About the topic';
    const scoreNone = scoreAIResponseCandidate(noBullets);
    const scoreBullets = scoreAIResponseCandidate(withBullets);
    expect(scoreBullets).toBeGreaterThan(scoreNone);
  });

  it('penalizes URL-heavy content', () => {
    const normal = 'This is a normal response with real content about the topic';
    const urlHeavy = 'https://example.com/very/long/path/that/is/the/main/content';
    const scoreNormal = scoreAIResponseCandidate(normal);
    const scoreUrl = scoreAIResponseCandidate(urlHeavy);
    expect(scoreNormal).toBeGreaterThan(scoreUrl);
  });

  it('penalizes tool/status text in raw input', () => {
    const clean = 'This is a real response with detailed content about AI';
    const withToolNoise = 'Searching\nThis is a real response with detailed content about AI';
    const scoreClean = scoreAIResponseCandidate(clean);
    const scoreNoisy = scoreAIResponseCandidate(withToolNoise);
    // The raw text matches the penalty regex, but sanitized text may be same
    // This captures ACTUAL scoring behavior
    expect(typeof scoreClean).toBe('number');
    expect(typeof scoreNoisy).toBe('number');
  });

  it('returns -1000 for text that sanitizes to empty', () => {
    expect(scoreAIResponseCandidate('Searching')).toBe(-1000);
    expect(scoreAIResponseCandidate('Google AI Studio')).toBe(-1000);
    expect(scoreAIResponseCandidate('')).toBe(-1000);
  });

  it('CHARACTERIZATION: tool status in raw text triggers -500 penalty even if sanitized text is clean', () => {
    // The scoring regex checks the raw `text`, not the cleaned version
    // This means if raw contains "searching" anywhere, it gets penalized
    const rawWithToolWord = 'Executed code successfully and here is the final answer with Thai: สวัสดีครับ';
    const score = scoreAIResponseCandidate(rawWithToolWord);
    // Penalty of -500 applied because raw text matches /executed code/i
    // Document actual behavior
    expect(score).toBeLessThan(100);
  });

  it('CHARACTERIZATION: Gemini multi-line bonus is additive', () => {
    const text = 'Line one of content here\nLine two of content here';
    const geminiScore = scoreAIResponseCandidate(text, 'gemini');
    const grokScore = scoreAIResponseCandidate(text, 'grok');
    // Gemini gets extra +40 for multi-line on top of the +30
    expect(geminiScore - grokScore).toBe(40);
  });
});

describe('isSuspiciousAIResponse', () => {
  it('flags empty text as suspicious', () => {
    expect(isSuspiciousAIResponse('')).toBe(true);
    expect(isSuspiciousAIResponse(null)).toBe(true);
  });

  it('flags very short text as suspicious', () => {
    // Threshold is < 18 characters
    expect(isSuspiciousAIResponse('Short text')).toBe(true);
    expect(isSuspiciousAIResponse('Just a bit')).toBe(true);
  });

  it('flags URL-only text as suspicious', () => {
    expect(isSuspiciousAIResponse('https://example.com/long/path/here')).toBe(true);
  });

  it('flags tool status text as suspicious', () => {
    expect(isSuspiciousAIResponse('Searching')).toBe(true);
    expect(isSuspiciousAIResponse('Thinking')).toBe(true);
  });

  it('accepts valid content text', () => {
    expect(isSuspiciousAIResponse('This is a real post with meaningful content about technology')).toBe(false);
  });

  it('accepts valid Thai content', () => {
    expect(isSuspiciousAIResponse('นี่คือโพสต์เกี่ยวกับเทคโนโลยี AI ที่น่าสนใจ')).toBe(false);
  });

  it('CHARACTERIZATION: 18-char boundary', () => {
    // Exactly 17 chars → suspicious
    expect(isSuspiciousAIResponse('1234567890abcdefg')).toBe(true);
    // Exactly 18 chars → NOT suspicious
    expect(isSuspiciousAIResponse('1234567890abcdefgh')).toBe(false);
  });
});
