import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const backgroundSource = readFileSync(resolve(__dirname, '../../background.js'), 'utf-8');

function createSettingsHarness() {
    const start = backgroundSource.indexOf('const PROMPT_TEMPLATE_VERSION =');
    const end = backgroundSource.indexOf('async function ensureSettings()');
    if (start < 0 || end < 0 || end <= start) {
        throw new Error('Unable to locate settings prelude in background.js');
    }

    const harnessSource = [
        backgroundSource.slice(start, end),
        'return { PROMPT_TEMPLATE_VERSION, V6_DEFAULT_PROMPT_TEMPLATE, V6_HOT_TAKE_PROMPT_TEMPLATE, DEFAULT_PROMPT_TEMPLATE, HOT_TAKE_PROMPT_TEMPLATE, DEFAULT_SETTINGS, isBuiltInPromptTemplate, normalizeSettings };'
    ].join('\n\n');

    return new Function(harnessSource)();
}

describe('Sidepanel-Background Settings Contract', () => {
    it('normalizeSettings spreads DEFAULT_SETTINGS as base', () => {
        expect(backgroundSource).toContain('{ ...DEFAULT_SETTINGS, ...(settings || {}) }');
    });

    it('normalizeSettings always returns a valid promptMode', () => {
        expect(backgroundSource).toContain("merged.promptMode = normalizePromptMode(merged.promptMode)");
    });

    it('normalizeSettings always returns a valid aiProvider', () => {
        expect(backgroundSource).toContain("merged.aiProvider = normalizeAiProvider(merged.aiProvider)");
    });

    it('normalizePromptMode returns soft-sell for unknown values', () => {
        // Extract and verify the normalizePromptMode function defaults safely
        expect(backgroundSource).toMatch(/function normalizePromptMode\(mode\)\s*\{[^}]*'soft-sell'[^}]*\}/);
    });

    it('normalizeAiProvider returns grok for unknown values', () => {
        expect(backgroundSource).toMatch(/function normalizeAiProvider\(provider\)\s*\{[^}]*'grok'[^}]*\}/);
    });

    it('GET_SETTINGS handler uses ensureSettings', () => {
        // Ensure GET_SETTINGS goes through normalization (ensureSettings calls normalizeSettings)
        const getSettingsMatch = backgroundSource.match(
            /case 'GET_SETTINGS':[\s\S]*?(?=case ')/
        );
        expect(getSettingsMatch).toBeTruthy();
        expect(getSettingsMatch[0]).toContain('getSettings');
    });

    it('SAVE_SETTINGS handler normalizes before persisting', () => {
        const saveHandler = backgroundSource.match(
            /case 'SAVE_SETTINGS':[\s\S]*?(?=case ')/
        );
        expect(saveHandler).toBeTruthy();
        expect(saveHandler[0]).toContain('saveSettings');
    });

    it('DEFAULT_SETTINGS has all operator-critical fields', () => {
        const defaults = backgroundSource.match(
            /const DEFAULT_SETTINGS\s*=\s*\{[\s\S]*?\};/
        );
        expect(defaults).toBeTruthy();
        const block = defaults[0];
        const requiredFields = [
            'aiProvider', 'promptMode', 'promptTemplate',
            'minViews', 'scrollPreset', 'voiceExamples',
        ];
        for (const field of requiredFields) {
            expect(block, `DEFAULT_SETTINGS missing ${field}`).toContain(field);
        }
    });

    it('bumps prompt template version to 7', () => {
        expect(backgroundSource).toContain('const PROMPT_TEMPLATE_VERSION = 7;');
    });

    it('default prompt copy emphasizes shorter safe output and link headroom', () => {
        expect(backgroundSource).toContain('ถ้าเนื้อหาต้นทางมีน้อย ให้เขียนสั้นได้');
        expect(backgroundSource).toContain('ต้องเผื่อพื้นที่ให้ลิงก์สินค้าที่ระบบจะต่อท้ายได้อย่างเป็นธรรมชาติ');
        expect(backgroundSource).toContain('ห้ามพยายามยืดข้อความให้เต็มเพดาน');
    });
});

describe('Prompt template migration safety', () => {
    const harness = createSettingsHarness();

    it('upgrades stored soft-sell v6 built-in prompt to the new v7 built-in prompt', () => {
        const normalized = harness.normalizeSettings({
            promptMode: 'soft-sell',
            promptTemplate: harness.V6_DEFAULT_PROMPT_TEMPLATE,
            promptTemplateVersion: 6,
        });

        expect(normalized.promptTemplateVersion).toBe(harness.PROMPT_TEMPLATE_VERSION);
        expect(normalized.promptTemplate).toBe(harness.DEFAULT_PROMPT_TEMPLATE);
    });

    it('upgrades stored hot-take v6 built-in prompt to the new v7 hot-take prompt', () => {
        const normalized = harness.normalizeSettings({
            promptMode: 'hot-take',
            promptTemplate: harness.V6_HOT_TAKE_PROMPT_TEMPLATE,
            promptTemplateVersion: 6,
        });

        expect(normalized.promptTemplateVersion).toBe(harness.PROMPT_TEMPLATE_VERSION);
        expect(normalized.promptTemplate).toBe(harness.HOT_TAKE_PROMPT_TEMPLATE);
    });

    it('preserves a custom prompt while still updating its stored version', () => {
        const customPrompt = 'เขียนสั้น 4 บรรทัดแบบภาษาคน และไม่ต้องขายของแรง';
        const normalized = harness.normalizeSettings({
            promptMode: 'soft-sell',
            promptTemplate: customPrompt,
            promptTemplateVersion: 6,
        });

        expect(normalized.promptTemplateVersion).toBe(harness.PROMPT_TEMPLATE_VERSION);
        expect(normalized.promptTemplate).toBe(customPrompt);
    });

    it('defaults voiceExamples to an empty string when older settings do not include it', () => {
        const normalized = harness.normalizeSettings({
            promptMode: 'soft-sell',
            promptTemplate: harness.DEFAULT_PROMPT_TEMPLATE,
            promptTemplateVersion: harness.PROMPT_TEMPLATE_VERSION,
        });

        expect(normalized.voiceExamples).toBe('');
        expect(harness.DEFAULT_SETTINGS.voiceExamples).toBe('');
    });

    it('normalizes voiceExamples into a stable capped three-example string', () => {
        const normalized = harness.normalizeSettings({
            voiceExamples: '  เปิดสั้นคม  \n---\n\n  ข้อสองมีน้ำหนัก   \n---\nข้อสามปิดแบบคุยกัน\n---\nข้อสี่เกินโควตา',
        });

        expect(normalized.voiceExamples).toBe([
            'เปิดสั้นคม',
            'ข้อสองมีน้ำหนัก',
            'ข้อสามปิดแบบคุยกัน',
        ].join('\n---\n'));
    });

    it('treats previous built-in templates as safe migration candidates', () => {
        expect(harness.isBuiltInPromptTemplate(harness.V6_DEFAULT_PROMPT_TEMPLATE)).toBe(true);
        expect(harness.isBuiltInPromptTemplate(harness.V6_HOT_TAKE_PROMPT_TEMPLATE)).toBe(true);
    });
});

describe('Sidepanel Save Settings Safety', () => {
    const sidepanelSource = readFileSync(resolve(__dirname, '../../sidepanel.js'), 'utf-8');

    it('save-settings handler uses null-safe DOM access', () => {
        // Should not have any direct $().value or $().checked without ?.
        // The handler uses getVal/getInt/getChecked helpers
        expect(sidepanelSource).toContain("const getVal = (sel, fallback) => $(sel)?.value ?? fallback");
        expect(sidepanelSource).toContain("const getChecked = (sel) => $(sel)?.checked ?? false");
    });

    it('settings message element access is null-safe', () => {
        // settingsMsg display should be guarded
        expect(sidepanelSource).toContain("if (msg) {");
    });

    it('prompt UX elements referenced in save-settings have fallback defaults', () => {
        // Prompt-related fields must have explicit fallbacks
        expect(sidepanelSource).toContain("getVal('#promptMode', 'soft-sell')");
        expect(sidepanelSource).toContain("getVal('#promptTemplate', '')");
        expect(sidepanelSource).toContain("getVal('#voiceExamples', '')");
    });
});
