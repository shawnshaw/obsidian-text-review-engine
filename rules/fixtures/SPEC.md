# 固定搭配规则管理台 规格文档

> 版本：v1.0 | 日期：2026-04-06

---

## 一、产品定位

**固定搭配规则治理台**（Fixed Phrase Governance Console）。

不是"录入词条的地方"，而是能长期维护、筛选、验证、回溯固定搭配规则的工作台。

---

## 二、壳层

沿用插件已有壳：`Workbench Shell + Chapter Maintenance Pane`

```
┌─────────────────────────────────────────────────────────┐
│  TOPBAR: 标题 + 当前 pack + 筛选结果数 + 主动作      │
├────────┬──────────────────────┬───────────────────────┤
│  LEFT  │   MIDDLE            │   RIGHT                │
│  Rail  │   Rule List         │   Detail / Edit        │
│        │                     │                       │
│  状态   │  wrong → correct   │  核心规则              │
│  分类   │  message           │  策略信息              │
│  包    │  tags / pack /     │  解释与验证            │
│  质量   │  status / updated  │  来源与历史            │
└────────┴──────────────────────┴───────────────────────┘
```

---

## 三、左 Rail

### 3.1 规则状态
| 标签 | 说明 |
|------|------|
| 全部 | 所有规则 |
| 已启用 | status=active |
| 草稿 | status=draft |
| 候选 | status=candidate |
| 已停用 | status=disabled |
| 已废弃 | status=deprecated |

### 3.2 规则分类（按 tag）
| 标签 | 说明 |
|------|------|
| 动词+宾语 | verb_object |
| 顺序错误 | word_order |
| 冗余表达 | verb_redundancy |
| 政务规范 | gov_style |
| 近似错写 | typo_like |

### 3.3 规则包（按 pack）
| 标签 | 说明 |
|------|------|
| social-basic | 通用基础包 |
| gov-strict | 政务严格包 |

### 3.4 冲突与质量
| 标签 | 说明 |
|------|------|
| 疑似重复 | 同 wrong 不同 correct |
| 疑似覆盖 | substring 包含关系 |
| 无样例 | examples 为空 |
| 无反例 | counterExamples 为空 |
| 低置信度 | confidence < 0.8 |

---

## 四、中间列表

### 4.1 字段（每行）
1. `wrong → correct`（第一行，加粗）
2. `message`（第二行，次级）
3. `severity 标签 | pack 标签 | status 标签 | updatedAt`（第三行，元数据）

### 4.2 支持交互
- 单击 → 选中并打开右侧详情
- 多条件组合筛选（左侧 rail）
- 全文搜索（wrong / correct / tags / note）
- 排序：最近更新 | 置信度 | 严重级别

### 4.3 冲突指示
列表行左侧有颜色指示：
- `critical/high` → 红色左边框
- `disabled/deprecated` → 灰色行
- 疑似冲突 → 黄色警告图标

---

## 五、右侧详情

### 5.1 章节结构

```
### 核心规则
  wrong / correct / message / suggestion / severity

### 策略信息
  pack / enabled / status / scope / matchMode / confidence

### 解释与验证
  examples / counterExamples / note

### 来源与历史
  source / owner / createdAt / updatedAt
```

### 5.2 交互原则
- 默认显示**摘要**（前 3 个字段展开，其余折叠）
- 点「编辑规则」进入编辑态
- 一次只编辑一条规则
- 保存前自动校验：wrong/correct 非空 + 无重复检测

---

## 六、编辑态校验

| 检查项 | 条件 |
|--------|------|
| wrong 非空 | 长度 > 0 |
| correct 非空 | 长度 > 0 |
| 无精确重复 | 同一 (wrong, correct) pair 不存在 |
| 无冲突 | 同一 wrong 不同 correct 不存在 |
| examples 存在 | examples.length > 0（警告，非阻断）|

---

## 七、生命周期状态机

```
draft → candidate → active
                      ↓
                  disabled
                      ↓
                  active

active → deprecated
```

- `draft`：草稿，未启用
- `candidate`：候选，待验证
- `active`：正式生效（执行层只执行此状态）
- `disabled`：暂停
- `deprecated`：废弃

---

## 八、新增规则入口

| 入口 | 说明 |
|------|------|
| 顶部「新增规则」 | 人工直接录入，默认为 active |
| 问题流「加入规则」 | 从真实审校问题沉淀，预填 wrong/correct/severity/message/tags |
| 候选池导入 | 批量导入，默认为 candidate |

---

## 九、冲突检测算法

### 9.1 精确重复
```js
// 同一 (wrong, correct) pair 出现多次
```

### 9.2 wrong 冲突
```js
// 同一 wrong 对应多个不同 correct
```

### 9.3 覆盖关系
```js
// one wrong 是另一 wrong 的 substring（长度 > 2）
```

---

## 十、回归验证

### fixtures/fixed_phrase/pass/
命名：`任意描述.txt`
语义：包含 wrong 的句子，但不应触发该规则（context 语境屏蔽）

### fixtures/fixed_phrase/hit/
命名：`hit.<rule-id>.<描述>.txt`
语义：包含 wrong 且应触发该规则

### 运行
在标准管理台点「运行回归」，触发 `runRegressions()`，输出 pass/hit 通过率。

---

## 十一、最小可行版本（v1）

- [x] 左侧：pack 过滤 / tag 过滤 / status 过滤
- [x] 中间：搜索 / 规则列表（wrong→correct / message / tags）
- [x] 右侧：规则摘要 + 单条编辑 + examples/counterExamples
- [x] 冲突检查提示（列表行颜色指示）
- [x] 从问题流预填新增

---

## 十三、实现状态（v1 完成）

> 2026-04-06 实施完成

### 已实现
- `standards-service.js`：完整 CRUD（增删改查）、状态切换、批量导出、冲突检测（精确重复 / wrong 冲突 / substring 覆盖）、回归测试（pass/hit fixtures）
- `standards-view.js`：固定搭配独立治理台（3-panel layout）
  - 左 Rail：状态 / 分类 / 规则包 / 冲突与质量 四维筛选
  - 中间列表：搜索 + 排序 + severity 色条 + 冲突警告图标
  - 右侧详情：4-tab 详情（核心 / 策略 / 验证 / 历史）+ 一键启用/停用
  - 顶部栏：新增规则 / 运行回归 / 刷新
  - 新增表单：预填 wrong/correct/message/severity/pack/tags/examples/counterExamples，保存前校验重复
- `styles.css`：治理台全部 CSS（`.fp-` 前缀）
- `rules/fixtures/`：5 pass + 5 hit 回归样本，全部通过（10/10）
- `rules/fixtures/SPEC.md`：规格文档
- `rules/fixtures/README.md`：fixture 使用说明

### 待后续
- 从审校问题流「加入规则」入口（需 review-view.js 协作）
- 候选池批量导入（CSV/JSON 批量录入，默认 candidate 状态）
- 规则命中频次统计（需持久化存储命中日志）
- 排序选项（置信度 / 严重级别）


```json
{
  "id": "fixed-xxx",
  "category": "fixed_phrase",
  "wrong": "召开活动",
  "correct": "举行活动",
  "severity": "low | medium | high | critical",
  "message": "搭配不当",
  "suggestion": "建议改为\"举行活动\"",
  "pack": ["social-basic", "gov-strict"],
  "enabled": true,
  "status": "draft | candidate | active | disabled | deprecated",
  "scope": "literal | sentence | paragraph",
  "matchMode": "exact | regex | tokenized",
  "window": 0,
  "tags": ["verb_object", "gov_style"],
  "domain": "gov | general",
  "owner": "system | manual",
  "source": "manual | issue_flow | corpus_extract | gov_doc",
  "confidence": 0.95,
  "examples": ["召开活动", "市里召开主题活动"],
  "counterExamples": ["相关部门将依法召开会议"],
  "note": "适用于活动、仪式、培训等场景",
  "createdAt": "2026-04-06T00:00:00.000Z",
  "updatedAt": "2026-04-06T00:00:00.000Z"
}
```
