import { EVIDENCE_TYPE, RULES } from '../constants.js';
import { randomInt } from '../utils/text.js';

function inferWhen(text) {
  if (/今晚|夜里|夜晚/.test(text)) return 'tonight';
  if (/明天|次日/.test(text)) return 'tomorrow';
  if (/立刻|马上|现在/.test(text)) return 'now';
  return 'soon';
}

function inferLocation(text) {
  const words = ['客厅', '卧室', '房间', '厨房', '门口', '小巷', '街道', '学校'];
  return words.find((w) => text.includes(w)) || 'unknown';
}

function buildEvidence({ preference, outline, worldbook, lastUser, lastAi }) {
  const evidence = [];

  if (preference) {
    evidence.push({ type: EVIDENCE_TYPE.PREFERENCE, snippet: `玩家偏好：${preference.slice(0, 60)}` });
  }
  if (outline) {
    evidence.push({ type: EVIDENCE_TYPE.OUTLINE, snippet: `剧情摘要：${outline.slice(0, 60)}` });
  }
  if (worldbook) {
    evidence.push({ type: EVIDENCE_TYPE.WORLDBOOK, snippet: `世界设定：${worldbook.slice(0, 60)}` });
  }
  if (lastUser) {
    evidence.push({ type: EVIDENCE_TYPE.LAST_TURN, snippet: `玩家上一条：${lastUser.slice(0, 60)}` });
  }
  if (lastAi) {
    evidence.push({ type: EVIDENCE_TYPE.LAST_TURN, snippet: `AI上一条：${lastAi.slice(0, 60)}` });
  }

  while (evidence.length < 2) {
    evidence.push({ type: EVIDENCE_TYPE.COMMON_SENSE, snippet: '上下文不足，使用常识生成保守事件' });
  }

  return evidence.slice(0, 4);
}

function templates() {
  return [
    {
      title: '路人被异动吸引靠近',
      event: '附近路人被不寻常的动静吸引，开始向事发点靠近并观察周围。',
      impact: 'mid',
      requirements: ['环境允许外部角色出现'],
    },
    {
      title: '家庭成员提前回到家门口',
      event: '有人提前到达门口，钥匙与门把的动静让室内节奏被迫改变。',
      impact: 'high',
      requirements: ['存在可回家的家庭角色', '当前时间线允许返家'],
    },
    {
      title: '邻居短暂询问屋内情况',
      event: '邻居注意到异常后短暂询问，增加了当前场景的外部压力。',
      impact: 'low',
      requirements: ['场景为居住区或邻近空间'],
    },
    {
      title: '角色临时改变表达态度',
      event: '关键角色突然收紧语气，开始回避正面表态，令对话方向转为试探。',
      impact: 'mid',
      requirements: ['上一轮存在分歧或情绪波动'],
    },
    {
      title: '关键线索在动作中暴露',
      event: '某个本不该被注意的线索在动作中暴露，引发新的关注点。',
      impact: 'high',
      requirements: ['场景中存在可暴露的线索或物品'],
    },
    {
      title: '时间压力被突然强化',
      event: '外部时间节点被提前，角色不得不马上做出下一步选择。',
      impact: 'mid',
      requirements: ['剧情包含时间推进因素'],
    },
  ];
}

export function generateRuleBasedEvents(source) {
  const count = randomInt(RULES.GENERATE_MIN, RULES.GENERATE_MAX);
  const all = templates().sort(() => Math.random() - 0.5).slice(0, count);

  const baseText = [source.lastUser, source.lastAi].filter(Boolean).join(' ');
  const when = inferWhen(baseText);
  const location = inferLocation(baseText);
  const evidence = buildEvidence(source);

  return all.map((tpl) => ({
    id: `evt_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    title: tpl.title,
    event: tpl.event,
    when,
    impact: tpl.impact,
    characters: [],
    location,
    requirements: tpl.requirements,
    evidence,
    compatibility_note: '若与玩家当轮意图冲突，应忽略该事件。',
  }));
}
