import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const sidepanelSource = readFileSync(resolve(__dirname, '../../sidepanel.js'), 'utf-8');
const sidepanelHtml = readFileSync(resolve(__dirname, '../../sidepanel.html'), 'utf-8');
const backgroundSource = readFileSync(resolve(__dirname, '../../background.js'), 'utf-8');

describe('Sidepanel Bootstrap Smoke — Regression Net', () => {

    // --- Structural safety: the 8ab64dd bug class ---
    describe('function scope safety', () => {
        it('no function declarations nested inside another function body', () => {
            const stripped = sidepanelSource
                .replace(/\/\/.*$/gm, '')
                .replace(/\/\*[\s\S]*?\*\//g, '')
                .replace(/`(?:\\[\s\S]|[^`])*`/g, '""')
                .replace(/'(?:\\.|[^'])*'/g, '""')
                .replace(/"(?:\\.|[^"])*"/g, '""');

            const funcPattern = /^\s*(?:async\s+)?function\s+(\w+)/gm;
            let match;

            while ((match = funcPattern.exec(stripped)) !== null) {
                const name = match[1];
                const before = stripped.substring(0, match.index);
                let depth = 0;
                for (const ch of before) {
                    if (ch === '{') depth++;
                    if (ch === '}') depth--;
                }
                expect(
                    depth,
                    `Function "${name}" must be at IIFE scope (depth 1), found depth ${depth}`
                ).toBe(1);
            }
        });
    });

    // --- Operator-critical controls must have DOM elements ---
    describe('operator-critical DOM contract', () => {
        const criticalIds = [
            'btnAutoScout',
            'forceStopAiBtn',
            'forceStopAiFromStatus',
            'clearQueueBtn',
            'clearResultsBtn',
            'clearDrafts',
            'clearFound',
            'statusBar',
            'statusText',
        ];

        for (const id of criticalIds) {
            it(`DOM element #${id} exists in sidepanel.html`, () => {
                expect(sidepanelHtml).toContain(`id="${id}"`);
            });
        }
    });

    // --- Critical observers must always bind ---
    describe('critical observers', () => {
        it('chrome.runtime.onMessage listener is bound', () => {
            expect(sidepanelSource).toContain('chrome.runtime.onMessage.addListener');
        });

        it('chrome.storage.onChanged listener is bound', () => {
            expect(sidepanelSource).toContain('chrome.storage.onChanged.addListener');
        });

        it('critical observers are NOT inside a try-catch boot slice', () => {
            // These must be at the unguarded level to guarantee they always bind
            const runtimeListenerIdx = sidepanelSource.indexOf('chrome.runtime.onMessage.addListener');
            const storageListenerIdx = sidepanelSource.indexOf('chrome.storage.onChanged.addListener');

            // Both must exist after the action buttons try-catch closes
            const actionCatchIdx = sidepanelSource.indexOf('[Xafi] Action buttons binding failed');
            expect(runtimeListenerIdx).toBeGreaterThan(actionCatchIdx);
            expect(storageListenerIdx).toBeGreaterThan(actionCatchIdx);
        });
    });

    // --- Guarded boot slices ---
    describe('boot slice isolation', () => {
        it('data loaders are wrapped in try-catch', () => {
            expect(sidepanelSource).toContain('[Xafi] Data loader init failed');
        });

        it('settings binding is wrapped in try-catch', () => {
            expect(sidepanelSource).toContain('[Xafi] Settings binding failed');
        });

        it('action buttons are wrapped in try-catch', () => {
            expect(sidepanelSource).toContain('[Xafi] Action buttons binding failed');
        });
    });

    // --- Settings contract ---
    describe('settings degradation safety', () => {
        it('loadSettings uses null-safe DOM helpers', () => {
            const body = sidepanelSource.match(/async function loadSettings\(\)\s*\{[\s\S]*?^\s{4}\}/m);
            expect(body).toBeTruthy();
            const unsafeAssignments = body[0].match(/\$\([^)]+\)\.(value|checked)\s*=/g);
            expect(unsafeAssignments).toBeNull();
        });

        it('save-settings uses null-safe helpers with fallbacks', () => {
            expect(sidepanelSource).toContain("getVal('#promptMode', 'soft-sell')");
            expect(sidepanelSource).toContain("getVal('#promptTemplate', '')");
            expect(sidepanelSource).toContain("getVal('#aiProvider', 'grok')");
        });

        it('normalizeSettings always spreads DEFAULT_SETTINGS', () => {
            expect(backgroundSource).toContain('{ ...DEFAULT_SETTINGS, ...(settings || {}) }');
        });
    });

    // --- Message contract ---
    describe('operator-critical message types', () => {
        const criticalMessages = [
            'GET_AUTO_SCOUT_STATE',
            'SET_AUTO_SCOUT_STATE',
            'CLEAR_PROCESS_QUEUE',
            'CLEAR_RESULTS',
            'GET_SETTINGS',
            'SAVE_SETTINGS',
        ];

        for (const msg of criticalMessages) {
            it(`background.js handles ${msg}`, () => {
                expect(backgroundSource).toContain(`case '${msg}':`);
            });

            it(`sidepanel.js sends ${msg}`, () => {
                expect(sidepanelSource).toContain(`type: '${msg}'`);
            });
        }
    });
});

describe('Browser Truth Gate Checklist (docs)', () => {
    it('bootstrap comment documents boot order', () => {
        expect(sidepanelSource).toContain('BOOT ORDER:');
    });

    it('bootstrap comment documents operator-critical controls', () => {
        expect(sidepanelSource).toContain('OPERATOR-CRITICAL CONTROLS');
    });

    it('bootstrap comment documents known choke point', () => {
        expect(sidepanelSource).toContain('KNOWN CHOKE POINT');
    });

    it('bootstrap comment documents safety invariants', () => {
        expect(sidepanelSource).toContain('SAFETY INVARIANTS');
    });
});
