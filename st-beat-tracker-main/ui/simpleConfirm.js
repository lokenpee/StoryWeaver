// 文件: ui/simpleConfirm.js
// 简单的确认对话框,不包含文本输入框

export function simpleConfirm(title, message, okText = '确认', cancelText = '取消') {
    return new Promise(resolve => {
        // 创建遮罩层
        const overlay = document.createElement('div');
        Object.assign(overlay.style, {
            position: 'fixed',
            top: '0',
            left: '0',
            width: '100vw',
            height: '100vh',
            backgroundColor: 'rgba(0, 0, 0, 0.7)',
            backdropFilter: 'blur(5px)',
            zIndex: '10000',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            opacity: '0',
            transition: 'opacity 0.25s ease-in-out'
        });

        // 创建对话框
        const popup = document.createElement('div');
        Object.assign(popup.style, {
            background: 'var(--sbt-bg-dark, #2a2f3b)',
            padding: '30px',
            borderRadius: '12px',
            border: '1px solid var(--sbt-border-color, #444)',
            boxShadow: '0 10px 35px rgba(0,0,0,0.5)',
            width: '90%',
            maxWidth: '500px',
            color: 'var(--sbt-text-light, #ebebeb)',
            fontFamily: 'sans-serif',
            opacity: '0',
            transform: 'scale(0.95)',
            transition: 'opacity 0.25s ease-out, transform 0.25s ease-out',
            display: 'flex',
            flexDirection: 'column',
            gap: '25px'
        });

        popup.innerHTML = `
            <div style="text-align: center;">
                <h4 style="margin: 0 0 15px 0; color: var(--sbt-primary-accent, #9ac8ff); font-size: 1.4em; font-weight: 600;">${title}</h4>
                <p style="margin: 0; font-size: 1em; color: var(--sbt-text-medium, #c5c5c5); line-height: 1.6; white-space: pre-wrap;">${message}</p>
            </div>

            <div style="display: flex; justify-content: center; gap: 15px; margin-top: 10px;">
                <button class="simple-confirm-cancel menu_button" style="padding: 12px 25px; min-width: 120px;">${cancelText}</button>
                <button class="simple-confirm-ok menu_button menu_button_default" style="padding: 12px 25px; min-width: 120px;">${okText}</button>
            </div>
        `;

        const okButton = popup.querySelector('.simple-confirm-ok');
        const cancelButton = popup.querySelector('.simple-confirm-cancel');

        const close = (confirmed) => {
            overlay.style.opacity = '0';
            popup.style.opacity = '0';
            popup.style.transform = 'scale(0.95)';

            setTimeout(() => {
                if (overlay.parentNode) {
                    overlay.parentNode.removeChild(overlay);
                }
                resolve(confirmed);
            }, 250);
        };

        okButton.onclick = () => close(true);
        cancelButton.onclick = () => close(false);

        // ESC 键关闭
        const escapeHandler = (e) => {
            if (e.key === 'Escape') {
                document.removeEventListener('keydown', escapeHandler);
                close(false);
            }
        };
        document.addEventListener('keydown', escapeHandler);

        overlay.appendChild(popup);
        document.body.appendChild(overlay);

        requestAnimationFrame(() => {
            overlay.style.opacity = '1';
            popup.style.opacity = '1';
            popup.style.transform = 'scale(1)';
        });
    });
}
