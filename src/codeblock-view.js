const { ButtonComponent, Notice } = require('obsidian');
const { WORKBENCH_CODEBLOCK } = require('./note-workbench');
const { REVIEW_MODES, REVIEW_MODE_LABELS } = require('./defaults');

function parseMode(source) {
  const line = String(source || '')
    .split('\n')
    .map((item) => item.trim())
    .find((item) => item.startsWith('mode:'));
  if (!line) return '';
  return line.slice('mode:'.length).trim();
}

function createMetric(parent, label, value) {
  const item = parent.createDiv({ cls: 'tre-note-metric' });
  item.createDiv({ cls: 'tre-note-metric-label', text: label });
  item.createDiv({ cls: 'tre-note-metric-value', text: value });
}

function groupIssues(issues) {
  const grouped = {
    blocking: [],
    review: [],
    polish: [],
  };

  for (const issue of issues) {
    if (issue.severity === 'critical') {
      grouped.blocking.push(issue);
      continue;
    }
    if (issue.requiresHumanReview || issue.severity === 'high') {
      grouped.review.push(issue);
      continue;
    }
    grouped.polish.push(issue);
  }

  return grouped;
}

function createIssueCard(parent, issue) {
  const card = parent.createDiv({ cls: 'tre-note-issue' });
  card.dataset.severity = issue.severity;

  const head = card.createDiv({ cls: 'tre-note-issue-head' });
  head.createEl('strong', { text: issue.message });
  head.createEl('span', {
    cls: 'tre-note-chip',
    text: `${issue.category} · ${issue.severity}`,
  });

  if (issue.text) {
    card.createDiv({ cls: 'tre-note-issue-text', text: `命中片段：${issue.text}` });
  }

  card.createDiv({
    cls: 'tre-note-issue-meta',
    text: `位置：${issue.position.start}-${issue.position.end} · 来源：${issue.source}`,
  });

  if (issue.suggestion) {
    card.createDiv({ cls: 'tre-note-issue-suggestion', text: `建议：${issue.suggestion}` });
  }

  if (issue.requiresHumanReview) {
    card.createDiv({ cls: 'tre-note-issue-flag', text: '需人工复核' });
  }
}

function createSection(parent, title, caption, issues, emptyText) {
  const section = parent.createDiv({ cls: 'tre-note-column' });
  const head = section.createDiv({ cls: 'tre-note-column-head' });
  head.createDiv({ cls: 'tre-note-column-title', text: title });
  head.createDiv({ cls: 'tre-note-column-caption', text: caption });

  if (!issues.length) {
    section.createDiv({ cls: 'tre-note-empty', text: emptyText });
    return;
  }

  for (const issue of issues) {
    createIssueCard(section, issue);
  }
}

function renderWorkbench(plugin, source, el) {
  const initialMode = parseMode(source) || plugin.panelState.mode || plugin.settings.defaultMode || 'standard';
  if (!plugin.panelState.mode) {
    plugin.panelState.mode = initialMode;
  }

  const wrap = el.createDiv({ cls: 'tre-note-shell' });

  const hero = wrap.createDiv({ cls: 'tre-note-header' });
  const titleBox = hero.createDiv({ cls: 'tre-note-header-main' });
  titleBox.createDiv({ cls: 'tre-note-eyebrow', text: 'Text Review Flow' });
  titleBox.createEl('h3', { cls: 'tre-note-title', text: '发布前文本审校' });
  titleBox.createDiv({
    cls: 'tre-note-subtitle',
    text: '规则层优先；严格模式叠加 AI 风险提示。适合短文案与政务口径。',
  });
  const heroMeta = hero.createDiv({ cls: 'tre-note-header-meta' });
  heroMeta.createDiv({ cls: 'tre-note-meta-label', text: '当前模式' });
  heroMeta.createDiv({ cls: 'tre-note-meta-value', text: REVIEW_MODE_LABELS[plugin.panelState.mode] || plugin.panelState.mode });
  heroMeta.createDiv({
    cls: 'tre-note-meta-hint',
    text: plugin.panelState.mode === 'strict' ? '规则层 + AI' : '仅规则层',
  });

  const modeBar = wrap.createDiv({ cls: 'tre-note-modebar tre-note-modebar--segmented' });
  REVIEW_MODES.forEach((mode) => {
    const button = new ButtonComponent(modeBar)
      .setButtonText(REVIEW_MODE_LABELS[mode] || mode)
      .onClick(async () => {
        plugin.panelState.mode = mode;
        await plugin.savePanelState();
        plugin.refreshWorkbenchViews();
      });
    button.buttonEl.addClass('tre-note-mode');
    if (plugin.panelState.mode === mode) {
      button.buttonEl.addClass('is-active');
    }
  });

  const composition = wrap.createDiv({ cls: 'tre-note-composition' });
  const editorZone = composition.createDiv({ cls: 'tre-note-zone tre-note-zone-editor' });
  const editorHead = editorZone.createDiv({ cls: 'tre-note-zone-head' });
  editorHead.createDiv({ cls: 'tre-note-zone-title', text: '输入文本' });
  editorHead.createDiv({ cls: 'tre-note-zone-caption', text: '建议粘贴即将发布的最终版本，而不是草稿碎片。' });

  const editor = editorZone.createDiv({ cls: 'tre-note-editor' });
  const textarea = editor.createEl('textarea', {
    cls: 'tre-note-textarea',
    attr: { placeholder: '把待审校文本粘贴到这里，或使用下方导入动作。' },
  });
  textarea.value = plugin.panelState.input || '';
  textarea.addEventListener('input', async () => {
    plugin.panelState.input = textarea.value;
    await plugin.savePanelState();
  });

  const actions = editorZone.createDiv({ cls: 'tre-note-actions' });
  new ButtonComponent(actions)
    .setButtonText('开始审校')
    .setCta()
    .onClick(async () => {
      const text = textarea.value.trim();
      if (!text) {
        new Notice('请先输入待审校文本');
        return;
      }
      plugin.panelState.input = text;
      await plugin.savePanelState();
      await plugin.reviewText(text, plugin.panelState.mode);
      plugin.refreshWorkbenchViews();
    });

  new ButtonComponent(actions)
    .setButtonText('导入选中')
    .onClick(async () => {
      const text = await plugin.loadSelectionIntoWorkbench();
      if (!text) return;
      textarea.value = text;
      plugin.refreshWorkbenchViews();
    });

  new ButtonComponent(actions)
    .setButtonText('导入全文')
    .onClick(async () => {
      const text = await plugin.loadActiveNoteIntoWorkbench();
      if (!text) return;
      textarea.value = text;
      plugin.refreshWorkbenchViews();
    });

  new ButtonComponent(actions)
    .setButtonText('读取剪贴板')
    .onClick(async () => {
      try {
        const text = await navigator.clipboard.readText();
        if (!text.trim()) {
          new Notice('剪贴板为空');
          return;
        }
        plugin.panelState.input = text;
        textarea.value = text;
        await plugin.savePanelState();
        plugin.refreshWorkbenchViews();
      } catch (error) {
        console.error(error);
        new Notice('读取剪贴板失败');
      }
    });

  const sideZone = composition.createDiv({ cls: 'tre-note-zone tre-note-zone-side' });
  const summary = sideZone.createDiv({ cls: 'tre-note-summary' });
  const result = plugin.panelState.result;
  summary.createDiv({ cls: 'tre-note-section-title', text: '风险摘要' });
  if (!result) {
    summary.createDiv({ cls: 'tre-note-empty', text: '还没有审校结果。先输入文本，再点击“开始审校”。' });
  } else {
    const metrics = summary.createDiv({ cls: 'tre-note-metrics' });
    createMetric(metrics, '结论', result.summary.decision);
    createMetric(metrics, '风险', result.summary.riskLevel);
    createMetric(metrics, '问题数', String(result.summary.totalIssues));
    createMetric(metrics, '模型', result.summary.model || '规则层');

    const decision = sideZone.createDiv({ cls: 'tre-note-decision' });
    decision.createDiv({ cls: 'tre-note-zone-title', text: '建议动作' });
    const actionText = result.summary.decision === 'blocked'
      ? '当前不建议直接发布，先处理阻断项。'
      : result.summary.decision === 'human_review'
        ? '先人工复核高风险项，再决定是否发布。'
        : result.summary.decision === 'needs_revision'
          ? '建议先完成修改，再做一次复查。'
          : '当前可以通过，但仍建议快速人工扫读一遍。';
    decision.createDiv({ cls: 'tre-note-decision-copy', text: actionText });
  }

  const issuesWrap = wrap.createDiv({ cls: 'tre-note-results' });
  issuesWrap.createDiv({ cls: 'tre-note-section-title', text: '问题清单' });
  if (!result || !result.issues.length) {
    issuesWrap.createDiv({ cls: 'tre-note-empty', text: '未发现问题。' });
    return;
  }

  const grouped = groupIssues(result.issues);
  const columns = issuesWrap.createDiv({ cls: 'tre-note-columns' });
  createSection(columns, '阻断项', '需要先改，通常不建议直接发布。', grouped.blocking, '当前没有阻断项。');
  createSection(columns, '人工复核项', '语义或口径风险，建议人工判断。', grouped.review, '当前没有需要人工复核的问题。');
  createSection(columns, '优化项', '可以提升规范性与观感，但通常不阻断发布。', grouped.polish, '当前没有常规优化项。');
}

function registerWorkbenchCodeBlock(plugin) {
  plugin.registerMarkdownCodeBlockProcessor(WORKBENCH_CODEBLOCK, (source, el) => {
    el.empty();
    renderWorkbench(plugin, source, el);
  });
}

module.exports = {
  WORKBENCH_CODEBLOCK,
  registerWorkbenchCodeBlock,
};
