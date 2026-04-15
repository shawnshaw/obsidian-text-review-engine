const { ItemView, Notice, setIcon } = require('obsidian');
const { normalizeText, normalizedSelectionOffset } = require('./preprocessor');
const { VIEW_TYPE_REVIEW, REVIEW_MODES, REVIEW_MODE_LABELS } = require('./defaults');
const { REVIEW_VIEW_BLUEPRINT } = require('./review-ui-config');
const { VIEW_TYPE_STANDARDS } = require('./standards-view');

function severityRank(severity) {
  switch (severity) {
    case 'critical': return 4;
    case 'high': return 3;
    case 'medium': return 2;
    default: return 1;
  }
}

function categorizeIssues(issues) {
  const groups = { blocking: [], review: [], polishRule: [], polishAi: [] };
  for (const issue of issues) {
    if (issue.severity === 'critical') groups.blocking.push(issue);
    else if (issue.requiresHumanReview || issue.severity === 'high') groups.review.push(issue);
    else if (issue.source === 'llm') groups.polishAi.push(issue);
    else groups.polishRule.push(issue);
  }
  return groups;
}

const ISSUE_GROUP_ORDER = ['blocking', 'review', 'polishRule', 'polishAi'];

const SEVERITY_LABEL = { critical: '严重', high: '高', medium: '中', low: '低' };
const GROUP_META = {
  blocking: { title: '阻断', cls: 'blocked', icon: 'alert-triangle' },
  review: { title: '需复核', cls: 'human-review', icon: 'eye' },
  polishRule: { title: '可优化 · 规则层', cls: 'needs-revision', icon: 'pencil' },
  polishAi: { title: '可优化 · AI审校', cls: 'needs-revision-ai', icon: 'bot' },
};

class ReviewView extends ItemView {
  constructor(leaf, plugin) {
    super(leaf);
    this.plugin = plugin;
    this.textareaEl = null;
    this.activeQuickRuleType = 'typo';
    this.showPromptEditor = false;
    this.showMoreActions = false;
    this.expandedGroups = { blocking: true, review: true, polishRule: false, polishAi: true };
    this.ignoredIssueIds = new Set();
    this.quickRuleDrafts = { typo: {}, sensitive: {}, fixed: {}, combo: {} };
    // 文件读取相关状态
    this._fileMode = false;
    this._fileMeta = null;
    this._fileHtml = null;
    this._fileRichEl = null;
    this._fileInputEl = null;
    this._fileRichContainer = null;
  }

  getViewType() { return VIEW_TYPE_REVIEW; }
  getDisplayText() { return '审校'; }
  getIcon() { return 'shield-alert'; }

  async onOpen() {
    this.contentEl.empty();
    this.contentEl.addClass('tre-workspace-view');
    await this.render();
  }

  async render() {
    const { contentEl } = this;
    contentEl.empty();
    this.renderTopBar(contentEl);
    this.renderReviewShell(contentEl);
  }

  /* ================================================================
     TOP BAR — 简洁：左=标题+模式  右=开始审校+标准管理+应用更改+更多
     ================================================================ */
  renderTopBar(container) {
    const handlers = this.getTopBarActionHandlers();
    const topbar = container.createDiv({ cls: 'tre-topbar' });

    const left = topbar.createDiv({ cls: 'tre-topbar__left' });
    const titleArea = left.createDiv({ cls: 'tre-topbar__title' });
    const uiVer = this.plugin.manifest?.version ? ` \u00b7 v${this.plugin.manifest.version}` : '';
    const rulesVer = this.plugin.ruleStore?.manifest?.version || '';
    titleArea.createDiv({ cls: 'tre-topbar__eyebrow', text: `Text Review Flow${uiVer}${rulesVer ? ` \u00b7 ${rulesVer}` : ''}` });
    titleArea.createEl('h2', { text: '\u5ba1\u6821\u5de5\u4f5c\u53f0' });

    const chips = left.createDiv({ cls: 'tre-topbar__chips' });
    REVIEW_MODES.forEach((mode) => {
      const chip = chips.createEl('button', {
        text: REVIEW_MODE_LABELS[mode] || mode,
        cls: `tre-topbar__chip${this.plugin.panelState.mode === mode ? ' is-active' : ''}`,
        attr: { type: 'button', title: `\u6a21\u5f0f\uff1a${mode}` },
      });
      chip.addEventListener('click', async () => {
        this.plugin.panelState.mode = mode;
        await this.plugin.savePanelState();
        await this.render();
      });
    });

    /* AI 审校场景选择器 */
    const sceneList = this.plugin.promptStore?.listPrompts() || [];
    if (sceneList.length > 1) {
      const sceneEl = left.createDiv({ cls: 'tre-topbar__scene' });
      const currentSceneId = this.plugin.panelState.activeSceneId || 'general-review';
      sceneEl.createEl('span', { text: 'AI 场景：', cls: 'tre-topbar__scene-label' });
      sceneList.forEach((prompt) => {
        const btn = sceneEl.createEl('button', {
          text: prompt.name,
          cls: `tre-topbar__scene-chip${currentSceneId === prompt.id ? ' is-active' : ''}`,
          attr: { type: 'button', title: prompt.description || prompt.id },
        });
        btn.addEventListener('click', async () => {
          this.plugin.panelState.activeSceneId = prompt.id;
          await this.plugin.savePanelState();
          await this.render();
        });
      });
    }

    const right = topbar.createDiv({ cls: 'tre-topbar__right' });

    const runBtn = right.createEl('button', {
      cls: 'tre-btn tre-btn--primary',
      text: '\u5f00\u59cb\u5ba1\u6821',
      attr: {
        type: 'button',
        title: '\u6709\u9009\u4e2d\u6587\u5b57\u5219\u53ea\u5ba1\u9009\u533a\uff1b\u65e0\u9009\u533a\u5219\u5ba1\u5168\u6587\u3002',
      },
    });
    runBtn.addEventListener('click', async () => { await this.runReview(); });

    const stdBtn = right.createEl('button', {
      cls: 'tre-btn tre-btn--standards',
      text: '\u2699\uFE0F \u6807\u51c6\u7ba1\u7406',
      attr: { type: 'button', title: '\u6253\u5f00\u6807\u51c6\u7ba1\u7406\u53f0\uff08\u89c4\u5219\u3001Prompt\u3001\u5907\u4efd\uff09' },
    });
    stdBtn.addEventListener('click', async () => {
      await this.plugin.activateStandardsView();
    });

    const applyBtn = right.createEl('button', {
      cls: 'tre-btn tre-btn--secondary',
      text: '\u5e94\u7528\u66f4\u6539',
      attr: { type: 'button' },
    });
    applyBtn.addEventListener('click', async () => { await handlers.applyChanges(); });

    this.renderTopBarMoreMenu(right, false, handlers);
  }

  getTopBarActionHandlers() {
    return {
      applyChanges: async () => { await this.plugin.reloadEntirePlugin(true); },
      openStandardsCenter: async () => { await this.plugin.openStandardsCenter(); },
      reloadRules: async () => { await this.plugin.reloadRuleStore(true); },
      reloadPrompts: async () => { await this.plugin.reloadPromptStore(true); },
      importSelection: async () => {
        const text = await this.plugin.loadSelectionIntoWorkbench();
        if (text && this.textareaEl) this.textareaEl.value = text;
        if (text) await this.render();
      },
      importFullNote: async () => {
        const text = await this.plugin.loadActiveNoteIntoWorkbench();
        if (text && this.textareaEl) this.textareaEl.value = text;
        if (text) await this.render();
      },
      openWorkbenchNote: async () => { await this.plugin.openWorkbenchNote(); },
      copyJson: async () => {
        if (!this.plugin.panelState.result) { new Notice('当前没有审校结果可复制'); return; }
        await navigator.clipboard.writeText(JSON.stringify(this.plugin.panelState.result, null, 2));
        new Notice('已复制 JSON 报告');
      },
    };
  }

  renderTopBarMoreMenu(parent, isMaintain, handlers) {
    const wrap = parent.createDiv({ cls: 'tre-topbar__more-wrap' });
    const toggle = wrap.createEl('button', {
      cls: `tre-topbar__chip${this.showMoreActions ? ' is-active' : ''}`,
      text: '更多',
      attr: { type: 'button' },
    });
    toggle.addEventListener('click', async () => {
      this.showMoreActions = !this.showMoreActions;
      await this.render();
    });
    if (!this.showMoreActions) return;

    const actions = isMaintain
      ? REVIEW_VIEW_BLUEPRINT.toolbar.maintainSecondary
      : REVIEW_VIEW_BLUEPRINT.toolbar.reviewSecondary;

    const menu = wrap.createDiv({ cls: 'tre-topbar__more-menu' });
    menu.createDiv({ cls: 'tre-topbar__more-title', text: isMaintain ? '治理动作' : '审校动作' });
    actions.forEach((action) => {
      const item = menu.createEl('button', { cls: 'tre-topbar__more-item', text: action.label || action.id });
      item.addEventListener('click', async () => {
        this.showMoreActions = false;
        await handlers[action.id]?.();
      });
    });
  }

  /* ================================================================
     审校模式 — 两栏：左 = 输入 + 结果banner + 标注原文  右 = 问题列表
     ================================================================ */
  renderReviewShell(container) {
    const result = this.plugin.panelState.result;
    const groups = categorizeIssues(result?.issues || []);

    const shell = container.createDiv({ cls: 'tre-shell tre-shell--review-v2' });

    const mainCol = shell.createDiv({ cls: 'tre-main-col' });
    this.renderMainInput(mainCol);
    this.renderAiProgressBar(mainCol);
    if (result) {
      this.renderDecisionBanner(mainCol, result);
      this.renderAnnotatedText(mainCol, result);
    }

    const issueCol = shell.createDiv({ cls: 'tre-issue-col' });
    if (result) {
      this.renderIssueSidebar(issueCol, groups, result);
    } else {
      this.renderEmptyState(issueCol);
    }
  }

  renderMainInput(container) {
    const section = container.createDiv({ cls: 'tre-input-section' });
    const editor = section.createDiv({ cls: 'tre-main__editor' });

    // 文件模式：富文本展示（Word 图片原位保留）
    this._fileRichContainer = editor.createDiv({ cls: 'tre-file-rich-view' });
    this._fileRichEl = this._fileRichContainer.createDiv({ cls: 'tre-file-rich-body' });
    if (this._fileMeta) {
      this.renderFileMode();
    } else {
      this.renderTextMode();
    }

    const actions = section.createDiv({ cls: 'tre-input-actions' });
    const clipBtn = actions.createEl('button', { cls: 'tre-btn tre-btn--secondary tre-btn--sm', text: '读取剪贴板' });
    clipBtn.addEventListener('click', async () => {
      try {
        const text = await navigator.clipboard.readText();
        if (!text.trim()) { new Notice('剪贴板为空'); return; }
        this._fileMeta = null;
        this._fileHtml = null;
        this._fileMode = false;
        this.plugin.panelState.input = text;
        if (this.textareaEl) this.textareaEl.value = text;
        await this.plugin.savePanelState();
        await this.render();
      } catch (e) { console.error(e); new Notice('读取剪贴板失败'); }
    });

    const fileBtn = actions.createEl('button', { cls: 'tre-btn tre-btn--secondary tre-btn--sm', text: '读取文件' });
    fileBtn.addEventListener('click', async () => {
      await this.openFileAndLoad();
    });

    if (this._fileMode) {
      const clearBtn = actions.createEl('button', { cls: 'tre-btn tre-btn--ghost tre-btn--sm', text: '清除文件' });
      clearBtn.addEventListener('click', async () => {
        this._fileMeta = null;
        this._fileHtml = null;
        this._fileMode = false;
        this.plugin.panelState.input = this.textareaEl?.value || '';
        await this.render();
      });

      const selectionBtn = actions.createEl('button', { cls: 'tre-btn tre-btn--secondary tre-btn--sm', text: '审校选中文字' });
      selectionBtn.addEventListener('click', async () => { await this.runReview({ requireSelection: true }); });
    }

    this.renderAiWorkflowStrip(section);
  }

  renderTextMode() {
    this._fileRichContainer.style.display = 'none';
    const editor = this._fileRichContainer.parentElement;
    const textEl = editor.createEl('textarea', {
      cls: 'tre-textarea',
      attr: { placeholder: '粘贴待审校文本，或通过顶栏「更多 → 导入选中/全文」导入。', rows: '6' },
    });
    this.textareaEl = textEl;
    textEl.value = this.plugin.panelState.input || '';
    textEl.addEventListener('input', async () => {
      this.plugin.panelState.input = textEl.value;
      await this.plugin.savePanelState();
    });
  }

  renderFileMode() {
    const editor = this._fileRichContainer.parentElement;
    // 隐藏 textarea
    const existingTextarea = editor.querySelector('.tre-textarea');
    if (existingTextarea) existingTextarea.style.display = 'none';
    this._fileRichContainer.style.display = '';

    const header = this._fileRichContainer.createDiv({ cls: 'tre-file-rich-header' });
    header.createSpan({ cls: 'tre-file-rich-header__name', text: `📄 ${this._fileMeta?.fileName || ''}` });
    header.createSpan({ cls: 'tre-file-rich-header__info', text: `${this._fileMeta?.ext?.toUpperCase()} · ${this._formatSize(this._fileMeta?.size || 0)}` });

    if (this._fileHtml) {
      this._fileRichEl.innerHTML = this._fileHtml;
    } else {
      const text = this.plugin.panelState.input || '';
      this._fileRichEl.textContent = text;
    }

    this._fileRichEl.querySelectorAll('img').forEach((img) => {
      img.style.maxWidth = '100%';
      img.style.height = 'auto';
    });
  }

  _formatSize(bytes) {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }

  async openFileAndLoad() {
    if (typeof window.showOpenFilePicker === 'function') {
      try {
        const [fileHandle] = await window.showOpenFilePicker({
          types: [
            {
              description: '支持格式',
              accept: {
                'application/vnd.openxmlformats-officedocument.wordprocessingml.document': ['.docx'],
                'text/plain': ['.txt'],
                'text/markdown': ['.md'],
              },
            },
          ],
          multiple: false,
        });
        const file = await fileHandle.getFile();
        await this.loadFileIntoWorkbench(file);
      } catch (err) {
        if (err.name !== 'AbortError') {
          new Notice(`文件选择失败：${err.message}`);
          console.error('[TRE] file picker error', err);
        }
      }
    } else {
      new Notice('当前浏览器不支持文件选择 API，请在 Obsidian 桌面端使用。', 6000);
    }
  }

  async loadFileIntoWorkbench(file) {
    const ext = (file.name.split('.').pop() || '').toLowerCase();
    const allowed = ['docx', 'txt', 'md'];
    if (!allowed.includes(ext)) {
      new Notice(`暂不支持 .${ext} 格式，仅支持：${allowed.join('、')}`);
      return;
    }

    try {
      const arrayBuffer = await file.arrayBuffer();
      let text = '';
      let html = null;

      if (ext === 'docx') {
        // mammoth.openZip 只认 path / buffer / file，不认 arrayBuffer（见 lib/unzip.js）
        const mammoth = require('mammoth');
        const docxInput = { buffer: arrayBuffer };
        const textResult = await mammoth.extractRawText(docxInput);
        text = textResult.value;
        const htmlResult = await mammoth.convertToHtml(docxInput, {
          // mammoth 图片 API 为 readAsBase64String；内置 dataUri 生成 data: URL 供预览
          convertImage: mammoth.images.dataUri,
        });
        html = htmlResult.value;
      } else {
        text = new TextDecoder('utf-8').decode(arrayBuffer);
      }

      this._fileMeta = { fileName: file.name, ext, size: file.size };
      this._fileHtml = html;
      this._fileMode = true;
        this.plugin.panelState.input = text;
        await this.plugin.savePanelState();
      await this.render();
      new Notice(`已加载：${file.name}（${text.length} 字）`);
    } catch (err) {
      console.error('[TRE] loadFileIntoWorkbench error', err);
      new Notice(`文件读取失败：${err.message}`);
    }
  }

  /** 把 AI 语义审校显式放进审校流程（不依赖用户是否记得切「严格」） */
  renderAiWorkflowStrip(section) {
    const strip = section.createDiv({ cls: 'tre-ai-strip' });
    const hasKey = !!(this.plugin.settings?.apiKey && String(this.plugin.settings.apiKey).trim());
    const mode = this.plugin.panelState.mode || 'standard';
    const includeAi = this.plugin.settings.includeAiWithRules === true;
    const strictAi = mode === 'strict';

    strip.createDiv({ cls: 'tre-ai-strip__label', text: 'AI 语义审校' });

    const row = strip.createDiv({ cls: 'tre-ai-strip__row' });

    if (strictAi) {
      row.createDiv({
        cls: 'tre-ai-strip__hint tre-ai-strip__hint--on',
        text: hasKey ? '当前为「严格」模式：规则 + AI 将一并运行。' : '「严格」模式已选，但未配置 API Key，AI 不会执行。',
      });
    } else {
      const wrap = row.createDiv({ cls: 'tre-ai-strip__toggle' });
      const id = 'tre-ai-include-checkbox';
      const cb = wrap.createEl('input', { cls: 'tre-ai-strip__checkbox', attr: { type: 'checkbox', id } });
      cb.checked = includeAi;
      const lab = wrap.createEl('label', { cls: 'tre-ai-strip__toggle-label', attr: { for: id } });
      lab.setText(hasKey ? '轻量/标准模式下也加跑 AI（语义层）' : '加跑 AI（需先在设置里填写 API Key）');
      cb.disabled = !hasKey;
      cb.addEventListener('change', async () => {
        this.plugin.settings.includeAiWithRules = cb.checked;
        await this.plugin.saveSettings();
        await this.render();
      });
      if (!hasKey) {
        const openSet = row.createEl('button', { cls: 'tre-btn tre-btn--secondary tre-btn--sm', text: '去设置填 API Key' });
        openSet.addEventListener('click', () => { this.plugin.openPluginSettings(); });
      }
    }

    const links = strip.createDiv({ cls: 'tre-ai-strip__links' });
    const promptBtn = links.createEl('button', { cls: 'tre-ai-strip__link', text: '编辑 AI Prompt' });
    promptBtn.addEventListener('click', async () => {
      await this.plugin.activateStandardsView();
      const leaves = this.plugin.app.workspace.getLeavesOfType(VIEW_TYPE_STANDARDS);
      const v = leaves[0]?.view;
      if (v && typeof v.switchToTab === 'function') await v.switchToTab('prompt');
    });
  }

  /* AI 审校进行中进度条 — 显示在输入区和结果区之间 */
  renderAiProgressBar(container) {
    const progress = this.plugin.panelState.aiReviewProgress;
    if (!progress) return;

    const bar = container.createDiv({ cls: 'tre-ai-progress' });
    const icon = bar.createDiv({ cls: 'tre-ai-progress__icon' });
    setIcon(icon, 'loader-a');
    bar.createDiv({ cls: 'tre-ai-progress__label', text: 'AI 审校中，请稍候…' });
    const track = bar.createDiv({ cls: 'tre-ai-progress__track' });
    const fill = track.createDiv({ cls: 'tre-ai-progress__fill' });
    requestAnimationFrame(() => { fill.style.width = '60%'; });
  }

  /* 决策 banner — 紧凑一行 */
  renderDecisionBanner(container, result) {
    const s = result.summary;
    const decisionCls = (s.decision || '').replace(/_/g, '-');
    const banner = container.createDiv({ cls: `tre-decision-banner tre-decision-banner--${decisionCls}` });

    const mainRow = banner.createDiv({ cls: 'tre-decision-banner__main' });
    mainRow.createDiv({ cls: 'tre-decision-banner__title', text: this.getDecisionDisplay(s.decision) });
    const pills = mainRow.createDiv({ cls: 'tre-decision-banner__pills' });
    pills.createDiv({ cls: `tre-pill tre-pill--${decisionCls}`, text: `风险 ${s.riskLevel || 'low'}` });
    pills.createDiv({ cls: `tre-pill tre-pill--${decisionCls}`, text: `${s.totalIssues} 条问题` });
    pills.createDiv({ cls: `tre-pill tre-pill--${decisionCls}`, text: `下一步：${this.getDecisionAction(s.decision)}` });
  }

  /* 标注原文 — 把 issue position 映射成高亮片段 */
  renderAnnotatedText(container, result) {
    const issues = (result.issues || []).filter((i) => !this.ignoredIssueIds.has(i.id));
    const text = normalizeText(this.plugin.panelState.input || '');
    if (!text || !issues.length) return;

    const section = container.createDiv({ cls: 'tre-annotated' });
    section.createDiv({ cls: 'tre-annotated__label', text: '原文标注（点击高亮跳转右侧问题）' });

    const body = section.createDiv({ cls: 'tre-annotated__body' });

    const spans = issues
      .filter((i) => i.position && typeof i.position.start === 'number' && i.position.end > i.position.start)
      .map((i) => ({ start: i.position.start, end: i.position.end, issue: i }))
      .sort((a, b) => a.start - b.start || b.end - a.end);

    const selectedId = this.plugin.panelState.selectedIssueId;

    let cursor = 0;
    for (const span of spans) {
      if (span.start >= text.length) continue;
      const s = Math.max(span.start, cursor);
      const e = Math.min(span.end, text.length);
      if (e <= s) continue;
      if (s > cursor) {
        body.createSpan({ text: text.slice(cursor, s) });
      }
      const isActive = selectedId === span.issue.id;
      const mark = body.createEl('mark', {
        cls: `tre-annotated__mark tre-annotated__mark--${span.issue.severity}${isActive ? ' is-active' : ''}`,
        text: text.slice(s, e),
        attr: {
          title: `${SEVERITY_LABEL[span.issue.severity] || span.issue.severity}: ${span.issue.message}`,
          'data-issue-id': span.issue.id,
        },
      });
      mark.addEventListener('click', () => {
        this.selectIssue(span.issue.id);
      });
      cursor = e;
    }
    if (cursor < text.length) {
      body.createSpan({ text: text.slice(cursor) });
    }
  }

  /* 右栏问题列表 — 按分组折叠 */
  renderIssueSidebar(container, groups, result) {
    const head = container.createDiv({ cls: 'tre-issue-col__head' });
    head.createDiv({ cls: 'tre-issue-col__title', text: '审校结果' });
    head.createDiv({ cls: 'tre-issue-col__count', text: `共 ${result.summary.totalIssues} 条` });

    const list = container.createDiv({ cls: 'tre-issue-col__list' });

    for (const groupKey of ISSUE_GROUP_ORDER) {
      const meta = GROUP_META[groupKey];
      if (!meta) continue;
      const items = groups[groupKey];
      if (!items.length) continue;
      this.renderIssueGroup(list, groupKey, meta, items);
    }
  }

  renderIssueGroup(parent, groupKey, meta, items) {
    const expanded = !!this.expandedGroups[groupKey];
    const section = parent.createDiv({ cls: `tre-issue-group tre-issue-group--${meta.cls}` });

    const header = section.createEl('button', {
      cls: 'tre-issue-group__header',
      attr: { type: 'button', 'aria-expanded': String(expanded) },
    });
    const headerIcon = header.createSpan({ cls: 'tre-issue-group__arrow' });
    setIcon(headerIcon, expanded ? 'chevron-down' : 'chevron-right');
    header.createSpan({ cls: 'tre-issue-group__title', text: meta.title });
    header.createSpan({ cls: `tre-issue-group__badge tre-issue-group__badge--${meta.cls}`, text: String(items.length) });

    header.addEventListener('click', async () => {
      this.expandedGroups[groupKey] = !this.expandedGroups[groupKey];
      await this.render();
    });

    if (!expanded) return;

    const body = section.createDiv({ cls: 'tre-issue-group__body' });
    items
      .slice()
      .sort((a, b) => severityRank(b.severity) - severityRank(a.severity))
      .forEach((issue) => { this.renderIssueCard(body, issue); });
  }

  renderIssueCard(parent, issue) {
    const isSelected = this.plugin.panelState.selectedIssueId === issue.id;
    const card = parent.createDiv({
      cls: `tre-issue-card-v2${isSelected ? ' is-selected' : ''}`,
    });
    card.dataset.severity = issue.severity;
    card.dataset.issueId = issue.id;

    card.addEventListener('click', () => {
      this.selectIssue(issue.id);
    });

    const top = card.createDiv({ cls: 'tre-issue-card-v2__top' });
    top.createSpan({ cls: `tre-severity-dot tre-severity-dot--${issue.severity}` });
    top.createSpan({ cls: 'tre-issue-card-v2__msg', text: issue.message });
    top.createSpan({
      cls: `tre-severity-badge tre-severity-badge--${issue.severity}`,
      text: SEVERITY_LABEL[issue.severity] || issue.severity,
    });

    if (issue.text) {
      card.createDiv({ cls: 'tre-issue-card-v2__snippet', text: `「${issue.text}」` });
    }

    const meta = card.createDiv({ cls: 'tre-issue-card-v2__meta' });
    const sourceLabel = issue.source === 'llm' ? 'AI 审校' : '规则层';
    const sourceCls = issue.source === 'llm' ? 'source-llm' : 'source-rule';
    meta.createSpan({ cls: `tre-source-badge tre-source-badge--${sourceCls}`, text: sourceLabel });
    meta.createSpan({ text: issue.category });
    meta.createSpan({ text: `位置 ${issue.position.start}–${issue.position.end}` });
    if (issue.suggestion) {
      card.createDiv({ cls: 'tre-issue-card-v2__suggest', text: `建议：${issue.suggestion}` });
    }

    if (issue.requiresHumanReview) {
      card.createDiv({ cls: 'tre-issue-card-v2__flag', text: '需人工复核' });
    }

    const actions = card.createDiv({ cls: 'tre-issue-card-v2__actions' });
    const ignoreBtn = actions.createEl('button', { cls: 'tre-btn tre-btn--ghost tre-btn--sm', text: '忽略' });
    ignoreBtn.addEventListener('click', async (e) => {
      e.stopPropagation();
      this.ignoredIssueIds.add(issue.id);
      if (this.plugin.panelState.selectedIssueId === issue.id) {
        const remaining = (this.plugin.panelState.result?.issues || [])
          .filter((i) => !this.ignoredIssueIds.has(i.id));
        const nextId = remaining[0]?.id || '';
        this.plugin.panelState.selectedIssueId = nextId;
      }
      await this.render();
    });
    const ruleBtn = actions.createEl('button', { cls: 'tre-btn tre-btn--ghost tre-btn--sm', text: '加入规则' });
    ruleBtn.addEventListener('click', async (e) => {
      e.stopPropagation();
      this.showInlineRuleForm(card, issue);
    });
  }

  showInlineRuleForm(anchor, issue) {
    const existing = anchor.querySelector('.tre-inline-rule-form');
    if (existing) { existing.remove(); return; }

    const ruleType = this.getRuleTypeForIssue(issue);
    const draft = this.buildRuleDraftFromIssue(issue, ruleType);

    const form = anchor.createDiv({ cls: 'tre-inline-rule-form' });
    form.addEventListener('click', (e) => e.stopPropagation());

    form.createDiv({ cls: 'tre-inline-rule-form__title', text: `新增规则 (${ruleType})` });

    const fields = this.getFieldsForRuleType(ruleType);
    const inputs = {};
    for (const f of fields) {
      const row = form.createDiv({ cls: 'tre-inline-rule-form__field' });
      row.createEl('label', { text: f.label, cls: 'tre-inline-rule-form__label' });
      const inp = row.createEl('input', {
        cls: 'tre-input tre-input--sm',
        attr: { type: 'text', placeholder: f.placeholder || '' },
      });
      inp.value = draft[f.key] || '';
      inputs[f.key] = inp;
    }

    const btns = form.createDiv({ cls: 'tre-inline-rule-form__actions' });
    const saveBtn = btns.createEl('button', { cls: 'tre-btn tre-btn--primary tre-btn--sm', text: '保存' });
    saveBtn.addEventListener('click', async () => {
      const vals = {};
      Object.entries(inputs).forEach(([k, inp]) => { vals[k] = inp.value.trim(); });
      const ok = await this.submitQuickRule(ruleType, vals);
      if (ok) {
        form.remove();
        new Notice('规则已保存');
      }
    });
    const cancelBtn = btns.createEl('button', { cls: 'tre-btn tre-btn--ghost tre-btn--sm', text: '取消' });
    cancelBtn.addEventListener('click', () => { form.remove(); });
  }

  getFieldsForRuleType(type) {
    switch (type) {
      case 'typo': return [
        { key: 'wrong', label: '错误写法', placeholder: '如：己经' },
        { key: 'correct', label: '正确写法', placeholder: '如：已经' },
        { key: 'severity', label: '严重程度', placeholder: 'low/medium/high/critical' },
        { key: 'message', label: '提示信息', placeholder: '应为"已经"' },
      ];
      case 'sensitive': return [
        { key: 'term', label: '敏感词', placeholder: '' },
        { key: 'severity', label: '严重程度', placeholder: 'high' },
        { key: 'message', label: '提示信息', placeholder: '' },
        { key: 'suggestion', label: '建议', placeholder: '' },
      ];
      case 'combo': return [
        { key: 'trigger', label: '触发词', placeholder: '' },
        { key: 'requiredAny', label: '必须共现', placeholder: '用逗号分隔' },
        { key: 'severity', label: '严重程度', placeholder: 'high' },
        { key: 'message', label: '提示信息', placeholder: '' },
      ];
      default: return [
        { key: 'wrong', label: '错误写法', placeholder: '' },
        { key: 'correct', label: '正确写法', placeholder: '' },
        { key: 'severity', label: '严重程度', placeholder: 'medium' },
        { key: 'message', label: '提示信息', placeholder: '' },
      ];
    }
  }

  async submitQuickRule(type, vals) {
    try {
      switch (type) {
        case 'typo':
          if (!vals.wrong || !vals.correct) { new Notice('错误写法和正确写法不能为空'); return false; }
          this.plugin.ruleStore.addTypoRule({ wrong: vals.wrong, correct: vals.correct, severity: vals.severity || 'medium', message: vals.message || `应为"${vals.correct}"` });
          break;
        case 'sensitive':
          if (!vals.term) { new Notice('敏感词不能为空'); return false; }
          this.plugin.ruleStore.addSensitiveTerm({ term: vals.term, severity: vals.severity || 'high', message: vals.message || `含敏感词"${vals.term}"`, suggestion: vals.suggestion || '' });
          break;
        case 'combo':
          if (!vals.trigger || !vals.requiredAny) { new Notice('触发词和必须共现不能为空'); return false; }
          this.plugin.ruleStore.addComboRule({ trigger: vals.trigger, requiredAny: vals.requiredAny.split(/[,，]/).map((s) => s.trim()).filter(Boolean), severity: vals.severity || 'high', message: vals.message || '' });
          break;
        default:
          if (!vals.wrong || !vals.correct) { new Notice('错误写法和正确写法不能为空'); return false; }
          this.plugin.ruleStore.addFixedPhraseRule({ wrong: vals.wrong, correct: vals.correct, severity: vals.severity || 'medium', message: vals.message || `建议改为"${vals.correct}"` });
      }
      return true;
    } catch (err) {
      console.error('[text-review-engine] submitQuickRule failed', err);
      new Notice(`保存失败：${err.message}`);
      return false;
    }
  }

  renderEmptyState(container) {
    const empty = container.createDiv({ cls: 'tre-empty-v2' });
    empty.createDiv({ cls: 'tre-empty-v2__title', text: '等待审校' });
    empty.createDiv({ cls: 'tre-empty-v2__hint', text: '在左侧输入待审校文本，点击顶栏「开始审校」。' });
    const steps = empty.createDiv({ cls: 'tre-empty-v2__steps' });
    ['1. 识别阻断项', '2. 标记需人工复核的风险', '3. 汇总可优化项'].forEach((s) => {
      steps.createDiv({ cls: 'tre-empty-v2__step', text: s });
    });
  }

  /* ================================================================ Helpers ================================================================ */
  getDecisionLabel(d) { return { pass: '通过', needs_revision: '待改', human_review: '需复核', blocked: '阻断' }[d] || '未审'; }
  getDecisionDisplay(d) { return { pass: '可直接发布', needs_revision: '建议修改后发布', human_review: '需人工复核', blocked: '阻断发布' }[d] || '等待首次审校'; }
  getDecisionAction(d) { return { pass: '直接发', needs_revision: '先修改', human_review: '先复核', blocked: '先复核' }[d] || '开始审校'; }

  getRuleTypeForIssue(issue) {
    switch (issue.category) {
      case 'typo': return 'typo';
      case 'sensitive': return 'sensitive';
      case 'fixed_phrase': case 'fixed-phrase': return 'fixed';
      case 'combo': case 'combination': return 'combo';
      default: return issue.source === 'rule' ? 'fixed' : 'sensitive';
    }
  }

  buildRuleDraftFromIssue(issue, ruleType) {
    const snippet = issue.text || '';
    const msg = issue.message || '';
    switch (ruleType) {
      case 'typo': return { wrong: snippet, correct: issue.suggestion || '', severity: issue.severity || 'medium', message: msg };
      case 'sensitive': return { term: snippet, severity: issue.severity || 'high', message: msg, suggestion: issue.suggestion || '' };
      case 'combo': return { trigger: snippet, required: issue.suggestion || '', severity: issue.severity || 'high', message: msg };
      default: return { wrong: snippet, correct: issue.suggestion || '', severity: issue.severity || 'medium', message: msg };
    }
  }

  selectIssue(issueId) {
    const prev = this.plugin.panelState.selectedIssueId;
    const isSame = prev === issueId;
    const newId = isSame ? '' : issueId;
    this.plugin.panelState.selectedIssueId = newId;
    void this.plugin.savePanelState();

    this.contentEl.querySelectorAll('.tre-issue-card-v2.is-selected').forEach((el) => el.removeClass('is-selected'));
    this.contentEl.querySelectorAll('.tre-annotated__mark.is-active').forEach((el) => el.removeClass('is-active'));

    if (!newId) return;

    const card = this.contentEl.querySelector(`.tre-issue-card-v2[data-issue-id="${newId}"]`);
    if (card) {
      card.addClass('is-selected');
      card.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }

    const mark = this.contentEl.querySelector(`.tre-annotated__mark[data-issue-id="${newId}"]`);
    if (mark) {
      mark.addClass('is-active');
      mark.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }

  setInput(text) { this.plugin.panelState.input = text; if (this.textareaEl) this.textareaEl.value = text; }
  setResult(result) { this.plugin.panelState.result = result; void this.render(); }

  /**
   * 有选区则只审选区（位置映射回全文用于标注）；无选区审全文。
   * @param {{ requireSelection?: boolean }} [opts]
   * @returns {Promise<void>}
   */
  async runReview(opts = {}) {
    const scope = this.getReviewScope(opts);
    if (!scope) {
      if (opts.requireSelection) new Notice('请先在内容中选中一段文字');
      else new Notice('请先输入待审校文本');
      return;
    }
    const { text, offset, fullRaw } = scope;
    if (!normalizeText(text).trim()) {
      new Notice('请先输入待审校文本');
      return;
    }
    await this.plugin.reviewText(text, this.plugin.panelState.mode, {
      positionOffset: offset,
      fullInputForDisplay: fullRaw,
    });
  }

  /**
   * @param {{ requireSelection?: boolean }} [opts]
   * @returns {{ text: string, offset: number, fullRaw: string } | null}
   */
  getReviewScope(opts = {}) {
    const requireSelection = opts.requireSelection === true;
    const isFile = !!this._fileMeta;
    const fullRaw = isFile
      ? (this.plugin.panelState.input || '')
      : (this.textareaEl?.value || '');

    if (!normalizeText(fullRaw).trim()) return null;

    if (isFile) {
      const sel = window.getSelection();
      if (!sel || sel.rangeCount === 0) {
        if (requireSelection) return null;
        return { text: fullRaw, offset: 0, fullRaw };
      }
      const range = sel.getRangeAt(0);
      if (!this._fileRichEl || !this._fileRichEl.contains(range.commonAncestorContainer)) {
        if (requireSelection) return null;
        return { text: fullRaw, offset: 0, fullRaw };
      }
      const selectedRaw = sel.toString();
      if (!normalizeText(selectedRaw).trim()) {
        if (requireSelection) return null;
        return { text: fullRaw, offset: 0, fullRaw };
      }
      const fullN = normalizeText(fullRaw);
      let sliceN = normalizeText(selectedRaw.trim());
      let idx = fullN.indexOf(sliceN);
      if (idx < 0) {
        sliceN = normalizeText(selectedRaw.replace(/\u00a0/g, ' ').trim());
        idx = fullN.indexOf(sliceN);
      }
      if (idx < 0) {
        new Notice('无法在全文正文中定位选区（可能与纯文本层不一致），已改为全文审校');
        return { text: fullRaw, offset: 0, fullRaw };
      }
      return { text: selectedRaw.trim(), offset: idx, fullRaw };
    }

    const ta = this.textareaEl;
    if (!ta) return null;
    const { selectionStart: start, selectionEnd: end } = ta;
    if (end > start) {
      const slice = ta.value.slice(start, end);
      if (!normalizeText(slice).trim()) {
        if (requireSelection) return null;
        return { text: fullRaw, offset: 0, fullRaw: ta.value };
      }
      const idx = normalizedSelectionOffset(ta.value, start, end);
      if (idx < 0) {
        new Notice('无法在全文正文中定位选区，已改为全文审校');
        return { text: ta.value, offset: 0, fullRaw: ta.value };
      }
      return { text: slice, offset: idx, fullRaw: ta.value };
    }
    if (requireSelection) return null;
    return { text: ta.value, offset: 0, fullRaw: ta.value };
  }
}

module.exports = { ReviewView };
