import { sbtConsole } from './utils/sbtConsole.js';
// 临时调试脚本 - 用于检查Story Summary存储状态
// 在浏览器控制台运行此文件来诊断问题

export function debugStorySummaryStorage() {
    const context = SillyTavern.getContext();
    const chat = context.chat;

    sbtConsole.group('📊 Story Summary 存储诊断');

    // 1. 检查 chatMetadata.leader
    sbtConsole.group('1️⃣ 全局元数据 (chatMetadata.leader)');
    if (context.chatMetadata?.leader) {
        sbtConsole.log('✅ chatMetadata.leader 存在');
        sbtConsole.log('Summary:', context.chatMetadata.leader.meta?.longTermStorySummary);
        sbtConsole.log('完整数据:', context.chatMetadata.leader);
    } else {
        sbtConsole.log('❌ chatMetadata.leader 不存在');
    }
    sbtConsole.groupEnd();

    // 2. 扫描所有带 leader 字段的消息
    sbtConsole.group('2️⃣ 扫描聊天记录中的 leader 锚点');
    let leaderCount = 0;
    for (let i = 0; i < chat.length; i++) {
        if (chat[i]?.leader) {
            leaderCount++;
            sbtConsole.group(`📌 消息 #${i} (${chat[i].is_user ? '用户' : 'AI'})`);
            sbtConsole.log('章节UID:', chat[i].leader.uid);
            sbtConsole.log('');
            sbtConsole.log('📂 meta.longTermStorySummary:');
            sbtConsole.log('  ', chat[i].leader.meta?.longTermStorySummary?.substring(0, 150) + '...');
            sbtConsole.log('');
            sbtConsole.log('🗑️ 老路径 longTermStorySummary (应该为空):');
            sbtConsole.log('  ', chat[i].leader.longTermStorySummary?.substring(0, 150) || '(不存在)');
            sbtConsole.log('');
            sbtConsole.log('🔗 章节衔接点存在:', !!chat[i].leader.meta?.lastChapterHandoff);
            sbtConsole.groupEnd();
            sbtConsole.log('');
        }
    }
    sbtConsole.log(`总计找到 ${leaderCount} 条带 leader 锚点的消息`);
    sbtConsole.groupEnd();

    // 3. 检查引擎将会加载哪条
    sbtConsole.group('3️⃣ 引擎恢复逻辑模拟');
    for (let i = chat.length - 1; i >= 0; i--) {
        const piece = chat[i];
        if (piece?.is_user === true) continue;
        if (piece?.leader) {
            sbtConsole.log(`✅ 引擎会从消息 #${i} 恢复状态`);
            sbtConsole.log('  Summary:', piece.leader.meta?.longTermStorySummary);
            break;
        }
    }
    sbtConsole.groupEnd();

    sbtConsole.groupEnd();
}

// 自动运行
if (typeof SillyTavern !== 'undefined') {
    debugStorySummaryStorage();
} else {
    sbtConsole.error('❌ 此脚本需要在 SillyTavern 环境中运行');
}
