(function () {
    'use strict';

    const listEl = document.getElementById('resultsList');
    const clearBtn = document.getElementById('clearResults');
    const focusId = new URLSearchParams(window.location.search).get('focus');

    loadResults();

    clearBtn.addEventListener('click', async () => {
        const confirmed = window.confirm('Clear all results?');
        if (!confirmed) return;
        await sendMessage({ type: 'CLEAR_RESULTS' });
        loadResults();
    });

    chrome.storage.onChanged.addListener((changes, area) => {
        if (area === 'local' && changes.results) {
            loadResults();
        }
    });

    async function loadResults() {
        const response = await sendMessage({ type: 'GET_RESULTS' });
        const results = response?.data || [];

        if (!results.length) {
            listEl.innerHTML = '<div class="empty-results">No results saved yet</div>';
            return;
        }

        listEl.innerHTML = results.map((item) => `
            <section class="result-card" id="result-${escapeAttr(item.id)}">
                <div class="result-top">
                    <div class="meta">
                        <span class="chip">${item.copied ? 'Copied' : 'Not copied'}</span>
                        ${item.product ? `<span class="chip">Product: ${escapeHtml(item.product)}</span>` : ''}
                        ${item.productLink ? `<span class="chip">Has product link</span>` : ''}
                        <span class="chip char-count">${getCharCount(item.finalText || item.generatedText)} chars</span>
                        <span class="chip">${formatTime(item.createdAt)}</span>
                    </div>
                </div>
                <pre class="result-text">${escapeHtml(item.finalText || item.generatedText)}</pre>
                <div class="source-snippet">Source: ${escapeHtml(item.sourceText || '-')}</div>
                <div class="actions">
                    <button class="primary-btn copy-btn">Copy</button>
                    ${item.sourceUrl ? `<a class="link-btn" target="_blank" href="${escapeAttr(item.sourceUrl)}">Open Source Post</a>` : ''}
                    ${item.productLink ? `<a class="link-btn" target="_blank" href="${escapeAttr(item.productLink)}">Open Product Link</a>` : ''}
                </div>
            </section>
        `).join('');

        listEl.querySelectorAll('.copy-btn').forEach((button) => {
            button.addEventListener('click', async () => {
                const text = button.closest('.result-card')?.querySelector('.result-text')?.textContent?.trim() || '';
                await navigator.clipboard.writeText(text);
                button.textContent = 'Copied';
            });
        });

        if (focusId) {
            document.getElementById(`result-${focusId}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
    }

    function sendMessage(message) {
        return new Promise((resolve) => chrome.runtime.sendMessage(message, resolve));
    }

    function formatTime(iso) {
        return new Date(iso).toLocaleString('en-US');
    }

    function escapeHtml(value) {
        const div = document.createElement('div');
        div.textContent = value || '';
        return div.innerHTML;
    }

    function escapeAttr(value) {
        return String(value || '').replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/'/g, '&#39;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    }

    function getCharCount(text) {
        return Array.from(text || '').length;
    }
})();