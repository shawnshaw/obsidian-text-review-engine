const { ItemView, Notice } = require('obsidian');
const { STANDARDS_NOTE_PATH, getTreDataPaths } = require('./defaults');

const VIEW_TYPE_STANDARDS = 'text-review-engine-standards-view';
const VIEW_TYPE_FIXED_GOVERNANCE = 'text-review-engine-fixed-governance-view';

const TABS = [
  { id: 'overview', label: '索引' },
  { id: 'typo', label: '错别字' },
  { id: 'sensitive', label: '敏感词' },
  { id: 'fixed', label: '固定搭配' },
  { id: 'combo', label: '强制组合' },
  { id: 'prompt', label: 'AI Prompt' },
  { id: 'backup', label: '备份' },
];

/* ============================================================
   Fixed Phrase Governance State
   ============================================================ */
const FIXED_STATES = ['all', 'active', 'draft', 'candidate', 'disabled', 'deprecated'];
const FIXED_TAGS = ['verb_object', 'word_order', 'verb_redundancy', 'gov_style', 'typo_like'];
const FIXED_PACKS = ['social-basic', 'gov-strict'];
const FIXED_SEVERITIES = ['critical', 'high', 'medium', 'low'];
const FIXED_QUALITY_LABELS = [
  { id: 'duplicates', label: '疑似重复', color: '#dc2626' },
  { id: 'no_examples', label: '无样例', color: '#d97706' },
  { id: 'no_counterexamples', label: '无反例', color: '#d97706' },
  { id: 'low_conf', label: '低置信度', color: '#d97706' },
];

const STATUS_LABELS = { draft: '草稿', candidate: '候选', active: '已启用', disabled: '已停用', deprecated: '已废弃' };
const STATUS_COLORS = { draft: '#94a3b8', candidate: '#7c3aed', active: '#059669', disabled: '#94a3b8', deprecated: '#64748b' };
const SEVERITY_COLORS = { critical: '#dc2626', high: '#ea580c', medium: '#d97706', low: '#2563eb' };

class StandardsView extends ItemView {
  constructor(leaf, plugin) {
    super(leaf);
    this.plugin = plugin;
    this.activeTab = 'typo';
    this.searchQuery = '';
    this.expandedPromptId = null;
    /* ---- Fixed Phrase Governance State ---- */
    this.fpSelectedRuleId = null;
    this.fpFilters = {
      state: 'all',
      tag: 'all',
      pack: 'all',
      quality: 'all',
    };
    this.fpDetailTab = 'core';
    this.fpEditMode = false;
    this.fpConflictData = null;
  }

  async switchToTab(tabId) {
    this.activeTab = tabId;
    this.searchQuery = '';
    await this.render();
  }

  getViewType() { return VIEW_TYPE_STANDARDS; }
  getDisplayText() { return '标准管理'; }
  getIcon() { return 'list-checks'; }

  async onOpen() { await this.render(); }

  async render() {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.addClass('trs');

    this.renderHeader(contentEl);
    const body = contentEl.createDiv({ cls: 'trs-body' });
    this.renderTabs(body);
    const content = body.createDiv({ cls: 'trs-content' });
    this.renderTabContent(content);
  }

  renderHeader(container) {
    const header = container.createDiv({ cls: 'trs-header' });
    const left = header.createDiv({ cls: 'trs-header__left' });
    left.createDiv({ cls: 'trs-header__eyebrow', text: 'Standards Center' });
    left.createEl('h2', { cls: 'trs-header__title', text: '标准管理' });

    const version = this.plugin.ruleStore?.manifest?.version || 'unknown';
    left.createDiv({ cls: 'trs-header__version', text: version });

    const actions = header.createDiv({ cls: 'trs-header__actions' });
    this.createBtn(actions, '审校标准笔记', false, async () => {
      await this.plugin.openStandardsCenter();
    });
    this.createBtn(actions, '插件设置', false, async () => {
      this.plugin.openPluginSettings();
    });
    this.createBtn(actions, '应用更改', true, async () => {
      await this.plugin.applyAllChanges(true);
    });
    this.createBtn(actions, '刷新', false, async () => {
      await this.plugin.reloadRuleStore(true);
      await this.plugin.reloadPromptStore(true);
      await this.render();
    });
  }

  renderTabs(container) {
    const nav = container.createDiv({ cls: 'trs-tabs' });
    TABS.forEach((tab) => {
      const btn = nav.createEl('button', {
        cls: `trs-tabs__item${this.activeTab === tab.id ? ' is-active' : ''}`,
        text: tab.label,
        attr: { type: 'button' },
      });
      const count = this.getTabCount(tab.id);
      if (count > 0) {
        btn.createEl('span', { cls: 'trs-tabs__badge', text: String(count) });
      }
      btn.addEventListener('click', async () => {
        this.activeTab = tab.id;
        this.searchQuery = '';
        await this.render();
      });
    });
  }

  getTabCount(tabId) {
    const rs = this.plugin.ruleStore;
    switch (tabId) {
      case 'typo': return rs?.typoRules?.length || 0;
      case 'sensitive': return rs?.sensitiveTerms?.length || 0;
      case 'fixed': return rs?.fixedPhraseRules?.length || 0;
      case 'combo': return rs?.comboRules?.length || 0;
      case 'prompt': return this.plugin.standardsService?.listPrompts?.()?.length || 0;
      case 'backup': return this.plugin.standardsService?.listBackups?.()?.length || 0;
      default: return 0;
    }
  }

  renderTabContent(container) {
    switch (this.activeTab) {
      case 'overview': return this.renderOverview(container);
      case 'typo': return this.renderRuleTab(container, 'typo');
      case 'sensitive': return this.renderRuleTab(container, 'sensitive');
      case 'fixed': return this.renderFixedGovernanceTab(container);
      case 'combo': return this.renderRuleTab(container, 'combo');
      case 'prompt': return this.renderPromptTab(container);
      case 'backup': return this.renderBackupTab(container);
    }
  }

  /* ============================== 索引：词库路径 + 编辑标准 + AI ============================== */
  renderOverview(container) {
    const pid = this.plugin.manifest?.id || 'text-review-engine';
    const paths = getTreDataPaths(pid);

    container.createDiv({ cls: 'trs-index-lead', text: '词库在插件目录的 JSON 里；编辑常用口径写在库内标准笔记。改代码后务必点「应用更改」以重新打包并热重载。' });

    const jump = container.createDiv({ cls: 'trs-index-jump' });
    const jumps = [
      { label: '错别字词库', tab: 'typo' },
      { label: '敏感词', tab: 'sensitive' },
      { label: '固定搭配', tab: 'fixed' },
      { label: '强制组合', tab: 'combo' },
      { label: 'AI Prompt', tab: 'prompt' },
      { label: '备份', tab: 'backup' },
    ];
    jumps.forEach(({ label, tab }) => {
      const b = jump.createEl('button', { cls: 'trs-index-jump__btn', text: label, attr: { type: 'button' } });
      b.addEventListener('click', async () => { await this.switchToTab(tab); });
    });

    const noteCard = container.createDiv({ cls: 'trs-card trs-card--compact' });
    noteCard.createDiv({ cls: 'trs-card__title', text: '编辑常用审校标准（库内笔记）' });
    noteCard.createDiv({ cls: 'trs-path-line', text: STANDARDS_NOTE_PATH });
    const noteRow = noteCard.createDiv({ cls: 'trs-index-actions' });
    this.createBtn(noteRow, '打开该笔记', true, async () => { await this.plugin.openStandardsCenter(); });

    const files = container.createDiv({ cls: 'trs-card trs-card--compact' });
    files.createDiv({ cls: 'trs-card__title', text: '词库文件（相对知识库根目录）' });
    const list = files.createEl('ul', { cls: 'trs-path-list' });
    Object.entries(paths).forEach(([key, rel]) => {
      const li = list.createEl('li');
      li.createEl('span', { cls: 'trs-path-key', text: `${key}: ` });
      li.createEl('code', { cls: 'trs-path-code', text: rel });
    });
    const copyRow = files.createDiv({ cls: 'trs-index-actions' });
    this.createBtn(copyRow, '复制 rules 文件夹绝对路径', false, async () => {
      await this.plugin.copyPluginSubpathToClipboard('rules');
    });
    this.createBtn(copyRow, '复制 prompts 文件夹绝对路径', false, async () => {
      await this.plugin.copyPluginSubpathToClipboard('prompts');
    });

    const aiCard = container.createDiv({ cls: 'trs-card trs-card--ai trs-card--compact' });
    aiCard.createDiv({ cls: 'trs-card__title', text: '把 AI 接进审校流程' });
    const hasApiKey = !!(this.plugin.settings?.apiKey && String(this.plugin.settings.apiKey).trim());
    const includeAi = this.plugin.settings?.includeAiWithRules === true;
    const mode = this.plugin.panelState?.mode || 'standard';
    const ul = aiCard.createEl('ul', { cls: 'trs-card__list' });
    ul.createEl('li', { text: '方式 A：审校工作台顶栏选「严格」→ 规则 + AI 一起跑。' });
    ul.createEl('li', { text: '方式 B：保持「轻量/标准」→ 勾选「加跑 AI」开关（在工作台输入框下方）。' });
    ul.createEl('li', { text: `当前：API Key ${hasApiKey ? '已配置' : '未配置'}；加跑 AI ${includeAi ? '已开启' : '未开启'}；模式 ${mode}。` });
    const aiBtns = aiCard.createDiv({ cls: 'trs-index-actions' });
    this.createBtn(aiBtns, '打开插件设置', false, async () => { this.plugin.openPluginSettings(); });
    this.createBtn(aiBtns, '去改 Prompt', false, async () => { await this.switchToTab('prompt'); });
  }

  /* ============================== Rule Tabs ============================== */
  renderRuleTab(container, category) {
    const config = this.getRuleCategoryConfig(category);
    const rules = config.rules || [];

    const toolbar = container.createDiv({ cls: 'trs-toolbar' });
    const searchWrap = toolbar.createDiv({ cls: 'trs-search' });
    const searchInput = searchWrap.createEl('input', {
      cls: 'trs-search__input',
      attr: { type: 'text', placeholder: `搜索${config.label}…（${rules.length} 条）` },
    });
    searchInput.value = this.searchQuery;
    searchInput.addEventListener('input', () => {
      this.searchQuery = searchInput.value;
      this.rerenderRuleList(container, category);
    });

    const addBtn = toolbar.createEl('button', {
      cls: 'trs-btn trs-btn--primary',
      text: `新增${config.label}`,
      attr: { type: 'button' },
    });
    addBtn.addEventListener('click', () => {
      this.toggleAddForm(container, category);
    });

    this.renderAddForm(container, category, config);
    this.listContainer = container.createDiv({ cls: 'trs-rule-list' });
    this.rerenderRuleList(container, category);
  }

  rerenderRuleList(container, category) {
    if (!this.listContainer) return;
    this.listContainer.empty();
    const config = this.getRuleCategoryConfig(category);
    const rules = config.rules || [];
    const query = this.searchQuery.toLowerCase().trim();
    const filtered = query
      ? rules.filter((r) => config.searchText(r).toLowerCase().includes(query))
      : rules;

    if (!filtered.length) {
      this.listContainer.createDiv({ cls: 'trs-empty', text: query ? '无匹配结果' : '暂无规则' });
      return;
    }

    const countEl = this.listContainer.createDiv({ cls: 'trs-rule-list__count' });
    countEl.setText(query ? `匹配 ${filtered.length} / ${rules.length} 条` : `共 ${rules.length} 条`);

    filtered.forEach((rule, idx) => {
      const row = this.listContainer.createDiv({ cls: 'trs-rule-row' });
      const num = row.createDiv({ cls: 'trs-rule-row__num', text: String(idx + 1) });

      const main = row.createDiv({ cls: 'trs-rule-row__main' });
      main.createDiv({ cls: 'trs-rule-row__title', text: config.displayTitle(rule) });

      const meta = main.createDiv({ cls: 'trs-rule-row__meta' });
      const sevCls = `trs-severity trs-severity--${rule.severity || 'low'}`;
      meta.createEl('span', { cls: sevCls, text: rule.severity || 'low' });
      if (rule.message) {
        meta.createEl('span', { cls: 'trs-rule-row__msg', text: rule.message });
      }

      const delBtn = row.createEl('button', {
        cls: 'trs-btn trs-btn--ghost trs-btn--sm',
        text: '删除',
        attr: { type: 'button' },
      });
      delBtn.addEventListener('click', async () => {
        this.plugin.standardsService.removeRule(config.storeKey, rule.id);
        await this.plugin.reloadRuleStore(true);
        await this.render();
      });
    });
  }

  toggleAddForm(container, category) {
    const existing = container.querySelector('.trs-add-form');
    if (existing) {
      existing.classList.toggle('is-hidden');
      return;
    }
  }

  renderAddForm(container, category, config) {
    const form = container.createDiv({ cls: 'trs-add-form' });
    form.createDiv({ cls: 'trs-add-form__title', text: `新增${config.label}` });
    const row = form.createDiv({ cls: 'trs-add-form__fields' });
    const inputs = {};
    config.fields.forEach((f) => {
      const input = row.createEl('input', {
        cls: 'trs-input',
        attr: { type: 'text', placeholder: f.placeholder },
      });
      inputs[f.key] = input;
    });

    const submitBtn = row.createEl('button', {
      cls: 'trs-btn trs-btn--primary trs-btn--sm',
      text: '添加',
      attr: { type: 'button' },
    });
    submitBtn.addEventListener('click', async () => {
      const payload = {};
      config.fields.forEach((f) => { payload[f.key] = (inputs[f.key].value || '').trim(); });
      const ok = config.submit(payload);
      if (!ok) return;
      config.fields.forEach((f) => { inputs[f.key].value = ''; });
      await this.plugin.reloadRuleStore(true);
      await this.render();
    });
  }

  getRuleCategoryConfig(category) {
    const rs = this.plugin.ruleStore;
    const svc = this.plugin.standardsService;
    switch (category) {
      case 'typo':
        return {
          label: '错别字',
          storeKey: 'typoRules',
          rules: rs?.typoRules || [],
          fields: [
            { key: 'wrong', placeholder: '错误写法' },
            { key: 'correct', placeholder: '正确写法' },
            { key: 'severity', placeholder: '严重度 (low/medium/high)' },
            { key: 'message', placeholder: '说明（可选）' },
          ],
          displayTitle: (r) => `${r.wrong} → ${r.correct}`,
          searchText: (r) => `${r.wrong} ${r.correct} ${r.message || ''}`,
          submit: (p) => {
            if (!p.wrong || !p.correct) { new Notice('请填写错误和正确写法'); return false; }
            svc.addTypoRule({ wrong: p.wrong, correct: p.correct, severity: p.severity || 'medium', message: p.message || `"${p.wrong}" 疑似错别字` });
            return true;
          },
        };
      case 'sensitive':
        return {
          label: '敏感词',
          storeKey: 'sensitiveTerms',
          rules: rs?.sensitiveTerms || [],
          fields: [
            { key: 'term', placeholder: '词条' },
            { key: 'severity', placeholder: '严重度 (low/medium/high)' },
            { key: 'message', placeholder: '说明' },
            { key: 'suggestion', placeholder: '建议替代' },
          ],
          displayTitle: (r) => r.term,
          searchText: (r) => `${r.term} ${r.message || ''} ${r.suggestion || ''}`,
          submit: (p) => {
            if (!p.term) { new Notice('请填写词条'); return false; }
            svc.addSensitiveTerm({ term: p.term, severity: p.severity || 'high', message: p.message || `"${p.term}" 不建议使用`, suggestion: p.suggestion || '' });
            return true;
          },
        };
      case 'fixed':
        return {
          label: '固定搭配',
          storeKey: 'fixedPhraseRules',
          rules: rs?.fixedPhraseRules || [],
          fields: [
            { key: 'wrong', placeholder: '问题写法' },
            { key: 'correct', placeholder: '建议写法' },
            { key: 'severity', placeholder: '严重度' },
            { key: 'message', placeholder: '说明' },
          ],
          displayTitle: (r) => `${r.wrong} → ${r.correct}`,
          searchText: (r) => `${r.wrong} ${r.correct} ${r.message || ''}`,
          submit: (p) => {
            if (!p.wrong || !p.correct) { new Notice('请填写问题和建议写法'); return false; }
            svc.addFixedPhrase({ wrong: p.wrong, correct: p.correct, severity: p.severity || 'medium', message: p.message || `"${p.wrong}" 建议调整` });
            return true;
          },
        };
      case 'combo':
        return {
          label: '强制组合',
          storeKey: 'comboRules',
          rules: rs?.comboRules || [],
          fields: [
            { key: 'trigger', placeholder: '触发词' },
            { key: 'requiredAny', placeholder: '必需项（逗号分隔）' },
            { key: 'severity', placeholder: '严重度' },
            { key: 'message', placeholder: '说明' },
          ],
          displayTitle: (r) => `${r.trigger} ⇒ ${Array.isArray(r.requiredAny) ? r.requiredAny.join(' / ') : r.requiredAny}`,
          searchText: (r) => `${r.trigger} ${Array.isArray(r.requiredAny) ? r.requiredAny.join(' ') : r.requiredAny || ''} ${r.message || ''}`,
          submit: (p) => {
            if (!p.trigger || !p.requiredAny) { new Notice('请填写触发词和必需项'); return false; }
            svc.addComboRule({
              trigger: p.trigger,
              requiredAny: p.requiredAny.split(',').map((s) => s.trim()).filter(Boolean),
              severity: p.severity || 'high',
              message: p.message || `"${p.trigger}" 需补足组合`,
            });
            return true;
          },
        };
      default:
        return { label: '未知', storeKey: '', rules: [], fields: [], displayTitle: () => '', searchText: () => '', submit: () => false };
    }
  }

  /* ============================== Prompt Tab ============================== */
  renderPromptTab(container) {
    const prompts = this.plugin.standardsService?.listPrompts?.() || [];
    if (!prompts.length) {
      container.createDiv({ cls: 'trs-empty', text: '暂无 Prompt 配置。严格模式使用 prompts/policy-expression.json。' });
      return;
    }

    prompts.forEach((prompt) => {
      const card = container.createDiv({ cls: 'trs-prompt-card' });
      const head = card.createDiv({ cls: 'trs-prompt-card__head' });
      const info = head.createDiv({ cls: 'trs-prompt-card__info' });
      info.createDiv({ cls: 'trs-prompt-card__name', text: prompt.name || prompt.id });
      info.createDiv({ cls: 'trs-prompt-card__desc', text: prompt.description || '暂无描述' });

      const toggleBtn = head.createEl('button', {
        cls: 'trs-btn trs-btn--ghost',
        text: this.expandedPromptId === prompt.id ? '收起' : '编辑',
        attr: { type: 'button' },
      });
      toggleBtn.addEventListener('click', async () => {
        this.expandedPromptId = this.expandedPromptId === prompt.id ? null : prompt.id;
        await this.render();
      });

      if (this.expandedPromptId !== prompt.id) return;

      const editor = card.createDiv({ cls: 'trs-prompt-card__editor' });

      editor.createDiv({ cls: 'trs-label', text: 'System Prompt' });
      const sysInput = editor.createEl('textarea', { cls: 'trs-textarea' });
      sysInput.value = prompt.systemPrompt || '';

      editor.createDiv({ cls: 'trs-label', text: 'User Prompt Template' });
      const userInput = editor.createEl('textarea', { cls: 'trs-textarea trs-textarea--tall' });
      userInput.value = prompt.userPromptTemplate || '';

      editor.createDiv({ cls: 'trs-label', text: 'Temperature' });
      const tempInput = editor.createEl('input', {
        cls: 'trs-input trs-input--short',
        attr: { type: 'number', step: '0.1', min: '0', max: '1' },
      });
      tempInput.value = String(prompt.modelPolicy?.temperature ?? 0.1);

      const saveBtn = editor.createEl('button', {
        cls: 'trs-btn trs-btn--primary',
        text: '保存 Prompt',
        attr: { type: 'button' },
      });
      saveBtn.addEventListener('click', async () => {
        this.plugin.standardsService.savePrompt(prompt.id, {
          systemPrompt: sysInput.value,
          userPromptTemplate: userInput.value,
          modelPolicy: { temperature: Number(tempInput.value || 0.1) },
        });
        await this.plugin.reloadPromptStore(true);
        new Notice(`已保存 Prompt: ${prompt.name || prompt.id}`);
      });
    });
  }

  /* ============================== Backup Tab ============================== */
  renderBackupTab(container) {
    const toolbar = container.createDiv({ cls: 'trs-toolbar' });
    this.createBtn(toolbar, '立即备份', true, async () => {
      const id = this.plugin.standardsService.backupNow('manual-ui');
      new Notice(`已创建备份: ${id}`);
      await this.render();
    });

    const backups = this.plugin.standardsService?.listBackups?.() || [];
    if (!backups.length) {
      container.createDiv({ cls: 'trs-empty', text: '暂无备份快照。' });
      return;
    }

    container.createDiv({ cls: 'trs-rule-list__count', text: `共 ${backups.length} 个备份` });
    const list = container.createDiv({ cls: 'trs-backup-list' });
    backups.forEach((backup) => {
      const row = list.createDiv({ cls: 'trs-backup-row' });
      const main = row.createDiv({ cls: 'trs-backup-row__main' });
      main.createDiv({ cls: 'trs-backup-row__id', text: backup.id });
      const meta = main.createDiv({ cls: 'trs-backup-row__meta' });
      meta.createEl('span', { text: backup.reason || 'manual' });
      if (backup.createdAt) {
        meta.createEl('span', { text: backup.createdAt.replace('T', ' ').slice(0, 19) });
      }

      const actions = row.createDiv({ cls: 'trs-backup-row__actions' });
      const viewBtn = actions.createEl('button', {
        cls: 'trs-btn trs-btn--ghost trs-btn--sm',
        text: '查看',
        attr: { type: 'button' },
      });
      viewBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        this.showBackupViewer(backup.id);
      });

      this.createBtn(actions, '恢复', false, async () => {
        this.plugin.standardsService.restoreBackup(backup.id);
        await this.plugin.reloadRuleStore(true);
        new Notice(`已恢复备份: ${backup.id}`);
        await this.render();
      });
    });
  }

  showBackupViewer(backupId) {
    const svc = this.plugin.standardsService;
    const pluginDir = this.plugin.manifest?.dir || '';
    const backupsDir = require('path').join(pluginDir, 'backups');
    const backupDir = require('path').join(backupsDir, backupId);
    let fs;
    try {
      fs = require('fs');
    } catch (_) {
      new Notice('无法访问文件系统 API');
      return;
    }

    let files = [];
    try {
      files = fs.readdirSync(backupDir).filter((f) => f.endsWith('.json') && f !== 'meta.json');
    } catch (_) {
      new Notice('无法读取备份目录');
      return;
    }

    if (!files.length) {
      new Notice('该备份不含规则文件');
      return;
    }

    /* Build modal */
    const modalEl = this.contentEl.createDiv({ cls: 'trs-backup-viewer' });
    const overlay = this.contentEl.createDiv({ cls: 'trs-backup-viewer__overlay' });
    overlay.addEventListener('click', () => {
      modalEl.remove();
      overlay.remove();
    });

    const modal = modalEl.createDiv({ cls: 'trs-backup-viewer__modal' });
    const header = modal.createDiv({ cls: 'trs-backup-viewer__head' });
    header.createDiv({ cls: 'trs-backup-viewer__title', text: `备份快照 · ${backupId}` });
    const closeBtn = header.createEl('button', { cls: 'trs-btn trs-btn--ghost', text: '✕', attr: { type: 'button' } });
    closeBtn.addEventListener('click', () => { modalEl.remove(); overlay.remove(); });

    const fileList = modal.createDiv({ cls: 'trs-backup-viewer__files' });
    files.forEach((file) => {
      const btn = fileList.createEl('button', {
        cls: 'trs-btn trs-btn--ghost trs-btn--sm trs-backup-viewer__file-btn',
        text: file,
        attr: { type: 'button' },
      });
      btn.addEventListener('click', () => {
        const viewerEl = modal.querySelector('.trs-backup-viewer__content');
        if (viewerEl) viewerEl.remove();
        let content;
        try {
          content = fs.readFileSync(require('path').join(backupDir, file), 'utf8');
        } catch (_) {
          content = '无法读取文件';
        }
        const viewer = modal.createDiv({ cls: 'trs-backup-viewer__content' });
        viewer.createDiv({ cls: 'trs-backup-viewer__content-label', text: file });
        let parsed;
        try { parsed = JSON.parse(content); } catch (_) { parsed = null; }
        const pre = viewer.createEl('pre', { cls: 'trs-backup-viewer__pre' });
        pre.setText(parsed ? JSON.stringify(parsed, null, 2) : content);
      });
    });
  }

/* ============================== 固定搭配治理台 (Fixed Phrase Governance) ============================== */
  async renderFixedGovernanceTab(container) {
    /* Load conflict data once */
    try {
      const svc = this.plugin.standardsService;
      if (svc?.runConflictReport) {
        await svc.runConflictReport();
        this.fpConflictData = svc.getConflictReport() || null;
      }
    } catch (_) { /* non-fatal */ }

    /* Top bar */
    const topbar = container.createDiv({ cls: 'fp-topbar' });
    const topbarLeft = topbar.createDiv({ cls: 'fp-topbar__left' });
    topbarLeft.createEl('h3', { cls: 'fp-topbar__title', text: '固定搭配规则' });
    topbarLeft.createDiv({ cls: 'fp-topbar__sub', text: '维护规范表达、动宾搭配、冗余表达与顺序错误' });

    const topbarRight = topbar.createDiv({ cls: 'fp-topbar__actions' });
    this.createBtn(topbarRight, '新增规则', true, () => {
      this.fpEditMode = 'add';
      this.fpSelectedRuleId = null;
      this._renderFixedBody(container, null);
    });
    this.createBtn(topbarRight, '运行回归', false, async () => {
      const svc = this.plugin.standardsService;
      if (!svc?.runConflictReport) return;
      new Notice('正在运行回归测试…');
      await svc.runConflictReport();
      this.fpConflictData = svc.getConflictReport() || null;
      new Notice(`回归完成：${this.fpConflictData?.summary?.totalPass || 0} pass / ${this.fpConflictData?.summary?.totalHit || 0} hit`);
      this._renderFixedBody(container, this.fpSelectedRuleId);
    });
    this.createBtn(topbarRight, '刷新', false, async () => {
      await this.plugin.reloadRuleStore(true);
      this.fpSelectedRuleId = null;
      this.fpEditMode = false;
      this._renderFixedBody(container, null);
    });

    /* 3-panel body: rail + list + detail */
    const body = container.createDiv({ cls: 'fp-body' });
    const rules = this.plugin.ruleStore?.fixedPhraseRules || [];
    this._renderFixedRail(body, rules);
    this._renderFixedBody(container, this.fpSelectedRuleId);
  }

  _renderFixedRail(body, allRules) {
    const rail = body.createDiv({ cls: 'fp-rail' });

    /* Helper: count for a filter */
    const count = (fn) => allRules.filter(fn).length;

    /* Helper: build a rail group */
    const buildGroup = (label, items) => {
      const group = rail.createDiv({ cls: 'fp-rail__group' });
      group.createDiv({ cls: 'fp-rail__group-label', text: label });
      items.forEach(({ id, label: lbl, color }) => {
        const item = group.createDiv({ cls: 'fp-rail__item' });
        const isActive = Object.values(this.fpFilters).includes(id);
        item.addClass(isActive ? 'is-active' : '');
        const dot = item.createDiv({ cls: 'fp-rail__dot' });
        if (color) dot.setAttribute('style', `background:${color}`);
        const lblEl = item.createDiv({ cls: 'fp-rail__lbl', text: lbl });
        const badge = item.createDiv({ cls: 'fp-rail__badge' });
        let num = 0;
        switch (id) {
          case 'all': num = allRules.length; break;
          case 'active': num = count(r => r.status === 'active'); break;
          case 'draft': num = count(r => r.status === 'draft'); break;
          case 'candidate': num = count(r => r.status === 'candidate'); break;
          case 'disabled': num = count(r => r.status === 'disabled'); break;
          case 'deprecated': num = count(r => r.status === 'deprecated'); break;
          default: num = count(r => (r.tags || []).includes(id)); break;
        }
        badge.setText(String(num));
        item.addEventListener('click', () => {
          if (label === '规则状态') this.fpFilters.state = id;
          else if (label === '规则分类') this.fpFilters.tag = id;
          else if (label === '规则包') this.fpFilters.pack = id;
          else if (label === '冲突与质量') this.fpFilters.quality = id;
          this._refreshFixedBody();
        });
      });
    };

    buildGroup('规则状态', FIXED_STATES.map(s => ({
      id: s,
      label: s === 'all' ? '全部' : (STATUS_LABELS[s] || s),
    })));

    buildGroup('规则分类', FIXED_TAGS.map(t => ({
      id: t,
      label: t === 'verb_object' ? '动词+宾语' : t === 'word_order' ? '顺序错误' : t === 'verb_redundancy' ? '冗余表达' : t === 'gov_style' ? '政务规范' : '近似错写',
    })));

    buildGroup('规则包', FIXED_PACKS.map(p => ({ id: p, label: p })));

    buildGroup('冲突与质量', [
      { id: 'duplicates', label: '疑似重复', color: '#dc2626' },
      { id: 'no_examples', label: '无样例', color: '#d97706' },
      { id: 'no_counterexamples', label: '无反例', color: '#d97706' },
      { id: 'low_conf', label: '低置信度', color: '#d97706' },
    ]);
  }

  _renderFixedBody(parentContainer, selectedRuleId) {
    /* Remove existing body if any */
    const existing = parentContainer.querySelector('.fp-body-inner');
    if (existing) existing.remove();

    const inner = parentContainer.createDiv({ cls: 'fp-body-inner' });

    /* List panel */
    const listPanel = inner.createDiv({ cls: 'fp-list-panel' });
    this._renderFixedSearchBar(listPanel);
    this._renderFixedRuleList(listPanel, selectedRuleId);

    /* Detail panel */
    const detailPanel = inner.createDiv({ cls: 'fp-detail-panel' });
    const rules = this.plugin.ruleStore?.fixedPhraseRules || [];
    const rule = selectedRuleId ? rules.find(r => r.id === selectedRuleId) : null;

    if (this.fpEditMode === 'add') {
      this._renderFixedAddForm(detailPanel);
    } else if (rule) {
      this._renderFixedDetail(detailPanel, rule);
    } else {
      detailPanel.createDiv({ cls: 'fp-detail-empty', text: '← 从左侧选择一条规则查看详情' });
    }
  }

  _refreshFixedBody() {
    const container = this.contentEl.querySelector('.trs-content');
    if (container) this._renderFixedBody(container, this.fpSelectedRuleId);
  }

  _renderFixedSearchBar(listPanel) {
    const toolbar = listPanel.createDiv({ cls: 'fp-list-toolbar' });
    const searchWrap = toolbar.createDiv({ cls: 'fp-search-wrap' });
    const searchInput = searchWrap.createEl('input', {
      cls: 'fp-search-input',
      attr: { type: 'text', placeholder: '搜索 wrong / correct / note…' },
    });
    searchInput.value = this.searchQuery;
    searchInput.addEventListener('input', () => {
      this.searchQuery = searchInput.value;
      this._refreshFixedBody();
    });
  }

  _renderFixedRuleList(listPanel, selectedRuleId) {
    const rules = this.plugin.ruleStore?.fixedPhraseRules || [];
    const filtered = this._getFilteredFixedRules(rules);
    const listEl = listPanel.createDiv({ cls: 'fp-rule-list' });

    const countEl = listEl.createDiv({ cls: 'fp-rule-list__count' });
    countEl.setText(`共 ${filtered.length} 条`);

    if (!filtered.length) {
      listEl.createDiv({ cls: 'fp-empty', text: this.searchQuery ? '无匹配结果' : '暂无规则' });
      return;
    }

    filtered.forEach((rule, idx) => {
      const row = listEl.createDiv({ cls: 'fp-rule-row' });
      if (rule.id === selectedRuleId) row.addClass('is-selected');
      /* Severity indicator bar */
      const sevColor = SEVERITY_COLORS[rule.severity] || SEVERITY_COLORS.medium;
      row.createDiv({ cls: 'fp-rule-row__bar' }).setAttribute('style', `background:${sevColor}`);
      /* Conflict warning */
      if (this._hasConflict(rule)) {
        const warn = row.createDiv({ cls: 'fp-rule-row__warn' });
        warn.setText('⚠');
        warn.setAttribute('title', '存在冲突规则');
      }
      /* Main content */
      const main = row.createDiv({ cls: 'fp-rule-row__main' });
      main.createDiv({ cls: 'fp-rule-row__pair', text: `${rule.wrong} → ${rule.correct}` });
      if (rule.message) {
        main.createDiv({ cls: 'fp-rule-row__msg', text: rule.message });
      }
      const meta = main.createDiv({ cls: 'fp-rule-row__meta' });
      const sevBadge = meta.createEl('span', { cls: 'fp-badge', text: rule.severity || 'medium' });
      sevBadge.setAttribute('style', `background:${sevColor}22;color:${sevColor}`);
      if (rule.pack?.length) {
        meta.createEl('span', { cls: 'fp-badge fp-badge--pack', text: rule.pack[0] });
      }
      const stBadge = meta.createEl('span', {
        cls: 'fp-badge fp-badge--status',
        text: STATUS_LABELS[rule.status] || rule.status || 'active',
      });
      const stColor = STATUS_COLORS[rule.status] || STATUS_COLORS.active;
      stBadge.setAttribute('style', `color:${stColor};background:${stColor}22`);
      if (rule.updatedAt) {
        meta.createEl('span', { cls: 'fp-rule-row__date', text: rule.updatedAt.slice(0, 10) });
      }
      row.addEventListener('click', () => {
        this.fpSelectedRuleId = rule.id;
        this.fpEditMode = false;
        this._renderFixedBody(this.contentEl.querySelector('.trs-content'), rule.id);
      });
    });
  }

  _getFilteredFixedRules(rules) {
    let filtered = [...rules];
    const q = this.searchQuery.toLowerCase().trim();
    /* Filter by state */
    if (this.fpFilters.state !== 'all') {
      filtered = filtered.filter(r => r.status === this.fpFilters.state);
    }
    /* Filter by tag */
    if (this.fpFilters.tag !== 'all') {
      filtered = filtered.filter(r => (r.tags || []).includes(this.fpFilters.tag));
    }
    /* Filter by pack */
    if (this.fpFilters.pack !== 'all') {
      filtered = filtered.filter(r => (r.pack || []).includes(this.fpFilters.pack));
    }
    /* Filter by quality dimension */
    if (this.fpFilters.quality !== 'all') {
      const conflictIds = new Set();
      const cd = this.fpConflictData;
      if (cd?.duplicates) cd.duplicates.forEach(g => g.ids.forEach(id => conflictIds.add(id)));
      if (cd?.wrongConflicts) cd.wrongConflicts.forEach(g => g.ids.forEach(id => conflictIds.add(id)));
      switch (this.fpFilters.quality) {
        case 'duplicates':
          filtered = filtered.filter(r => conflictIds.has(r.id));
          break;
        case 'no_examples':
          filtered = filtered.filter(r => !(r.examples && r.examples.length > 0));
          break;
        case 'no_counterexamples':
          filtered = filtered.filter(r => !(r.counterExamples && r.counterExamples.length > 0));
          break;
        case 'low_conf':
          filtered = filtered.filter(r => (r.confidence || 1) < 0.8);
          break;
      }
    }
    /* Text search */
    if (q) {
      filtered = filtered.filter(r =>
        (r.wrong || '').toLowerCase().includes(q) ||
        (r.correct || '').toLowerCase().includes(q) ||
        (r.note || '').toLowerCase().includes(q) ||
        ((r.tags || []).join(' ')).toLowerCase().includes(q)
      );
    }
    /* Sort by updatedAt desc */
    filtered.sort((a, b) => (b.updatedAt || '').localeCompare(a.updatedAt || ''));
    return filtered;
  }

  _hasConflict(rule) {
    const cd = this.fpConflictData;
    if (!cd) return false;
    const ids = new Set();
    if (cd.duplicates) cd.duplicates.forEach(g => g.ids.forEach(id => ids.add(id)));
    if (cd.wrongConflicts) cd.wrongConflicts.forEach(g => g.ids.forEach(id => ids.add(id)));
    return ids.has(rule.id);
  }

  _renderFixedDetail(panel, rule) {
    const svc = this.plugin.standardsService;
    /* Header */
    const header = panel.createDiv({ cls: 'fp-detail-head' });
    header.createDiv({ cls: 'fp-detail-head__pair', text: `${rule.wrong} → ${rule.correct}` });
    const headerActions = header.createDiv({ cls: 'fp-detail-head__actions' });
    this.createBtn(headerActions, '编辑', false, () => {
      this.fpEditMode = true;
      this._renderFixedBody(this.contentEl.querySelector('.trs-content'), rule.id);
    });
    this.createBtn(headerActions, '删除', false, async () => {
      if (!confirm(`确认删除规则「${rule.wrong}」？`)) return;
      svc.removeRule('fixedPhraseRules', rule.id);
      await this.plugin.reloadRuleStore(true);
      this.fpSelectedRuleId = null;
      this.fpEditMode = false;
      this._renderFixedBody(this.contentEl.querySelector('.trs-content'), null);
      new Notice('已删除');
    });
    /* Tabs */
    const tabsEl = panel.createDiv({ cls: 'fp-detail-tabs' });
    const tabs = [
      { id: 'core', label: '核心规则' },
      { id: 'strategy', label: '策略信息' },
      { id: 'examples', label: '解释与验证' },
      { id: 'history', label: '来源与历史' },
    ];
    tabs.forEach(t => {
      const btn = tabsEl.createEl('button', {
        cls: `fp-detail-tab${this.fpDetailTab === t.id ? ' is-active' : ''}`,
        text: t.label,
        attr: { type: 'button' },
      });
      btn.addEventListener('click', () => {
        this.fpDetailTab = t.id;
        this._renderFixedBody(this.contentEl.querySelector('.trs-content'), rule.id);
      });
    });
    /* Content */
    const content = panel.createDiv({ cls: 'fp-detail-content' });
    switch (this.fpDetailTab) {
      case 'core': this._renderFixedDetailCore(content, rule); break;
      case 'strategy': this._renderFixedDetailStrategy(content, rule); break;
      case 'examples': this._renderFixedDetailExamples(content, rule); break;
      case 'history': this._renderFixedDetailHistory(content, rule); break;
    }
  }

  _renderFixedDetailCore(content, rule) {
    const rows = [
      ['wrong', '问题写法', rule.wrong],
      ['correct', '建议写法', rule.correct],
      ['message', '提示信息', rule.message],
      ['suggestion', '修改建议', rule.suggestion],
      ['severity', '严重度', rule.severity],
    ];
    rows.forEach(([key, label, val]) => {
      if (val === undefined || val === null) return;
      const row = content.createDiv({ cls: 'fp-detail-row' });
      row.createDiv({ cls: 'fp-detail-row__lbl', text: label });
      row.createDiv({ cls: 'fp-detail-row__val', text: val });
    });
  }

  _renderFixedDetailStrategy(content, rule) {
    const svc = this.plugin.standardsService;
    const rows = [
      ['pack', '规则包', (rule.pack || []).join(', ')],
      ['enabled', '已启用', rule.enabled ? '是' : '否'],
      ['status', '状态', STATUS_LABELS[rule.status] || rule.status],
      ['scope', '匹配范围', rule.scope],
      ['matchMode', '匹配模式', rule.matchMode],
      ['confidence', '置信度', rule.confidence != null ? String(Math.round(rule.confidence * 100)) + '%' : ''],
    ];
    rows.forEach(([key, label, val]) => {
      if (val === undefined || val === null || val === '') return;
      const row = content.createDiv({ cls: 'fp-detail-row' });
      row.createDiv({ cls: 'fp-detail-row__lbl', text: label });
      const valEl = row.createDiv({ cls: 'fp-detail-row__val' });
      if (key === 'status') {
        const badge = valEl.createEl('span', {
          cls: 'fp-badge fp-badge--status',
          text: val,
        });
        const color = STATUS_COLORS[rule.status] || '#000';
        badge.setAttribute('style', `color:${color};background:${color}22`);
        /* Toggle status button */
        const toggleBtn = valEl.createEl('button', {
          cls: 'fp-inline-btn',
          text: rule.status === 'active' ? '停用' : '启用',
          attr: { type: 'button' },
        });
        toggleBtn.addEventListener('click', async () => {
          const next = rule.status === 'active' ? 'disabled' : 'active';
          svc.updateFixedPhrase(rule.id, { status: next });
          await this.plugin.reloadRuleStore(true);
          this._renderFixedBody(this.contentEl.querySelector('.trs-content'), rule.id);
          new Notice(`状态已更新为：${STATUS_LABELS[next]}`);
        });
      } else {
        valEl.setText(val);
      }
    });
    /* Lifecycle note */
    const lifecycle = content.createDiv({ cls: 'fp-lifecycle-note' });
    lifecycle.setText('draft → candidate → active → disabled / deprecated');
  }

  _renderFixedDetailExamples(content, rule) {
    const exRow = content.createDiv({ cls: 'fp-detail-row' });
    exRow.createDiv({ cls: 'fp-detail-row__lbl', text: '样例（应为 wrong）' });
    const exList = exRow.createDiv({ cls: 'fp-detail-row__val' });
    if (rule.examples?.length) {
      rule.examples.forEach(ex => exList.createDiv({ cls: 'fp-example-item', text: `• ${ex}` }));
    } else {
      exList.createDiv({ cls: 'fp-detail-row__warning', text: '⚠ 无样例' });
    }

    const cexRow = content.createDiv({ cls: 'fp-detail-row' });
    cexRow.createDiv({ cls: 'fp-detail-row__lbl', text: '反例（应为 correct）' });
    const cexList = cexRow.createDiv({ cls: 'fp-detail-row__val' });
    if (rule.counterExamples?.length) {
      rule.counterExamples.forEach(cex => cexList.createDiv({ cls: 'fp-example-item', text: `• ${cex}` }));
    } else {
      cexList.createDiv({ cls: 'fp-detail-row__warning', text: '⚠ 无反例' });
    }

    const noteRow = content.createDiv({ cls: 'fp-detail-row' });
    noteRow.createDiv({ cls: 'fp-detail-row__lbl', text: '备注' });
    noteRow.createDiv({ cls: 'fp-detail-row__val', text: rule.note || '—' });
  }

  _renderFixedDetailHistory(content, rule) {
    const rows = [
      ['source', '来源', rule.source],
      ['owner', '负责人', rule.owner],
      ['domain', '适用领域', rule.domain],
      ['tags', '标签', (rule.tags || []).join(', ')],
      ['createdAt', '创建时间', rule.createdAt ? rule.createdAt.replace('T', ' ').slice(0, 19) : ''],
      ['updatedAt', '更新时间', rule.updatedAt ? rule.updatedAt.replace('T', ' ').slice(0, 19) : ''],
    ];
    rows.forEach(([key, label, val]) => {
      if (val === undefined || val === null || val === '') return;
      const row = content.createDiv({ cls: 'fp-detail-row' });
      row.createDiv({ cls: 'fp-detail-row__lbl', text: label });
      row.createDiv({ cls: 'fp-detail-row__val', text: val });
    });
  }

  _renderFixedAddForm(panel) {
    const svc = this.plugin.standardsService;
    panel.createDiv({ cls: 'fp-detail-head__pair', text: '新增固定搭配规则' });
    const form = panel.createDiv({ cls: 'fp-add-form' });

    const fields = [
      { key: 'wrong', label: '问题写法 *', placeholder: '如：召开活动' },
      { key: 'correct', label: '建议写法 *', placeholder: '如：举行活动' },
      { key: 'message', label: '提示信息', placeholder: '如：固定搭配不当' },
      { key: 'suggestion', label: '修改建议', placeholder: '如：建议改为「举行活动」' },
      { key: 'severity', label: '严重度', placeholder: 'low / medium / high / critical', default: 'medium' },
      { key: 'pack', label: '规则包（逗号分隔）', placeholder: 'social-basic, gov-strict', default: 'social-basic' },
      { key: 'status', label: '状态', placeholder: 'draft / candidate / active', default: 'active' },
      { key: 'tags', label: '标签（逗号分隔）', placeholder: 'verb_object, gov_style', default: 'verb_object' },
      { key: 'examples', label: '样例（每行一条）', placeholder: '召开活动\n市里召开主题活动', multiline: true },
      { key: 'counterExamples', label: '反例（每行一条）', placeholder: '相关部门将依法召开会议', multiline: true },
      { key: 'note', label: '备注', placeholder: '适用于…', multiline: true },
    ];

    const inputs = {};
    fields.forEach(f => {
      const row = form.createDiv({ cls: 'fp-form-row' });
      row.createDiv({ cls: 'fp-form-row__lbl', text: f.label });
      if (f.multiline) {
        const ta = row.createEl('textarea', {
          cls: 'fp-form-textarea',
          attr: { placeholder: f.placeholder, rows: '3' },
        });
        inputs[f.key] = ta;
      } else {
        const inp = row.createEl('input', {
          cls: 'fp-form-input',
          attr: { type: 'text', placeholder: f.placeholder, value: f.default || '' },
        });
        inputs[f.key] = inp;
      }
    });

    const actions = form.createDiv({ cls: 'fp-form-actions' });
    this.createBtn(actions, '保存', true, async () => {
      const wrong = (inputs.wrong.value || '').trim();
      const correct = (inputs.correct.value || '').trim();
      if (!wrong || !correct) {
        new Notice('错误写法和正确写法不能为空');
        return;
      }
      /* Pre-submit check: duplicates */
      const existing = (this.plugin.ruleStore?.fixedPhraseRules || []).find(
        r => r.wrong === wrong && r.correct === correct && r.status !== 'deprecated'
      );
      if (existing) {
        new Notice('已存在完全相同的 (wrong, correct) 规则，请检查后再试');
        return;
      }
      const payload = {
        wrong, correct,
        message: (inputs.message.value || '').trim() || `"${wrong}" 搭配不当`,
        suggestion: (inputs.suggestion.value || '').trim(),
        severity: (inputs.severity.value || 'medium').trim(),
        pack: (inputs.pack.value || 'social-basic').split(',').map(s => s.trim()).filter(Boolean),
        status: (inputs.status.value || 'active').trim(),
        tags: (inputs.tags.value || 'verb_object').split(',').map(s => s.trim()).filter(Boolean),
        examples: (inputs.examples.value || '').split('\n').map(s => s.trim()).filter(Boolean),
        counterExamples: (inputs.counterExamples.value || '').split('\n').map(s => s.trim()).filter(Boolean),
        note: (inputs.note.value || '').trim(),
        source: 'manual',
        owner: 'manual',
        domain: 'general',
        confidence: 0.9,
        scope: 'literal',
        matchMode: 'exact',
        category: 'fixed_phrase',
        enabled: true,
      };
      svc.addFixedPhrase(payload);
      await this.plugin.reloadRuleStore(true);
      this.fpEditMode = false;
      this._renderFixedBody(this.contentEl.querySelector('.trs-content'), null);
      new Notice('规则已添加');
    });
    this.createBtn(actions, '取消', false, () => {
      this.fpEditMode = false;
      this._renderFixedBody(this.contentEl.querySelector('.trs-content'), null);
    });
  }

  /* ============================== Helpers ============================== */
  createBtn(parent, text, primary, onClick) {
    const btn = parent.createEl('button', {
      cls: `trs-btn${primary ? ' trs-btn--primary' : ''}`,
      text,
      attr: { type: 'button' },
    });
    btn.addEventListener('click', onClick);
    return btn;
  }
}

module.exports = {
  StandardsView,
  VIEW_TYPE_STANDARDS,
};
