/**
 * ChapterAnalyzer - 章节分析工具
 *
 * 提供章节数据提取和分析功能
 *
 * @file src/utils/ChapterAnalyzer.js
 * @module ChapterAnalyzer
 * @author Claude (重构自 StoryBeatEngine.js)
 * @date 2025-12-07
 */

/**
 * 章节分析工具类
 *
 * @class ChapterAnalyzer
 * @example
 * ChapterAnalyzer.processStarMarkedBeats(blueprint);
 * const beacons = ChapterAnalyzer.extractEndgameBeacons(scriptText);
 * const chapterId = ChapterAnalyzer.extractChapterId(scriptText);
 */
export class ChapterAnalyzer {
    /**
     * 处理节拍中的 ★ 星标标记
     *
     * 检测 description 是否以 ★ 开头，如果是则设置 is_highlight 并清理标记
     *
     * @static
     * @param {Object} blueprint - 章节蓝图对象
     * @param {Array} blueprint.plot_beats - 节拍数组
     * @param {Function} infoLogger - 信息日志函数（可选，用于输出处理信息）
     *
     * @example
     * const blueprint = {
     *   plot_beats: [
     *     { description: "★这是高光时刻" },
     *     { description: "普通节拍" }
     *   ]
     * };
     * ChapterAnalyzer.processStarMarkedBeats(blueprint, console.log);
     * // blueprint.plot_beats[0].is_highlight === true
     * // blueprint.plot_beats[0].description === "这是高光时刻"
     */
    static processStarMarkedBeats(blueprint, infoLogger = null) {
        if (!blueprint || !blueprint.plot_beats || !Array.isArray(blueprint.plot_beats)) {
            return;
        }

        let starCount = 0;
        blueprint.plot_beats.forEach((beat, index) => {
            if (beat.description && typeof beat.description === 'string') {
                const trimmed = beat.description.trim();
                if (trimmed.startsWith('★')) {
                    // 设置高光标记
                    beat.is_highlight = true;
                    // 清理描述中的 ★ 符号
                    beat.description = trimmed.substring(1).trim();
                    starCount++;

                    if (infoLogger) {
                        infoLogger(`[★ 星标检测] 节拍 ${index + 1} 被标记为高光节拍: ${beat.description.substring(0, 50)}...`);
                    }
                }
            }
        });

        if (starCount > 0 && infoLogger) {
            infoLogger(`[★ 星标统计] 本章共有 ${starCount} 个高光节拍`);
        }
    }

    /**
     * 从剧本纯文本中提取终章信标
     *
     * 查找 "## 四、事件触发逻辑与终章信标" 章节的内容
     *
     * @static
     * @param {string} scriptText - 完整的剧本字符串
     * @returns {string} 终章信标内容，或错误提示
     *
     * @example
     * const script = "## 四、事件触发逻辑与终章信标\n主角死亡即终章";
     * const beacons = ChapterAnalyzer.extractEndgameBeacons(script);
     * // 返回: "## 四、事件触发逻辑与终章信标\n主角死亡即终章"
     */
    static extractEndgameBeacons(scriptText = '') {
        const match = scriptText.match(/## 四、事件触发逻辑与终章信标[\s\S]*?(?=(?:## 五、|$))/);
        return match ? match[0].trim() : "【错误：未能提取终章信标】";
    }

    /**
     * 从剧本纯文本中提取章节ID
     *
     * 查找形如 "<第一卷>" 的章节标记
     *
     * @static
     * @param {string} scriptText - 完整的剧本字符串
     * @returns {string} 章节ID，或 "未知章节"
     *
     * @example
     * const script = "<第一卷> 开始冒险";
     * const id = ChapterAnalyzer.extractChapterId(script);
     * // 返回: "一卷"
     */
    static extractChapterId(scriptText = '') {
        const match = scriptText.match(/<第(.*?)>/);
        return match ? match[1].trim() : "未知章节";
    }
}
