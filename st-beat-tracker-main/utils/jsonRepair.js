// utils/jsonRepair.js
import { sbtConsole } from './sbtConsole.js';

export function repairAndParseJson(jsonString, dependencies = {}) {
    const { 
        warn = sbtConsole.warn, 
        diagnose = sbtConsole.error, 
        info = sbtConsole.log 
    } = dependencies;

    let repairedString = jsonString;
    const maxAttempts = 20; // 设置一个上限，防止无限循环

    for (let i = 0; i < maxAttempts; i++) {
        try {
            // 尝试解析，如果成功，立即返回结果
            return JSON.parse(repairedString);
        } catch (error) {
            if (error instanceof SyntaxError) {
                warn(`[JSON Repair] 第 ${i + 1} 次尝试解析失败: ${error.message}`);
                
                const match = error.message.match(/position (\d+)|at position (\d+)/);
                if (!match) {
                    diagnose("[JSON Repair] 无法从错误信息中提取位置，修复失败。");
                    throw error;
                }
                
                const errorPos = parseInt(match[1] || match[2], 10);
                const quotePos = repairedString.lastIndexOf('"', errorPos - 1);

                if (quotePos !== -1) {
                    repairedString = repairedString.slice(0, quotePos) + '\\' + repairedString.slice(quotePos);
                    info(`[JSON Repair] 已在位置 ${quotePos} 尝试插入转义符。将进行下一次解析...`);
                    continue;
                } else {
                     diagnose("[JSON Repair] 未能在错误位置前找到需要修复的双引号。");
                     throw error;
                }
            } else {
                throw error;
            }
        }
    }
    
    throw new Error(`[JSON Repair] 在 ${maxAttempts} 次尝试后，仍未能修复JSON。`);
}
