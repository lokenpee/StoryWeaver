export function createMessageChainView(deps = {}) {
    const {
        AppState,
        ListRenderer,
        EventDelegate,
        saveCurrentSettings,
        handleUseTavernApiChange,
    } = deps;

    function renderMessageChainUI() {
        const container = document.getElementById('ttw-message-chain-list');
        if (!container) return;

        const chain = AppState.settings.promptMessageChain || [{ role: 'user', content: '{PROMPT}', enabled: true }];
        const roleColors = { system: '#3498db', user: '#27ae60', assistant: '#f39c12' };
        const roleLabels = { system: '🔷 系统', user: '🟢 用户', assistant: '🟡 AI助手' };

        const html = ListRenderer.renderItems(
            chain,
            (msg, idx) => ListRenderer.renderMessageChainItem(msg, idx, chain.length, { roleColors, roleLabels }),
            { emptyMessage: '暂无消息，点击「➕ 添加消息」开始配置' },
        );

        ListRenderer.updateContainer(container, html);

        if (container.dataset.eventsBound === 'true') return;

        const getChain = () => (AppState.settings.promptMessageChain || [{ role: 'user', content: '{PROMPT}', enabled: true }]);

        EventDelegate.on(container, '.ttw-chain-role', 'change', (e, sel) => {
            const idx = parseInt(sel.dataset.chainIndex, 10);
            const nextChain = getChain();
            if (!nextChain[idx]) return;
            nextChain[idx].role = sel.value;
            AppState.settings.promptMessageChain = nextChain;
            renderMessageChainUI();
            saveCurrentSettings();
            handleUseTavernApiChange();
        });

        EventDelegate.on(container, '.ttw-chain-enabled', 'change', (e, cb) => {
            const idx = parseInt(cb.dataset.chainIndex, 10);
            const nextChain = getChain();
            if (!nextChain[idx]) return;
            nextChain[idx].enabled = cb.checked;
            AppState.settings.promptMessageChain = nextChain;
            renderMessageChainUI();
            saveCurrentSettings();
            handleUseTavernApiChange();
        });

        EventDelegate.on(container, '.ttw-chain-content', 'input', (e, ta) => {
            const idx = parseInt(ta.dataset.chainIndex, 10);
            const nextChain = getChain();
            if (!nextChain[idx]) return;
            nextChain[idx].content = ta.value;
            AppState.settings.promptMessageChain = nextChain;
            saveCurrentSettings();
        });

        EventDelegate.on(container, '.ttw-chain-move-up', 'click', (e, btn) => {
            const idx = parseInt(btn.dataset.chainIndex, 10);
            const nextChain = getChain();
            if (idx > 0) {
                [nextChain[idx], nextChain[idx - 1]] = [nextChain[idx - 1], nextChain[idx]];
            }
            AppState.settings.promptMessageChain = nextChain;
            renderMessageChainUI();
            saveCurrentSettings();
        });

        EventDelegate.on(container, '.ttw-chain-move-down', 'click', (e, btn) => {
            const idx = parseInt(btn.dataset.chainIndex, 10);
            const nextChain = getChain();
            if (idx < nextChain.length - 1) {
                [nextChain[idx], nextChain[idx + 1]] = [nextChain[idx + 1], nextChain[idx]];
            }
            AppState.settings.promptMessageChain = nextChain;
            renderMessageChainUI();
            saveCurrentSettings();
        });

        EventDelegate.on(container, '.ttw-chain-delete', 'click', (e, btn) => {
            const idx = parseInt(btn.dataset.chainIndex, 10);
            const nextChain = getChain();
            nextChain.splice(idx, 1);
            AppState.settings.promptMessageChain = nextChain;
            renderMessageChainUI();
            saveCurrentSettings();
        });

        container.dataset.eventsBound = 'true';
    }

    return {
        renderMessageChainUI,
    };
}
