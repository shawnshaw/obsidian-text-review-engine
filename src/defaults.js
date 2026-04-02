const DEFAULT_SETTINGS = {
  provider: 'openai',
  baseUrl: 'https://api.openai.com/v1/chat/completions',
  apiKey: '',
  model: 'gpt-4.1-mini',
  temperature: 0.1,
  timeoutMs: 25000,
  defaultMode: 'standard',
};

const VIEW_TYPE_REVIEW = 'text-review-engine-view';

const TYPO_RULES = [
  { wrong: '帐号', correct: '账号', severity: 'low', message: '常见异形词，建议统一为“账号”' },
  { wrong: '作到', correct: '做到', severity: 'medium', message: '疑似错别字' },
  { wrong: '必需', correct: '必须', severity: 'medium', message: '语境中更可能应为“必须”' },
];

const FIXED_PHRASE_RULES = [
  { wrong: '召开活动', correct: '举行活动', severity: 'medium', message: '该搭配较生硬，建议改为“举行活动”' },
  { wrong: '推出召开', correct: '召开', severity: 'medium', message: '疑似动词搭配异常' },
];

const SENSITIVE_TERMS = [
  { term: '台独', severity: 'critical', message: '命中高风险敏感词', suggestion: '请人工复核或删除相关表述' },
  { term: '港独', severity: 'critical', message: '命中高风险敏感词', suggestion: '请人工复核或删除相关表述' },
  { term: '颠覆国家政权', severity: 'critical', message: '命中高风险敏感词', suggestion: '请人工复核或删除相关表述' },
];

const COMBO_RULES = [
  {
    trigger: '台湾',
    required: ['中国', '我国', '台湾地区'],
    severity: 'high',
    message: '涉及相关表述时，建议使用更完整、稳妥的规范口径',
  },
];

module.exports = {
  DEFAULT_SETTINGS,
  VIEW_TYPE_REVIEW,
  TYPO_RULES,
  FIXED_PHRASE_RULES,
  SENSITIVE_TERMS,
  COMBO_RULES,
};
