import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const backgroundSource = readFileSync(resolve(__dirname, '../../background.js'), 'utf-8');
const sidepanelSource = readFileSync(resolve(__dirname, '../../sidepanel.js'), 'utf-8');
const sidepanelHtml = readFileSync(resolve(__dirname, '../../sidepanel.html'), 'utf-8');

function extractFunction(source, name) {
    const start = source.indexOf(`function ${name}(`);
    if (start < 0) {
        throw new Error(`Function not found: ${name}`);
    }

    const bodyStart = source.indexOf('{', start);
    let depth = 0;
    for (let index = bodyStart; index < source.length; index += 1) {
        const char = source[index];
        if (char === '{') depth += 1;
        if (char === '}') depth -= 1;
        if (depth === 0) {
            return source.slice(start, index + 1);
        }
    }

    throw new Error(`Unclosed function: ${name}`);
}

function createBackgroundHarness() {
    const functionNames = [
        'normalizeWhitespace',
        'stripBulletPrefix',
        'isUrlOnly',
        'extractContentSegments',
        'ensureBulletLine',
        'enforceFourLinePostStructure',
        'buildStructuredSingleParagraph',
        'normalizeDraftStructure',
        'stripAiWrapperText',
        'joinPostSegments',
        'getCharCount',
        'getBodyCharacterBudget',
        'trimToCharLimit',
        'sanitizeSourceText',
        'normalizePromptMode',
        'parseVoiceExamples',
        'normalizeVoiceExamples',
        'buildVoiceExamplesContext',
        'clampNumber',
        'normalizeAutoQuoteIntervalRange',
        'buildPrompt',
        'buildFinalPostOutput',
        'buildFinalPostText',
        'createReviewRequiredError',
        'isReviewRequiredError',
        'getDraftSaveState',
    ];

    const functionBlock = functionNames.map((name) => extractFunction(backgroundSource, name)).join('\n\n');

    const harnessSource = [
        'const MAX_POST_LENGTH = 280;',
        'const AUTO_QUOTE_MIN_INTERVAL_MINUTES = 1;',
        'const AUTO_QUOTE_MAX_INTERVAL_MINUTES = 120;',
        'const MAX_VOICE_EXAMPLES = 3;',
        'const MAX_VOICE_EXAMPLE_CHARS = 280;',
        'const MAX_VOICE_EXAMPLES_TOTAL_CHARS = 900;',
        "const VOICE_EXAMPLES_SEPARATOR = '\\n---\\n';",
        "const REVIEW_REQUIRED_PREFIX = 'REVIEW_REQUIRED:';",
        "const DEFAULT_SETTINGS = { autoQuoteMinMinutes: 2, autoQuoteMaxMinutes: 5, promptTemplate: 'กฎ\\n{PRODUCT_CONTEXT}\\n\\nเนื้อหาต้นทาง:\\n{CONTENT}', voiceExamples: '' };",
        "const productLink = '';",
        functionBlock,
        'return { buildPrompt, buildFinalPostOutput, buildFinalPostText, normalizeAutoQuoteIntervalRange, getDraftSaveState, getCharCount, trimToCharLimit, isReviewRequiredError };'
    ].join('\n\n');

    return new Function(harnessSource)();
}

describe('Ticket 1 output ceiling behavior', () => {
    const harness = createBackgroundHarness();

    it('buildPrompt uses a ceiling contract instead of exact-length forcing', () => {
        const prompt = harness.buildPrompt(
            { text: 'ต้นทางมีรายละเอียดหลายบรรทัด #tag', productLink: 'https://example.com/p' },
            { promptMode: 'soft-sell', promptTemplate: 'เริ่ม\n{PRODUCT_CONTEXT}\n\n{CONTENT}' },
            'คอร์สสอนยิงแอด'
        );

        expect(prompt).toContain('ต้องยาวไม่เกิน');
        expect(prompt).toContain('สามารถสั้นกว่านี้ได้');
        expect(prompt).not.toContain('ตัวอักษรพอดี');
        expect(prompt).not.toContain('ต้องเท่ากับ 280');
    });

    it('buildPrompt omits the voice block when voiceExamples is empty', () => {
        const prompt = harness.buildPrompt(
            { text: 'ต้นทางมีรายละเอียดหลายบรรทัด', productLink: 'https://example.com/p' },
            { promptMode: 'soft-sell', promptTemplate: 'เริ่ม\n{PRODUCT_CONTEXT}\n\n{CONTENT}', voiceExamples: '' },
            'คอร์สสอนยิงแอด'
        );

        expect(prompt).not.toContain('ตัวอย่างน้ำเสียงของผู้ใช้');
    });

    it('buildPrompt injects up to three voice examples in stable order with tone-only guardrails', () => {
        const prompt = harness.buildPrompt(
            { text: 'ต้นทางมีรายละเอียดหลายบรรทัด', productLink: 'https://example.com/p' },
            {
                promptMode: 'soft-sell',
                promptTemplate: 'เริ่ม\n{PRODUCT_CONTEXT}\n\n{CONTENT}',
                voiceExamples: 'เปิดแรงแบบคุยกับเพื่อน\n---\nมีจังหวะหยอดนิดเดียว\n---\nปิดสั้นแต่คม\n---\nเกินโควตา'
            },
            'คอร์สสอนยิงแอด'
        );

        expect(prompt).toContain('ตัวอย่างน้ำเสียงของผู้ใช้');
        expect(prompt).toContain('1. เปิดแรงแบบคุยกับเพื่อน');
        expect(prompt).toContain('2. มีจังหวะหยอดนิดเดียว');
        expect(prompt).toContain('3. ปิดสั้นแต่คม');
        expect(prompt).not.toContain('เกินโควตา');
        expect(prompt).toContain('ห้ามยก fact, ตัวเลข, ชื่อเฉพาะ หรือ claim จากตัวอย่างมาใช้');
    });

    it('buildFinalPostText no longer pads shorter content to 280 chars', () => {
        const finalText = harness.buildFinalPostText(
            'เปิดประเด็นให้ชัด\n- ข้อแรก\n- ข้อสอง\nปิดให้คม',
            'https://example.com/p'
        );

        expect(harness.getCharCount(finalText)).toBeLessThan(280);
        expect(finalText.endsWith(' ')).toBe(false);
    });

    it('buildFinalPostOutput preserves overflow text for review instead of adding ellipsis', () => {
        const longSegment = 'ยาวมาก'.repeat(40);
        const output = harness.buildFinalPostOutput(
            `${longSegment}\n- ${longSegment}\n- ${longSegment}\n${longSegment}`,
            'https://example.com/product'
        );

        expect(output.overflow).toBe(true);
        expect(output.totalChars).toBeGreaterThan(280);
        expect(output.finalText).not.toContain('...');
    });

    it('trimToCharLimit performs hard trim without synthetic ellipsis', () => {
        expect(harness.trimToCharLimit('abcdef', 4)).toBe('abcd');
    });

    it('overflow draft state becomes review-needed instead of ready', () => {
        const state = harness.getDraftSaveState('x'.repeat(281));
        expect(state.status).toBe('post_error');
        expect(harness.isReviewRequiredError(state.postError)).toBe(true);
    });
});

describe('Ticket 1 interval normalization', () => {
    const harness = createBackgroundHarness();

    it('swaps min/max when operator enters reversed values', () => {
        expect(harness.normalizeAutoQuoteIntervalRange(5, 2)).toEqual({ minMinutes: 2, maxMinutes: 5 });
    });

    it('clamps zero values into the safe range', () => {
        expect(harness.normalizeAutoQuoteIntervalRange(0, 0)).toEqual({ minMinutes: 1, maxMinutes: 1 });
    });

    it('falls back to defaults when values are blank', () => {
        expect(harness.normalizeAutoQuoteIntervalRange('', '')).toEqual({ minMinutes: 2, maxMinutes: 5 });
    });
});

describe('Ticket 1 sidepanel regression net', () => {
    it('readiness badge no longer hard-requires exact 280 chars', () => {
        expect(sidepanelSource).toContain('const isWithinLimit = charCount <= 280;');
        expect(sidepanelSource).toContain('Quote-ready / ${charCount} chars');
        expect(sidepanelSource).not.toContain('const isExactLength = getCharCount(text) === 280;');
    });

    it('save success message explains normalized full-auto spacing', () => {
        expect(sidepanelSource).toContain('Full Auto จะเว้นช่วงประมาณ');
    });

    it('interval UI explains that min/max control spacing between posting runs', () => {
        expect(sidepanelHtml).toContain('ระบบจะสุ่มช่วงเวลานี้ทุกครั้งก่อนเริ่มโพสต์รอบถัดไป');
    });
});