var __getOwnPropNames = Object.getOwnPropertyNames;
var __commonJS = (cb, mod) => function __require() {
  return mod || (0, cb[__getOwnPropNames(cb)[0]])((mod = { exports: {} }).exports, mod), mod.exports;
};

// src/defaults.js
var require_defaults = __commonJS({
  "src/defaults.js"(exports2, module2) {
    var DEFAULT_SETTINGS2 = {
      provider: "openai",
      baseUrl: "https://api.openai.com/v1/chat/completions",
      apiKey: "",
      model: "gpt-4.1-mini",
      temperature: 0.1,
      timeoutMs: 25e3,
      defaultMode: "standard"
    };
    var VIEW_TYPE_REVIEW2 = "text-review-engine-view";
    var TYPO_RULES = [
      { wrong: "\u5E10\u53F7", correct: "\u8D26\u53F7", severity: "low", message: "\u5E38\u89C1\u5F02\u5F62\u8BCD\uFF0C\u5EFA\u8BAE\u7EDF\u4E00\u4E3A\u201C\u8D26\u53F7\u201D" },
      { wrong: "\u4F5C\u5230", correct: "\u505A\u5230", severity: "medium", message: "\u7591\u4F3C\u9519\u522B\u5B57" },
      { wrong: "\u5FC5\u9700", correct: "\u5FC5\u987B", severity: "medium", message: "\u8BED\u5883\u4E2D\u66F4\u53EF\u80FD\u5E94\u4E3A\u201C\u5FC5\u987B\u201D" }
    ];
    var FIXED_PHRASE_RULES = [
      { wrong: "\u53EC\u5F00\u6D3B\u52A8", correct: "\u4E3E\u884C\u6D3B\u52A8", severity: "medium", message: "\u8BE5\u642D\u914D\u8F83\u751F\u786C\uFF0C\u5EFA\u8BAE\u6539\u4E3A\u201C\u4E3E\u884C\u6D3B\u52A8\u201D" },
      { wrong: "\u63A8\u51FA\u53EC\u5F00", correct: "\u53EC\u5F00", severity: "medium", message: "\u7591\u4F3C\u52A8\u8BCD\u642D\u914D\u5F02\u5E38" }
    ];
    var SENSITIVE_TERMS = [
      { term: "\u53F0\u72EC", severity: "critical", message: "\u547D\u4E2D\u9AD8\u98CE\u9669\u654F\u611F\u8BCD", suggestion: "\u8BF7\u4EBA\u5DE5\u590D\u6838\u6216\u5220\u9664\u76F8\u5173\u8868\u8FF0" },
      { term: "\u6E2F\u72EC", severity: "critical", message: "\u547D\u4E2D\u9AD8\u98CE\u9669\u654F\u611F\u8BCD", suggestion: "\u8BF7\u4EBA\u5DE5\u590D\u6838\u6216\u5220\u9664\u76F8\u5173\u8868\u8FF0" },
      { term: "\u98A0\u8986\u56FD\u5BB6\u653F\u6743", severity: "critical", message: "\u547D\u4E2D\u9AD8\u98CE\u9669\u654F\u611F\u8BCD", suggestion: "\u8BF7\u4EBA\u5DE5\u590D\u6838\u6216\u5220\u9664\u76F8\u5173\u8868\u8FF0" }
    ];
    var COMBO_RULES = [
      {
        trigger: "\u53F0\u6E7E",
        required: ["\u4E2D\u56FD", "\u6211\u56FD", "\u53F0\u6E7E\u5730\u533A"],
        severity: "high",
        message: "\u6D89\u53CA\u76F8\u5173\u8868\u8FF0\u65F6\uFF0C\u5EFA\u8BAE\u4F7F\u7528\u66F4\u5B8C\u6574\u3001\u7A33\u59A5\u7684\u89C4\u8303\u53E3\u5F84"
      }
    ];
    module2.exports = {
      DEFAULT_SETTINGS: DEFAULT_SETTINGS2,
      VIEW_TYPE_REVIEW: VIEW_TYPE_REVIEW2,
      TYPO_RULES,
      FIXED_PHRASE_RULES,
      SENSITIVE_TERMS,
      COMBO_RULES
    };
  }
});

// src/preprocessor.js
var require_preprocessor = __commonJS({
  "src/preprocessor.js"(exports2, module2) {
    function normalizeText2(text) {
      return String(text || "").replace(/\r\n/g, "\n").replace(/\t/g, "  ");
    }
    function collectAllMatches(text, pattern) {
      const matches = [];
      const regex = new RegExp(pattern.source, pattern.flags.includes("g") ? pattern.flags : `${pattern.flags}g`);
      let match;
      while ((match = regex.exec(text)) !== null) {
        matches.push({
          text: match[0],
          start: match.index,
          end: match.index + match[0].length
        });
        if (match[0].length === 0) regex.lastIndex += 1;
      }
      return matches;
    }
    module2.exports = {
      normalizeText: normalizeText2,
      collectAllMatches
    };
  }
});

// src/rule-engine.js
var require_rule_engine = __commonJS({
  "src/rule-engine.js"(exports2, module2) {
    var {
      TYPO_RULES,
      FIXED_PHRASE_RULES,
      SENSITIVE_TERMS,
      COMBO_RULES
    } = require_defaults();
    var { collectAllMatches } = require_preprocessor();
    var issueCounter = 0;
    function nextIssueId() {
      issueCounter += 1;
      return `rule-${issueCounter}`;
    }
    function createIssue(base) {
      return Object.assign(
        {
          id: nextIssueId(),
          source: "rule",
          requiresHumanReview: false
        },
        base
      );
    }
    function findLiteralOccurrences(text, needle) {
      const matches = [];
      let fromIndex = 0;
      while (fromIndex < text.length) {
        const index = text.indexOf(needle, fromIndex);
        if (index === -1) break;
        matches.push({
          start: index,
          end: index + needle.length,
          text: needle
        });
        fromIndex = index + needle.length;
      }
      return matches;
    }
    function runTypoRules(text) {
      const issues = [];
      for (const rule of TYPO_RULES) {
        const matches = findLiteralOccurrences(text, rule.wrong);
        for (const match of matches) {
          issues.push(createIssue({
            category: "typo",
            severity: rule.severity,
            message: rule.message,
            text: match.text,
            position: { start: match.start, end: match.end },
            suggestion: `\u5EFA\u8BAE\u6539\u4E3A\u201C${rule.correct}\u201D`
          }));
        }
      }
      return issues;
    }
    function runFixedPhraseRules(text) {
      const issues = [];
      for (const rule of FIXED_PHRASE_RULES) {
        const matches = findLiteralOccurrences(text, rule.wrong);
        for (const match of matches) {
          issues.push(createIssue({
            category: "fixed_phrase",
            severity: rule.severity,
            message: rule.message,
            text: match.text,
            position: { start: match.start, end: match.end },
            suggestion: `\u5EFA\u8BAE\u6539\u4E3A\u201C${rule.correct}\u201D`
          }));
        }
      }
      return issues;
    }
    function runSensitiveTermRules(text) {
      const issues = [];
      for (const rule of SENSITIVE_TERMS) {
        const matches = findLiteralOccurrences(text, rule.term);
        for (const match of matches) {
          issues.push(createIssue({
            category: "sensitive_term",
            severity: rule.severity,
            message: rule.message,
            text: match.text,
            position: { start: match.start, end: match.end },
            suggestion: rule.suggestion,
            requiresHumanReview: true
          }));
        }
      }
      return issues;
    }
    function runComboRules(text) {
      const issues = [];
      for (const rule of COMBO_RULES) {
        const triggerMatches = findLiteralOccurrences(text, rule.trigger);
        if (!triggerMatches.length) continue;
        const containsRequired = rule.required.some((item) => text.includes(item));
        if (containsRequired) continue;
        for (const match of triggerMatches) {
          issues.push(createIssue({
            category: "combo_rule",
            severity: rule.severity,
            message: rule.message,
            text: match.text,
            position: { start: match.start, end: match.end },
            suggestion: `\u5EFA\u8BAE\u7ED3\u5408\u89C4\u8303\u53E3\u5F84\u8865\u5145\u4EE5\u4E0B\u8868\u8FF0\u4E4B\u4E00\uFF1A${rule.required.join(" / ")}`,
            requiresHumanReview: true
          }));
        }
      }
      return issues;
    }
    function runPunctuationRules(text) {
      const issues = [];
      const repeatedPunctuation = collectAllMatches(text, /[!?！？。，,.]{2,}/g);
      for (const match of repeatedPunctuation) {
        issues.push(createIssue({
          category: "punctuation",
          severity: "low",
          message: "\u5B58\u5728\u8FDE\u7EED\u6807\u70B9\uFF0C\u5EFA\u8BAE\u7B80\u5316",
          text: match.text,
          position: { start: match.start, end: match.end },
          suggestion: "\u8BF7\u68C0\u67E5\u662F\u5426\u5B58\u5728\u591A\u4F59\u6807\u70B9"
        }));
      }
      const mixedComma = collectAllMatches(text, /，\s*,|,\s*，/g);
      for (const match of mixedComma) {
        issues.push(createIssue({
          category: "format",
          severity: "low",
          message: "\u4E2D\u82F1\u6587\u9017\u53F7\u6DF7\u7528",
          text: match.text,
          position: { start: match.start, end: match.end },
          suggestion: "\u5EFA\u8BAE\u7EDF\u4E00\u6807\u70B9\u98CE\u683C"
        }));
      }
      const extraSpaces = collectAllMatches(text, /[^\n]\s{2,}[^\n]/g);
      for (const match of extraSpaces) {
        issues.push(createIssue({
          category: "format",
          severity: "low",
          message: "\u7591\u4F3C\u591A\u4F59\u7A7A\u683C",
          text: match.text.trim(),
          position: { start: match.start + 1, end: match.end - 1 },
          suggestion: "\u5EFA\u8BAE\u6E05\u7406\u591A\u4F59\u7A7A\u683C"
        }));
      }
      const quotePairs = [
        ["\u201C", "\u201D"],
        ["\u300A", "\u300B"],
        ["\uFF08", "\uFF09"]
      ];
      for (const [open, close] of quotePairs) {
        const openCount = (text.match(new RegExp(open, "g")) || []).length;
        const closeCount = (text.match(new RegExp(close, "g")) || []).length;
        if (openCount !== closeCount) {
          issues.push(createIssue({
            category: "punctuation",
            severity: "medium",
            message: `${open}${close} \u6570\u91CF\u4E0D\u5339\u914D`,
            text: `${open}/${close}`,
            position: { start: 0, end: 0 },
            suggestion: `\u8BF7\u68C0\u67E5 ${open} \u4E0E ${close} \u662F\u5426\u6210\u5BF9\u51FA\u73B0`
          }));
        }
      }
      return issues;
    }
    function runRuleEngine2(text, mode) {
      const issues = [];
      issues.push(...runTypoRules(text));
      issues.push(...runPunctuationRules(text));
      if (mode === "standard" || mode === "strict") {
        issues.push(...runSensitiveTermRules(text));
        issues.push(...runFixedPhraseRules(text));
        issues.push(...runComboRules(text));
      }
      return issues;
    }
    module2.exports = {
      runRuleEngine: runRuleEngine2
    };
  }
});

// src/ai-review-engine.js
var require_ai_review_engine = __commonJS({
  "src/ai-review-engine.js"(exports2, module2) {
    var { requestUrl } = require("obsidian");
    var aiIssueCounter = 0;
    function nextAiIssueId() {
      aiIssueCounter += 1;
      return `llm-${aiIssueCounter}`;
    }
    function buildPrompt(text) {
      return [
        "\u4F60\u662F\u4E00\u540D\u4E2D\u6587\u5185\u5BB9\u5BA1\u6821\u52A9\u624B\uFF0C\u8D1F\u8D23\u653F\u52A1\u98CE\u683C\u77ED\u6587\u672C\u98CE\u9669\u63D0\u793A\u3002",
        "\u8BF7\u53EA\u4ECE\u4EE5\u4E0B\u7EF4\u5EA6\u68C0\u67E5\uFF1A",
        "1. \u653F\u52A1\u8868\u8FF0\u662F\u5426\u4E0D\u51C6\u786E\u6216\u4E0D\u7A33\u59A5",
        "2. \u662F\u5426\u5B58\u5728\u6B67\u4E49\u6216\u53EF\u80FD\u5F15\u53D1\u8BEF\u8BFB",
        "3. \u662F\u5426\u5B58\u5728\u8BED\u6C14\u8F7B\u4F7B\u3001\u53E3\u5F84\u4E0D\u7EDF\u4E00\u3001\u7ACB\u573A\u6A21\u7CCA\u7684\u95EE\u9898",
        "4. \u662F\u5426\u9700\u8981\u4EBA\u5DE5\u590D\u6838",
        "",
        "\u8FD4\u56DE JSON\uFF0C\u683C\u5F0F\u5FC5\u987B\u4E3A\uFF1A",
        '{"issues":[{"category":"policy_expression","severity":"low|medium|high","message":"...","text":"...","suggestion":"...","requiresHumanReview":true|false}]}',
        "",
        "\u8981\u6C42\uFF1A",
        '- \u6CA1\u6709\u95EE\u9898\u65F6\u8FD4\u56DE {"issues":[]}',
        "- \u4E0D\u8981\u8F93\u51FA markdown",
        "- \u4E0D\u8981\u8F93\u51FA JSON \u4E4B\u5916\u7684\u4EFB\u4F55\u5185\u5BB9",
        "- \u4E0D\u8981\u628A\u731C\u6D4B\u5199\u6210\u4E8B\u5B9E",
        "",
        `\u5F85\u5BA1\u6821\u6587\u672C\uFF1A
${text}`
      ].join("\n");
    }
    function normalizeAiIssues(payload, text) {
      const issues = Array.isArray(payload == null ? void 0 : payload.issues) ? payload.issues : [];
      return issues.filter((item) => item && item.message).map((item) => {
        const snippet = String(item.text || "").trim();
        const start = snippet ? text.indexOf(snippet) : -1;
        const end = start >= 0 ? start + snippet.length : start;
        return {
          id: nextAiIssueId(),
          category: item.category || "policy_expression",
          severity: item.severity || "medium",
          message: item.message,
          text: snippet,
          position: {
            start: start >= 0 ? start : 0,
            end: end >= 0 ? end : 0
          },
          suggestion: item.suggestion || "\u5EFA\u8BAE\u4EBA\u5DE5\u590D\u6838\u5E76\u6539\u5199\u76F8\u5173\u8868\u8FF0",
          source: "llm",
          requiresHumanReview: Boolean(item.requiresHumanReview)
        };
      });
    }
    async function runAiPolicyReview2(text, settings) {
      var _a, _b, _c, _d, _e;
      if (!settings.apiKey) {
        return [];
      }
      const response = await requestUrl({
        url: settings.baseUrl,
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${settings.apiKey}`
        },
        body: JSON.stringify({
          model: settings.model,
          temperature: Number((_a = settings.temperature) != null ? _a : 0.1),
          response_format: { type: "json_object" },
          messages: [
            {
              role: "system",
              content: "\u4F60\u662F\u4E00\u4E2A\u4E25\u683C\u3001\u514B\u5236\u3001\u53EA\u8FD4\u56DE JSON \u7684\u4E2D\u6587\u5BA1\u6821\u6A21\u578B\u3002"
            },
            {
              role: "user",
              content: buildPrompt(text)
            }
          ]
        }),
        throw: true
      });
      const raw = ((_e = (_d = (_c = (_b = response.json) == null ? void 0 : _b.choices) == null ? void 0 : _c[0]) == null ? void 0 : _d.message) == null ? void 0 : _e.content) || "{}";
      const parsed = JSON.parse(raw);
      return normalizeAiIssues(parsed, text);
    }
    module2.exports = {
      runAiPolicyReview: runAiPolicyReview2
    };
  }
});

// src/decision-engine.js
var require_decision_engine = __commonJS({
  "src/decision-engine.js"(exports2, module2) {
    function levelWeight(severity) {
      switch (severity) {
        case "critical":
          return 4;
        case "high":
          return 3;
        case "medium":
          return 2;
        default:
          return 1;
      }
    }
    function toRiskLevel(issues) {
      if (!issues.length) return "low";
      const highest = issues.reduce((max, item) => Math.max(max, levelWeight(item.severity)), 1);
      if (highest >= 4) return "critical";
      if (highest >= 3) return "high";
      if (highest >= 2) return "medium";
      return "low";
    }
    function toDecision(issues) {
      if (!issues.length) return "pass";
      if (issues.some((item) => item.severity === "critical")) return "blocked";
      if (issues.some((item) => item.severity === "high" && item.requiresHumanReview)) return "human_review";
      return "needs_revision";
    }
    function buildReviewResult2(issues, metadata) {
      return {
        summary: {
          decision: toDecision(issues),
          riskLevel: toRiskLevel(issues),
          totalIssues: issues.length,
          rulesVersion: "ruleset-social-v1",
          skillVersion: metadata.skillVersion || "policy_expression_check@0.1.0",
          model: metadata.model || "",
          reviewedAt: (/* @__PURE__ */ new Date()).toISOString()
        },
        issues,
        suggestedRewrite: ""
      };
    }
    module2.exports = {
      buildReviewResult: buildReviewResult2
    };
  }
});

// src/review-view.js
var require_review_view = __commonJS({
  "src/review-view.js"(exports2, module2) {
    var { ItemView, Notice: Notice2, setIcon } = require("obsidian");
    var { VIEW_TYPE_REVIEW: VIEW_TYPE_REVIEW2 } = require_defaults();
    var ReviewView2 = class extends ItemView {
      constructor(leaf, plugin) {
        super(leaf);
        this.plugin = plugin;
        this.textareaEl = null;
        this.modeSelectEl = null;
        this.summaryEl = null;
        this.resultsEl = null;
      }
      getViewType() {
        return VIEW_TYPE_REVIEW2;
      }
      getDisplayText() {
        return "\u5BA1\u6821\u5DE5\u4F5C\u53F0";
      }
      getIcon() {
        return "shield-alert";
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
        contentEl.addClass("tre-view");
        const toolbar = contentEl.createDiv({ cls: "tre-toolbar" });
        this.modeSelectEl = toolbar.createEl("select");
        ["basic", "standard", "strict"].forEach((mode) => {
          const option = this.modeSelectEl.createEl("option", {
            value: mode,
            text: mode
          });
          option.selected = mode === this.plugin.panelState.mode;
        });
        this.modeSelectEl.addEventListener("change", async () => {
          this.plugin.panelState.mode = this.modeSelectEl.value;
          await this.plugin.savePanelState();
        });
        const runButton = toolbar.createEl("button", { text: "\u5F00\u59CB\u5BA1\u6821" });
        setIcon(runButton, "play");
        runButton.addEventListener("click", async () => {
          await this.runReview();
        });
        const selectionButton = toolbar.createEl("button", { text: "\u5BFC\u5165\u9009\u4E2D" });
        selectionButton.addEventListener("click", async () => {
          await this.plugin.loadSelectionIntoView();
        });
        const noteButton = toolbar.createEl("button", { text: "\u5BFC\u5165\u5168\u6587" });
        noteButton.addEventListener("click", async () => {
          await this.plugin.loadActiveNoteIntoView();
        });
        const copyButton = toolbar.createEl("button", { text: "\u590D\u5236 JSON" });
        copyButton.addEventListener("click", async () => {
          await this.copyJson();
        });
        this.textareaEl = contentEl.createEl("textarea", {
          cls: "tre-textarea",
          attr: { placeholder: "\u7C98\u8D34\u5F85\u5BA1\u6821\u6587\u672C\uFF0C\u6216\u70B9\u51FB\u201C\u5BFC\u5165\u9009\u4E2D/\u5BFC\u5165\u5168\u6587\u201D\u3002" }
        });
        this.textareaEl.value = this.plugin.panelState.input || "";
        this.textareaEl.addEventListener("input", async () => {
          this.plugin.panelState.input = this.textareaEl.value;
          await this.plugin.savePanelState();
        });
        this.summaryEl = contentEl.createDiv({ cls: "tre-summary" });
        this.resultsEl = contentEl.createDiv({ cls: "tre-results" });
        this.renderResult();
      }
      async runReview() {
        var _a, _b, _c;
        const text = ((_b = (_a = this.textareaEl) == null ? void 0 : _a.value) == null ? void 0 : _b.trim()) || "";
        if (!text) {
          new Notice2("\u8BF7\u5148\u8F93\u5165\u5F85\u5BA1\u6821\u6587\u672C");
          return;
        }
        this.plugin.panelState.input = text;
        this.plugin.panelState.mode = ((_c = this.modeSelectEl) == null ? void 0 : _c.value) || this.plugin.panelState.mode;
        await this.plugin.savePanelState();
        await this.plugin.reviewText(text, this.plugin.panelState.mode);
      }
      async copyJson() {
        if (!this.plugin.panelState.result) {
          new Notice2("\u5F53\u524D\u6CA1\u6709\u5BA1\u6821\u7ED3\u679C\u53EF\u590D\u5236");
          return;
        }
        await navigator.clipboard.writeText(JSON.stringify(this.plugin.panelState.result, null, 2));
        new Notice2("\u5DF2\u590D\u5236 JSON \u62A5\u544A");
      }
      renderResult() {
        if (!this.summaryEl || !this.resultsEl) return;
        const result = this.plugin.panelState.result;
        this.summaryEl.empty();
        this.resultsEl.empty();
        if (!result) {
          this.summaryEl.createDiv({ cls: "tre-empty", text: "\u8FD8\u6CA1\u6709\u5BA1\u6821\u7ED3\u679C\u3002" });
          return;
        }
        this.summaryEl.createEl("div", { text: "\u5BA1\u6821\u6458\u8981" });
        const grid = this.summaryEl.createDiv({ cls: "tre-summary-grid" });
        this.renderSummaryCell(grid, "\u7ED3\u8BBA", result.summary.decision);
        this.renderSummaryCell(grid, "\u98CE\u9669", result.summary.riskLevel);
        this.renderSummaryCell(grid, "\u95EE\u9898\u6570", String(result.summary.totalIssues));
        this.renderSummaryCell(grid, "\u6A21\u578B", result.summary.model || "\u89C4\u5219\u5C42");
        if (!result.issues.length) {
          this.resultsEl.createDiv({ cls: "tre-empty", text: "\u672A\u53D1\u73B0\u95EE\u9898\u3002" });
          return;
        }
        for (const issue of result.issues) {
          const card = this.resultsEl.createDiv({ cls: "tre-issue" });
          card.dataset.severity = issue.severity;
          const top = card.createDiv({ cls: "tre-issue-top" });
          top.createEl("strong", { text: issue.message });
          top.createEl("span", {
            cls: "tre-badge",
            text: `${issue.category} \xB7 ${issue.severity} \xB7 ${issue.source}`
          });
          if (issue.text) {
            card.createEl("div", { text: `\u547D\u4E2D\u7247\u6BB5\uFF1A${issue.text}` });
          }
          card.createEl("div", {
            text: `\u4F4D\u7F6E\uFF1A${issue.position.start}-${issue.position.end}`
          });
          if (issue.suggestion) {
            card.createEl("div", { text: `\u5EFA\u8BAE\uFF1A${issue.suggestion}` });
          }
          if (issue.requiresHumanReview) {
            card.createEl("div", { text: "\u6807\u8BB0\uFF1A\u9700\u4EBA\u5DE5\u590D\u6838" });
          }
        }
      }
      renderSummaryCell(parent, label, value) {
        const cell = parent.createDiv();
        cell.createDiv({ cls: "tre-label", text: label });
        cell.createDiv({ cls: "tre-value", text: value });
      }
    };
    module2.exports = {
      ReviewView: ReviewView2
    };
  }
});

// src/settings-tab.js
var require_settings_tab = __commonJS({
  "src/settings-tab.js"(exports2, module2) {
    var { PluginSettingTab, Setting } = require("obsidian");
    var TextReviewSettingTab2 = class extends PluginSettingTab {
      constructor(app, plugin) {
        super(app, plugin);
        this.plugin = plugin;
      }
      display() {
        const { containerEl } = this;
        containerEl.empty();
        containerEl.createEl("h2", { text: "Text Review Engine \u8BBE\u7F6E" });
        new Setting(containerEl).setName("API Key").setDesc("\u4E25\u683C\u6A21\u5F0F\u4E0B\u7528\u4E8E AI \u5BA1\u6821\u3002\u7559\u7A7A\u65F6\u4EC5\u8FD0\u884C\u89C4\u5219\u5C42\u3002").addText((text) => text.setPlaceholder("sk-...").setValue(this.plugin.settings.apiKey || "").onChange(async (value) => {
          this.plugin.settings.apiKey = value.trim();
          await this.plugin.saveSettings();
        }));
        new Setting(containerEl).setName("Base URL").setDesc("\u517C\u5BB9 OpenAI Chat Completions \u63A5\u53E3\u3002").addText((text) => text.setPlaceholder("https://api.openai.com/v1/chat/completions").setValue(this.plugin.settings.baseUrl).onChange(async (value) => {
          this.plugin.settings.baseUrl = value.trim();
          await this.plugin.saveSettings();
        }));
        new Setting(containerEl).setName("Model").setDesc("\u4E25\u683C\u6A21\u5F0F\u4E0B\u8C03\u7528\u7684\u6A21\u578B\u540D\u79F0\u3002").addText((text) => text.setPlaceholder("gpt-4.1-mini").setValue(this.plugin.settings.model).onChange(async (value) => {
          this.plugin.settings.model = value.trim();
          await this.plugin.saveSettings();
        }));
        new Setting(containerEl).setName("\u9ED8\u8BA4\u6A21\u5F0F").setDesc("\u5DE5\u4F5C\u53F0\u6253\u5F00\u65F6\u9ED8\u8BA4\u4F7F\u7528\u7684\u5BA1\u6821\u6A21\u5F0F\u3002").addDropdown((dropdown) => dropdown.addOption("basic", "basic").addOption("standard", "standard").addOption("strict", "strict").setValue(this.plugin.settings.defaultMode).onChange(async (value) => {
          this.plugin.settings.defaultMode = value;
          this.plugin.panelState.mode = value;
          await this.plugin.saveSettings();
          await this.plugin.savePanelState();
        }));
      }
    };
    module2.exports = {
      TextReviewSettingTab: TextReviewSettingTab2
    };
  }
});

// src/main.js
var { Plugin, Notice, MarkdownView } = require("obsidian");
var { DEFAULT_SETTINGS, VIEW_TYPE_REVIEW } = require_defaults();
var { normalizeText } = require_preprocessor();
var { runRuleEngine } = require_rule_engine();
var { runAiPolicyReview } = require_ai_review_engine();
var { buildReviewResult } = require_decision_engine();
var { ReviewView } = require_review_view();
var { TextReviewSettingTab } = require_settings_tab();
var TextReviewPlugin = class extends Plugin {
  async onload() {
    this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
    this.panelState = {
      input: "",
      result: null,
      mode: this.settings.defaultMode || "standard"
    };
    this.addSettingTab(new TextReviewSettingTab(this.app, this));
    this.registerView(VIEW_TYPE_REVIEW, (leaf) => new ReviewView(leaf, this));
    this.addRibbonIcon("shield-alert", "\u6253\u5F00\u5BA1\u6821\u5DE5\u4F5C\u53F0", async () => {
      await this.activateView();
    });
    this.addCommand({
      id: "open-review-workbench",
      name: "\u6253\u5F00\u5BA1\u6821\u5DE5\u4F5C\u53F0",
      callback: async () => {
        await this.activateView();
      }
    });
    this.addCommand({
      id: "review-selected-text",
      name: "\u5BA1\u6821\u5F53\u524D\u9009\u4E2D\u6587\u672C",
      editorCallback: async (editor) => {
        const selected = editor.getSelection().trim();
        if (!selected) {
          new Notice("\u8BF7\u5148\u9009\u62E9\u4E00\u6BB5\u6587\u672C");
          return;
        }
        await this.activateView();
        this.setViewInput(selected);
        await this.reviewText(selected, this.panelState.mode);
      }
    });
    this.addCommand({
      id: "review-active-note",
      name: "\u5BA1\u6821\u5F53\u524D\u6574\u7BC7\u7B14\u8BB0",
      callback: async () => {
        const text = this.getActiveNoteText();
        if (!text.trim()) {
          new Notice("\u5F53\u524D\u7B14\u8BB0\u4E3A\u7A7A\u6216\u4E0D\u53EF\u8BFB\u53D6");
          return;
        }
        await this.activateView();
        this.setViewInput(text);
        await this.reviewText(text, this.panelState.mode);
      }
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
        leaf.view.textareaEl.value = this.panelState.input || "";
      }
    }
  }
  getActiveMarkdownView() {
    const view = this.app.workspace.getActiveViewOfType(MarkdownView);
    return view || null;
  }
  getActiveNoteText() {
    const view = this.getActiveMarkdownView();
    return view ? view.editor.getValue() : "";
  }
  async loadSelectionIntoView() {
    const view = this.getActiveMarkdownView();
    if (!view) {
      new Notice("\u6CA1\u6709\u53EF\u8BFB\u53D6\u7684\u7F16\u8F91\u5668");
      return;
    }
    const selected = view.editor.getSelection().trim();
    if (!selected) {
      new Notice("\u8BF7\u5148\u9009\u4E2D\u6587\u672C");
      return;
    }
    await this.activateView();
    this.setViewInput(selected);
  }
  async loadActiveNoteIntoView() {
    const text = this.getActiveNoteText();
    if (!text.trim()) {
      new Notice("\u5F53\u524D\u7B14\u8BB0\u4E3A\u7A7A");
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
        active: true
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
    if (mode === "strict") {
      try {
        const aiIssues = await runAiPolicyReview(text, this.settings);
        issues.push(...aiIssues);
      } catch (error) {
        console.error(error);
        new Notice("AI \u5BA1\u6821\u8C03\u7528\u5931\u8D25\uFF0C\u672C\u6B21\u4EC5\u8FD4\u56DE\u89C4\u5219\u5C42\u7ED3\u679C");
      }
    }
    issues.sort((a, b) => {
      const severityOrder = { critical: 4, high: 3, medium: 2, low: 1 };
      return (severityOrder[b.severity] || 0) - (severityOrder[a.severity] || 0);
    });
    const result = buildReviewResult(issues, {
      model: mode === "strict" && this.settings.apiKey ? this.settings.model : ""
    });
    this.setViewResult(result);
    new Notice(`\u5BA1\u6821\u5B8C\u6210\uFF0C\u5171\u53D1\u73B0 ${result.summary.totalIssues} \u4E2A\u95EE\u9898`);
    return result;
  }
};
module.exports = TextReviewPlugin;
