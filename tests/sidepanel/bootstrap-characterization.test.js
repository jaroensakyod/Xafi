import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const sidepanelSource = readFileSync(resolve(__dirname, '../../sidepanel.js'), 'utf-8');

/**
 * Strip strings, template literals, and comments from JS source
 * so brace-depth counting isn't fooled by literal characters.
 */
function stripStringsAndComments(source) {
    return source
        .replace(/\/\/.*$/gm, '')
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .replace(/`(?:\\[\s\S]|[^`])*`/g, '""')
        .replace(/'(?:\\.|[^'])*'/g, '""')
        .replace(/"(?:\\.|[^"])*"/g, '""');
}

describe('Sidepanel Bootstrap Characterization', () => {
    it('critical observers must be present', () => {
        expect(sidepanelSource).toContain('chrome.runtime.onMessage.addListener');
        expect(sidepanelSource).toContain('chrome.storage.onChanged.addListener');
    });

    it('no function declarations nested inside another function body', () => {
        // Catches the exact bug class from commit 8ab64dd:
        // a function defined inside another function's braces is invisible
        // to IIFE top-level callers, causing ReferenceError on bootstrap.
        const stripped = stripStringsAndComments(sidepanelSource);
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
            const lineNum = before.split('\n').length;
            expect(
                depth,
                `Function "${name}" (line ~${lineNum}) must be at IIFE scope (depth 1), found depth ${depth}`
            ).toBe(1);
        }
    });

    it('operator-critical DOM bindings use null-safe access', () => {
        const lines = sidepanelSource.split('\n');
        const criticalIds = ['saveSettings', 'clearDrafts', 'clearFound'];

        for (const id of criticalIds) {
            const bindingLines = lines.filter(l =>
                l.includes(`'#${id}'`) && l.includes('addEventListener')
            );
            expect(bindingLines.length, `#${id} must have at least one binding`).toBeGreaterThan(0);
            for (const line of bindingLines) {
                expect(line, `#${id} binding must use ?.addEventListener`).toMatch(/\?\.\s*addEventListener/);
            }
        }
    });

    it('bootstrap order: data loaders are called', () => {
        const loaders = [
            'loadDrafts()',
            'loadResults()',
            'loadViralPosts()',
            'loadProcessQueue()',
            'loadGoogleTrends()',
            'loadSettings()',
            'loadCampaign()',
        ];
        for (const call of loaders) {
            expect(sidepanelSource, `Missing data loader call: ${call}`).toContain(call);
        }
    });
});
