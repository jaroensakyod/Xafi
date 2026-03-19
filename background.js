// =============================================
// X Viral Repurpose - Background Service Worker
// =============================================
// ตัวกลาง (Coordinator) สื่อสารระหว่าง:
//   content_x.js (x.com) <-> background.js <-> content_ai.js (AI provider page)
//   sidepanel.js <-> background.js
// =============================================

// --- ค่าคงที่ ---
const PROMPT_TEMPLATE_VERSION = 6;
const LEGACY_FIXED_CHAR_PROMPT_PATTERN = /247\s*ตัวอักษร/;

const LEGACY_DEFAULT_PROMPT_TEMPLATE = `สรุปเนื้อหาด้านล่างให้เป็นโพสต์ X (ทวิตเตอร์) สไตล์เพื่อนเล่าแบบชิล ๆ ภาษาพูดธรรมชาติ ห้ามทางการ ห้ามสุภาพเกิน

โครงสร้างบังคับเป๊ะ ๆ ดังนี้เท่านั้น:
1. บรรทัดแรก: ประโยคเปิดหัว 1 ประโยค ชวนสงสัย ดึงดูด อยากอ่านต่อ (สั้น ไม่เกิน 10 คำ)
2. เนื้อหาหลัก: ใช้ "-" นำหน้า แต่ละข้อสั้นกระชับมาก 2 ข้อ (บรรทัดละไม่เกิน 1-2 ประโยคสั้น ๆ)
3. บรรทัดสุดท้าย: ประโยคปิดท้าย 1 ประโยค เชื่อมโยงกลับประเด็นหลักของเนื้อหาต้นทาง แบบสรุปชิล ๆ (สั้น ไม่เกิน 10 คำ)

กฎสำคัญที่ต้องทำตามทุกครั้ง:
- ภาษาแบบเพื่อนคุยกันจริง ๆ (ว่ะ เออ 555 อะไรแบบนี้ใส่ได้ถ้าพอดีกับ mood)
- ห้ามใส่ hashtag, @, ลิงก์ใด ๆ ในข้อความที่สร้าง
- ข้อความทั้งหมดที่ AI สร้าง (รวมช่องว่าง การขึ้นบรรทัดใหม่ เครื่องหมายทุกตัว) ต้องยาวพอดีกับจำนวนตัวอักษรที่ระบบกำหนด (ไม่รวมลิงก์ที่ระบบจะต่อท้าย)
- เมื่อรวมกับลิงก์สินค้า {PRODUCT_URL} แล้ว ต้องครบ 280 ตัวอักษรเป๊ะ (รวมทุกอย่างทั้งลิงก์)
- ถ้ามีจังหวะเนียน ๆ สามารถแทรก สินค้า แบบไม่ยัดเยียด แต่ห้ามขายของแรง
- ตอบเฉพาะข้อความโพสต์ที่สร้างเสร็จ ไม่มีคำอธิบาย ไม่มี markdown ไม่มี code block ไม่มีข้อความใด ๆ เพิ่มเติม

เนื้อหาต้นทาง:
{CONTENT}`;

const V4_DEFAULT_PROMPT_TEMPLATE = `หน้าที่ของคุณคือเขียนโพสต์ X ภาษาไทยให้ดูเหมือนคนจริงเขียนเอง จากเนื้อหาต้นทางด้านล่าง

โทนที่ต้องได้:
- ภาษาพูดธรรมชาติ แบบคนเล่าให้เพื่อนฟัง
- ลื่น อ่านง่าย ไม่ดูเป็น AI ไม่ดูเขียนตามสูตรแข็ง ๆ
- เก็บใจความสำคัญจากต้นทางให้ครบ แต่ห้ามเดาข้อมูลเพิ่ม

รูปแบบบังคับ:
บรรทัด 1 = ประโยคเปิดสั้น ๆ ชวนอยากอ่านต่อ
บรรทัด 2 = bullet ข้อแรก ต้องขึ้นต้นด้วย "- "
บรรทัด 3 = bullet ข้อสอง ต้องขึ้นต้นด้วย "- "
บรรทัด 4 = ประโยคปิดสั้น ๆ ที่โยงกลับประเด็นหลัก

กฎที่ต้องทำตามทุกครั้ง:
- ตอบออกมาเป็น 4 บรรทัดที่มีข้อความจริงเท่านั้น ห้ามมีบรรทัดเกินหรือบรรทัดว่าง
- ห้ามมีคำนำประเภท "นี่คือโพสต์" "สรุปให้แล้ว" หรือคำอธิบายใด ๆ
- ห้ามใช้ hashtag, @, ลิงก์, markdown, code block หรือเครื่องหมายอัญประกาศครอบทั้งโพสต์
- เลี่ยงการคัดลอกถ้อยคำจากต้นทางตรง ๆ ถ้าเขียนใหม่ให้เนียนกว่าได้ ให้เขียนใหม่
- แต่ละ bullet ต้องสั้น กระชับ และมีแค่ประเด็นเดียว
- ถ้าข้อมูลต้นทางบาง ให้เขียนเท่าที่รู้จริง ห้ามเติม fact ใหม่

{PRODUCT_CONTEXT}

เนื้อหาต้นทาง:
{CONTENT}`;

const DEFAULT_PROMPT_TEMPLATE = `หน้าที่ของคุณคือเขียนโพสต์ X ภาษาไทยให้เหมือนคนเล่น X จริง ๆ เขียนเอง จากเนื้อหาต้นทางด้านล่าง

โทนที่ต้องได้:
- ภาษาพูดธรรมชาติ ตรง กระชับ มีจังหวะเหมือนคนเล่าให้เพื่อนฟัง
- อ่านแล้วรู้สึกมีมุมคิดหรือมุมเล่า ไม่ใช่แค่สรุปข้อมูลทื่อ ๆ
- ฟีลแบบโพสต์บน X ไทยที่อ่านลื่น แชร์ต่อได้ แต่ไม่เวอร์ ไม่ประดิษฐ์
- เก็บเฉพาะประเด็นที่มีน้ำหนักจากต้นทาง ห้ามเดาข้อมูลเพิ่ม

รูปแบบบังคับ:
บรรทัด 1 = ประโยคเปิดสั้น ๆ ที่มีแรงดึงให้อยากอ่านต่อ
บรรทัด 2 = bullet ข้อแรก ต้องขึ้นต้นด้วย "- "
บรรทัด 3 = bullet ข้อสอง ต้องขึ้นต้นด้วย "- "
บรรทัด 4 = ประโยคปิดสั้น ๆ ที่ทิ้งน้ำหนักหรือโยงกลับประเด็นหลัก

กฎที่ต้องทำตามทุกครั้ง:
- ตอบออกมาเป็น 4 บรรทัดที่มีข้อความจริงเท่านั้น ห้ามมีบรรทัดเกินหรือบรรทัดว่าง
- ห้ามมีคำนำประเภท "นี่คือโพสต์" "สรุปให้แล้ว" หรือคำอธิบายใด ๆ
- ห้ามใช้ hashtag, @, ลิงก์, markdown, code block หรือเครื่องหมายอัญประกาศครอบทั้งโพสต์
- เลี่ยงการคัดลอกถ้อยคำจากต้นทางตรง ๆ ถ้าเรียบเรียงใหม่ให้เนียนกว่าได้ ให้เรียบเรียงใหม่
- แต่ละ bullet ต้องสั้น กระชับ และมีแค่ประเด็นเดียว
- ถ้าข้อมูลต้นทางบาง ให้เขียนเท่าที่รู้จริง ห้ามเติม fact ใหม่
- ถ้าเนื้อหาต้นทางแรงอยู่แล้ว ให้รักษาน้ำหนักนั้นได้ แต่ห้ามดูเหมือน bait เกินจริง
- หลีกเลี่ยงโทนขายของ โทน PR หรือภาษาที่ดูเหมือนแคปชันโฆษณา

{PRODUCT_CONTEXT}

เนื้อหาต้นทาง:
{CONTENT}`;

const HOT_TAKE_PROMPT_TEMPLATE = `หน้าที่ของคุณคือเขียนโพสต์ X ภาษาไทยให้เหมือนคนเล่น X จริง ๆ เขียนเอง จากเนื้อหาต้นทางด้านล่าง

โทนที่ต้องได้:
- ภาษาพูดธรรมชาติ ตรง คม และมีน้ำหนักแบบคนมีมุมมองชัด
- อ่านแล้วต้องรู้สึกว่าโพสต์นี้มีประเด็น ไม่ใช่แค่สรุปข่าวเฉย ๆ
- ฟีลแบบโพสต์ X ไทยที่ชวนคิด ชวนเถียงเบา ๆ หรือชวนแชร์ต่อได้ แต่ห้ามเวอร์ ห้ามเฟก
- เก็บเฉพาะประเด็นที่มีน้ำหนักจากต้นทาง ห้ามเดาข้อมูลเพิ่ม

รูปแบบบังคับ:
บรรทัด 1 = ประโยคเปิดสั้น ๆ ที่แรงพอให้หยุดอ่าน
บรรทัด 2 = bullet ข้อแรก ต้องขึ้นต้นด้วย "- "
บรรทัด 3 = bullet ข้อสอง ต้องขึ้นต้นด้วย "- "
บรรทัด 4 = ประโยคปิดสั้น ๆ ที่ทิ้งน้ำหนักหรือโยนมุมคิดกลับไปที่ประเด็นหลัก

กฎที่ต้องทำตามทุกครั้ง:
- ตอบออกมาเป็น 4 บรรทัดที่มีข้อความจริงเท่านั้น ห้ามมีบรรทัดเกินหรือบรรทัดว่าง
- ห้ามมีคำนำประเภท "นี่คือโพสต์" "สรุปให้แล้ว" หรือคำอธิบายใด ๆ
- ห้ามใช้ hashtag, @, ลิงก์, markdown, code block หรือเครื่องหมายอัญประกาศครอบทั้งโพสต์
- เลี่ยงการคัดลอกถ้อยคำจากต้นทางตรง ๆ ถ้าเรียบเรียงใหม่ให้คมกว่าได้ ให้เรียบเรียงใหม่
- แต่ละ bullet ต้องสั้น กระชับ และมีแค่ประเด็นเดียว
- ถ้าข้อมูลต้นทางบาง ให้เขียนเท่าที่รู้จริง ห้ามเติม fact ใหม่
- เปิดได้แรงขึ้นกว่าปกติ แต่ห้าม clickbait และห้ามใส่อารมณ์เกินข้อมูลต้นทาง
- หลีกเลี่ยงโทนขายของ โทน PR หรือภาษาที่ดูเหมือนแคปชันโฆษณา

{PRODUCT_CONTEXT}

เนื้อหาต้นทาง:
{CONTENT}`;

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
    pauseOnFoundCount: 1,
    aiProvider: 'grok',
    promptMode: 'soft-sell',
    sessionLimit: 15,
    dailyLimit: 60,
    promptTemplate: DEFAULT_PROMPT_TEMPLATE
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

function createInitialAutoQuoteState() {
    return {
        active: false,
        phase: 'idle',
        pendingCount: 0,
        currentDraftId: '',
        nextRunAt: 0,
        lastPostedDraftId: '',
        lastPostedAt: '',
        lastError: '',
        message: '',
        lastUpdated: Date.now()
    };
}

async function getAutoQuoteState() {
    const { autoQuoteState } = await chrome.storage.local.get('autoQuoteState');
    return { ...createInitialAutoQuoteState(), ...(autoQuoteState || {}) };
}

async function updateAutoQuoteState(patch = {}, options = {}) {
    const merge = options.merge !== false;
    const current = merge ? await getAutoQuoteState() : createInitialAutoQuoteState();
    const nextState = {
        ...(merge ? current : createInitialAutoQuoteState()),
        ...patch,
        lastUpdated: Date.now()
    };
    await chrome.storage.local.set({ autoQuoteState: nextState });
    return nextState;
}

function normalizeSettings(settings = {}, options = {}) {
    const merged = { ...DEFAULT_SETTINGS, ...(settings || {}) };
    merged.aiProvider = normalizeAiProvider(merged.aiProvider);
    merged.promptMode = normalizePromptMode(merged.promptMode);
    merged.pauseOnFound = Boolean(merged.pauseOnFound);
    merged.pauseOnFoundCount = Math.max(1, parseInt(merged.pauseOnFoundCount, 10) || 1);
    const currentPrompt = typeof merged.promptTemplate === 'string' ? merged.promptTemplate.trim() : '';
    const hasLegacyFixedCharInstruction = LEGACY_FIXED_CHAR_PROMPT_PATTERN.test(currentPrompt);
    const canSafelyUpgradePrompt = !currentPrompt
        || currentPrompt === LEGACY_DEFAULT_PROMPT_TEMPLATE.trim()
        || currentPrompt === V4_DEFAULT_PROMPT_TEMPLATE.trim()
        || currentPrompt === DEFAULT_PROMPT_TEMPLATE.trim()
        || currentPrompt === HOT_TAKE_PROMPT_TEMPLATE.trim();
    const shouldUpgradePrompt = options.forcePromptUpgrade
        || !currentPrompt
        || hasLegacyFixedCharInstruction
        || (merged.promptTemplateVersion !== PROMPT_TEMPLATE_VERSION && canSafelyUpgradePrompt);

    if (shouldUpgradePrompt) {
        merged.promptTemplate = getPromptTemplateForMode(merged.promptMode);
        merged.promptTemplateVersion = PROMPT_TEMPLATE_VERSION;
    } else if (merged.promptTemplateVersion !== PROMPT_TEMPLATE_VERSION) {
        merged.promptTemplateVersion = PROMPT_TEMPLATE_VERSION;
    }

    return merged;
}

function normalizePromptMode(mode) {
    return mode === 'hot-take' ? 'hot-take' : 'soft-sell';
}

function normalizeAiProvider(provider) {
    return provider === 'gemini' ? 'gemini' : 'grok';
}

function getAiProviderConfig(provider) {
    const normalizedProvider = normalizeAiProvider(provider);
    if (normalizedProvider === 'gemini') {
        return {
            key: 'gemini',
            label: 'Gemini',
            url: 'https://gemini.google.com/app',
            hostPattern: 'gemini.google.com'
        };
    }

    return {
        key: 'grok',
        label: 'Grok',
        url: 'https://grok.com/',
        hostPattern: 'grok.com'
    };
}

function getPromptTemplateForMode(mode) {
    return normalizePromptMode(mode) === 'hot-take'
        ? HOT_TAKE_PROMPT_TEMPLATE
        : DEFAULT_PROMPT_TEMPLATE;
}

function isBuiltInPromptTemplate(template) {
    const normalized = String(template || '').trim();
    return normalized === LEGACY_DEFAULT_PROMPT_TEMPLATE.trim()
        || normalized === V4_DEFAULT_PROMPT_TEMPLATE.trim()
        || normalized === DEFAULT_PROMPT_TEMPLATE.trim()
        || normalized === HOT_TAKE_PROMPT_TEMPLATE.trim();
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

function assertFullAutoSource(payload) {
    const source = typeof payload?.source === 'string' ? payload.source.trim() : '';
    if (source !== 'full-auto') {
        throw new Error('Auto Scout ถูกจำกัดให้สั่งผ่านหน้า Full Auto เท่านั้น');
    }
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
    const { settings, autoScoutEnabled, autoScoutQuery: storedQuery, contextProduct: storedProduct, productLink: storedProductLink, trendsCountry: storedTrendsCountry, results, googleTrends, autoQuoteState } = await chrome.storage.local.get(['settings', 'autoScoutEnabled', 'autoScoutQuery', 'contextProduct', 'productLink', 'trendsCountry', 'results', 'googleTrends', 'autoQuoteState']);
    if (!settings) {
        await chrome.storage.local.set({ settings: DEFAULT_SETTINGS, drafts: [], viralPosts: [], results: [], googleTrends: [], autoScoutEnabled: false, autoScoutQuery: '', contextProduct: '', productLink: '', trendsCountry: 'TH', autoScoutProgress: createInitialProgress(), autoQuoteState: createInitialAutoQuoteState() });
    } else if (typeof autoScoutEnabled === 'undefined' || typeof storedQuery === 'undefined' || typeof storedProduct === 'undefined' || typeof storedProductLink === 'undefined' || typeof storedTrendsCountry === 'undefined' || typeof results === 'undefined' || typeof googleTrends === 'undefined') {
        await chrome.storage.local.set({
            autoScoutEnabled: Boolean(autoScoutEnabled),
            autoScoutQuery: typeof storedQuery === 'string' ? storedQuery : '',
            contextProduct: typeof storedProduct === 'string' ? storedProduct : '',
            productLink: typeof storedProductLink === 'string' ? storedProductLink : '',
            trendsCountry: typeof storedTrendsCountry === 'string' && storedTrendsCountry ? storedTrendsCountry : 'TH',
            results: Array.isArray(results) ? results : [],
            googleTrends: Array.isArray(googleTrends) ? googleTrends : [],
            autoScoutProgress: createInitialProgress(),
            autoQuoteState: autoQuoteState ? { ...createInitialAutoQuoteState(), ...autoQuoteState } : createInitialAutoQuoteState()
        });
    } else if (!autoQuoteState) {
        await chrome.storage.local.set({ autoQuoteState: createInitialAutoQuoteState() });
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
            assertFullAutoSource(message.data);
            return await sendAutoScoutCommand('AUTO_SCOUT_STEP');

        case 'AUTO_SCOUT_RESUME':
            assertFullAutoSource(message.data);
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

        case 'GET_AUTO_QUOTE_STATE':
            return { success: true, data: await getAutoQuoteState() };

        case 'SET_AUTO_SCOUT_STATE':
            assertFullAutoSource(message.data);
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
            assertFullAutoSource(message.data);
            contextProduct = typeof message.data?.value === 'string' ? message.data.value.trim() : contextProduct;
            autoScoutProgress = { ...autoScoutProgress, product: contextProduct, lastUpdated: Date.now() };
            await chrome.storage.local.set({ contextProduct, autoScoutProgress });
            return { success: true };

        case 'SET_PRODUCT_LINK':
            assertFullAutoSource(message.data);
            productLink = typeof message.data?.value === 'string' ? message.data.value.trim() : productLink;
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

        // --- Campaign ---
        case 'GET_CAMPAIGN':
            return { success: true, data: await getCampaign() };

        case 'SAVE_CAMPAIGN':
            return await handleSaveCampaign(message.data || {});

        case 'START_CAMPAIGN':
            return await startCampaign();

        case 'PAUSE_CAMPAIGN':
            return await pauseCampaign();

        case 'RESUME_CAMPAIGN':
            return await resumeCampaign();

        case 'STOP_CAMPAIGN':
            return await stopCampaign();

        case 'RESET_CAMPAIGN':
            return await resetCampaign();

        case 'DELETE_CAMPAIGN':
            return await deleteCampaign();

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
    const counters = await incrementDiscoveryCounters();
    await broadcastStatus('found', `พบโพสต์ Viral ใหม่: ${post.viewCountText}`);

    // Campaign auto-queue
    const campaignForAutoQueue = await getCampaign();
    if (campaignForAutoQueue?.status === 'running' && campaignForAutoQueue.phase === 'generating') {
        const activeTopic = campaignForAutoQueue.topics[campaignForAutoQueue.activeTopicIndex];
        if (activeTopic && activeTopic.generatedCount < activeTopic.targetPostCount && activeTopic.status !== 'error') {
            await queueAIProcess({ ...post, campaignId: campaignForAutoQueue.id, topicId: activeTopic.id });
        }
    }

    return {
        success: true,
        id: post.id,
        foundThisSession: counters?.foundThisSession || 0,
        dailyCount: counters?.dailyCount || 0
    };
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
// 5) AI Processing - เปิดหน้าต่าง AI provider แบบครึ่งจอ
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
        triggerDeferredAutoQuoteStart(500);
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
    const aiProvider = getAiProviderConfig(settings.aiProvider);
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
        },
        aiProvider: aiProvider.key
    };

    await broadcastStatus('processing', `กำลังเปิด ${aiProvider.label}...`);

    // เช็คว่ามีหน้าต่าง AI provider ที่ตรงกับที่เลือกไว้เปิดอยู่หรือไม่
    if (aiWindowId) {
        try {
            await chrome.windows.get(aiWindowId);
            aiTabId = await resolveAiTabId(aiProvider.key);

            if (Number.isInteger(aiTabId)) {
                await dispatchPromptToAi(settings);
                return { success: true };
            }

            await closeAiWindowIfIdle(true);
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
            url: aiProvider.url,
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
        await broadcastStatus('error', `เปิด ${aiProvider.label} ไม่สำเร็จ: ${err.message}`);
        return { success: false, error: err.message };
    }
}

async function dispatchPromptToAi(settings, retries = 8, delayMs = 800) {
    if (!pendingPrompt?.prompt) {
        throw new Error('ไม่มี prompt ที่รอส่งไปยัง Grok');
    }

    if (!Number.isInteger(aiTabId)) {
        aiTabId = await resolveAiTabId(settings?.aiProvider || pendingPrompt?.aiProvider);
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
            aiTabId = await resolveAiTabId(settings?.aiProvider || pendingPrompt?.aiProvider);
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

async function resolveAiTabId(provider = null) {
    if (!aiWindowId) return null;

    const aiProvider = getAiProviderConfig(provider || pendingPrompt?.aiProvider || DEFAULT_SETTINGS.aiProvider);

    try {
        const tabs = await chrome.tabs.query({ windowId: aiWindowId });
        const providerTab = tabs.find(tab => String(tab.url || '').includes(aiProvider.hostPattern));
        return Number.isInteger(providerTab?.id) ? providerTab.id : null;
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
        createdAt: new Date().toISOString(),
        campaignId: pendingPrompt?.sourcePost?.campaignId || '',
        topicId: pendingPrompt?.sourcePost?.topicId || ''
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
        createdAt: draft.createdAt,
        campaignId: draft.campaignId || '',
        topicId: draft.topicId || ''
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

    // Campaign draft tracking
    if (draft.campaignId) {
        await onCampaignDraftCreated(draft).catch(console.error);
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

async function updateDraftStatuses(transform) {
    const { drafts = [], results = [] } = await chrome.storage.local.get(['drafts', 'results']);
    let changed = false;

    const nextDrafts = drafts.map((draft) => {
        const nextDraft = transform({ ...draft });
        if (!nextDraft) {
            return draft;
        }

        if (JSON.stringify(nextDraft) !== JSON.stringify(draft)) {
            changed = true;
        }

        return nextDraft;
    });

    if (!changed) {
        return { success: true, changed: false, drafts };
    }

    const resultById = new Map(results.map((item) => [item.id, item]));
    const nextResults = results.map((item) => {
        const matchingDraft = nextDrafts.find((draft) => draft.id === item.id);
        if (!matchingDraft) return item;
        return {
            ...item,
            status: matchingDraft.status,
            postedAt: matchingDraft.postedAt || item.postedAt || '',
            postError: matchingDraft.postError || ''
        };
    });

    await chrome.storage.local.set({ drafts: nextDrafts, results: nextResults });
    return { success: true, changed: true, drafts: nextDrafts };
}

async function syncAutoQuoteDraftStatuses(active) {
    return updateDraftStatuses((draft) => {
        if (!draft.sourceUrl) return draft;

        if (active && draft.status === 'ready') {
            return {
                ...draft,
                status: 'auto_quote_queued',
                postError: ''
            };
        }

        if (!active && draft.status === 'auto_quote_queued') {
            return {
                ...draft,
                status: 'ready'
            };
        }

        return draft;
    });
}

async function recoverAutoQuoteDraftStatuses() {
    return updateDraftStatuses((draft) => {
        if (!draft.sourceUrl) return draft;

        if (['pending_post', 'posting', 'auto_quote_posting', 'post_error'].includes(draft.status)) {
            return {
                ...draft,
                status: 'auto_quote_queued',
                postError: ''
            };
        }

        return draft;
    });
}

async function countPendingAutoQuoteDrafts() {
    const { drafts = [] } = await chrome.storage.local.get('drafts');
    return drafts.filter((draft) => ['ready', 'auto_quote_queued', 'posting', 'auto_quote_posting'].includes(draft.status) && draft.sourceUrl).length;
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
    const isAutoQuoteRun = Boolean(data.autoQuoteRun);
    const nextStatus = isAutoQuoteRun ? 'auto_quote_posting' : 'posting';

    await updateDraft({
        id: data.id,
        status: nextStatus,
        postError: '',
        postStartedAt: new Date().toISOString()
    });

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

    // ส่งข้อความไปให้ content_x.js พิมพ์ในช่อง Compose แล้วกดโพสต์ทันที
    await sleep(4500);

    try {
        const response = await sendMessageToTab(targetTabId, {
            type: 'TYPE_ON_X',
            data: { text: postText, draftId: data.id, sourceUrl, autoSubmit: true }
        });

        if (!response?.success) {
            throw new Error(response?.error || 'ส่งโพสต์ไปที่ X ไม่สำเร็จ');
        }

        await updateDraft({
            id: data.id,
            status: 'posted',
            postError: '',
            postedAt: new Date().toISOString()
        });

        return { success: true };
    } catch (error) {
        await updateDraft({
            id: data.id,
            status: 'post_error',
            postError: error.message || 'ส่งโพสต์ไม่สำเร็จ'
        });
        throw error;
    }
}

// =============================================
// AUTO QUOTE SYSTEM
// =============================================
const AUTO_QUOTE_NEXT_ALARM = 'autoQuote.next';
const AUTO_QUOTE_RETRY_ALARM = 'autoQuote.retry';

let autoQuoteCycleInFlight = false;
let autoQuoteStartRequested = false;

async function clearAutoQuoteAlarm(name) {
    try {
        await chrome.alarms.clear(name);
    } catch {
        // ignore
    }
}

async function clearAllAutoQuoteAlarms() {
    await Promise.allSettled([
        clearAutoQuoteAlarm(AUTO_QUOTE_NEXT_ALARM),
        clearAutoQuoteAlarm(AUTO_QUOTE_RETRY_ALARM)
    ]);
}

async function scheduleChromeAlarm(name, delayMs) {
    const safeDelayMs = Math.max(1000, Math.round(delayMs));
    await clearAutoQuoteAlarm(name);
    await chrome.alarms.create(name, { when: Date.now() + safeDelayMs });
    return Date.now() + safeDelayMs;
}

async function scheduleAutoQuoteRetry(delayMs = 5000, reason = 'รอ AI provider ว่างก่อนเริ่ม Auto Quote') {
    const nextRunAt = await scheduleChromeAlarm(AUTO_QUOTE_RETRY_ALARM, delayMs);
    await updateAutoQuoteState({
        active: true,
        phase: 'waiting-ai',
        nextRunAt,
        message: reason,
        lastError: ''
    });
}

async function scheduleNextAutoQuoteRun(delayMs, patch = {}) {
    const nextRunAt = await scheduleChromeAlarm(AUTO_QUOTE_NEXT_ALARM, delayMs);
    await updateAutoQuoteState({
        active: true,
        phase: 'waiting-next',
        nextRunAt,
        ...patch
    });
    return nextRunAt;
}

function triggerDeferredAutoQuoteStart(delayMs = 500) {
    if (!autoQuoteStartRequested || autoQuoteCycleInFlight) return;
    scheduleAutoQuoteRetry(delayMs).catch(console.error);
}

async function finishAutoQuote(statePatch, status, message) {
    autoQuoteCycleInFlight = false;
    autoQuoteStartRequested = false;
    await clearAllAutoQuoteAlarms();
    await updateAutoQuoteState({
        active: false,
        phase: status === 'error' ? 'idle' : 'done',
        pendingCount: 0,
        currentDraftId: '',
        nextRunAt: 0,
        ...statePatch
    });
    await broadcastStatus(status, message);

    // Campaign quote completion
    if (status === 'done') {
        const campaignAfterQuote = await getCampaign();
        if (campaignAfterQuote?.status === 'running' && campaignAfterQuote.phase === 'quoting') {
            campaignAfterQuote.status = 'completed';
            campaignAfterQuote.phase = 'completed';
            campaignAfterQuote.completedAt = new Date().toISOString();
            await saveCampaign(campaignAfterQuote);
        }
    }
}

async function runAutoQuoteCycle(trigger = 'manual') {
    if (autoQuoteCycleInFlight) {
        return { success: true, skipped: true };
    }

    autoQuoteCycleInFlight = true;

    try {
        const currentState = await getAutoQuoteState();
        const settings = await ensureSettings();
        const aiProvider = getAiProviderConfig(settings.aiProvider);
        if (!currentState.active && !autoQuoteStartRequested) {
            autoQuoteCycleInFlight = false;
            return { success: false, error: 'Auto Quote is not active' };
        }

        if (isAiBusy()) {
            await broadcastStatus('processing', `${aiProvider.label} ยังทำงานอยู่ Auto Quote จะเริ่มให้อัตโนมัติเมื่อคิวว่าง`);
            await scheduleAutoQuoteRetry(5000, `รอ ${aiProvider.label} ว่างก่อนเริ่ม Auto Quote`);
            autoQuoteCycleInFlight = false;
            return { success: true, deferred: true };
        }

        await clearAllAutoQuoteAlarms();
        await closeAiWindowIfIdle(true);
        await recoverAutoQuoteDraftStatuses();
        await syncAutoQuoteDraftStatuses(true);

        const pendingCount = await countPendingAutoQuoteDrafts();
        if (pendingCount === 0) {
            await finishAutoQuote({
                lastError: 'ไม่มี draft ที่พร้อมสำหรับ Auto Quote',
                message: 'ไม่มี draft ที่พร้อมสำหรับ Auto Quote'
            }, 'error', 'ไม่มี draft ที่พร้อมสำหรับ Auto Quote');
            return { success: false, error: 'ไม่มี draft ที่พร้อมสำหรับ Auto Quote' };
        }

        const { drafts = [] } = await chrome.storage.local.get('drafts');
        const readyDraft = drafts.find(draft => ['auto_quote_queued', 'ready'].includes(draft.status) && draft.sourceUrl);

        if (!readyDraft) {
            await finishAutoQuote({
                lastError: '',
                message: 'Auto Quote ไม่มี draft ที่รอโพสต์แล้ว'
            }, 'done', 'Auto Quote ไม่มี draft ที่รอโพสต์แล้ว');
            return { success: true, done: true };
        }

        await updateDraft({ id: readyDraft.id, status: 'auto_quote_posting', postError: '' });
        await updateAutoQuoteState({
            active: true,
            phase: 'posting',
            pendingCount,
            currentDraftId: readyDraft.id,
            nextRunAt: 0,
            lastError: '',
            message: `กำลังโพสต์ draft ${readyDraft.id}`
        });
        await broadcastStatus('processing', `Auto Quote กำลังโพสต์ draft ${readyDraft.id}`);
        await postToX({ id: readyDraft.id, autoQuoteRun: true });

        const defaultMin = parseInt(settings?.autoQuoteMinMinutes || 2, 10);
        const defaultMax = parseInt(settings?.autoQuoteMaxMinutes || 5, 10);
        const remainingCount = await countPendingAutoQuoteDrafts();
        const postedAt = new Date().toISOString();

        if (remainingCount === 0) {
            await finishAutoQuote({
                lastPostedDraftId: readyDraft.id,
                lastPostedAt: postedAt,
                lastError: '',
                message: 'Auto Quote โพสต์ครบทุก draft แล้ว'
            }, 'done', 'Auto Quote โพสต์ครบทุก draft แล้ว');
            return { success: true, done: true };
        }

        const delayMs = Math.floor(Math.random() * (defaultMax - defaultMin + 1) + defaultMin) * 60 * 1000;
        const nextRunAt = await scheduleNextAutoQuoteRun(delayMs, {
            pendingCount: remainingCount,
            currentDraftId: '',
            lastPostedDraftId: readyDraft.id,
            lastPostedAt: postedAt,
            lastError: '',
            message: `โพสต์แล้ว 1 รายการ เหลือ ${remainingCount} รายการ`
        });

        autoQuoteCycleInFlight = false;
        await broadcastStatus('processing', `โพสต์แล้ว 1 รายการ เหลือ ${remainingCount} รายการ รอ ${Math.round((nextRunAt - Date.now()) / 60000)} นาที`);
        return { success: true, scheduled: true, nextRunAt };
    } catch (err) {
        console.error('[XVR] Auto Quote Cycle Error:', err);
        const nextRunAt = await scheduleChromeAlarm(AUTO_QUOTE_RETRY_ALARM, 30000);
        await updateAutoQuoteState({
            active: true,
            phase: 'retrying',
            nextRunAt,
            lastError: err.message || 'Auto Quote ทำงานไม่สำเร็จ',
            message: 'Auto Quote มีปัญหา กำลังลองใหม่อัตโนมัติ'
        });
        autoQuoteCycleInFlight = false;
        await broadcastStatus('error', err.message || 'Auto Quote ทำงานไม่สำเร็จ');
        return { success: false, error: err.message || 'Auto Quote ทำงานไม่สำเร็จ' };
    }
}

async function restoreAutoQuoteScheduling() {
    const state = await getAutoQuoteState();
    if (!state.active) return;

    autoQuoteStartRequested = true;

    if (isAiBusy()) {
        await scheduleAutoQuoteRetry(Math.max(1000, (state.nextRunAt || 0) - Date.now() || 5000));
        return;
    }

    if (['waiting-next', 'retrying', 'waiting-ai'].includes(state.phase) && state.nextRunAt) {
        const remainingMs = state.nextRunAt - Date.now();
        if (remainingMs <= 1500) {
            await runAutoQuoteCycle('restore');
            return;
        }

        const alarmName = state.phase === 'waiting-next' ? AUTO_QUOTE_NEXT_ALARM : AUTO_QUOTE_RETRY_ALARM;
        await scheduleChromeAlarm(alarmName, remainingMs);
        return;
    }

    await runAutoQuoteCycle('restore');
}

async function startAutoQuoteLoop() {
    const currentState = await getAutoQuoteState();
    if (currentState.active || autoQuoteStartRequested || autoQuoteCycleInFlight) {
        return { success: true, alreadyRunning: true };
    }

    autoQuoteStartRequested = true;
    await updateAutoQuoteState({
        active: true,
        phase: 'starting',
        pendingCount: await countPendingAutoQuoteDrafts(),
        currentDraftId: '',
        nextRunAt: 0,
        lastError: '',
        message: 'กำลังเตรียม Auto Quote'
    });

    return runAutoQuoteCycle('manual');
}

async function stopAutoQuoteLoop() {
    autoQuoteCycleInFlight = false;
    autoQuoteStartRequested = false;
    await clearAllAutoQuoteAlarms();
    await syncAutoQuoteDraftStatuses(false);
    await updateAutoQuoteState({
        active: false,
        phase: 'idle',
        pendingCount: 0,
        currentDraftId: '',
        nextRunAt: 0,
        lastError: '',
        message: 'หยุด Auto Quote แล้ว'
    });
    await broadcastStatus('done', 'หยุด Auto Quote แล้ว');
    return { success: true };
}

// =============================================
// CAMPAIGN SYSTEM (Full Automate)
// =============================================
const CAMPAIGN_ALARM = 'campaign.tick';

function createCampaignDefaults() {
    return {
        id: '', name: '', status: 'draft',
        topicExecutionMode: 'round-robin',
        quoteDistributionMode: 'sequential-by-product',
        topics: [], activeTopicIndex: 0, phase: 'setup',
        createdAt: '', updatedAt: '', startedAt: '', completedAt: '', lastError: ''
    };
}

function createTopicDefaults() {
    return {
        id: '', topic: '', productName: '', productLink: '',
        targetPostCount: 3, generatedCount: 0, quotedCount: 0,
        status: 'pending', lastProcessedAt: '', lastSourceUrl: '', errorMessage: ''
    };
}

async function getCampaign() {
    const { campaign } = await chrome.storage.local.get('campaign');
    return campaign || null;
}

async function saveCampaign(data) {
    const campaign = { ...data, updatedAt: new Date().toISOString() };
    await chrome.storage.local.set({ campaign });
    return campaign;
}

async function handleSaveCampaign(data) {
    const existing = await getCampaign();
    if (existing?.status === 'running') {
        return { success: false, error: 'ไม่สามารถแก้ไขขณะ campaign กำลังทำงาน' };
    }
    const topics = (data.topics || []).map(t => {
        const prev = existing?.topics?.find(e => e.id === t.id) || {};
        return {
            ...createTopicDefaults(), ...prev,
            id: t.id || prev.id || generateId(),
            topic: String(t.topic || '').trim(),
            productName: String(t.productName || '').trim(),
            productLink: String(t.productLink || '').trim(),
            targetPostCount: Math.max(1, parseInt(t.targetPostCount) || 3)
        };
    });
    const campaign = {
        ...(existing || createCampaignDefaults()),
        id: existing?.id || generateId(),
        name: data.name || existing?.name || 'Campaign ' + new Date().toLocaleDateString('th-TH'),
        topicExecutionMode: data.topicExecutionMode === 'drain-topic' ? 'drain-topic' : 'round-robin',
        quoteDistributionMode: data.quoteDistributionMode === 'alternate-products' ? 'alternate-products' : 'sequential-by-product',
        topics, createdAt: existing?.createdAt || new Date().toISOString()
    };
    campaign.status = 'draft';
    await saveCampaign(campaign);
    return { success: true, data: campaign };
}

async function startCampaign() {
    const campaign = await getCampaign();
    if (!campaign) return { success: false, error: 'ยังไม่มี campaign' };
    if (!campaign.topics.length) return { success: false, error: 'ต้องมีอย่างน้อย 1 หัวข้อ' };
    if (campaign.status === 'running') return { success: true, data: campaign };
    for (const topic of campaign.topics) {
        if (!topic.topic.trim()) return { success: false, error: 'หัวข้อห้ามว่าง' };
    }
    if (isAiBusy()) return { success: false, error: 'AI กำลังทำงานอยู่ กรุณารอให้เสร็จก่อน' };
    campaign.status = 'running';
    campaign.phase = 'generating';
    campaign.startedAt = campaign.startedAt || new Date().toISOString();
    campaign.activeTopicIndex = 0;
    campaign.lastError = '';
    campaign.completedAt = '';
    campaign.topics = campaign.topics.map(t => ({
        ...t, status: t.generatedCount >= t.targetPostCount ? 'completed' : 'pending', errorMessage: ''
    }));
    await saveCampaign(campaign);
    await broadcastStatus('processing', 'เริ่ม Full Automate Campaign');
    await runCampaignTick();
    return { success: true, data: campaign };
}

async function pauseCampaign() {
    const campaign = await getCampaign();
    if (!campaign || campaign.status !== 'running') return { success: false, error: 'Campaign ไม่ได้กำลังทำงาน' };
    campaign.status = 'paused';
    campaign.topics = campaign.topics.map(t => ({ ...t, status: t.status === 'running' ? 'pending' : t.status }));
    await saveCampaign(campaign);
    await stopAutoScoutForCampaign();
    await clearAutoQuoteAlarm(CAMPAIGN_ALARM);
    await broadcastStatus('done', 'พัก Campaign แล้ว');
    return { success: true, data: campaign };
}

async function resumeCampaign() {
    const campaign = await getCampaign();
    if (!campaign || campaign.status !== 'paused') return { success: false, error: 'Campaign ไม่ได้อยู่ในสถานะพัก' };
    campaign.status = 'running';
    campaign.lastError = '';
    await saveCampaign(campaign);
    await broadcastStatus('processing', 'ทำ Campaign ต่อ');
    await runCampaignTick();
    return { success: true, data: campaign };
}

async function stopCampaign() {
    const campaign = await getCampaign();
    if (!campaign) return { success: false, error: 'ไม่มี campaign' };
    await stopAutoScoutForCampaign();
    await stopAutoQuoteLoop();
    await clearAutoQuoteAlarm(CAMPAIGN_ALARM);
    campaign.status = 'completed';
    campaign.completedAt = new Date().toISOString();
    campaign.topics = campaign.topics.map(t => ({
        ...t, status: t.status === 'running' ? (t.generatedCount >= t.targetPostCount ? 'completed' : 'pending') : t.status
    }));
    await saveCampaign(campaign);
    await broadcastStatus('done', 'หยุด Campaign แล้ว');
    return { success: true, data: campaign };
}

async function resetCampaign() {
    const campaign = await getCampaign();
    if (!campaign) return { success: false, error: 'ไม่มี campaign' };
    if (campaign.status === 'running') await stopCampaign();
    campaign.status = 'draft';
    campaign.phase = 'setup';
    campaign.activeTopicIndex = 0;
    campaign.startedAt = '';
    campaign.completedAt = '';
    campaign.lastError = '';
    campaign.topics = campaign.topics.map(t => ({
        ...t, generatedCount: 0, quotedCount: 0, status: 'pending',
        lastProcessedAt: '', lastSourceUrl: '', errorMessage: ''
    }));
    await saveCampaign(campaign);
    return { success: true, data: campaign };
}

async function deleteCampaign() {
    const campaign = await getCampaign();
    if (campaign?.status === 'running') await stopCampaign();
    await chrome.storage.local.remove('campaign');
    return { success: true };
}

async function stopAutoScoutForCampaign() {
    isAutoScoutEnabled = false;
    await chrome.storage.local.set({ autoScoutEnabled: false });
    const tabs = await chrome.tabs.query({ url: ['https://x.com/*', 'https://twitter.com/*'] });
    await Promise.allSettled(tabs.map(tab =>
        chrome.tabs.sendMessage(tab.id, { type: 'AUTO_SCOUT_TOGGLE', data: { enabled: false } })
    ));
}

function getNextTopicIndex(campaign) {
    const { topics, activeTopicIndex, topicExecutionMode } = campaign;
    if (!topics.length) return -1;
    if (topicExecutionMode === 'drain-topic') {
        const current = topics[activeTopicIndex];
        if (current && current.generatedCount < current.targetPostCount && current.status !== 'error') return activeTopicIndex;
        for (let i = 1; i <= topics.length; i++) {
            const idx = (activeTopicIndex + i) % topics.length;
            if (topics[idx].generatedCount < topics[idx].targetPostCount && topics[idx].status !== 'error') return idx;
        }
        return -1;
    }
    for (let i = 0; i < topics.length; i++) {
        const idx = (activeTopicIndex + i) % topics.length;
        if (topics[idx].generatedCount < topics[idx].targetPostCount && topics[idx].status !== 'error') return idx;
    }
    return -1;
}

async function runCampaignTick() {
    const campaign = await getCampaign();
    if (!campaign || campaign.status !== 'running') return;
    if (campaign.phase === 'generating') await runCampaignGeneratePhase(campaign);
    else if (campaign.phase === 'quoting') await runCampaignQuotePhase(campaign);
}

async function runCampaignGeneratePhase(campaign) {
    const allDone = campaign.topics.every(t => t.generatedCount >= t.targetPostCount || t.status === 'error');
    if (allDone) {
        const hasGenerated = campaign.topics.some(t => t.generatedCount > 0);
        if (!hasGenerated) {
            campaign.status = 'completed'; campaign.phase = 'completed'; campaign.completedAt = new Date().toISOString();
            await saveCampaign(campaign);
            await broadcastStatus('done', 'Campaign เสร็จ - ไม่มี draft ที่สร้างได้');
            return;
        }
        campaign.phase = 'quoting';
        await saveCampaign(campaign);
        await broadcastStatus('processing', 'สร้าง draft ครบ เริ่ม Quote');
        await runCampaignQuotePhase(campaign);
        return;
    }
    if (isAiBusy()) { await scheduleChromeAlarm(CAMPAIGN_ALARM, 8000); return; }
    const nextIdx = getNextTopicIndex(campaign);
    if (nextIdx < 0) {
        campaign.phase = 'quoting'; await saveCampaign(campaign); await runCampaignQuotePhase(campaign); return;
    }
    await activateTopicScout(campaign, nextIdx);
}

async function activateTopicScout(campaign, topicIndex) {
    const topic = campaign.topics[topicIndex];
    campaign.activeTopicIndex = topicIndex;
    campaign.topics[topicIndex].status = 'running';
    await saveCampaign(campaign);
    autoScoutQuery = topic.topic;
    contextProduct = topic.productName;
    productLink = topic.productLink;
    isAutoScoutEnabled = true;
    const settings = await ensureSettings();
    autoScoutProgress = {
        ...createInitialProgress(), active: true, query: autoScoutQuery,
        product: contextProduct, productLink,
        manualAssist: false, scrollPreset: settings.scrollPreset || 'medium', lastUpdated: Date.now()
    };
    await chrome.storage.local.set({ autoScoutEnabled: true, autoScoutQuery, contextProduct, productLink, autoScoutProgress });
    let tabs = await chrome.tabs.query({ url: ['https://x.com/*', 'https://twitter.com/*'] });
    if (tabs.length === 0) {
        await chrome.tabs.create({ url: 'https://x.com/explore/tabs/trending' });
        await sleep(2000);
        tabs = await chrome.tabs.query({ url: ['https://x.com/*', 'https://twitter.com/*'] });
    } else {
        const currentWindow = await chrome.windows.getCurrent();
        const preferredTab = tabs.find(tab => tab.active && tab.windowId === currentWindow.id) || tabs[0];
        await chrome.tabs.update(preferredTab.id, { url: 'https://x.com/explore/tabs/trending', active: true });
    }
    await Promise.allSettled(
        tabs.map(tab => chrome.tabs.sendMessage(tab.id, {
            type: 'AUTO_SCOUT_TOGGLE',
            data: { enabled: true, query: autoScoutQuery, product: contextProduct, productLink }
        }))
    );
    await broadcastStatus('processing', `Campaign: หาโพสต์สำหรับ "${topic.topic}" (${topic.generatedCount}/${topic.targetPostCount})`);
    await scheduleChromeAlarm(CAMPAIGN_ALARM, 30000);
}

async function onCampaignDraftCreated(draft) {
    if (!draft.campaignId) return;
    const campaign = await getCampaign();
    if (!campaign || campaign.id !== draft.campaignId || campaign.status !== 'running') return;
    const topicIdx = campaign.topics.findIndex(t => t.id === draft.topicId);
    if (topicIdx < 0) return;
    campaign.topics[topicIdx].generatedCount++;
    campaign.topics[topicIdx].lastProcessedAt = new Date().toISOString();
    campaign.topics[topicIdx].lastSourceUrl = draft.sourceUrl || '';
    if (campaign.topics[topicIdx].generatedCount >= campaign.topics[topicIdx].targetPostCount) {
        campaign.topics[topicIdx].status = 'completed';
    }
    if (campaign.topicExecutionMode === 'round-robin') {
        campaign.activeTopicIndex = (campaign.activeTopicIndex + 1) % campaign.topics.length;
    }
    await saveCampaign(campaign);
    await scheduleChromeAlarm(CAMPAIGN_ALARM, 3000);
}

async function runCampaignQuotePhase(campaign) {
    await stopAutoScoutForCampaign();
    const { drafts = [] } = await chrome.storage.local.get('drafts');
    const campaignDrafts = drafts.filter(d =>
        d.campaignId === campaign.id && d.sourceUrl && ['ready', 'auto_quote_queued'].includes(d.status)
    );
    if (!campaignDrafts.length) {
        campaign.status = 'completed'; campaign.phase = 'completed'; campaign.completedAt = new Date().toISOString();
        await saveCampaign(campaign);
        await broadcastStatus('done', 'Campaign เสร็จสิ้น');
        return;
    }
    const orderedDrafts = campaign.quoteDistributionMode === 'alternate-products'
        ? interleaveDraftsByTopic(campaignDrafts, campaign.topics)
        : sequenceDraftsByTopic(campaignDrafts, campaign.topics);
    for (const d of orderedDrafts) {
        await updateDraft({ id: d.id, status: 'auto_quote_queued', postError: '' });
    }
    autoQuoteStartRequested = true;
    await updateAutoQuoteState({ active: true, phase: 'starting', pendingCount: orderedDrafts.length, message: 'Campaign Quote เริ่มต้น' });
    await runAutoQuoteCycle('campaign');
}

function sequenceDraftsByTopic(drafts, topics) {
    const ordered = [];
    for (const topic of topics) ordered.push(...drafts.filter(d => d.topicId === topic.id));
    const matchedIds = new Set(ordered.map(d => d.id));
    ordered.push(...drafts.filter(d => !matchedIds.has(d.id)));
    return ordered;
}

function interleaveDraftsByTopic(drafts, topics) {
    const byTopic = new Map();
    for (const topic of topics) {
        const td = drafts.filter(d => d.topicId === topic.id);
        if (td.length) byTopic.set(topic.id, td);
    }
    const allTopicIds = new Set(topics.map(t => t.id));
    const unmatched = drafts.filter(d => !allTopicIds.has(d.topicId));
    if (unmatched.length) byTopic.set('__unmatched__', unmatched);
    const result = []; let round = 0; let hasMore = true;
    while (hasMore) {
        hasMore = false;
        for (const [, td] of byTopic) {
            if (round < td.length) { result.push(td[round]); hasMore = true; }
        }
        round++;
    }
    return result;
}

async function restoreCampaignOnStartup() {
    const campaign = await getCampaign();
    if (!campaign || campaign.status !== 'running') return;
    await scheduleChromeAlarm(CAMPAIGN_ALARM, 5000);
}

// =============================================
// 8) Settings
// =============================================
async function getSettings() {
    const settings = await ensureSettings();
    return { success: true, data: settings };
}

async function saveSettings(newSettings) {
    const previousSettings = await ensureSettings();
    const nextPromptMode = normalizePromptMode(newSettings?.promptMode);
    const nextPromptTemplate = typeof newSettings?.promptTemplate === 'string'
        ? newSettings.promptTemplate
        : previousSettings.promptTemplate;
    const promptChangedManually = nextPromptTemplate.trim() !== String(previousSettings.promptTemplate || '').trim();
    const shouldSwapPresetTemplate = !promptChangedManually
        && isBuiltInPromptTemplate(previousSettings.promptTemplate)
        && normalizePromptMode(previousSettings.promptMode) !== nextPromptMode;

    const settings = normalizeSettings({
        ...newSettings,
        promptMode: nextPromptMode,
        promptTemplate: shouldSwapPresetTemplate ? getPromptTemplateForMode(nextPromptMode) : nextPromptTemplate,
        promptTemplateVersion: PROMPT_TEMPLATE_VERSION
    });
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

    try {
        const dailyTrends = await fetchGoogleDailyTrends(normalizedGeo).catch(() => []);
        const rssBundle = dailyTrends.length < 20
            ? await fetchGoogleRssTrendBundle(normalizedGeo).catch(() => ({ primary: [], related: [] }))
            : { primary: [], related: [] };
        const trends = mergeTrendItems(
            [dailyTrends, rssBundle.primary, rssBundle.related],
            normalizedGeo,
            20
        );

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

async function fetchGoogleDailyTrends(geo = 'TH') {
    const locale = getTrendLocale(geo);
    const url = `https://trends.google.com/trends/api/dailytrends?hl=${encodeURIComponent(locale.hl)}&tz=${encodeURIComponent(locale.tz)}&geo=${encodeURIComponent(geo)}&ns=15`;
    const response = await fetch(url);

    if (!response.ok) {
        throw new Error(`Google Daily Trends request failed with status ${response.status}`);
    }

    const rawText = await response.text();
    const jsonText = rawText.replace(/^\)\]\}',?\s*/, '');
    const payload = JSON.parse(jsonText);
    const searches = payload?.default?.trendingSearchesDays?.[0]?.trendingSearches;

    if (!Array.isArray(searches)) {
        return [];
    }

    return searches.map((item, index) => ({
        id: `${geo}-daily-${index}-${Date.now()}`,
        query: String(item?.title?.query || '').trim(),
        traffic: String(item?.formattedTraffic || '').trim(),
        publishedAt: String(item?.articles?.[0]?.timeAgo || '').trim()
    })).filter(item => item.query);
}

async function fetchGoogleRssTrends(geo = 'TH') {
    const url = `https://trends.google.com/trending/rss?geo=${encodeURIComponent(geo)}`;
    const response = await fetch(url);

    if (!response.ok) {
        throw new Error(`Google Trends RSS request failed with status ${response.status}`);
    }

    const xml = await response.text();
    return extractTrendQueries(xml, geo);
}

async function fetchGoogleRssTrendBundle(geo = 'TH') {
    const url = `https://trends.google.com/trending/rss?geo=${encodeURIComponent(geo)}`;
    const response = await fetch(url);

    if (!response.ok) {
        throw new Error(`Google Trends RSS request failed with status ${response.status}`);
    }

    const xml = await response.text();
    return {
        primary: extractTrendQueries(xml, geo),
        related: extractRelatedTrendQueries(xml, geo)
    };
}

function getTrendLocale(geo = 'TH') {
    switch (String(geo || '').toUpperCase()) {
        case 'JP':
            return { hl: 'ja', tz: '-540' };
        case 'US':
            return { hl: 'en-US', tz: '300' };
        case 'TH':
        default:
            return { hl: 'th', tz: '-420' };
    }
}

function mergeTrendItems(groups, geo = 'TH', limit = 20) {
    const merged = [];
    const seen = new Set();

    for (const group of groups) {
        for (const item of Array.isArray(group) ? group : []) {
            const query = String(item?.query || '').trim();
            if (!query) continue;
            const key = query.toLowerCase();
            if (seen.has(key)) continue;
            seen.add(key);
            merged.push({
                id: item.id || `${geo}-${merged.length}-${Date.now()}`,
                query,
                traffic: String(item?.traffic || '').trim(),
                publishedAt: String(item?.publishedAt || '').trim()
            });
            if (merged.length >= limit) {
                return merged;
            }
        }
    }

    return merged;
}

function extractTrendQueries(xml, geo = 'TH') {
    const itemRegex = /<item>([\s\S]*?)<\/item>/gi;
    const results = [];
    let match;

    while ((match = itemRegex.exec(String(xml || ''))) && results.length < 20) {
        const itemXml = match[1];
        const query = normalizeTrendQuery(decodeXmlEntities(extractTag(itemXml, 'title')));
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

function extractRelatedTrendQueries(xml, geo = 'TH') {
    const itemRegex = /<item>([\s\S]*?)<\/item>/gi;
    const titleRegex = /<ht:news_item_title>([\s\S]*?)<\/ht:news_item_title>/gi;
    const results = [];
    const seen = new Set();
    let itemMatch;

    while ((itemMatch = itemRegex.exec(String(xml || ''))) && results.length < 40) {
        const itemXml = itemMatch[1];
        const traffic = decodeXmlEntities(extractTag(itemXml, 'ht:approx_traffic')).trim();
        const publishedAt = decodeXmlEntities(extractTag(itemXml, 'pubDate')).trim();
        let titleMatch;

        while ((titleMatch = titleRegex.exec(itemXml)) && results.length < 40) {
            const query = normalizeTrendQuery(decodeXmlEntities(titleMatch[1]));
            const key = query.toLowerCase();
            if (!query || seen.has(key)) {
                continue;
            }

            seen.add(key);
            results.push({
                id: `${geo}-related-${results.length}-${Date.now()}`,
                query,
                traffic,
                publishedAt
            });
        }
    }

    return results;
}

function normalizeTrendQuery(value) {
    return String(value || '')
        .replace(/^['"#\s]+|['"\s]+$/g, '')
        .replace(/\s+/g, ' ')
        .trim();
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
    return {
        foundThisSession: autoScoutProgress.foundThisSession || 0,
        dailyCount: nextDailyStats.foundCount || 0
    };
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
    const promptMode = normalizePromptMode(settings?.promptMode);
    const cleanContent = sanitizeSourceText(sourcePost?.text || '');
    const productUrl = productLink || sourcePost?.productLink || '';
    const charBudget = getBodyCharacterBudget(productUrl);
    const sourceContentContext = '- ใช้เนื้อหาจากทั้งโพสต์ได้ รวมถึงข้อความหลัง hashtag แต่ไม่ต้องคัดลอก hashtag หรือลิงก์จากต้นทางมาใช้ตรงๆ';
    const outputOnlyContext = '- ตอบกลับเฉพาะข้อความโพสต์สุดท้ายเพียงอย่างเดียว ห้ามมีคำอธิบาย ห้ามมี markdown ห้ามมี code block และห้ามมีข้อความสถานะ เช่น Executed code';
    const bulletContext = '- ต้องออกมาเป็น 4 บรรทัดเท่านั้น โดยบรรทัด 2 และ 3 ต้องขึ้นต้นด้วย -';
    const modeContext = promptMode === 'hot-take'
        ? '- โทนรวมต้องคมขึ้น มีน้ำหนักแบบคนมีมุมชัด แต่ยังดูเป็นธรรมชาติและไม่ใส่อารมณ์เกินข้อมูลจริง'
        : '- โทนรวมต้องเนียน อ่านลื่น และถ้ามีการขายต้องฟีลเหมือนพูดแทรก ไม่ใช่โหมดปิดการขาย';
    const productContext = product
        ? `- ถ้ามีจังหวะที่เหมาะ ค่อยเชื่อมโยงกับสินค้า/บริการนี้เพียง 1 จุดแบบเนียนๆ เหมือนพูดแทรกจากประสบการณ์ตรง ห้าม hard sell ห้ามภาษาโฆษณา: ${product}`
        : '';
    const exactLengthContext = [
        '- ระบบจะต่อท้ายข้อความด้วยลิงก์สินค้าอัตโนมัติ และจะใช้โพสต์ต้นทางทำ Quote แยกต่างหาก',
        `- ข้อความที่ AI สร้างได้เองต้องยาว ${charBudget} ตัวอักษรพอดี`,
        `- เมื่อนำข้อความนี้ไปรวมกับลิงก์สินค้า ${productUrl || '(ไม่มี)'} รวมทั้งทุกตัวอักษร ช่องว่าง เครื่องหมาย ?, -, การขึ้นบรรทัดใหม่ และลิงก์ทั้งหมด ความยาวรวมต้องเท่ากับ ${MAX_POST_LENGTH} ตัวอักษรพอดี`
    ].join('\n');
    const dynamicContext = [sourceContentContext, outputOnlyContext, bulletContext, modeContext, productContext, exactLengthContext]
        .filter(Boolean)
        .join('\n');

    let template = settings?.promptTemplate || DEFAULT_SETTINGS.promptTemplate;
    template = template.replace('{CONTENT}', cleanContent || sourcePost?.text || '');
    template = template.replace('{PRODUCT_URL}', productUrl || '(ไม่มี)');
    template = template.replace('{PRODUCT_CONTEXT}', dynamicContext);

    if (!template.includes(sourceContentContext)) template += `\n${sourceContentContext}`;
    if (!template.includes(outputOnlyContext)) template += `\n${outputOnlyContext}`;
    if (!template.includes(bulletContext)) template += `\n${bulletContext}`;
    if (!template.includes(modeContext)) template += `\n${modeContext}`;
    if (!template.includes(exactLengthContext)) template += `\n${exactLengthContext}`;
    if (productContext && !template.includes(productContext)) template += `\n${productContext}`;

    return template.replace(/\n{3,}/g, '\n\n').trim();
}

function buildFinalPostText(text, productUrl) {
    const cleanProductUrl = String(productUrl || '').trim();
    const trailingParts = [cleanProductUrl].filter(Boolean);
    const bodyBudget = getBodyCharacterBudget(cleanProductUrl);
    const normalizedBody = enforceFourLinePostStructure(normalizeDraftStructure(text));
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

    return enforceFourLinePostStructure(outputLines.join('\n'));
}

function buildStructuredSingleParagraph(text) {
    const segments = String(text || '')
        .split(/(?<=[.!?])\s+|\s+-\s+|\n+/)
        .map(segment => segment.trim())
        .filter(Boolean);

    if (segments.length >= 3) {
        return enforceFourLinePostStructure([
            segments[0],
            ...segments.slice(1, -1).map(ensureBulletLine),
            segments[segments.length - 1]
        ].join('\n'));
    }

    if (segments.length === 2) {
        return enforceFourLinePostStructure([segments[0], ensureBulletLine(segments[1])].join('\n'));
    }

    return enforceFourLinePostStructure([segments[0], ensureBulletLine(segments[0])].join('\n'));
}

function enforceFourLinePostStructure(text) {
    const normalized = normalizeWhitespace(text);
    if (!normalized) return '';

    const lines = normalized
        .split('\n')
        .map(line => line.trim())
        .filter(line => line && !isUrlOnly(line));

    if (!lines.length) return '';

    const segments = extractContentSegments(normalized);
    const opener = stripBulletPrefix(lines[0]) || segments[0] || '';
    const closerCandidates = [
        ...lines.slice(1).map(stripBulletPrefix),
        ...segments.slice(1)
    ].filter(Boolean);

    const bulletPool = [
        ...lines.slice(1).map(stripBulletPrefix),
        ...segments.slice(1)
    ].filter(Boolean);

    const uniqueBulletPool = Array.from(new Set(bulletPool.filter(item => item !== opener)));
    const bulletOne = uniqueBulletPool[0] || opener;
    const bulletTwo = uniqueBulletPool[1] || uniqueBulletPool[0] || opener;

    let closer = closerCandidates[closerCandidates.length - 1] || bulletTwo || opener;
    if (closer === bulletTwo && uniqueBulletPool[2]) {
        closer = uniqueBulletPool[2];
    }
    if (closer === opener && uniqueBulletPool[1]) {
        closer = uniqueBulletPool[1];
    }

    return [
        opener,
        ensureBulletLine(bulletOne),
        ensureBulletLine(bulletTwo),
        stripBulletPrefix(closer)
    ].join('\n');
}

function extractContentSegments(text) {
    return String(text || '')
        .split(/\n+|(?<=[.!?])\s+|\s+[•-]\s+/)
        .map(segment => stripBulletPrefix(segment))
        .map(segment => segment.trim())
        .filter(Boolean)
        .filter(segment => !isUrlOnly(segment));
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

chrome.alarms.onAlarm.addListener((alarm) => {
    if (alarm?.name === CAMPAIGN_ALARM) {
        runCampaignTick().catch(console.error);
        return;
    }

    if (![AUTO_QUOTE_NEXT_ALARM, AUTO_QUOTE_RETRY_ALARM].includes(alarm?.name)) {
        return;
    }

    runAutoQuoteCycle(`alarm:${alarm.name}`).catch((error) => {
        console.error('[XVR] Auto Quote alarm error:', error);
    });
});

chrome.runtime.onStartup?.addListener(() => {
    restoreCampaignOnStartup().catch(console.error);
    restoreAutoQuoteScheduling().catch((error) => {
        console.error('[XVR] Auto Quote startup restore failed:', error);
    });
});

restoreAutoQuoteScheduling().catch((error) => {
    console.error('[XVR] Auto Quote initial restore failed:', error);
});

restoreCampaignOnStartup().catch(console.error);
