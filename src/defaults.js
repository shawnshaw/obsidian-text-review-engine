const DEFAULT_SETTINGS = {
  provider: 'openai',
  baseUrl: 'https://api.openai.com/v1/chat/completions',
  apiKey: '',
  model: 'gpt-4.1-mini',
  temperature: 0.1,
  timeoutMs: 25000,
  defaultMode: 'standard',
  activePolicyPack: 'social-basic',
  /** 在「轻量 / 标准」模式下也加跑 AI 语义层（需 API Key）；「严格」始终含 AI */
  includeAiWithRules: false,
  /** AI 审校场景（prompt ID）；优先取 manifest.defaultPromptId，其次 prompts[0].id */
  activeSceneId: 'general-review',
};

const VIEW_TYPE_REVIEW = 'text-review-engine-view';
const STANDARDS_NOTE_PATH = 'System/Design/审校标准体系.md';

/** 审校模式：值仍存 basic | standard | strict，UI 用 REVIEW_MODE_LABELS 展示 */
const REVIEW_MODES = ['basic', 'standard', 'strict'];

const REVIEW_MODE_LABELS = {
  basic: '轻量',
  standard: '标准',
  strict: '严格',
};

const PROVIDER_PRESETS = {
  openai: {
    id: 'openai',
    name: 'OpenAI',
    baseUrl: 'https://api.openai.com/v1/chat/completions',
    defaultModel: 'gpt-4.1-mini',
    models: ['gpt-4.1-mini', 'gpt-4.1', 'gpt-4o-mini'],
  },
  deepseek: {
    id: 'deepseek',
    name: 'DeepSeek',
    baseUrl: 'https://api.deepseek.com/chat/completions',
    defaultModel: 'deepseek-chat',
    models: ['deepseek-chat', 'deepseek-reasoner'],
  },
  minimax: {
    id: 'minimax',
    name: 'MiniMax',
    baseUrl: 'https://api.minimax.io/v1/chat/completions',
    defaultModel: 'MiniMax-M2.5',
    models: ['MiniMax-M2.5', 'MiniMax-Text-01'],
  },
  siliconflow: {
    id: 'siliconflow',
    name: 'SiliconFlow (Qwen)',
    baseUrl: 'https://api.siliconflow.com/v1/chat/completions',
    defaultModel: 'Qwen/Qwen3-32B',
    models: ['Qwen/Qwen3-32B', 'Qwen/Qwen3-8B', 'Qwen/Qwen3-Coder-30B-A3B-Instruct'],
  },
  gemini: {
    id: 'gemini',
    name: 'Google Gemini',
    baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai/',
    defaultModel: 'gemini-2.0-flash',
    models: ['gemini-2.0-flash', 'gemini-2.5-pro', 'gemini-exp-1206'],
  },
  qwen: {
    id: 'qwen',
    name: 'Qwen (阿里云)',
    baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
    defaultModel: 'qwen-max',
    models: ['qwen-max', 'qwen-plus', 'qwen-turbo', 'qwen2.5-72b-instruct'],
  },
  custom: {
    id: 'custom',
    name: 'Custom OpenAI-Compatible',
    baseUrl: '',
    defaultModel: '',
    models: [],
  },
};

function getProviderPreset(provider) {
  return PROVIDER_PRESETS[provider] || PROVIDER_PRESETS.openai;
}

function applyProviderPreset(settings, provider, { preserveApiKey = true } = {}) {
  const preset = getProviderPreset(provider);
  const next = Object.assign({}, settings);
  next.provider = provider;
  next.baseUrl = preset.baseUrl || next.baseUrl;
  next.model = preset.defaultModel || next.model;
  if (!preserveApiKey) next.apiKey = '';
  return next;
}

/** 相对仓库根（知识库根）的路径，便于在标准管理里展示与复制 */
function getTreDataPaths(pluginId = 'text-review-engine') {
  const base = `.obsidian/plugins/${pluginId}`;
  return {
    rulesDir: `${base}/rules/`,
    promptsDir: `${base}/prompts/`,
    backupsDir: `${base}/backups/`,
    typoRules: `${base}/rules/typo-rules.json`,
    sensitiveTerms: `${base}/rules/sensitive-terms.json`,
    fixedPhrases: `${base}/rules/fixed-phrases.json`,
    comboRules: `${base}/rules/combo-rules.json`,
    punctuationRules: `${base}/rules/punctuation-rules.json`,
    rulesManifest: `${base}/rules/manifest.json`,
  };
}

module.exports = {
  DEFAULT_SETTINGS,
  VIEW_TYPE_REVIEW,
  STANDARDS_NOTE_PATH,
  REVIEW_MODES,
  REVIEW_MODE_LABELS,
  PROVIDER_PRESETS,
  getProviderPreset,
  applyProviderPreset,
  getTreDataPaths,
};
