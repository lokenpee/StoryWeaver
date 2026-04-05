import { CONTEXT_LIMITS, RULES } from '../constants.js';
import { getApiSettings } from './apiSettingsService.js';
import { LLMApiService } from './llmApiService.js';

const llm = new LLMApiService(getApiSettings());

export function updateAIGenerationConfig() {
  llm.updateConfig(getApiSettings());
}

export async function testAIGenerationConnection() {
  updateAIGenerationConfig();
  return llm.testConnection();
}

export async function fetchAIGenerationModels() {
  updateAIGenerationConfig();
  return llm.fetchModelList();
}

export async function summarizeLatestRoundOutlineWithStatus(source) {
  updateAIGenerationConfig();

  const prompt = buildOutlineSummaryPrompt(source);
  try {
    const response = await llm.callLLM(prompt);
    const parsed = parseJsonObject(String(response || ''));
    if (!parsed || typeof parsed !== 'object') {
      return { ok: false, append: false, summary: '', error: 'AI梗概返回格式无效' };
    }

    const append = Boolean(parsed.append);
    const summary = String(parsed.summary || '').trim();
    if (!append) {
      return { ok: true, append: false, summary: '', error: '' };
    }

    if (!summary) {
      return { ok: false, append: false, summary: '', error: 'AI判定需要追加但摘要为空' };
    }

    return {
      ok: true,
      append: true,
      summary: summary.slice(0, 30),
      error: '',
    };
  } catch (err) {
    console.warn('[REVT] AI总结故事梗概失败。', err);
    return { ok: false, append: false, summary: '', error: err?.message || String(err) };
  }
}

export async function generateEventsByAIWithStatus(source) {
  updateAIGenerationConfig();

  const prompt = buildGeneratePrompt(source);
  try {
    const response = await llm.callLLM(prompt);
    const parsed = parseJsonArray(String(response || ''));
    if (!Array.isArray(parsed) || parsed.length === 0) {
      return { ok: false, events: [], error: 'AI返回格式无效或为空' };
    }

    const events = parsed
      .map(normalizeEvent)
      .filter(Boolean)
      .slice(0, RULES.GENERATE_MAX);

    if (events.length < RULES.GENERATE_MIN) {
      return {
        ok: false,
        events: [],
        error: `AI生成事件数量不足，需${RULES.GENERATE_MIN}-${RULES.GENERATE_MAX}条，实际${events.length}条`,
      };
    }
    return { ok: true, events, error: '' };
  } catch (err) {
    console.warn('[REVT] AI生成事件失败。', err);
    return { ok: false, events: [], error: err?.message || String(err) };
  }
}

function buildGeneratePrompt(source) {
  const aiRules = String(source.aiRules || '').trim().slice(0, CONTEXT_LIMITS.AI_RULES_MAX);
  const lines = [
    '你是随机事件生成器。',
    aiRules || '（未配置AI生成规则，请在插件面板中填写“AI生成规则”后再生成，以获得稳定结果。）',
    '',
    '输出JSON格式示例（仅作格式参考，内容请按当前上下文生成）:',
    '[',
    '  {',
    '    "id": "evt_xxx",',
    '    "title": "母亲推开房门打断谈话",',
    '    "event": "母亲轻轻推开房间的门，皱眉询问你们刚才的动静是什么。她停在门口观察屋内情况，让当前对话被迫暂停。",',
    '    "when": "now",',
    '    "impact": "mid",',
    '    "characters": ["母亲"],',
    '    "location": "卧室门口",',
    '    "requirements": ["当前场景在室内", "母亲在附近"],',
    '    "evidence": [',
    '      { "type": "last_turn", "snippet": "上一轮母亲在屋外听到了你们的谈话" },',
    '      { "type": "worldbook", "snippet": "母亲性格谨慎，遇到异常会先确认情况" }',
    '    ],',
    '    "compatibility_note": "事件仅制造短暂打断与压力，不替玩家做选择，可由玩家决定如何回应。"',
    '  }',
    ']',
    '',
    `玩家偏好: ${source.preference || '（缺失）'}`,
    `世界书: ${source.worldbook || '（缺失）'}`,
    `剧情大纲: ${source.outline || '（缺失）'}`,
    `玩家上一条: ${source.lastUser || '（缺失）'}`,
    `AI上一条: ${source.lastAi || '（缺失）'}`,
  ];
  return lines.join('\n');
}

function buildOutlineSummaryPrompt(source) {
  const existingOutline = String(source.existingOutline || '').trim();
  const lastUser = String(source.lastUser || '').trim();
  const lastAi = String(source.lastAi || '').trim();

  const lines = [
    '你是“故事梗概增量总结器”。',
    '任务：根据最新一轮互动，判断是否需要向“已有故事梗概”追加一条新梗概。',
    '输出要求：只输出JSON对象，不要任何额外文本。',
    '字段要求：',
    '- append: boolean，是否追加。',
    '- summary: string，当append=true时填写约15字中文梗概；当append=false时必须为空字符串。',
    '判定规则：',
    '1) 若最新一轮与已有梗概末尾描述同一件事/同一推进阶段，则 append=false。',
    '2) 只有出现了新的明确推进/转折/状态变化，才 append=true。',
    '3) summary要短、具体、可读，避免空泛措辞。要有人物、事件等至少两个具体元素，且能突出本轮互动的独特贡献。',
    '',
    `已有故事梗概:\n${existingOutline || '（空）'}`,
    `玩家上一条:\n${lastUser || '（缺失）'}`,
    `AI上一条:\n${lastAi || '（缺失）'}`,
    '',
    '输出示例1：{"append": false, "summary": ""}',
    '输出示例2：{"append": true, "summary": "母亲端果入场，发现我在房间打游戏"}',
  ];

  return lines.join('\n');
}

function isPlayerLikeName(name) {
  const n = String(name || '').trim().toLowerCase();
  if (!n) return false;
  return (
    n === '我' ||
    n === '玩家' ||
    n === '主角' ||
    n === '你' ||
    n === 'user' ||
    n === 'player' ||
    n === 'protagonist'
  );
}

function parseJsonArray(raw) {
  if (!raw || typeof raw !== 'string') return null;

  const text = String(raw).trim();
  const candidates = [];

  const codeBlockMatch = text.match(/```json\s*([\s\S]*?)\s*```/i);
  if (codeBlockMatch && codeBlockMatch[1]) {
    candidates.push(codeBlockMatch[1].trim());
  }

  candidates.push(text);

  const firstBracket = text.indexOf('[');
  const lastBracket = text.lastIndexOf(']');
  if (firstBracket !== -1 && lastBracket > firstBracket) {
    candidates.push(text.slice(firstBracket, lastBracket + 1));
  }

  const uniqueCandidates = [...new Set(candidates.filter(Boolean))];
  for (const candidate of uniqueCandidates) {
    const parsed = repairAndParseJsonArray(candidate);
    if (Array.isArray(parsed)) return parsed;
  }

  return null;
}

function parseJsonObject(raw) {
  if (!raw || typeof raw !== 'string') return null;
  const text = String(raw).trim();
  const candidates = [];

  const codeBlockMatch = text.match(/```json\s*([\s\S]*?)\s*```/i);
  if (codeBlockMatch && codeBlockMatch[1]) {
    candidates.push(codeBlockMatch[1].trim());
  }

  candidates.push(text);

  const first = text.indexOf('{');
  const last = text.lastIndexOf('}');
  if (first !== -1 && last > first) {
    candidates.push(text.slice(first, last + 1));
  }

  const uniqueCandidates = [...new Set(candidates.filter(Boolean))];
  for (const candidate of uniqueCandidates) {
    const parsed = repairAndParseJsonObject(candidate);
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) return parsed;
  }

  return null;
}

function repairAndParseJsonObject(jsonString) {
  let repaired = String(jsonString || '').trim();
  if (!repaired) return null;

  const maxAttempts = 10;
  for (let i = 0; i < maxAttempts; i++) {
    try {
      const parsed = JSON.parse(repaired);
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) return parsed;
      return null;
    } catch (error) {
      if (!(error instanceof SyntaxError)) return null;

      const cleaned = repaired
        .replace(/^\uFEFF/, '')
        .replace(/,\s*([}\]])/g, '$1');

      if (cleaned !== repaired) {
        repaired = cleaned;
        continue;
      }

      const match = String(error.message || '').match(/position (\d+)|at position (\d+)/i);
      const errorPos = match ? parseInt(match[1] || match[2], 10) : -1;
      if (Number.isFinite(errorPos) && errorPos > 0) {
        const quotePos = repaired.lastIndexOf('"', errorPos - 1);
        if (quotePos !== -1) {
          repaired = repaired.slice(0, quotePos) + '\\' + repaired.slice(quotePos);
          continue;
        }
      }

      return null;
    }
  }

  return null;
}

function repairAndParseJsonArray(jsonString) {
  let repaired = String(jsonString || '').trim();
  if (!repaired) return null;

  const maxAttempts = 10;
  for (let i = 0; i < maxAttempts; i++) {
    try {
      const parsed = JSON.parse(repaired);
      return Array.isArray(parsed) ? parsed : null;
    } catch (error) {
      if (!(error instanceof SyntaxError)) return null;

      const cleaned = repaired
        .replace(/^\uFEFF/, '')
        .replace(/,\s*([}\]])/g, '$1');

      if (cleaned !== repaired) {
        repaired = cleaned;
        continue;
      }

      const match = String(error.message || '').match(/position (\d+)|at position (\d+)/i);
      const errorPos = match ? parseInt(match[1] || match[2], 10) : -1;
      if (Number.isFinite(errorPos) && errorPos > 0) {
        const quotePos = repaired.lastIndexOf('"', errorPos - 1);
        if (quotePos !== -1) {
          repaired = repaired.slice(0, quotePos) + '\\' + repaired.slice(quotePos);
          continue;
        }
      }

      return null;
    }
  }

  return null;
}

function normalizeEvent(evt) {
  if (!evt || typeof evt !== 'object') return null;
  if (!evt.title || !evt.event) return null;

  const rawCharacters = Array.isArray(evt.characters) ? evt.characters : [];
  const characters = rawCharacters
    .map((c) => String(c || '').trim())
    .filter(Boolean)
    .filter((c) => !isPlayerLikeName(c))
    .slice(0, 6);

  if (characters.length === 0) return null;

  const allowedEvidenceTypes = new Set([
    'preference',
    'worldbook',
    'outline',
    'last_turn',
    'common_sense',
  ]);

  const evidence = (Array.isArray(evt.evidence) ? evt.evidence : [])
    .map((e) => {
      if (!e || typeof e !== 'object') return null;
      const type = String(e.type || '').trim();
      const snippet = String(e.snippet || '').trim();
      if (!allowedEvidenceTypes.has(type)) return null;
      if (!snippet) return null;
      return { type, snippet: snippet.slice(0, 160) };
    })
    .filter(Boolean)
    .slice(0, 4);

  const event = {
    id: evt.id || `evt_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    title: String(evt.title).slice(0, 60),
    event: String(evt.event).slice(0, 400),
    when: evt.when || 'soon',
    impact: ['low', 'mid', 'high'].includes(evt.impact) ? evt.impact : 'low',
    characters,
    location: evt.location || 'unknown',
    requirements: Array.isArray(evt.requirements) ? evt.requirements.slice(0, 6) : [],
    evidence,
    compatibility_note: evt.compatibility_note || '若与玩家意图冲突应忽略',
  };

  if (event.evidence.length < 2) {
    event.evidence.push({ type: 'common_sense', snippet: '依据不足，保守生成' });
  }
  if (event.evidence.length < 2) {
    event.evidence.push({ type: 'common_sense', snippet: '上下文缺失' });
  }

  return event;
}

export async function generateEventsByAI(source) {
  const result = await generateEventsByAIWithStatus(source);
  return result.events;
}
