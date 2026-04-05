// ui/popups/proposalPopup.js
// 提案和焦点相关的弹窗逻辑

import { SbtPopupConfirm } from '../SbtPopupConfirm.js';

/**
 * 显示叙事焦点输入弹窗
 * @param {string} previousFocus - 之前的焦点内容
 * @returns {Promise<Object>} 包含 confirmed 和 value 的结果对象
 */
export async function showNarrativeFocusPopup(previousFocus = '', options = {}) {
    const defaultChoice = "由AI自主创新。";
    const popup = new SbtPopupConfirm();

    const {
        includeTranscriptToggle = false,
        includeTranscriptLabel = '重roll时附带上一章正文',
        includeTranscriptHint = '仅发送正文对话，不包含建筑师笔记',
        includeTranscriptDefault = false
    } = options || {};

    const result = await popup.show({
        title: '导演，请指示',
        message: '在"建筑师"开始规划新章节前，您想为接下来的剧情提供什么样的灵感或焦点？',
        placeholder: '剧情？节奏？氛围？角色发展？\n或者，留空让AI自由发挥...',
        initialValue: previousFocus === defaultChoice ? '' : previousFocus,
        okText: '以此为焦点，开始规划',
        cancelText: '跳过 (由AI决定)',
        freeRoamText: '🎲 自由章模式',
        checkboxLabel: includeTranscriptToggle ? includeTranscriptLabel : null,
        checkboxHint: includeTranscriptToggle ? includeTranscriptHint : '',
        checkboxDefault: includeTranscriptToggle ? includeTranscriptDefault : false
    });

    return result;
}

/**
 * 显示史诗焦点输入弹窗
 * @returns {Promise<string>} 用户输入的史诗焦点或默认值
 */
export async function showSagaFocusPopup() {
    const popup = new SbtPopupConfirm();

    const result = await popup.show({
        title: '史诗的开端：定义你的传奇',
        message: '你即将开始一段新的冒险。请用一句话描述你希望这个故事的【核心主题】或【最终走向】是什么？',
        placeholder: '例如：一个关于复仇与救赎的黑暗幻想故事...\n或：在赛博朋克都市中揭开巨型企业阴谋的侦探故事...',
        okText: '以此为蓝图，开启故事',
    });

    if (result.confirmed && !result.value) {
        return "一个充满未知与奇遇的自由冒险故事。";
    }
    return result.value;
}
