// =============================================
// X Viral Repurpose - Background Service Worker
// =============================================
// ตัวกลาง (Coordinator) สื่อสารระหว่าง:
//   content_x.js (x.com) <-> background.js <-> content_ai.js (grok.com)
//   sidepanel.js <-> background.js
// =============================================

// --- ค่าคงที่ ---
const PROMPT_TEMPLATE_VERSION = 3;

const DEFAULT_SETTINGS = {
    minViews: 500000,
    typingSpeedMin: 30,
    typingSpeedMax: 150,
    pauseEveryChars: 40,
    pauseMin: 300,
    pauseMax: 800,
    scrollPreset: 'medium',
    manualAssist: false,
    checkpointEverySteps: 6,
    pauseOnFound: true,
    sessionLimit: 15,
    dailyLimit: 60,
    promptTemplate: `สรุปเนื้อหาด้านล่างให้เป็นโพสต์ X (ทวิตเตอร์) สไตล์เพื่อนเล่าแบบชิล ๆ ภาษาพูดธรรมชาติ ห้ามทางการ ห้ามสุภาพเกิน

โครงสร้างบังคับเป๊ะ ๆ ดังนี้เท่านั้น:
1. บรรทัดแรก: ประโยคเปิดหัว 1 ประโยค ชวนสงสัย ดึงดูด อยากอ่านต่อ (สั้น ไม่เกิน 10 คำ)
2. เนื้อหาหลัก: ใช้ "-" นำหน้า แต่ละข้อสั้นกระชับมาก 2 ข้อ (บรรทัดละไม่เกิน 1-2 ประโยคสั้น ๆ)
3. บรรทัดสุดท้าย: ประโยคปิดท้าย 1 ประโยค เชื่อมโยงกลับประเด็นหลักของเนื้อหาต้นทาง แบบสรุปชิล ๆ (สั้น ไม่เกิน 10 คำ)

กฎสำคัญที่ต้องทำตามทุกครั้ง:
- ภาษาแบบเพื่อนคุยกันจริง ๆ (ว่ะ เออ 555 อะไรแบบนี้ใส่ได้ถ้าพอดีกับ mood)
- ห้ามใส่ hashtag, @, ลิงก์ใด ๆ ในข้อความที่สร้าง
- ข้อความทั้งหมดที่ AI สร้าง (รวมช่องว่าง การขึ้นบรรทัดใหม่ เครื่องหมายทุกตัว) ต้องยาวพอดี 247 ตัวอักษร (ไม่รวมลิงก์ที่ระบบจะต่อท้าย)
- เมื่อรวมกับลิงก์สินค้า {PRODUCT_URL} แล้ว ต้องครบ 280 ตัวอักษรเป๊ะ (รวมทุกอย่างทั้งลิงก์)
- ถ้ามีจังหวะเนียน ๆ สามารถแทรก สินค้า แบบไม่ยัดเยียด แต่ห้ามขายของแรง
- ตอบเฉพาะข้อความโพสต์ที่สร้างเสร็จ ไม่มีคำอธิบาย ไม่มี markdown ไม่มี code block ไม่มีข้อความใด ๆ เพิ่มเติม

เนื้อหาต้นทาง:
{CONTENT}`
};
const MAX_POST_LENGTH = 280;

// --- State ---
let aiWindowId = null;
let aiTabId = null;
let processingSourceTabId = null;
let isAutoScoutEnabled = false;
let autoScoutQuery = '';
let contextProduct = '';
let productLink = '';
let trendsCountry = 'TH';
let autoScoutProgress = createInitialProgress();

function createInitialProgress() {
    return {
        active: false,
        query: '',
        product: '',
        productLink: '',
        steps: 0,
        foundThisSession: 0,
        paused: false,
        pauseReason: '',
        manualAssist: false,
        scrollPreset: 'medium',
        lastUpdated: Date.now()
    };
}

function normalizeSettings(settings = {}, options = {}) {
    const merged = { ...DEFAULT_SETTINGS, ...(settings || {}) };
    const shouldUpgradePrompt = options.forcePromptUpgrade
        || !merged.promptTemplate
        || merged.promptTemplateVersion !== PROMPT_TEMPLATE_VERSION;

    if (shouldUpgradePrompt) {
        merged.promptTemplate = DEFAULT_SETTINGS.promptTemplate;
        merged.promptTemplateVersion = PROMPT_TEMPLATE_VERSION;
    }

    return merged;
}

async function ensureSettings() {
    const stored = await chrome.storage.local.get('settings');
    const normalized = normalizeSettings(stored.settings || {});

    if (JSON.stringify(normalized) !== JSON.stringify(stored.settings || {})) {
        await chrome.storage.local.set({ settings: normalized });
    }

    return normalized;
}

async function loadAutoScoutState() {
    const { autoScoutEnabled = false, autoScoutQuery: storedQuery = '', contextProduct: storedProduct = '', productLink: storedProductLink = '', trendsCountry: storedTrendsCountry = 'TH', autoScoutProgress: storedProgress } = await chrome.storage.local.get(['autoScoutEnabled', 'autoScoutQuery', 'contextProduct', 'productLink', 'trendsCountry', 'autoScoutProgress']);
    isAutoScoutEnabled = Boolean(autoScoutEnabled);
    autoScoutQuery = typeof storedQuery === 'string' ? storedQuery : '';
    contextProduct = typeof storedProduct === 'string' ? storedProduct : '';
    productLink = typeof storedProductLink === 'string' ? storedProductLink : '';
    trendsCountry = typeof storedTrendsCountry === 'string' && storedTrendsCountry ? storedTrendsCountry : 'TH';
    autoScoutProgress = storedProgress ? { ...createInitialProgress(), ...storedProgress } : createInitialProgress();
}

// =============================================
// 1) เปิด Side Panel เมื่อกดไอคอน Extension
// =============================================
chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true })
    .catch(console.error);

// =============================================
// 2) เริ่มต้นระบบ - โหลด Settings
// =============================================
chrome.runtime.onInstalled.addListener(async () => {
    const { settings, autoScoutEnabled, autoScoutQuery: storedQuery, contextProduct: storedProduct, productLink: storedProductLink, trendsCountry: storedTrendsCountry, results, googleTrends } = await chrome.storage.local.get(['settings', 'autoScoutEnabled', 'autoScoutQuery', 'contextProduct', 'productLink', 'trendsCountry', 'results', 'googleTrends']);
    if (!settings) {
        await chrome.storage.local.set({ settings: DEFAULT_SETTINGS, drafts: [], viralPosts: [], results: [], googleTrends: [], autoScoutEnabled: false, autoScoutQuery: '', contextProduct: '', productLink: '', trendsCountry: 'TH', autoScoutProgress: createInitialProgress() });
    } else if (typeof autoScoutEnabled === 'undefined' || typeof storedQuery === 'undefined' || typeof storedProduct === 'undefined' || typeof storedProductLink === 'undefined' || typeof storedTrendsCountry === 'undefined' || typeof results === 'undefined' || typeof googleTrends === 'undefined') {
        await chrome.storage.local.set({
            autoScoutEnabled: Boolean(autoScoutEnabled),
            autoScoutQuery: typeof storedQuery === 'string' ? storedQuery : '',
            contextProduct: typeof storedProduct === 'string' ? storedProduct : '',
            productLink: typeof storedProductLink === 'string' ? storedProductLink : '',
            trendsCountry: typeof storedTrendsCountry === 'string' && storedTrendsCountry ? storedTrendsCountry : 'TH',
            results: Array.isArray(results) ? results : [],
            googleTrends: Array.isArray(googleTrends) ? googleTrends : [],
            autoScoutProgress: createInitialProgress()
        });
    }
    await loadAutoScoutState();
});

loadAutoScoutState().catch(console.error);

// =============================================
// 3) Message Router - รับ-ส่งข้อความระหว่างทุกส่วน
// =============================================
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    handleMessage(message, sender).then(sendResponse).catch(err => {
        console.error('[BG] Error:', err);
        sendResponse({ success: false, error: err.message });
    });
    return true; // async response
});

async function handleMessage(message, sender) {
    switch (message.type) {

        // --- จาก content_x.js ---
        case 'VIRAL_POST_FOUND':
            return await saveViralPost(message.data);

        case 'AUTO_SCOUT_PROGRESS':
            return await updateAutoScoutProgress(message.data);

        case 'AUTO_SCOUT_STEP':
            return await sendAutoScoutCommand('AUTO_SCOUT_STEP');

        case 'AUTO_SCOUT_RESUME':
            return await sendAutoScoutCommand('AUTO_SCOUT_RESUME');

        case 'PROCESS_WITH_AI':
            processingSourceTabId = sender.tab?.id || null;
            return await queueAIProcess(message.data);

        case 'OPEN_SIDE_PANEL':
            if (sender.tab) {
                await chrome.sidePanel.open({ windowId: sender.tab.windowId });
            }
            return { success: true };

        // --- จาก content_ai.js ---
        case 'AI_PAGE_READY':
            return await onAIPageReady(sender.tab?.id || null);

        case 'AI_RESPONSE_READY':
            return await onAIResponseReady(message.data);

        case 'AI_ERROR':
            await broadcastStatus('error', message.data.error);
            if (pendingPrompt?.queueItemId) {
                await updateProcessQueueItem(pendingPrompt.queueItemId, {
                    queueStatus: 'error',
                    queueError: message.data.error || 'AI processing failed'
                });
            }
            pendingPrompt = null;
            setTimeout(() => {
                startAIQueue();
            }, 3000);
            return { success: true };

        // --- จาก sidepanel.js ---
        case 'GET_AUTO_SCOUT_STATE':
            await loadAutoScoutState();
            return { success: true, data: { enabled: isAutoScoutEnabled, query: autoScoutQuery, product: contextProduct, productLink, trendsCountry, progress: autoScoutProgress } };

        case 'SET_AUTO_SCOUT_STATE':
            isAutoScoutEnabled = Boolean(message.data?.enabled);
            autoScoutQuery = typeof message.data?.query === 'string' ? message.data.query.trim() : autoScoutQuery;
            contextProduct = typeof message.data?.product === 'string' ? message.data.product.trim() : contextProduct;
            productLink = typeof message.data?.productLink === 'string' ? message.data.productLink.trim() : productLink;
            autoScoutProgress = {
                ...createInitialProgress(),
                active: isAutoScoutEnabled,
                query: autoScoutQuery,
                product: contextProduct,
                productLink,
                manualAssist: Boolean((await getSettings()).data.manualAssist),
                scrollPreset: (await getSettings()).data.scrollPreset || 'medium',
                lastUpdated: Date.now()
            };
            await chrome.storage.local.set({ autoScoutEnabled: isAutoScoutEnabled, autoScoutQuery, contextProduct, productLink, autoScoutProgress });

            let tabs = await chrome.tabs.query({ url: ['https://x.com/*', 'https://twitter.com/*'] });
            if (isAutoScoutEnabled && tabs.length === 0) {
                const createdTab = await chrome.tabs.create({ url: 'https://x.com/explore/tabs/trending' });
                tabs = createdTab ? [createdTab] : [];
            } else if (isAutoScoutEnabled && tabs.length > 0) {
                const currentWindow = await chrome.windows.getCurrent();
                const preferredTab = tabs.find(tab => tab.active && tab.windowId === currentWindow.id) || tabs[0];
                await chrome.tabs.update(preferredTab.id, {
                    url: 'https://x.com/explore/tabs/trending',
                    active: true
                });
                tabs = [preferredTab];
            }

            await Promise.allSettled(
                tabs.map(tab => chrome.tabs.sendMessage(tab.id, {
                    type: 'AUTO_SCOUT_TOGGLE',
                    data: { enabled: isAutoScoutEnabled, query: autoScoutQuery, product: contextProduct, productLink }
                }))
            );

            await broadcastStatus(
                isAutoScoutEnabled ? 'processing' : 'done',
                isAutoScoutEnabled ? `เปิด Auto Scout แล้ว: ${autoScoutQuery || 'ยังไม่ตั้งคำค้น'}` : 'ปิด Auto Scout แล้ว'
            );
            return { success: true };

        case 'SET_CONTEXT_PRODUCT':
            contextProduct = typeof message.data === 'string' ? message.data.trim() : contextProduct;
            autoScoutProgress = { ...autoScoutProgress, product: contextProduct, lastUpdated: Date.now() };
            await chrome.storage.local.set({ contextProduct, autoScoutProgress });
            return { success: true };

        case 'SET_PRODUCT_LINK':
            productLink = typeof message.data === 'string' ? message.data.trim() : productLink;
            autoScoutProgress = { ...autoScoutProgress, productLink, lastUpdated: Date.now() };
            await chrome.storage.local.set({ productLink, autoScoutProgress });
            return { success: true };

        case 'GET_DRAFTS':
            return await getDrafts();

        case 'GET_VIRAL_POSTS':
            return await getViralPosts();

        case 'GET_PROCESS_QUEUE':
            return await getProcessQueue();

        case 'ADD_TO_PROCESS_QUEUE':
            return await addToProcessQueue(message.data || []);

        case 'REMOVE_FROM_PROCESS_QUEUE':
            return await removeFromProcessQueue(message.data?.id);

        case 'CLEAR_PROCESS_QUEUE':
            return await clearProcessQueue();

        case 'START_PROCESS_QUEUE':
            return await startProcessQueueFromStorage();

        case 'GET_SETTINGS':
            return await getSettings();

        case 'SAVE_SETTINGS':
            return await saveSettings(message.data);

        case 'GET_RESULTS':
            return await getResults();

        case 'GET_LATEST_RESULT':
            return await getLatestResult();

        case 'CLEAR_RESULTS':
            return await clearResults();

        case 'GET_GOOGLE_TRENDS':
            return await getGoogleTrends(message.data?.geo || 'TH');

        case 'SET_TRENDS_COUNTRY':
            trendsCountry = typeof message.data === 'string' && message.data ? message.data.toUpperCase() : 'TH';
            await chrome.storage.local.set({ trendsCountry });
            return { success: true, data: trendsCountry };

        case 'DELETE_DRAFT':
            return await deleteDraft(message.data.id);

        case 'UPDATE_DRAFT':
            return await updateDraft(message.data);

        case 'POST_TO_X':
            return await postToX(message.data);

        case 'START_AUTO_QUOTE':
            // รอรับคำสั่ง Auto Quote
            return await startAutoQuoteLoop();

        case 'STOP_AUTO_QUOTE':
            return await stopAutoQuoteLoop();

        case 'CLEAR_ALL_DRAFTS':
            return await clearAllDrafts();

        case 'CLEAR_ALL_VIRAL':
            return await clearAllViral();

        default:
            return { success: false, error: 'Unknown message type' };
    }
}

// =============================================
// 4) Viral Post Management
// =============================================
async function saveViralPost(post) {
    const limits = await getLimitsState();
    if (limits.sessionLimitReached || limits.dailyLimitReached) {
        await broadcastStatus('done', limits.dailyLimitReached ? 'ถึง daily limit แล้ว' : 'ถึง session limit แล้ว');
        return { success: false, limitReached: true };
    }

    const { viralPosts = [] } = await chrome.storage.local.get('viralPosts');

    // เช็คซ้ำ (ดูจาก URL)
    if (viralPosts.some(p => p.url === post.url)) {
        return { success: true, duplicate: true };
    }

    post.id = generateId();
    post.capturedAt = new Date().toISOString();
    viralPosts.unshift(post);

    // เก็บสูงสุด 100 โพสต์
    if (viralPosts.length > 100) viralPosts.length = 100;

    await chrome.storage.local.set({ viralPosts });
    await incrementDiscoveryCounters();
    await broadcastStatus('found', `พบโพสต์ Viral ใหม่: ${post.viewCountText}`);
    return { success: true, id: post.id };
}

async function getViralPosts() {
    const { viralPosts = [] } = await chrome.storage.local.get('viralPosts');
    return { success: true, data: viralPosts };
}

async function getProcessQueue() {
    const { processQueue = [] } = await chrome.storage.local.get('processQueue');
    return { success: true, data: processQueue };
}

async function addToProcessQueue(items) {
    const nextItems = Array.isArray(items) ? items : [items];
    const { processQueue = [] } = await chrome.storage.local.get('processQueue');

    const merged = [...processQueue];
    for (const item of nextItems) {
        if (!item?.id) continue;
        const existingIndex = merged.findIndex(existing => existing.id === item.id);
        const normalizedItem = {
            ...item,
            queueStatus: 'queued',
            queueAddedAt: new Date().toISOString(),
            queueUpdatedAt: new Date().toISOString(),
            queueError: ''
        };

        if (existingIndex >= 0) {
            merged[existingIndex] = {
                ...merged[existingIndex],
                ...normalizedItem
            };
            continue;
        }

        merged.push(normalizedItem);
    }

    await chrome.storage.local.set({ processQueue: merged });
    return { success: true, data: merged };
}

async function updateProcessQueueItem(id, patch) {
    if (!id) return;

    const { processQueue = [] } = await chrome.storage.local.get('processQueue');
    const nextQueue = processQueue.map(item => item.id === id
        ? {
            ...item,
            ...patch,
            queueUpdatedAt: new Date().toISOString()
        }
        : item);

    await chrome.storage.local.set({ processQueue: nextQueue });
}

async function removeFromProcessQueue(id) {
    const { processQueue = [] } = await chrome.storage.local.get('processQueue');
    const filtered = processQueue.filter(item => item.id !== id);
    await chrome.storage.local.set({ processQueue: filtered });
    return { success: true, data: filtered };
}

async function clearProcessQueue() {
    await chrome.storage.local.set({ processQueue: [] });
    return { success: true };
}

async function clearAllViral() {
    await chrome.storage.local.set({ viralPosts: [] });
    return { success: true };
}

// =============================================
// 5) AI Processing - เปิดหน้าต่าง grok.com แบบครึ่งจอ
// =============================================
let pendingPrompt = null;
let aiProcessQueue = [];
let isProcessingAIQueue = false;

function isAiBusy() {
    return Boolean(pendingPrompt) || isProcessingAIQueue || aiProcessQueue.length > 0;
}

async function closeAiWindowIfIdle(force = false) {
    if (!aiWindowId) return;
    if (!force && isAiBusy()) return;

    try {
        await chrome.windows.remove(aiWindowId);
    } catch {
        // ignore
    }

    aiWindowId = null;
    aiTabId = null;
}

async function queueAIProcess(data) {
    aiProcessQueue.push(data);
    if (!isProcessingAIQueue) {
        await startAIQueue();
    }
    return { success: true };
}

async function startProcessQueueFromStorage() {
    if (isProcessingAIQueue || pendingPrompt) {
        return { success: false, error: 'คิวกำลังทำงานอยู่แล้ว' };
    }

    const { processQueue = [] } = await chrome.storage.local.get('processQueue');
    const itemsToRun = processQueue.filter(item => (item.queueStatus || 'queued') !== 'done');

    if (!itemsToRun.length) {
        return { success: false, error: 'ไม่มีรายการในคิว' };
    }

    for (const item of itemsToRun) {
        aiProcessQueue.push(item);
    }

    await Promise.all(itemsToRun.map(item => updateProcessQueueItem(item.id, {
        queueStatus: 'queued',
        queueError: ''
    })));

    await broadcastStatus('processing', `เริ่มสร้างคอนเทนต์ตามคิว ${itemsToRun.length} รายการ`);

    if (!isProcessingAIQueue) {
        await startAIQueue();
    }

    return { success: true, count: itemsToRun.length };
}

async function startAIQueue() {
    if (aiProcessQueue.length === 0) {
        isProcessingAIQueue = false;
        await broadcastStatus('done', 'สร้างคอนเทนต์ทั้งหมดเสร็จสิ้นแล้ว!');

        await closeAiWindowIfIdle(true);
        return;
    }

    isProcessingAIQueue = true;
    const nextData = aiProcessQueue.shift();
    await updateProcessQueueItem(nextData?.id, {
        queueStatus: 'processing',
        queueError: ''
    });

    try {
        const result = await startAIProcessing(nextData);
        if (result?.success === false) {
            throw new Error(result.error || 'เริ่มสร้างคอนเทนต์ไม่สำเร็จ');
        }
    } catch (error) {
        await updateProcessQueueItem(nextData?.id, {
            queueStatus: 'error',
            queueError: error.message || 'เริ่มสร้างคอนเทนต์ไม่สำเร็จ'
        });

        pendingPrompt = null;
        isProcessingAIQueue = false;
        await broadcastStatus('error', error.message || 'เริ่มสร้างคอนเทนต์ไม่สำเร็จ');

        setTimeout(() => {
            startAIQueue();
        }, 1500);
    }
}

async function startAIProcessing(data) {
    const settings = await ensureSettings();
    const prompt = buildPrompt(data, settings, contextProduct);

    pendingPrompt = {
        requestId: generateId(),
        queueItemId: data.id,
        prompt,
        sourcePost: {
            ...data,
            cleanText: sanitizeSourceText(data.text),
            product: contextProduct,
            productLink
        }
    };

    await broadcastStatus('processing', 'กำลังเปิด grok.com...');

    // เช็คว่ามีหน้าต่าง grok.com เปิดอยู่หรือไม่
    if (aiWindowId) {
        try {
            await chrome.windows.get(aiWindowId);
            await dispatchPromptToAi(settings);
            return { success: true };
        } catch {
            aiWindowId = null;
            aiTabId = null;
        }
    }

    // เปิดหน้าต่างใหม่แบบ Popup (ครึ่งจอขวา)
    try {
        const currentWindow = await chrome.windows.getCurrent();
        const popupWidth = Math.floor(currentWindow.width * 0.45);
        const popupLeft = currentWindow.left + currentWindow.width - popupWidth;

        const newWindow = await chrome.windows.create({
            url: 'https://grok.com/',
            type: 'popup',
            width: popupWidth,
            height: currentWindow.height,
            left: popupLeft,
            top: currentWindow.top
        });

        aiWindowId = newWindow.id;
        aiTabId = newWindow.tabs[0].id;

        await waitForTabComplete(aiTabId, 20000);

        return { success: true };
    } catch (err) {
        await broadcastStatus('error', 'เปิด grok.com ไม่สำเร็จ: ' + err.message);
        return { success: false, error: err.message };
    }
}

async function dispatchPromptToAi(settings, retries = 8, delayMs = 800) {
    if (!pendingPrompt?.prompt) {
        throw new Error('ไม่มี prompt ที่รอส่งไปยัง Grok');
    }

    if (!Number.isInteger(aiTabId)) {
        aiTabId = await resolveAiTabId();
    }

    if (!Number.isInteger(aiTabId)) {
        throw new Error('หาแท็บ Grok ไม่เจอ');
    }

    let lastError = null;
    for (let attempt = 1; attempt <= retries; attempt += 1) {
        try {
            await sendMessageToTab(aiTabId, {
                type: 'TYPE_PROMPT',
                data: {
                    requestId: pendingPrompt.requestId,
                    prompt: pendingPrompt.prompt,
                    settings: settings || DEFAULT_SETTINGS
                }
            });
            return true;
        } catch (error) {
            lastError = error;
            aiTabId = await resolveAiTabId();
            await sleep(delayMs);
        }
    }

    throw new Error(`ส่ง prompt ไปที่ Grok ไม่สำเร็จ: ${lastError?.message || 'unknown error'}`);
}

async function waitForTabComplete(tabId, timeout = 15000) {
    const startedAt = Date.now();

    while (Date.now() - startedAt < timeout) {
        try {
            const tab = await chrome.tabs.get(tabId);
            if (tab?.status === 'complete') {
                return true;
            }
        } catch {
            break;
        }

        await sleep(300);
    }

    return false;
}

async function resolveAiTabId() {
    if (!aiWindowId) return null;

    try {
        const tabs = await chrome.tabs.query({ windowId: aiWindowId });
        const grokTab = tabs.find(tab => String(tab.url || '').includes('grok.com')) || tabs[0];
        return Number.isInteger(grokTab?.id) ? grokTab.id : null;
    } catch {
        return null;
    }
}

function sendMessageToTab(tabId, message) {
    return new Promise((resolve, reject) => {
        if (!Number.isInteger(tabId)) {
            reject(new Error('invalid tab id'));
            return;
        }

        chrome.tabs.sendMessage(tabId, message, (response) => {
            const error = chrome.runtime.lastError;
            if (error) {
                reject(new Error(error.message));
                return;
            }
            resolve(response);
        });
    });
}

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

// เมื่อหน้า grok.com โหลดเสร็จ content_ai.js จะแจ้งมา
async function onAIPageReady(tabId = null) {
    if (!pendingPrompt) return { success: false, error: 'No pending prompt' };

    if (Number.isInteger(tabId)) {
        aiTabId = tabId;
    }

    const settings = await ensureSettings();
    await broadcastStatus('processing', 'กำลังพิมพ์ Prompt...');

    if (aiTabId) {
        await dispatchPromptToAi(settings, 12, 800);
    }

    return { success: true };
}

// เมื่อ AI ตอบเสร็จ
async function onAIResponseReady(data) {
    const { drafts = [], results = [] } = await chrome.storage.local.get(['drafts', 'results']);
    const rawResponse = String(data?.response || '');
    const finalText = buildFinalPostText(
        rawResponse,
        pendingPrompt?.sourcePost?.productLink || ''
    );

    debugDraftSave('before-save-draft', {
        rawResponse,
        finalText,
        productLink: pendingPrompt?.sourcePost?.productLink || '',
        sourceUrl: pendingPrompt?.sourcePost?.url || '',
        sourceAuthor: pendingPrompt?.sourcePost?.author || ''
    });

    const draft = {
        id: generateId(),
        sourcePostId: pendingPrompt?.sourcePost?.id || null,
        sourceText: pendingPrompt?.sourcePost?.text || '',
        cleanSourceText: pendingPrompt?.sourcePost?.cleanText || '',
        sourceUrl: pendingPrompt?.sourcePost?.url || '',
        sourceAuthor: pendingPrompt?.sourcePost?.author || '',
        product: pendingPrompt?.sourcePost?.product || '',
        productLink: pendingPrompt?.sourcePost?.productLink || '',
        generatedText: rawResponse,
        finalText,
        status: 'ready',
        createdAt: new Date().toISOString()
    };

    const resultItem = {
        id: draft.id,
        sourceUrl: draft.sourceUrl,
        sourceAuthor: draft.sourceAuthor,
        sourceText: draft.cleanSourceText,
        product: draft.product,
        productLink: draft.productLink,
        generatedText: draft.generatedText,
        finalText: draft.finalText,
        copied: Boolean(data.copied),
        createdAt: draft.createdAt
    };

    drafts.unshift(draft);
    results.unshift(resultItem);

    // เก็บสูงสุด 50 drafts
    if (drafts.length > 50) drafts.length = 50;
    if (results.length > 100) results.length = 100;

    await chrome.storage.local.set({ drafts, results });

    if (pendingPrompt?.queueItemId) {
        await updateProcessQueueItem(pendingPrompt.queueItemId, {
            queueStatus: 'done',
            queueError: '',
            resultDraftId: draft.id,
            completedAt: draft.createdAt
        });
    }

    pendingPrompt = null;

    await broadcastStatus('done', `AI สร้างข้อความเสร็จแล้ว! (รอคิว: ${aiProcessQueue.length})`);

    // โหลดหน้า Results อัตโนมัติ (เฉพาะเวลากดทีละอัน หรือทำคิวสุดท้ายเสร็จ)
    if (aiProcessQueue.length === 0) {
        await openResultsPage(draft.id);
    } else {
        // ให้มัน Update ให้ Side panel รู้
        const tabs = await chrome.tabs.query({});
        tabs.forEach(tab => chrome.tabs.sendMessage(tab.id, { type: 'DRAFTS_UPDATED' }).catch(() => { }));
    }

    // ไปเริ่มคิวต่อไป (ถ้ามี)
    setTimeout(() => {
        startAIQueue();
    }, 2000);

    return { success: true, id: draft.id };
}

// =============================================
// 6) Draft Management
// =============================================
async function getDrafts() {
    const { drafts = [] } = await chrome.storage.local.get('drafts');
    return { success: true, data: drafts };
}

async function getResults() {
    const { results = [] } = await chrome.storage.local.get('results');
    return { success: true, data: results };
}

async function getLatestResult() {
    const { results = [] } = await chrome.storage.local.get('results');
    return { success: true, data: results[0] || null };
}

async function clearResults() {
    await chrome.storage.local.set({ results: [] });
    return { success: true };
}

async function deleteDraft(id) {
    const { drafts = [] } = await chrome.storage.local.get('drafts');
    const filtered = drafts.filter(d => d.id !== id);
    await chrome.storage.local.set({ drafts: filtered });
    return { success: true };
}

async function updateDraft(data) {
    const { drafts = [], results = [] } = await chrome.storage.local.get(['drafts', 'results']);
    const idx = drafts.findIndex(d => d.id === data.id);
    if (idx >= 0) {
        const existingDraft = drafts[idx];
        const nextGeneratedText = typeof data.generatedText === 'string'
            ? data.generatedText
            : (typeof data.finalText === 'string' ? data.finalText : existingDraft.generatedText);
        const nextFinalText = buildFinalPostText(
            typeof data.finalText === 'string' ? data.finalText : nextGeneratedText,
            existingDraft.productLink || data.productLink || ''
        );

        drafts[idx] = {
            ...existingDraft,
            ...data,
            generatedText: nextGeneratedText,
            finalText: nextFinalText
        };

        const resultIdx = results.findIndex(item => item.id === data.id);
        if (resultIdx >= 0) {
            results[resultIdx] = {
                ...results[resultIdx],
                generatedText: nextGeneratedText,
                finalText: nextFinalText
            };
        }

        await chrome.storage.local.set({ drafts, results });
    }
    return { success: true };
}

async function clearAllDrafts() {
    await chrome.storage.local.set({ drafts: [] });
    return { success: true };
}

// =============================================
// 7) Post to X - ส่งข้อความไปพิมพ์ในช่อง Compose ของ X
// =============================================
async function postToX(data) {
    const { drafts = [] } = await chrome.storage.local.get('drafts');
    const draft = drafts.find(item => item.id === data.id);
    const postText = draft?.finalText || data.text || '';
    const sourceUrl = draft?.sourceUrl || data.sourceUrl || '';

    // หา tab ของ x.com ที่เปิดอยู่
    const tabs = await chrome.tabs.query({ url: ['https://x.com/*', 'https://twitter.com/*'] });

    let targetTabId;
    if (tabs.length > 0) {
        targetTabId = tabs[0].id;

        // ถ้านี่คือโพสต์ Quote ให้เช็คว่าอยู่หน้าโพสต์ต้นทางหรือยัง
        if (sourceUrl) {
            const currentTab = tabs[0];
            const sourcePath = new URL(sourceUrl).pathname;

            if (!currentTab.url.includes(sourcePath)) {
                await chrome.tabs.update(targetTabId, { url: sourceUrl, active: true });
                // รอให้หน้าโหลด
                await new Promise(resolve => {
                    chrome.tabs.onUpdated.addListener(function listener(tabId, info) {
                        if (tabId === targetTabId && info.status === 'complete') {
                            chrome.tabs.onUpdated.removeListener(listener);
                            resolve();
                        }
                    });
                });
            } else {
                await chrome.tabs.update(targetTabId, { active: true });
            }
        } else {
            await chrome.tabs.update(targetTabId, { active: true });
        }
    } else {
        const urlToOpen = sourceUrl ? sourceUrl : 'https://x.com/compose/post';
        const tab = await chrome.tabs.create({ url: urlToOpen });
        targetTabId = tab.id;
        // รอให้หน้าโหลด
        await new Promise(resolve => {
            chrome.tabs.onUpdated.addListener(function listener(tabId, info) {
                if (tabId === targetTabId && info.status === 'complete') {
                    chrome.tabs.onUpdated.removeListener(listener);
                    resolve();
                }
            });
        });
    }

    // ส่งข้อความไปให้ content_x.js พิมพ์ในช่อง Compose
    setTimeout(async () => {
        await chrome.tabs.sendMessage(targetTabId, {
            type: 'TYPE_ON_X',
            data: { text: postText, draftId: data.id, sourceUrl } // sourceUrl ส่งต่อเพื่อ Quote Flow
        });
    }, 4500); // เพิ่ม delay เพื่อให้หน้าและ React components โหลดครบ

    // อัปเดตสถานะ draft เป็น ready_for_post แต่ไม่ต้องล็อคตัวเองมากนัก
    await updateDraft({ id: data.id, status: 'pending_post' });
    return { success: true };
}

// =============================================
// AUTO QUOTE SYSTEM
// =============================================
let autoQuoteLoopActive = false;
let autoQuoteTimer = null;

async function startAutoQuoteLoop() {
    if (autoQuoteLoopActive) return { success: false, message: 'Already running' };

    if (isAiBusy()) {
        await broadcastStatus('error', 'ยังมีงาน AI/Grok ค้างอยู่ โปรดรอให้สร้างคอนเทนต์เสร็จก่อนเริ่ม Auto Quote');
        return { success: false, error: 'AI queue is still running' };
    }

    await closeAiWindowIfIdle(true);

    autoQuoteLoopActive = true;

    // Process loop function
    const loop = async () => {
        if (!autoQuoteLoopActive) return;

        try {
            const { drafts = [] } = await chrome.storage.local.get('drafts');
            // เลือกเฉพาะอันที่พร้อม และมี sourceUrl
            const readyDraft = drafts.find(d => d.status === 'ready' && d.sourceUrl);

            if (readyDraft) {
                console.log('[XVR] Auto-Quoting Draft ID:', readyDraft.id);
                // สั่งโพสต์ลง X
                await postToX({ id: readyDraft.id });

                // หน่วงเวลา รอให้คนอาจจะกดส่งเองที่หน้าเว็บ หรือรอระบบพิมพ์เสร็จ
                // อ่านค่าจาก settings (ใช้เวลาโพสต์ดีเลย์ หรือใช้แบบ random)
                const { settings } = await chrome.storage.local.get('settings');
                const defaultMin = parseInt(settings?.autoQuoteMinMinutes || 2, 10);
                const defaultMax = parseInt(settings?.autoQuoteMaxMinutes || 5, 10);

                // สุ่มเวลา (นาทีเป็นมิลลิวินาที)
                const delayMs = Math.floor(Math.random() * (defaultMax - defaultMin + 1) + defaultMin) * 60 * 1000;

                console.log(`[XVR] รอ ${delayMs / 60000} นาทีก่อนโพสต์ถัดไป...`);
                autoQuoteTimer = setTimeout(loop, delayMs);
            } else {
                console.log('[XVR] ไม่มี Draft ที่พร้อมสำหรับ Auto Quote แล้วระบบจะหยุดพัก 1 นาทีและเช็คใหม่');
                autoQuoteTimer = setTimeout(loop, 60000); // เช็คใหม่ทุก 1 นาทีถ้าหมด
            }
        } catch (err) {
            console.error('[XVR] Auto Quote Loop Error:', err);
            autoQuoteTimer = setTimeout(loop, 30000); // หาก error ลองใหม่ใน 30 วิ
        }
    };

    loop(); // start
    return { success: true };
}

async function stopAutoQuoteLoop() {
    autoQuoteLoopActive = false;
    if (autoQuoteTimer) clearTimeout(autoQuoteTimer);
    return { success: true };
}

// =============================================
// 8) Settings
// =============================================
async function getSettings() {
    const settings = await ensureSettings();
    return { success: true, data: settings };
}

async function saveSettings(newSettings) {
    const settings = normalizeSettings({ ...newSettings, promptTemplateVersion: PROMPT_TEMPLATE_VERSION });
    await chrome.storage.local.set({ settings });

    const tabs = await chrome.tabs.query({ url: ['https://x.com/*', 'https://twitter.com/*'] });
    await Promise.allSettled(
        tabs.map(tab => chrome.tabs.sendMessage(tab.id, {
            type: 'SETTINGS_UPDATED',
            data: settings
        }))
    );

    return { success: true, data: settings };
}

async function sendAutoScoutCommand(type) {
    const tabs = await chrome.tabs.query({ url: ['https://x.com/*', 'https://twitter.com/*'] });
    await Promise.allSettled(tabs.map(tab => chrome.tabs.sendMessage(tab.id, { type })));
    return { success: true };
}

async function updateAutoScoutProgress(progress) {
    autoScoutProgress = {
        ...autoScoutProgress,
        ...progress,
        query: autoScoutQuery,
        product: contextProduct,
        productLink,
        active: isAutoScoutEnabled,
        lastUpdated: Date.now()
    };
    await chrome.storage.local.set({ autoScoutProgress });
    return { success: true };
}

async function getGoogleTrends(geo = 'TH') {
    const normalizedGeo = typeof geo === 'string' && geo.trim() ? geo.trim().toUpperCase() : 'TH';
    const url = `https://trends.google.com/trending/rss?geo=${encodeURIComponent(normalizedGeo)}`;

    try {
        const response = await fetch(url);
        if (!response.ok) {
            throw new Error(`Google Trends request failed with status ${response.status}`);
        }

        const xml = await response.text();
        const trends = extractTrendQueries(xml, normalizedGeo);

        if (!trends.length) {
            throw new Error('Google Trends feed returned no trend items');
        }

        await chrome.storage.local.set({ googleTrends: trends, googleTrendsUpdatedAt: Date.now() });
        return { success: true, data: trends };
    } catch (error) {
        const { googleTrends = [] } = await chrome.storage.local.get('googleTrends');
        return { success: googleTrends.length > 0, data: googleTrends, error: error.message };
    }
}

function extractTrendQueries(xml, geo = 'TH') {
    const itemRegex = /<item>([\s\S]*?)<\/item>/gi;
    const results = [];
    let match;

    while ((match = itemRegex.exec(String(xml || ''))) && results.length < 20) {
        const itemXml = match[1];
        const query = decodeXmlEntities(extractTag(itemXml, 'title')).trim();
        const traffic = decodeXmlEntities(extractTag(itemXml, 'ht:approx_traffic')).trim();
        const publishedAt = decodeXmlEntities(extractTag(itemXml, 'pubDate')).trim();

        if (query && !results.some(item => item.query === query)) {
            results.push({
                id: `${geo}-${results.length}-${Date.now()}`,
                query,
                traffic,
                publishedAt
            });
        }
    }

    return results;
}

function extractTag(xml, tagName) {
    const safeTagName = String(tagName || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const regex = new RegExp(`<${safeTagName}>([\\s\\S]*?)<\\/${safeTagName}>`, 'i');
    return xml.match(regex)?.[1] || '';
}

function decodeXmlEntities(value) {
    return String(value || '')
        .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'")
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&nbsp;/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}

async function incrementDiscoveryCounters() {
    const today = new Date().toISOString().slice(0, 10);
    const { dailyStats = { date: today, foundCount: 0 } } = await chrome.storage.local.get('dailyStats');
    const nextDailyStats = dailyStats.date === today
        ? { date: today, foundCount: (dailyStats.foundCount || 0) + 1 }
        : { date: today, foundCount: 1 };

    autoScoutProgress = {
        ...autoScoutProgress,
        foundThisSession: (autoScoutProgress.foundThisSession || 0) + 1,
        lastUpdated: Date.now()
    };

    await chrome.storage.local.set({ dailyStats: nextDailyStats, autoScoutProgress });
}

async function getLimitsState() {
    const { settings } = await chrome.storage.local.get('settings');
    const cfg = settings || DEFAULT_SETTINGS;
    const today = new Date().toISOString().slice(0, 10);
    const { dailyStats = { date: today, foundCount: 0 } } = await chrome.storage.local.get('dailyStats');
    const dailyCount = dailyStats.date === today ? (dailyStats.foundCount || 0) : 0;

    return {
        sessionLimitReached: cfg.sessionLimit > 0 && (autoScoutProgress.foundThisSession || 0) >= cfg.sessionLimit,
        dailyLimitReached: cfg.dailyLimit > 0 && dailyCount >= cfg.dailyLimit,
        dailyCount
    };
}

function sanitizeSourceText(text) {
    if (!text) return '';
    return String(text)
        .replace(/https?:\/\/\S+|www\.\S+/gi, ' ')
        .replace(/(^|\s)#[^\s#]+/g, '$1')
        .replace(/\s+/g, ' ')
        .trim();
}

function buildPrompt(sourcePost, settings, product) {
    const cleanContent = sanitizeSourceText(sourcePost?.text || '');
    const productUrl = productLink || sourcePost?.productLink || '';
    const charBudget = getBodyCharacterBudget(productUrl);
    const sourceContentContext = '- ใช้เนื้อหาจากทั้งโพสต์ได้ รวมถึงข้อความหลัง hashtag แต่ไม่ต้องคัดลอก hashtag หรือลิงก์จากต้นทางมาใช้ตรงๆ';
    const outputOnlyContext = '- ตอบกลับเฉพาะข้อความโพสต์สุดท้ายเพียงอย่างเดียว ห้ามมีคำอธิบาย ห้ามมี markdown ห้ามมี code block และห้ามมีข้อความสถานะ เช่น Executed code';
    const bulletContext = '- หลังบรรทัดเปิด ต้องมี bullet อย่างน้อย 1 บรรทัด โดยแต่ละ bullet ต้องขึ้นต้นด้วย -';
    const productContext = product
        ? `- ถ้ามีจังหวะที่เหมาะ ให้เชื่อมโยงกับสินค้า/บริการนี้แบบเนียนๆ ไม่ hard sell: ${product}`
        : '';
    const exactLengthContext = [
        '- ระบบจะต่อท้ายข้อความด้วยลิงก์สินค้าอัตโนมัติ และจะใช้โพสต์ต้นทางทำ Quote แยกต่างหาก',
        `- ข้อความที่ AI สร้างได้เองต้องยาว ${charBudget} ตัวอักษรพอดี`,
        `- เมื่อนำข้อความนี้ไปรวมกับลิงก์สินค้า ${productUrl || '(ไม่มี)'} รวมทั้งทุกตัวอักษร ช่องว่าง เครื่องหมาย ?, -, การขึ้นบรรทัดใหม่ และลิงก์ทั้งหมด ความยาวรวมต้องเท่ากับ ${MAX_POST_LENGTH} ตัวอักษรพอดี`
    ].join('\n');

    let template = settings?.promptTemplate || DEFAULT_SETTINGS.promptTemplate;
    template = template.replace('{CONTENT}', cleanContent || sourcePost?.text || '');
    template = template.replace('{PRODUCT_URL}', productUrl || '(ไม่มี)');
    template = template.replace('{PRODUCT_CONTEXT}', [sourceContentContext, outputOnlyContext, bulletContext, productContext, exactLengthContext].filter(Boolean).join('\n'));

    // ถ้าใน template มีบอกเรื่องความยาว 247 แล้ว ให้ข้ามการต่อท้ายบริบทบังคับบางตัวเพื่อไม่ให้มันสับสน
    if (!template.includes('247')) {
        if (!template.includes(sourceContentContext)) template += `\n${sourceContentContext}`;
        if (!template.includes(outputOnlyContext)) template += `\n${outputOnlyContext}`;
        if (!template.includes(bulletContext)) template += `\n${bulletContext}`;
        if (!template.includes(exactLengthContext)) template += `\n${exactLengthContext}`;
        if (productContext && !template.includes(productContext)) template += `\n${productContext}`;
    } else {
        if (productContext && !template.includes(productContext)) {
            // แทรก product context อย่างเดียวแบบเบาๆ
            template = template.replace('สามารถแทรกสินค้าแบบไม่ยัดเยียด', `สามารถแทรกสินค้า (${product}) แบบไม่ยัดเยียด`);
        }
    }

    return template.replace(/\n{3,}/g, '\n\n').trim();
}

function buildFinalPostText(text, productUrl) {
    const cleanProductUrl = String(productUrl || '').trim();
    const trailingParts = [cleanProductUrl].filter(Boolean);
    const bodyBudget = getBodyCharacterBudget(cleanProductUrl);
    const normalizedBody = normalizeDraftStructure(text);
    let finalBody = trimToCharLimit(normalizedBody, bodyBudget);
    let finalText = joinPostSegments(finalBody, trailingParts);

    const missingChars = MAX_POST_LENGTH - getCharCount(finalText);
    if (missingChars > 0 && finalBody) {
        finalBody = `${finalBody}${' '.repeat(missingChars)}`;
        finalText = joinPostSegments(finalBody, trailingParts);
    }

    if (getCharCount(finalText) > MAX_POST_LENGTH) {
        finalBody = trimToCharLimit(finalBody, Math.max(0, bodyBudget - (getCharCount(finalText) - MAX_POST_LENGTH)));
        finalText = joinPostSegments(finalBody, trailingParts);
    }

    return finalText;
}

function getBodyCharacterBudget(productUrl) {
    const trailingParts = [productUrl].map(value => String(value || '').trim()).filter(Boolean);
    const reserved = trailingParts.reduce((total, value) => total + getCharCount(value), 0)
        + Math.max(0, trailingParts.length);
    return Math.max(0, MAX_POST_LENGTH - reserved);
}

function trimToCharLimit(text, limit) {
    if (limit <= 0) return '';

    const normalized = normalizeWhitespace(text);
    if (getCharCount(normalized) <= limit) return normalized;

    const ellipsis = '...';
    const ellipsisLength = getCharCount(ellipsis);
    if (limit <= ellipsisLength) {
        return Array.from(normalized).slice(0, limit).join('').trim();
    }

    const truncated = Array.from(normalized).slice(0, limit - ellipsisLength).join('').trimEnd();
    return `${truncated}${ellipsis}`;
}

function normalizeWhitespace(text) {
    return String(text || '')
        .replace(/\r\n/g, '\n')
        .replace(/\n{3,}/g, '\n\n')
        .trim();
}

function normalizeDraftStructure(text) {
    const normalized = normalizeWhitespace(text);
    if (!normalized) return '';

    const lines = normalized
        .split('\n')
        .map(line => line.trim())
        .filter(Boolean);

    if (!lines.length) return '';

    if (lines.length === 1) {
        return buildStructuredSingleParagraph(lines[0]);
    }

    const firstLine = lines[0];
    const lastLine = lines.length >= 3 ? lines[lines.length - 1] : null;
    const middleLines = lines.slice(1, lastLine ? -1 : undefined)
        .filter(line => !isUrlOnly(line))
        .map(ensureBulletLine);

    const outputLines = [firstLine];

    if (middleLines.length) {
        outputLines.push(...middleLines);
    } else if (lines[1] && !isUrlOnly(lines[1])) {
        outputLines.push(ensureBulletLine(lines[1]));
    }

    if (lastLine && !isUrlOnly(lastLine)) {
        outputLines.push(stripBulletPrefix(lastLine));
    }

    if (!outputLines.some((line, index) => index > 0 && /^-\s+/.test(line))) {
        const fallbackLineIndex = outputLines.findIndex((line, index) => index > 0 && line && !isUrlOnly(line));
        if (fallbackLineIndex >= 0) {
            outputLines[fallbackLineIndex] = ensureBulletLine(outputLines[fallbackLineIndex]);
        }
    }

    return outputLines.join('\n');
}

function buildStructuredSingleParagraph(text) {
    const segments = String(text || '')
        .split(/(?<=[.!?])\s+|\s+-\s+|\n+/)
        .map(segment => segment.trim())
        .filter(Boolean);

    if (segments.length >= 3) {
        return [
            segments[0],
            ...segments.slice(1, -1).map(ensureBulletLine),
            segments[segments.length - 1]
        ].join('\n');
    }

    if (segments.length === 2) {
        return [segments[0], ensureBulletLine(segments[1])].join('\n');
    }

    return [segments[0], ensureBulletLine(segments[0])].join('\n');
}

function ensureBulletLine(line) {
    const cleanLine = stripBulletPrefix(line);
    return cleanLine ? `- ${cleanLine}` : '';
}

function stripBulletPrefix(line) {
    return String(line || '').replace(/^[-•]\s*/, '').trim();
}

function isUrlOnly(line) {
    const value = String(line || '').trim();
    return value ? /^(https?:\/\/\S+|www\.\S+)$/i.test(value) : false;
}

function joinPostSegments(body, trailingParts) {
    const segments = [];
    if (body) segments.push(body);
    segments.push(...trailingParts.filter(Boolean));
    return segments.join('\n');
}

function getCharCount(text) {
    return Array.from(text || '').length;
}

function debugDraftSave(label, payload) {
    try {
        console.groupCollapsed(`[XVR-BG] ${label}`);
        console.log('source url:', payload?.sourceUrl || '');
        console.log('source author:', payload?.sourceAuthor || '');
        console.log('product link:', payload?.productLink || '');
        console.log('raw response:', payload?.rawResponse || '');
        console.log('final text:', payload?.finalText || '');
        console.log('raw length:', getCharCount(payload?.rawResponse || ''));
        console.log('final length:', getCharCount(payload?.finalText || ''));
        console.groupEnd();
    } catch {
        console.log(`[XVR-BG] ${label}`, payload);
    }
}

async function openResultsPage(focusId) {
    const url = chrome.runtime.getURL(`results.html?focus=${encodeURIComponent(focusId)}`);
    await chrome.tabs.create({ url });
}

// =============================================
// 9) Utilities
// =============================================
function generateId() {
    return Date.now().toString(36) + Math.random().toString(36).substring(2, 8);
}

async function broadcastStatus(status, message) {
    try {
        await chrome.runtime.sendMessage({
            type: 'STATUS_UPDATE',
            data: { status, message, timestamp: Date.now() }
        });
    } catch { /* Side panel อาจยังไม่เปิด */ }
}

// Cleanup เมื่อหน้าต่าง grok.com ถูกปิด
chrome.windows.onRemoved.addListener((windowId) => {
    if (windowId === aiWindowId) {
        aiWindowId = null;
        aiTabId = null;
    }
});
