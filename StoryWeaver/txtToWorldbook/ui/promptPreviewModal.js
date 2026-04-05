export function createPromptPreviewModal(deps = {}) {
    const {
        AppState,
        ModalFactory,
        ErrorHandler,
        alertAction,
        buildSystemPrompt,
        getChapterForcePrompt,
        getEnabledCategories,
    } = deps;

    function showPromptPreview() {
        try {
            const prompt = buildSystemPrompt() || '';
            const chapterForce = AppState.settings.forceChapterMarker ? getChapterForcePrompt(1) : '(已关闭)';
            const apiMode = AppState.settings.useTavernApi ? '酒馆API' : `自定义API (${AppState.settings.customApiProvider || '未设置'})`;
            const enabledCats = getEnabledCategories().map((c) => c.name).join(', ');
            const chain = Array.isArray(AppState.settings.promptMessageChain)
                ? AppState.settings.promptMessageChain
                : [{ role: 'user', content: '{PROMPT}', enabled: true }];
            const enabledChain = chain.filter((m) => m && m.enabled !== false);
            const chainInfo = enabledChain.map((m, i) => {
                const roleLabel = m.role === 'system' ? '🔷系统' : m.role === 'assistant' ? '🟡AI助手' : '🟢用户';
                const contentStr = typeof m.content === 'string' ? m.content : (m.content ? String(m.content) : '');
                const preview = contentStr.length > 60 ? `${contentStr.substring(0, 60)}...` : contentStr;
                return `  ${i + 1}. [${roleLabel}] ${preview}`;
            }).join('\n');

            const isParallelEnabled = AppState.config && AppState.config.parallel && AppState.config.parallel.enabled;
            const parallelMode = (AppState.config && AppState.config.parallel && AppState.config.parallel.mode) || '关闭';

            const previewContent = `当前提示词预览:\n\nAPI模式: ${apiMode}\n并行模式: ${isParallelEnabled ? parallelMode : '关闭'}\n强制章节标记: ${AppState.settings.forceChapterMarker ? '开启' : '关闭'}\n启用分类: ${enabledCats}\n\n【消息链 (${enabledChain.length}条消息)】\n${chainInfo}\n\n【章节强制标记示例】\n${chapterForce}\n\n【系统提示词】\n${prompt}`;

            const bodyHtml = `<textarea readonly style="width: 100%; height: 400px; resize: vertical; box-sizing: border-box; background: rgba(0,0,0,0.3); color: #ccc; border: 1px solid #555; padding: 10px; font-family: monospace; border-radius: 4px; white-space: pre-wrap;">${previewContent.replace(/</g, '&lt;').replace(/>/g, '&gt;')}</textarea>`;
            const footerHtml = '<button class="ttw-btn ttw-btn-primary" id="ttw-close-prompt-preview">关闭</button>';

            const modal = ModalFactory.create({
                id: 'ttw-prompt-preview-modal',
                title: '🔍 提示词预览',
                body: bodyHtml,
                footer: footerHtml,
                maxWidth: '800px',
            });

            modal.querySelector('#ttw-close-prompt-preview').addEventListener('click', () => {
                ModalFactory.close(modal);
            });
        } catch (error) {
            console.error('Preview error:', error);
            if (typeof ErrorHandler !== 'undefined' && ErrorHandler.showUserError) {
                ErrorHandler.showUserError(`预览失败: ${error.message}`);
            } else {
                alertAction({ title: '预览失败', message: `预览失败: ${error.message}` });
            }
        }
    }

    return {
        showPromptPreview,
    };
}
