// =============================================
// X Viral Repurpose - Content Script (x.com)
// =============================================
// สแกนหาโพสต์ Viral (500k+ views) บนหน้า X
// แทรกปุ่ม "🔥 Create Post" และจัดการ UI บนหน้าเว็บ
// =============================================

(function () {
    'use strict';

    // ป้องกันรันซ้ำ
    if (window.__xViralRepurseLoaded) return;
    window.__xViralRepurseLoaded = true;

    // --- ค่าคงที่ ---
    const MIN_VIEWS_DEFAULT = 500000;
    const SCAN_INTERVAL = 2000;
    const BUTTON_CLASS = 'xvr-create-btn';
    const HIGHLIGHT_CLASS = 'xvr-viral-highlight';
    const PROCESSED_ATTR = 'data-xvr-processed';
    const SCROLL_PRESETS = {
        slow: { distanceFactor: 0.35, intervalMs: 5200 },
        medium: { distanceFactor: 0.55, intervalMs: 3600 },
        fast: { distanceFactor: 0.75, intervalMs: 2400 }
    };

    // --- State ---
    let minViews = MIN_VIEWS_DEFAULT;
    let autoScoutInterval = null;
    let autoScoutActive = false;
    let autoScoutBadgeEl = null;
    let autoScoutQuery = '';
    let autoScoutSearchInProgress = false;
    let autoScoutPaused = false;
    let autoScoutStepCount = 0;
    let scoutSettings = {
        scrollPreset: 'medium',
        manualAssist: false,
        checkpointEverySteps: 6,
        pauseOnFound: true,
        sessionLimit: 15,
        dailyLimit: 60
    };

    // โหลด settings
    chrome.runtime.sendMessage({ type: 'GET_SETTINGS' }, (res) => {
        if (res?.data) {
            minViews = res.data.minViews || MIN_VIEWS_DEFAULT;
            scoutSettings = { ...scoutSettings, ...res.data };
        }
    });

    // โหลด Auto Scout State ตอนเข้าเว็บ (กรณีโดน Auto Scout รีเฟรชพามาหน้า Trending)
    chrome.runtime.sendMessage({ type: 'GET_AUTO_SCOUT_STATE' }, (res) => {
        if (res?.success && res.data?.enabled) {
            autoScoutActive = true;
            autoScoutQuery = res.data.query || '';
            // รอให้เว็บโหลดเล็กน้อยก่อนเริ่มทำงาน
            setTimeout(() => startAutoScout().catch(console.error), 3000);
        }
    });

    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
        if (message.type === 'TYPE_ON_X') {
            typeOnXCompose(message.data).then((result) => sendResponse({ success: true, ...(result || {}) })).catch((error) => {
                console.error(error);
                sendResponse({ success: false, error: error.message });
            });
            return true;
        }

        if (message.type === 'SETTINGS_UPDATED') {
            if (message.data) {
                minViews = message.data.minViews || MIN_VIEWS_DEFAULT;
                scoutSettings = { ...scoutSettings, ...message.data };
            }

            if (autoScoutActive && !autoScoutPaused && !scoutSettings.manualAssist) {
                beginAutoScoutLoop();
            }

            sendResponse({ success: true });
            return true;
        }

        if (message.type === 'AUTO_SCOUT_TOGGLE') {
            autoScoutActive = Boolean(message.data?.enabled);
            autoScoutQuery = message.data?.query || '';
            if (autoScoutActive) {
                startAutoScout().catch(console.error);
            } else {
                stopAutoScout();
            }
            sendResponse({ success: true });
            return true;
        }

        if (message.type === 'AUTO_SCOUT_STEP') {
            autoScoutPaused = false;
            performScoutStep().then(() => sendResponse({ success: true })).catch((error) => {
                console.error(error);
                sendResponse({ success: false, error: error.message });
            });
            return true;
        }

        if (message.type === 'AUTO_SCOUT_RESUME') {
            autoScoutPaused = false;
            beginAutoScoutLoop();
            sendScoutProgress({ paused: false, pauseReason: '' });
            sendResponse({ success: true });
            return true;
        }

        return false;
    });

    // =============================================
    // 0) Auto Scout Logic
    // =============================================
    async function startAutoScout() {
        await refreshScoutSettings();
        autoScoutActive = true;
        autoScoutPaused = false;

        const isSearchPage = window.location.pathname.startsWith('/search');
        const isExplorePage = window.location.href.includes('/explore');

        if (!isSearchPage && !isExplorePage) {
            showToast('🤖 นำทางไปยังหน้า Trending อัตโนมัติ...', 'info');
            window.location.href = 'https://x.com/explore/tabs/trending';
            return; // เปลี่ยนหน้า หน้าเว็บหลุด Script จะเริ่มใหม่
        }

        if (!autoScoutBadgeEl) {
            autoScoutBadgeEl = document.createElement('div');
            autoScoutBadgeEl.className = 'xvr-auto-scout-badge';
            autoScoutBadgeEl.innerHTML = `<div class="pulse"></div> 🤖 Auto Scout กำลังทำงาน`;
            document.body.appendChild(autoScoutBadgeEl);
        }

        if (autoScoutQuery) {
            await ensureSearchQuery(autoScoutQuery);
            if (!autoScoutActive) return;
        }

        autoScoutStepCount = 0;
        sendScoutProgress({
            active: true,
            paused: false,
            pauseReason: scoutSettings.manualAssist ? 'รอ Step Scroll' : '',
            steps: autoScoutStepCount,
            scrollPreset: scoutSettings.scrollPreset,
            manualAssist: Boolean(scoutSettings.manualAssist)
        });

        showToast(`🤖 เริ่มค้นหาอัตโนมัติ${autoScoutQuery ? `: ${autoScoutQuery}` : ''}`, 'info');

        if (scoutSettings.manualAssist) {
            showToast('⤵ Manual Assist เปิดอยู่ กด Step Scroll เพื่อเลื่อนทีละรอบ', 'info');
            await performScoutStep();
            pauseAutoScout('รอ Step Scroll');
            return;
        }

        beginAutoScoutLoop();
    }

    function stopAutoScout() {
        if (autoScoutInterval) clearInterval(autoScoutInterval);
        autoScoutInterval = null;
        autoScoutPaused = false;
        autoScoutActive = false;
        if (autoScoutBadgeEl) {
            autoScoutBadgeEl.remove();
            autoScoutBadgeEl = null;
        }
        sendScoutProgress({ active: false, paused: false, pauseReason: '', steps: autoScoutStepCount });
        showToast('🛑 ปิดโหมด Auto Scout', 'info');
    }

    function beginAutoScoutLoop() {
        if (autoScoutInterval) clearInterval(autoScoutInterval);
        if (!autoScoutActive || autoScoutPaused || scoutSettings.manualAssist) {
            return;
        }

        const preset = SCROLL_PRESETS[scoutSettings.scrollPreset] || SCROLL_PRESETS.medium;
        autoScoutInterval = setInterval(() => {
            performScoutStep().catch(console.error);
        }, preset.intervalMs);

        performScoutStep().catch(console.error);
    }

    async function performScoutStep() {
        if (!autoScoutActive || autoScoutPaused) return;

        scanTweets();

        const preset = SCROLL_PRESETS[scoutSettings.scrollPreset] || SCROLL_PRESETS.medium;
        performPageScroll(window.innerHeight * preset.distanceFactor);
        autoScoutStepCount += 1;

        sendScoutProgress({
            active: true,
            paused: false,
            pauseReason: '',
            steps: autoScoutStepCount,
            scrollPreset: scoutSettings.scrollPreset,
            manualAssist: Boolean(scoutSettings.manualAssist)
        });

        if (scoutSettings.checkpointEverySteps > 0 && autoScoutStepCount % scoutSettings.checkpointEverySteps === 0) {
            pauseAutoScout(`ถึง checkpoint ที่ ${autoScoutStepCount}`);
        }
    }

    function pauseAutoScout(reason) {
        if (autoScoutInterval) clearInterval(autoScoutInterval);
        autoScoutInterval = null;
        autoScoutPaused = true;
        sendScoutProgress({
            active: true,
            paused: true,
            pauseReason: reason,
            steps: autoScoutStepCount,
            scrollPreset: scoutSettings.scrollPreset,
            manualAssist: Boolean(scoutSettings.manualAssist)
        });
        showToast(`⏸ ${reason}`, 'info');
    }

    function performPageScroll(distance) {
        const safeDistance = Math.max(220, Math.round(distance || 0));
        const scroller = getScrollContainer();
        const beforeTop = getScrollTop(scroller);

        if (scroller && typeof scroller.scrollBy === 'function') {
            scroller.scrollBy({ top: safeDistance, behavior: 'smooth' });
        }

        if (!scroller || scroller === window) {
            window.scrollBy({ top: safeDistance, behavior: 'smooth' });
        }

        requestAnimationFrame(() => {
            const afterTop = getScrollTop(scroller);
            if (Math.abs(afterTop - beforeTop) < 8) {
                const tweets = document.querySelectorAll('article[data-testid="tweet"]');
                const fallbackTweet = tweets[Math.max(0, tweets.length - 2)];

                if (fallbackTweet?.scrollIntoView) {
                    fallbackTweet.scrollIntoView({ behavior: 'smooth', block: 'end' });
                } else {
                    window.scrollBy(0, safeDistance);
                }
            }
        });
    }

    function getScrollContainer() {
        const candidates = [
            document.scrollingElement,
            document.querySelector('main'),
            document.querySelector('[data-testid="primaryColumn"]'),
            document.querySelector('section[role="region"]'),
            document.querySelector('div[style*="overflow: auto"]'),
            document.documentElement,
            document.body
        ].filter(Boolean);

        const viewportHeight = window.innerHeight || document.documentElement.clientHeight || 0;
        return candidates.find((element) => {
            if (element === document.scrollingElement || element === document.documentElement || element === document.body) {
                return true;
            }

            return element.scrollHeight > element.clientHeight && element.clientHeight >= Math.floor(viewportHeight * 0.5);
        }) || document.scrollingElement || window;
    }

    function getScrollTop(scroller) {
        if (!scroller || scroller === window) {
            return window.scrollY || document.documentElement.scrollTop || document.body.scrollTop || 0;
        }

        return scroller.scrollTop || 0;
    }

    async function refreshScoutSettings() {
        const response = await new Promise((resolve) => {
            chrome.runtime.sendMessage({ type: 'GET_SETTINGS' }, resolve);
        });

        if (response?.data) {
            minViews = response.data.minViews || MIN_VIEWS_DEFAULT;
            scoutSettings = { ...scoutSettings, ...response.data };
        }
    }

    function sendScoutProgress(progress) {
        chrome.runtime.sendMessage({ type: 'AUTO_SCOUT_PROGRESS', data: progress }, () => {
            void chrome.runtime.lastError;
        });
    }

    async function ensureSearchQuery(query) {
        const normalizedQuery = (query || '').trim();
        if (!normalizedQuery || autoScoutSearchInProgress) return;

        const currentUrl = new URL(window.location.href);
        const currentQuery = (currentUrl.searchParams.get('q') || '').trim();
        if (window.location.pathname.startsWith('/search') && currentQuery.toLowerCase() === normalizedQuery.toLowerCase()) {
            return;
        }

        autoScoutSearchInProgress = true;

        try {
            showToast(`🔎 กำลังพิมพ์ค้นหา: ${normalizedQuery}`, 'info');

            const searchInput = await waitForElement([
                'input[data-testid="SearchBox_Search_Input"]',
                'input[aria-label*="Search query" i]',
                'input[aria-label*="Search" i]',
                'input[placeholder*="Search" i]',
                'input[placeholder*="ค้นหา" i]'
            ], 12000);

            if (!searchInput) {
                showToast('❌ ไม่พบช่อง Search บนหน้า X', 'error');
                return;
            }

            await clearTextInput(searchInput);
            await sleep(randomBetween(300, 700));
            await typeHumanLikeSearchInput(searchInput, normalizedQuery);
            await sleep(randomBetween(500, 1100));
            await submitSearchQuery(searchInput, normalizedQuery);
            await sleep(1500);
        } finally {
            autoScoutSearchInProgress = false;
        }
    }

    async function typeHumanLikeSearchInput(element, text) {
        for (let i = 0; i < text.length; i++) {
            const nextValue = text.slice(0, i + 1);
            setNativeValue(element, nextValue);
            dispatchSearchInputEvent(element, text[i], nextValue);

            await sleep(randomBetween(45, 140));

            if (i > 0 && i % randomBetween(4, 8) === 0) {
                await sleep(randomBetween(180, 420));
            }
        }

        await waitForNextFrame();
        await waitForNextFrame();
    }

    async function submitSearchQuery(element, query) {
        const beforeUrl = window.location.href;
        element.focus();
        await waitForNextFrame();

        if (element.form && typeof element.form.requestSubmit === 'function') {
            element.form.requestSubmit();
        } else {
            const submitButton = document.querySelector(
                'button[type="submit"], [role="button"][aria-label*="Search" i], [data-testid*="SearchBox"] button'
            );

            if (submitButton) {
                submitButton.click();
            }
        }

        await sleep(1200);

        const currentUrl = new URL(window.location.href);
        const currentQuery = currentUrl.searchParams.get('q') || '';
        if (window.location.href !== beforeUrl && currentQuery.toLowerCase().includes(query.toLowerCase())) {
            return;
        }

        const encodedQuery = encodeURIComponent(query);
        window.location.href = `https://x.com/search?q=${encodedQuery}&src=typed_query&f=live`;
    }

    // =============================================
    // 1) View Count Parser - แปลงข้อความ views เป็นตัวเลข
    // =============================================
    function parseViewCount(text) {
        if (!text) return 0;
        const cleaned = text.trim().replace(/,/g, '').replace(/\s+/g, '');

        // จับตัวเลข + suffix (K, M, B) เช่น "500K", "1.2M", "500"
        const match = cleaned.match(/^([\d.]+)\s*([KMBkmb])?/);
        if (!match) return 0;

        let num = parseFloat(match[1]);
        const suffix = (match[2] || '').toUpperCase();

        switch (suffix) {
            case 'K': num *= 1_000; break;
            case 'M': num *= 1_000_000; break;
            case 'B': num *= 1_000_000_000; break;
        }

        return Math.floor(num);
    }

    // =============================================
    // 2) Tweet Scanner - ค้นหาโพสต์ที่มี views เกินเกณฑ์
    // =============================================
    function scanTweets() {
        const articles = document.querySelectorAll('article[data-testid="tweet"]');

        articles.forEach(article => {
            if (article.hasAttribute(PROCESSED_ATTR)) return;
            article.setAttribute(PROCESSED_ATTR, 'true');

            const viewData = extractViewCount(article);
            if (!viewData || viewData.count < minViews) return;

            // พบโพสต์ viral!
            highlightTweet(article);
            injectButton(article, viewData);

            // ส่งข้อมูลไป background
            const postData = extractPostData(article, viewData);
            chrome.runtime.sendMessage({
                type: 'VIRAL_POST_FOUND',
                data: postData
            }, (response) => {
                if (response?.limitReached) {
                    pauseAutoScout('ถึง limit ของรอบนี้แล้ว');
                } else if (response?.success && !response?.duplicate && scoutSettings.pauseOnFound) {
                    pauseAutoScout('เจอโพสต์ที่เข้าเงื่อนไข');
                }
            });
        });
    }

    // =============================================
    // 3) View Count Extractor - ดึงยอด Views จาก DOM
    // =============================================
    function extractViewCount(article) {
        // กลยุทธ์ 1: หาจาก aria-label ของ analytics link
        const analyticsLink = article.querySelector('a[href*="/analytics"]');
        if (analyticsLink) {
            const ariaLabel = analyticsLink.getAttribute('aria-label') || '';
            const match = ariaLabel.match(/([\d,.]+[a-zA-Z]?)\s*(view|การดู)/i);
            if (match) {
                return { count: parseViewCount(match[1]), text: match[1] };
            }

            const innerMatch = analyticsLink.innerText.trim();
            if (innerMatch) {
                return { count: parseViewCount(innerMatch), text: innerMatch };
            }
        }

        // กลยุทธ์ 2: หาจาก aria-label ของ element ใดๆที่เกี่ยวข้อง
        const viewGroup = article.querySelector('[aria-label*="Views" i], [aria-label*="การดู" i]');
        if (viewGroup) {
            const ariaLabel = viewGroup.getAttribute('aria-label') || '';
            const match = ariaLabel.match(/([\d.,KMBkmb]+)\s*(Views|การดู)/i);
            if (match) return { count: parseViewCount(match[1]), text: match[1] };
        }

        // กลยุทธ์ 3: หาจากกลุ่ม engagement โดยตรง
        const engagementGroup = article.querySelector('[role="group"]');
        if (engagementGroup) {
            const analyticsNode = engagementGroup.querySelector('a[href*="/analytics"], [aria-label*="Views" i], [aria-label*="การดู" i]');
            if (analyticsNode) {
                const analyticsText = (analyticsNode.innerText || analyticsNode.textContent || '').trim();
                if (analyticsText) {
                    return { count: parseViewCount(analyticsText), text: analyticsText };
                }
            }

            const spans = engagementGroup.querySelectorAll('span');
            for (const span of spans) {
                const text = span.textContent.trim();
                if (/^\d+(\.\d+)?[KMBkmb]?$/.test(text)) {
                    const count = parseViewCount(text);
                    if (count >= minViews) {
                        return { count, text };
                    }
                }
            }
        }

        // กลยุทธ์ 4: สแกนทั้ง article หาข้อความ "views"
        const allText = article.innerText;
        const viewPatterns = allText.match(/([\d,.]+[KMBkmb]?)\s*(views|การดู)/gi);
        if (viewPatterns) {
            for (const pattern of viewPatterns) {
                const numMatch = pattern.match(/([\d,.]+[KMBkmb]?)/);
                if (numMatch) {
                    const count = parseViewCount(numMatch[1]);
                    if (count >= minViews) {
                        return { count, text: numMatch[1] };
                    }
                }
            }
        }

        return null;
    }

    // =============================================
    // 4) Post Data Extractor - ดึงข้อมูลโพสต์
    // =============================================
    function extractPostData(article, viewData) {
        // ดึงข้อความ
        const tweetText = article.querySelector('[data-testid="tweetText"]');
        const text = tweetText ? tweetText.innerText.trim() : '';

        // ดึง author
        const userLink = article.querySelector('a[href*="/"][role="link"] span');
        const author = userLink ? userLink.textContent.trim() : 'Unknown';

        // ดึง URL ของโพสต์
        const timeLink = article.querySelector('a[href*="/status/"] time')?.parentElement;
        const url = timeLink ? 'https://x.com' + timeLink.getAttribute('href') : '';

        return {
            text,
            author,
            url,
            viewCount: viewData.count,
            viewCountText: viewData.text
        };
    }

    // =============================================
    // 5) UI Injection - ไฮไลต์ และ ฝังปุ่ม
    // =============================================
    function highlightTweet(article) {
        article.classList.add(HIGHLIGHT_CLASS);
    }

    function injectButton(article, viewData) {
        // เช็คว่ามีปุ่มอยู่แล้วหรือไม่
        if (article.querySelector('.' + BUTTON_CLASS)) return;

        const btn = document.createElement('button');
        btn.className = BUTTON_CLASS;
        btn.innerHTML = `🔥 AI Create Post <span class="xvr-view-badge">${viewData.text} views</span>`;
        btn.title = 'สร้างโพสต์ด้วย AI จากเนื้อหานี้';
        btn.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            onCreatePostClick(article, viewData, btn);
        });

        // หาตำแหน่งที่จะแทรกปุ่ม (ใต้ engagement bar)
        const engagementGroup = article.querySelector('[role="group"]');
        if (engagementGroup && engagementGroup.parentElement) {
            engagementGroup.parentElement.insertBefore(btn, engagementGroup.nextSibling);
        } else {
            article.appendChild(btn);
        }
    }

    // =============================================
    // 6) Button Click Handler - เมื่อกดปุ่ม Create Post
    // =============================================
    async function onCreatePostClick(article, viewData, btn) {
        btn.disabled = true;
        btn.innerHTML = '⏳ กำลังส่งให้ AI...';

        const postData = extractPostData(article, viewData);

        try {
            // บอก background ให้เปิด Side Panel
            chrome.runtime.sendMessage({ type: 'OPEN_SIDE_PANEL' });

            // ส่งข้อมูลไป background เพื่อเริ่มประมวลผลกับ AI
            const response = await new Promise((resolve) => {
                chrome.runtime.sendMessage({
                    type: 'PROCESS_WITH_AI',
                    data: postData
                }, resolve);
            });

            if (response?.success) {
                btn.innerHTML = '✅ ส่งแล้ว! ดูผลใน Side Panel';
                btn.classList.add('xvr-btn-success');
            } else {
                throw new Error(response?.error || 'Unknown error');
            }
        } catch (err) {
            btn.innerHTML = '❌ ผิดพลาด - กดลองอีกครั้ง';
            btn.disabled = false;
            console.error('[XVR] Error:', err);
        }
    }

    // =============================================
    // 7) Compose Post Helper - พิมพ์ข้อความในช่อง Compose ของ X
    // =============================================
    async function typeOnXCompose(payload) {
        const text = typeof payload === 'string' ? payload : (payload?.text || '');
        const sourceUrl = typeof payload === 'string' ? '' : (payload?.sourceUrl || '');
        const autoSubmit = typeof payload === 'string' ? false : payload?.autoSubmit !== false;

        if (sourceUrl) {
            try {
                await openQuoteComposer(sourceUrl);
            } catch (err) {
                console.warn('[XVR] Quote Flow failed:', err);
                showToast(`❌ Quote ไม่สำเร็จ: ${err.message}`, 'error');
                throw err;
            }
        }

        // กดปุ่ม Compose เฉพาะโหมดโพสต์ปกติเท่านั้น
        const composeBtn = !sourceUrl
            ? document.querySelector('a[href="/compose/post"]')
            || document.querySelector('[data-testid="SideNav_NewTweet_Button"]')
            || document.querySelector('a[data-testid="SideNav_NewTweet_Button"]')
            : null;

        if (composeBtn) {
            composeBtn.click();
            await sleep(1500);
        }

        // หากล่องพิมพ์ Compose
        const composeBox = await waitForElement([
            'div[data-testid="tweetTextarea_0"][role="textbox"]',
            'div[data-testid="tweetTextarea_0"][contenteditable="true"]',
            '[role="textbox"][data-testid]',
            'div[role="textbox"][contenteditable="true"]',
            '.public-DraftEditor-content',
            '[contenteditable="true"]'
        ], 8000);

        if (!composeBox) {
            showToast('❌ ไม่พบช่องพิมพ์ โปรดเปิดหน้า Compose ก่อน', 'error');
            return;
        }

        await fillComposeText(composeBox, text);

        if (autoSubmit) {
            await submitComposePost(composeBox, text);
            showToast('✅ โพสต์สำเร็จแล้ว', 'success');
            return { posted: true };
        }

        showToast('✅ ข้อความพร้อมแล้ว! กดปุ่ม Post ได้เลย', 'success');
        return { posted: false };
    }

    async function openQuoteComposer(sourceUrl) {
        const sourcePath = getStatusPath(sourceUrl);
        if (!sourcePath) {
            throw new Error('ไม่พบลิงก์โพสต์ต้นทางสำหรับ Quote');
        }

        // เช็คให้แน่ใจว่าอยู่หน้าโพสต์จริง 
        if (!window.location.pathname.includes(sourcePath)) {
            // Background script จะจัดการโหลดหน้ามาให้แล้ว แต่ถ้ายังมีปัญหาก็แจ้งเตือน
            console.warn('[XVR] รอ background script พาไปหน้า Quote...');
            await sleep(2000);
        }

        const sourceArticle = await waitForSourceTweetArticle(sourcePath, 15000);
        if (!sourceArticle) {
            throw new Error('ไม่พบโพสต์ต้นทางบนหน้า X');
        }

        const repostButton = sourceArticle.querySelector('[data-testid="retweet"]')
            || sourceArticle.querySelector('button[aria-label*="Repost" i]')
            || sourceArticle.querySelector('button[aria-label*="Repostear" i]');

        if (!repostButton) {
            throw new Error('ไม่พบปุ่ม Repost สำหรับ Quote');
        }

        repostButton.click();
        await sleep(800);

        const quoteButton = await waitForElement([
            '[data-testid="Dropdown"] [role="menuitem"]:nth-child(2)',
            '[role="menuitem"]',
            '[data-testid="Dropdown"] div[role="button"]'
        ], 6000);

        const quoteCandidate = findQuoteActionButton(quoteButton);
        if (!quoteCandidate) {
            throw new Error('ไม่พบเมนู Quote post');
        }

        quoteCandidate.click();
        await sleep(1600);
    }

    async function waitForSourceTweetArticle(sourcePath, timeout = 10000) {
        const startedAt = Date.now();
        while (Date.now() - startedAt < timeout) {
            const articles = Array.from(document.querySelectorAll('article[data-testid="tweet"]'));
            const found = articles.find((article) => {
                const statusLink = article.querySelector('a[href*="/status/"]');
                const href = statusLink?.getAttribute('href') || '';
                return href.includes(sourcePath);
            });

            if (found) return found;
            await sleep(400);
        }

        return null;
    }

    function findQuoteActionButton(initialMatch) {
        // หาจากลิงก์หรือปุ่มที่มีคำว่า Quote, โควต หรือมี href ชี้ไปที่ /compose/post
        const menuItems = Array.from(document.querySelectorAll('[role="menuitem"], [data-testid="Dropdown"] [role="button"], [data-testid="Dropdown"] div, a[href*="/compose/post"]'));

        let quoteItem = menuItems.find(item => {
            const text = (item.innerText || item.textContent || '').toLowerCase();
            return text.includes('quote') || text.includes('โควต');
        });

        // ถ้าหาจาก text ไม่เจอ ลองหาจากลูกที่เป็น svg/link ที่น่าจะสื่อถึง Quote
        if (!quoteItem) {
            quoteItem = menuItems.find(item => item.getAttribute('href')?.includes('/compose/post') || item.innerHTML.includes('pencil'));
        }

        // Fallback กลับไปที่ปุ่มที่ 2 ในเมนู Repost ถ้าหาพวก text/link ไม่เจอจริงๆ
        if (!quoteItem) {
            const secondMenuItem = document.querySelector('[data-testid="Dropdown"] [role="menuitem"]:nth-child(2)');
            if (secondMenuItem) quoteItem = secondMenuItem;
        }

        return quoteItem || initialMatch;
    }

    function getStatusPath(url) {
        try {
            const parsed = new URL(url);
            return parsed.pathname;
        } catch {
            return '';
        }
    }

    async function waitForUrlContains(fragment, timeout = 10000) {
        const startedAt = Date.now();
        while (Date.now() - startedAt < timeout) {
            if (window.location.pathname.includes(fragment)) {
                return true;
            }
            await sleep(250);
        }

        return false;
    }

    async function fillComposeText(element, text) {
        const nextText = String(text || '');
        if (!nextText) return;

        element.focus();
        await sleep(300);
        await clearTextInput(element);
        await sleep(200);

        const isContentEditable = element.getAttribute('contenteditable') !== null || element.getAttribute('role') === 'textbox';

        if (isContentEditable) {
            element.focus();
            placeCursorAtEnd(element);

            // X's text editor (Draft.js) handles full text insertion better than character by character 
            // which causes the cursor to jump to the front and backwards typing.
            const dataTransfer = new DataTransfer();
            dataTransfer.setData('text/plain', nextText);
            const pasteEvent = new ClipboardEvent('paste', {
                clipboardData: dataTransfer,
                bubbles: true,
                cancelable: true
            });

            element.dispatchEvent(pasteEvent);
            if (!pasteEvent.defaultPrevented) {
                document.execCommand('insertText', false, nextText);
            }

            element.dispatchEvent(new InputEvent('input', {
                bubbles: true,
                cancelable: true,
                data: nextText,
                inputType: 'insertText'
            }));

            await sleep(500);

            if (!composeTextLooksApplied(element, nextText)) {
                await clearTextInput(element);
                await sleep(200);
                placeCursorAtEnd(element);
                await typeHumanLike(element, nextText);
                await sleep(500);
            }

            if (!composeTextLooksApplied(element, nextText)) {
                throw new Error('พิมพ์ข้อความลง Quote ไม่สำเร็จ');
            }

            return;
        }

        setNativeValue(element, nextText);
        element.dispatchEvent(new Event('input', { bubbles: true }));
        element.dispatchEvent(new Event('change', { bubbles: true }));
        await sleep(300);

        if (!composeTextLooksApplied(element, nextText)) {
            throw new Error('พิมพ์ข้อความลงช่องโพสต์ไม่สำเร็จ');
        }
    }

    async function submitComposePost(composeBox, expectedText) {
        const feedbackBaseline = collectPostFeedbackTexts();
        const submitButton = await waitForPostButton(8000);
        if (!submitButton) {
            throw new Error('ไม่พบปุ่ม Post บน X');
        }

        submitButton.focus?.();
        submitButton.click();

        const submissionResult = await waitForComposeSubmission(composeBox, expectedText, feedbackBaseline, 12000);
        if (!submissionResult.success) {
            throw new Error(submissionResult.error || 'กดโพสต์แล้วแต่ยังไม่ยืนยันว่าโพสต์สำเร็จ');
        }
    }

    async function waitForPostButton(timeout = 8000) {
        const startedAt = Date.now();

        while (Date.now() - startedAt < timeout) {
            const button = collectPostButtons().find(btn => btn && isVisible(btn) && !isDisabled(btn));
            if (button) return button;
            await sleep(250);
        }

        return null;
    }

    function collectPostButtons() {
        const selectors = [
            'button[data-testid="tweetButtonInline"]',
            'button[data-testid="tweetButton"]',
            '[data-testid="tweetButtonInline"]',
            '[data-testid="tweetButton"]'
        ];

        const buttons = selectors.flatMap(selector => Array.from(document.querySelectorAll(selector)));
        return Array.from(new Set(buttons)).sort((a, b) => {
            const aDialog = a.closest('[role="dialog"]') ? 1 : 0;
            const bDialog = b.closest('[role="dialog"]') ? 1 : 0;
            return bDialog - aDialog;
        });
    }

    async function waitForComposeSubmission(composeBox, expectedText, feedbackBaseline = new Set(), timeout = 8000) {
        const startedAt = Date.now();
        let stableSuccessCount = 0;

        while (Date.now() - startedAt < timeout) {
            const feedbackState = getPostFeedbackState(feedbackBaseline);
            if (feedbackState.error) {
                return { success: false, error: feedbackState.error };
            }

            if (feedbackState.success) {
                return { success: true, verifiedBy: 'feedback' };
            }

            if (!document.body.contains(composeBox)) {
                return { success: true, verifiedBy: 'composer-removed' };
            }

            const currentText = (composeBox.innerText || composeBox.textContent || composeBox.value || '').trim();
            const submitButton = collectPostButtons().find(btn => btn && isVisible(btn));
            const textCleared = !currentText || !composeTextLooksApplied(composeBox, expectedText);
            const submitUnavailable = !submitButton || isDisabled(submitButton);

            if (textCleared && submitUnavailable) {
                stableSuccessCount += 1;
                if (stableSuccessCount >= 3) {
                    return { success: true, verifiedBy: 'compose-cleared' };
                }
            } else {
                stableSuccessCount = 0;
            }

            await sleep(300);
        }

        return { success: false, error: 'หมดเวลารอยืนยันว่าโพสต์สำเร็จ' };
    }

    function collectPostFeedbackTexts() {
        const selectors = [
            '[role="alert"]',
            '[aria-live="assertive"]',
            '[aria-live="polite"]',
            '[data-testid*="toast"]'
        ];

        const texts = selectors.flatMap((selector) => Array.from(document.querySelectorAll(selector)))
            .map((element) => (element.innerText || element.textContent || '').trim())
            .filter(Boolean);

        return new Set(texts);
    }

    function getPostFeedbackState(baseline) {
        const successPattern = /(your post was sent|your post was posted|posted successfully|ส่งโพสต์แล้ว|โพสต์แล้ว|โพสต์ของคุณถูกส่งแล้ว)/i;
        const errorPattern = /(something went wrong|try again|failed to post|post failed|โพสต์ไม่สำเร็จ|เกิดข้อผิดพลาด|ลองอีกครั้ง)/i;
        const currentTexts = Array.from(collectPostFeedbackTexts()).filter((text) => !baseline.has(text));

        const errorText = currentTexts.find((text) => errorPattern.test(text));
        if (errorText) {
            return { success: false, error: errorText };
        }

        const successText = currentTexts.find((text) => successPattern.test(text));
        if (successText) {
            return { success: true, message: successText };
        }

        return { success: false, error: '' };
    }

    // =============================================
    // 8) Human-like Typing (สำหรับพิมพ์ใน Compose ของ X)
    // =============================================
    async function typeHumanLike(element, text) {
        for (let i = 0; i < text.length; i++) {
            const char = text[i];

            // ใช้ execCommand สำหรับ contenteditable (React-friendly)
            if (element.getAttribute('contenteditable') !== null || element.getAttribute('role') === 'textbox') {
                element.focus();

                // สำหรับช่อง Quote บน X ถ้ามีการขึ้นบรรทัดใหม่ บางทีต้องใช้ shift+enter หรือ execCommand พิเศษ แต่ X มักตีความ \n จาก insertText ได้อยู่แล้ว
                if (char === '\n') {
                    document.execCommand('insertLineBreak');
                } else {
                    document.execCommand('insertText', false, char);
                }

                element.dispatchEvent(new InputEvent('input', {
                    bubbles: true,
                    cancelable: true,
                    data: char,
                    inputType: char === '\n' ? 'insertLineBreak' : 'insertText'
                }));
            } else {
                // fallback สำหรับ textarea/input
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
                element.dispatchEvent(new Event('input', { bubbles: true }));
            }

            // สุ่ม delay ระหว่างตัวอักษร 
            // ให้พิมพ์เร็ว/ช้าผสมกันไป (15-60ms เลียนแบบคนพิมพ์ได้รวดเร็วพอเหมาะ)
            await sleep(randomBetween(15, 60));

            // หยุดพักสั้นๆ เป็นบางจังหวะ 
            if (i > 0 && i % randomBetween(15, 30) === 0) {
                await sleep(randomBetween(100, 300));
            }
        }
    }

    function composeTextLooksApplied(element, expectedText) {
        const currentText = (element.innerText || element.textContent || element.value || '').replace(/\s+/g, ' ').trim();
        const expectedSample = String(expectedText || '').replace(/\s+/g, ' ').trim().slice(0, 24);
        return Boolean(currentText && expectedSample && currentText.includes(expectedSample));
    }

    function setNativeValue(element, value) {
        const prototype = element instanceof HTMLInputElement ? HTMLInputElement.prototype : HTMLTextAreaElement.prototype;
        const nativeSetter = Object.getOwnPropertyDescriptor(prototype, 'value')?.set;

        if (nativeSetter) {
            nativeSetter.call(element, value);
        } else {
            element.value = value;
        }
    }

    function dispatchSearchInputEvent(element, char, currentValue) {
        const inputEvent = typeof InputEvent === 'function'
            ? new InputEvent('input', {
                bubbles: true,
                cancelable: true,
                data: char,
                inputType: 'insertText'
            })
            : new Event('input', { bubbles: true, cancelable: true });

        element.dispatchEvent(inputEvent);
        element.dispatchEvent(new Event('change', { bubbles: true }));

        const keyCode = char.charCodeAt(0);
        const eventInit = {
            key: char,
            code: char === ' ' ? 'Space' : `Key${char.toUpperCase()}`,
            keyCode,
            which: keyCode,
            bubbles: true,
            cancelable: true
        };

        element.dispatchEvent(new KeyboardEvent('keydown', eventInit));
        element.dispatchEvent(new KeyboardEvent('keyup', eventInit));

        if (element.value !== currentValue) {
            setNativeValue(element, currentValue);
            element.dispatchEvent(new Event('input', { bubbles: true }));
        }
    }

    async function clearTextInput(element) {
        element.focus();
        await sleep(150);

        if (element.getAttribute('contenteditable') !== null || element.getAttribute('role') === 'textbox') {
            document.execCommand('selectAll', false, null);
            document.execCommand('delete', false, null);
            return;
        }

        setNativeValue(element, '');

        element.dispatchEvent(new Event('input', { bubbles: true }));
        element.dispatchEvent(new Event('change', { bubbles: true }));
    }

    function placeCursorAtEnd(element) {
        const selection = window.getSelection();
        if (!selection) return;

        const range = document.createRange();
        range.selectNodeContents(element);
        range.collapse(false);
        selection.removeAllRanges();
        selection.addRange(range);
    }

    function pressEnter(element) {
        const eventInit = {
            key: 'Enter',
            code: 'Enter',
            keyCode: 13,
            which: 13,
            bubbles: true,
            cancelable: true
        };

        element.dispatchEvent(new KeyboardEvent('keydown', eventInit));
        element.dispatchEvent(new KeyboardEvent('keypress', eventInit));
        element.dispatchEvent(new KeyboardEvent('keyup', eventInit));

        if (element.form && typeof element.form.requestSubmit === 'function') {
            element.form.requestSubmit();
        }
    }

    function isDisabled(element) {
        return Boolean(element?.disabled) || element?.getAttribute('aria-disabled') === 'true';
    }

    function isVisible(element) {
        if (!element) return false;
        const style = window.getComputedStyle(element);
        const rect = element.getBoundingClientRect();
        return style.display !== 'none' && style.visibility !== 'hidden' && rect.width > 0 && rect.height > 0;
    }

    function waitForNextFrame() {
        return new Promise(resolve => requestAnimationFrame(() => resolve()));
    }

    // =============================================
    // 9) Toast Notification
    // =============================================
    function showToast(message, type = 'info') {
        // ลบ toast เก่า
        const old = document.querySelector('.xvr-toast');
        if (old) old.remove();

        const toast = document.createElement('div');
        toast.className = `xvr-toast xvr-toast-${type}`;
        toast.textContent = message;
        document.body.appendChild(toast);

        setTimeout(() => toast.classList.add('xvr-toast-show'), 50);
        setTimeout(() => {
            toast.classList.remove('xvr-toast-show');
            setTimeout(() => toast.remove(), 400);
        }, 4000);
    }

    // =============================================
    // 10) Utilities
    // =============================================
    function sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    function randomBetween(min, max) {
        return Math.floor(Math.random() * (max - min + 1)) + min;
    }

    function waitForElement(selectors, timeout = 10000) {
        return new Promise((resolve) => {
            // ลองหาทันที
            for (const sel of selectors) {
                const el = document.querySelector(sel);
                if (el) return resolve(el);
            }

            // ใช้ MutationObserver รอ
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

    // =============================================
    // 11) MutationObserver - ดักจับโพสต์ใหม่ที่โหลดมา
    // =============================================
    const observer = new MutationObserver(() => {
        scanTweets();
    });

    observer.observe(document.body, {
        childList: true,
        subtree: true
    });

    // สแกนครั้งแรก
    setTimeout(scanTweets, 1000);

    // สแกนซ้ำเป็นระยะ (กรณี Observer พลาด)
    setInterval(scanTweets, SCAN_INTERVAL);

    console.log('[X Viral Repurpose] Content script loaded on x.com');
})();
