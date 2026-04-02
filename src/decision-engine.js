function levelWeight(severity) {
  switch (severity) {
    case 'critical':
      return 4;
    case 'high':
      return 3;
    case 'medium':
      return 2;
    default:
      return 1;
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

function toDecision(issues) {
  if (!issues.length) return 'pass';
  if (issues.some((item) => item.severity === 'critical')) return 'blocked';
  if (issues.some((item) => item.severity === 'high' && item.requiresHumanReview)) return 'human_review';
  return 'needs_revision';
}

function buildReviewResult(issues, metadata) {
  return {
    summary: {
      decision: toDecision(issues),
      riskLevel: toRiskLevel(issues),
      totalIssues: issues.length,
      rulesVersion: 'ruleset-social-v1',
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
};
