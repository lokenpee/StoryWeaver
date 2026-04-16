export function ensureModalStyles() {
    if (document.getElementById('ttw-styles')) return;
    const styles = document.createElement('style');
    styles.id = 'ttw-styles';
    styles.textContent = `
        /* ============================================
              WestWorld TXT Converter - 深色主题样式
           与外部抽屉组件保持一致的设计风格
           ============================================ */
        
        /* --- CSS 变量定义 --- */
        :root {
            --ttw-bg-darker: #0b0b0c;
            --ttw-bg-dark: #131315;
            --ttw-bg-medium: #18181b;
            --ttw-bg-light: #1f1f23;
            --ttw-bg-input: #0e0e10;
            --ttw-border-color: #27272a;
            --ttw-border-highlight: #3f3f46;
            --ttw-text-primary: #f4f4f5;
            --ttw-text-secondary: #c2c2c8;
            --ttw-text-muted: #8e8e99;
            --ttw-accent-blue: #2563eb;
            --ttw-accent-blue-hover: #3b82f6;
            --ttw-accent-green: #30d158;
            --ttw-accent-orange: #ff9f0a;
            --ttw-accent-red: #dc2626;
            --ttw-accent-purple: #bf5af2;
        }
        
        /* --- 模态框容器 --- */
        .ttw-modal-container {
            position: fixed;
            top: 0;
            left: 0;
            width: 100vw;
            height: 100vh;
            background: rgba(0, 0, 0, 0.75);
            display: flex;
            align-items: center;
            justify-content: center;
            z-index: 99999;
            padding: 20px;
            box-sizing: border-box;
        }
        
        /* --- 模态框主体 --- */
        .ttw-modal {
            background: var(--ttw-bg-dark);
            border: 1px solid var(--ttw-border-color);
            border-radius: 12px;
            width: 100%;
            max-width: 980px;
            max-height: 90vh;
            display: flex;
            flex-direction: column;
            box-shadow: 0 24px 64px rgba(0, 0, 0, 0.85);
            overflow: hidden;
        }
        
        /* --- 模态框头部 --- */
        .ttw-modal-header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            padding: 14px 18px;
            border-bottom: 1px solid var(--ttw-border-color);
            background: var(--ttw-bg-medium);
        }
        
        .ttw-modal-title {
            font-weight: 600;
            font-size: 1.05em;
            color: var(--ttw-text-primary);
            display: flex;
            align-items: center;
        }
        
        .ttw-header-actions {
            display: flex;
            align-items: center;
            gap: 8px;
        }
        
        .ttw-help-btn {
            display: inline-flex;
            align-items: center;
            justify-content: center;
            width: 32px;
            height: 32px;
            border-radius: 8px;
            background: transparent;
            color: var(--ttw-text-secondary);
            font-size: 14px;
            cursor: pointer;
            transition: all 0.15s ease;
            border: 1px solid transparent;
        }
        
        .ttw-help-btn:hover {
            background: var(--ttw-bg-light);
            border-color: var(--ttw-border-color);
            color: var(--ttw-text-primary);
        }
        
        .ttw-modal-close {
            background: transparent;
            border: 1px solid var(--ttw-border-color);
            color: var(--ttw-text-secondary);
            font-size: 18px;
            width: 32px;
            height: 32px;
            border-radius: 8px;
            cursor: pointer;
            transition: all 0.15s ease;
            display: flex;
            align-items: center;
            justify-content: center;
        }
        
        .ttw-modal-close:hover {
            background: rgba(220, 38, 38, 0.2);
            color: var(--ttw-accent-red);
        }
        
        /* --- 模态框内容区 --- */
        .ttw-modal-body {
            flex: 1;
            overflow-y: auto;
            padding: 14px 16px 6px;
        }

        .ttw-view-nav {
            display: flex;
            gap: 6px;
            margin-bottom: 14px;
            padding: 10px 14px 0;
            border: 1px solid var(--ttw-border-color);
            border-radius: 8px 8px 0 0;
            background: var(--ttw-bg-medium);
            border-bottom: 0;
            flex-wrap: wrap;
        }

        .ttw-view-tab {
            border: 1px solid transparent;
            border-bottom: none;
            background: transparent;
            color: var(--ttw-text-muted);
            border-radius: 8px 8px 0 0;
            padding: 8px 12px;
            cursor: pointer;
            font-size: 13px;
            transition: all 0.15s ease;
        }

        .ttw-view-tab:hover {
            background: var(--ttw-bg-light);
            color: var(--ttw-text-primary);
        }

        .ttw-view-tab.active {
            background: var(--ttw-bg-dark);
            border-color: var(--ttw-border-color);
            color: var(--ttw-text-primary);
            font-weight: 600;
            box-shadow: none;
        }
        
        .ttw-modal-footer {
            padding: 12px 16px;
            border-top: 1px solid var(--ttw-border-color);
            background: var(--ttw-bg-medium);
            display: flex;
            justify-content: flex-end;
            gap: 10px;
        }
        
        /* --- 卡片式区块 --- */
        .ttw-section {
            background: transparent;
            border: 1px solid var(--ttw-border-color);
            border-radius: 8px;
            margin-bottom: 14px;
            overflow: hidden;
        }
        
        .ttw-section-header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            padding: 10px 12px;
            background: var(--ttw-bg-medium);
            font-weight: 600;
            font-size: 14px;
            color: var(--ttw-text-primary);
            transition: background 0.2s ease;
        }
        
        .ttw-section-header:hover {
            background: var(--ttw-bg-light);
        }
        
        .ttw-section-content {
            padding: 12px;
            background: var(--ttw-bg-dark);
        }
        
        .ttw-collapse-icon {
            font-size: 12px;
            transition: transform 0.25s ease;
            color: var(--ttw-text-muted);
        }
        
        .ttw-section.collapsed .ttw-collapse-icon {
            transform: rotate(-90deg);
        }
        
        .ttw-section.collapsed .ttw-section-content {
            display: none;
        }
        
        /* --- 表单元素 --- */
        .ttw-input, .ttw-select, .ttw-textarea, .ttw-textarea-small, .ttw-input-small {
            background: var(--ttw-bg-input);
            border: 1px solid var(--ttw-border-color);
            border-radius: 6px;
            color: var(--ttw-text-primary);
            font-size: 13px;
            box-sizing: border-box;
            transition: all 0.2s ease;
        }
        
        .ttw-input {
            width: 100%;
            padding: 8px 10px;
        }
        
        .ttw-input-small {
            width: 70px;
            padding: 8px 10px;
            text-align: center;
        }
        
        .ttw-select {
            width: 100%;
            padding: 8px 10px;
            cursor: pointer;
        }
        
        .ttw-select option {
            background: var(--ttw-bg-dark);
            color: var(--ttw-text-primary);
        }
        
        .ttw-textarea {
            width: 100%;
            min-height: 280px;
            padding: 14px;
            line-height: 1.6;
            resize: vertical;
            font-family: inherit;
        }
        
        .ttw-textarea-small {
            width: 100%;
            min-height: 70px;
            padding: 8px 10px;
            font-family: 'Consolas', 'Monaco', monospace;
            font-size: 13px;
            line-height: 1.5;
            resize: vertical;
        }
        
        .ttw-input:focus, .ttw-select:focus, .ttw-textarea:focus, .ttw-textarea-small:focus {
            outline: none;
            border-color: var(--ttw-accent-blue);
            box-shadow: none;
        }
        
        .ttw-label {
            display: block;
            margin-bottom: 8px;
            font-size: 13px;
            font-weight: 500;
            color: var(--ttw-text-secondary);
        }
        
        .ttw-setting-hint {
            font-size: 12px;
            color: var(--ttw-text-muted);
            margin-top: 6px;
            line-height: 1.4;
        }
        
        /* --- 设置卡片 --- */
        .ttw-setting-card {
            margin-bottom: 16px;
            padding: 16px;
            border-radius: 10px;
            border: 1px solid var(--ttw-border-color);
        }
        
        .ttw-setting-card-green {
            background: rgba(48, 209, 88, 0.08);
            border-color: rgba(48, 209, 88, 0.25);
        }
        
        .ttw-setting-card-blue {
            background: rgba(10, 132, 255, 0.08);
            border-color: rgba(10, 132, 255, 0.25);
        }

        .ttw-api-tab.active {
            background: linear-gradient(135deg, var(--ttw-accent-blue), #0077ed);
            border-color: var(--ttw-accent-blue);
            color: #fff;
        }

        .ttw-api-card {
            padding: 10px;
            border: 1px solid rgba(255, 255, 255, 0.12);
            border-radius: 8px;
            background: rgba(0, 0, 0, 0.16);
        }
        
        /* --- 复选框样式 --- */
        .ttw-checkbox-label {
            display: flex;
            align-items: center;
            gap: 12px;
            cursor: pointer;
            font-size: 14px;
            color: var(--ttw-text-primary);
        }
        
        .ttw-checkbox-label input[type="checkbox"] {
            width: 20px;
            height: 20px;
            accent-color: var(--ttw-accent-blue);
            flex-shrink: 0;
            cursor: pointer;
        }
        
        .ttw-checkbox-with-hint {
            padding: 12px 16px;
            background: rgba(0, 0, 0, 0.2);
            border-radius: 8px;
            border: 1px solid var(--ttw-border-color);
        }
        
        .ttw-checkbox-purple {
            background: rgba(191, 90, 242, 0.08);
            border: 1px solid rgba(191, 90, 242, 0.25);
        }
        
        .ttw-volume-indicator {
            display: none;
            margin-top: 12px;
            padding: 10px 14px;
            background: rgba(191, 90, 242, 0.15);
            border-radius: 8px;
            font-size: 13px;
            color: var(--ttw-accent-purple);
            border: 1px solid rgba(191, 90, 242, 0.2);
        }
        
        /* --- 提示词配置区 --- */
        .ttw-prompt-config {
            margin-top: 16px;
            border: 1px solid var(--ttw-border-color);
            border-radius: 10px;
            overflow: hidden;
        }

        .ttw-prompt-config-content {
            padding: 12px 12px 6px 22px;
        }
        
        .ttw-prompt-config-header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            padding: 14px 16px;
            background: var(--ttw-bg-medium);
            border-bottom: 1px solid var(--ttw-border-color);
            font-weight: 600;
            flex-wrap: wrap;
            gap: 10px;
        }
        
        .ttw-prompt-section {
            border: 1px solid var(--ttw-border-color);
            border-radius: 8px;
            overflow: hidden;
            margin-bottom: 10px;
            background: var(--ttw-bg-dark);
        }
        
        .ttw-prompt-section:last-child {
            margin-bottom: 0;
        }
        
        .ttw-prompt-header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            padding: 10px 12px;
            cursor: pointer;
            font-size: 13px;
            transition: all 0.2s ease;
            font-weight: 500;
            background: var(--ttw-bg-medium);
            color: var(--ttw-text-primary);
        }
        
        .ttw-prompt-header:hover {
            background: var(--ttw-bg-light);
        }
        
        .ttw-prompt-content {
            display: none;
            padding: 12px;
            background: var(--ttw-bg-dark);
        }
        
        /* --- 标签徽章 --- */
        .ttw-badge {
            font-size: 11px;
            padding: 2px 8px;
            border-radius: 10px;
            font-weight: 500;
        }
        
        .ttw-badge-blue {
            background: rgba(37, 99, 235, 0.15);
            color: #93bbff;
        }
        
        .ttw-badge-gray {
            background: rgba(255, 255, 255, 0.08);
            color: var(--ttw-text-muted);
        }
        
        /* --- 文件上传区 --- */
        .ttw-upload-area {
            border: 2px dashed var(--ttw-border-highlight);
            border-radius: 10px;
            padding: 28px;
            text-align: center;
            cursor: pointer;
            transition: all 0.25s ease;
            background: var(--ttw-bg-medium);
        }
        
        .ttw-upload-area:hover {
            border-color: var(--ttw-accent-blue);
            background: var(--ttw-bg-light);
        }
        
        .ttw-upload-area i {
            font-size: 48px;
            color: var(--ttw-text-muted);
            margin-bottom: 12px;
            display: block;
        }
        
        .ttw-upload-area:hover i {
            color: var(--ttw-accent-blue);
        }
        
        .ttw-file-info {
            display: none;
            align-items: center;
            gap: 14px;
            padding: 14px 16px;
            background: var(--ttw-bg-medium);
            border-radius: 8px;
            margin-top: 16px;
            border: 1px solid var(--ttw-border-color);
        }

        .ttw-clean-repeat-inline {
            margin-top: 12px;
            padding: 12px;
            border-radius: 8px;
            border: 1px solid rgba(46, 204, 113, 0.28);
            background: rgba(46, 204, 113, 0.08);
        }

        .ttw-clean-repeat-inline-head {
            display: flex;
            align-items: center;
            justify-content: space-between;
            gap: 10px;
            margin-bottom: 6px;
        }

        .ttw-clean-repeat-inline-title {
            font-size: 13px;
            font-weight: 600;
            color: #d6ffe6;
        }

        .ttw-clean-repeat-inline-badge {
            font-size: 11px;
            color: #8de9b6;
            background: rgba(0, 0, 0, 0.25);
            border: 1px solid rgba(141, 233, 182, 0.25);
            border-radius: 999px;
            padding: 3px 8px;
            white-space: nowrap;
        }

        .ttw-clean-repeat-inline-range {
            display: flex;
            gap: 14px;
            flex-wrap: wrap;
            margin-top: 8px;
            margin-bottom: 8px;
            font-size: 12px;
            color: var(--ttw-text-secondary);
        }

        .ttw-clean-repeat-inline-range label {
            display: inline-flex;
            align-items: center;
            gap: 6px;
            cursor: pointer;
        }

        .ttw-clean-repeat-inline-actions {
            display: flex;
            gap: 8px;
            flex-wrap: wrap;
        }

        .ttw-clean-repeat-inline-results {
            margin-top: 10px;
            padding: 10px;
            border-radius: 6px;
            border: 1px solid rgba(255, 255, 255, 0.1);
            background: rgba(0, 0, 0, 0.2);
        }
        
        /* --- 记忆队列 --- */
        .ttw-memory-queue {
            max-height: 220px;
            overflow-y: auto;
            background: rgba(8, 8, 10, 0.78);
            border-radius: 8px;
            padding: 10px;
            border: 1px solid rgba(255, 255, 255, 0.12);
        }
        
        .ttw-memory-item {
            padding: 10px 14px;
            background: rgba(255, 255, 255, 0.03);
            border-radius: 6px;
            margin-bottom: 8px;
            font-size: 14px;
            display: flex;
            align-items: center;
            gap: 10px;
            cursor: pointer;
            transition: all 0.2s ease;
            border: 1px solid rgba(255, 255, 255, 0.08);
            color: var(--ttw-text-primary);
        }
        
        .ttw-memory-item:hover {
            background: rgba(255, 255, 255, 0.07);
            border-color: rgba(255, 255, 255, 0.16);
        }
        
        .ttw-memory-item.multi-select-mode {
            cursor: default;
        }
        
        .ttw-memory-item.selected-for-delete {
            background: rgba(255, 255, 255, 0.09);
            border-color: rgba(255, 255, 255, 0.24);
        }
        
        /* --- 进度条 --- */
        .ttw-progress-bar {
            width: 100%;
            height: 10px;
            background: var(--ttw-bg-medium);
            border-radius: 5px;
            overflow: hidden;
            margin-bottom: 14px;
            border: 1px solid var(--ttw-border-color);
        }
        
        .ttw-progress-fill {
            height: 100%;
            background: var(--ttw-accent-blue);
            border-radius: 5px;
            transition: width 0.4s ease;
            width: 0%;
        }
        
        .ttw-progress-text {
            font-size: 14px;
            text-align: center;
            margin-bottom: 14px;
            color: var(--ttw-text-secondary);
            font-weight: 500;
        }
        
        .ttw-progress-controls {
            display: flex;
            gap: 12px;
            justify-content: center;
            flex-wrap: wrap;
        }
        
        /* --- 流式输出容器 --- */
        .ttw-stream-container {
            display: none;
            margin-top: 16px;
            border: 1px solid var(--ttw-border-color);
            border-radius: 8px;
            overflow: hidden;
        }
        
        .ttw-stream-header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            padding: 10px 14px;
            background: rgba(0, 0, 0, 0.3);
            font-size: 13px;
            color: var(--ttw-text-secondary);
        }
        
        .ttw-stream-content {
            max-height: 220px;
            overflow-y: auto;
            padding: 14px;
            background: rgba(0, 0, 0, 0.2);
            font-size: 12px;
            line-height: 1.6;
            white-space: pre-wrap;
            word-break: break-all;
            margin: 0;
            font-family: 'Consolas', 'Monaco', monospace;
            color: var(--ttw-text-secondary);
        }
        
        /* --- 结果预览 --- */
        .ttw-result-preview {
            max-height: 350px;
            overflow-y: auto;
            background: rgba(8, 8, 10, 0.78);
            border-radius: 8px;
            padding: 16px;
            margin-bottom: 16px;
            font-size: 13px;
            border: 1px solid rgba(255, 255, 255, 0.12);
            line-height: 1.6;
            color: var(--ttw-text-primary);
        }

        .ttw-result-preview small,
        .ttw-result-preview .ttw-entry-meta {
            color: var(--ttw-text-secondary);
        }
        
        .ttw-result-actions {
            display: flex;
            flex-wrap: wrap;
            gap: 12px;
        }

        .ttw-story-panel {
            margin-top: 16px;
            border: 1px solid var(--ttw-border-color);
            border-radius: 10px;
            padding: 14px;
            background: rgba(0, 0, 0, 0.2);
        }

        .ttw-story-panel-header {
            display: flex;
            align-items: center;
            justify-content: space-between;
            gap: 10px;
            margin-bottom: 12px;
        }

        .ttw-story-panel-header h4 {
            margin: 0;
            font-size: 14px;
            color: var(--ttw-text-primary);
        }

        .ttw-current-panel-actions {
            display: flex;
            align-items: center;
            justify-content: flex-end;
            gap: 8px;
            flex-wrap: wrap;
        }

        .ttw-current-panel-actions .ttw-btn {
            white-space: nowrap;
        }

        .ttw-story-outline-list {
            display: flex;
            flex-direction: column;
            gap: 10px;
        }

        .ttw-outline-item {
            border: 1px solid var(--ttw-border-color);
            border-radius: 8px;
            overflow: hidden;
            background: rgba(255, 255, 255, 0.03);
        }

        .ttw-outline-toggle {
            width: 100%;
            border: none;
            background: rgba(255, 255, 255, 0.04);
            color: var(--ttw-text-primary);
            display: flex;
            justify-content: space-between;
            align-items: center;
            gap: 12px;
            padding: 10px 12px;
            cursor: pointer;
            text-align: left;
        }

        .ttw-outline-toggle:hover {
            background: rgba(255, 255, 255, 0.08);
        }

        .ttw-outline-title {
            font-size: 13px;
            font-weight: 600;
            overflow: hidden;
            text-overflow: ellipsis;
            white-space: nowrap;
        }

        .ttw-outline-body {
            padding: 10px 12px;
            border-top: 1px solid var(--ttw-border-color);
            display: flex;
            flex-direction: column;
            gap: 10px;
        }

        .ttw-outline-summary {
            font-size: 13px;
            line-height: 1.6;
            color: var(--ttw-text-secondary);
            white-space: pre-wrap;
        }

        .ttw-outline-status {
            font-size: 11px;
            border-radius: 999px;
            padding: 2px 8px;
            flex-shrink: 0;
        }

        .ttw-outline-status-done {
            background: rgba(48, 209, 88, 0.2);
            color: var(--ttw-accent-green);
        }

        .ttw-outline-status-generating {
            background: rgba(10, 132, 255, 0.2);
            color: var(--ttw-accent-blue);
        }

        .ttw-outline-status-failed {
            background: rgba(255, 69, 58, 0.2);
            color: var(--ttw-accent-red);
        }

        .ttw-outline-status-pending {
            background: rgba(255, 255, 255, 0.14);
            color: var(--ttw-text-secondary);
        }

        .ttw-outline-empty {
            font-size: 13px;
            color: var(--ttw-text-muted);
            text-align: center;
            padding: 24px 10px;
        }

        .ttw-current-hint {
            font-size: 12px;
            color: var(--ttw-text-muted);
            margin-bottom: 10px;
        }

        .ttw-current-block {
            border: 1px solid var(--ttw-border-color);
            border-radius: 8px;
            padding: 10px 12px;
            margin-bottom: 10px;
            background: rgba(255, 255, 255, 0.03);
        }

        .ttw-current-block-title {
            font-size: 12px;
            color: var(--ttw-text-secondary);
            margin-bottom: 6px;
            font-weight: 600;
        }

        .ttw-current-block-content {
            font-size: 13px;
            line-height: 1.65;
            color: var(--ttw-text-primary);
            white-space: pre-wrap;
        }

        .ttw-script-block ul {
            margin: 6px 0 0;
            padding-left: 18px;
        }

        .ttw-script-empty {
            color: var(--ttw-text-muted);
            font-size: 12px;
        }

        .ttw-beat-list {
            display: flex;
            flex-direction: column;
            gap: 8px;
            margin-top: 6px;
        }

        .ttw-beat-item {
            border: 1px solid var(--ttw-border-color);
            border-radius: 8px;
            padding: 8px 10px;
            background: rgba(255, 255, 255, 0.02);
        }

        .ttw-beat-item.is-active {
            border-color: rgba(10, 132, 255, 0.6);
            background: rgba(10, 132, 255, 0.08);
            box-shadow: inset 0 0 0 1px rgba(10, 132, 255, 0.2);
        }

        .ttw-beat-item-head {
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-bottom: 4px;
        }

        .ttw-beat-id {
            font-size: 11px;
            color: var(--ttw-text-secondary);
            font-weight: 600;
        }

        .ttw-beat-active {
            font-size: 11px;
            color: var(--ttw-accent-blue);
            background: rgba(10, 132, 255, 0.16);
            border-radius: 10px;
            padding: 1px 8px;
        }

        .ttw-beat-summary {
            font-size: 13px;
            color: var(--ttw-text-primary);
            line-height: 1.55;
            margin-bottom: 4px;
        }

        .ttw-beat-line {
            font-size: 12px;
            color: var(--ttw-text-primary);
            line-height: 1.58;
            margin-bottom: 4px;
            white-space: pre-wrap;
            word-break: break-word;
        }

        .ttw-beat-exit {
            font-size: 11px;
            color: var(--ttw-text-muted);
            line-height: 1.5;
        }

        .ttw-beat-tags {
            margin-top: 5px;
            display: flex;
            flex-wrap: wrap;
            gap: 4px;
        }

        .ttw-beat-tag {
            font-size: 10px;
            color: var(--ttw-text-secondary);
            border: 1px solid rgba(255, 255, 255, 0.16);
            border-radius: 10px;
            padding: 0 6px;
            line-height: 1.7;
        }

        .ttw-beat-details {
            margin-top: 8px;
            border: 1px solid rgba(255, 255, 255, 0.12);
            border-radius: 8px;
            background: rgba(0, 0, 0, 0.18);
            overflow: hidden;
        }

        .ttw-beat-details-summary {
            cursor: pointer;
            list-style: none;
            padding: 6px 10px;
            font-size: 11px;
            color: var(--ttw-text-secondary);
            user-select: none;
        }

        .ttw-beat-details-summary::-webkit-details-marker {
            display: none;
        }

        .ttw-beat-details-summary::before {
            content: '▸';
            display: inline-block;
            margin-right: 6px;
            transition: transform 0.2s ease;
            color: var(--ttw-text-muted);
        }

        .ttw-beat-details[open] .ttw-beat-details-summary::before {
            transform: rotate(90deg);
        }

        .ttw-beat-details-body {
            border-top: 1px solid rgba(255, 255, 255, 0.08);
            padding: 8px 10px;
            display: flex;
            flex-direction: column;
            gap: 6px;
        }

        .ttw-beat-rule {
            font-size: 11px;
            line-height: 1.5;
            color: var(--ttw-accent-blue);
        }

        .ttw-beat-item {
            border: 1px solid var(--ttw-border-color);
            border-radius: 8px;
            padding: 10px 12px;
            background: rgba(255, 255, 255, 0.02);
            display: flex;
            flex-direction: column;
            gap: 6px;
        }

        .ttw-beat-item.is-active {
            border-color: rgba(10, 132, 255, 0.6);
            background: rgba(10, 132, 255, 0.08);
            box-shadow: inset 0 0 0 1px rgba(10, 132, 255, 0.2);
        }

        .ttw-beat-item-head {
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-bottom: 2px;
        }

        .ttw-beat-line {
            font-size: 12px;
            color: var(--ttw-text-primary);
            line-height: 1.55;
            white-space: pre-wrap;
            word-break: break-word;
        }

        .ttw-beat-summary-line {
            font-size: 13px;
            font-weight: 500;
            color: var(--ttw-text-primary);
            line-height: 1.6;
        }

        .ttw-beat-entry-line {
            font-size: 12px;
            color: var(--ttw-text-secondary);
            line-height: 1.5;
        }

        .ttw-beat-exit-line {
            font-size: 12px;
            color: var(--ttw-text-muted);
            line-height: 1.5;
        }

        .ttw-beat-original {
            font-size: 12px;
            line-height: 1.7;
            color: var(--ttw-text-primary);
            white-space: pre-wrap;
            word-break: break-word;
            max-height: 220px;
            overflow-y: auto;
            padding: 8px 10px;
            margin-top: 4px;
            background: rgba(0, 0, 0, 0.18);
            border-radius: 6px;
            border-left: 3px solid var(--ttw-border-color);
        }

        .ttw-chapter-editor-modal {
            display: flex;
            flex-direction: column;
            gap: 12px;
        }

        .ttw-chapter-editor-tip {
            font-size: 12px;
            line-height: 1.5;
            color: var(--ttw-text-secondary);
            border: 1px solid rgba(10, 132, 255, 0.32);
            background: rgba(10, 132, 255, 0.12);
            border-radius: 8px;
            padding: 8px 10px;
        }

        .ttw-chapter-editor-grid {
            display: grid;
            grid-template-columns: repeat(2, minmax(0, 1fr));
            gap: 10px;
        }

        .ttw-editor-field {
            display: flex;
            flex-direction: column;
            gap: 6px;
        }

        .ttw-editor-field-label {
            font-size: 12px;
            color: var(--ttw-text-secondary);
            font-weight: 600;
        }

        .ttw-editor-textarea,
        .ttw-editor-input,
        .ttw-editor-select {
            width: 100%;
            box-sizing: border-box;
            border: 1px solid var(--ttw-border-color);
            border-radius: 8px;
            background: rgba(0, 0, 0, 0.24);
            color: var(--ttw-text-primary);
            padding: 8px 10px;
            font-size: 12px;
            line-height: 1.5;
            outline: none;
        }

        .ttw-editor-textarea:focus,
        .ttw-editor-input:focus,
        .ttw-editor-select:focus {
            border-color: rgba(10, 132, 255, 0.62);
            box-shadow: 0 0 0 2px rgba(10, 132, 255, 0.15);
        }

        .ttw-editor-beat-header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            gap: 8px;
            margin-top: 4px;
        }

        .ttw-beat-editor-card {
            border: 1px solid var(--ttw-border-color);
            border-radius: 10px;
            padding: 10px;
            background: rgba(255, 255, 255, 0.02);
            margin-top: 8px;
            display: flex;
            flex-direction: column;
            gap: 8px;
        }

        .ttw-beat-editor-head {
            display: flex;
            justify-content: space-between;
            align-items: center;
            gap: 8px;
        }

        .ttw-beat-editor-head-actions {
            display: flex;
            align-items: center;
            gap: 8px;
        }

        .ttw-beat-current-label {
            font-size: 12px;
            color: var(--ttw-text-secondary);
            display: inline-flex;
            align-items: center;
            gap: 4px;
        }

        .ttw-editor-empty {
            border: 1px dashed var(--ttw-border-color);
            border-radius: 8px;
            color: var(--ttw-text-muted);
            font-size: 12px;
            text-align: center;
            padding: 14px;
            margin-top: 8px;
        }

        @media (max-width: 900px) {
            .ttw-story-panel-header {
                align-items: flex-start;
                flex-direction: column;
            }

            .ttw-current-panel-actions {
                width: 100%;
                justify-content: flex-start;
            }

            .ttw-chapter-editor-grid {
                grid-template-columns: 1fr;
            }

            .ttw-beat-editor-head {
                flex-direction: column;
                align-items: flex-start;
            }
        }
        
        /* --- 按钮样式 --- */
        .ttw-btn {
            padding: 7px 12px;
            border: 1px solid var(--ttw-border-color);
            border-radius: 6px;
            background: var(--ttw-bg-medium);
            color: var(--ttw-text-primary);
            font-size: 13px;
            cursor: pointer;
            transition: all 0.15s ease;
            display: inline-flex;
            align-items: center;
            justify-content: center;
            gap: 6px;
        }
        
        .ttw-btn:hover {
            background: var(--ttw-bg-light);
            border-color: var(--ttw-border-highlight);
        }
        
        .ttw-btn:disabled {
            opacity: 0.4;
            cursor: not-allowed;
            transform: none;
        }
        
        .ttw-btn-primary {
            background: var(--ttw-accent-blue);
            border-color: transparent;
            color: #fff;
            font-weight: 600;
        }
        
        .ttw-btn-primary:hover {
            background: var(--ttw-accent-blue-hover);
        }
        
        .ttw-btn-secondary {
            background: rgba(255, 255, 255, 0.1);
            border-color: var(--ttw-border-color);
        }
        
        .ttw-btn-secondary:hover {
            background: rgba(255, 255, 255, 0.15);
        }
        
        .ttw-btn-warning {
            background: rgba(220, 38, 38, 0.12);
            border-color: rgba(220, 38, 38, 0.5);
            color: var(--ttw-text-primary);
        }
        
        .ttw-btn-warning:hover {
            background: rgba(220, 38, 38, 0.2);
        }
        
        .ttw-btn-small {
            padding: 5px 10px;
            font-size: 12px;
            border: 1px solid var(--ttw-border-color);
            border-radius: 6px;
            background: var(--ttw-bg-medium);
            color: var(--ttw-text-primary);
            cursor: pointer;
            transition: all 0.2s ease;
            font-weight: 500;
        }
        
        .ttw-btn-small:hover {
            background: rgba(255, 255, 255, 0.12);
        }
        
        .ttw-btn-tiny {
            padding: 4px 8px;
            font-size: 12px;
            border: none;
            background: rgba(255, 255, 255, 0.1);
            color: var(--ttw-text-primary);
            cursor: pointer;
            border-radius: 4px;
            transition: all 0.2s ease;
        }
        
        .ttw-btn-tiny:hover {
            background: rgba(255, 255, 255, 0.15);
        }
        
        .ttw-btn-tiny:disabled {
            opacity: 0.3;
            cursor: not-allowed;
        }
        
        /* --- 分类列表 --- */
        .ttw-category-flat-card {
            padding: 10px 12px;
            border-radius: 8px;
            margin-bottom: 10px;
            background: var(--ttw-bg-medium);
            border: 1px solid var(--ttw-border-color);
        }

        .ttw-category-flat-header {
            font-size: 13px;
            font-weight: 600;
            margin-bottom: 8px;
            color: var(--ttw-text-primary);
        }

        .ttw-categories-list {
            display: flex;
            flex-wrap: wrap;
            gap: 6px;
        }
        
        .ttw-category-item {
            display: inline-flex;
            align-items: center;
            gap: 6px;
            margin: 0;
            padding: 8px 10px;
            background: var(--ttw-bg-dark);
            border-radius: 6px;
            border: 1px solid var(--ttw-border-color);
            transition: all 0.2s ease;
            cursor: pointer;
        }
        
        .ttw-category-item:hover {
            background: var(--ttw-bg-light);
        }
        
        .ttw-category-item input[type="checkbox"] {
            width: 16px;
            height: 16px;
            margin: 0;
            accent-color: var(--ttw-accent-blue);
        }
        
        .ttw-category-name {
            font-size: 13px;
            color: var(--ttw-text-primary);
        }
        
        .ttw-category-actions {
            display: none;
        }
        
        /* --- 默认条目列表 --- */
        .ttw-default-entries-list {
            max-height: 200px;
            overflow-y: auto;
            background: rgba(0, 0, 0, 0.2);
            border-radius: 8px;
            padding: 10px;
            border: 1px solid var(--ttw-border-color);
        }
        
        .ttw-default-entry-item {
            padding: 12px;
            background: rgba(255, 255, 255, 0.05);
            border-radius: 6px;
            margin-bottom: 8px;
            border-left: 3px solid var(--ttw-accent-green);
            transition: all 0.2s ease;
        }
        
        .ttw-default-entry-item:hover {
            background: rgba(255, 255, 255, 0.08);
        }
        
        .ttw-default-entry-header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-bottom: 6px;
        }
        
        .ttw-default-entry-title {
            font-size: 14px;
            font-weight: 600;
            color: var(--ttw-accent-green);
        }
        
        .ttw-default-entry-actions {
            display: flex;
            gap: 6px;
        }
        
        .ttw-default-entry-info {
            font-size: 12px;
            color: var(--ttw-text-muted);
        }
        
        /* --- 表单组 --- */
        .ttw-form-group {
            margin-bottom: 16px;
        }
        
        .ttw-form-group > label {
            display: block;
            margin-bottom: 8px;
            font-size: 13px;
            font-weight: 500;
            color: var(--ttw-text-secondary);
        }
        
        /* --- 合并选项 --- */
        .ttw-merge-option {
            display: flex;
            align-items: center;
            gap: 12px;
            padding: 14px;
            background: rgba(0, 0, 0, 0.2);
            border-radius: 8px;
            cursor: pointer;
            border: 1px solid var(--ttw-border-color);
            transition: all 0.2s ease;
        }
        
        .ttw-merge-option:hover {
            background: rgba(0, 0, 0, 0.25);
            border-color: var(--ttw-accent-blue);
        }
        
        .ttw-merge-option input {
            width: 20px;
            height: 20px;
            accent-color: var(--ttw-accent-blue);
        }
        
        /* --- Roll 历史 --- */
        .ttw-roll-history-container, .ttw-history-container {
            display: flex;
            gap: 14px;
            height: 420px;
        }
        
        .ttw-roll-history-left, .ttw-history-left {
            width: 110px;
            min-width: 110px;
            max-width: 110px;
            display: flex;
            flex-direction: column;
            gap: 10px;
            overflow: hidden;
        }
        
        .ttw-roll-history-right, .ttw-history-right {
            flex: 1;
            overflow-y: auto;
            background: rgba(0, 0, 0, 0.2);
            border-radius: 10px;
            padding: 16px;
            border: 1px solid var(--ttw-border-color);
        }
        
        .ttw-roll-reroll-btn {
            width: 100%;
            padding: 10px 6px !important;
            font-size: 12px !important;
        }
        
        .ttw-roll-list {
            flex: 1;
            overflow-y: auto;
            display: flex;
            flex-direction: column;
            gap: 8px;
        }
        
        .ttw-roll-item, .ttw-history-item {
            padding: 8px 10px;
            background: rgba(255, 255, 255, 0.05);
            border-radius: 6px;
            cursor: pointer;
            border-left: 3px solid var(--ttw-accent-purple);
            transition: all 0.2s ease;
        }
        
        .ttw-roll-item:hover, .ttw-roll-item.active, .ttw-history-item:hover, .ttw-history-item.active {
            background: rgba(255, 255, 255, 0.1);
        }
        
        .ttw-roll-item.selected {
            border-left-color: var(--ttw-accent-green);
            background: rgba(48, 209, 88, 0.1);
        }
        
        .ttw-entry-merged-highlight {
            box-shadow: 0 0 0 2px rgba(255, 159, 10, 0.7);
            animation: ttwMergePulse 1.2s ease-in-out infinite;
        }
        
        @keyframes ttwMergePulse {
            0% { box-shadow: 0 0 0 2px rgba(255, 159, 10, 0.7); }
            50% { box-shadow: 0 0 0 4px rgba(255, 159, 10, 0.3); }
            100% { box-shadow: 0 0 0 2px rgba(255, 159, 10, 0.7); }
        }
        
        .ttw-roll-item-header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            gap: 6px;
        }
        
        .ttw-roll-item-title {
            font-size: 12px;
            font-weight: 600;
            color: var(--ttw-accent-blue);
            white-space: nowrap;
            overflow: hidden;
            text-overflow: ellipsis;
        }
        
        .ttw-roll-item-time {
            font-size: 10px;
            color: var(--ttw-text-muted);
            white-space: nowrap;
        }
        
        .ttw-roll-item-info {
            font-size: 10px;
            color: var(--ttw-text-muted);
            margin-top: 4px;
        }
        
        .ttw-roll-detail-header {
            margin-bottom: 16px;
            padding-bottom: 16px;
            border-bottom: 1px solid var(--ttw-border-color);
        }
        
        .ttw-roll-detail-header h4 {
            color: var(--ttw-accent-blue);
            margin: 0 0 8px 0;
            font-size: 15px;
        }
        
        .ttw-roll-detail-time {
            font-size: 12px;
            color: var(--ttw-text-muted);
            margin-bottom: 10px;
        }
        
        .ttw-roll-detail-content {
            white-space: pre-wrap;
            word-break: break-all;
            font-size: 12px;
            line-height: 1.6;
            max-height: 300px;
            overflow-y: auto;
            background: rgba(0, 0, 0, 0.2);
            padding: 14px;
            border-radius: 8px;
            color: var(--ttw-text-secondary);
            border: 1px solid var(--ttw-border-color);
        }
        
        /* --- 灯光切换按钮 --- */
        .ttw-light-toggle {
            display: inline-flex;
            align-items: center;
            justify-content: center;
            width: 28px;
            height: 28px;
            border-radius: 6px;
            cursor: pointer;
            font-size: 14px;
            transition: all 0.2s ease;
            border: none;
            margin-left: 8px;
        }
        
        .ttw-light-toggle.blue {
            background: rgba(10, 132, 255, 0.15);
            color: var(--ttw-accent-blue);
        }
        
        .ttw-light-toggle.blue:hover {
            background: rgba(10, 132, 255, 0.25);
        }
        
        .ttw-light-toggle.green {
            background: rgba(48, 209, 88, 0.15);
            color: var(--ttw-accent-green);
        }
        
        .ttw-light-toggle.green:hover {
            background: rgba(48, 209, 88, 0.25);
        }
        
        /* --- 配置按钮 --- */
        .ttw-config-btn {
            display: inline-flex;
            align-items: center;
            justify-content: center;
            width: 24px;
            height: 24px;
            border-radius: 6px;
            cursor: pointer;
            font-size: 12px;
            transition: all 0.2s ease;
            border: none;
            margin-left: 6px;
            background: rgba(191, 90, 242, 0.15);
            color: var(--ttw-accent-purple);
        }
        
        .ttw-config-btn:hover {
            background: rgba(191, 90, 242, 0.25);
        }
        
        /* --- 历史条目 --- */
        .ttw-history-item-title {
            font-size: 11px;
            font-weight: 600;
            color: var(--ttw-accent-blue);
            white-space: nowrap;
            overflow: hidden;
            text-overflow: ellipsis;
        }
        
        .ttw-history-item-time {
            font-size: 10px;
            color: var(--ttw-text-muted);
        }
        
        .ttw-history-item-info {
            font-size: 10px;
            color: var(--ttw-text-muted);
        }
        
        /* --- 模型操作区 --- */
        .ttw-model-actions {
            display: flex;
            gap: 12px;
            align-items: center;
            margin-top: 14px;
            padding: 14px;
            background: rgba(10, 132, 255, 0.08);
            border: 1px solid rgba(10, 132, 255, 0.2);
            border-radius: 8px;
            flex-wrap: nowrap;
        }
        
        .ttw-model-actions > button {
            flex: 0 0 auto;
            white-space: nowrap;
        }
        
        .ttw-model-status {
            font-size: 13px;
            flex: 1 1 auto;
            min-width: 0;
            width: 100%;
            white-space: pre-wrap;
            word-wrap: break-word;
            word-break: break-all;
            line-height: 1.5;
            color: var(--ttw-text-secondary);
        }
        
        .ttw-model-status.success {
            color: var(--ttw-accent-green);
        }
        
        .ttw-model-status.error {
            color: var(--ttw-accent-red);
        }
        
        .ttw-model-status.loading {
            color: var(--ttw-accent-orange);
        }
        
        /* --- 设置项 --- */
        .ttw-setting-item {
            margin-bottom: 14px;
        }
        
        .ttw-setting-item > label {
            display: block;
            margin-bottom: 8px;
            font-size: 13px;
            font-weight: 500;
            color: var(--ttw-text-secondary);
        }
        
        .ttw-setting-item input, .ttw-setting-item select {
            width: 100%;
            padding: 10px 12px;
            border: 1px solid var(--ttw-border-color);
            border-radius: 8px;
            background: rgba(0, 0, 0, 0.3);
            color: var(--ttw-text-primary);
            font-size: 14px;
            box-sizing: border-box;
            transition: all 0.2s ease;
        }
        
        .ttw-setting-item input:focus, .ttw-setting-item select:focus {
            outline: none;
            border-color: var(--ttw-accent-blue);
            box-shadow: 0 0 0 3px rgba(10, 132, 255, 0.15);
        }
        
        .ttw-setting-item select option {
            background: var(--ttw-bg-dark);
            color: var(--ttw-text-primary);
        }
        
        /* --- 占位符提示 --- */
        .ttw-placeholder-hint code {
            user-select: all;
            background: var(--ttw-bg-input);
            padding: 2px 6px;
            border-radius: 4px;
            font-size: 12px;
            color: var(--ttw-text-primary);
        }
        
        /* --- 整合分类项 --- */
        .ttw-consolidate-category-item {
            display: flex;
            align-items: center;
            gap: 12px;
            padding: 10px 14px;
            background: rgba(255, 255, 255, 0.05);
            border-radius: 8px;
            margin-bottom: 8px;
            cursor: pointer;
            transition: all 0.2s ease;
            border: 1px solid transparent;
        }
        
        .ttw-consolidate-category-item:hover {
            background: rgba(255, 255, 255, 0.08);
            border-color: var(--ttw-border-color);
        }
        
        .ttw-consolidate-category-item input {
            width: 20px;
            height: 20px;
            accent-color: var(--ttw-accent-blue);
        }
        
        /* --- 滚动条样式 --- */
        .ttw-modal-body::-webkit-scrollbar,
        .ttw-textarea::-webkit-scrollbar,
        .ttw-textarea-small::-webkit-scrollbar,
        .ttw-memory-queue::-webkit-scrollbar,
        .ttw-categories-list::-webkit-scrollbar,
        .ttw-default-entries-list::-webkit-scrollbar,
        .ttw-roll-history-right::-webkit-scrollbar,
        .ttw-history-right::-webkit-scrollbar,
        .ttw-stream-content::-webkit-scrollbar {
            width: 6px;
        }
        
        .ttw-modal-body::-webkit-scrollbar-track,
        .ttw-textarea::-webkit-scrollbar-track,
        .ttw-textarea-small::-webkit-scrollbar-track,
        .ttw-memory-queue::-webkit-scrollbar-track,
        .ttw-categories-list::-webkit-scrollbar-track,
        .ttw-default-entries-list::-webkit-scrollbar-track,
        .ttw-roll-history-right::-webkit-scrollbar-track,
        .ttw-history-right::-webkit-scrollbar-track,
        .ttw-stream-content::-webkit-scrollbar-track {
            background: var(--ttw-bg-darker);
        }
        
        .ttw-modal-body::-webkit-scrollbar-thumb,
        .ttw-textarea::-webkit-scrollbar-thumb,
        .ttw-textarea-small::-webkit-scrollbar-thumb,
        .ttw-memory-queue::-webkit-scrollbar-thumb,
        .ttw-categories-list::-webkit-scrollbar-thumb,
        .ttw-default-entries-list::-webkit-scrollbar-thumb,
        .ttw-roll-history-right::-webkit-scrollbar-thumb,
        .ttw-history-right::-webkit-scrollbar-thumb,
        .ttw-stream-content::-webkit-scrollbar-thumb {
            background-color: var(--ttw-bg-medium);
            border-radius: 3px;
        }
        
        .ttw-modal-body::-webkit-scrollbar-thumb:hover,
        .ttw-textarea::-webkit-scrollbar-thumb:hover,
        .ttw-textarea-small::-webkit-scrollbar-thumb:hover,
        .ttw-memory-queue::-webkit-scrollbar-thumb:hover,
        .ttw-categories-list::-webkit-scrollbar-thumb:hover,
        .ttw-default-entries-list::-webkit-scrollbar-thumb:hover,
        .ttw-roll-history-right::-webkit-scrollbar-thumb:hover,
        .ttw-history-right::-webkit-scrollbar-thumb:hover,
        .ttw-stream-content::-webkit-scrollbar-thumb:hover {
            background-color: #555c6e;
        }
        
        /* --- 响应式适配 --- */
        @media (max-width: 768px) {
            .ttw-roll-history-container, .ttw-history-container {
                flex-direction: column;
                height: auto;
            }
            
            .ttw-roll-history-left, .ttw-history-left {
                width: 100%;
                max-width: 100%;
                flex-direction: row;
                flex-wrap: wrap;
                height: auto;
                max-height: 140px;
            }
            
            .ttw-roll-reroll-btn {
                width: auto;
                flex-shrink: 0;
            }
            
            .ttw-roll-list {
                flex-direction: row;
                flex-wrap: wrap;
                gap: 6px;
            }
            
            .ttw-roll-item, .ttw-history-item {
                flex: 0 0 auto;
                padding: 6px 10px;
            }
            
            .ttw-roll-history-right, .ttw-history-right {
                min-height: 280px;
            }
            
            .ttw-processed-results-container {
                flex-direction: column !important;
                height: auto !important;
            }
            
            .ttw-processed-results-left {
                width: 100% !important;
                max-width: 100% !important;
                max-height: 160px !important;
                flex-direction: row !important;
                flex-wrap: wrap !important;
            }
            
            .ttw-modal {
                max-width: 96vw;
            }
            
            .ttw-modal-body {
                padding: 16px;
            }

            .ttw-view-nav {
                flex-direction: column;
            }

            .ttw-view-tab {
                width: 100%;
            }
        }
    `;
    document.head.appendChild(styles);
}
