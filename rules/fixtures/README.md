# 固定搭配回归样本（Fixtures）

## 目录结构

```
fixtures/
├── SPEC.md               ← 本规格文档
├── README.md             ← 本说明
├── fixed_phrase/
│   ├── pass/             ← 应通过（不应触发）
│   └── hit/              ← 应触发（命中规则）
```

## pass/ — 应通过样本

命名格式：`pass.<描述>.txt`

语义：文本包含 `wrong` 短语，但在真实语境中不应触发规则（被其他词或语境屏蔽）。

示例：
- `pass.扩大会议.合法召开.txt` → 内容包含"召开"，但语境是"合法召开会议"，不应触发。

## hit/ — 应触发样本

命名格式：`hit.<rule-id>.<描述>.txt`

语义：文本包含 `wrong` 短语且应触发对应规则。

示例：
- `hit.fixed-001.召开活动.txt` → 包含"召开活动"，应触发 `fixed-001` 规则。

## 运行方式

在 StandardsView 中点击「运行回归」→ 调用 `runRegressions()` → 输出 pass/hit 通过率。

## 添加新样本

1. 确定是 pass 还是 hit
2. 命名：`pass.<场景描述>.txt` 或 `hit.<rule-id>.<场景描述>.txt`
3. 写入一段真实语感的句子
4. 运行回归验证