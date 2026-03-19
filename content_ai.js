// =============================================
// X Viral Repurpose - Content Script (AI provider page)
// =============================================
// จำลองการพิมพ์แบบมนุษย์บนหน้าเว็บ AI provider
// รับ Prompt จาก background → พิมพ์ทีละตัวอักษร → รอ AI ตอบ → ส่งกลับ
// =============================================

(function () {
    'use strict';

    if (window.__xvrAiLoaded) return;
    window.__xvrAiLoaded = true;

    let activeRequestId = null;
    let isProcessingPrompt = false;
    let lastCompletedRequestId = null;
    const aiProvider = getAiProviderMeta();

    // --- Selectors แบบยืดหยุ่น (อัปเดตได้เมื่อ DOM เปลี่ยน) ---
    const INPUT_SELECTORS = [
        'rich-textarea div[contenteditable="true"]',
        'textarea[aria-label*="Enter a prompt" i]',
        'textarea[aria-label*="Ask Gemini" i]',
        'textarea[placeholder*="Enter a prompt" i]',
        'textarea[placeholder*="Ask Gemini" i]',
        '[contenteditable="true"][aria-label*="Enter a prompt" i]',
        '[contenteditable="true"][aria-label*="Ask Gemini" i]',
        'ms-autosize-textarea textarea',
        'textarea[placeholder]',
        '[contenteditable="true"][role="textbox"]',
        '[contenteditable="true"][data-placeholder]',
        '[contenteditable="true"]',
        'textarea',
        '[role="textbox"]'
    ];

    const SEND_BUTTON_SELECTORS = [
        'button[type="submit"]',
        'button[aria-label*="Send message" i]',
        'button[aria-label*="Send prompt" i]',
        'button[aria-label*="Run" i]',
        'button[aria-label*="Send" i]',
        'button[aria-label*="send" i]',
        'button[aria-label*="Submit" i]',
        'button[data-test-id*="send"]',
        'button[mattooltip*="Send" i]',
        'button[mattooltip*="ส่ง" i]',
        'button[aria-label*="ส่ง"]',
        'button[data-testid="send-button"]',
        'message-actions button',
        'form button:last-of-type'
    ];

    const STOP_BUTTON_SELECTORS = [
        'button[aria-label*="Stop generating" i]',
        'button[aria-label*="Stop response" i]',
        'button[aria-label*="Stop" i]',
        'button[mattooltip*="Stop" i]',
        'button[aria-label*="หยุด"]'
    ];

    const RESPONSE_SELECTORS = [
        '.conversation-container model-response',
        '.conversation-container .response-content',
        '.conversation-container .markdown',
        'message-content .markdown',
        'message-content',
        'model-response',
        '.model-response-text',
        '[class*="response-content"]',
        '[class*="model-response"]',
        '[data-testid="message-content"]',
        '.message-content',
        '.markdown-content',
        '[class*="message"][class*="assistant"]',
        '[class*="response"]',
        '[role="article"]'
    ];

    // =============================================
    // 1) Message Listener - รับคำสั่งจาก background
    // =============================================
    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
        if (message.type === 'TYPE_PROMPT') {
            if (message.data?.requestId && message.data.requestId === lastCompletedRequestId) {
                sendResponse({ success: true, duplicate: true });
                return false;
            }

            if (isProcessingPrompt && message.data?.requestId && message.data.requestId === activeRequestId) {
                sendResponse({ success: true, duplicate: true, processing: true });
                return false;
            }

            processPrompt(message.data).then(sendResponse).catch(err => {
                isProcessingPrompt = false;
                sendResponse({ success: false, error: err.message });
                chrome.runtime.sendMessage({
                    type: 'AI_ERROR',
                    data: { error: err.message }
                });
            });
            return true; // async
        }
    });

    // แจ้ง background ว่าหน้า AI provider โหลดเสร็จแล้ว
    notifyPageReady();

    async function notifyPageReady() {
        // รอให้หน้าพร้อมก่อน
        await waitForPageLoad();
        chrome.runtime.sendMessage({ type: 'AI_PAGE_READY' });
    }

    // =============================================
    // 2) Main Process - กระบวนการหลัก
    // =============================================
    async function processPrompt(data) {
        const { prompt, settings, requestId } = data;

        if (!prompt) {
            throw new Error('ไม่พบ prompt ที่ต้องพิมพ์');
        }

        isProcessingPrompt = true;
        activeRequestId = requestId || `req-${Date.now()}`;

        updateStatus('กำลังหากล่องพิมพ์...');

        // 2.1) หากล่อง Input
        const inputEl = await waitForElement(INPUT_SELECTORS, 15000);
        if (!inputEl) {
            throw new Error(`ไม่พบช่องพิมพ์บน ${aiProvider.label} - DOM อาจเปลี่ยนแปลง`);
        }

        // 2.2) เคลียร์ข้อความเก่า (ถ้ามี)
        await clearInput(inputEl);
        await sleep(randomBetween(500, 1000));

        const responseBaseline = new Set(collectResponseCandidates());

        // 2.3) ใส่ Prompt ด้วยวิธีที่เหมาะกับแต่ละ provider
        updateStatus('กำลังพิมพ์ Prompt...');
        await fillPromptInput(inputEl, prompt, settings);

        // 2.4) รอสักครู่ก่อนกด Send (เหมือนคนอ่านทวนอีกที)
        await sleep(randomBetween(800, 1500));

        // 2.5) กดปุ่ม Send
        updateStatus('กำลังส่ง Prompt...');
        await clickSendButton(inputEl);

        const sendStarted = await waitForSendStart(inputEl, 10000);
        if (!sendStarted) {
            throw new Error('กดส่ง Prompt ไม่สำเร็จ');
        }

        // 2.6) รอ AI ประมวลผลและตอบกลับ
        updateStatus('กำลังรอ AI ตอบ...');
        const response = await waitForAIResponse(prompt, responseBaseline);

        if (!response) {
            throw new Error('AI ไม่ตอบภายในเวลาที่กำหนด');
        }

        // 2.7) ส่งผลลัพธ์กลับ background
        const copied = await tryCopyToClipboard(response);
        chrome.runtime.sendMessage({
            type: 'AI_RESPONSE_READY',
            data: { response, copied }
        });

        lastCompletedRequestId = activeRequestId;
        activeRequestId = null;
        isProcessingPrompt = false;
        updateStatus('เสร็จแล้ว!');
        return { success: true };
    }

    // =============================================
    // 3) Human-like Typing Engine 🧠
    // =============================================
    async function typeHumanLike(element, text, settings = {}) {
        const speedMin = settings.typingSpeedMin || 30;
        const speedMax = settings.typingSpeedMax || 150;
        const pauseEvery = settings.pauseEveryChars || 40;
        const pauseMin = settings.pauseMin || 300;
        const pauseMax = settings.pauseMax || 800;

        element.focus();
        await sleep(200);

        const isContentEditable = element.getAttribute('contenteditable') !== null
            || element.getAttribute('role') === 'textbox';

        let nextPauseAt = randomBetween(
            Math.floor(pauseEvery * 0.7),
            Math.floor(pauseEvery * 1.3)
        );

        for (let i = 0; i < text.length; i++) {
            const char = text[i];

            if (isContentEditable) {
                // --- ContentEditable (React-friendly) ---
                element.focus();

                // วาง cursor ไว้ท้ายสุด
                placeCursorAtEnd(element);

                // ยิง keyboard events ให้ครบ
                dispatchKeyEvents(element, char);

                // ใช้ execCommand เพื่อให้ React ตรวจจับได้
                document.execCommand('insertText', false, char);

            } else {
                // --- Textarea / Input ---
                const nativeSetter = Object.getOwnPropertyDescriptor(
                    HTMLTextAreaElement.prototype, 'value'
                )?.set || Object.getOwnPropertyDescriptor(
                    HTMLInputElement.prototype, 'value'
                )?.set;

                if (nativeSetter) {
                    nativeSetter.call(element, element.value + char);
                } else {
                    element.value += char;
                }

                // ยิง keyboard + input events
                dispatchKeyEvents(element, char);
                element.dispatchEvent(new Event('input', { bubbles: true }));
                element.dispatchEvent(new Event('change', { bubbles: true }));
            }

            // --- ดีเลย์สุ่มระหว่างตัวอักษร ---
            let delay = randomBetween(speedMin, speedMax);

            // พิมพ์เว้นวรรคเร็วกว่าปกติ
            if (char === ' ') delay = randomBetween(speedMin, speedMin + 30);
            // Newline ช้ากว่าปกติ
            if (char === '\n') delay = randomBetween(200, 500);
            // ตัวอักษรซ้ำๆ พิมพ์เร็วขึ้น
            if (i > 0 && text[i] === text[i - 1]) delay = randomBetween(speedMin, speedMin + 20);

            await sleep(delay);

            // --- หยุดพักหายใจเป็นระยะ ---
            if (i >= nextPauseAt) {
                await sleep(randomBetween(pauseMin, pauseMax));
                nextPauseAt = i + randomBetween(
                    Math.floor(pauseEvery * 0.7),
                    Math.floor(pauseEvery * 1.3)
                );
            }
        }
    }

    async function fillPromptInput(element, text, settings = {}) {
        const normalizedText = String(text || '');
        const isContentEditable = element.getAttribute('contenteditable') !== null
            || element.getAttribute('role') === 'textbox';

        element.focus();
        await sleep(150);

        if (isContentEditable) {
            placeCursorAtEnd(element);

            try {
                const dataTransfer = new DataTransfer();
                dataTransfer.setData('text/plain', normalizedText);
                const pasteEvent = new ClipboardEvent('paste', {
                    clipboardData: dataTransfer,
                    bubbles: true,
                    cancelable: true
                });
                element.dispatchEvent(pasteEvent);
            } catch {
                // ignore and fallback below
            }

            if (!inputContainsText(element, normalizedText)) {
                document.execCommand('insertText', false, normalizedText);
                element.dispatchEvent(new InputEvent('input', {
                    bubbles: true,
                    cancelable: true,
                    data: normalizedText,
                    inputType: 'insertText'
                }));
            }
        } else {
            const nativeSetter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')?.set
                || Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;

            if (nativeSetter) {
                nativeSetter.call(element, normalizedText);
            } else {
                element.value = normalizedText;
            }

            element.dispatchEvent(new Event('input', { bubbles: true }));
            element.dispatchEvent(new Event('change', { bubbles: true }));
        }

        await sleep(300);

        if (!inputContainsText(element, normalizedText)) {
            await clearInput(element);
            await sleep(250);
            await typeHumanLike(element, normalizedText, settings);
        }

        if (!inputContainsText(element, normalizedText)) {
            throw new Error(`ใส่ prompt ลง ${aiProvider.label} ไม่สำเร็จ`);
        }
    }

    // =============================================
    // 4) Keyboard Event Dispatcher
    // =============================================
    function dispatchKeyEvents(element, char) {
        const keyCode = char.charCodeAt(0);
        const key = char;

        const eventInit = {
            key,
            code: char === ' ' ? 'Space' : `Key${char.toUpperCase()}`,
            keyCode,
            which: keyCode,
            bubbles: true,
            cancelable: true,
            composed: true
        };

        element.dispatchEvent(new KeyboardEvent('keydown', eventInit));
        element.dispatchEvent(new KeyboardEvent('keypress', eventInit));
        element.dispatchEvent(new KeyboardEvent('keyup', eventInit));
    }

    // =============================================
    // 5) Send Button Handler
    // =============================================
    async function clickSendButton(input) {
        const candidates = collectSendButtons(input);
        for (const btn of candidates) {
            if (!btn || btn.disabled || !isVisible(btn)) continue;
            btn.focus?.();
            btn.click();
            await sleep(400);
            if (await waitForSendStart(input, 1200)) return;
        }

        pressEnter(input);
        await sleep(500);
        if (await waitForSendStart(input, 1500)) return;

        throw new Error(`ไม่พบปุ่มส่งของ ${aiProvider.label}`);
    }

    function collectSendButtons(input) {
        const buttons = [];
        const pushButton = (button) => {
            if (!button || buttons.includes(button)) return;
            buttons.push(button);
        };

        const form = input?.closest('form');
        if (form) {
            Array.from(form.querySelectorAll('button')).forEach(pushButton);
        }

        const composerRoot = input?.closest('[class*="composer"], [class*="input"], [class*="chat"], [role="group"]') || input?.parentElement;
        if (composerRoot) {
            Array.from(composerRoot.querySelectorAll('button')).forEach(pushButton);
        }

        const providerRoot = input?.closest('form, rich-textarea, .conversation-container, .chat-input-container, body');
        if (providerRoot) {
            Array.from(providerRoot.querySelectorAll('button')).forEach(pushButton);
        }

        for (const selector of SEND_BUTTON_SELECTORS) {
            const button = document.querySelector(selector);
            pushButton(button);
        }

        return buttons
            .filter(Boolean)
            .sort((a, b) => scoreSendButton(b) - scoreSendButton(a));
    }

    function scoreSendButton(button) {
        const text = `${button.getAttribute('aria-label') || ''} ${button.textContent || ''} ${button.innerHTML || ''}`.toLowerCase();
        let score = 0;
        if (button.type === 'submit') score += 50;
        if (/send|submit|ส่ง/.test(text)) score += 80;
        if (/gemini|run|prompt/.test(text)) score += 30;
        if (/arrow|up|paper-plane|rocket|submit/.test(text)) score += 40;
        if (button.closest('message-actions, form, rich-textarea')) score += 20;
        if (button.querySelector('svg')) score += 10;
        if (button.disabled) score -= 200;
        return score;
    }

    async function waitForSendStart(input, timeout = 5000) {
        const startedAt = Date.now();
        while (Date.now() - startedAt < timeout) {
            const stopBtn = queryAny(STOP_BUTTON_SELECTORS);
            const currentText = getInputText(input);
            if (stopBtn || !currentText.trim()) {
                return true;
            }
            await sleep(200);
        }
        return false;
    }

    // =============================================
    // 6) Wait for AI Response
    // =============================================
    async function waitForAIResponse(promptText = '', baselineCandidates = new Set(), timeout = 120000) {
        const startTime = Date.now();
        let lastText = '';
        let lastUsableText = '';
        let stableCount = 0;
        let suspiciousRetryUsed = false;
        const STABLE_THRESHOLD = 6; // ข้อความไม่เปลี่ยน 6 ครั้ง (3 วินาที) = เสร็จ

        // รอให้ AI เริ่มตอบ (1-5 วินาที)
        await sleep(2000);

        while (Date.now() - startTime < timeout) {
            const currentText = getLastAIMessage(promptText, baselineCandidates);
            const usableText = sanitizeAIResponseText(currentText);

            if (currentText && currentText !== lastText) {
                // ข้อความกำลังเปลี่ยน = AI ยังพิมพ์อยู่
                lastText = currentText;
                stableCount = 0;
                if (usableText) {
                    lastUsableText = usableText;
                }
            } else if (currentText && currentText === lastText) {
                // ข้อความเหมือนเดิม
                stableCount++;

                if (usableText) {
                    lastUsableText = usableText;
                }

                if (stableCount >= STABLE_THRESHOLD) {
                    // เช็คว่าไม่มีปุ่ม "Stop" แล้ว (= AI พิมพ์เสร็จจริง)
                    const stopBtn = queryAny(STOP_BUTTON_SELECTORS);

                    if (!stopBtn) {
                        debugAIResponse('stable-response', currentText, lastUsableText || usableText);

                        if (lastUsableText && !isSuspiciousAIResponse(lastUsableText)) {
                            return lastUsableText;
                        }

                        if (!suspiciousRetryUsed) {
                            suspiciousRetryUsed = true;
                            stableCount = 0;
                            updateStatus('คำตอบยังไม่ใช่โพสต์จริง กำลังรอคำตอบรอบถัดไป...');
                            debugAIResponse('retry-suspicious-response', currentText, lastUsableText || usableText);
                            await sleep(2500);
                            continue;
                        }

                        if (lastUsableText) {
                            return lastUsableText;
                        }
                    }
                }
            }

            await sleep(500);
        }

        // Timeout - ส่งข้อความล่าสุดถ้ามี
        const fallbackText = lastUsableText || sanitizeAIResponseText(lastText) || null;
        debugAIResponse('timeout-response', lastText, fallbackText);
        return fallbackText;
    }

    // =============================================
    // 7) Extract Last AI Message
    // =============================================
    function getLastAIMessage(promptText = '', baselineCandidates = new Set()) {
        const candidates = collectResponseCandidates()
            .filter(text => !baselineCandidates.has(text))
            .filter(text => !isPromptEcho(text, promptText));

        if (!candidates.length) return null;

        const ranked = candidates
            .map(text => ({
                raw: text,
                clean: sanitizeAIResponseText(text),
                score: scoreAIResponseCandidate(text)
            }))
            .sort((a, b) => b.score - a.score);

        return ranked[0]?.raw || null;
    }

    function collectResponseCandidates() {
        const texts = [];

        if (aiProvider.key === 'gemini') {
            document.querySelectorAll('message-content, model-response, .response-content, .markdown, .model-response-text').forEach((element) => {
                const text = element.innerText?.trim();
                if (text) texts.push(text);
            });
        }

        for (const selector of RESPONSE_SELECTORS) {
            document.querySelectorAll(selector).forEach((element) => {
                const text = element.innerText?.trim();
                if (text) texts.push(text);
            });
        }

        document.querySelectorAll('[class*="message"], [class*="Message"], .prose, [class*="markdown"], [class*="Markdown"]').forEach((element) => {
            const text = element.innerText?.trim();
            if (text) texts.push(text);
        });

        return Array.from(new Set(texts));
    }

    function isPromptEcho(candidateText, promptText) {
        const candidate = sanitizeComparableText(candidateText);
        const prompt = sanitizeComparableText(promptText);

        if (!candidate || !prompt) return false;

        if (candidate === prompt) return true;
        if (candidate.startsWith(prompt.slice(0, Math.min(prompt.length, 80)))) return true;
        if (prompt.startsWith(candidate) && candidate.length > 60) return true;

        const overlap = longestCommonPrefix(candidate, prompt).length;
        return overlap >= Math.min(120, Math.floor(prompt.length * 0.6));
    }

    function sanitizeComparableText(text) {
        return String(text || '')
            .replace(/\s+/g, ' ')
            .trim()
            .toLowerCase();
    }

    function longestCommonPrefix(a, b) {
        const max = Math.min(a.length, b.length);
        let index = 0;
        while (index < max && a[index] === b[index]) {
            index += 1;
        }
        return a.slice(0, index);
    }

    function sanitizeAIResponseText(text) {
        if (!text) return '';

        const cleaned = String(text)
            .split('\n')
            .map(line => line.trim())
            .filter(line => line && !isToolStatusLine(line))
            .join('\n')
            .replace(/\n{3,}/g, '\n\n')
            .trim();

        if (!cleaned || isMostlyUrl(cleaned) || isToolStatusLine(cleaned)) {
            return '';
        }

        if (/google ai studio|double-check responses|gemini can make mistakes|draft saved/i.test(cleaned)) {
            return '';
        }

        return cleaned;
    }

    function isSuspiciousAIResponse(text) {
        const cleaned = sanitizeAIResponseText(text);
        if (!cleaned) return true;

        if (isMostlyUrl(cleaned)) return true;
        if (cleaned.length < 18) return true;
        if (isToolStatusLine(cleaned)) return true;

        return false;
    }

    function scoreAIResponseCandidate(text) {
        const clean = sanitizeAIResponseText(text);
        if (!clean) return -1000;

        let score = 0;
        score += Math.min(clean.length, 400);

        if (/[ก-๙]/.test(clean)) score += 120;
        if (/\n/.test(clean)) score += 30;
        if (/^[-•]/m.test(clean)) score += 25;
        if (aiProvider.key === 'gemini' && /\n/.test(clean)) score += 40;
        if (isMostlyUrl(clean)) score -= 300;
        if (/executed code|searching|thinking|analyzing|read more|sources?|search results?|used tools?|reasoned for|google ai studio|gemini can make mistakes|draft saved/i.test(text)) score -= 500;

        return score;
    }

    function isToolStatusLine(line) {
        return /^(executed code|searching|thinking|analyzing|reasoned for.*|read more|view all|sources?.*|search results?.*|used tools?.*)$/i.test(String(line || '').trim());
    }

    function isMostlyUrl(text) {
        const trimmed = String(text || '').trim();
        if (!trimmed) return false;

        const withoutUrls = trimmed.replace(/https?:\/\/\S+|www\.\S+/gi, '').trim();
        return withoutUrls.length < 12;
    }

    function debugAIResponse(label, rawText, cleanedText) {
        try {
            console.groupCollapsed(`[XVR-AI] ${label}`);
            console.log('raw response:', rawText || '');
            console.log('cleaned response:', cleanedText || '');
            console.log('raw length:', Array.from(rawText || '').length);
            console.log('cleaned length:', Array.from(cleanedText || '').length);
            console.groupEnd();
        } catch {
            console.log(`[XVR-AI] ${label}`);
            console.log('raw response:', rawText || '');
            console.log('cleaned response:', cleanedText || '');
        }
    }

    // =============================================
    // 8) Input Helpers
    // =============================================
    async function clearInput(element) {
        element.focus();

        if (element.getAttribute('contenteditable') !== null || element.getAttribute('role') === 'textbox') {
            // Select all & delete
            element.focus();
            document.execCommand('selectAll', false, null);
            document.execCommand('delete', false, null);
            element.dispatchEvent(new InputEvent('input', { bubbles: true, cancelable: true, data: '', inputType: 'deleteContentBackward' }));
        } else {
            const nativeSetter = Object.getOwnPropertyDescriptor(
                HTMLTextAreaElement.prototype, 'value'
            )?.set;
            if (nativeSetter) {
                nativeSetter.call(element, '');
            } else {
                element.value = '';
            }
            element.dispatchEvent(new Event('input', { bubbles: true }));
        }
    }

    function getInputText(element) {
        if (!element) return '';
        if (element.getAttribute('contenteditable') !== null || element.getAttribute('role') === 'textbox') {
            return element.innerText || element.textContent || '';
        }
        return element.value || '';
    }

    function inputContainsText(element, text) {
        const current = getInputText(element)
            .replace(/\s+/g, ' ')
            .trim();
        const expected = String(text || '')
            .replace(/\s+/g, ' ')
            .trim();
        if (!current || !expected) return false;

        const sampleLength = aiProvider.key === 'gemini' ? 20 : 32;
        return current.includes(expected.slice(0, Math.min(expected.length, sampleLength)));
    }

    function pressEnter(element) {
        if (!element) return;
        const init = {
            key: 'Enter',
            code: 'Enter',
            keyCode: 13,
            which: 13,
            bubbles: true,
            cancelable: true,
            composed: true
        };
        element.dispatchEvent(new KeyboardEvent('keydown', init));
        element.dispatchEvent(new KeyboardEvent('keypress', init));
        element.dispatchEvent(new KeyboardEvent('keyup', init));
    }

    function isVisible(element) {
        if (!element) return false;
        const style = window.getComputedStyle(element);
        const rect = element.getBoundingClientRect();
        return style.display !== 'none' && style.visibility !== 'hidden' && rect.width > 0 && rect.height > 0;
    }

    function placeCursorAtEnd(element) {
        const selection = window.getSelection();
        if (!selection) return;
        const range = document.createRange();
        range.selectNodeContents(element);
        range.collapse(false); // false = collapse to end
        selection.removeAllRanges();
        selection.addRange(range);
    }

    // =============================================
    // 9) Utilities
    // =============================================
    function sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    function randomBetween(min, max) {
        return Math.floor(Math.random() * (max - min + 1)) + min;
    }

    function waitForElement(selectors, timeout = 10000) {
        return new Promise((resolve) => {
            for (const sel of selectors) {
                const el = document.querySelector(sel);
                if (el) return resolve(el);
            }

            const observer = new MutationObserver(() => {
                for (const sel of selectors) {
                    const el = document.querySelector(sel);
                    if (el) {
                        observer.disconnect();
                        return resolve(el);
                    }
                }
            });

            observer.observe(document.body, { childList: true, subtree: true });

            setTimeout(() => {
                observer.disconnect();
                resolve(null);
            }, timeout);
        });
    }

    function waitForPageLoad() {
        return new Promise((resolve) => {
            if (document.readyState === 'complete') return resolve();
            window.addEventListener('load', resolve, { once: true });
            // Safety timeout
            setTimeout(resolve, 10000);
        });
    }

    function updateStatus(text) {
        console.log(`[XVR-AI:${aiProvider.key}] ${text}`);
    }

    function queryAny(selectors) {
        for (const selector of selectors) {
            const element = document.querySelector(selector);
            if (element) return element;
        }

        return null;
    }

    function getAiProviderMeta() {
        if (window.location.hostname.includes('gemini.google.com')) {
            return { key: 'gemini', label: 'Gemini' };
        }

        return { key: 'grok', label: 'Grok' };
    }

    async function tryCopyToClipboard(text) {
        try {
            await navigator.clipboard.writeText(text);
            return true;
        } catch {
            return false;
        }
    }

    console.log(`[X Viral Repurpose] AI script loaded on ${aiProvider.label}`);
})();
