export function ensureModalStyles() {
    if (document.getElementById('ttw-styles')) return;
    const styles = document.createElement('style');
    styles.id = 'ttw-styles';
    styles.textContent = `
        /* ============================================
           StoryWeaver TXT Converter - 深色主题样式
           与外部抽屉组件保持一致的设计风格
           ============================================ */
        
        /* --- CSS 变量定义 --- */
        :root {
            --ttw-bg-darker: #121212;
            --ttw-bg-dark: #1e1e1e;
            --ttw-bg-medium: #2c2c2e;
            --ttw-bg-light: #3a3a3c;
            --ttw-border-color: #38383a;
            --ttw-text-primary: rgba(255, 255, 255, 0.9);
            --ttw-text-secondary: rgba(255, 255, 255, 0.65);
            --ttw-text-muted: rgba(255, 255, 255, 0.45);
            --ttw-accent-blue: #0a84ff;
            --ttw-accent-blue-hover: #3399ff;
            --ttw-accent-green: #30d158;
            --ttw-accent-orange: #ff9f0a;
            --ttw-accent-red: #ff453a;
            --ttw-accent-purple: #bf5af2;
        }
        
        /* --- 模态框容器 --- */
        .ttw-modal-container {
            position: fixed;
            top: 0;
            left: 0;
            width: 100vw;
            height: 100vh;
            background: rgba(0, 0, 0, 0.7);
            display: flex;
            align-items: center;
            justify-content: center;
            z-index: 99999;
            padding: 20px;
            box-sizing: border-box;
            backdrop-filter: blur(4px);
        }
        
        /* --- 模态框主体 --- */
        .ttw-modal {
            background: linear-gradient(180deg, var(--ttw-bg-dark) 0%, var(--ttw-bg-darker) 100%);
            border: 1px solid var(--ttw-border-color);
            border-radius: 16px;
            width: 100%;
            max-width: 800px;
            max-height: calc(100vh - 40px);
            display: flex;
            flex-direction: column;
            box-shadow: 0 20px 60px rgba(0, 0, 0, 0.6);
            overflow: hidden;
        }
        
        /* --- 模态框头部 --- */
        .ttw-modal-header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            padding: 18px 24px;
            border-bottom: 1px solid var(--ttw-border-color);
            background: var(--ttw-bg-dark);
        }
        
        .ttw-modal-title {
            font-weight: 600;
            font-size: 16px;
            color: var(--ttw-text-primary);
            display: flex;
            align-items: center;
            gap: 10px;
        }
        
        .ttw-modal-title::before {
            content: '✨';
            font-size: 18px;
        }
        
        .ttw-header-actions {
            display: flex;
            align-items: center;
            gap: 12px;
        }
        
        .ttw-help-btn {
            display: inline-flex;
            align-items: center;
            justify-content: center;
            width: 32px;
            height: 32px;
            border-radius: 8px;
            background: rgba(10, 132, 255, 0.15);
            color: var(--ttw-accent-blue);
            font-size: 14px;
            cursor: pointer;
            transition: all 0.25s ease;
            border: 1px solid rgba(10, 132, 255, 0.3);
        }
        
        .ttw-help-btn:hover {
            background: rgba(10, 132, 255, 0.3);
            transform: scale(1.05);
        }
        
        .ttw-modal-close {
            background: rgba(255, 255, 255, 0.08);
            border: none;
            color: var(--ttw-text-secondary);
            font-size: 18px;
            width: 32px;
            height: 32px;
            border-radius: 8px;
            cursor: pointer;
            transition: all 0.25s ease;
            display: flex;
            align-items: center;
            justify-content: center;
        }
        
        .ttw-modal-close:hover {
            background: rgba(255, 69, 58, 0.2);
            color: var(--ttw-accent-red);
        }
        
        /* --- 模态框内容区 --- */
        .ttw-modal-body {
            flex: 1;
            overflow-y: auto;
            padding: 20px 24px;
        }
        
        .ttw-modal-footer {
            padding: 16px 24px;
            border-top: 1px solid var(--ttw-border-color);
            background: var(--ttw-bg-dark);
            display: flex;
            justify-content: flex-end;
            gap: 12px;
        }
        
        /* --- 卡片式区块 --- */
        .ttw-section {
            background: linear-gradient(180deg, rgba(255, 255, 255, 0.03) 0%, rgba(255, 255, 255, 0.01) 100%);
            border: 1px solid var(--ttw-border-color);
            border-radius: 12px;
            margin-bottom: 16px;
            overflow: hidden;
        }
        
        .ttw-section-header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            padding: 14px 18px;
            background: rgba(0, 0, 0, 0.2);
            cursor: pointer;
            font-weight: 600;
            font-size: 14px;
            color: var(--ttw-text-primary);
            transition: background 0.2s ease;
        }
        
        .ttw-section-header:hover {
            background: rgba(0, 0, 0, 0.3);
        }
        
        .ttw-section-content {
            padding: 18px;
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
            background: rgba(0, 0, 0, 0.3);
            border: 1px solid var(--ttw-border-color);
            border-radius: 8px;
            color: var(--ttw-text-primary);
            font-size: 14px;
            box-sizing: border-box;
            transition: all 0.2s ease;
        }
        
        .ttw-input {
            width: 100%;
            padding: 12px 14px;
        }
        
        .ttw-input-small {
            width: 70px;
            padding: 8px 10px;
            text-align: center;
        }
        
        .ttw-select {
            width: 100%;
            padding: 10px 12px;
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
            min-height: 100px;
            padding: 12px;
            font-family: 'Consolas', 'Monaco', monospace;
            font-size: 13px;
            line-height: 1.5;
            resize: vertical;
        }
        
        .ttw-input:focus, .ttw-select:focus, .ttw-textarea:focus, .ttw-textarea-small:focus {
            outline: none;
            border-color: var(--ttw-accent-blue);
            box-shadow: 0 0 0 3px rgba(10, 132, 255, 0.15);
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
        
        .ttw-prompt-config-header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            padding: 14px 16px;
            background: rgba(10, 132, 255, 0.1);
            border-bottom: 1px solid var(--ttw-border-color);
            font-weight: 600;
            flex-wrap: wrap;
            gap: 10px;
        }
        
        .ttw-prompt-section {
            border-bottom: 1px solid var(--ttw-border-color);
        }
        
        .ttw-prompt-section:last-child {
            border-bottom: none;
        }
        
        .ttw-prompt-header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            padding: 12px 16px;
            cursor: pointer;
            font-size: 14px;
            transition: all 0.2s ease;
            font-weight: 500;
        }
        
        .ttw-prompt-header:hover {
            filter: brightness(1.1);
        }
        
        .ttw-prompt-header-blue {
            background: rgba(10, 132, 255, 0.08);
            color: var(--ttw-accent-blue);
        }
        
        .ttw-prompt-header-purple {
            background: rgba(191, 90, 242, 0.08);
            color: var(--ttw-accent-purple);
        }
        
        .ttw-prompt-header-green {
            background: rgba(48, 209, 88, 0.08);
            color: var(--ttw-accent-green);
        }
        
        .ttw-prompt-content {
            display: none;
            padding: 16px;
            background: rgba(0, 0, 0, 0.15);
        }
        
        /* --- 标签徽章 --- */
        .ttw-badge {
            font-size: 11px;
            padding: 3px 8px;
            border-radius: 12px;
            font-weight: 600;
        }
        
        .ttw-badge-blue {
            background: rgba(10, 132, 255, 0.2);
            color: var(--ttw-accent-blue);
        }
        
        .ttw-badge-gray {
            background: rgba(255, 255, 255, 0.1);
            color: var(--ttw-text-secondary);
        }
        
        /* --- 文件上传区 --- */
        .ttw-upload-area {
            border: 2px dashed var(--ttw-border-color);
            border-radius: 12px;
            padding: 50px 24px;
            text-align: center;
            cursor: pointer;
            transition: all 0.25s ease;
            background: rgba(0, 0, 0, 0.15);
        }
        
        .ttw-upload-area:hover {
            border-color: var(--ttw-accent-blue);
            background: rgba(10, 132, 255, 0.08);
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
            background: rgba(48, 209, 88, 0.1);
            border-radius: 8px;
            margin-top: 16px;
            border: 1px solid rgba(48, 209, 88, 0.2);
        }
        
        /* --- 记忆队列 --- */
        .ttw-memory-queue {
            max-height: 220px;
            overflow-y: auto;
            background: rgba(0, 0, 0, 0.2);
            border-radius: 8px;
            padding: 10px;
            border: 1px solid var(--ttw-border-color);
        }
        
        .ttw-memory-item {
            padding: 10px 14px;
            background: rgba(255, 255, 255, 0.05);
            border-radius: 6px;
            margin-bottom: 8px;
            font-size: 14px;
            display: flex;
            align-items: center;
            gap: 10px;
            cursor: pointer;
            transition: all 0.2s ease;
            border: 1px solid transparent;
        }
        
        .ttw-memory-item:hover {
            background: rgba(255, 255, 255, 0.08);
            border-color: var(--ttw-border-color);
        }
        
        .ttw-memory-item.multi-select-mode {
            cursor: default;
        }
        
        .ttw-memory-item.selected-for-delete {
            background: rgba(255, 69, 58, 0.15);
            border-color: rgba(255, 69, 58, 0.3);
        }
        
        /* --- 进度条 --- */
        .ttw-progress-bar {
            width: 100%;
            height: 10px;
            background: rgba(0, 0, 0, 0.3);
            border-radius: 5px;
            overflow: hidden;
            margin-bottom: 14px;
        }
        
        .ttw-progress-fill {
            height: 100%;
            background: linear-gradient(90deg, var(--ttw-accent-blue), var(--ttw-accent-purple));
            border-radius: 5px;
            transition: width 0.3s ease;
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
            background: rgba(0, 0, 0, 0.25);
            border-radius: 8px;
            padding: 16px;
            margin-bottom: 16px;
            font-size: 13px;
            border: 1px solid var(--ttw-border-color);
            line-height: 1.6;
        }
        
        .ttw-result-actions {
            display: flex;
            flex-wrap: wrap;
            gap: 12px;
        }
        
        /* --- 按钮样式 --- */
        .ttw-btn {
            padding: 12px 20px;
            border: 1px solid var(--ttw-border-color);
            border-radius: 8px;
            background: rgba(255, 255, 255, 0.08);
            color: var(--ttw-text-primary);
            font-size: 14px;
            font-weight: 500;
            cursor: pointer;
            transition: all 0.25s ease;
            display: inline-flex;
            align-items: center;
            justify-content: center;
            gap: 8px;
        }
        
        .ttw-btn:hover {
            background: rgba(255, 255, 255, 0.12);
            transform: translateY(-1px);
        }
        
        .ttw-btn:disabled {
            opacity: 0.4;
            cursor: not-allowed;
            transform: none;
        }
        
        .ttw-btn-primary {
            background: linear-gradient(135deg, var(--ttw-accent-blue), #0077ed);
            border-color: var(--ttw-accent-blue);
            color: #fff;
            box-shadow: 0 4px 12px rgba(10, 132, 255, 0.3);
        }
        
        .ttw-btn-primary:hover {
            background: linear-gradient(135deg, var(--ttw-accent-blue-hover), #1a85ff);
            box-shadow: 0 6px 16px rgba(10, 132, 255, 0.4);
        }
        
        .ttw-btn-secondary {
            background: rgba(255, 255, 255, 0.1);
            border-color: var(--ttw-border-color);
        }
        
        .ttw-btn-secondary:hover {
            background: rgba(255, 255, 255, 0.15);
        }
        
        .ttw-btn-warning {
            background: rgba(255, 159, 10, 0.15);
            border-color: rgba(255, 159, 10, 0.4);
            color: var(--ttw-accent-orange);
        }
        
        .ttw-btn-warning:hover {
            background: rgba(255, 159, 10, 0.25);
        }
        
        .ttw-btn-small {
            padding: 8px 14px;
            font-size: 13px;
            border: 1px solid var(--ttw-border-color);
            border-radius: 6px;
            background: rgba(255, 255, 255, 0.08);
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
        .ttw-categories-list {
            max-height: 200px;
            overflow-y: auto;
            background: rgba(0, 0, 0, 0.2);
            border-radius: 8px;
            padding: 10px;
            border: 1px solid var(--ttw-border-color);
        }
        
        .ttw-category-item {
            display: flex;
            align-items: center;
            gap: 10px;
            padding: 8px 12px;
            background: rgba(255, 255, 255, 0.05);
            border-radius: 6px;
            margin-bottom: 6px;
            transition: all 0.2s ease;
        }
        
        .ttw-category-item:hover {
            background: rgba(255, 255, 255, 0.08);
        }
        
        .ttw-category-item input[type="checkbox"] {
            width: 18px;
            height: 18px;
            accent-color: var(--ttw-accent-purple);
        }
        
        .ttw-category-name {
            flex: 1;
            font-size: 14px;
            color: var(--ttw-text-primary);
        }
        
        .ttw-category-actions {
            display: flex;
            gap: 6px;
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
            background: rgba(10, 132, 255, 0.15);
            padding: 2px 6px;
            border-radius: 4px;
            font-size: 12px;
            color: var(--ttw-accent-blue);
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
        }
    `;
    document.head.appendChild(styles);
}
