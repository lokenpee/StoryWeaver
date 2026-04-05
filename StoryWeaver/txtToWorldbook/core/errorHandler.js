export function createErrorHandler(deps = {}) {
    const {
        Logger,
        ModalFactory,
        confirmAction,
    } = deps;

    return {
        handle(error, context = '') {
            Logger.error(context || 'App', error.message || error);

            if (error.message === 'ABORTED') {
                return { handled: true, message: '操作已取消' };
            }

            if (error.message?.startsWith('TOKEN_LIMIT:')) {
                return { handled: true, message: 'Token超限', isTokenLimit: true };
            }

            if (error.status || error.message?.includes('API') || error.message?.includes('请求')) {
                return this.handleAPIError(error);
            }

            if (error.message?.includes('network') || error.message?.includes('网络') || error.message?.includes('fetch')) {
                this.showUserError('网络连接失败，请检查网络设置');
                return { handled: true, message: '网络错误' };
            }

            this.showUserError(error.message || '未知错误');
            return { handled: false, message: error.message || '未知错误' };
        },

        handleAPIError(error) {
            const messages = {
                401: 'API Key 无效',
                403: '没有权限访问此API',
                404: 'API端点不存在',
                429: '请求过于频繁，请稍后重试',
                500: '服务器内部错误',
                502: '网关错误',
                503: '服务暂时不可用',
                504: '网关超时',
            };

            const status = error.status || this.extractStatus(error.message);
            const msg = messages[status] || error.message || `API错误 (${status || '未知'})`;
            this.showUserError(msg);
            return { handled: true, message: msg };
        },

        extractStatus(message) {
            if (!message) return null;
            const match = message.match(/\b(\d{3})\b/);
            return match ? parseInt(match[1], 10) : null;
        },

        showUserError(message) {
            const bodyNode = document.createElement('div');
            bodyNode.style.cssText = 'white-space: pre-wrap; word-wrap: break-word; font-family: monospace; color: #ff6b6b; padding: 10px;';
            bodyNode.textContent = String(message ?? '未知错误');

            const footerNode = document.createElement('button');
            footerNode.className = 'ttw-btn ttw-btn-primary';
            footerNode.id = 'ttw-close-error-modal';
            footerNode.type = 'button';
            footerNode.textContent = '我知道了';

            const modal = ModalFactory.create({
                id: 'ttw-error-modal',
                title: '❌ 错误',
                bodyNode,
                footerNode,
                maxWidth: '500px',
            });
            modal.querySelector('#ttw-close-error-modal').addEventListener('click', () => ModalFactory.close(modal));
        },

        showUserSuccess(message) {
            const existingToast = document.getElementById('ttw-success-toast');
            if (existingToast) existingToast.remove();

            const toast = document.createElement('div');
            toast.id = 'ttw-success-toast';
            toast.style.cssText = `
position: fixed; top: 20px; left: 50%; transform: translateX(-50%);
padding: 12px 24px; background: #27ae60; color: #fff;
border-radius: 8px; z-index: 999999; font-size: 14px;
box-shadow: 0 4px 12px rgba(0,0,0,0.3);
animation: ttw-toast-in 0.3s ease;
`;
            toast.textContent = message;
            document.body.appendChild(toast);

            setTimeout(() => {
                toast.style.animation = 'ttw-toast-out 0.3s ease';
                setTimeout(() => toast.remove(), 300);
            }, 2000);
        },

        confirmAsync(message, title = '确认') {
            return confirmAction(message, { title });
        },
    };
}
