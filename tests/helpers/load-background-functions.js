import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import vm from 'node:vm';

const BACKGROUND_SOURCE = readFileSync(resolve(process.cwd(), 'background.js'), 'utf8');

const FUNCTION_END_MARKERS = {
  normalizePromptMode: 'function normalizeAiProvider(',
  sanitizeSourceText: 'function buildPrompt(',
  buildPrompt: 'function buildFinalPostText(',
  getBodyCharacterBudget: 'function trimToCharLimit(',
  getCharCount: 'function debugDraftSave(',
  isAiWrapperOnlyLine: 'function stripAiWrapperLeadIns(',
  stripAiWrapperLeadIns: 'function stripAiWrapperText(',
  stripAiWrapperText: 'function joinPostSegments(',
};

function extractFunctionSource(name) {
  const startMarker = `function ${name}(`;
  const start = BACKGROUND_SOURCE.indexOf(startMarker);
  if (start === -1) {
    throw new Error(`Unable to find ${name} in background.js`);
  }

  const endMarker = FUNCTION_END_MARKERS[name];
  const end = endMarker ? BACKGROUND_SOURCE.indexOf(endMarker, start) : -1;
  if (end === -1) {
    throw new Error(`Unable to find end marker for ${name} in background.js`);
  }

  return BACKGROUND_SOURCE.slice(start, end).trim();
}

export function loadBackgroundFunctions(functionNames, injectedContext = {}) {
  const context = vm.createContext({
    console,
    ...injectedContext,
  });

  const source = functionNames
    .map((name) => extractFunctionSource(name))
    .join('\n\n');

  new vm.Script(`${source}\nthis.__loadedFunctions = { ${functionNames.join(', ')} };`).runInContext(context);

  return context.__loadedFunctions;
}