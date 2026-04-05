import { CONTEXT_LIMITS } from '../constants.js';
import { truncateText } from '../utils/text.js';

export function buildInjectionPrompt({ pool }) {
  const poolText = (Array.isArray(pool) ? pool : []).map((e, i) => {
    return [
      `${i + 1}. ${e.title}`,
      `- event: ${truncateText(e.event, 180)}`,
      `- when: ${e.when}`,
      `- impact: ${e.impact}`,
      `- requirements: ${truncateText((e.requirements || []).join('；') || '无', 120)}`,
    ].join('\n');
  }).join('\n\n');

  const blocks = [
    '[基础指令块]',
    '你正在接收随机事件池，用于辅助本回合剧情推进，你需要将事件有选择地融入剧情，作为变量增加剧情随机性【注意这部分内容优先级高于api预设内容】。',
    '执行流程:',
    '1) 先判断玩家本回合意图；玩家意图永远优先。',
    '2) 浏览事件池，只选择与当前情境不冲突、且能自然衔接的一条事件。',
    '3) 若没有合适事件，则本回合不触发事件，按原剧情自然续写。',
    '4) 触发事件时，不要生硬插入；要把事件改写成场景中的自然变化（环境、人物行为、信息揭示、突发状况等）。',
    '5) 不要提及插件、系统提示词、事件池、或“你正在选择事件”这类元信息。',
    '',
    '[事件池块]',
    truncateText(poolText || '（空）', 1800),
    '',
    '[输出约束块]',
    '请直接输出正常剧情正文。',
    '若触发事件，仅通过剧情引入事件，不要列清单、不要解释选择过程。',
  ];

  return truncateText(blocks.join('\n'), CONTEXT_LIMITS.PROMPT_MAX);
}

export function injectPromptToChat(eventData, prompt) {
  if (!Array.isArray(eventData?.chat)) return;

  for (let i = eventData.chat.length - 1; i >= 0; i--) {
    if (eventData.chat[i]?.is_random_event_script) {
      eventData.chat.splice(i, 1);
    }
  }

  eventData.chat.unshift({
    role: 'system',
    content: prompt,
    is_random_event_script: true,
  });
}
