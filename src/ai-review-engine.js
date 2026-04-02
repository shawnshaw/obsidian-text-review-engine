const { requestUrl } = require('obsidian');

let aiIssueCounter = 0;

function nextAiIssueId() {
  aiIssueCounter += 1;
  return `llm-${aiIssueCounter}`;
}

function buildPrompt(text) {
  return [
    '你是一名中文内容审校助手，负责政务风格短文本风险提示。',
    '请只从以下维度检查：',
    '1. 政务表述是否不准确或不稳妥',
    '2. 是否存在歧义或可能引发误读',
    '3. 是否存在语气轻佻、口径不统一、立场模糊的问题',
    '4. 是否需要人工复核',
    '',
    '返回 JSON，格式必须为：',
    '{"issues":[{"category":"policy_expression","severity":"low|medium|high","message":"...","text":"...","suggestion":"...","requiresHumanReview":true|false}]}',
    '',
    '要求：',
    '- 没有问题时返回 {"issues":[]}',
    '- 不要输出 markdown',
    '- 不要输出 JSON 之外的任何内容',
    '- 不要把猜测写成事实',
    '',
    `待审校文本：\n${text}`,
  ].join('\n');
}

function normalizeAiIssues(payload, text) {
  const issues = Array.isArray(payload?.issues) ? payload.issues : [];
  return issues
    .filter((item) => item && item.message)
    .map((item) => {
      const snippet = String(item.text || '').trim();
      const start = snippet ? text.indexOf(snippet) : -1;
      const end = start >= 0 ? start + snippet.length : start;
      return {
        id: nextAiIssueId(),
        category: item.category || 'policy_expression',
        severity: item.severity || 'medium',
        message: item.message,
        text: snippet,
        position: {
          start: start >= 0 ? start : 0,
          end: end >= 0 ? end : 0,
        },
        suggestion: item.suggestion || '建议人工复核并改写相关表述',
        source: 'llm',
        requiresHumanReview: Boolean(item.requiresHumanReview),
      };
    });
}

async function runAiPolicyReview(text, settings) {
  if (!settings.apiKey) {
    return [];
  }

  const response = await requestUrl({
    url: settings.baseUrl,
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${settings.apiKey}`,
    },
    body: JSON.stringify({
      model: settings.model,
      temperature: Number(settings.temperature ?? 0.1),
      response_format: { type: 'json_object' },
      messages: [
        {
          role: 'system',
          content: '你是一个严格、克制、只返回 JSON 的中文审校模型。',
        },
        {
          role: 'user',
          content: buildPrompt(text),
        },
      ],
    }),
    throw: true,
  });

  const raw = response.json?.choices?.[0]?.message?.content || '{}';
  const parsed = JSON.parse(raw);
  return normalizeAiIssues(parsed, text);
}

module.exports = {
  runAiPolicyReview,
};
