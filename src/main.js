const { Plugin, Notice, MarkdownView } = require('obsidian');
const { DEFAULT_SETTINGS, VIEW_TYPE_REVIEW } = require('./defaults');
const { normalizeText } = require('./preprocessor');
const { runRuleEngine } = require('./rule-engine');
const { runAiPolicyReview } = require('./ai-review-engine');
const { buildReviewResult } = require('./decision-engine');
const { ReviewView } = require('./review-view');
const { TextReviewSettingTab } = require('./settings-tab');

class TextReviewPlugin extends Plugin {
  async onload() {
    this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
    this.panelState = {
      input: '',
      result: null,
      mode: this.settings.defaultMode || 'standard',
    };

    this.addSettingTab(new TextReviewSettingTab(this.app, this));
    this.registerView(VIEW_TYPE_REVIEW, (leaf) => new ReviewView(leaf, this));

    this.addRibbonIcon('shield-alert', '打开审校工作台', async () => {
      await this.activateView();
    });

    this.addCommand({
      id: 'open-review-workbench',
      name: '打开审校工作台',
      callback: async () => {
        await this.activateView();
      },
    });

    this.addCommand({
      id: 'review-selected-text',
      name: '审校当前选中文本',
      editorCallback: async (editor) => {
        const selected = editor.getSelection().trim();
        if (!selected) {
          new Notice('请先选择一段文本');
          return;
        }
        await this.activateView();
        this.setViewInput(selected);
        await this.reviewText(selected, this.panelState.mode);
      },
    });

    this.addCommand({
      id: 'review-active-note',
      name: '审校当前整篇笔记',
      callback: async () => {
        const text = this.getActiveNoteText();
        if (!text.trim()) {
          new Notice('当前笔记为空或不可读取');
          return;
        }
        await this.activateView();
        this.setViewInput(text);
        await this.reviewText(text, this.panelState.mode);
      },
    });
  }

  async onunload() {
    await this.app.workspace.detachLeavesOfType(VIEW_TYPE_REVIEW);
  }

  async saveSettings() {
    await this.saveData(this.settings);
  }

  async savePanelState() {
    const leaves = this.app.workspace.getLeavesOfType(VIEW_TYPE_REVIEW);
    for (const leaf of leaves) {
      if (leaf.view instanceof ReviewView && leaf.view.textareaEl) {
        leaf.view.textareaEl.value = this.panelState.input || '';
      }
    }
  }

  getActiveMarkdownView() {
    const view = this.app.workspace.getActiveViewOfType(MarkdownView);
    return view || null;
  }

  getActiveNoteText() {
    const view = this.getActiveMarkdownView();
    return view ? view.editor.getValue() : '';
  }

  async loadSelectionIntoView() {
    const view = this.getActiveMarkdownView();
    if (!view) {
      new Notice('没有可读取的编辑器');
      return;
    }
    const selected = view.editor.getSelection().trim();
    if (!selected) {
      new Notice('请先选中文本');
      return;
    }
    await this.activateView();
    this.setViewInput(selected);
  }

  async loadActiveNoteIntoView() {
    const text = this.getActiveNoteText();
    if (!text.trim()) {
      new Notice('当前笔记为空');
      return;
    }
    await this.activateView();
    this.setViewInput(text);
  }

  async activateView() {
    let leaf = this.app.workspace.getLeavesOfType(VIEW_TYPE_REVIEW)[0];
    if (!leaf) {
      leaf = this.app.workspace.getRightLeaf(false);
      await leaf.setViewState({
        type: VIEW_TYPE_REVIEW,
        active: true,
      });
    }
    this.app.workspace.revealLeaf(leaf);
    return leaf;
  }

  setViewInput(text) {
    this.panelState.input = text;
    const leaves = this.app.workspace.getLeavesOfType(VIEW_TYPE_REVIEW);
    for (const leaf of leaves) {
      if (leaf.view instanceof ReviewView) {
        leaf.view.setInput(text);
      }
    }
  }

  setViewResult(result) {
    this.panelState.result = result;
    const leaves = this.app.workspace.getLeavesOfType(VIEW_TYPE_REVIEW);
    for (const leaf of leaves) {
      if (leaf.view instanceof ReviewView) {
        leaf.view.setResult(result);
      }
    }
  }

  async reviewText(rawText, mode) {
    const text = normalizeText(rawText);
    const issues = runRuleEngine(text, mode);

    if (mode === 'strict') {
      try {
        const aiIssues = await runAiPolicyReview(text, this.settings);
        issues.push(...aiIssues);
      } catch (error) {
        console.error(error);
        new Notice('AI 审校调用失败，本次仅返回规则层结果');
      }
    }

    issues.sort((a, b) => {
      const severityOrder = { critical: 4, high: 3, medium: 2, low: 1 };
      return (severityOrder[b.severity] || 0) - (severityOrder[a.severity] || 0);
    });

    const result = buildReviewResult(issues, {
      model: mode === 'strict' && this.settings.apiKey ? this.settings.model : '',
    });

    this.setViewResult(result);
    new Notice(`审校完成，共发现 ${result.summary.totalIssues} 个问题`);
    return result;
  }
}

module.exports = TextReviewPlugin;
