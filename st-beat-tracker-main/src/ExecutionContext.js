// src/ExecutionContext.js

import { Chapter } from '../Chapter.js';

/**
 * ExecutionContext - 主动领域数据服务
 */
export class ExecutionContext {
    // 使用私有字段来保护原始数据源，防止外部直接访问
    #chapter;
    #eventData;
    #lastUserMessage;
    #lastAiMessage;

    /**
     * @param {object} contextData 
     * @param {Chapter} contextData.chapter - 必需的Chapter实例
     * @param {object} [contextData.eventData] - 可选的SillyTavern事件数据
     * @param {string} [contextData.lastUserMessage] - 可选的最后一条用户消息
     * @param {string} [contextData.lastAiMessage] - 可选的最后一条AI消息
     */
    constructor({ chapter, eventData = null, lastUserMessage = '', lastAiMessage = '' }) {
        if (!(chapter instanceof Chapter)) {
            throw new Error("ExecutionContext 必须使用一个有效的 Chapter 实例进行初始化。");
        }
        this.#chapter = chapter;
        this.#eventData = eventData;
        this.#lastUserMessage = lastUserMessage;
        this.#lastAiMessage = lastAiMessage;
    }

    // --- 为 DirectorAgent 设计的特定数据访问器 ---
    
    /**
     * 获取导演AI进行战术决策所需的所有信息。
     * @returns {{eventData: object, activeBeat: object, chapter: Chapter}}
     */
    forDirector() {
        return {
            eventData: this.#eventData,

            chapter: this.#chapter, // 传递整个chapter实例，因为导演需要访问角色矩阵等
        };
    }

    // --- 为 AnalystAgent 设计的特定数据访问器 ---

    /**
     * 获取分析师AI进行回合分析所需的所有信息。
     * @returns {{lastUserResponse: string, lastAiResponse: string, activeBeat: object, chapter: Chapter}}
     */
    forAnalyst() {
        return {
            lastUserResponse: this.#lastUserMessage,
            lastAiResponse: this.#lastAiMessage,
            chapter: this.#chapter,
        };
    } 
    /**
     * 获取固化AI进行场景总结所需的所有信息。
     * @param {string} beatId - 必需的、要固化的场景ID
     * @returns {{sceneText: string, interactionLog: any[], beatId: string, chapter: Chapter}}
     */
   forConsolidator(beatId) {
        if (!beatId) throw new Error("必须提供 beatId 才能为Consolidator获取上下文。");
        
        const sceneText = this.#chapter.beatSheet
            .filter(b => b.beatId === beatId)
            .map(b => b.storyText)
            .join('\n\n---\n\n');
            
        const interactionLog = this.#chapter.beatSheet
            .filter(b => b.beatId === beatId)
            .flatMap(b => b.relationshipCommentaries || [])
            .filter(Boolean);

        return {
            sceneText,
            interactionLog,
            beatId,
            chapter: this.#chapter, // 确保 chapter 实例被包含在返回的对象中
        };
    }

}
