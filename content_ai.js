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

        updateStatus('stage=page-ready กำลังรอ composer ที่พร้อมใช้งาน...');

        const responseBaseline = new Set(collectResponseCandidates());

        // 2.1-2.3) รอ stable composer แล้วพิมพ์ prompt พร้อม retry ถ้า cold-open remount/reset
        const visiblePromptInput = await fillPromptIntoStableComposer(prompt, settings);

        updateStatus('stage=prompt-visible ข้อความอยู่ใน visible composer แล้ว');

        // 2.4) รอสักครู่ก่อนกด Send (เหมือนคนอ่านทวนอีกที)
        await sleep(randomBetween(800, 1500));

        // 2.5) กดปุ่ม Send
        updateStatus('กำลังส่ง Prompt...');
        await clickSendButton(visiblePromptInput);

        const sendStarted = await waitForSendStart(visiblePromptInput, 10000);
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
            data: { response, copied, requestId: activeRequestId, aiProvider: aiProvider.key }
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

    async function waitForComposerReady(timeout = 15000) {
        const startedAt = Date.now();
        let lastInput = null;
        let stableCount = 0;

        while (Date.now() - startedAt < timeout) {
            const input = findVisibleComposerInput();
            if (input) {
                if (input === lastInput) {
                    stableCount += 1;
                } else {
                    lastInput = input;
                    stableCount = 1;
                }

                if (stableCount >= 3) {
                    return input;
                }
            } else {
                lastInput = null;
                stableCount = 0;
            }

            await sleep(200);
        }

        return null;
    }

    async function waitForReplacementComposer(previousInput, timeout = 2500) {
        const startedAt = Date.now();
        let lastInput = null;
        let stableCount = 0;

        while (Date.now() - startedAt < timeout) {
            const input = findVisibleComposerInput();
            if (input && input !== previousInput) {
                if (input === lastInput) {
                    stableCount += 1;
                } else {
                    lastInput = input;
                    stableCount = 1;
                }

                if (stableCount >= 2) {
                    return input;
                }
            } else {
                lastInput = null;
                stableCount = 0;
            }

            await sleep(150);
        }

        return null;
    }

    async function waitForVisiblePrompt(promptText, timeout = 3000) {
        const startedAt = Date.now();
        while (Date.now() - startedAt < timeout) {
            const input = findPromptVisibleInput(promptText);
            if (input) {
                return input;
            }
            await sleep(150);
        }

        return null;
    }

    async function waitForStableVisiblePrompt(promptText, timeout = 2500) {
        const startedAt = Date.now();
        let lastInput = null;
        let stableCount = 0;

        while (Date.now() - startedAt < timeout) {
            const input = findPromptVisibleInput(promptText);
            if (input) {
                if (input === lastInput) {
                    stableCount += 1;
                } else {
                    lastInput = input;
                    stableCount = 1;
                }

                if (stableCount >= 3) {
                    return input;
                }
            } else {
                lastInput = null;
                stableCount = 0;
            }

            await sleep(150);
        }

        return null;
    }

    async function fillPromptIntoStableComposer(prompt, settings = {}, maxAttempts = 2) {
        let lastFailureStage = 'composer-not-ready';
        let previousComposer = null;

        for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
            const inputEl = attempt === 1
                ? await waitForComposerReady(20000)
                : (await waitForReplacementComposer(previousComposer, 3000)) || await waitForComposerReady(5000);

            if (!inputEl) {
                lastFailureStage = 'composer-not-ready';
                break;
            }

            previousComposer = inputEl;
            updateStatus(`stage=composer-found พบ visible composer แล้ว (attempt=${attempt})`);
            updateStatus(`stage=composer-stable composer พร้อมใช้งานแล้ว (attempt=${attempt})`);

            await clearInput(inputEl);
            await sleep(randomBetween(500, 1000));

            updateStatus(attempt === 1
                ? 'กำลังพิมพ์ Prompt...'
                : `stage=retry-fill กำลังพิมพ์ Prompt ใหม่หลัง reacquire (attempt=${attempt})`);

            await fillPromptInput(inputEl, prompt, settings);

            const visiblePromptInput = await waitForStableVisiblePrompt(prompt, 2500);
            if (visiblePromptInput) {
                return visiblePromptInput;
            }

            const replacementComposer = await waitForReplacementComposer(inputEl, 2500);
            if (replacementComposer) {
                lastFailureStage = 'composer-remounted-after-fill';
                previousComposer = replacementComposer;
                updateStatus(`stage=reacquire composer ถูก reset/remount หลัง fill (attempt=${attempt})`);
                continue;
            }

            lastFailureStage = 'composer-not-stable-after-fill';
            updateStatus(`stage=reacquire ยังไม่พบ prompt ใน visible composer หลัง fill (attempt=${attempt})`);
        }

        if (lastFailureStage === 'composer-remounted-after-fill') {
            throw new Error(`ใส่ prompt ลง ${aiProvider.label} visible composer ไม่สำเร็จ - composer ถูกรีเซ็ตหลัง cold-open`);
        }

        if (lastFailureStage === 'composer-not-stable-after-fill') {
            throw new Error(`ใส่ prompt ลง ${aiProvider.label} visible composer ไม่สำเร็จ - composer ยังไม่ stable หลัง fill`);
        }

        throw new Error(`ไม่พบ visible composer บน ${aiProvider.label} - หน้าอาจยังไม่พร้อมหรือ DOM เปลี่ยนแปลง`);
    }

    function findVisibleComposerInput(root = document) {
        const candidates = collectComposerCandidates(root)
            .map(element => ({
                element,
                score: scoreComposerCandidate(element)
            }))
            .filter(candidate => candidate.score > -1000)
            .sort((a, b) => b.score - a.score);

        return candidates[0]?.element || null;
    }

    function findPromptVisibleInput(promptText, root = document) {
        const normalizedPrompt = normalizePromptText(promptText);
        if (!normalizedPrompt) return null;

        const candidates = collectComposerCandidates(root)
            .map(element => ({
                element,
                score: scoreComposerCandidate(element)
            }))
            .filter(candidate => candidate.score > -1000)
            .sort((a, b) => b.score - a.score);

        return candidates.find(candidate => composerContainsText(candidate.element, normalizedPrompt))?.element || null;
    }

    function collectComposerCandidates(root = document) {
        const seen = new Set();
        const results = [];

        for (const selector of INPUT_SELECTORS) {
            root.querySelectorAll(selector).forEach((element) => {
                if (seen.has(element)) return;
                seen.add(element);
                results.push(element);
            });
        }

        return results;
    }

    function scoreComposerCandidate(element) {
        if (!element || !isWritableComposerInput(element) || !isVisible(element)) {
            return -1000;
        }

        const descriptor = `${element.getAttribute('aria-label') || ''} ${element.getAttribute('placeholder') || ''} ${element.getAttribute('data-placeholder') || ''}`.toLowerCase();
        let score = 0;

        if (element.matches('rich-textarea div[contenteditable="true"]')) score += 180;
        if (element.closest('rich-textarea')) score += 120;
        if (element.closest('form')) score += 40;
        if (element.matches('[contenteditable="true"]')) score += 35;
        if (element.matches('textarea')) score += 25;
        if (element.getAttribute('role') === 'textbox') score += 20;
        if (/enter a prompt|ask gemini|gemini 3|gemini|ป้อนความช่วยเหลือจาก gemini|เขียนอะไร/i.test(descriptor)) score += 140;
        if (element === document.activeElement) score += 30;
        if (element.closest('[aria-hidden="true"], [hidden], [inert]')) score -= 500;

        return score;
    }

    function isWritableComposerInput(element) {
        if (!element) return false;

        if (typeof element.disabled === 'boolean' && element.disabled) return false;
        if (typeof element.readOnly === 'boolean' && element.readOnly) return false;

        const contentEditable = element.getAttribute('contenteditable');
        if (contentEditable !== null) {
            return contentEditable !== 'false';
        }

        return element.matches('textarea, input, [role="textbox"]');
    }

    function composerContainsText(element, promptText) {
        const current = normalizePromptText(getInputText(element));
        if (!current || !promptText) return false;

        const sample = promptText.slice(0, Math.min(promptText.length, 24));
        return current.includes(sample);
    }

    function normalizePromptText(text) {
        return String(text || '')
            .replace(/\s+/g, ' ')
            .trim();
    }

    // =============================================
    // 5) Send Button Handler
    // =============================================
    async function clickSendButton(input) {
        const beforeState = buildSendStateSnapshot(input);
        updateStatus(`stage=send-ready controls=${beforeState.actionableCount}/${beforeState.visibleControlCount} stop=${beforeState.stopVisible ? 'yes' : 'no'}`);

        const candidates = collectSendButtons(input);
        for (const btn of candidates) {
            if (!btn || btn.disabled || !isVisible(btn)) continue;
            btn.focus?.();
            btn.click();
            await sleep(400);
            if (await waitForSendStart(input, 1200, beforeState)) return;
        }

        if (beforeState.composerHasText) {
            pressEnter(input);
            await sleep(500);
            if (await waitForSendStart(input, 1500, beforeState)) return;
        }

        if (!beforeState.actionableCount) {
            throw new Error(`visible composer ของ ${aiProvider.label} มีข้อความแล้ว แต่ยังไม่พบ send-ready control`);
        }

        throw new Error(`visible composer ของ ${aiProvider.label} มีข้อความแล้ว แต่ send-start ไม่เกิดหลังพยายามกดส่ง`);
    }

    function collectSendButtons(input) {
        const buttons = [];
        const pushButton = (button) => {
            if (!button || buttons.includes(button)) return;
            buttons.push(button);
        };

        const ranked = collectSendControls(input)
            .map(button => ({
                button,
                score: scoreSendButton(button, input)
            }))
            .filter(candidate => candidate.score > -1000)
            .filter(Boolean)
            .sort((a, b) => b.score - a.score);

        ranked.forEach(candidate => pushButton(candidate.button));
        return buttons;
    }

    function collectSendControls(input) {
        const controls = [];
        const pushControl = (button) => {
            if (!button || controls.includes(button)) return;
            controls.push(button);
        };

        const form = input?.closest('form');
        if (form) {
            Array.from(form.querySelectorAll('button')).forEach(pushControl);
        }

        const composerRoot = input?.closest('[class*="composer"], [class*="input"], [class*="chat"], [role="group"]') || input?.parentElement;
        if (composerRoot) {
            Array.from(composerRoot.querySelectorAll('button')).forEach(pushControl);
        }

        const providerRoot = input?.closest('form, rich-textarea, .conversation-container, .chat-input-container, body');
        if (providerRoot) {
            Array.from(providerRoot.querySelectorAll('button')).forEach(pushControl);
        }

        for (const selector of SEND_BUTTON_SELECTORS) {
            document.querySelectorAll(selector).forEach(pushControl);
        }

        return controls;
    }

    function getSendButtonDescriptor(button) {
        return normalizePromptText(`${button?.getAttribute('aria-label') || ''} ${button?.getAttribute('title') || ''} ${button?.getAttribute('mattooltip') || ''} ${button?.textContent || ''} ${button?.innerHTML || ''}`).toLowerCase();
    }

    function isStopButton(button) {
        if (!button) return false;

        for (const selector of STOP_BUTTON_SELECTORS) {
            if (matchesSelector(button, selector)) {
                return true;
            }
        }

        return /stop|หยุด|cancel generation|stop generating|stop response/i.test(getSendButtonDescriptor(button));
    }

    function scoreSendButton(button, input) {
        if (!button || !isVisible(button) || isStopButton(button)) {
            return -1000;
        }

        const ariaDisabled = button.getAttribute('aria-disabled');
        if (button.disabled || ariaDisabled === 'true') {
            return -1000;
        }

        const text = getSendButtonDescriptor(button);
        if (/mic|microphone|voice|upload|attach|image|gallery|plus|menu/.test(text)) {
            return -1000;
        }

        let score = 0;
        if (button.type === 'submit') score += 80;
        if (/send|submit|ส่ง|run|arrow up|paper plane|rocket/.test(text)) score += 140;
        if (/gemini|prompt|message/.test(text)) score += 25;
        if (button.closest('message-actions, form, rich-textarea, [class*="composer"], [class*="input"]')) score += 40;
        if (button.querySelector('svg')) score += 10;
        if (button === document.activeElement) score += 15;

        const inputForm = input?.closest('form');
        const buttonForm = button.closest('form');
        if (inputForm && buttonForm && inputForm === buttonForm) score += 100;

        const inputRect = getElementRect(input);
        const buttonRect = getElementRect(button);
        if (inputRect && buttonRect) {
            const deltaX = Math.abs((buttonRect.left + buttonRect.width / 2) - inputRect.right);
            const deltaY = Math.abs((buttonRect.top + buttonRect.height / 2) - inputRect.bottom);
            score += Math.max(0, 120 - Math.min(deltaX + deltaY, 120));
        }

        return score;
    }

    function findSendReadyControl(input) {
        return collectSendButtons(input)[0] || null;
    }

    function buildSendStateSnapshot(input) {
        const ranked = collectSendControls(input)
            .map(button => ({
                button,
                score: scoreSendButton(button, input)
            }))
            .sort((a, b) => b.score - a.score);

        const readyControl = ranked.find(candidate => candidate.score > -1000)?.button || null;
        const composerText = normalizePromptText(getInputText(input));

        return {
            readyControl,
            readyControlDescriptor: readyControl ? getSendButtonDescriptor(readyControl) : '',
            visibleControlCount: ranked.filter(candidate => isVisible(candidate.button)).length,
            actionableCount: ranked.filter(candidate => candidate.score > -1000).length,
            stopVisible: STOP_BUTTON_SELECTORS.some(selector => {
                const element = document.querySelector(selector);
                return Boolean(element && isVisible(element));
            }),
            composerHasText: Boolean(composerText),
            composerTextSample: composerText.slice(0, 48)
        };
    }

    async function waitForSendStart(input, timeout = 5000, beforeState = null) {
        const baselineState = beforeState || buildSendStateSnapshot(input);
        const startedAt = Date.now();
        while (Date.now() - startedAt < timeout) {
            const currentState = buildSendStateSnapshot(input);
            if (currentState.stopVisible) {
                updateStatus('stage=send-start พบ stop control แล้ว');
                return true;
            }

            if (baselineState.composerHasText && !currentState.composerHasText) {
                updateStatus('stage=send-start composer ว่างลงหลังส่ง');
                return true;
            }

            if (baselineState.readyControl && currentState.readyControl && baselineState.readyControl === currentState.readyControl) {
                const ariaDisabled = currentState.readyControl.getAttribute('aria-disabled');
                if (currentState.readyControl.disabled || ariaDisabled === 'true') {
                    updateStatus('stage=send-start send control ถูกปิดใช้งานแล้ว');
                    return true;
                }
            }

            if (baselineState.readyControl && baselineState.readyControl !== currentState.readyControl) {
                updateStatus('stage=send-start send control เปลี่ยน state แล้ว');
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
    // RUNTIME WIRING (v2 2026-03-20):
    // - Gemini: position-first selection (last valid DOM node wins)
    //   Aligned with lib/response-collector.js selectGeminiResponse()
    // - Grok: legacy score-based ranking (frozen, do not change)
    // - background.js contract: frozen, no changes
    // =============================================
    function getLastAIMessage(promptText = '', baselineCandidates = new Set()) {
        if (aiProvider.key === 'gemini') {
            const elements = collectResponseElements();
            return selectGeminiResponse(elements, promptText, baselineCandidates);
        }

        // Grok/other: legacy score-based ranking
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

    function selectGeminiResponse(elements, promptText, baselineCandidates) {
        const filtered = elements
            .filter(el => !baselineCandidates.has(el.text))
            .filter(el => !isPromptEcho(el.text, promptText));

        if (!filtered.length) return null;

        const viable = filtered.filter((candidate) => {
            const clean = sanitizeAIResponseText(candidate.text);
            return clean && !isSuspiciousAIResponse(candidate.text);
        });

        if (viable.length) {
            const bestSurfaceRank = Math.max(...viable.map(candidate => candidate.surfaceRank || 0));
            const bestSurfaceCandidates = viable.filter(candidate => (candidate.surfaceRank || 0) === bestSurfaceRank);
            const preferredCandidates = bestSurfaceCandidates.some(candidate => candidate.isLeaf)
                ? bestSurfaceCandidates.filter(candidate => candidate.isLeaf)
                : bestSurfaceCandidates;

            return preferredCandidates[preferredCandidates.length - 1]?.text || null;
        }

        const ranked = filtered
            .map(el => ({
                raw: el.text,
                score: scoreAIResponseCandidate(el.text)
                    + (el.surfaceRank || 0)
                    + (el.isLeaf ? 40 : 0)
            }))
            .filter(el => el.score > -1000)
            .sort((a, b) => b.score - a.score);

        return ranked[0]?.raw || null;
    }

    function collectResponseElements() {
        if (aiProvider.key === 'gemini') {
            const activeRoot = findGeminiActiveConversationRoot();
            if (activeRoot) {
                const rootedCandidates = collectCandidateElementsFromRoot(
                    activeRoot,
                    [
                        'model-response .markdown',
                        'message-content .markdown',
                        '.model-response-text',
                        '.message-content',
                        '.markdown-content',
                        '[data-testid="message-content"]',
                        'message-content',
                        'model-response',
                        '[role="article"]'
                    ],
                    {
                        source: 'active-conversation',
                        surfaceRank: 300
                    }
                );

                if (rootedCandidates.length) {
                    return rootedCandidates;
                }
            }

            return collectCandidateElementsFromRoot(
                document,
                [
                    'model-response',
                    'message-content',
                    '.model-response-text',
                    '.message-content',
                    '.markdown-content',
                    '[data-testid="message-content"]',
                    '[role="article"]'
                ],
                {
                    source: 'document-fallback',
                    surfaceRank: 100
                }
            );
        }

        return collectCandidateElementsFromRoot(
            document,
            [
                ...RESPONSE_SELECTORS,
                '[class*="message"]',
                '[class*="Message"]',
                '.prose',
                '[class*="markdown"]',
                '[class*="Markdown"]'
            ],
            {
                source: 'document',
                surfaceRank: 100
            }
        );
    }

    // collectResponseCandidates: flat text-only list (used for baseline capture)
    function collectResponseCandidates() {
        return collectResponseElements().map(el => el.text);
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
            .replace(/^(gemini|grok)\s+said\s*/i, '')
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
        if (isUiFollowUpText(cleaned)) return true;
        if (isUiChromeText(cleaned)) return true;

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
        if (isUiFollowUpText(clean)) score -= 450;
        if (isUiChromeText(clean)) score -= 450;

        return score;
    }

    function isToolStatusLine(line) {
        return /^(executed code|searching|thinking|analyzing|reasoned for.*|read more|view all|sources?.*|search results?.*|used tools?.*|(gemini|grok)\s+said|assistant)$/i.test(String(line || '').trim());
    }

    function isMostlyUrl(text) {
        const trimmed = String(text || '').trim();
        if (!trimmed) return false;

        const withoutUrls = trimmed.replace(/https?:\/\/\S+|www\.\S+/gi, '').trim();
        return withoutUrls.length < 12;
    }

    function isUiFollowUpText(text) {
        const cleaned = String(text || '').trim();
        if (!cleaned) return false;

        return /(?:มีอะไรให้ช่วย(?:อีก|เพิ่มเติม)?ไหม|สามารถถาม(?:คำถาม)?(?:อะไร)?ได้เลย|ถาม(?:คำถาม)?(?:อะไร)?ได้เลย|พร้อมช่วย(?:เสมอ)?|anything else|need anything else|how can i help|feel free to ask|ask me anything)/i.test(cleaned);
    }

    function isUiChromeText(text) {
        const cleaned = String(text || '').trim();
        if (!cleaned) return false;

        return /(?:chat history|recent chats?|recent activity|saved prompts?|show more|new chat|open sidebar|google ai studio|double-check responses|gemini can make mistakes|draft saved)/i.test(cleaned);
    }

    function findGeminiActiveConversationRoot() {
        const seeds = Array.from(
            document.querySelectorAll('model-response, message-content, .model-response-text, .message-content, .markdown-content, [data-testid="message-content"]')
        ).filter((element) => Boolean((element.innerText || element.textContent || '').trim()));

        const latestSeed = seeds[seeds.length - 1];
        if (!latestSeed) return null;

        const rootSelectors = [
            '.conversation-container',
            '[data-testid*="conversation"]',
            '[class*="conversation"][class*="container"]',
            '[class*="conversation"]'
        ];

        for (const selector of rootSelectors) {
            const root = latestSeed.closest(selector);
            if (root && root.querySelector('model-response, message-content')) {
                return root;
            }
        }

        const modelResponse = latestSeed.closest('model-response');
        if (modelResponse?.parentElement) {
            return modelResponse.parentElement;
        }

        return null;
    }

    function collectCandidateElementsFromRoot(root, selectors, options) {
        const doc = root.nodeType === 9 ? root : root.ownerDocument;
        const candidatesByText = new Map();
        let discoveryOrder = 0;

        for (const selector of selectors) {
            root.querySelectorAll(selector).forEach((element) => {
                const text = (element.innerText || element.textContent || '').trim();
                if (!text) return;

                const candidate = {
                    text,
                    element,
                    selector,
                    source: options.source,
                    surfaceRank: options.surfaceRank,
                    isLeaf: isLeafResponseElement(element),
                    discoveryOrder
                };
                discoveryOrder += 1;

                const existing = candidatesByText.get(text);
                if (!existing || isPreferredDuplicateCandidate(candidate, existing)) {
                    candidatesByText.set(text, candidate);
                }
            });
        }

        return finalizeResponseCandidates(candidatesByText, doc);
    }

    function isPreferredDuplicateCandidate(candidate, existing) {
        if ((candidate.surfaceRank || 0) !== (existing.surfaceRank || 0)) {
            return (candidate.surfaceRank || 0) > (existing.surfaceRank || 0);
        }

        if (Boolean(candidate.isLeaf) !== Boolean(existing.isLeaf)) {
            return Boolean(candidate.isLeaf);
        }

        return candidate.discoveryOrder < existing.discoveryOrder;
    }

    function finalizeResponseCandidates(candidatesByText, doc) {
        const orderMap = new Map(
            Array.from(doc.querySelectorAll('*')).map((element, index) => [element, index])
        );

        return Array.from(candidatesByText.values())
            .sort((a, b) => (orderMap.get(a.element) ?? 0) - (orderMap.get(b.element) ?? 0))
            .map((candidate, index) => ({
                ...candidate,
                documentOrder: orderMap.get(candidate.element) ?? index,
                index
            }));
    }

    function isLeafResponseElement(element) {
        if (!element?.matches) return true;
        if (element.matches('.markdown, .model-response-text, .markdown-content')) return true;

        if (element.matches('message-content, .message-content, [data-testid="message-content"]')) {
            return !element.querySelector('.markdown, .model-response-text, .markdown-content');
        }

        return !element.querySelector('model-response, message-content, .model-response-text, .message-content, .markdown, .markdown-content, [data-testid="message-content"]');
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
        const current = normalizePromptText(getInputText(element));
        const expected = normalizePromptText(text);
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

    function matchesSelector(element, selector) {
        if (!element?.matches) return false;

        try {
            return element.matches(selector);
        } catch {
            return false;
        }
    }

    function isVisible(element) {
        if (!element) return false;
        const style = window.getComputedStyle(element);
        const rect = element.getBoundingClientRect();
        return style.display !== 'none' && style.visibility !== 'hidden' && rect.width > 0 && rect.height > 0;
    }

    function getElementRect(element) {
        if (!element || typeof element.getBoundingClientRect !== 'function') {
            return null;
        }

        return element.getBoundingClientRect();
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
