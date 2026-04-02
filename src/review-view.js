const { ItemView, Notice, setIcon } = require('obsidian');
const { VIEW_TYPE_REVIEW } = require('./defaults');

class ReviewView extends ItemView {
  constructor(leaf, plugin) {
    super(leaf);
    this.plugin = plugin;
    this.textareaEl = null;
    this.modeSelectEl = null;
    this.summaryEl = null;
    this.resultsEl = null;
  }

  getViewType() {
    return VIEW_TYPE_REVIEW;
  }

  getDisplayText() {
    return '审校工作台';
  }

  getIcon() {
    return 'shield-alert';
  }

  async onOpen() {
    this.render();
  }

  setInput(text) {
    this.plugin.panelState.input = text;
    if (this.textareaEl) this.textareaEl.value = text;
  }

  setResult(result) {
    this.plugin.panelState.result = result;
    this.renderResult();
  }

  render() {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.addClass('tre-view');

    const toolbar = contentEl.createDiv({ cls: 'tre-toolbar' });
    this.modeSelectEl = toolbar.createEl('select');
    ['basic', 'standard', 'strict'].forEach((mode) => {
      const option = this.modeSelectEl.createEl('option', {
        value: mode,
        text: mode,
      });
      option.selected = mode === this.plugin.panelState.mode;
    });
    this.modeSelectEl.addEventListener('change', async () => {
      this.plugin.panelState.mode = this.modeSelectEl.value;
      await this.plugin.savePanelState();
    });

    const runButton = toolbar.createEl('button', { text: '开始审校' });
    setIcon(runButton, 'play');
    runButton.addEventListener('click', async () => {
      await this.runReview();
    });

    const selectionButton = toolbar.createEl('button', { text: '导入选中' });
    selectionButton.addEventListener('click', async () => {
      await this.plugin.loadSelectionIntoView();
    });

    const noteButton = toolbar.createEl('button', { text: '导入全文' });
    noteButton.addEventListener('click', async () => {
      await this.plugin.loadActiveNoteIntoView();
    });

    const copyButton = toolbar.createEl('button', { text: '复制 JSON' });
    copyButton.addEventListener('click', async () => {
      await this.copyJson();
    });

    this.textareaEl = contentEl.createEl('textarea', {
      cls: 'tre-textarea',
      attr: { placeholder: '粘贴待审校文本，或点击“导入选中/导入全文”。' },
    });
    this.textareaEl.value = this.plugin.panelState.input || '';
    this.textareaEl.addEventListener('input', async () => {
      this.plugin.panelState.input = this.textareaEl.value;
      await this.plugin.savePanelState();
    });

    this.summaryEl = contentEl.createDiv({ cls: 'tre-summary' });
    this.resultsEl = contentEl.createDiv({ cls: 'tre-results' });
    this.renderResult();
  }

  async runReview() {
    const text = this.textareaEl?.value?.trim() || '';
    if (!text) {
      new Notice('请先输入待审校文本');
      return;
    }
    this.plugin.panelState.input = text;
    this.plugin.panelState.mode = this.modeSelectEl?.value || this.plugin.panelState.mode;
    await this.plugin.savePanelState();
    await this.plugin.reviewText(text, this.plugin.panelState.mode);
  }

  async copyJson() {
    if (!this.plugin.panelState.result) {
      new Notice('当前没有审校结果可复制');
      return;
    }
    await navigator.clipboard.writeText(JSON.stringify(this.plugin.panelState.result, null, 2));
    new Notice('已复制 JSON 报告');
  }

  renderResult() {
    if (!this.summaryEl || !this.resultsEl) return;
    const result = this.plugin.panelState.result;

    this.summaryEl.empty();
    this.resultsEl.empty();

    if (!result) {
      this.summaryEl.createDiv({ cls: 'tre-empty', text: '还没有审校结果。' });
      return;
    }

    this.summaryEl.createEl('div', { text: '审校摘要' });
    const grid = this.summaryEl.createDiv({ cls: 'tre-summary-grid' });
    this.renderSummaryCell(grid, '结论', result.summary.decision);
    this.renderSummaryCell(grid, '风险', result.summary.riskLevel);
    this.renderSummaryCell(grid, '问题数', String(result.summary.totalIssues));
    this.renderSummaryCell(grid, '模型', result.summary.model || '规则层');

    if (!result.issues.length) {
      this.resultsEl.createDiv({ cls: 'tre-empty', text: '未发现问题。' });
      return;
    }

    for (const issue of result.issues) {
      const card = this.resultsEl.createDiv({ cls: 'tre-issue' });
      card.dataset.severity = issue.severity;
      const top = card.createDiv({ cls: 'tre-issue-top' });
      top.createEl('strong', { text: issue.message });
      top.createEl('span', {
        cls: 'tre-badge',
        text: `${issue.category} · ${issue.severity} · ${issue.source}`,
      });
      if (issue.text) {
        card.createEl('div', { text: `命中片段：${issue.text}` });
      }
      card.createEl('div', {
        text: `位置：${issue.position.start}-${issue.position.end}`,
      });
      if (issue.suggestion) {
        card.createEl('div', { text: `建议：${issue.suggestion}` });
      }
      if (issue.requiresHumanReview) {
        card.createEl('div', { text: '标记：需人工复核' });
      }
    }
  }

  renderSummaryCell(parent, label, value) {
    const cell = parent.createDiv();
    cell.createDiv({ cls: 'tre-label', text: label });
    cell.createDiv({ cls: 'tre-value', text: value });
  }
}

module.exports = {
  ReviewView,
};
