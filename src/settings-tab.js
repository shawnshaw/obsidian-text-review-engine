const { PluginSettingTab, Setting } = require('obsidian');

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
      .setName('API Key')
      .setDesc('严格模式下用于 AI 审校。留空时仅运行规则层。')
      .addText((text) => text
        .setPlaceholder('sk-...')
        .setValue(this.plugin.settings.apiKey || '')
        .onChange(async (value) => {
          this.plugin.settings.apiKey = value.trim();
          await this.plugin.saveSettings();
        }));

    new Setting(containerEl)
      .setName('Base URL')
      .setDesc('兼容 OpenAI Chat Completions 接口。')
      .addText((text) => text
        .setPlaceholder('https://api.openai.com/v1/chat/completions')
        .setValue(this.plugin.settings.baseUrl)
        .onChange(async (value) => {
          this.plugin.settings.baseUrl = value.trim();
          await this.plugin.saveSettings();
        }));

    new Setting(containerEl)
      .setName('Model')
      .setDesc('严格模式下调用的模型名称。')
      .addText((text) => text
        .setPlaceholder('gpt-4.1-mini')
        .setValue(this.plugin.settings.model)
        .onChange(async (value) => {
          this.plugin.settings.model = value.trim();
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
