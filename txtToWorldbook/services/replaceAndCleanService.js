export function createReplaceAndCleanService(deps = {}) {
    const {
        AppState,
        ModalFactory,
        ErrorHandler,
        confirmAction,
        updateWorldbookPreview,
        updateMemoryQueueUI,
        updateStartButtonState,
    } = deps;

    function parseTagNames(input) {
        return input.split('\n')
            .map((line) => line.trim())
            .filter((line) => line.length > 0 && /^[a-zA-Z_][a-zA-Z0-9_-]*$/.test(line));
    }

    function getWorldbookStatus(memory) {
        const status = String(memory?.worldbookStatus || '').trim().toLowerCase();
        return status || 'pending';
    }

    function isWorldbookDone(memory) {
        return getWorldbookStatus(memory) === 'done';
    }

    function groupMatchesBySource(matches) {
        const groups = {};
        for (const m of matches) {
            const key = m.source === 'worldbook'
                ? `wb::${m.category}::${m.entryName}`
                : `mem${m.memoryIndex}::${m.category}::${m.entryName}`;
            if (!groups[key]) groups[key] = [];
            groups[key].push(m);
        }
        return groups;
    }

    function getTextRef(match) {
        if (match.source === 'worldbook') {
            const entry = AppState.worldbook.generated[match.category]?.[match.entryName];
            if (!entry) return null;
            return {
                get: () => entry['内容'] || '',
                set: (val) => { entry['内容'] = val; },
            };
        }

        const memory = AppState.memory.queue[match.memoryIndex];
        if (!memory?.result) return null;
        const entry = memory.result[match.category]?.[match.entryName];
        if (!entry) return null;
        return {
            get: () => entry['内容'] || '',
            set: (val) => { entry['内容'] = val; },
        };
    }

    function scanForTags(tagNames, inWorldbook, inResults) {
        const allMatches = [];

        const scanText = (text, source, category, entryName, memoryIndex) => {
            if (!text || typeof text !== 'string') return;

            for (const tag of tagNames) {
                const escaped = tag.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

                const fullRegex = new RegExp(`<${escaped}>[\\s\\S]*?</${escaped}>`, 'gi');
                let match;
                while ((match = fullRegex.exec(text)) !== null) {
                    allMatches.push({
                        source, category, entryName, memoryIndex, tag,
                        type: 'full',
                        startInText: match.index,
                        endInText: match.index + match[0].length,
                        matchedText: match[0],
                        fullText: text,
                    });
                }

                const closeTagRegex = new RegExp(`</${escaped}>`, 'i');
                const closeMatch = text.substring(0, 500).match(closeTagRegex);
                if (closeMatch) {
                    const closePos = closeMatch.index + closeMatch[0].length;
                    const textBefore = text.substring(0, closeMatch.index);
                    const openTagCheck = new RegExp(`<${escaped}[\\s>]`, 'i');
                    if (!openTagCheck.test(textBefore)) {
                        allMatches.push({
                            source, category, entryName, memoryIndex, tag,
                            type: 'close-only',
                            startInText: 0,
                            endInText: closePos,
                            matchedText: text.substring(0, closePos),
                            fullText: text,
                        });
                    }
                }

                const tailStart = Math.max(0, text.length - 500);
                const tailText = text.substring(tailStart);
                const openTagRegex = new RegExp(`<${escaped}>`, 'i');
                const openMatch = tailText.match(openTagRegex);
                if (openMatch) {
                    const absPos = tailStart + openMatch.index;
                    const textAfter = text.substring(absPos);
                    const closeTagCheck = new RegExp(`</${escaped}>`, 'i');
                    if (!closeTagCheck.test(textAfter.substring(openMatch[0].length))) {
                        const alreadyMatched = allMatches.some((m) =>
                            m.source === source && m.category === category
                            && m.entryName === entryName && m.memoryIndex === memoryIndex
                            && m.startInText <= absPos && m.endInText >= text.length
                        );
                        if (!alreadyMatched) {
                            allMatches.push({
                                source, category, entryName, memoryIndex, tag,
                                type: 'open-only',
                                startInText: absPos,
                                endInText: text.length,
                                matchedText: text.substring(absPos),
                                fullText: text,
                            });
                        }
                    }
                }
            }
        };

        if (inWorldbook) {
            for (const cat in AppState.worldbook.generated) {
                for (const name in AppState.worldbook.generated[cat]) {
                    const entry = AppState.worldbook.generated[cat][name];
                    if (entry && entry['内容']) {
                        scanText(entry['内容'], 'worldbook', cat, name, -1);
                    }
                }
            }
        }

        if (inResults) {
            for (let i = 0; i < AppState.memory.queue.length; i++) {
                const memory = AppState.memory.queue[i];
                if (!memory.result) continue;
                for (const cat in memory.result) {
                    for (const name in memory.result[cat]) {
                        const entry = memory.result[cat][name];
                        if (entry && entry['内容']) {
                            scanText(entry['内容'], 'memory', cat, name, i);
                        }
                    }
                }
            }
        }

        return allMatches;
    }

    function updateExecBtnCount(modal) {
        const execBtn = modal.querySelector('#ttw-execute-clean-tags');
        if (!execBtn) return;
        const checkedCount = modal.querySelectorAll('.ttw-clean-match-cb:checked').length;
        execBtn.textContent = `🗑️ 删除选中项 (${checkedCount})`;
    }

    function renderMatchList(container, matches) {
        let html = '';
        const CONTEXT_CHARS = 40;

        matches.forEach((m, idx) => {
            const locationStr = m.source === 'worldbook'
                ? `世界书 / ${m.category} / ${m.entryName}`
                : `记忆${m.memoryIndex + 1} / ${m.category} / ${m.entryName}`;

            const typeLabels = { full: '完整标签', 'close-only': '开头不闭合', 'open-only': '末尾不闭合' };
            const typeColors = { full: '#3498db', 'close-only': '#e67e22', 'open-only': '#9b59b6' };

            const beforeStart = Math.max(0, m.startInText - CONTEXT_CHARS);
            const beforeText = m.fullText.substring(beforeStart, m.startInText);
            const beforePrefix = beforeStart > 0 ? '...' : '';

            const deletedFull = m.matchedText;
            const deletedDisplay = deletedFull.length > 200
                ? `${deletedFull.substring(0, 100)}\n... (${deletedFull.length}字) ...\n${deletedFull.substring(deletedFull.length - 80)}`
                : deletedFull;

            const afterEnd = Math.min(m.fullText.length, m.endInText + CONTEXT_CHARS);
            const afterText = m.fullText.substring(m.endInText, afterEnd);
            const afterSuffix = afterEnd < m.fullText.length ? '...' : '';

            const escapedBefore = (beforePrefix + beforeText).replace(/</g, '<').replace(/>/g, '>').replace(/\n/g, '↵');
            const escapedDeleted = deletedDisplay.replace(/</g, '<').replace(/>/g, '>').replace(/\n/g, '↵');
            const escapedAfter = (afterText + afterSuffix).replace(/</g, '<').replace(/>/g, '>').replace(/\n/g, '↵');

            html += `
                <div style="margin-bottom:10px;padding:10px;background:rgba(0,0,0,0.2);border-radius:6px;border-left:3px solid ${typeColors[m.type] || '#888'};">
                    <div style="display:flex;align-items:center;gap:8px;margin-bottom:8px;">
                        <input type="checkbox" class="ttw-clean-match-cb" data-index="${idx}" checked style="width:16px;height:16px;accent-color:#e74c3c;flex-shrink:0;">
                        <div style="flex:1;min-width:0;">
                            <div style="font-size:10px;color:#888;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;" title="${locationStr}">${locationStr}</div>
                            <div style="font-size:10px;margin-top:2px;">
                                <span style="color:${typeColors[m.type]};font-weight:bold;">${typeLabels[m.type]}</span>
                                <span style="color:#888;margin-left:6px;"><${m.tag}> · ${m.matchedText.length}字</span>
                            </div>
                        </div>
                    </div>
                    <div style="font-family:monospace;font-size:11px;line-height:1.6;background:rgba(0,0,0,0.3);padding:8px;border-radius:4px;word-break:break-all;overflow-x:auto;">
                        <span style="color:#888;">${escapedBefore}</span><span style="background:rgba(231,76,60,0.4);color:#ff6b6b;text-decoration:line-through;border:1px dashed #e74c3c;padding:1px 2px;border-radius:2px;">${escapedDeleted}</span><span style="color:#888;">${escapedAfter}</span>
                    </div>
                </div>
            `;
        });

        container.innerHTML = html;
        container.querySelectorAll('.ttw-clean-match-cb').forEach((cb) => {
            cb.addEventListener('change', () => {
                const modal = container.closest('.ttw-modal-container');
                if (modal) updateExecBtnCount(modal);
            });
        });
    }

    function showCleanTagsModal() {
        const existingModal = document.getElementById('ttw-clean-tags-modal');
        if (existingModal) existingModal.remove();

        const bodyHtml = `
		<div style="margin-bottom:16px;padding:12px;background:rgba(52,152,219,0.15);border-radius:8px;">
			<div style="font-size:12px;color:#ccc;">
				纯本地处理，不调用AI，不消耗Token。<br>
				扫描后逐条列出匹配，可以单独确认或取消每一条删除。
			</div>
		</div>

		<div style="margin-bottom:16px;">
			<label style="display:block;margin-bottom:8px;font-size:13px;font-weight:bold;">要清除的标签名（每行一个）</label>
			<textarea id="ttw-clean-tags-input" rows="4" class="ttw-textarea-small" placeholder="每行一个标签名，例如：
thinking
tucao
tochao">thinking\ntucao\ntochao</textarea>
		</div>

		<div style="margin-bottom:16px;padding:12px;background:rgba(230,126,34,0.1);border-radius:6px;">
			<div style="font-weight:bold;color:#e67e22;margin-bottom:8px;font-size:12px;">📋 匹配规则</div>
			<ul style="margin:0;padding-left:18px;font-size:11px;color:#ccc;line-height:1.8;">
				<li><code>&lt;tag&gt;内容&lt;/tag&gt;</code> → 移除标签和标签内的内容</li>
				<li>文本开头就是 <code>...内容&lt;/tag&gt;</code> → 移除开头到该结束标签</li>
				<li>文本末尾有 <code>&lt;tag&gt;内容...</code> 无闭合 → 移除该开始标签到末尾</li>
			</ul>
			<div style="font-size:11px;color:#f39c12;margin-top:6px;">⚠️ 每条匹配都会显示前后文字，请逐条确认再删除</div>
		</div>

		<div style="margin-bottom:16px;">
			<label class="ttw-checkbox-label">
				<input type="checkbox" id="ttw-clean-in-worldbook" checked>
				<span>扫描世界书</span>
			</label>
			<label class="ttw-checkbox-label" style="margin-top:8px;">
				<input type="checkbox" id="ttw-clean-in-results" checked>
				<span>扫描各章节处理结果</span>
			</label>
		</div>

		<div id="ttw-clean-tags-results" style="display:none;">
			<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;">
				<span id="ttw-clean-scan-summary" style="font-weight:bold;color:#27ae60;"></span>
				<div style="display:flex;gap:8px;">
					<button class="ttw-btn-tiny" id="ttw-clean-select-all">全选</button>
					<button class="ttw-btn-tiny" id="ttw-clean-deselect-all">全不选</button>
				</div>
			</div>
			<div id="ttw-clean-match-list" style="max-height:350px;overflow-y:auto;background:rgba(0,0,0,0.2);border-radius:6px;padding:8px;"></div>
		</div>`;

        const footerHtml = `
		<button class="ttw-btn ttw-btn-primary" id="ttw-scan-tags">🔍 扫描</button>
		<button class="ttw-btn ttw-btn-warning" id="ttw-execute-clean-tags" style="display:none;">🗑️ 删除选中项</button>
		<button class="ttw-btn" id="ttw-close-clean-tags">关闭</button>`;

        const modal = ModalFactory.create({
            id: 'ttw-clean-tags-modal',
            title: '🏷️ 清除标签内容（不消耗Token）',
            body: bodyHtml,
            footer: footerHtml,
            maxWidth: '750px',
        });

        let scanResults = [];
        modal.querySelector('#ttw-close-clean-tags').addEventListener('click', () => ModalFactory.close(modal));

        modal.querySelector('#ttw-scan-tags').addEventListener('click', () => {
            const tagNames = parseTagNames(modal.querySelector('#ttw-clean-tags-input').value);
            if (tagNames.length === 0) {
                ErrorHandler.showUserError('请输入至少一个标签名');
                return;
            }

            const inWorldbook = modal.querySelector('#ttw-clean-in-worldbook').checked;
            const inResults = modal.querySelector('#ttw-clean-in-results').checked;
            scanResults = scanForTags(tagNames, inWorldbook, inResults);

            const resultsDiv = modal.querySelector('#ttw-clean-tags-results');
            const summaryEl = modal.querySelector('#ttw-clean-scan-summary');
            const listEl = modal.querySelector('#ttw-clean-match-list');
            const execBtn = modal.querySelector('#ttw-execute-clean-tags');
            resultsDiv.style.display = 'block';

            if (scanResults.length === 0) {
                summaryEl.textContent = '未找到匹配的标签内容';
                summaryEl.style.color = '#888';
                listEl.innerHTML = '';
                execBtn.style.display = 'none';
                return;
            }

            summaryEl.textContent = `找到 ${scanResults.length} 处匹配`;
            summaryEl.style.color = '#27ae60';
            execBtn.style.display = 'inline-block';
            execBtn.textContent = `🗑️ 删除选中项 (${scanResults.length})`;

            renderMatchList(listEl, scanResults);
        });

        modal.querySelector('#ttw-clean-select-all').addEventListener('click', () => {
            modal.querySelectorAll('.ttw-clean-match-cb').forEach((cb) => { cb.checked = true; });
            updateExecBtnCount(modal);
        });

        modal.querySelector('#ttw-clean-deselect-all').addEventListener('click', () => {
            modal.querySelectorAll('.ttw-clean-match-cb').forEach((cb) => { cb.checked = false; });
            updateExecBtnCount(modal);
        });

        modal.querySelector('#ttw-execute-clean-tags').addEventListener('click', async () => {
            const selectedIndices = [...modal.querySelectorAll('.ttw-clean-match-cb:checked')]
                .map((cb) => parseInt(cb.dataset.index, 10));
            if (selectedIndices.length === 0) {
                ErrorHandler.showUserError('请至少选择一项');
                return;
            }

            const confirmed = await confirmAction(
                `确定要删除选中的 ${selectedIndices.length} 处标签内容吗？\n\n请确认预览无误！此操作不可撤销！`,
                { title: '删除标签内容', danger: true },
            );
            if (!confirmed) return;

            const toDelete = selectedIndices.map((i) => scanResults[i]).filter(Boolean);
            const grouped = groupMatchesBySource(toDelete);

            let deletedCount = 0;
            for (const key in grouped) {
                const matches = grouped[key];
                matches.sort((a, b) => b.startInText - a.startInText);

                const textRef = getTextRef(matches[0]);
                if (!textRef) continue;

                let text = textRef.get();
                for (const m of matches) {
                    const before = text.substring(0, m.startInText);
                    const after = text.substring(m.endInText);
                    text = before + after;
                    deletedCount++;
                }
                text = text.replace(/\n{3,}/g, '\n\n').trim();
                textRef.set(text);
            }

            ModalFactory.close(modal);
            if (typeof updateWorldbookPreview === 'function') updateWorldbookPreview();
            ErrorHandler.showUserSuccess(`清除完成！共删除 ${deletedCount} 处标签内容`);
        });
    }

    function escapeHtml(value) {
        return String(value || '')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    function parseRepeatedSegments(input) {
        const raw = String(input || '').replace(/\r\n?/g, '\n').trim();
        if (!raw) return [];

        const blocks = raw
            .split(/\n\s*\n+/)
            .map((item) => item.trim())
            .filter(Boolean);

        const source = blocks.length > 1
            ? blocks
            : raw
                .split('\n')
                .map((item) => item.trim())
                .filter(Boolean);

        const unique = [];
        const seen = new Set();
        for (const item of source) {
            if (!item || seen.has(item)) continue;
            seen.add(item);
            unique.push(item);
        }
        return unique;
    }

    function countOccurrences(text, pattern) {
        const source = String(text || '');
        const target = String(pattern || '');
        if (!source || !target) return 0;

        let count = 0;
        let cursor = 0;
        while (cursor <= source.length - target.length) {
            const at = source.indexOf(target, cursor);
            if (at < 0) break;
            count += 1;
            cursor = at + target.length;
        }
        return count;
    }

    function getTargetChapterIndices(mode, selectedSet) {
        const queue = Array.isArray(AppState.memory.queue) ? AppState.memory.queue : [];
        const all = queue.map((_, idx) => idx);

        if (mode === 'all') return all;
        if (mode === 'unprocessed') {
            return all.filter((idx) => {
                const memory = queue[idx] || {};
                return !isWorldbookDone(memory);
            });
        }

        const selected = selectedSet instanceof Set
            ? [...selectedSet].filter((idx) => Number.isInteger(idx) && idx >= 0 && idx < queue.length)
            : [];
        return selected.sort((a, b) => a - b);
    }

    function buildCleanupPreview(segments, chapterIndices) {
        const queue = Array.isArray(AppState.memory.queue) ? AppState.memory.queue : [];
        const segmentHits = segments.map((seg) => ({ segment: seg, hits: 0 }));
        const chapterStats = [];

        let totalHits = 0;
        let totalRemovedChars = 0;

        for (const index of chapterIndices) {
            const memory = queue[index] || {};
            const content = String(memory.content || '');
            let chapterHits = 0;
            let chapterRemovedChars = 0;

            segments.forEach((segment, segIdx) => {
                const hits = countOccurrences(content, segment);
                if (hits <= 0) return;
                chapterHits += hits;
                chapterRemovedChars += hits * segment.length;
                segmentHits[segIdx].hits += hits;
            });

            if (chapterHits > 0) {
                chapterStats.push({
                    index,
                    chapterTitle: String(memory.chapterTitle || `第${index + 1}章`),
                    memoryTitle: String(memory.title || `记忆${index + 1}`),
                    processed: isWorldbookDone(memory),
                    hits: chapterHits,
                    removedChars: chapterRemovedChars,
                });
                totalHits += chapterHits;
                totalRemovedChars += chapterRemovedChars;
            }
        }

        return {
            chapterStats,
            totalHits,
            totalRemovedChars,
            segmentHits,
            hitChapterIndices: chapterStats.map((item) => item.index),
        };
    }

    function resetChapterRuntimeAfterContentCleanup(memory) {
        if (!memory || typeof memory !== 'object') return;
        memory.worldbookStatus = 'pending';
        memory.worldbookError = '';
        memory.worldbookProcessing = false;
        memory.directorStatus = 'pending';
        memory.directorError = '';
        memory.directorProcessing = false;
        memory.processed = false;
        memory.failed = false;
        memory.processing = false;
        memory.failedError = '';
        memory.result = null;
        memory.chapterOutline = '';
        memory.chapterOutlineStatus = 'pending';
        memory.chapterOutlineError = '';
        memory.chapterScript = { keyNodes: [], beats: [] };
        memory.chapterCurrentBeatIndex = 0;
        memory.directorDecision = null;
        memory.chapterOpeningPreview = '';
        memory.chapterOpeningSent = false;
        memory.chapterOpeningError = '';
    }

    function applyRepeatedSegmentsCleanup(segments, chapterIndices) {
        const queue = Array.isArray(AppState.memory.queue) ? AppState.memory.queue : [];
        const changedIndices = [];
        const resetProcessedIndices = [];
        let deletedHits = 0;
        let deletedChars = 0;

        for (const index of chapterIndices) {
            const memory = queue[index];
            if (!memory) continue;

            const original = String(memory.content || '');
            let next = original;
            let chapterHits = 0;
            let chapterDeletedChars = 0;

            for (const segment of segments) {
                const hits = countOccurrences(next, segment);
                if (hits <= 0) continue;
                chapterHits += hits;
                chapterDeletedChars += hits * segment.length;
                next = next.split(segment).join('');
            }

            if (chapterHits <= 0 || next === original) continue;

            if (isWorldbookDone(memory)) {
                resetProcessedIndices.push(index);
            }

            memory.content = next;
            resetChapterRuntimeAfterContentCleanup(memory);

            changedIndices.push(index);
            deletedHits += chapterHits;
            deletedChars += chapterDeletedChars;
        }

        if (changedIndices.length > 0) {
            const earliest = Math.min(...changedIndices);
            if (Number.isInteger(AppState.memory.startIndex)) {
                AppState.memory.startIndex = Math.min(AppState.memory.startIndex, earliest);
            } else {
                AppState.memory.startIndex = earliest;
            }

            if (Number.isInteger(AppState.memory.userSelectedIndex)
                && AppState.memory.userSelectedIndex > earliest) {
                AppState.memory.userSelectedIndex = earliest;
            }
        }

        return {
            changedIndices,
            resetProcessedIndices,
            deletedHits,
            deletedChars,
        };
    }

    function previewRepeatedSegmentsCleanup(options = {}) {
        const {
            inputText = '',
            rangeMode = 'all',
            selectedIndices = [],
        } = options;

        const segments = parseRepeatedSegments(inputText);
        if (segments.length === 0) {
            return {
                ok: false,
                error: '请先输入至少一个重复片段',
                segments: [],
                chapterIndices: [],
                preview: null,
            };
        }

        const selectedSet = selectedIndices instanceof Set
            ? selectedIndices
            : new Set(
                Array.isArray(selectedIndices)
                    ? selectedIndices
                        .map((item) => Number.parseInt(item, 10))
                        .filter((item) => Number.isInteger(item) && item >= 0)
                    : [],
            );

        const chapterIndices = getTargetChapterIndices(rangeMode, selectedSet);
        if (chapterIndices.length === 0) {
            return {
                ok: false,
                error: '当前范围未选中任何章节',
                segments,
                chapterIndices: [],
                preview: null,
            };
        }

        const preview = buildCleanupPreview(segments, chapterIndices);
        return {
            ok: true,
            error: '',
            rangeMode,
            segments,
            chapterIndices,
            preview,
        };
    }

    function executeRepeatedSegmentsCleanup(options = {}) {
        const {
            segments = [],
            chapterIndices = [],
        } = options;

        if (!Array.isArray(segments) || segments.length === 0) {
            return {
                ok: false,
                error: '请先预览并确认有命中内容',
                result: null,
            };
        }

        if (!Array.isArray(chapterIndices) || chapterIndices.length === 0) {
            return {
                ok: false,
                error: '当前范围未选中任何章节',
                result: null,
            };
        }

        const result = applyRepeatedSegmentsCleanup(segments, chapterIndices);

        if (result.changedIndices.length > 0) {
            if (typeof updateMemoryQueueUI === 'function') {
                updateMemoryQueueUI();
            }
            if (typeof updateStartButtonState === 'function') {
                updateStartButtonState(false);
            }
            if (typeof updateWorldbookPreview === 'function') {
                updateWorldbookPreview();
            }
        }

        return {
            ok: true,
            error: '',
            result,
        };
    }

    function buildChapterCheckboxList(selectedIndices) {
        const queue = Array.isArray(AppState.memory.queue) ? AppState.memory.queue : [];
        return queue.map((memory, idx) => {
            const checked = selectedIndices.has(idx) ? 'checked' : '';
            const chapterTitle = escapeHtml(memory?.chapterTitle || `第${idx + 1}章`);
            const memoryTitle = escapeHtml(memory?.title || `记忆${idx + 1}`);
            const isProcessed = isWorldbookDone(memory);
            const status = isProcessed
                ? '<span style="font-size:10px;color:#f39c12;">已处理</span>'
                : '<span style="font-size:10px;color:#2ecc71;">未处理</span>';

            return `
                <label style="display:flex;align-items:center;gap:8px;padding:6px 8px;border-bottom:1px dashed rgba(255,255,255,0.08);">
                    <input type="checkbox" class="ttw-clean-repeat-chapter-cb" data-index="${idx}" ${checked}>
                    <span style="flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${chapterTitle} · ${memoryTitle}</span>
                    ${status}
                </label>
            `;
        }).join('');
    }

    function renderCleanupPreview(modal, preview) {
        const summary = modal.querySelector('#ttw-clean-repeat-summary');
        const resultWrap = modal.querySelector('#ttw-clean-repeat-results');
        const details = modal.querySelector('#ttw-clean-repeat-details');
        const executeBtn = modal.querySelector('#ttw-execute-clean-repeat');
        if (!summary || !resultWrap || !details || !executeBtn) return;

        resultWrap.style.display = 'block';

        if (!preview || preview.totalHits <= 0) {
            summary.innerHTML = '<span style="color:#95a5a6;">预览完成：未命中任何重复片段。</span>';
            details.innerHTML = '';
            executeBtn.disabled = true;
            executeBtn.textContent = '🧹 执行删除';
            return;
        }

        const topChapters = preview.chapterStats.slice(0, 20);
        const chapterLines = topChapters.map((item) => {
            const chapter = escapeHtml(item.chapterTitle || `第${item.index + 1}章`);
            const processedBadge = item.processed
                ? '<span style="color:#f39c12;">已处理</span>'
                : '<span style="color:#2ecc71;">未处理</span>';
            return `<li>${chapter}：命中 ${item.hits} 次，删除 ${item.removedChars} 字（${processedBadge}）</li>`;
        }).join('');

        const topSegments = preview.segmentHits
            .filter((item) => item.hits > 0)
            .sort((a, b) => b.hits - a.hits)
            .slice(0, 8)
            .map((item) => `<li>片段「${escapeHtml(item.segment.slice(0, 40))}${item.segment.length > 40 ? '...' : ''}」命中 ${item.hits} 次</li>`)
            .join('');

        summary.innerHTML = `
            <div style="color:#2ecc71;font-weight:bold;">预览命中 ${preview.totalHits} 次，涉及 ${preview.chapterStats.length} 章，预计删除 ${preview.totalRemovedChars} 字。</div>
            <div style="font-size:11px;color:#aaa;margin-top:4px;">提示：执行后受影响章节将重置为未处理状态，请从最早受影响章节重新转换。</div>
        `;

        details.innerHTML = `
            <div style="margin-bottom:8px;font-size:12px;color:#ddd;">章节命中明细（最多显示20条）</div>
            <ul style="margin:0 0 10px 16px;padding:0;line-height:1.7;">${chapterLines}</ul>
            <div style="margin-bottom:6px;font-size:12px;color:#ddd;">片段命中统计（Top 8）</div>
            <ul style="margin:0 0 0 16px;padding:0;line-height:1.7;">${topSegments || '<li>无</li>'}</ul>
        `;

        executeBtn.disabled = false;
        executeBtn.textContent = `🧹 执行删除（${preview.totalHits} 处）`;
    }

    function showBatchDeleteRepeatedSegmentsModal() {
        if (!Array.isArray(AppState.memory.queue) || AppState.memory.queue.length === 0) {
            ErrorHandler.showUserError('请先导入TXT并生成章节队列');
            return;
        }

        const existing = document.getElementById('ttw-clean-repeat-modal');
        if (existing) existing.remove();

        const defaultSelected = new Set(AppState.memory.queue.map((_, idx) => idx));
        const bodyHtml = `
            <div style="margin-bottom:14px;padding:12px;background:rgba(46,204,113,0.12);border-radius:8px;">
                <div style="font-size:12px;color:#d6ffe6;line-height:1.8;">
                    粘贴你想删除的重复片段（如广告语、作者签名、固定尾注），先预览命中，再执行删除。<br>
                    匹配方式为精确字面量匹配，不使用正则。
                </div>
            </div>

            <div style="margin-bottom:12px;">
                <label style="display:block;margin-bottom:8px;font-size:13px;font-weight:bold;">重复片段输入（空行分段；若无空行则按行处理）</label>
                <textarea id="ttw-clean-repeat-input" rows="8" class="ttw-textarea-small" placeholder="例如：\n（月影霜华 作者:江东孙伯父）\n\n本章完\n\n请收藏本站..."></textarea>
                <div id="ttw-clean-repeat-parse-hint" style="margin-top:6px;font-size:11px;color:#95a5a6;">尚未解析片段</div>
            </div>

            <div style="margin-bottom:12px;padding:10px;background:rgba(52,152,219,0.1);border-radius:6px;">
                <div style="font-size:12px;font-weight:bold;margin-bottom:8px;color:#7ec8ff;">作用范围</div>
                <label style="display:block;margin-bottom:6px;"><input type="radio" name="ttw-clean-repeat-range" value="all" checked> 全部章节</label>
                <label style="display:block;margin-bottom:6px;"><input type="radio" name="ttw-clean-repeat-range" value="unprocessed"> 仅未处理章节</label>
                <label style="display:block;"><input type="radio" name="ttw-clean-repeat-range" value="custom"> 自定义章节（支持多选）</label>
            </div>

            <div id="ttw-clean-repeat-custom-wrap" style="display:none;margin-bottom:12px;padding:10px;background:rgba(0,0,0,0.18);border-radius:6px;">
                <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">
                    <span style="font-size:12px;color:#ddd;">章节多选</span>
                    <div style="display:flex;gap:8px;">
                        <button class="ttw-btn-tiny" id="ttw-clean-repeat-select-all">全选章节</button>
                        <button class="ttw-btn-tiny" id="ttw-clean-repeat-select-none">清空选择</button>
                    </div>
                </div>
                <div id="ttw-clean-repeat-chapter-list" style="max-height:220px;overflow-y:auto;border:1px solid rgba(255,255,255,0.08);border-radius:6px;"></div>
            </div>

            <div id="ttw-clean-repeat-results" style="display:none;margin-top:12px;padding:10px;background:rgba(0,0,0,0.2);border-radius:6px;">
                <div id="ttw-clean-repeat-summary" style="margin-bottom:8px;"></div>
                <div id="ttw-clean-repeat-details" style="font-size:12px;color:#ddd;"></div>
            </div>
        `;

        const footerHtml = `
            <button class="ttw-btn ttw-btn-primary" id="ttw-preview-clean-repeat">🔍 预览命中</button>
            <button class="ttw-btn ttw-btn-warning" id="ttw-execute-clean-repeat" disabled>🧹 执行删除</button>
            <button class="ttw-btn" id="ttw-close-clean-repeat">关闭</button>
        `;

        const modal = ModalFactory.create({
            id: 'ttw-clean-repeat-modal',
            title: '🧹 批量删除重复段落',
            body: bodyHtml,
            footer: footerHtml,
            maxWidth: '860px',
        });

        const customWrap = modal.querySelector('#ttw-clean-repeat-custom-wrap');
        const chapterList = modal.querySelector('#ttw-clean-repeat-chapter-list');
        const parseHint = modal.querySelector('#ttw-clean-repeat-parse-hint');
        const previewBtn = modal.querySelector('#ttw-preview-clean-repeat');
        const executeBtn = modal.querySelector('#ttw-execute-clean-repeat');
        const resultWrap = modal.querySelector('#ttw-clean-repeat-results');
        const inputEl = modal.querySelector('#ttw-clean-repeat-input');
        const rangeEls = modal.querySelectorAll('input[name="ttw-clean-repeat-range"]');

        if (chapterList) {
            chapterList.innerHTML = buildChapterCheckboxList(defaultSelected);
        }

        let previewState = null;

        const markPreviewDirty = () => {
            previewState = null;
            if (executeBtn) {
                executeBtn.disabled = true;
                executeBtn.textContent = '🧹 执行删除';
            }
            if (resultWrap) resultWrap.style.display = 'none';
        };

        const getRangeMode = () => {
            const selected = modal.querySelector('input[name="ttw-clean-repeat-range"]:checked');
            return selected ? selected.value : 'all';
        };

        const getCustomSelectedSet = () => {
            const set = new Set();
            modal.querySelectorAll('.ttw-clean-repeat-chapter-cb:checked').forEach((el) => {
                const idx = Number.parseInt(el.dataset.index, 10);
                if (Number.isInteger(idx)) set.add(idx);
            });
            return set;
        };

        const refreshParseHint = () => {
            const segments = parseRepeatedSegments(inputEl?.value || '');
            if (parseHint) {
                parseHint.textContent = segments.length > 0
                    ? `已解析 ${segments.length} 个待删片段（去重后）`
                    : '尚未解析片段';
            }
        };

        modal.querySelector('#ttw-close-clean-repeat')?.addEventListener('click', () => {
            ModalFactory.close(modal);
        });

        modal.querySelector('#ttw-clean-repeat-select-all')?.addEventListener('click', () => {
            modal.querySelectorAll('.ttw-clean-repeat-chapter-cb').forEach((el) => {
                el.checked = true;
            });
            markPreviewDirty();
        });

        modal.querySelector('#ttw-clean-repeat-select-none')?.addEventListener('click', () => {
            modal.querySelectorAll('.ttw-clean-repeat-chapter-cb').forEach((el) => {
                el.checked = false;
            });
            markPreviewDirty();
        });

        rangeEls.forEach((el) => {
            el.addEventListener('change', () => {
                if (customWrap) {
                    customWrap.style.display = getRangeMode() === 'custom' ? 'block' : 'none';
                }
                markPreviewDirty();
            });
        });

        modal.querySelectorAll('.ttw-clean-repeat-chapter-cb').forEach((el) => {
            el.addEventListener('change', () => markPreviewDirty());
        });

        inputEl?.addEventListener('input', () => {
            refreshParseHint();
            markPreviewDirty();
        });

        refreshParseHint();

        previewBtn?.addEventListener('click', () => {
            const segments = parseRepeatedSegments(inputEl?.value || '');
            if (segments.length === 0) {
                ErrorHandler.showUserError('请先输入至少一个重复片段');
                return;
            }

            const mode = getRangeMode();
            const chapterIndices = getTargetChapterIndices(mode, getCustomSelectedSet());
            if (chapterIndices.length === 0) {
                ErrorHandler.showUserError('当前范围未选中任何章节');
                return;
            }

            const preview = buildCleanupPreview(segments, chapterIndices);
            previewState = {
                segments,
                mode,
                chapterIndices,
                preview,
            };

            renderCleanupPreview(modal, preview);
        });

        executeBtn?.addEventListener('click', async () => {
            if (!previewState || !previewState.preview || previewState.preview.totalHits <= 0) {
                ErrorHandler.showUserError('请先预览并确认有命中内容');
                return;
            }

            const processedHitIndices = previewState.preview.chapterStats
                .filter((item) => item.processed)
                .map((item) => item.index);

            if (processedHitIndices.length > 0) {
                const confirmProcessed = await confirmAction(
                    `命中了 ${processedHitIndices.length} 个已处理章节。执行后这些章节会重置为未处理，需要重新转换。\n\n是否继续？`,
                    { title: '已处理章节将重置', danger: true },
                );
                if (!confirmProcessed) return;
            }

            const confirmed = await confirmAction(
                `确定执行删除吗？\n\n将删除 ${previewState.preview.totalHits} 处重复片段，涉及 ${previewState.preview.chapterStats.length} 章。`,
                { title: '确认批量删除', danger: true },
            );
            if (!confirmed) return;

            const result = applyRepeatedSegmentsCleanup(previewState.segments, previewState.chapterIndices);

            if (typeof updateMemoryQueueUI === 'function') {
                updateMemoryQueueUI();
            }
            if (typeof updateStartButtonState === 'function') {
                updateStartButtonState(false);
            }
            if (typeof updateWorldbookPreview === 'function') {
                updateWorldbookPreview();
            }

            ModalFactory.close(modal);

            if (result.changedIndices.length === 0) {
                ErrorHandler.showUserError('执行完成，但没有检测到可删除内容');
                return;
            }

            const resetCount = result.resetProcessedIndices.length;
            const suffix = resetCount > 0
                ? `，其中 ${resetCount} 章原为已处理，已重置为未处理`
                : '';
            ErrorHandler.showUserSuccess(
                `清洗完成：删除 ${result.deletedHits} 处，影响 ${result.changedIndices.length} 章，共移除约 ${result.deletedChars} 字${suffix}`,
            );
        });
    }

    return {
        showCleanTagsModal,
        showBatchDeleteRepeatedSegmentsModal,
        previewRepeatedSegmentsCleanup,
        executeRepeatedSegmentsCleanup,
    };
}
