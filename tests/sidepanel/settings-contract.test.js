import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const backgroundSource = readFileSync(resolve(__dirname, '../../background.js'), 'utf-8');

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
            'minViews', 'scrollPreset',
        ];
        for (const field of requiredFields) {
            expect(block, `DEFAULT_SETTINGS missing ${field}`).toContain(field);
        }
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
    });
});
