// =============================================
// Gemini DOM Fixtures for Characterization Tests
// =============================================
// Creates representative Gemini-like DOM structures in jsdom
// for testing response selection without live browser.
// =============================================

/**
 * Builds a Gemini conversation DOM with multiple model responses.
 * @param {Array<{text: string, classes?: string[]}>} responses
 * @returns {HTMLElement} - container element
 */
export function buildGeminiConversation(responses) {
  const container = document.createElement('div');
  container.className = 'conversation-container';

  for (const resp of responses) {
    const modelResponse = document.createElement('model-response');
    const messageContent = document.createElement('message-content');
    const markdown = document.createElement('div');
    markdown.className = 'markdown';
    markdown.textContent = resp.text;

    if (resp.classes) {
      resp.classes.forEach(cls => modelResponse.classList.add(cls));
    }

    messageContent.appendChild(markdown);
    modelResponse.appendChild(messageContent);
    container.appendChild(modelResponse);
  }

  return container;
}

/**
 * Creates a single Gemini response block for targeted tests.
 * @param {string} text
 * @returns {HTMLElement}
 */
export function buildSingleResponse(text) {
  const modelResponse = document.createElement('model-response');
  const messageContent = document.createElement('message-content');
  const markdown = document.createElement('div');
  markdown.className = 'markdown';
  markdown.textContent = text;

  messageContent.appendChild(markdown);
  modelResponse.appendChild(messageContent);
  return modelResponse;
}

/**
 * Creates a DOM with mixed content: tool status + real responses.
 * Simulates a Gemini page where tool/status nodes coexist with real answers.
 * @param {object} opts
 * @param {string[]} opts.toolTexts - texts in tool/status areas
 * @param {string[]} opts.responseTexts - texts in actual response areas
 * @returns {HTMLElement}
 */
export function buildMixedGeminiPage(opts) {
  const container = document.createElement('div');
  container.className = 'conversation-container';

  // Tool/status blocks (these may appear as response-like elements)
  for (const text of (opts.toolTexts || [])) {
    const el = document.createElement('model-response');
    const content = document.createElement('message-content');
    content.textContent = text;
    el.appendChild(content);
    container.appendChild(el);
  }

  // Real response blocks
  for (const text of (opts.responseTexts || [])) {
    const el = document.createElement('model-response');
    const content = document.createElement('message-content');
    const md = document.createElement('div');
    md.className = 'markdown';
    md.textContent = text;
    content.appendChild(md);
    el.appendChild(content);
    container.appendChild(el);
  }

  return container;
}

/**
 * Simulates the cascading intermediate-block scenario:
 * Multiple response blocks where an intermediate one has more/higher-scoring
 * content than the final (latest) one.
 *
 * This is the KNOWN BUG scenario from the rollback.
 *
 * @param {object} opts
 * @param {string} opts.intermediateText - longer/higher-scoring intermediate block
 * @param {string} opts.finalText - shorter/lower-scoring final block (the real answer)
 * @returns {HTMLElement}
 */
export function buildIntermediateOutranksFinal(opts) {
  return buildGeminiConversation([
    { text: opts.intermediateText },
    { text: opts.finalText },
  ]);
}
