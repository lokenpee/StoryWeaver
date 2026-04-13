export function createTaskStateService(deps = {}) {
    const {
        AppState,
        MemoryHistoryDB,
        Logger,
        ErrorHandler,
        confirmAction,
        defaultSettings,
        getExportBaseName,
        rebuildWorldbookFromMemories,
        showQueueSection,
        updateMemoryQueueUI,
        updateVolumeIndicator,
        updateStartButtonState,
        updateSettingsUI,
        renderCategoriesList,
        renderDefaultWorldbookEntriesUI,
        updateChapterRegexUI,
        showResultSection,
        updateWorldbookPreview,
    } = deps;

    const TASK_STATE_TYPE = 'WestWorld.taskState';
    const LEGACY_TASK_STATE_TYPE = 'StoryWeaver.taskState';
    const TASK_STATE_VERSION = '3.2.2';
    const SPLIT_TYPES = new Set([
        'scene_change',
        'time_jump',
        'goal_shift',
        'conflict_closed',
    ]);
    const LEGACY_SPLIT_TYPE_MAP = {
        scene_switch: 'scene_change',
        situation_change: 'scene_change',
        action_closed: 'conflict_closed',
        dialogue_closed: 'conflict_closed',
        plot_twist: 'conflict_closed',
        perspective_switch: 'scene_change',
        relationship_shift: 'conflict_closed',
        revelation: 'conflict_closed',
        decision_point: 'goal_shift',
        emotional_turn: 'conflict_closed',
        interaction_point: 'goal_shift',
        scene_change: 'scene_change',
        time_skip: 'time_jump',
        time_jump: 'time_jump',
        goal_shift: 'goal_shift',
        conflict_closed: 'conflict_closed',
        '场景明显切换': 'scene_change',
        '时间明显跳转': 'time_jump',
        '人物核心目标完全改变': 'goal_shift',
        '完整冲突闭环结束': 'conflict_closed',
        '一个完整冲突/行动闭环结束': 'conflict_closed',
    };

    function clampInt(value, min, max, fallback = min) {
        const parsed = parseInt(value, 10);
        if (!Number.isFinite(parsed)) return fallback;
        return Math.max(min, Math.min(max, parsed));
    }

    function normalizeSplitType(type) {
        const raw = String(type || '').trim();
        if (SPLIT_TYPES.has(raw)) return raw;
        if (LEGACY_SPLIT_TYPE_MAP[raw]) return LEGACY_SPLIT_TYPE_MAP[raw];
        return 'goal_shift';
    }

    function normalizeSplitRule(rawRule = {}) {
        const source = rawRule && typeof rawRule === 'object' ? rawRule : {};
        const primary = normalizeSplitType(source.primary || source.rule || source.main || source.type || 'goal_shift');
        const rationale = String(source.rationale || source.reason || '').trim()
            || `选择 ${primary} 以保持叙事单元完整并避免事件被切开。`;
        return {
            primary,
            rationale,
        };
    }

    function normalizeSelfCheck(rawValue = '') {
        const source = rawValue && typeof rawValue === 'object' ? rawValue : null;
        const direct = typeof rawValue === 'string' ? rawValue : '';
        const text = String(
            source?.self_check
            || source?.selfCheck
            || source?.note
            || source?.summary
            || direct
            || ''
        ).trim();
        return text || '未提供自检说明。';
    }

    function normalizeBeatItem(beat = {}, index = 0) {
        const source = beat && typeof beat === 'object' ? beat : {};
        const tags = Array.isArray(source.tags)
            ? source.tags.map((tag) => String(tag || '').trim()).filter(Boolean).slice(0, 4)
            : [];
        return {
            id: String(source.id || `b${index + 1}`).trim() || `b${index + 1}`,
            summary: String(source.event_summary || source.eventSummary || source.summary || source.event || source.description || `事件点${index + 1}`).trim() || `事件点${index + 1}`,
            event_summary: String(source.event_summary || source.eventSummary || source.summary || source.event || source.description || `事件点${index + 1}`).trim() || `事件点${index + 1}`,
            entryEvent: String(
                source.entryEvent
                || source.entry_event
                || source.opening_event
                || source.openingEvent
                || source.entry_condition
                || source.enter_condition
                || '从上一节拍结果自然衔接进入当前事件。'
            ).trim() || '从上一节拍结果自然衔接进入当前事件。',
            exitCondition: String(
                source.exitCondition
                || source.exit_condition
                || source.exist_condition
                || source.existCondition
                || source['exist condition']
                || '等待用户行动或关键互动完成'
            ).trim() || '等待用户行动或关键互动完成',
            split_reason: String(source.split_reason || source.splitReason || source.reason || '用于保持叙事单元完整。').trim() || '用于保持叙事单元完整。',
            self_check: normalizeSelfCheck(
                source.self_check
                || source.selfCheck
                || source.reflection
                || source.self_review
                || source.note
                || ''
            ),
            tags,
            original_text: typeof source.original_text === 'string'
                ? source.original_text
                : (typeof source.originalText === 'string' ? source.originalText : ''),
            split_rule: normalizeSplitRule(source.split_rule || source.splitRule || {}),
        };
    }

    function normalizeChapterScript(script = {}) {
        const normalized = script && typeof script === 'object' ? { ...script } : {};
        normalized.keyNodes = Array.isArray(normalized.keyNodes) ? normalized.keyNodes : [];
        normalized.beats = Array.isArray(normalized.beats)
            ? normalized.beats.map((beat, index) => normalizeBeatItem(beat, index))
            : [];
        return normalized;
    }

    function normalizeMemoryItem(memory = {}, index = 0) {
        const normalized = memory && typeof memory === 'object' ? { ...memory } : {};
        normalized.title = typeof normalized.title === 'string' && normalized.title.trim()
            ? normalized.title
            : `记忆${index + 1}`;
        normalized.chapterTitle = typeof normalized.chapterTitle === 'string' && normalized.chapterTitle.trim()
            ? normalized.chapterTitle
            : `第${index + 1}章`;
        normalized.content = typeof normalized.content === 'string' ? normalized.content : '';
        normalized.processed = normalized.processed === true;
        normalized.failed = normalized.failed === true;
        normalized.processing = false;
        normalized.chapterOutline = typeof normalized.chapterOutline === 'string' ? normalized.chapterOutline : '';
        normalized.chapterOutlineStatus = normalized.chapterOutlineStatus || 'pending';
        normalized.chapterOutlineError = typeof normalized.chapterOutlineError === 'string' ? normalized.chapterOutlineError : '';
        normalized.chapterScript = normalizeChapterScript(normalized.chapterScript);
        normalized.chapterOpeningPreview = typeof normalized.chapterOpeningPreview === 'string' ? normalized.chapterOpeningPreview : '';
        normalized.chapterOpeningSent = normalized.chapterOpeningSent === true;
        normalized.chapterOpeningError = typeof normalized.chapterOpeningError === 'string' ? normalized.chapterOpeningError : '';
        normalized.chapterOpeningGenerating = false;
        normalized.chapterCurrentBeatIndex = Number.isInteger(normalized.chapterCurrentBeatIndex)
            ? Math.max(0, normalized.chapterCurrentBeatIndex)
            : 0;
        return normalized;
    }

    function normalizeMemoryQueue(queue = []) {
        if (!Array.isArray(queue)) return [];
        return queue.map((memory, index) => normalizeMemoryItem(memory, index));
    }

    function normalizeExperience(experience, queueLength) {
        const maxIndex = Math.max(0, queueLength - 1);
        const source = experience && typeof experience === 'object' ? experience : {};
        return {
            currentChapterIndex: clampInt(source.currentChapterIndex, 0, maxIndex, 0),
            currentBeatIndex: Number.isInteger(source.currentBeatIndex) ? Math.max(0, source.currentBeatIndex) : 0,
            directorLastDecision: source.directorLastDecision || null,
            directorLastDecisionAt: Number.isFinite(source.directorLastDecisionAt) ? source.directorLastDecisionAt : 0,
        };
    }

    function clampStartIndex(value, queueLength) {
        if (queueLength <= 0) return 0;
        return clampInt(value, 0, Math.max(0, queueLength - 1), 0);
    }

    async function saveTaskState() {
        const normalizedQueue = normalizeMemoryQueue(AppState.memory.queue);
        const queueLength = normalizedQueue.length;
        const state = {
            version: TASK_STATE_VERSION,
            type: TASK_STATE_TYPE,
            timestamp: Date.now(),
            memoryQueue: normalizedQueue,
            generatedWorldbook: AppState.worldbook.generated,
            worldbookVolumes: AppState.worldbook.volumes,
            currentVolumeIndex: AppState.worldbook.currentVolumeIndex,
            fileHash: AppState.file.hash,
            settings: AppState.settings,
            parallelConfig: AppState.config.parallel,
            categoryLightSettings: AppState.config.categoryLight,
            customWorldbookCategories: AppState.persistent.customCategories,
            chapterRegexSettings: AppState.config.chapterRegex,
            defaultWorldbookEntriesUI: AppState.persistent.defaultEntries,
            categoryDefaultConfig: AppState.config.categoryDefault,
            entryPositionConfig: AppState.config.entryPosition,
            originalFileName: AppState.file.current ? AppState.file.current.name : null,
            novelName: AppState.file.novelName || '',
            experience: normalizeExperience(AppState.experience, queueLength),
            processingState: {
                incrementalMode: !!AppState.processing.incrementalMode,
                volumeMode: !!AppState.processing.volumeMode,
            },
            queueState: {
                startIndex: clampStartIndex(AppState.memory.startIndex, queueLength),
                userSelectedIndex: Number.isInteger(AppState.memory.userSelectedIndex)
                    ? clampStartIndex(AppState.memory.userSelectedIndex, queueLength)
                    : null,
            },
        };
        const timeString = new Date()
            .toLocaleString('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })
            .replace(/[:/\s]/g, '')
            .replace(/,/g, '-');

        const baseName = getExportBaseName('任务状态');
        const fileName = `${baseName}-任务状态-${timeString}.json`;

        const blob = new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = fileName;
        a.click();
        URL.revokeObjectURL(url);
        const processedCount = AppState.memory.queue.filter((m) => m.processed).length;
        ErrorHandler.showUserSuccess(`工程包已导出！已处理: ${processedCount}/${AppState.memory.queue.length}（含故事大纲与当前章节进度）`);
    }

    async function loadTaskState() {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = '.json';
        input.onchange = async (e) => {
            const file = e.target.files[0];
            if (!file) return;
            try {
                const content = await file.text();
                const state = JSON.parse(content);
                const type = String(state.type || '').trim();
                if (type && type !== TASK_STATE_TYPE && type !== LEGACY_TASK_STATE_TYPE) {
                    throw new Error('不是有效的工程包文件');
                }
                if (!state.memoryQueue || !Array.isArray(state.memoryQueue)) throw new Error('无效的任务状态文件');

                const normalizedQueue = normalizeMemoryQueue(state.memoryQueue);
                AppState.memory.queue = normalizedQueue;
                AppState.worldbook.generated = state.generatedWorldbook && typeof state.generatedWorldbook === 'object'
                    ? state.generatedWorldbook
                    : {};
                AppState.worldbook.volumes = Array.isArray(state.worldbookVolumes) ? state.worldbookVolumes : [];
                AppState.worldbook.currentVolumeIndex = clampStartIndex(state.currentVolumeIndex || 0, AppState.worldbook.volumes.length || 1);
                AppState.file.hash = state.fileHash || null;

                if (state.settings) AppState.settings = { ...defaultSettings, ...state.settings };
                if (state.parallelConfig) AppState.config.parallel = { ...AppState.config.parallel, ...state.parallelConfig };
                if (state.categoryLightSettings) AppState.config.categoryLight = { ...AppState.config.categoryLight, ...state.categoryLightSettings };
                if (state.customWorldbookCategories) AppState.persistent.customCategories = state.customWorldbookCategories;
                if (state.chapterRegexSettings) AppState.config.chapterRegex = state.chapterRegexSettings;
                if (state.defaultWorldbookEntriesUI) AppState.persistent.defaultEntries = state.defaultWorldbookEntriesUI;
                if (state.categoryDefaultConfig) AppState.config.categoryDefault = state.categoryDefaultConfig;
                if (state.entryPositionConfig) AppState.config.entryPosition = state.entryPositionConfig;
                if (state.processingState) {
                    AppState.processing.incrementalMode = state.processingState.incrementalMode !== false;
                    AppState.processing.volumeMode = state.processingState.volumeMode === true;
                    AppState.settings.useVolumeMode = AppState.processing.volumeMode;
                }

                AppState.experience = normalizeExperience(state.experience || AppState.experience, AppState.memory.queue.length);

                if (state.novelName) {
                    AppState.file.novelName = state.novelName;
                } else if (state.originalFileName) {
                    AppState.file.novelName = state.originalFileName.replace(/\.[^/.]+$/, '');
                }

                const fileNameEl = document.getElementById('ttw-file-name');
                if (fileNameEl && state.originalFileName) {
                    fileNameEl.textContent = state.originalFileName;
                }
                const novelNameInput = document.getElementById('ttw-novel-name-input');
                if (novelNameInput && AppState.file.novelName) {
                    novelNameInput.value = AppState.file.novelName;
                }
                const novelNameRow = document.getElementById('ttw-novel-name-row');
                if (novelNameRow) novelNameRow.style.display = 'flex';

                if (Object.keys(AppState.worldbook.generated).length === 0) {
                    rebuildWorldbookFromMemories();
                }

                const firstUnprocessed = AppState.memory.queue.findIndex((m) => !m.processed || m.failed);
                if (state.queueState && typeof state.queueState === 'object') {
                    AppState.memory.startIndex = clampStartIndex(state.queueState.startIndex, AppState.memory.queue.length);
                    AppState.memory.userSelectedIndex = Number.isInteger(state.queueState.userSelectedIndex)
                        ? clampStartIndex(state.queueState.userSelectedIndex, AppState.memory.queue.length)
                        : null;
                } else {
                    AppState.memory.startIndex = firstUnprocessed !== -1 ? firstUnprocessed : 0;
                    AppState.memory.userSelectedIndex = null;
                }

                showQueueSection(true);
                updateMemoryQueueUI();
                if (AppState.processing.volumeMode) updateVolumeIndicator();
                updateStartButtonState(false);
                updateSettingsUI();
                renderCategoriesList();
                renderDefaultWorldbookEntriesUI();
                updateChapterRegexUI();

                if (Object.keys(AppState.worldbook.generated).length > 0) {
                    showResultSection(true);
                    updateWorldbookPreview();
                }

                const processedCount = AppState.memory.queue.filter((m) => m.processed).length;
                ErrorHandler.showUserSuccess(`工程包导入成功！已处理: ${processedCount}/${AppState.memory.queue.length}（已恢复故事大纲与当前章节进度）`);
                document.getElementById('ttw-start-btn').disabled = false;
            } catch (error) {
                ErrorHandler.showUserError('导入失败: ' + error.message);
            }
        };
        input.click();
    }

    async function restoreExistingState() {
        if (AppState.memory.queue.length > 0) {
            AppState.memory.queue = normalizeMemoryQueue(AppState.memory.queue);
            AppState.experience = normalizeExperience(AppState.experience, AppState.memory.queue.length);
            document.getElementById('ttw-upload-area').style.display = 'none';
            document.getElementById('ttw-file-info').style.display = 'flex';
            document.getElementById('ttw-file-name').textContent = AppState.file.current ? AppState.file.current.name : '已加载的文件';
            const totalChars = AppState.memory.queue.reduce((sum, m) => sum + m.content.length, 0);
            document.getElementById('ttw-file-size').textContent = `(${(totalChars / 1024).toFixed(1)} KB, ${AppState.memory.queue.length}章)`;
            if (AppState.file.novelName) {
                const novelNameRow = document.getElementById('ttw-novel-name-row');
                if (novelNameRow) novelNameRow.style.display = 'flex';
                const novelNameInput = document.getElementById('ttw-novel-name-input');
                if (novelNameInput) novelNameInput.value = AppState.file.novelName;
            }

            for (let i = 0; i < AppState.memory.queue.length; i++) {
                const memory = AppState.memory.queue[i];
                if (memory.processed && !memory.failed && !memory.result) {
                    try {
                        const rollResults = await MemoryHistoryDB.getRollResults(i);
                        if (rollResults.length > 0) {
                            const latestRoll = rollResults[rollResults.length - 1];
                            memory.result = latestRoll.result;
                            Logger.info('Restore', `✅ 恢复第${i + 1}章的result`);
                        }
                    } catch (e) {
                        Logger.error('Restore', `恢复第${i + 1}章result失败:`, e);
                    }
                }
            }

            showQueueSection(true);
            updateMemoryQueueUI();

            document.getElementById('ttw-start-btn').disabled = false;
            updateStartButtonState(false);

            if (AppState.processing.volumeMode) updateVolumeIndicator();

            if (Object.keys(AppState.worldbook.generated).length === 0) {
                const hasProcessedWithResult = AppState.memory.queue.some((m) => m.processed && !m.failed && m.result);
                if (hasProcessedWithResult) {
                    rebuildWorldbookFromMemories();
                }
            }

            if (Object.keys(AppState.worldbook.generated).length > 0) {
                showResultSection(true);
                updateWorldbookPreview();
            }
        }
    }

    async function checkAndRestoreState() {
        try {
            const savedState = await MemoryHistoryDB.loadState();
            if (savedState && savedState.memoryQueue && savedState.memoryQueue.length > 0) {
                const processedCount = savedState.memoryQueue.filter((m) => m.processed).length;
                if (await confirmAction(`检测到未完成任务\n已处理: ${processedCount}/${savedState.memoryQueue.length}\n\n是否恢复？`, { title: '恢复未完成任务' })) {
                    AppState.memory.queue = normalizeMemoryQueue(savedState.memoryQueue);
                    AppState.worldbook.generated = savedState.generatedWorldbook && typeof savedState.generatedWorldbook === 'object'
                        ? savedState.generatedWorldbook
                        : {};
                    AppState.worldbook.volumes = Array.isArray(savedState.worldbookVolumes) ? savedState.worldbookVolumes : [];
                    AppState.worldbook.currentVolumeIndex = clampStartIndex(savedState.currentVolumeIndex || 0, AppState.worldbook.volumes.length || 1);
                    AppState.file.hash = savedState.fileHash;
                    AppState.experience = normalizeExperience(savedState.experience || AppState.experience, AppState.memory.queue.length);

                    if (savedState.processingState) {
                        AppState.processing.incrementalMode = savedState.processingState.incrementalMode !== false;
                        AppState.processing.volumeMode = savedState.processingState.volumeMode === true;
                    }

                    if (savedState.novelName) AppState.file.novelName = savedState.novelName;

                    if (Object.keys(AppState.worldbook.generated).length === 0) {
                        rebuildWorldbookFromMemories();
                    }

                    if (savedState.queueState && typeof savedState.queueState === 'object') {
                        AppState.memory.startIndex = clampStartIndex(savedState.queueState.startIndex, AppState.memory.queue.length);
                        AppState.memory.userSelectedIndex = Number.isInteger(savedState.queueState.userSelectedIndex)
                            ? clampStartIndex(savedState.queueState.userSelectedIndex, AppState.memory.queue.length)
                            : null;
                    } else {
                        AppState.memory.startIndex = AppState.memory.queue.findIndex((m) => !m.processed || m.failed);
                        if (AppState.memory.startIndex === -1) AppState.memory.startIndex = AppState.memory.queue.length;
                        AppState.memory.userSelectedIndex = null;
                    }

                    showQueueSection(true);
                    updateMemoryQueueUI();
                    if (AppState.processing.volumeMode) updateVolumeIndicator();
                    if (AppState.memory.startIndex >= AppState.memory.queue.length || Object.keys(AppState.worldbook.generated).length > 0) {
                        showResultSection(true);
                        updateWorldbookPreview();
                    }
                    updateStartButtonState(false);
                    updateSettingsUI();
                    document.getElementById('ttw-start-btn').disabled = false;

                    document.getElementById('ttw-upload-area').style.display = 'none';
                    document.getElementById('ttw-file-info').style.display = 'flex';
                    document.getElementById('ttw-file-name').textContent = '已恢复的任务';
                    const totalChars = AppState.memory.queue.reduce((sum, m) => sum + m.content.length, 0);
                    document.getElementById('ttw-file-size').textContent = `(${(totalChars / 1024).toFixed(1)} KB, ${AppState.memory.queue.length}章)`;
                    const novelNameRow = document.getElementById('ttw-novel-name-row');
                    if (novelNameRow) novelNameRow.style.display = 'flex';
                    const novelNameInput = document.getElementById('ttw-novel-name-input');
                    if (novelNameInput && AppState.file.novelName) novelNameInput.value = AppState.file.novelName;
                } else {
                    await MemoryHistoryDB.clearState();
                }
            }
        } catch (e) {
            Logger.error('Restore', '恢复状态失败:', e);
        }
    }

    return {
        saveTaskState,
        loadTaskState,
        checkAndRestoreState,
        restoreExistingState,
    };
}
