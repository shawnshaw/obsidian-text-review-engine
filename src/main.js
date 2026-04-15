const fs = require('fs');
const path = require('path');
const { Plugin, Notice } = require('obsidian');
const {
  DEFAULT_SETTINGS,
  VIEW_TYPE_REVIEW,
  STANDARDS_NOTE_PATH,
  getProviderPreset,
} = require('./defaults');
const { normalizeText } = require('./preprocessor');
const { runRuleEngine } = require('./rule-engine');
const { runAiPolicyReview } = require('./ai-review-engine');
const { buildReviewResult } = require('./decision-engine');
const { ReviewView } = require('./review-view');
const { StandardsView, VIEW_TYPE_STANDARDS } = require('./standards-view');
const { TextReviewSettingTab } = require('./settings-tab');
const { createRuleStore } = require('./rule-store');
const { createPromptStore } = require('./prompt-store');
const { createStandardsService } = require('./standards-service');
const {
  openWorkbenchNote,
  ensureWorkbenchNote,
  importSelectionFromOtherNote,
  importActiveNoteFromOtherNote,
} = require('./note-workbench');
const { registerWorkbenchCodeBlock } = require('./codeblock-view');

/** 避免 instanceof 在部分运行时失效导致视图从不刷新 */
function isReviewLeafView(view, ReviewViewCtor, viewTypeId) {
  if (!view || typeof view.render !== 'function') return false;
  try {
    if (ReviewViewCtor && view instanceof ReviewViewCtor) return true;
  } catch {
    /* ignore */
  }
  return typeof view.getViewType === 'function' && view.getViewType() === viewTypeId;
}

function isStandardsLeafView(view, StandardsViewCtor, viewTypeId) {
  if (!view || typeof view.render !== 'function') return false;
  try {
    if (StandardsViewCtor && view instanceof StandardsViewCtor) return true;
  } catch {
    /* ignore */
  }
  return typeof view.getViewType === 'function' && view.getViewType() === viewTypeId;
}

class TextReviewPlugin extends Plugin {
  async onload() {
    this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
    this.pluginDir = this.resolvePluginDir();
    this.injectRuntimeStyles();
    this.ruleStore = createRuleStore(this.pluginDir);
    this.promptStore = createPromptStore(this.pluginDir);
    this.standardsService = this.createFallbackStandardsService();
    try {
      this.standardsService = createStandardsService(this.pluginDir, this.resolveVaultPath(STANDARDS_NOTE_PATH));
    } catch (error) {
      console.error('[text-review-engine] failed to create standards service', error);
    }
    try {
      this.standardsService.ensureScheduledBackup(24);
      const scheduleInterval = globalThis.setInterval?.bind(globalThis);
      if (scheduleInterval) {
        this.registerInterval(scheduleInterval(() => {
          try {
            this.standardsService.ensureScheduledBackup(24);
          } catch (error) {
            console.error('[text-review-engine] scheduled backup failed', error);
          }
        }, 6 * 60 * 60 * 1000));
      }
    } catch (error) {
      console.error('[text-review-engine] backup scheduling disabled', error);
    }
    this.panelState = {
      input: '',
      result: null,
      mode: this.settings.defaultMode || 'standard',
      selectedIssueId: '',
      showStandardsManager: false,
      /** 当前选中的 AI 审校场景（prompt ID） */
      activeSceneId: this.settings.activeSceneId || 'general-review',
      /** 最近一次 AI 推理说明（issues 为空时展示） */
      aiReasoning: '',
      /** AI 审校进行中标志，完成后置 null；ReviewView 据此显示进度条 */
      aiReviewProgress: null,
    };
    this.restoreWorkbenchAfterPluginReload();
    /** 最近一次从磁盘重载规则 / Prompt 的时间戳（ms），用于界面反馈 */
    this._rulesReloadedAt = 0;
    this._promptsReloadedAt = 0;

    try {
      this.addSettingTab(new TextReviewSettingTab(this.app, this));
    } catch (error) {
      console.error('[text-review-engine] failed to add settings tab', error);
    }

    try {
      this.registerView(VIEW_TYPE_REVIEW, (leaf) => new ReviewView(leaf, this));
      this.registerView(VIEW_TYPE_STANDARDS, (leaf) => new StandardsView(leaf, this));
    } catch (error) {
      console.error('[text-review-engine] failed to register views', error);
    }

    try {
      registerWorkbenchCodeBlock(this);
      await ensureWorkbenchNote(this);
    } catch (error) {
      console.error('[text-review-engine] failed to register workbench note', error);
    }

    try {
      this.addRibbonIcon('shield-alert', '打开审校工作台', async () => {
        await this.activateView();
      });
      this.addRibbonIcon('list-checks', '打开标准管理台', async () => {
        await this.activateStandardsView();
      });
    } catch (error) {
      console.error('[text-review-engine] failed to add ribbon icon', error);
    }

    try {
      this.addCommand({
        id: 'open-review-workbench',
        name: '打开审校工作台',
        callback: async () => {
          await this.activateView();
        },
      });

      this.addCommand({
        id: 'open-review-note',
        name: '打开审校工作台 Note',
        callback: async () => {
          await openWorkbenchNote(this);
        },
      });

      this.addCommand({
        id: 'open-standards-manager',
        name: '打开标准管理台',
        callback: async () => {
          await this.activateStandardsView();
        },
      });

      this.addCommand({
        id: 'refresh-review-interface',
        name: '刷新审校界面',
        callback: async () => {
          await this.refreshAllViews(true);
        },
      });

      this.addCommand({
        id: 'apply-review-changes',
        name: '应用审校配置更改',
        callback: async () => {
          await this.applyAllChanges(true);
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
          this.panelState.input = selected;
          await this.savePanelState();
          this.setViewInput(selected);
          await this.reviewText(selected, this.panelState.mode);
        },
      });

      this.addCommand({
        id: 'review-active-note',
        name: '审校当前整篇笔记',
        callback: async () => {
          const text = await this.loadActiveNoteIntoWorkbench();
          if (!text.trim()) {
            new Notice('当前笔记为空或不可读取');
            return;
          }
          await this.activateView();
          this.setViewInput(text);
          await this.reviewText(text, this.panelState.mode);
        },
      });
    } catch (error) {
      console.error('[text-review-engine] failed to register commands', error);
    }

    if (this._pendingReloadReopen) {
      this._pendingReloadReopen = false;
      this.app.workspace.onLayoutReady(() => {
        void this.activateView().then(() => {
          new Notice(`插件已重载至 v${this.manifest?.version || '?'}`, 4000);
        });
      });
    }
  }

  async onunload() {
    await this.app.workspace.detachLeavesOfType(VIEW_TYPE_REVIEW);
    await this.app.workspace.detachLeavesOfType(VIEW_TYPE_STANDARDS);
  }

  async saveSettings() {
    await this.saveData(this.settings);
  }

  async savePanelState() {
    const leaves = this.app.workspace.getLeavesOfType(VIEW_TYPE_REVIEW);
    for (const leaf of leaves) {
      const view = leaf.view;
      if (isReviewLeafView(view, ReviewView, VIEW_TYPE_REVIEW) && view.textareaEl) {
        view.textareaEl.value = this.panelState.input || '';
      }
    }
  }

  async loadSelectionIntoWorkbench() {
    const text = await importSelectionFromOtherNote(this);
    if (text) this.refreshWorkbenchViews();
    return text;
  }

  async loadActiveNoteIntoWorkbench() {
    const text = await importActiveNoteFromOtherNote(this);
    if (text) this.refreshWorkbenchViews();
    return text;
  }

  async activateView() {
    let leaf = this.app.workspace.getLeavesOfType(VIEW_TYPE_REVIEW)[0];
    if (!leaf) {
      leaf = this.app.workspace.getLeaf(true);
      await leaf.setViewState({
        type: VIEW_TYPE_REVIEW,
        active: true,
      });
    }
    this.app.workspace.revealLeaf(leaf);
    const view = leaf.view;
    if (isReviewLeafView(view, ReviewView, VIEW_TYPE_REVIEW)) {
      await view.render();
    }
    return leaf;
  }

  async activateStandardsView() {
    const existing = this.app.workspace.getLeavesOfType(VIEW_TYPE_STANDARDS);
    if (existing.length) {
      this.app.workspace.revealLeaf(existing[0]);
      const view = existing[0].view;
      if (view && typeof view.render === 'function') await view.render();
      return existing[0];
    }
    const leaf = this.app.workspace.getLeaf('tab');
    await leaf.setViewState({ type: VIEW_TYPE_STANDARDS, active: true });
    this.app.workspace.revealLeaf(leaf);
    return leaf;
  }

  async openWorkbenchNote() {
    await openWorkbenchNote(this);
  }

  resolveVaultPath(relativePath) {
    const basePath = this.app.vault.adapter.getBasePath?.();
    if (!basePath) return '';
    return path.join(basePath, relativePath);
  }

  resolvePluginDir() {
    const basePath = this.app.vault.adapter.getBasePath?.() || '';
    if (this.manifest?.dir) {
      if (path.isAbsolute(this.manifest.dir)) return this.manifest.dir;
      if (basePath) return path.join(basePath, this.manifest.dir);
      return this.manifest.dir;
    }
    if (!basePath) return '';
    return path.join(basePath, '.obsidian', 'plugins', this.manifest.id);
  }

  injectRuntimeStyles() {
    try {
      if (!this.pluginDir || typeof document === 'undefined') return;
      const stylePath = path.join(this.pluginDir, 'styles.css');
      if (!fs.existsSync(stylePath)) return;
      const css = fs.readFileSync(stylePath, 'utf8');
      const styleId = 'text-review-engine-runtime-style';
      let styleEl = document.getElementById(styleId);
      if (!styleEl) {
        styleEl = document.createElement('style');
        styleEl.id = styleId;
        document.head.appendChild(styleEl);
      }
      styleEl.textContent = css;
    } catch (error) {
      console.error('[text-review-engine] failed to inject runtime styles', error);
    }
  }

  createFallbackStandardsService() {
    return {
      backupNow() { return ''; },
      listBackups() { return []; },
      getLatestBackup() { return null; },
      ensureScheduledBackup() { return null; },
      restoreBackup() {},
      addTypoRule() {},
      addSensitiveTerm() {},
      addFixedPhrase() {},
      addComboRule() {},
      removeRule() {},
      addDimension() {},
      removeDimension() {},
      listPrompts() { return []; },
      savePrompt() {},
    };
  }

  async openStandardsCenter() {
    const file = this.app.vault.getAbstractFileByPath(STANDARDS_NOTE_PATH);
    if (!file) {
      new Notice('未找到审校标准中心文档');
      return;
    }
    const leaf = this.app.workspace.getMostRecentLeaf();
    await leaf.openFile(file, { active: true });
  }

  openPluginSettings() {
    this.app.setting.open();
    this.app.setting.openTabById(this.manifest.id);
  }

  /** 复制插件下子路径的绝对路径（便于在访达 / 资源管理器中打开） */
  async copyPluginSubpathToClipboard(...segments) {
    const dir = path.join(this.pluginDir, ...segments);
    try {
      await navigator.clipboard.writeText(dir);
      new Notice('已复制路径到剪贴板');
    } catch (error) {
      console.error('[text-review-engine] clipboard', error);
      new Notice(`路径：${dir}`, 12000);
    }
  }

  async reloadRuleStore(showNotice = false) {
    try {
      if (!this.pluginDir) {
        if (showNotice) {
          new Notice('无法解析插件目录，规则未重载。请完全重启 Obsidian 或重装插件。', 12000);
        }
        return;
      }
      this.ruleStore = createRuleStore(this.pluginDir);
      this._rulesReloadedAt = Date.now();
      this.injectRuntimeStyles();
      if (showNotice) {
        const version = this.ruleStore.manifest?.version || 'unknown';
        const dir = path.join(this.pluginDir, 'rules');
        new Notice(
          `规则已从磁盘重载\n版本：${version}\n路径：${dir}\n${new Date().toLocaleString()}`,
          12000
        );
      }
      await this.refreshAllViews(false);
    } catch (error) {
      console.error('[text-review-engine] reloadRuleStore failed', error);
      new Notice(`重载规则失败：${error?.message || error}`, 12000);
    }
  }

  async reloadPromptStore(showNotice = false) {
    try {
      if (!this.pluginDir) {
        if (showNotice) {
          new Notice('无法解析插件目录，Prompt 未重载。请完全重启 Obsidian 或重装插件。', 12000);
        }
        return;
      }
      this.promptStore = createPromptStore(this.pluginDir);
      this._promptsReloadedAt = Date.now();
      this.injectRuntimeStyles();
      if (showNotice) {
        const version = this.promptStore.manifest?.version || 'unknown';
        const dir = path.join(this.pluginDir, 'prompts');
        new Notice(
          `Prompt 已从磁盘重载\n版本：${version}\n路径：${dir}\n${new Date().toLocaleString()}`,
          12000
        );
      }
      await this.refreshAllViews(false);
    } catch (error) {
      console.error('[text-review-engine] reloadPromptStore failed', error);
      new Notice(`重载 Prompt 失败：${error?.message || error}`, 12000);
    }
  }

  async applyAllChanges(showNotice = false) {
    this.ruleStore = createRuleStore(this.pluginDir);
    this.promptStore = createPromptStore(this.pluginDir);
    this._rulesReloadedAt = Date.now();
    this._promptsReloadedAt = this._rulesReloadedAt;
    this.injectRuntimeStyles();
    await this.refreshAllViews(false);
    if (showNotice) {
      new Notice('规则、Prompt 和界面已同步更新');
    }
  }

  /**
   * 「应用更改」：通过 Obsidian 插件管理器 disable → enable 实现真正的热重载。
   * 重载前把工作台状态持久化到 data.json，新实例 onload 时自动恢复。
   */
  async reloadEntirePlugin(showNotice = true) {
    try {
      this.syncReviewTextareaToPanelState();

      this.settings._treWorkbenchRestore = {
        v: 1,
        input: this.panelState.input || '',
        mode: this.panelState.mode || 'standard',
      };
      await this.saveData(this.settings);

      const { plugins } = this.app;
      const pluginId = this.manifest.id;

      if (showNotice) new Notice('正在构建并重载…', 3000);

      await this.rebuildBundle();

      await plugins.disablePlugin(pluginId);
      await plugins.enablePlugin(pluginId);
    } catch (error) {
      console.error('[text-review-engine] reload failed', error);
      new Notice(`重载失败：${error?.message || error}`, 8000);
    }
  }

  /**
   * 在 Obsidian 内直接调用 esbuild，不执行 npm（GUI 应用 PATH 里通常没有 npm → spawn ENOENT）。
   * 与 esbuild.config.mjs 保持同一套参数。
   */
  async rebuildBundle() {
    const pluginDir = this.resolvePluginDir();
    const entry = path.join(pluginDir, 'src', 'main.js');
    const pkgJson = path.join(pluginDir, 'package.json');
    if (!fs.existsSync(entry) || !fs.existsSync(pkgJson)) {
      console.log('[text-review-engine] skip build: missing src/main.js or package.json');
      return;
    }

    let esbuild;
    try {
      const { createRequire } = require('module');
      esbuild = createRequire(pkgJson)('esbuild');
    } catch (error) {
      console.warn('[text-review-engine] cannot load esbuild', error);
      new Notice('已跳过 build：插件目录未安装依赖。请在终端执行 cd 插件目录 && npm install', 8000);
      return;
    }

    try {
      await esbuild.build({
        entryPoints: [entry],
        bundle: true,
        format: 'cjs',
        platform: 'node',
        target: 'es2018',
        outfile: path.join(pluginDir, 'main.js'),
        external: ['obsidian'],
        logLevel: 'warning',
      });
      console.log('[text-review-engine] programmatic esbuild OK');
    } catch (error) {
      console.error('[text-review-engine] esbuild.build failed', error);
      new Notice(`Build 失败：${(error?.message || error).slice(0, 160)}`, 10000);
      throw error;
    }
  }

  restoreWorkbenchAfterPluginReload() {
    const raw = this.settings._treWorkbenchRestore;
    if (!raw || typeof raw !== 'object' || raw.v !== 1) return;

    if (typeof raw.input === 'string') this.panelState.input = raw.input;
    if (raw.mode) this.panelState.mode = raw.mode;
    this._pendingReloadReopen = true;

    delete this.settings._treWorkbenchRestore;
    void this.saveData(this.settings).catch((error) => {
      console.error('[text-review-engine] failed to clear workbench restore key', error);
    });
  }

  setViewInput(text) {
    this.panelState.input = text;
    const leaves = this.app.workspace.getLeavesOfType(VIEW_TYPE_REVIEW);
    for (const leaf of leaves) {
      const view = leaf.view;
      if (isReviewLeafView(view, ReviewView, VIEW_TYPE_REVIEW)) {
        view.setInput(text);
      }
    }
  }

  setViewResult(result) {
    this.panelState.result = result;
    // 仅在没有选中或选中项已被忽略时才自动选中；避免每次审校完强制跳第一个
    const currentId = this.panelState.selectedIssueId;
    const allIds = (result?.issues || []).map((i) => i.id);
    if (!currentId || !allIds.includes(currentId)) {
      this.panelState.selectedIssueId = allIds[0] || '';
    }
    const leaves = this.app.workspace.getLeavesOfType(VIEW_TYPE_REVIEW);
    for (const leaf of leaves) {
      const view = leaf.view;
      if (isReviewLeafView(view, ReviewView, VIEW_TYPE_REVIEW)) {
        view.setResult(result);
      }
    }
  }

  refreshWorkbenchViews() {
    this.app.workspace.updateOptions();
    this.app.workspace.trigger('css-change');
    const markdownLeaves = this.app.workspace.getLeavesOfType('markdown');
    for (const leaf of markdownLeaves) {
      const view = leaf.view;
      if (typeof view.previewMode?.rerender === 'function') {
        view.previewMode.rerender(true);
      }
    }
  }

  /** 重绘前把当前输入框内容写回 panelState，避免全量 render 丢字或未同步 */
  syncReviewTextareaToPanelState() {
    const reviewLeaves = this.app.workspace.getLeavesOfType(VIEW_TYPE_REVIEW);
    for (const leaf of reviewLeaves) {
      const view = leaf.view;
      if (isReviewLeafView(view, ReviewView, VIEW_TYPE_REVIEW) && view.textareaEl) {
        this.panelState.input = view.textareaEl.value;
      }
    }
  }

  async refreshAllViews(showNotice = false) {
    this.injectRuntimeStyles();
    this.syncReviewTextareaToPanelState();
    const reviewLeaves = this.app.workspace.getLeavesOfType(VIEW_TYPE_REVIEW);
    for (const leaf of reviewLeaves) {
      const view = leaf.view;
      if (isReviewLeafView(view, ReviewView, VIEW_TYPE_REVIEW)) {
        try {
          await view.render();
        } catch (error) {
          console.error('[text-review-engine] failed to render review view', error);
        }
      }
    }

    const standardsLeaves = this.app.workspace.getLeavesOfType(VIEW_TYPE_STANDARDS);
    for (const leaf of standardsLeaves) {
      const view = leaf.view;
      if (isStandardsLeafView(view, StandardsView, VIEW_TYPE_STANDARDS)) {
        try {
          await view.render();
        } catch (error) {
          console.error('[text-review-engine] failed to render standards view', error);
        }
      }
    }

    this.refreshWorkbenchViews();

    if (showNotice) {
      new Notice('审校界面已刷新');
    }
  }

  async reviewText(rawText, mode, opts = {}) {
    const positionOffset = Number(opts.positionOffset) || 0;
    const fullInputForDisplay = opts.fullInputForDisplay;

    const text = normalizeText(rawText);

    const activePack = this.settings.activePolicyPack || 'social-basic';
    const issues = runRuleEngine(text, mode, this.ruleStore, [activePack]);

    // 构建规则层命中摘要，供 AI prompts 中的 {{rule_hits}} 占位符使用
    const ruleHitIssues = issues.filter((i) => i.source === 'rule');
    const ruleHitsSummary = ruleHitIssues.length
      ? ruleHitIssues.map((i) => `[${i.category}] ${i.message}（原文："${i.text.replace(/"/g, '\\"')}"）`).join('\n')
      : '（规则层本次无命中）';

    const catCount = {};
    for (const iss of issues) {
      const k = `${iss.category}/${iss.severity}`;
      catCount[k] = (catCount[k] || 0) + 1;
    }

    const shouldRunAi = !!this.settings.apiKey
      && (mode === 'strict' || this.settings.includeAiWithRules === true);
    let aiAdded = 0;
    let aiReasoning = '';
    if (shouldRunAi) {
      try {
        this.panelState.aiReviewProgress = { started: true };
        await this.refreshAllViews(false);
        const sceneId = this.panelState.activeSceneId || this.settings.activeSceneId || 'general-review';
        const { issues: aiIssues, reasoning } = await runAiPolicyReview(
          text,
          this.settings,
          this.promptStore,
          sceneId,
          { rule_hits: ruleHitsSummary }
        );
        this.panelState.aiReviewProgress = null;
        issues.push(...aiIssues);
        aiAdded = aiIssues.length;
        aiReasoning = reasoning;
        this.panelState.aiReasoning = reasoning;
      } catch (error) {
        console.error('[text-review-engine] AI review error', error);
        this.panelState.aiReviewProgress = null;
        new Notice('AI 审校调用失败，本次仅返回规则层结果');
      }
    }

    if (positionOffset !== 0) {
      for (const iss of issues) {
        if (iss.position && typeof iss.position.start === 'number' && typeof iss.position.end === 'number') {
          iss.position.start += positionOffset;
          iss.position.end += positionOffset;
        }
      }
    }

    issues.sort((a, b) => {
      const severityOrder = { critical: 4, high: 3, medium: 2, low: 1 };
      return (severityOrder[b.severity] || 0) - (severityOrder[a.severity] || 0);
    });

    if (fullInputForDisplay !== undefined && fullInputForDisplay !== null) {
      this.panelState.input = fullInputForDisplay;
    } else {
      this.panelState.input = rawText;
    }
    await this.savePanelState();

    const result = buildReviewResult(issues, {
      activePack,
      model: shouldRunAi ? `${getProviderPreset(this.settings.provider).name} / ${this.settings.model}` : '',
      skillVersion: this.ruleStore.manifest?.version || 'ruleset-social-v3.0',
      rulesVersion: this.ruleStore.manifest?.version || 'ruleset-social-v3.0',
      decisionStrategies: this.ruleStore.manifest?.decisionStrategies || {},
    });

    this.setViewResult(result);
    this.refreshWorkbenchViews();

    const breakdown = Object.entries(catCount).map(([k, v]) => `${k}: ${v}`).join('\n');
    const sceneName = this.promptStore?.getPrompt?.(this.panelState.activeSceneId)?.name || this.panelState.activeSceneId || 'general-review';
    let aiLine;
    if (!shouldRunAi) {
      aiLine = this.settings.apiKey ? 'AI 层未启用（非严格且未勾选加跑 AI）' : 'AI 层未启用（无 API Key）';
    } else if (aiAdded > 0) {
      aiLine = `AI 层（${sceneName}）追加 ${aiAdded} 条`;
    } else if (aiReasoning) {
      aiLine = `AI 层（${sceneName}）检查通过：无风险。`;
    } else {
      aiLine = `AI 层（${sceneName}）已调用，0 条（若预期应有提示请开控制台查看）`;
    }
    const reasoningNote = (aiAdded === 0 && aiReasoning) ? `\nAI：${aiReasoning}` : '';
    new Notice(
      `审校完成 (v${this.manifest?.version || '?'})\n`
      + `文本长度 ${text.length}，共 ${result.summary.totalIssues} 条\n`
      + `${aiLine}${reasoningNote}\n`
      + `${breakdown || '无规则层问题'}`,
      15000
    );
    return result;
  }
}

module.exports = TextReviewPlugin;
