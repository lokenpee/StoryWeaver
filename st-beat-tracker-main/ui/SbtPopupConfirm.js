// 文件: ui/SbtPopupConfirm.js

export class SbtPopupConfirm {
    constructor() {
        this.overlayElement = null;
        this.popupElement = null;
        this.textareaElement = null;
        this.resolvePromise = null;
        this.escapeKeyListener = this._handleEscapeKey.bind(this);
    }

    show(options) {
        return new Promise(resolve => {
            this.resolvePromise = resolve;
            this._createDOMElements(options);
            this._bindEvents(); // 只调用一次
            document.body.appendChild(this.overlayElement);
            requestAnimationFrame(() => {
                this.overlayElement.style.opacity = '1';
                this.popupElement.style.opacity = '1';
                this.popupElement.style.transform = 'scale(1)';
            });
        });
    }


_createDOMElements(options) {
    const {
        title, message, placeholder = '', initialValue = '',
        okText = '确认', cancelText = '取消', abcText = null, freeRoamText = null,
        checkboxLabel = null, checkboxDefault = false, checkboxHint = ''
    } = options;

    this.overlayElement = document.createElement('div');
    Object.assign(this.overlayElement.style, {
        position: 'fixed', top: '0', left: '0', width: '100vw', height: '100vh',
        backgroundColor: 'rgba(0, 0, 0, 0.7)',
        backdropFilter: 'blur(5px)',
        zIndex: '10000', display: 'flex', alignItems: 'center', justifyContent: 'center',
        opacity: '0', transition: 'opacity 0.25s ease-in-out',
    });

    this.popupElement = document.createElement('div');
    Object.assign(this.popupElement.style, {
        background: 'var(--sbt-bg-dark, #2a2f3b)', padding: '30px',
        borderRadius: '12px', border: '1px solid var(--sbt-border-color, #444)',
        boxShadow: '0 10px 35px rgba(0,0,0,0.5)', width: '90%', maxWidth: '600px',
        color: 'var(--sbt-text-light, #ebebeb)', fontFamily: 'sans-serif',
        opacity: '0', transform: 'scale(0.95)',
        transition: 'opacity 0.25s ease-out, transform 0.25s ease-out',
        display: 'flex', flexDirection: 'column', gap: '20px',
    });


    this.popupElement.innerHTML = `
        <div style="text-align: center;">
            <h4 style="margin: 0 0 10px 0; color: var(--sbt-primary-accent, #9ac8ff); font-size: 1.5em; font-weight: 600;">${title}</h4>
            <p style="margin: 0; font-size: 1em; color: var(--sbt-text-medium, #c5c5c5); line-height: 1.6;">${message}</p>
        </div>
        
        <textarea class="sbt-popup-textarea" style="width: 100%; height: 140px; resize: vertical; background: var(--sbt-bg-darker, #1c1f26); border: 1px solid var(--sbt-border-color, #444); color: inherit; border-radius: 6px; padding: 15px; font-size: 1em; box-sizing: border-box;"></textarea>
        ${checkboxLabel ? `
        <label style="display: flex; align-items: center; gap: 10px; font-size: 0.95em; color: var(--sbt-text-medium, #c5c5c5);">
            <input type="checkbox" class="sbt-popup-checkbox-input" ${checkboxDefault ? 'checked' : ''} />
            <span>${checkboxLabel}</span>
        </label>
        ${checkboxHint ? `<div style="font-size: 0.85em; color: var(--sbt-text-dim, #9aa1aa); margin-top: -10px;">${checkboxHint}</div>` : ''}
        ` : ''}
        
        <!-- 【布局核心】
             - 按钮容器依然是水平居中 (justify-content: center)。
             - 支持最多4个按钮：自由章、ABC、取消、确认
        -->
        <div class="sbt-popup-buttons" style="display: flex; justify-content: center; flex-wrap: wrap; gap: 15px; margin-top: 10px;">
            <button class="sbt-popup-cancel menu_button" style="padding: 12px 25px; min-width: 160px; text-align: center; order: 3;"></button>
            <button class="sbt-popup-ok menu_button menu_button_default" style="padding: 12px 25px; min-width: 160px; text-align: center; order: 4;"></button>
            ${freeRoamText ? `<button class="sbt-popup-freeroam menu_button" style="padding: 12px 25px; min-width: 160px; text-align: center; background-color: #4caf50; border-color: #4caf50; color: white; order: 1;"></button>` : ''}
            ${abcText ? `<button class="sbt-popup-abc menu_button" style="padding: 12px 25px; min-width: 160px; text-align: center; background-color: #e91e63; border-color: #e91e63; color: white; order: 2;"></button>` : ''}
        </div>
    `;
    

    this.textareaElement = this.popupElement.querySelector('.sbt-popup-textarea');
    this.checkboxElement = this.popupElement.querySelector('.sbt-popup-checkbox-input');
    this.okButton = this.popupElement.querySelector('.sbt-popup-ok');
    this.cancelButton = this.popupElement.querySelector('.sbt-popup-cancel');
    this.freeRoamButton = this.popupElement.querySelector('.sbt-popup-freeroam');
    this.abcButton = this.popupElement.querySelector('.sbt-popup-abc');

    this.textareaElement.placeholder = placeholder.replace(/<br>/g, '\n');
    this.textareaElement.value = initialValue;
    this.okButton.textContent = okText;
    this.cancelButton.textContent = cancelText;
    if (this.freeRoamButton) {
        this.freeRoamButton.textContent = freeRoamText;
    }
    if (this.abcButton) {
        this.abcButton.textContent = abcText;
    }

    this.overlayElement.appendChild(this.popupElement);
}

    _bindEvents() {
        // 常规按钮
        this.okButton.onclick = () => {
            const value = this.textareaElement.value.trim();
            const includeTranscript = this.checkboxElement ? this.checkboxElement.checked : false;
            this._resolveAndClose({ confirmed: true, value: value, freeRoam: false, abc: false, includeTranscript });
        };
        this.cancelButton.onclick = () => {
            const includeTranscript = this.checkboxElement ? this.checkboxElement.checked : false;
            this._resolveAndClose({ confirmed: false, value: 'ai_decides', freeRoam: false, abc: false, includeTranscript });
        };

        // 自由章按钮
        if (this.freeRoamButton) {
            this.freeRoamButton.onclick = () => {
                const value = this.textareaElement.value.trim();
                const includeTranscript = this.checkboxElement ? this.checkboxElement.checked : false;
                this._resolveAndClose({ confirmed: true, value: value, freeRoam: true, abc: false, includeTranscript });
            };
        }

        // ABC 沉浸流按钮
        if (this.abcButton) {
            this.abcButton.onclick = () => {
                const value = this.textareaElement.value.trim();
                const includeTranscript = this.checkboxElement ? this.checkboxElement.checked : false;
                this._resolveAndClose({ confirmed: true, value: value, freeRoam: false, abc: true, includeTranscript });
            };
        }

        document.addEventListener('keydown', this.escapeKeyListener);
    }

    _handleEscapeKey(event) {
        if (event.key === 'Escape') {
            const includeTranscript = this.checkboxElement ? this.checkboxElement.checked : false;
            this._resolveAndClose({ confirmed: false, value: 'ai_decides', freeRoam: false, abc: false, includeTranscript });
        }
    }
        _resolveAndClose(result) {
        if (!this.resolvePromise) return;
        document.removeEventListener('keydown', this.escapeKeyListener);
        this.resolvePromise(result);
        this.resolvePromise = null;
        this.overlayElement.style.opacity = '0';
        this.popupElement.style.opacity = '0';
        this.popupElement.style.transform = 'scale(0.95)';
        setTimeout(() => {
            if (this.overlayElement.parentNode) {
                this.overlayElement.parentNode.removeChild(this.overlayElement);
            }
        }, 250);
    }
}
