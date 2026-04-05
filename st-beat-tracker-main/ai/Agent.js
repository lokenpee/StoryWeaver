// ai/Agent.js

/**
 * Agent Class - AI智能体抽象基类
 * 定义了所有AI智能体必须遵守的共同契约（接口）和通用功能。
 */
export class Agent {
    constructor(dependencies) {
        if (!dependencies || !dependencies.diagnose) {
            throw new Error("Agent初始化失败：核心依赖项 diagnose 缺失。");
        }
        
        this.deps = dependencies;

        this.llmService = dependencies.llmService;
        this.log = dependencies.log;
        this.info = dependencies.info;
        this.warn = dependencies.warn;
        this.diagnose = dependencies.diagnose;
        this.extractJsonFromString = dependencies.extractJsonFromString;
        this.toastr = dependencies.toastr;

    }

    async execute(context) {
        throw new Error("`execute` 方法必须在子类中被实现！");
    }

    _stripLogicCheckBlock(text) {
        if (!text || typeof text !== 'string') {
            return text;
        }
        return text.replace(/<LOGIC_CHECK>[\s\S]*?<\/LOGIC_CHECK>\s*/g, '').trim();
    }
}
