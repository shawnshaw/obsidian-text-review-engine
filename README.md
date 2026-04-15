# Text Review Engine

一个面向 Obsidian 的文本审校插件 MVP，采用“规则层 + AI 层”双引擎。

## 当前能力

- 审校当前选中文本
- 审校当前整篇笔记
- 快捷指令打开审校工作台并支持粘贴文本
- 基础规则检查：
  - 常见错别字
  - 标点与格式
  - 敏感词
  - 固定搭配
  - 强制组合提示
- `strict` 模式下可调用兼容 OpenAI Chat Completions 的接口，补充政务表述风险提示
- 支持多 Provider 预设：OpenAI、DeepSeek、MiniMax、SiliconFlow(Qwen)
- 顶部 toolbar 支持打开标准中心、重载规则
- 规则已迁移到 `rules/*.json`，修改后可直接在界面点击“重载规则”

## 仓库定位

这个目录可以单独作为一个公开 git 仓库维护，与 vault 中其他插件和笔记提交完全分开。

## 目录

```text
text-review-engine/
  manifest.json
  package.json
  esbuild.config.mjs
  main.js
  styles.css
  rules/
  src/
```

## 开发

```bash
npm install
npm run build
```

开发监听：

```bash
npm run dev
```

## 使用

1. 在 Obsidian 社区插件里启用 `Text Review Engine`
2. 打开插件设置，填写 `API Key`、`Base URL`、`Model`
   - 也可以直接选择 Provider 预设
   - 当前支持：
     - `DeepSeek`
     - `MiniMax`
     - `SiliconFlow (Qwen)`
     - `Custom OpenAI-Compatible`
3. 用以下任一方式开始：
   - 左侧功能区点击盾牌图标
   - 命令面板执行“打开审校工作台”
   - 命令面板执行“审校当前选中文本”
   - 命令面板执行“审校当前整篇笔记”
4. 规则维护：
   - 在 `rules/*.json` 中修改规则
   - 回到工作台点击 `重载规则`
   - 无需重启插件

## 下一步建议

- 增加问题高亮与跳转定位
- 增加按类别筛选
- 增加修订建议稿
- 增加多套 policy pack

## 公开发布建议

如果你准备推到 GitHub 公共仓库，建议仓库名直接使用：

- `obsidian-text-review-engine`

并保留以下文件：

- `manifest.json`
- `main.js`
- `styles.css`
- `README.md`
- `LICENSE`
