/**
 * 七类审校问题的裁决层
 * - 结构化问题 → 规则优先
 * - 语义化问题 → AI 优先
 * - 最终结论 → 裁决层统一拍板（配置化策略）
 */

function levelWeight(severity) {
  switch (severity) {
    case 'critical': return 4;
    case 'high':     return 3;
    case 'medium':   return 2;
    default:         return 1;
  }
}

function toRiskLevel(issues) {
  if (!issues.length) return 'low';
  const highest = issues.reduce((max, item) => Math.max(max, levelWeight(item.severity)), 1);
  if (highest >= 4) return 'critical';
  if (highest >= 3) return 'high';
  if (highest >= 2) return 'medium';
  return 'low';
}

/** 检查 issues 是否命中某个裁决条件 */
function matchesCondition(issues, condition) {
  switch (condition) {
    case 'has_critical_rule_issue':
      return issues.some((i) => i.severity === 'critical' && i.source === 'rule');

    case 'has_high_llm_issue':
      return issues.some((i) => i.severity === 'high' && i.source === 'llm');

    case 'has_high_sensitive_term':
      return issues.some((i) => i.severity === 'high' && i.category === 'sensitive_term');

    case 'has_combo_rule_with_sovereignty_tag':
      return issues.some((i) =>
        i.category === 'combo_rule' &&
        (i.tags || []).includes('sovereignty')
      );

    case 'has_medium_or_above_issue':
      return issues.some((i) => levelWeight(i.severity) >= 2);

    default:
      return false;
  }
}

/**
 * @param {object[]} issues
 * @param {string} [packId] - 当前包 ID，默认为 'social-basic'
 * @param {object[]} [strategies] - 裁决策略配置，默认从 manifest 读取
 */
function toDecision(issues, packId, strategies) {
  if (!issues.length) return 'pass';

  const pack = packId || 'social-basic';
  const strategy = (strategies || {})[pack];
  if (!strategy) {
    // 回退到原有逻辑
    if (issues.some((item) => item.severity === 'critical')) return 'blocked';
    if (issues.some((item) => item.severity === 'high' && item.requiresHumanReview)) return 'human_review';
    return 'needs_revision';
  }

  const { blocked_if = [], human_review_if = [], needs_revision_if = [] } = strategy;

  if (blocked_if.some((c) => matchesCondition(issues, c))) return 'blocked';
  if (human_review_if.some((c) => matchesCondition(issues, c))) return 'human_review';
  if (needs_revision_if.some((c) => matchesCondition(issues, c))) return 'needs_revision';

  return 'needs_revision';
}

/**
 * @param {object[]} issues
 * @param {object} metadata
 * @param {string} [metadata.activePack]
 * @param {string} [metadata.rulesVersion]
 * @param {string} [metadata.skillVersion]
 * @param {string} [metadata.model]
 * @param {object[]} [metadata.decisionStrategies]
 */
function buildReviewResult(issues, metadata) {
  const activePack = metadata.activePack || 'social-basic';
  return {
    summary: {
      decision: toDecision(issues, activePack, metadata.decisionStrategies),
      riskLevel: toRiskLevel(issues),
      totalIssues: issues.length,
      activePack,
      rulesVersion: metadata.rulesVersion || 'ruleset-social-v3.0',
      skillVersion: metadata.skillVersion || 'policy_expression_check@0.1.0',
      model: metadata.model || '',
      reviewedAt: new Date().toISOString(),
    },
    issues,
    suggestedRewrite: '',
  };
}

module.exports = {
  buildReviewResult,
  toDecision,
  matchesCondition,
};
