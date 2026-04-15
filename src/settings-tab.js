const { PluginSettingTab, Setting } = require('obsidian');
const { PROVIDER_PRESETS, applyProviderPreset, getProviderPreset } = require('./defaults');

class TextReviewSettingTab extends PluginSettingTab {
  constructor(app, plugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  display() {
    const { containerEl } = this;
    containerEl.empty();
    containerEl.createEl('h2', { text: 'Text Review Engine 设置' });

    new Setting(containerEl)
      .setName('Provider')
      .setDesc('选择模型服务商。插件按 OpenAI Chat Completions 兼容协议调用。')
      .addDropdown((dropdown) => {
        Object.values(PROVIDER_PRESETS).forEach((preset) => {
          dropdown.addOption(preset.id, preset.name);
        });
        dropdown.setValue(this.plugin.settings.provider || 'openai');
        dropdown.onChange(async (value) => {
          this.plugin.settings = applyProviderPreset(this.plugin.settings, value);
          await this.plugin.saveSettings();
          this.display();
        });
      });

    const currentPreset = getProviderPreset(this.plugin.settings.provider || 'openai');

    new Setting(containerEl)
      .setName('推荐模型')
      .setDesc(currentPreset.models.length
        ? `当前 Provider 常用模型：${currentPreset.models.join(' / ')}`
        : '自定义 Provider 可直接手填模型名称。')
      .addText((text) => text
        .setPlaceholder(currentPreset.defaultModel || 'model-name')
        .setValue(this.plugin.settings.model)
        .onChange(async (value) => {
          this.plugin.settings.model = value.trim();
          await this.plugin.saveSettings();
        }));

    new Setting(containerEl)
      .setName('API Key')
      .setDesc('用于 AI 语义审校：「严格」模式始终调用；「轻量/标准」下可在工作台勾选「加跑 AI」。不会写入仓库跟踪文件。')
      .addText((text) => {
        text.setPlaceholder('sk-...');
        text.setValue(this.plugin.settings.apiKey || '');
        text.inputEl.type = 'password';
        text.onChange(async (value) => {
          this.plugin.settings.apiKey = value.trim();
          await this.plugin.saveSettings();
        });
      });

    new Setting(containerEl)
      .setName('Base URL')
      .setDesc('兼容 OpenAI Chat Completions 接口。切换 Provider 后会自动带出推荐地址。')
      .addText((text) => text
        .setPlaceholder('https://api.openai.com/v1/chat/completions')
        .setValue(this.plugin.settings.baseUrl)
        .onChange(async (value) => {
          this.plugin.settings.baseUrl = value.trim();
          await this.plugin.saveSettings();
        }));

    const presetHint = containerEl.createDiv();
    presetHint.style.margin = '8px 0 18px';
    presetHint.style.color = 'var(--text-muted)';
    presetHint.style.fontSize = '12px';
    presetHint.setText([
      `当前预设：${currentPreset.name}`,
      `Base URL：${this.plugin.settings.baseUrl || '(empty)'}`,
      `Model：${this.plugin.settings.model || '(empty)'}`,
    ].join(' ｜ '));

    new Setting(containerEl)
      .setName('轻量/标准模式下加跑 AI')
      .setDesc('开启后，在非「严格」模式下点击「开始审校」也会调用大模型（需 API Key）。也可在工作台输入区下方随时开关。')
      .addToggle((toggle) => toggle
        .setValue(!!this.plugin.settings.includeAiWithRules)
        .onChange(async (value) => {
          this.plugin.settings.includeAiWithRules = value;
          await this.plugin.saveSettings();
        }));

    new Setting(containerEl)
      .setName('默认模式')
      .setDesc('工作台打开时默认使用的审校模式。')
      .addDropdown((dropdown) => dropdown
        .addOption('basic', 'basic')
        .addOption('standard', 'standard')
        .addOption('strict', 'strict')
        .setValue(this.plugin.settings.defaultMode)
        .onChange(async (value) => {
          this.plugin.settings.defaultMode = value;
          this.plugin.panelState.mode = value;
          await this.plugin.saveSettings();
          await this.plugin.savePanelState();
        }));
  }
}

module.exports = {
  TextReviewSettingTab,
};
