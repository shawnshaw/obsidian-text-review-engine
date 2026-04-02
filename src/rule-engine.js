const {
  TYPO_RULES,
  FIXED_PHRASE_RULES,
  SENSITIVE_TERMS,
  COMBO_RULES,
} = require('./defaults');
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

function runTypoRules(text) {
  const issues = [];
  for (const rule of TYPO_RULES) {
    const matches = findLiteralOccurrences(text, rule.wrong);
    for (const match of matches) {
      issues.push(createIssue({
        category: 'typo',
        severity: rule.severity,
        message: rule.message,
        text: match.text,
        position: { start: match.start, end: match.end },
        suggestion: `建议改为“${rule.correct}”`,
      }));
    }
  }
  return issues;
}

function runFixedPhraseRules(text) {
  const issues = [];
  for (const rule of FIXED_PHRASE_RULES) {
    const matches = findLiteralOccurrences(text, rule.wrong);
    for (const match of matches) {
      issues.push(createIssue({
        category: 'fixed_phrase',
        severity: rule.severity,
        message: rule.message,
        text: match.text,
        position: { start: match.start, end: match.end },
        suggestion: `建议改为“${rule.correct}”`,
      }));
    }
  }
  return issues;
}

function runSensitiveTermRules(text) {
  const issues = [];
  for (const rule of SENSITIVE_TERMS) {
    const matches = findLiteralOccurrences(text, rule.term);
    for (const match of matches) {
      issues.push(createIssue({
        category: 'sensitive_term',
        severity: rule.severity,
        message: rule.message,
        text: match.text,
        position: { start: match.start, end: match.end },
        suggestion: rule.suggestion,
        requiresHumanReview: true,
      }));
    }
  }
  return issues;
}

function runComboRules(text) {
  const issues = [];
  for (const rule of COMBO_RULES) {
    const triggerMatches = findLiteralOccurrences(text, rule.trigger);
    if (!triggerMatches.length) continue;
    const containsRequired = rule.required.some((item) => text.includes(item));
    if (containsRequired) continue;

    for (const match of triggerMatches) {
      issues.push(createIssue({
        category: 'combo_rule',
        severity: rule.severity,
        message: rule.message,
        text: match.text,
        position: { start: match.start, end: match.end },
        suggestion: `建议结合规范口径补充以下表述之一：${rule.required.join(' / ')}`,
        requiresHumanReview: true,
      }));
    }
  }
  return issues;
}

function runPunctuationRules(text) {
  const issues = [];

  const repeatedPunctuation = collectAllMatches(text, /[!?！？。，,.]{2,}/g);
  for (const match of repeatedPunctuation) {
    issues.push(createIssue({
      category: 'punctuation',
      severity: 'low',
      message: '存在连续标点，建议简化',
      text: match.text,
      position: { start: match.start, end: match.end },
      suggestion: '请检查是否存在多余标点',
    }));
  }

  const mixedComma = collectAllMatches(text, /，\s*,|,\s*，/g);
  for (const match of mixedComma) {
    issues.push(createIssue({
      category: 'format',
      severity: 'low',
      message: '中英文逗号混用',
      text: match.text,
      position: { start: match.start, end: match.end },
      suggestion: '建议统一标点风格',
    }));
  }

  const extraSpaces = collectAllMatches(text, /[^\n]\s{2,}[^\n]/g);
  for (const match of extraSpaces) {
    issues.push(createIssue({
      category: 'format',
      severity: 'low',
      message: '疑似多余空格',
      text: match.text.trim(),
      position: { start: match.start + 1, end: match.end - 1 },
      suggestion: '建议清理多余空格',
    }));
  }

  const quotePairs = [
    ['“', '”'],
    ['《', '》'],
    ['（', '）'],
  ];
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

  return issues;
}

function runRuleEngine(text, mode) {
  const issues = [];
  issues.push(...runTypoRules(text));
  issues.push(...runPunctuationRules(text));

  if (mode === 'standard' || mode === 'strict') {
    issues.push(...runSensitiveTermRules(text));
    issues.push(...runFixedPhraseRules(text));
    issues.push(...runComboRules(text));
  }

  return issues;
}

module.exports = {
  runRuleEngine,
};
