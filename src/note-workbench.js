const { MarkdownView, Notice } = require('obsidian');

const WORKBENCH_NOTE_PATH = '🤖 审校工作台.md';
const WORKBENCH_CODEBLOCK = 'text-review-workbench';

async function ensureWorkbenchNote(plugin) {
  const existing = plugin.app.vault.getAbstractFileByPath(WORKBENCH_NOTE_PATH);
  if (existing) return existing;

  const content = [
    '---',
    'type: dashboard',
    'title: 审校工作台',
    'created: 2026-04-02',
    'updated: 2026-04-02',
    'status: active',
    'tags:',
    '  - ai-management',
    '  - review',
    '  - dashboard',
    '---',
    '',
    '# 🤖 审校工作台',
    '',
    '> 这是内容审校引擎的 note 工作台。你可以直接在这里粘贴文本、执行规则审校或严格审校，并查看结构化问题结果。',
    '',
    '## 使用方式',
    '',
    '- 直接把待发布文本粘贴进下方工作台',
    '- 或在其他 note 中先选中文本，再执行命令 `审校当前选中文本`',
    '- `strict` 模式会在规则层基础上调用 AI 做政务表述风险提示',
    '',
    '## 审校面板',
    '',
    '```text-review-workbench',
    'mode: standard',
    '```',
    '',
    '## 建议范围',
    '',
    '- 推文、短文案、简讯',
    '- 政务风格短内容',
    '- 需要发布前快速把关的文本',
    '',
    '## 当前版本边界',
    '',
    '- 已支持：错别字、标点格式、敏感词、固定搭配、强制组合、严格模式 AI 风险提示',
    '- 暂未支持：原文定位高亮、问题筛选、自动修订建议稿、多规则包切换',
  ].join('\n');

  return plugin.app.vault.create(WORKBENCH_NOTE_PATH, content);
}

async function openWorkbenchNote(plugin) {
  const file = await ensureWorkbenchNote(plugin);
  const leaf = plugin.app.workspace.getMostRecentLeaf();
  await leaf.openFile(file, { active: true });
  return file;
}

function getExternalMarkdownView(plugin) {
  const leaves = plugin.app.workspace.getLeavesOfType('markdown');
  for (const leaf of leaves) {
    const view = leaf.view;
    if (!(view instanceof MarkdownView)) continue;
    const path = view.file?.path || '';
    if (path !== WORKBENCH_NOTE_PATH) return view;
  }
  return plugin.app.workspace.getActiveViewOfType(MarkdownView);
}

async function importSelectionFromOtherNote(plugin) {
  const view = getExternalMarkdownView(plugin);
  if (!view) {
    new Notice('没有可读取的笔记编辑器');
    return '';
  }
  const selected = view.editor.getSelection().trim();
  if (!selected) {
    new Notice('请先在其他笔记中选中文本');
    return '';
  }
  plugin.panelState.input = selected;
  await plugin.savePanelState();
  return selected;
}

async function importActiveNoteFromOtherNote(plugin) {
  const view = getExternalMarkdownView(plugin);
  if (!view) {
    new Notice('没有可读取的笔记编辑器');
    return '';
  }
  const text = view.editor.getValue().trim();
  if (!text) {
    new Notice('当前笔记为空');
    return '';
  }
  plugin.panelState.input = text;
  await plugin.savePanelState();
  return text;
}

module.exports = {
  WORKBENCH_NOTE_PATH,
  WORKBENCH_CODEBLOCK,
  ensureWorkbenchNote,
  openWorkbenchNote,
  importSelectionFromOtherNote,
  importActiveNoteFromOtherNote,
};
