const { requestUrl } = require('obsidian');

let aiIssueCounter = 0;

function nextAiIssueId() {
  aiIssueCounter += 1;
  return `llm-${aiIssueCounter}`;
}

function buildPrompt(text, promptConfig, extraCtx) {
  let template = promptConfig?.userPromptTemplate || '待审校文本：\n{{text}}';
  if (extraCtx?.rule_hits) {
    template = template.replace('{{rule_hits}}', extraCtx.rule_hits);
  }
  return template.replace('{{text}}', text);
}

/** 从模型 message.content 解析 JSON（兼容字符串、已解析对象、```json 包裹） */
function parseModelJsonContent(raw) {
  if (raw == null) return null;
  if (typeof raw === 'object' && !Array.isArray(raw)) return raw;
  let s = String(raw).trim();
  const fence = s.match(/^```(?:json)?\s*([\s\S]*?)```$/im);
  if (fence) s = fence[1].trim();
  try {
    return JSON.parse(s);
  } catch {
    return null;
  }
}

/**
 * 规范化 AI 返回的 issues 数组，注入默认 category / severity / requiresHumanReview
 * @param {object[]} issues
 * @param {string} defaultCategory
 * @param {string} text
 */
function normalizeAiIssues(issues, defaultCategory, text) {
  return (Array.isArray(issues) ? issues : [])
    .filter((item) => item && item.message)
    .map((item) => {
      const snippet = String(item.text || '').trim();
      const start = snippet ? text.indexOf(snippet) : -1;
      const end = start >= 0 ? start + snippet.length : start;
      return {
        id: nextAiIssueId(),
        category: item.category || defaultCategory,
        severity: item.severity || 'medium',
        message: item.message,
        text: snippet,
        position: {
          start: start >= 0 ? start : 0,
          end: end >= 0 ? end : 0,
        },
        suggestion: item.suggestion || '建议人工复核并改写相关表述',
        source: 'llm',
        requiresHumanReview: item.requiresHumanReview !== undefined
          ? Boolean(item.requiresHumanReview)
          : false,
      };
    });
}

/**
 * 调用单 prompt，获取 issues + reasoning
 * @param {string} text
 * @param {object} settings
 * @param {object} promptConfig
 * @param {object} [extraCtx]
 */
async function callSinglePrompt(text, settings, promptConfig, extraCtx) {
  const systemPrompt = promptConfig?.systemPrompt
    || '你是一个严格、克制、只返回 JSON 的中文审校模型。';
  const temperature = Number(promptConfig?.modelPolicy?.temperature ?? settings.temperature ?? 0.1);

  const response = await requestUrl({
    url: settings.baseUrl,
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${settings.apiKey}`,
    },
    body: JSON.stringify({
      model: settings.model,
      temperature,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: buildPrompt(text, promptConfig, extraCtx) },
      ],
    }),
    throw: true,
  });

  const msg = response.json?.choices?.[0]?.message;
  const raw = msg?.content ?? msg?.parsed;
  const parsed = parseModelJsonContent(raw);

  if (!parsed || typeof parsed !== 'object') {
    console.warn('[text-review-engine] AI 返回无法解析为 JSON', typeof raw === 'string' ? raw.slice(0, 400) : raw);
    return { issues: [], reasoning: '' };
  }

  return {
    issues: normalizeAiIssues(parsed.issues, promptConfig?.id || 'llm', text),
    reasoning: String(parsed.reasoning || '').trim(),
  };
}

/**
 * 5 个单维度 AI 技能 ID（按设计文档的 7 类问题分配）
 * - policy_expression  → policy-expression-check
 * - ambiguity          → ambiguity-check
 * - common_sense       → common-sense-check
 * - public_opinion_risk → public-opinion-risk-check
 * - stance_risk        → stance-check
 */
const SINGLE_PROMPTS = [
  'policy-expression-check',
  'ambiguity-check',
  'common-sense-check',
  'public-opinion-risk-check',
  'stance-check',
];

/**
 * @param {string} text
 * @param {object} settings
 * @param {object} promptStore
 * @param {string} [promptId] - prompt ID，默认取 manifest 中 isDefault 的 id
 * @param {object} [extraCtx] - { rule_hits: string } 规则层命中摘要
 * @returns {Promise<{issues: object[], reasoning: string}>}
 */
async function runAiPolicyReview(text, settings, promptStore, promptId, extraCtx) {
  if (!settings.apiKey || !settings.baseUrl || !settings.model) {
    return { issues: [], reasoning: '' };
  }

  const defaultPrompt = promptStore?.manifest?.activePrompts?.find((p) => p.isDefault);
  const pid = promptId || defaultPrompt?.id || 'general-review';
  const promptMeta = promptStore?.manifest?.activePrompts?.find((p) => p.id === pid);
  const promptConfig = promptStore?.getPrompt?.(pid);

  // multi 模式：并行调用所有单维度 skill，聚合 reasoning
  if (promptMeta?.type === 'multi' || pid === 'general-review') {
    const results = await Promise.allSettled(
      SINGLE_PROMPTS.map((skillId) => {
        const cfg = promptStore?.getPrompt?.(skillId);
        if (!cfg) return Promise.resolve({ issues: [], reasoning: '' });
        return callSinglePrompt(text, settings, cfg, extraCtx);
      })
    );

    const allIssues = [];
    const reasonings = [];

    for (const [idx, result] of results.entries()) {
      if (result.status === 'fulfilled') {
        allIssues.push(...result.value.issues);
        if (result.value.reasoning) {
          reasonings.push(`【${SINGLE_PROMPTS[idx]}】${result.value.reasoning}`);
        }
      } else {
        reasonings.push(`【${SINGLE_PROMPTS[idx]}】调用失败：${result.reason?.message || result.reason}`);
      }
    }

    return {
      issues: allIssues,
      reasoning: reasonings.join('\n\n'),
    };
  }

  // single 模式：直接调用指定 prompt
  const { issues, reasoning } = await callSinglePrompt(text, settings, promptConfig, extraCtx);
  return { issues, reasoning };
}

module.exports = {
  runAiPolicyReview,
};
