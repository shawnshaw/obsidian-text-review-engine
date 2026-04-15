const { collectAllMatches } = require('./preprocessor');

let issueCounter = 0;

function nextIssueId() {
  issueCounter += 1;
  return `rule-${issueCounter}`;
}

function createIssue(base) {
  return Object.assign(
    {
      id: nextIssueId(),
      source: 'rule',
      requiresHumanReview: false,
    },
    base
  );
}

function isRuleEnabledForPacks(rule, activePacks) {
  if (rule?.enabled === false) return false;
  if (typeof rule?.status === 'string' && rule.status !== 'active') return false;
  if (!Array.isArray(activePacks) || !activePacks.length) return true;
  if (!Array.isArray(rule?.pack) || !rule.pack.length) return true;
  return rule.pack.some((pack) => activePacks.includes(pack));
}

function buildRuleSuggestion(rule, fallback) {
  if (typeof rule?.suggestion === 'string' && rule.suggestion.trim()) {
    return rule.suggestion.trim();
  }
  return fallback;
}

function findLiteralOccurrences(text, needle) {
  const matches = [];
  let fromIndex = 0;
  while (fromIndex < text.length) {
    const index = text.indexOf(needle, fromIndex);
    if (index === -1) break;
    matches.push({
      start: index,
      end: index + needle.length,
      text: needle,
    });
    fromIndex = index + needle.length;
  }
  return matches;
}

function runTypoRules(text, rules, activePacks) {
  const issues = [];
  for (const rule of rules) {
    if (!isRuleEnabledForPacks(rule, activePacks)) continue;
    const matches = findLiteralOccurrences(text, rule.wrong);
    for (const match of matches) {
      issues.push(createIssue({
        category: 'typo',
        severity: rule.severity,
        message: rule.message,
        text: match.text,
        position: { start: match.start, end: match.end },
        suggestion: buildRuleSuggestion(rule, `建议改为“${rule.correct}”`),
        pack: rule.pack || [],
        tags: rule.tags || [],
      }));
    }
  }
  return issues;
}

/**
 * @param {string} text
 * @param {object[]} rules - 固定搭配规则（已升级字段：enabled/pack/scope/window）
 * @param {string[]} [activePacks] - 当前启用的包，默认为 ['social-basic']
 */
function runFixedPhraseRules(text, rules, activePacks) {
  const packs = activePacks && activePacks.length ? activePacks : ['social-basic'];
  const issues = [];

  for (const rule of rules) {
    if (!isRuleEnabledForPacks(rule, packs)) continue;

    let matches = findLiteralOccurrences(text, rule.wrong);
    if (!matches.length) continue;

    const scope = rule.scope || 'global';
    if (scope === 'first_occurrence' || scope === 'sentence') {
      matches = matches.slice(0, 1);
    }

    for (const match of matches) {
      issues.push(createIssue({
        category: 'fixed_phrase',
        severity: rule.severity,
        message: rule.message,
        text: match.text,
        position: { start: match.start, end: match.end },
        suggestion: buildRuleSuggestion(rule, `建议改为“${rule.correct}”`),
        pack: rule.pack,
        tags: rule.tags || [],
      }));
    }
  }
  return issues;
}

function runSensitiveTermRules(text, rules, activePacks) {
  const issues = [];
  for (const rule of rules) {
    if (!isRuleEnabledForPacks(rule, activePacks)) continue;
    const matches = findLiteralOccurrences(text, rule.term);
    for (const match of matches) {
      issues.push(createIssue({
        category: 'sensitive_term',
        severity: rule.severity,
        message: rule.message,
        text: match.text,
        position: { start: match.start, end: match.end },
        suggestion: buildRuleSuggestion(rule, '请人工复核相关表述'),
        requiresHumanReview: rule.requiresHumanReview !== undefined ? rule.requiresHumanReview : true,
        pack: rule.pack || [],
        tags: rule.tags || [],
      }));
    }
  }
  return issues;
}

/**
 * @param {string} text
 * @param {object[]} rules - 组合规则（已升级字段：requiredAny/requiredAll/scope/window/pack/enabled/requiresHumanReview）
 * @param {string[]} [activePacks] - 当前启用的包，默认为 ['social-basic']
 */
function runComboRules(text, rules, activePacks) {
  const packs = activePacks && activePacks.length ? activePacks : ['social-basic'];
  const issues = [];

  for (const rule of rules) {
    if (!isRuleEnabledForPacks(rule, packs)) continue;

    let triggerMatches = findLiteralOccurrences(text, rule.trigger);
    if (!triggerMatches.length) continue;

    // 支持 requiredAny / requiredAll（兼容旧的 required 字段）
    const requiredAny = rule.requiredAny || rule.required || [];
    const requiredAll = Array.isArray(rule.requiredAll) ? rule.requiredAll : [];
    if (!requiredAny.length && !requiredAll.length) continue;

    const scope = rule.scope || 'first_occurrence';
    const windowSize = Number(rule.window) || 0;

    // 缩小到 window 范围内的触发词
    if (scope === 'first_occurrence') {
      triggerMatches = triggerMatches.slice(0, 1);
    }

    for (const match of triggerMatches) {
      // window 约束：检查 required 是否出现在 trigger 周围 window 字符内
      let hasAnyRequired = false;
      let hasAllRequired = true;
      if (windowSize > 0) {
        const windowStart = Math.max(0, match.start - windowSize);
        const windowEnd = Math.min(text.length, match.end + windowSize);
        const windowText = text.substring(windowStart, windowEnd);
        hasAnyRequired = !requiredAny.length || requiredAny.some((item) => windowText.includes(item));
        hasAllRequired = !requiredAll.length || requiredAll.every((item) => windowText.includes(item));
      } else {
        hasAnyRequired = !requiredAny.length || requiredAny.some((item) => text.includes(item));
        hasAllRequired = !requiredAll.length || requiredAll.every((item) => text.includes(item));
      }
      if (hasAnyRequired && hasAllRequired) continue;

      issues.push(createIssue({
        category: 'combo_rule',
        severity: rule.severity,
        message: rule.message,
        text: match.text,
        position: { start: match.start, end: match.end },
        suggestion: buildRuleSuggestion(
          rule,
          `建议结合规范口径补充：${[...requiredAll, ...requiredAny].join(' / ')}`
        ),
        requiresHumanReview: rule.requiresHumanReview !== undefined ? rule.requiresHumanReview : true,
        pack: rule.pack,
        tags: rule.tags || [],
      }));
    }
  }
  return issues;
}

function safeRegex(pattern) {
  if (!pattern || typeof pattern !== 'string') return null;
  try { return new RegExp(pattern, 'g'); } catch { return null; }
}

function runPunctuationRules(text, config) {
  const issues = [];
  const repeatedPattern = safeRegex(config.repeatedPunctuationPattern);
  const mixedCommaPattern = safeRegex(config.mixedCommaPattern);
  const extraSpacesPattern = safeRegex(config.extraSpacesPattern);

  if (repeatedPattern) {
    const repeatedPunctuation = collectAllMatches(text, repeatedPattern);
    for (const match of repeatedPunctuation) {
      if (match.end <= match.start) continue;
      issues.push(createIssue({
        category: 'punctuation',
        severity: 'low',
        message: '存在连续标点，建议简化',
        text: match.text,
        position: { start: match.start, end: match.end },
        suggestion: '请检查是否存在多余标点',
      }));
    }
  }

  if (mixedCommaPattern) {
    const mixedComma = collectAllMatches(text, mixedCommaPattern);
    for (const match of mixedComma) {
      if (match.end <= match.start) continue;
      issues.push(createIssue({
        category: 'format',
        severity: 'low',
        message: '中英文逗号混用',
        text: match.text,
        position: { start: match.start, end: match.end },
        suggestion: '建议统一标点风格',
      }));
    }
  }

  if (extraSpacesPattern) {
    const extraSpaces = collectAllMatches(text, extraSpacesPattern);
    for (const match of extraSpaces) {
      const posStart = match.start + 1;
      const posEnd = match.end - 1;
      if (posEnd <= posStart) continue;
      issues.push(createIssue({
        category: 'format',
        severity: 'low',
        message: '疑似多余空格',
        text: match.text.trim(),
        position: { start: posStart, end: posEnd },
        suggestion: '建议清理多余空格',
      }));
    }
  }

  const quotePairs = Array.isArray(config.pairedMarks) ? config.pairedMarks : [];
  for (const [open, close] of quotePairs) {
    const openCount = (text.match(new RegExp(open, 'g')) || []).length;
    const closeCount = (text.match(new RegExp(close, 'g')) || []).length;
    if (openCount !== closeCount) {
      issues.push(createIssue({
        category: 'punctuation',
        severity: 'medium',
        message: `${open}${close} 数量不匹配`,
        text: `${open}/${close}`,
        position: { start: 0, end: 0 },
        suggestion: `请检查 ${open} 与 ${close} 是否成对出现`,
      }));
    }
  }

  const regexRules = Array.isArray(config.regexRules) ? config.regexRules : [];
  for (const rule of regexRules) {
    if (!rule?.pattern || !rule?.message) continue;
    try {
      const matches = collectAllMatches(text, new RegExp(rule.pattern, 'g'));
      for (const match of matches) {
        issues.push(createIssue({
          category: rule.category || 'format',
          severity: rule.severity || 'low',
          message: rule.message,
          text: match.text,
          position: { start: match.start, end: match.end },
          suggestion: rule.suggestion || '建议调整为统一规范格式',
        }));
      }
    } catch (error) {
      console.error('[text-review-engine] invalid regex rule', rule, error);
    }
  }

  return issues;
}

/**
 * @param {string} text
 * @param {string} mode - 'standard' | 'strict'
 * @param {object} ruleStore
 * @param {string[]} [activePacks] - 当前启用的包，默认为 ['social-basic']
 */
function runRuleEngine(text, mode, ruleStore, activePacks) {
  const issues = [];
  issues.push(...runTypoRules(text, ruleStore.typoRules || [], activePacks));
  issues.push(...runPunctuationRules(text, ruleStore.punctuationRules || {}));

  if (mode === 'standard' || mode === 'strict') {
    issues.push(...runSensitiveTermRules(text, ruleStore.sensitiveTerms || [], activePacks));
    issues.push(...runFixedPhraseRules(text, ruleStore.fixedPhraseRules || [], activePacks));
    issues.push(...runComboRules(text, ruleStore.comboRules || [], activePacks));
  }

  return issues;
}

module.exports = {
  runRuleEngine,
};
