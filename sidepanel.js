// =============================================
// X Viral Repurpose - Side Panel Dashboard
// =============================================
// UI หลักสำหรับจัดการ Drafts, ดูโพสต์ Viral, และตั้งค่า
// =============================================

(function () {
    'use strict';

    // --- DOM References ---
    const $ = (sel) => document.querySelector(sel);
    const $$ = (sel) => document.querySelectorAll(sel);

    const statusBar = $('#statusBar');
    const statusText = $('#statusText');
    const draftList = $('#draftList');
    const foundList = $('#foundList');
    const queueList = $('#queueList');
    const draftCount = $('#draftCount');
    const resultCount = $('#resultCount');
    const foundCount = $('#foundCount');
    const queueCount = $('#queueCount');
    const btnAutoScout = $('#btnAutoScout');
    const autoScoutQueryInput = $('#autoScoutQuery');
    const contextProductInput = $('#contextProduct');
    const productLinkInput = $('#productLink');
    const openAffiliateProductOfferBtn = $('#openAffiliateProductOffer');
    const btnScoutStep = $('#btnScoutStep');
    const btnScoutResume = $('#btnScoutResume');
    const forceStopAiBtn = $('#forceStopAiBtn');
    const forceStopAiFromStatusBtn = $('#forceStopAiFromStatus');
    const openResultsPageLink = $('#openResultsPage');
    const openLatestResultBtn = $('#openLatestResult');
    const refreshTrendsBtn = $('#refreshTrends');
    const trendsCountrySelect = $('#trendsCountry');
    const toggleTrendsPanelBtn = $('#toggleTrendsPanel');
    const trendListWrap = $('#trendListWrap');
    const trendList = $('#trendList');
    const promptModeSelect = $('#promptMode');
    const promptTemplateInput = $('#promptTemplate');
    const promptTemplateStatus = $('#promptTemplateStatus');
    const applyPromptPresetBtn = $('#applyPromptPreset');
    const resultsPreviewList = $('#resultsPreviewList');
    const clearResultsBtn = $('#clearResultsBtn');
    const aiProviderStatus = $('#aiProviderStatus');
    const progressQuery = $('#progressQuery');
    const progressAiProvider = $('#progressAiProvider');
    const progressProduct = $('#progressProduct');
    const progressPreset = $('#progressPreset');
    const progressSteps = $('#progressSteps');
    const progressFound = $('#progressFound');
    const progressPauseReason = $('#progressPauseReason');
    const AFFILIATE_PRODUCT_OFFER_URL = 'https://affiliate.shopee.co.th/offer/product_offer';
    const FULL_AUTO_SOURCE = 'full-auto';

    // =============================================
    // Auto Scout State
    // =============================================
    let isAutoScout = false;
    let autoScoutQuery = '';
    let contextProduct = '';
    let productLink = '';
    let aiProvider = 'grok';
    let trendsCountry = 'TH';
    let autoScoutProgress = null;
    let isTrendsCollapsed = false;
    let selectedViralIds = new Set();
    let savedPromptTemplate = '';
    let savedPromptTemplateSource = 'built-in';

    sendMessage({ type: 'GET_AUTO_SCOUT_STATE' }).then(res => {
        if (res?.success) {
            isAutoScout = Boolean(res.data?.enabled);
            autoScoutQuery = res.data?.query || '';
            contextProduct = res.data?.product || '';
            productLink = res.data?.productLink || '';
            trendsCountry = res.data?.trendsCountry || 'TH';
            autoScoutProgress = res.data?.progress || null;
            if (autoScoutQueryInput) autoScoutQueryInput.value = normalizeHashtagQuery(autoScoutQuery);
            if (contextProductInput) contextProductInput.value = contextProduct;
            if (productLinkInput) productLinkInput.value = productLink;
            if (trendsCountrySelect) trendsCountrySelect.value = trendsCountry;
            updateAutoScoutBtn();
            renderProgress(autoScoutProgress);
        }
    });

    if (btnAutoScout) {
        btnAutoScout.addEventListener('click', async () => {
            const nextEnabled = !isAutoScout;
            const query = normalizeHashtagQuery(autoScoutQueryInput?.value || '');
            const product = contextProductInput?.value.trim() || '';
            const link = productLinkInput?.value.trim() || '';

            if (autoScoutQueryInput) autoScoutQueryInput.value = query;

            if (nextEnabled && !query) {
                alert('กรอกคำค้นก่อนเปิด Auto Scout');
                autoScoutQueryInput?.focus();
                return;
            }

            isAutoScout = nextEnabled;
            autoScoutQuery = query;
            contextProduct = product;
            productLink = link;
            updateAutoScoutBtn();

            const res = await sendMessage({
                type: 'SET_AUTO_SCOUT_STATE',
                data: { source: FULL_AUTO_SOURCE, enabled: isAutoScout, query: autoScoutQuery, product: contextProduct, productLink }
            });

            if (!res?.success) {
                isAutoScout = !isAutoScout;
                updateAutoScoutBtn();
            }
        });
    }

    function updateAutoScoutBtn() {
        if (!btnAutoScout) return;
        if (isAutoScout) {
            btnAutoScout.textContent = '🤖 Auto Scout: ON';
            btnAutoScout.style.background = '#22c55e';
        } else {
            btnAutoScout.textContent = '🤖 Auto Scout: OFF';
            btnAutoScout.style.background = '#4b5563';
        }
    }

    function updateAutomationControlState(campaign) {
        const isCampaignOwnedRun = campaign?.status === 'running' || campaign?.status === 'paused';
        if (btnScoutStep) btnScoutStep.disabled = !isCampaignOwnedRun && !isAutoScout;
        if (btnScoutResume) btnScoutResume.disabled = !isCampaignOwnedRun && !isAutoScout;
    }

    function updateAiProviderUi(provider = 'grok') {
        aiProvider = provider === 'gemini' ? 'gemini' : 'grok';
        const label = aiProvider === 'gemini' ? 'Gemini' : 'Grok';

        if (aiProviderStatus) {
            aiProviderStatus.textContent = `AI: ${label}`;
            aiProviderStatus.style.background = aiProvider === 'gemini' ? '#1d4ed8' : '#0f766e';
        }


    function getPromptModeLabel(mode) {
        return mode === 'hot-take' ? 'Hot Take' : 'Soft Sell';
    }

    function refreshPromptTemplateStatus() {
        if (!promptTemplateStatus || !promptTemplateInput || !promptModeSelect) return;

        const promptMode = promptModeSelect.value || 'soft-sell';
        const currentTemplate = String(promptTemplateInput.value || '').trim();
        const isDirty = currentTemplate !== String(savedPromptTemplate || '').trim();
        const sourceLabel = isDirty
            ? 'Custom (ยังไม่บันทึก)'
            : (savedPromptTemplateSource === 'built-in'
                ? `Preset ${getPromptModeLabel(promptMode)}`
                : 'Custom');

        promptTemplateStatus.textContent = `${sourceLabel} • runtime จะคุม 4 บรรทัด, ไม่มี hashtag/link ใน body, และต้องอยู่ในเพดาน 280 ตัวอักษรรวมลิงก์`;
    }
        if (progressAiProvider) {
            progressAiProvider.textContent = label;
        }
    }

    const btnAutoQuote = $('#btnAutoQuote');
    const autoQuoteStatus = $('#autoQuoteStatus');
    const autoQuoteSummary = $('#autoQuoteSummary');
    let isAutoQuote = false;
    let autoQuoteState = null;

    sendMessage({ type: 'GET_AUTO_QUOTE_STATE' }).then((res) => {
        if (!res?.success) return;
        autoQuoteState = res.data || null;
        isAutoQuote = Boolean(autoQuoteState?.active);
        updateAutoQuoteUi();
        renderAutoQuoteState();
    });

    setInterval(() => {
        if (autoQuoteState?.active) {
            renderAutoQuoteState();
        }
    }, 1000);

    function updateAutoQuoteUi() {
        if (!btnAutoQuote || !autoQuoteStatus || !autoQuoteSummary) return;

        if (isAutoQuote) {
            btnAutoQuote.textContent = '⏹️ หยุด Auto Quote';
            btnAutoQuote.style.background = '#ef4444';
            autoQuoteStatus.classList.remove('hidden');
            return;
        }

        btnAutoQuote.textContent = '🚀 เริ่ม Auto Quote';
        btnAutoQuote.style.background = '#10b981';
        autoQuoteStatus.classList.add('hidden');
        if (!autoQuoteState?.postedCount && !autoQuoteState?.failedCount && !autoQuoteState?.lastFailedReason) {
            autoQuoteSummary.classList.add('hidden');
        }
    }

    function renderAutoQuoteState() {
        if (!autoQuoteStatus || !autoQuoteSummary) return;

        const state = autoQuoteState || {};
        const providerLabel = aiProvider === 'gemini' ? 'Gemini' : 'Grok';
        const postedCount = Number(state.postedCount || 0);
        const failedCount = Number(state.failedCount || 0);
        const skippedCount = Number(state.skippedCount || 0);
        const summaryParts = [
            `สำเร็จ ${postedCount}`,
            `ไม่สำเร็จ ${failedCount}`,
            `ข้าม ${skippedCount}`
        ];
        if (state.lastFailedDraftId || state.lastFailedReason) {
            const reasonText = state.lastFailedReason || 'ไม่ทราบสาเหตุ';
            summaryParts.push(`ล่าสุด ${state.lastFailedDraftId || '-'}: ${reasonText}`);
        }
        autoQuoteSummary.textContent = summaryParts.join(' • ');
        if (state.active || postedCount || failedCount || state.lastFailedReason) {
            autoQuoteSummary.classList.remove('hidden');
        } else {
            autoQuoteSummary.classList.add('hidden');
        }

        if (!state.active) {
            autoQuoteStatus.textContent = state.message || '⏳ ระบบ Auto Quote ทำงานอยู่ - กำลังลุย Draft ตามคิว';
            return;
        }

        const pendingCount = Number(state.pendingCount || 0);
        const countdown = formatCountdown(state.nextRunAt);

        switch (state.phase) {
            case 'waiting-ai':
                autoQuoteStatus.textContent = countdown
                    ? `⏳ รอ ${providerLabel} ว่างก่อนเริ่ม Auto Quote • เริ่มใน ${countdown}`
                    : `⏳ รอ ${providerLabel} ว่างก่อนเริ่ม Auto Quote`;
                break;
            case 'posting':
                autoQuoteStatus.textContent = `🚀 กำลังโพสต์ draft ${state.currentDraftId || ''}${pendingCount ? ` • คงเหลือ ${pendingCount} รายการ` : ''}`.trim();
                break;
            case 'waiting-next':
                autoQuoteStatus.textContent = countdown
                    ? `⏳ โพสต์ถัดไปใน ${countdown}${pendingCount ? ` • เหลือ ${pendingCount} รายการ` : ''}`
                    : `⏳ รอโพสต์ถัดไป${pendingCount ? ` • เหลือ ${pendingCount} รายการ` : ''}`;
                break;
            case 'retrying':
                autoQuoteStatus.textContent = countdown
                    ? `⚠️ Auto Quote มีปัญหา กำลังลองใหม่ใน ${countdown}`
                    : '⚠️ Auto Quote มีปัญหา กำลังลองใหม่อัตโนมัติ';
                break;
            default:
                autoQuoteStatus.textContent = state.message || '⏳ ระบบ Auto Quote ทำงานอยู่';
                break;
        }
    }

    function formatCountdown(nextRunAt) {
        const target = Number(nextRunAt || 0);
        if (!target || target <= Date.now()) return '';
        const totalSeconds = Math.max(0, Math.ceil((target - Date.now()) / 1000));
        const minutes = Math.floor(totalSeconds / 60);
        const seconds = totalSeconds % 60;

        if (minutes <= 0) {
            return `${seconds} วินาที`;
        }

        return `${minutes} นาที ${seconds} วินาที`;
    }

    if (btnAutoQuote) {
        btnAutoQuote.addEventListener('click', async () => {
            isAutoQuote = !isAutoQuote;
            if (isAutoQuote) {
                const res = await sendMessage({ type: 'START_AUTO_QUOTE' });
                if (!res?.success) {
                    isAutoQuote = false;
                    alert(res?.error || 'ยังเริ่ม Auto Quote ไม่ได้');
                    updateAutoQuoteUi();
                    return;
                }

                autoQuoteState = { ...(autoQuoteState || {}), active: true };
                updateAutoQuoteUi();
                renderAutoQuoteState();
            } else {
                await sendMessage({ type: 'STOP_AUTO_QUOTE' });
                updateAutoQuoteUi();
                renderAutoQuoteState();
            }
        });
    }

    btnScoutStep?.addEventListener('click', async () => {
        await sendMessage({ type: 'AUTO_SCOUT_STEP', data: { source: FULL_AUTO_SOURCE } });
    });

    btnScoutResume?.addEventListener('click', async () => {
        await sendMessage({ type: 'AUTO_SCOUT_RESUME', data: { source: FULL_AUTO_SOURCE } });
    });

    async function handleForceStopAi() {
        const confirmed = confirm('ต้องการบังคับหยุดงาน AI ที่ค้างอยู่ตอนนี้ใช่ไหม');
        if (!confirmed) return;

        const res = await sendMessage({ type: 'FORCE_STOP_AI' });
        if (!res?.success) {
            alert(res?.error || 'บังคับหยุด AI ไม่สำเร็จ');
            return;
        }

        statusText.textContent = 'บังคับหยุด AI แล้ว';
        statusBar.classList.add('hidden');
        loadProcessQueue();
        loadDrafts();
        loadCampaign();
    }

    forceStopAiBtn?.addEventListener('click', handleForceStopAi);
    forceStopAiFromStatusBtn?.addEventListener('click', handleForceStopAi);

    openResultsPageLink?.addEventListener('click', (event) => {
        event.preventDefault();
        window.open(chrome.runtime.getURL('results.html'), '_blank');
    });

    openLatestResultBtn?.addEventListener('click', async () => {
        const response = await sendMessage({ type: 'GET_LATEST_RESULT' });
        const latest = response?.data;
        const url = latest
            ? chrome.runtime.getURL(`results.html?focus=${encodeURIComponent(latest.id)}`)
            : chrome.runtime.getURL('results.html');
        window.open(url, '_blank');
    });

    contextProductInput?.addEventListener('change', async () => {
        contextProduct = contextProductInput.value.trim();
        await sendMessage({ type: 'SET_CONTEXT_PRODUCT', data: { source: FULL_AUTO_SOURCE, value: contextProduct } });
    });

    autoScoutQueryInput?.addEventListener('input', () => {
        const normalized = normalizeHashtagQuery(autoScoutQueryInput.value);
        if (autoScoutQueryInput.value !== normalized) {
            autoScoutQueryInput.value = normalized;
        }
        autoScoutQuery = normalized;
    });

    productLinkInput?.addEventListener('change', async () => {
        productLink = productLinkInput.value.trim();
        await sendMessage({ type: 'SET_PRODUCT_LINK', data: { source: FULL_AUTO_SOURCE, value: productLink } });
    });

    openAffiliateProductOfferBtn?.addEventListener('click', () => {
        window.open(AFFILIATE_PRODUCT_OFFER_URL, '_blank');
    });

    toggleTrendsPanelBtn?.addEventListener('click', () => {
        setTrendsCollapsed(!isTrendsCollapsed);
    });

    // =============================================
    // 1) Tab Navigation
    // =============================================
    $$('.tab').forEach(tab => {
        tab.addEventListener('click', () => {
            const tabId = tab.getAttribute('data-tab');
            switchToTab(tabId);
        });
    });

    function switchToTab(tabId) {
        if (!tabId) return;
        $$('.tab').forEach(t => t.classList.remove('active'));
        $$('.tab-content').forEach(c => c.classList.remove('active'));
        $(`[data-tab="${tabId}"]`)?.classList.add('active');
        $(`#tab-${tabId}`)?.classList.add('active');
    }

    // =============================================
    // 2) Load Data on Open
    // =============================================
    loadDrafts();
    loadResults();
    loadViralPosts();
    loadProcessQueue();
    loadGoogleTrends();
    loadSettings();
    loadCampaign();

    async function loadDrafts() {
        const res = await sendMessage({ type: 'GET_DRAFTS' });
        if (res?.success) renderDrafts(res.data);
    }

    async function loadViralPosts() {
        const res = await sendMessage({ type: 'GET_VIRAL_POSTS' });
        if (res?.success) renderViralPosts(res.data);
    }

    async function loadResults() {
        const res = await sendMessage({ type: 'GET_RESULTS' });
        if (res?.success) renderResultsPreview(res.data);
    }

    async function loadProcessQueue() {
        const res = await sendMessage({ type: 'GET_PROCESS_QUEUE' });
        if (res?.success) renderProcessQueue(res.data || []);
    }

    async function loadGoogleTrends() {
        const res = await sendMessage({ type: 'GET_GOOGLE_TRENDS', data: { geo: trendsCountry } });
        if (res?.success) renderGoogleTrends(res.data);
    }

    async function loadSettings() {
        const res = await sendMessage({ type: 'GET_SETTINGS' });
        if (res?.success && res.data) {
            aiProvider = res.data.aiProvider || 'grok';
            $('#aiProvider').value = aiProvider;
            updateAiProviderUi(aiProvider);
            $('#minViews').value = res.data.minViews || 500000;
            $('#typingSpeedMin').value = res.data.typingSpeedMin || 30;
            $('#typingSpeedMax').value = res.data.typingSpeedMax || 150;
            $('#pauseEveryChars').value = res.data.pauseEveryChars || 40;
            $('#pauseMin').value = res.data.pauseMin || 300;
            $('#pauseMax').value = res.data.pauseMax || 800;
            $('#promptMode').value = res.data.promptMode || 'soft-sell';
            $('#scrollPreset').value = res.data.scrollPreset || 'medium';
            $('#manualAssist').checked = Boolean(res.data.manualAssist);
            $('#pauseOnFound').checked = Boolean(res.data.pauseOnFound);
            $('#pauseOnFoundCount').value = res.data.pauseOnFoundCount || 1;
            $('#checkpointEverySteps').value = res.data.checkpointEverySteps || 6;
            $('#sessionLimit').value = res.data.sessionLimit || 15;
            $('#dailyLimit').value = res.data.dailyLimit || 60;
            $('#autoQuoteMinMinutes').value = res.data.autoQuoteMinMinutes || 2;
            $('#autoQuoteMaxMinutes').value = res.data.autoQuoteMaxMinutes || 5;
            $('#promptTemplate').value = res.data.promptTemplate || '';
            savedPromptTemplate = res.data.promptTemplate || '';
            savedPromptTemplateSource = res.data.promptTemplateSource || 'custom';
            refreshPromptTemplateStatus();
        }
    }

    // =============================================
    // 3) Render Drafts
    // =============================================
    function renderDrafts(drafts) {
        draftCount.textContent = drafts.length;

        if (drafts.length === 0) {
            draftList.innerHTML = `
        <div class="empty-state">
          <p>📭 ยังไม่มี Draft</p>
          <p class="hint">กดปุ่ม "🔥 AI Create Post" บนโพสต์ Viral เพื่อเริ่มสร้าง</p>
        </div>`;
            return;
        }

        draftList.innerHTML = drafts.map(draft => `
      <div class="card draft-card" data-id="${escapeAttr(draft.id)}">
        <div class="card-meta">
                                        ${renderDraftStatusBadge(draft)}
                    <div class="card-meta-right">
                                                ${renderDraftReadinessBadge(draft)}
                        <span class="char-count">${getCharCount(draft.finalText || draft.generatedText)} ตัว</span>
                        <span class="card-time">${formatTime(draft.createdAt)}</span>
                    </div>
        </div>

        ${draft.sourceUrl ? `<div class="card-source">📌 จาก: <a href="${escapeAttr(draft.sourceUrl)}" target="_blank">${escapeHtml(draft.sourceAuthor || 'โพสต์ต้นทาง')}</a></div>` : ''}

        <div class="card-content draft-text" contenteditable="false">${escapeHtml(draft.finalText || draft.generatedText)}</div>
            ${draft.validationError ? `<div class="card-source" style="color:#fcd34d;">เช็กก่อนโพสต์: ${escapeHtml(draft.validationError)}</div>` : ''}
                ${draft.postError ? `<div class="card-source" style="color:#fca5a5;">เหตุผล: ${escapeHtml(draft.postError)}</div>` : ''}

        <div class="card-actions">
          <button class="btn-action btn-post" data-action="post" data-id="${escapeAttr(draft.id)}" title="ส่งไปโพสต์บน X">
            🚀 Post to X
          </button>
          <button class="btn-action btn-copy" data-action="copy" data-id="${escapeAttr(draft.id)}" title="คัดลอกข้อความ">
            📋 Copy
          </button>
          <button class="btn-action btn-edit" data-action="edit" data-id="${escapeAttr(draft.id)}" title="แก้ไข">
            ✏️ Edit
          </button>
          <button class="btn-action btn-delete" data-action="delete" data-id="${escapeAttr(draft.id)}" title="ลบ">
            🗑️
          </button>
        </div>
      </div>
    `).join('');

        // Attach event listeners
        draftList.querySelectorAll('[data-action]').forEach(btn => {
            btn.addEventListener('click', handleDraftAction);
        });
    }

    // =============================================
    // 4) Draft Actions
    // =============================================
    async function handleDraftAction(e) {
        const action = e.currentTarget.getAttribute('data-action');
        const id = e.currentTarget.getAttribute('data-id');
        const card = e.currentTarget.closest('.card');

        switch (action) {
            case 'post': {
                e.currentTarget.disabled = true;
                e.currentTarget.textContent = '⏳ กำลังส่ง...';
                const response = await sendMessage({ type: 'POST_TO_X', data: { id } });
                if (response?.success) {
                    e.currentTarget.textContent = '✅ ส่งแล้ว!';
                    e.currentTarget.classList.add('btn-success');
                } else {
                    e.currentTarget.disabled = false;
                    e.currentTarget.textContent = '❌ ลองใหม่';
                }
                break;
            }

            case 'copy': {
                const textEl = card.querySelector('.draft-text');
                const text = textEl.textContent.trim();
                await navigator.clipboard.writeText(text);
                e.currentTarget.textContent = '✅ Copied!';
                setTimeout(() => { e.currentTarget.textContent = '📋 Copy'; }, 2000);
                break;
            }

            case 'edit': {
                const textEl = card.querySelector('.draft-text');
                const isEditing = textEl.getAttribute('contenteditable') === 'true';

                if (isEditing) {
                    // บันทึก
                    textEl.setAttribute('contenteditable', 'false');
                    textEl.classList.remove('editing');
                    textEl.oninput = null;
                    e.currentTarget.textContent = '✏️ Edit';
                    const nextText = textEl.textContent.trim();
                    updateCardCharCount(card, nextText);
                    await sendMessage({
                        type: 'UPDATE_DRAFT',
                        data: { id, generatedText: nextText, finalText: nextText }
                    });
                } else {
                    // เปิดแก้ไข
                    textEl.setAttribute('contenteditable', 'true');
                    textEl.classList.add('editing');
                    textEl.focus();
                    e.currentTarget.textContent = '💾 Save';
                    textEl.oninput = onDraftTextInput;
                }
                break;
            }

            case 'delete': {
                if (confirm('ลบ Draft นี้?')) {
                    await sendMessage({ type: 'DELETE_DRAFT', data: { id } });
                    card.style.opacity = '0';
                    card.style.transform = 'translateX(100%)';
                    setTimeout(() => {
                        card.remove();
                        // อัปเดต count
                        const remaining = draftList.querySelectorAll('.card').length;
                        draftCount.textContent = remaining;
                        if (remaining === 0) {
                            draftList.innerHTML = `
                <div class="empty-state">
                  <p>📭 ยังไม่มี Draft</p>
                  <p class="hint">กดปุ่ม "🔥 AI Create Post" บนโพสต์ Viral เพื่อเริ่มสร้าง</p>
                </div>`;
                        }
                    }, 300);
                }
                break;
            }
        }
    }

    // =============================================
    // 5) Render Viral Posts
    // =============================================
    function renderViralPosts(posts) {
        foundCount.textContent = posts.length;

        if (posts.length === 0) {
            foundList.innerHTML = `
        <div class="empty-state">
          <p>🔍 ยังไม่พบโพสต์ Viral</p>
          <p class="hint">เปิดหน้า Trending ของ X แล้ว Extension จะสแกนให้อัตโนมัติ</p>
        </div>`;
            return;
        }

        foundList.innerHTML = posts.map(post => `
      <div class="card found-card">
        <div class="card-meta" style="display:flex; justify-content:space-between; width:100%;">
          <div>
                        <input type="checkbox" class="viral-checkbox" data-post-id="${escapeAttr(post.id)}" ${selectedViralIds.has(post.id) ? 'checked' : ''} style="cursor:pointer;" />
            <span class="card-badge badge-viral">🔥 ${escapeHtml(post.viewCountText)} views</span>
                        ${post.topic ? `<span class="card-badge">${escapeHtml(post.topic)}</span>` : ''}
          </div>
          <span class="card-time">${formatTime(post.capturedAt)}</span>
        </div>
        <div class="card-author" style="margin-top: 4px;">@${escapeHtml(post.author)}</div>
        <div class="card-content">${escapeHtml(truncate(post.text, 200))}</div>
        <div class="card-actions">
          <button class="btn-action btn-process" data-post='${escapeAttr(JSON.stringify(post))}'>
            🔥 สร้างคอนเทนต์
          </button>
          ${post.url ? `<a class="btn-action btn-link" href="${escapeAttr(post.url)}" target="_blank">🔗 ดูโพสต์ต้นฉบับ</a>` : ''}
        </div>
      </div>
    `).join('');

        const updateBatchCount = () => {
            const checked = foundList.querySelectorAll('.viral-checkbox:checked').length;
            const batchBtn = $('#batchCount');
            if (batchBtn) batchBtn.textContent = checked;
        };

        // Attach Process checkbox sync
        foundList.querySelectorAll('.viral-checkbox').forEach(chk => {
            chk.addEventListener('change', () => {
                const postId = chk.getAttribute('data-post-id');
                if (chk.checked) selectedViralIds.add(postId);
                else selectedViralIds.delete(postId);
                updateBatchCount();
            });
        });
        updateBatchCount();

        // Attach process buttons
        foundList.querySelectorAll('.btn-process').forEach(btn => {
            btn.addEventListener('click', async (e) => {
                const post = JSON.parse(e.currentTarget.getAttribute('data-post'));
                e.currentTarget.disabled = true;
                e.currentTarget.textContent = '⏳ กำลังเข้าคิว...';
                await sendMessage({ type: 'PROCESS_WITH_AI', data: post });
                e.currentTarget.textContent = '✅ ส่งแล้ว!';
            });
        });
    }

    function renderProcessQueue(posts) {
        queueCount.textContent = posts.length;

        if (!posts.length) {
            queueList.innerHTML = `
                <div class="empty-state">
                    <p>🗂️ ยังไม่มีรายการในคิว</p>
                    <p class="hint">ติ๊กเลือกจาก Found แล้วกด เข้าคิว AI</p>
                </div>`;
            return;
        }

        queueList.innerHTML = posts.map(post => `
            <div class="card">
                <div class="card-meta">
                    <span class="card-badge badge-viral">🔥 ${escapeHtml(post.viewCountText || '')}</span>
                    <div class="card-meta-right">
                        <span class="char-count queue-status-${escapeAttr(post.queueStatus || 'queued')}">${escapeHtml(getQueueStatusLabel(post.queueStatus, post.queueError))}</span>
                        <span class="card-time">${formatTime(post.queueUpdatedAt || post.capturedAt)}</span>
                    </div>
                </div>
                <div class="card-author">@${escapeHtml(post.author || '')}</div>
                <div class="card-content">${escapeHtml(truncate(post.text || '', 180))}</div>
                <div class="card-actions">
                    <button class="btn-action queue-remove" data-id="${escapeAttr(post.id)}">ลบออกจากคิว</button>
                    ${post.url ? `<a class="btn-action btn-link" href="${escapeAttr(post.url)}" target="_blank">🔗 ต้นฉบับ</a>` : ''}
                </div>
            </div>`).join('');

        queueList.querySelectorAll('.queue-remove').forEach(button => {
            button.addEventListener('click', async () => {
                await sendMessage({ type: 'REMOVE_FROM_PROCESS_QUEUE', data: { id: button.getAttribute('data-id') } });
                loadProcessQueue();
            });
        });
    }

    function getQueueStatusLabel(status, error) {
        switch (status) {
            case 'processing':
                return 'กำลังดำเนินการ';
            case 'done':
                return 'เสร็จแล้ว';
            case 'error':
                return error ? `ผิดพลาด` : 'ผิดพลาด';
            default:
                return 'รอดำเนินการ';
        }
    }

    function renderResultsPreview(results) {
        resultCount.textContent = results.length;

        if (!results.length) {
            resultsPreviewList.innerHTML = `
                <div class="empty-state">
                    <p>📚 ยังไม่มี Results</p>
                    <p class="hint">เมื่อ AI สร้างเสร็จ ผลลัพธ์จะถูกเก็บไว้ที่นี่</p>
                </div>`;
            return;
        }

        resultsPreviewList.innerHTML = results.slice(0, 12).map(item => `
            <div class="card">
                <div class="card-meta">
                    <span class="card-badge badge-ready">${item.copied ? 'Copied' : 'Saved'}</span>
                    <div class="card-meta-right">
                        <span class="char-count">${getCharCount(item.finalText || item.generatedText)} ตัว</span>
                        <span class="card-time">${formatTime(item.createdAt)}</span>
                    </div>
                </div>
                <div class="card-content result-preview-text">${escapeHtml(truncate(item.finalText || item.generatedText, 220))}</div>
                <div class="card-actions">
                    <button class="btn-action result-copy">📋 Copy</button>
                    ${item.sourceUrl ? `<a class="btn-action btn-link" href="${escapeAttr(item.sourceUrl)}" target="_blank">🔗 ต้นทาง</a>` : ''}
                </div>
            </div>`).join('');

        resultsPreviewList.querySelectorAll('.result-copy').forEach(button => {
            button.addEventListener('click', async () => {
                const text = button.closest('.card')?.querySelector('.result-preview-text')?.textContent?.trim() || '';
                await navigator.clipboard.writeText(text);
                button.textContent = '✅ Copied';
            });
        });
    }

    function renderGoogleTrends(trends) {
        const visibleTrends = Array.isArray(trends) ? trends.slice(0, 20) : [];

        if (!visibleTrends.length) {
            trendList.innerHTML = `
                <div class="empty-state">
                    <p>📈 ยังดึง Google Trends ไม่ได้</p>
                </div>`;
            return;
        }

        trendList.innerHTML = visibleTrends.map(item => `
            <div class="card">
                <div class="trend-item">
                    <strong title="${escapeAttr(item.query)}">${escapeHtml(compactTrendQuery(item.query))}</strong>
                    <button class="btn-action trend-use" data-query="${escapeAttr(compactTrendQuery(item.query))}">ใช้คำนี้</button>
                </div>
            </div>`).join('');

        trendList.querySelectorAll('.trend-use').forEach(button => {
            button.addEventListener('click', () => {
                const query = button.getAttribute('data-query') || '';
                const normalizedQuery = normalizeHashtagQuery(query);
                autoScoutQueryInput.value = normalizedQuery;
                autoScoutQuery = normalizedQuery;
            });
        });
    }

    // =============================================
    // 6) Settings
    // =============================================
    $('#saveSettings').addEventListener('click', async () => {
        const settings = {
            aiProvider: $('#aiProvider').value || 'grok',
            minViews: parseInt($('#minViews').value) || 500000,
            typingSpeedMin: parseInt($('#typingSpeedMin').value) || 30,
            typingSpeedMax: parseInt($('#typingSpeedMax').value) || 150,
            pauseEveryChars: parseInt($('#pauseEveryChars').value) || 40,
            pauseMin: parseInt($('#pauseMin').value) || 300,
            pauseMax: parseInt($('#pauseMax').value) || 800,
            promptMode: $('#promptMode').value || 'soft-sell',
            scrollPreset: $('#scrollPreset').value,
            manualAssist: $('#manualAssist').checked,
            pauseOnFound: $('#pauseOnFound').checked,
            pauseOnFoundCount: Math.max(1, parseInt($('#pauseOnFoundCount').value, 10) || 1),
            checkpointEverySteps: parseInt($('#checkpointEverySteps').value) || 6,
            sessionLimit: parseInt($('#sessionLimit').value) || 15,
            dailyLimit: parseInt($('#dailyLimit').value) || 60,
            autoQuoteMinMinutes: parseInt($('#autoQuoteMinMinutes').value) || 2,
            autoQuoteMaxMinutes: parseInt($('#autoQuoteMaxMinutes').value) || 5,
            promptTemplate: $('#promptTemplate').value
        };

        const res = await sendMessage({ type: 'SAVE_SETTINGS', data: settings });
        const msg = $('#settingsMsg');
        msg.classList.remove('hidden');

        if (res?.success) {
            updateAiProviderUi(settings.aiProvider);
            if (res.data) {
                if (promptModeSelect) promptModeSelect.value = res.data.promptMode || settings.promptMode;
                if (promptTemplateInput) promptTemplateInput.value = res.data.promptTemplate || settings.promptTemplate;
                savedPromptTemplate = res.data.promptTemplate || settings.promptTemplate;
                savedPromptTemplateSource = res.data.promptTemplateSource || 'custom';
                refreshPromptTemplateStatus();
            }
            msg.textContent = '✅ บันทึกเรียบร้อย!';
            msg.className = 'settings-msg msg-success';
        } else {
            msg.textContent = '❌ บันทึกไม่สำเร็จ';
            msg.className = 'settings-msg msg-error';
        }

        setTimeout(() => msg.classList.add('hidden'), 3000);
    });

    promptModeSelect?.addEventListener('change', refreshPromptTemplateStatus);
    promptTemplateInput?.addEventListener('input', refreshPromptTemplateStatus);
    applyPromptPresetBtn?.addEventListener('click', async () => {
        const promptMode = promptModeSelect?.value || 'soft-sell';
        const confirmed = confirm(`แทนที่ prompt ปัจจุบันด้วย preset ${getPromptModeLabel(promptMode)}?`);
        if (!confirmed) return;

        const res = await sendMessage({ type: 'GET_PROMPT_PRESET', data: { promptMode } });
        if (!res?.success || !promptTemplateInput) return;

        promptTemplateInput.value = res.data?.promptTemplate || '';
        refreshPromptTemplateStatus();
    });

    // =============================================
    // 7) Action Buttons
    // =============================================

    // Batch Create AI
    $('#batchCreateAiBtn')?.addEventListener('click', async () => {
        const selectedIds = Array.from(selectedViralIds);
        if (selectedIds.length === 0) {
            alert('กรุณาติ๊กเลือกโพสต์ที่ต้องการอย่างน้อย 1 โพสต์');
            return;
        }

        const { data: posts } = await sendMessage({ type: 'GET_VIRAL_POSTS' });
        if (!posts) return;

        const postsToProcess = posts.filter(p => selectedIds.includes(p.id));

        await sendMessage({ type: 'ADD_TO_PROCESS_QUEUE', data: postsToProcess });

        selectedViralIds = new Set();
        foundList.querySelectorAll('.viral-checkbox').forEach(chk => {
            chk.checked = false;
        });
        const batchBtn = $('#batchCount');
        if (batchBtn) batchBtn.textContent = '0';

        await loadProcessQueue();
        $$('.tab').forEach(t => t.classList.remove('active'));
        $$('.tab-content').forEach(c => c.classList.remove('active'));
        $('[data-tab="queue"]').classList.add('active');
        $('#tab-queue').classList.add('active');

    });

    $('#startQueueBtn')?.addEventListener('click', async () => {
        const res = await sendMessage({ type: 'START_PROCESS_QUEUE' });
        if (!res?.success) {
            statusText.textContent = res?.error || 'เริ่มคิวไม่สำเร็จ';
            statusBar.classList.remove('hidden');
            return;
        }

        await loadProcessQueue();
    });

    $('#clearQueueBtn')?.addEventListener('click', async () => {
        if (!confirm('ล้างรายการในคิวทั้งหมด?')) return;
        await sendMessage({ type: 'CLEAR_PROCESS_QUEUE' });
        await loadProcessQueue();
    });

    $('#clearDrafts').addEventListener('click', async () => {
        if (confirm('ลบ Draft ทั้งหมด?')) {
            await sendMessage({ type: 'CLEAR_ALL_DRAFTS' });
            loadDrafts();
        }
    });

    $('#clearFound').addEventListener('click', async () => {
        if (confirm('ลบโพสต์ Viral ที่พบทั้งหมด?')) {
            await sendMessage({ type: 'CLEAR_ALL_VIRAL' });
            loadViralPosts();
        }
    });

    clearResultsBtn?.addEventListener('click', async () => {
        if (confirm('ลบ Results ทั้งหมด?')) {
            await sendMessage({ type: 'CLEAR_RESULTS' });
            loadResults();
        }
    });

    refreshTrendsBtn?.addEventListener('click', async () => {
        refreshTrendsBtn.disabled = true;
        refreshTrendsBtn.textContent = '...';
        await loadGoogleTrends();
        refreshTrendsBtn.disabled = false;
        refreshTrendsBtn.textContent = '↻ รีเฟรช';
    });

    trendsCountrySelect?.addEventListener('change', async () => {
        trendsCountry = trendsCountrySelect.value;
        await sendMessage({ type: 'SET_TRENDS_COUNTRY', data: trendsCountry });
        await loadGoogleTrends();
    });

    // =============================================
    // 8) Real-time Status Updates (จาก background)
    // =============================================
    chrome.runtime.onMessage.addListener((message) => {
        if (message.type === 'STATUS_UPDATE') {
            updateStatusUI(message.data);
        }
    });

    function isAutoQuoteStatusMessage(message) {
        const text = String(message || '').trim();
        if (!text) return false;

        return text.includes('Auto Quote')
            || /^โพสต์แล้ว \d+ รายการ เหลือ \d+ รายการ/.test(text)
            || /^ข้าม draft /.test(text);
    }

    function updateStatusUI(data) {
        const { status, message } = data;
        const isAutoQuoteMessage = isAutoQuoteStatusMessage(message);

        statusText.textContent = message;

        switch (status) {
            case 'processing':
                if (isAutoQuoteMessage) {
                    statusBar.classList.add('hidden');
                } else {
                    statusBar.classList.remove('hidden');
                }
                break;

            case 'found':
                loadViralPosts();
                break;

            case 'done':
                statusBar.classList.add('hidden');
                if (String(message || '').includes('Auto Quote')) {
                    isAutoQuote = false;
                    updateAutoQuoteUi();
                }
                loadDrafts();
                if (!(currentCampaign?.status === 'running' || currentCampaign?.status === 'paused')) {
                    switchToTab('drafts');
                }
                break;

            case 'error':
                if (isAutoQuoteMessage) {
                    statusBar.classList.add('hidden');
                } else {
                    statusBar.classList.remove('hidden');
                }
                if (String(message || '').includes('Auto Quote')) {
                    isAutoQuote = false;
                    updateAutoQuoteUi();
                }
                setTimeout(() => statusBar.classList.add('hidden'), 8000);
                break;
        }
    }

    // =============================================
    // 9) Auto-refresh ด้วย Storage Change Listener
    // =============================================
    chrome.storage.onChanged.addListener((changes, area) => {
        if (area !== 'local') return;
        if (changes.drafts) loadDrafts();
        if (changes.results) loadResults();
        if (changes.viralPosts) loadViralPosts();
        if (changes.processQueue) loadProcessQueue();
        if (changes.autoQuoteState) {
            autoQuoteState = changes.autoQuoteState.newValue || null;
            isAutoQuote = Boolean(autoQuoteState?.active);
            updateAutoQuoteUi();
            renderAutoQuoteState();
        }
        if (changes.trendsCountry) {
            trendsCountry = changes.trendsCountry.newValue || 'TH';
            if (trendsCountrySelect) {
                trendsCountrySelect.value = trendsCountry;
            }
            loadGoogleTrends();
        }
        if (changes.settings?.newValue) {
            updateAiProviderUi(changes.settings.newValue.aiProvider || 'grok');
        }
        if (changes.autoScoutProgress) renderProgress(changes.autoScoutProgress.newValue);
        if (changes.campaign) loadCampaign();
    });

    function renderProgress(progress) {
        const current = progress || {};
        updateAiProviderUi(aiProvider);
        progressQuery.textContent = current.query || '-';
        progressProduct.textContent = current.product || '-';
        progressProduct.title = current.productLink || '';
        progressPreset.textContent = current.scrollPreset || 'medium';
        progressSteps.textContent = String(current.steps || 0);
        progressFound.textContent = String(current.foundThisSession || 0);
        progressPauseReason.textContent = current.paused ? (current.pauseReason || 'พักอยู่') : (current.active ? 'กำลังทำงาน' : 'พร้อม');
    }

    function onDraftTextInput(event) {
        const textEl = event.currentTarget;
        const card = textEl.closest('.card');
        updateCardCharCount(card, textEl.textContent.trim());
    }

    function updateCardCharCount(card, text) {
        const chip = card?.querySelector('.char-count');
        if (chip) {
            chip.textContent = `${getCharCount(text)} ตัว`;
        }

        const readinessChip = card?.querySelector('.draft-readiness-badge');
        if (readinessChip) {
            const sourceUrl = card?.querySelector('.card-source a')?.getAttribute('href') || '';
            const badge = getDraftReadiness(text, sourceUrl);
            readinessChip.textContent = badge.label;
            readinessChip.className = `draft-readiness-badge ${badge.className}`;
        }
    }

    function getCharCount(text) {
        return Array.from(text || '').length;
    }

    function setTrendsCollapsed(collapsed) {
        isTrendsCollapsed = Boolean(collapsed);
        trendListWrap?.classList.toggle('is-collapsed', isTrendsCollapsed);
        trendListWrap?.classList.toggle('is-expanded', !isTrendsCollapsed);
        if (toggleTrendsPanelBtn) {
            toggleTrendsPanelBtn.textContent = isTrendsCollapsed ? 'ขยาย' : 'ย่อ';
            toggleTrendsPanelBtn.setAttribute('aria-expanded', String(!isTrendsCollapsed));
        }
    }

    function normalizeHashtagQuery(value) {
        return String(value || '').trim();
    }

    function normalizeCampaignTopic(value) {
        return String(value || '').trim();
    }

    function renderDraftStatusBadge(draft) {
        const badge = getDraftStatusBadge(draft);
        const title = escapeAttr(badge.title || badge.label);
        return `<span class="card-badge ${badge.className}" title="${title}">${badge.label}</span>`;
    }

    function getDraftStatusBadge(draft) {
        switch (draft.status) {
            case 'auto_quote_queued':
                return { label: '⏳ รอคิว Auto Quote', className: 'badge-posted', title: 'ระบบจะโพสต์รายการนี้อัตโนมัติตามคิว' };
            case 'auto_quote_posting':
            case 'posting':
                return { label: '🚀 กำลังโพสต์', className: 'badge-ready', title: 'กำลังเปิด X และกดโพสต์ให้อัตโนมัติ' };
            case 'posted':
                return { label: '✅ โพสต์แล้ว', className: 'badge-posted', title: draft.postedAt ? `โพสต์เมื่อ ${formatTime(draft.postedAt)}` : 'โพสต์เสร็จแล้ว' };
            case 'needs_review':
                return { label: '⚠️ ต้องตรวจ/ย่อ', className: 'badge-quote-missing', title: draft.validationError || 'ข้อความยังไม่ผ่านเพดานหรือโครงสร้าง 4 บรรทัด' };
            case 'post_error':
                return { label: '❌ โพสต์ไม่สำเร็จ', className: 'badge-quote-missing', title: draft.postError || 'โปรดลองใหม่อีกครั้ง' };
            case 'pending_post':
                return { label: '🕒 เตรียมโพสต์', className: 'badge-posted', title: 'ระบบกำลังเตรียมหน้า Compose' };
            default:
                return { label: '✏️ พร้อมโพสต์', className: 'badge-ready', title: 'พร้อมส่งไปโพสต์บน X' };
        }
    }

    function renderDraftReadinessBadge(draft) {
        const badge = getDraftReadiness(draft.finalText || draft.generatedText || '', draft.sourceUrl || '', draft.productLink || '');
        return `<span class="draft-readiness-badge ${badge.className}">${badge.label}</span>`;
    }

    function getDraftReadiness(text, sourceUrl, productLink) {
        const hasQuoteSource = Boolean(String(sourceUrl || '').trim());
        const normalizedText = String(text || '').trim();
        const withinLimit = getCharCount(normalizedText) <= 280;
        const bodyLines = extractDraftBodyLines(normalizedText, productLink);
        const hasFourLineStructure = bodyLines.length === 4
            && /^-\s+/.test(bodyLines[1] || '')
            && /^-\s+/.test(bodyLines[2] || '');

        if (hasQuoteSource && hasFourLineStructure && withinLimit) {
            return { label: 'Quote-ready / within limit', className: 'badge-quote-ready' };
        }

        const missing = [];
        if (!hasQuoteSource) missing.push('quote');
        if (!hasFourLineStructure) missing.push('4-line');
        if (!withinLimit) missing.push('limit');
        return { label: `ต้องเช็ก: ${missing.join(', ')}`, className: 'badge-quote-missing' };
    }

    function extractDraftBodyLines(text, productLink) {
        const lines = String(text || '')
            .split('\n')
            .map(line => line.trim())
            .filter(Boolean);
        const cleanProductLink = String(productLink || '').trim();

        if (cleanProductLink && lines[lines.length - 1] === cleanProductLink) {
            return lines.slice(0, -1);
        }

        return lines;
    }

    // =============================================
    // 10) Utilities
    // =============================================
    function sendMessage(msg) {
        return new Promise(resolve => {
            chrome.runtime.sendMessage(msg, resolve);
        });
    }

    function formatTime(isoString) {
        if (!isoString) return '';
        const date = new Date(isoString);
        const now = new Date();
        const diffMs = now - date;
        const diffMin = Math.floor(diffMs / 60000);

        if (diffMin < 1) return 'เมื่อกี้';
        if (diffMin < 60) return `${diffMin} นาทีที่แล้ว`;
        if (diffMin < 1440) return `${Math.floor(diffMin / 60)} ชม.ที่แล้ว`;
        return date.toLocaleDateString('th-TH', { day: 'numeric', month: 'short' });
    }

    function truncate(text, maxLen) {
        if (!text || text.length <= maxLen) return text || '';
        return text.substring(0, maxLen) + '...';
    }

    function compactTrendQuery(text) {
        const normalized = String(text || '').replace(/\s+/g, ' ').trim();
        if (!normalized) return '';
        if (normalized.length <= 28) return normalized;

        const quoted = normalized.match(/["“'‘]([^"”'’]{2,28})["”'’]/u);
        if (quoted?.[1]) {
            return quoted[1].trim();
        }

        const stopTokens = new Set([
            'วันนี้', 'ล่าสุด', 'อัปเดต', 'เปิดชื่อ', 'เตือน', 'ระวัง', 'เผย', 'ชี้', 'พบ', 'พร้อม', 'หลัง', 'ก่อน',
            'the', 'a', 'an', 'of', 'for', 'to', 'and'
        ]);
        const tokens = normalized.split(' ')
            .map(token => token.trim())
            .filter(token => token && !/^[\d./:+-]+$/.test(token) && !stopTokens.has(token.toLowerCase()));

        const compactTokens = [];
        for (const token of tokens) {
            const nextValue = compactTokens.length ? `${compactTokens.join(' ')} ${token}` : token;
            if (nextValue.length > 28) break;
            compactTokens.push(token);
            if (compactTokens.length >= 4) break;
        }

        if (compactTokens.length) {
            return compactTokens.join(' ');
        }

        return truncate(normalized, 28);
    }

    function escapeHtml(str) {
        if (!str) return '';
        const div = document.createElement('div');
        div.textContent = str;
        return div.innerHTML;
    }

    function escapeAttr(str) {
        if (!str) return '';
        return str.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/'/g, '&#39;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    }

    // =============================================
    // Campaign (Full Automate)
    // =============================================
    let currentCampaign = null;
    let saveCampaignTimer = null;

    async function loadCampaign() {
        const res = await sendMessage({ type: 'GET_CAMPAIGN' });
        currentCampaign = res?.data || null;
        renderCampaign();
    }

    function renderCampaign() {
        const c = currentCampaign;
        const nameInput = $('#campaignName');
        const topicExecMode = $('#topicExecMode');
        const quoteDistMode = $('#quoteDistMode');
        const monitor = $('#campaignMonitor');
        const badge = $('#campaignStatus');

        if (!c) {
            if (nameInput) nameInput.value = '';
            renderTopics([{ id: '', topic: '', productName: '', productLink: '', targetPostCount: 3 }]);
            updateCampaignControls('draft');
            updateAutomationControlState(null);
            if (monitor) monitor.classList.add('hidden');
            if (badge) badge.textContent = '-';
            return;
        }

        if (nameInput) nameInput.value = c.name || '';
        if (topicExecMode) topicExecMode.value = c.topicExecutionMode || 'round-robin';
        if (quoteDistMode) quoteDistMode.value = c.quoteDistributionMode || 'sequential-by-product';
        renderTopics(c.topics.length ? c.topics : [{ id: '', topic: '', productName: '', productLink: '', targetPostCount: 3 }]);
        updateCampaignControls(c.status);
        updateAutomationControlState(c);

        if (c.status === 'running' || c.status === 'paused') {
            renderCampaignMonitor(c);
            if (monitor) monitor.classList.remove('hidden');
            switchToTab('campaign');
        } else {
            if (monitor) monitor.classList.add('hidden');
        }

        if (badge) {
            const labels = { draft: '-', running: '\u25b6', paused: '\u23f8', completed: '\u2713', error: '!' };
            badge.textContent = labels[c.status] || '-';
        }
    }

    function renderTopics(topics) {
        const topicListEl = $('#topicList');
        if (!topicListEl) return;

        topicListEl.innerHTML = topics.map((t, i) => `
            <div class="topic-row" data-index="${i}">
                <div class="topic-row-header">
                    <span class="topic-number">#${i + 1}</span>
                    <span class="topic-row-status">${getTopicStatusLabel(t)}</span>
                    <div class="topic-row-actions">
                        ${i > 0 ? `<button class="topic-move-up btn-icon" data-index="${i}" title="\u0e02\u0e36\u0e49\u0e19">\u25b2</button>` : ''}
                        ${i < topics.length - 1 ? `<button class="topic-move-down btn-icon" data-index="${i}" title="\u0e25\u0e07">\u25bc</button>` : ''}
                        <button class="topic-remove btn-icon" data-index="${i}" title="\u0e25\u0e1a">\u2715</button>
                    </div>
                </div>
                <input type="text" class="topic-field topic-query" placeholder="\u0e2b\u0e31\u0e27\u0e02\u0e49\u0e2d \u0e40\u0e0a\u0e48\u0e19 aitools \u0e2b\u0e23\u0e37\u0e2d bitcoin" value="${escapeAttr(normalizeCampaignTopic(t.topic || ''))}" data-index="${i}" />
                <input type="text" class="topic-field topic-product" placeholder="\u0e2a\u0e34\u0e19\u0e04\u0e49\u0e32" value="${escapeAttr(t.productName || '')}" data-index="${i}" />
                <input type="url" class="topic-field topic-link" placeholder="\u0e25\u0e34\u0e07\u0e01\u0e4c\u0e2a\u0e34\u0e19\u0e04\u0e49\u0e32" value="${escapeAttr(t.productLink || '')}" data-index="${i}" />
                <button class="btn-small affiliate-shortcut-btn topic-affiliate-btn" type="button" data-index="${i}">เชื่อมต่อลิงก์ Shopee Affiliate</button>
                <div class="topic-row-footer">
                    <label class="topic-count-label">\u0e40\u0e1b\u0e49\u0e32\u0e2b\u0e21\u0e32\u0e22:
                        <input type="number" class="topic-field topic-count" value="${t.targetPostCount || 3}" min="1" max="50" data-index="${i}" />
                        \u0e42\u0e1e\u0e2a\u0e15\u0e4c
                    </label>
                    ${t.generatedCount ? `<span class="topic-progress">\u0e2a\u0e23\u0e49\u0e32\u0e07\u0e41\u0e25\u0e49\u0e27 ${t.generatedCount}/${t.targetPostCount}</span>` : ''}
                    ${t.quotedCount ? `<span class="topic-progress">Quote ${t.quotedCount}</span>` : ''}
                </div>
            </div>
        `).join('');

        topicListEl.querySelectorAll('.topic-remove').forEach(btn => {
            btn.addEventListener('click', () => removeTopicRow(parseInt(btn.dataset.index)));
        });
        topicListEl.querySelectorAll('.topic-move-up').forEach(btn => {
            btn.addEventListener('click', () => moveTopicRow(parseInt(btn.dataset.index), parseInt(btn.dataset.index) - 1));
        });
        topicListEl.querySelectorAll('.topic-move-down').forEach(btn => {
            btn.addEventListener('click', () => moveTopicRow(parseInt(btn.dataset.index), parseInt(btn.dataset.index) + 1));
        });
        topicListEl.querySelectorAll('.topic-field').forEach(field => {
            field.addEventListener('change', () => debouncedSaveCampaign());
        });
        topicListEl.querySelectorAll('.topic-query').forEach(field => {
            field.addEventListener('blur', () => {
                field.value = normalizeCampaignTopic(field.value);
                debouncedSaveCampaign();
            });
        });
        topicListEl.querySelectorAll('.topic-affiliate-btn').forEach(button => {
            button.addEventListener('click', () => {
                window.open(AFFILIATE_PRODUCT_OFFER_URL, '_blank');
            });
        });
    }

    function getTopicStatusLabel(topic) {
        if (!topic.status || topic.status === 'pending') return '';
        const labels = { running: '\ud83d\udd04 \u0e01\u0e33\u0e25\u0e31\u0e07\u0e17\u0e33', completed: '\u2705 \u0e04\u0e23\u0e1a\u0e41\u0e25\u0e49\u0e27', error: '\u274c \u0e1c\u0e34\u0e14\u0e1e\u0e25\u0e32\u0e14', 'waiting-source': '\u23f3 \u0e23\u0e2d\u0e42\u0e1e\u0e2a\u0e15\u0e4c' };
        return labels[topic.status] || '';
    }

    function collectTopicsFromUI() {
        const rows = $('#topicList')?.querySelectorAll('.topic-row') || [];
        const topics = [];
        rows.forEach((row, i) => {
            topics.push({
                id: currentCampaign?.topics?.[i]?.id || '',
                topic: normalizeCampaignTopic(row.querySelector('.topic-query')?.value || ''),
                productName: row.querySelector('.topic-product')?.value?.trim() || '',
                productLink: row.querySelector('.topic-link')?.value?.trim() || '',
                targetPostCount: parseInt(row.querySelector('.topic-count')?.value) || 3
            });
        });
        return topics;
    }

    function addTopicRow() {
        const topics = collectTopicsFromUI();
        topics.push({ id: '', topic: '', productName: '', productLink: '', targetPostCount: 3 });
        renderTopics(topics);
        debouncedSaveCampaign();
    }

    function removeTopicRow(index) {
        const topics = collectTopicsFromUI();
        if (topics.length <= 1) return;
        topics.splice(index, 1);
        renderTopics(topics);
        debouncedSaveCampaign();
    }

    function moveTopicRow(from, to) {
        const topics = collectTopicsFromUI();
        if (to < 0 || to >= topics.length) return;
        const [item] = topics.splice(from, 1);
        topics.splice(to, 0, item);
        renderTopics(topics);
        debouncedSaveCampaign();
    }

    function debouncedSaveCampaign() {
        if (currentCampaign?.status === 'running') return;
        clearTimeout(saveCampaignTimer);
        saveCampaignTimer = setTimeout(() => saveCampaignFromUI(), 600);
    }

    async function saveCampaignFromUI() {
        const data = {
            name: $('#campaignName')?.value?.trim() || '',
            topics: collectTopicsFromUI(),
            topicExecutionMode: $('#topicExecMode')?.value || 'round-robin',
            quoteDistributionMode: $('#quoteDistMode')?.value || 'sequential-by-product'
        };
        const res = await sendMessage({ type: 'SAVE_CAMPAIGN', data });
        if (res?.success) currentCampaign = res.data;
    }

    function updateCampaignControls(status) {
        const isRunning = status === 'running';
        const isPaused = status === 'paused';
        const isDraft = status === 'draft' || !status;
        const isCompleted = status === 'completed';
        const startBtn = $('#campaignStartBtn');
        const pauseBtn = $('#campaignPauseBtn');
        const resumeBtn = $('#campaignResumeBtn');
        const stopBtn = $('#campaignStopBtn');
        if (startBtn) startBtn.style.display = (isDraft || isCompleted) ? '' : 'none';
        if (pauseBtn) pauseBtn.style.display = isRunning ? '' : 'none';
        if (resumeBtn) resumeBtn.style.display = isPaused ? '' : 'none';
        if (stopBtn) stopBtn.style.display = (isRunning || isPaused) ? '' : 'none';

        const disabled = isRunning || isPaused;
        const nameInput = $('#campaignName');
        if (nameInput) nameInput.disabled = disabled;
        $('#topicList')?.querySelectorAll('input, select, button').forEach(el => el.disabled = disabled);
        const addBtn = $('#addTopicBtn');
        if (addBtn) addBtn.disabled = disabled;
        const execMode = $('#topicExecMode');
        if (execMode) execMode.disabled = disabled;
        const distMode = $('#quoteDistMode');
        if (distMode) distMode.disabled = disabled;
    }

    function renderCampaignMonitor(campaign) {
        if (!campaign) return;
        const monitorContent = $('#campaignMonitorContent');
        if (!monitorContent) return;
        const activeTopic = campaign.topics[campaign.activeTopicIndex];
        const totalTarget = campaign.topics.reduce((s, t) => s + t.targetPostCount, 0);
        const totalGenerated = campaign.topics.reduce((s, t) => s + (t.generatedCount || 0), 0);
        const totalQuoted = campaign.topics.reduce((s, t) => s + (t.quotedCount || 0), 0);
        const phaseLabels = { setup: '\u0e15\u0e31\u0e49\u0e07\u0e04\u0e48\u0e32', collecting: '\u0e40\u0e01\u0e47\u0e1a\u0e42\u0e1e\u0e2a\u0e15\u0e4c\u0e40\u0e02\u0e49\u0e32 Found/Queue', generating: '\u0e2a\u0e23\u0e49\u0e32\u0e07 Draft \u0e08\u0e32\u0e01 Queue', quoting: 'Quote \u0e2d\u0e31\u0e15\u0e42\u0e19\u0e21\u0e31\u0e15\u0e34', completed: '\u0e40\u0e2a\u0e23\u0e47\u0e08\u0e2a\u0e34\u0e49\u0e19' };

        monitorContent.innerHTML = `
            <div class="monitor-grid">
                <div class="monitor-item"><span class="monitor-label">\u0e02\u0e31\u0e49\u0e19\u0e15\u0e2d\u0e19</span><strong>${phaseLabels[campaign.phase] || campaign.phase}</strong></div>
                <div class="monitor-item"><span class="monitor-label">Draft \u0e23\u0e27\u0e21</span><strong>${totalGenerated} / ${totalTarget}</strong></div>
                <div class="monitor-item"><span class="monitor-label">Quote \u0e23\u0e27\u0e21</span><strong>${totalQuoted}</strong></div>
                ${activeTopic ? `<div class="monitor-item"><span class="monitor-label">\u0e2b\u0e31\u0e27\u0e02\u0e49\u0e2d\u0e1b\u0e31\u0e08\u0e08\u0e38\u0e1a\u0e31\u0e19</span><strong>${escapeHtml(activeTopic.topic)}</strong></div>` : ''}
            </div>
            <div class="monitor-topics">
                ${campaign.topics.map((t, i) => `
                    <div class="monitor-topic-row ${i === campaign.activeTopicIndex && campaign.status === 'running' ? 'active' : ''}">
                        <span class="monitor-topic-name">${escapeHtml(t.topic || '(\u0e27\u0e48\u0e32\u0e07)')}</span>
                        <span class="monitor-topic-progress">${t.generatedCount}/${t.targetPostCount} draft</span>
                        <span class="monitor-topic-status">${getTopicStatusLabel(t)}</span>
                    </div>
                `).join('')}
            </div>
        `;
    }

    // Campaign event listeners
    $('#addTopicBtn')?.addEventListener('click', addTopicRow);

    $('#campaignStartBtn')?.addEventListener('click', async () => {
        await saveCampaignFromUI();
        const res = await sendMessage({ type: 'START_CAMPAIGN' });
        if (!res?.success) { alert(res?.error || '\u0e40\u0e23\u0e34\u0e48\u0e21 Campaign \u0e44\u0e21\u0e48\u0e2a\u0e33\u0e40\u0e23\u0e47\u0e08'); return; }
        currentCampaign = res.data;
        renderCampaign();
        switchToTab('campaign');
    });

    $('#campaignPauseBtn')?.addEventListener('click', async () => {
        const res = await sendMessage({ type: 'PAUSE_CAMPAIGN' });
        if (res?.success) { currentCampaign = res.data; renderCampaign(); }
    });

    $('#campaignResumeBtn')?.addEventListener('click', async () => {
        const res = await sendMessage({ type: 'RESUME_CAMPAIGN' });
        if (res?.success) { currentCampaign = res.data; renderCampaign(); }
    });

    $('#campaignStopBtn')?.addEventListener('click', async () => {
        const res = await sendMessage({ type: 'STOP_CAMPAIGN' });
        if (res?.success) { currentCampaign = res.data; renderCampaign(); }
    });

    $('#campaignResetBtn')?.addEventListener('click', async () => {
        if (!confirm('\u0e23\u0e35\u0e40\u0e0b\u0e47\u0e15\u0e08\u0e30\u0e25\u0e1a progress \u0e17\u0e31\u0e49\u0e07\u0e2b\u0e21\u0e14 \u0e22\u0e37\u0e19\u0e22\u0e31\u0e19?')) return;
        const res = await sendMessage({ type: 'RESET_CAMPAIGN' });
        if (res?.success) { currentCampaign = res.data; renderCampaign(); }
    });

    $('#campaignDeleteBtn')?.addEventListener('click', async () => {
        if (!confirm('\u0e25\u0e1a Campaign \u0e19\u0e35\u0e49\u0e17\u0e31\u0e49\u0e07\u0e2b\u0e21\u0e14?')) return;
        await sendMessage({ type: 'DELETE_CAMPAIGN' });
        currentCampaign = null;
        renderCampaign();
    });

    $('#campaignName')?.addEventListener('change', () => debouncedSaveCampaign());
    $('#topicExecMode')?.addEventListener('change', () => debouncedSaveCampaign());
    $('#quoteDistMode')?.addEventListener('change', () => debouncedSaveCampaign());

    // Campaign monitor auto-refresh
    setInterval(() => {
        if (currentCampaign?.status === 'running') renderCampaignMonitor(currentCampaign);
    }, 3000);

})();
