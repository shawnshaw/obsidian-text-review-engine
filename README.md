# Text Review Engine

A dual-layer text review plugin for Obsidian: **rule-based checks** and **AI-powered semantic review**.

## Features

### Rule Engine (always on)

- **Typo Detection**: Pattern-based typo checking with correction suggestions
- **Fixed Phrases**: Validate correct usage of Chinese fixed expressions (e.g., "召开会议" vs. "召开活动")
- **Sensitive Terms**: Detect prohibited/regulated political and commercial terms
- **Punctuation Rules**: Enforce consistent Chinese punctuation formatting
- **Combo Rules**: Detect prohibited co-occurrence patterns
- **Test Fixtures**: Each rule type includes pass/hit test cases

### AI Review (requires API Key)

Powered by OpenAI-compatible APIs. Works with:

- OpenAI (GPT-4, GPT-4o, GPT-3.5)
- Anthropic (Claude 3, Claude 4)
- DeepSeek (V3, R1)
- Zhipu AI (GLM-5, GLM-4)
- MiniMax
- Any OpenAI-compatible custom endpoint

### Review Modes

| Mode | Rule Engine | AI Review |
|------|:-----------:|:---------:|
| `basic` | ✅ | ❌ |
| `standard` | ✅ | ✅ (optional) |
| `strict` | ✅ | ✅ (always) |

### AI Scene Prompts

| Scene | Description |
|-------|-------------|
| General Review | Full multi-dimension quality check |
| Policy Expression | Government document style compliance |
| Ambiguity | Detect ambiguous or unclear expressions |
| Common Sense | Flag factual inconsistencies |
| Public Opinion Risk | Detect potentially controversial phrasing |
| Stance Check | Evaluate tone consistency and bias |

### UI & Workflow

- **Review Workbench**: Sidebar view with input panel, issue list, and detail inspector
- **Standards Manager**: Visual editor for rules and AI prompts with hot-reload
- **Inline Code Block**: ` ```review` block renders the workbench in any note
- **Ribbon Icons**: Quick access to review workbench and standards manager
- **Editor Commands**: Review selected text or entire active note
- **Backup System**: Auto-backup of rules/prompts with one-click restore
- **Policy Packs**: `social-basic` for social media / `gov-strict` for government docs

## Screenshots

*(Add screenshots here: workbench, standards manager, issue list)*

## Setup

1. Enable the plugin in **Settings → Community Plugins**
2. Open **Settings → Text Review Engine**
3. Configure AI (optional but recommended):
   - **Provider**: Select from OpenAI / Claude / DeepSeek / Zhipu / MiniMax / Custom
   - **API Key**: Enter your API key
   - **Base URL**: API endpoint (auto-filled for known providers)
   - **Model**: Model name (e.g., `gpt-4o`, `claude-sonnet-4-20250514`)
4. Enable "Include AI with rules" if you want AI in non-strict modes
5. Choose a **Policy Pack**: `social-basic` (default) or `gov-strict`

## Keyboard Shortcuts

*(Configure in Obsidian Settings → Hotkeys)*

| Command | Description |
|---------|-------------|
| Text Review Engine: Review Selected Text | Review highlighted text |
| Text Review Engine: Review Active Note | Review entire current note |
| Text Review Engine: Open Review Workbench | Open the sidebar workbench |
| Text Review Engine: Open Standards Manager | Open the standards editor |

## Architecture

```
rules/
  typo-rules.json       # Typo patterns
  fixed-phrases.json    # Correct/incorrect phrase pairs
  sensitive-terms.json  # Prohibited terms
  punctuation-rules.json # Punctuation formatting rules
  combo-rules.json      # Forbidden co-occurrences
  fixtures/            # Test cases (pass/hit)

prompts/
  general-review.json   # Default multi-dimension prompt
  policy-expression-check.json
  ambiguity-check.json
  common-sense-check.json
  public-opinion-risk-check.json
  stance-check.json
```

Rules and prompts are hot-reloadable. Click **"Apply Changes"** in the workbench after editing.

## Changelog

See `versions.json` for full version history.

## License

MIT
