const fs = require('fs');
const path = require('path');

function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

function readJson(filePath, fallback) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch (error) {
    console.error('[text-review-engine] read json failed', filePath, error);
    return fallback;
  }
}

function writeJson(filePath, payload) {
  fs.writeFileSync(filePath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
}

function timestampId() {
  const now = new Date();
  const pad = (value) => String(value).padStart(2, '0');
  return `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}_${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
}

function createRuleId(prefix) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

/**
 * Detect conflicts in fixed phrase rules.
 * Returns { duplicates, conflicts, overlapping }
 */
function detectFixedPhraseConflicts(rules) {
  const duplicates = [];
  const conflicts = [];
  const overlapping = [];

  // 1. Exact duplicate: same (wrong, correct) pair
  const byWrongCorrect = {};
  for (const rule of rules) {
    const key = `${rule.wrong}::${rule.correct}`;
    if (!byWrongCorrect[key]) byWrongCorrect[key] = [];
    byWrongCorrect[key].push(rule.id);
  }
  for (const [key, ids] of Object.entries(byWrongCorrect)) {
    if (ids.length > 1) {
      duplicates.push({ type: 'exact_pair', key, ruleIds: ids });
    }
  }

  // 2. Same wrong, different correct → conflict
  const byWrong = {};
  for (const rule of rules) {
    if (!byWrong[rule.wrong]) byWrong[rule.wrong] = [];
    byWrong[rule.wrong].push(rule);
  }
  for (const [wrong, ruleset] of Object.entries(byWrong)) {
    if (ruleset.length > 1) {
      const correctSet = [...new Set(ruleset.map((r) => r.correct))];
      if (correctSet.length > 1) {
        conflicts.push({
          type: 'wrong_conflict',
          wrong,
          corrections: correctSet,
          ruleIds: ruleset.map((r) => r.id),
        });
      }
    }
  }

  // 3. Substring overlap: one wrong is substring of another (j > i only, one record per pair)
  const wrongs = rules.map((r) => ({ id: r.id, wrong: r.wrong }));
  for (let i = 0; i < wrongs.length; i++) {
    for (let j = i + 1; j < wrongs.length; j++) {
      const a = wrongs[i].wrong;
      const b = wrongs[j].wrong;
      if (a !== b && a.length > 2 && b.length > 2) {
        if (a.includes(b)) {
            overlapping.push({
              type: 'substring',
              outer: wrongs[i].id,
              outerWrong: a,
              inner: wrongs[j].id,
              innerWrong: b,
              relationship: 'outer-covers-inner',
            });
          } else {
            overlapping.push({
              type: 'substring',
              outer: wrongs[j].id,
              outerWrong: b,
              inner: wrongs[i].id,
              innerWrong: a,
              relationship: 'outer-covers-inner',
            });
          }
      }
    }
  }

  return { duplicates, conflicts, overlapping };
}

/**
 * Run regression fixtures against fixed phrase rules.
 * fixtures/pass/*.txt → should NOT trigger any rule
 * fixtures/hit/*.txt → should trigger the named rule
 */
function runRegressions(rules, fixturesDir) {
  const passDir = path.join(fixturesDir, 'fixed_phrase', 'pass');
  const hitDir = path.join(fixturesDir, 'fixed_phrase', 'hit');
  const results = { pass: [], hit: [], errors: [] };

  const activeRules = rules.filter(
    (r) => r.enabled !== false && (r.status || 'active') === 'active'
  );

  function matchRule(text, rule) {
    return text.includes(rule.wrong);
  }

  // pass fixtures: should NOT trigger any rule
  if (fs.existsSync(passDir)) {
    for (const file of fs.readdirSync(passDir)) {
      if (!file.endsWith('.txt')) continue;
      const content = fs.readFileSync(path.join(passDir, file), 'utf8').trim();
      const triggered = activeRules.filter((r) => matchRule(content, r));
      results.pass.push({
        file,
        content,
        triggeredRuleIds: triggered.map((r) => r.id),
        passed: triggered.length === 0,
      });
    }
  }

  // hit fixtures: naming convention → hit.<rule-id>.<optional-suffix>.txt
  if (fs.existsSync(hitDir)) {
    for (const file of fs.readdirSync(hitDir)) {
      if (!file.endsWith('.txt')) continue;
      const content = fs.readFileSync(path.join(hitDir, file), 'utf8').trim();
      const parts = file.replace('.txt', '').split('.');
      const expectedRuleId = parts[1] || null;
      const triggered = activeRules.filter((r) => matchRule(content, r));
      results.hit.push({
        file,
        content,
        expectedRuleId,
        triggeredRuleIds: triggered.map((r) => r.id),
        passed: expectedRuleId
          ? triggered.some((r) => r.id === expectedRuleId)
          : triggered.length > 0,
      });
    }
  }

  return results;
}

function createStandardsService(pluginDir, standardsDocPath) {
  const rulesDir = path.join(pluginDir, 'rules');
  const promptsDir = path.join(pluginDir, 'prompts');
  const backupsDir = path.join(pluginDir, 'backups');
  const fixturesDir = path.join(rulesDir, 'fixtures'); // rules/fixtures/fixed_phrase/
  ensureDir(rulesDir);
  ensureDir(promptsDir);
  ensureDir(backupsDir);

  const fileMap = {
    manifest: path.join(rulesDir, 'manifest.json'),
    typoRules: path.join(rulesDir, 'typo-rules.json'),
    punctuationRules: path.join(rulesDir, 'punctuation-rules.json'),
    sensitiveTerms: path.join(rulesDir, 'sensitive-terms.json'),
    fixedPhraseRules: path.join(rulesDir, 'fixed-phrases.json'),
    comboRules: path.join(rulesDir, 'combo-rules.json'),
    conflicts: path.join(rulesDir, 'fixed-phrases-conflicts.json'),
  };
  const promptManifestPath = path.join(promptsDir, 'manifest.json');

  /* ============================== Backups ============================== */
  function getBackupMeta(backupId) {
    return readJson(path.join(backupsDir, backupId, 'meta.json'), {
      id: backupId,
      reason: 'unknown',
      createdAt: '',
    });
  }

  function backupNow(reason = 'manual') {
    const backupId = timestampId();
    const dir = path.join(backupsDir, backupId);
    ensureDir(dir);

    Object.entries(fileMap).forEach(([key, filePath]) => {
      if (!fs.existsSync(filePath)) return;
      fs.copyFileSync(filePath, path.join(dir, path.basename(filePath)));
    });

    if (fs.existsSync(promptManifestPath)) {
      fs.copyFileSync(promptManifestPath, path.join(dir, 'prompts-manifest.json'));
      const promptManifest = readJson(promptManifestPath, { activePrompts: [] });
      for (const prompt of promptManifest.activePrompts || []) {
        const promptPath = path.join(promptsDir, `${prompt.id}.json`);
        if (fs.existsSync(promptPath)) {
          fs.copyFileSync(promptPath, path.join(dir, `prompt-${prompt.id}.json`));
        }
      }
    }

    if (standardsDocPath && fs.existsSync(standardsDocPath)) {
      fs.copyFileSync(standardsDocPath, path.join(dir, path.basename(standardsDocPath)));
    }

    writeJson(path.join(dir, 'meta.json'), {
      id: backupId,
      reason,
      createdAt: new Date().toISOString(),
    });

    return backupId;
  }

  function listBackups() {
    return fs.readdirSync(backupsDir)
      .filter((name) => fs.statSync(path.join(backupsDir, name)).isDirectory())
      .map((name) => getBackupMeta(name))
      .sort((a, b) => String(b.id).localeCompare(String(a.id)));
  }

  function getLatestBackup() {
    return listBackups()[0] || null;
  }

  function ensureScheduledBackup(intervalHours = 24) {
    const latest = getLatestBackup();
    if (!latest?.createdAt) {
      return backupNow('scheduled-initial');
    }
    const latestAt = new Date(latest.createdAt).getTime();
    const now = Date.now();
    const intervalMs = intervalHours * 60 * 60 * 1000;
    if (!Number.isFinite(latestAt) || now - latestAt >= intervalMs) {
      return backupNow('scheduled');
    }
    return null;
  }

  function restoreBackup(backupId) {
    const dir = path.join(backupsDir, backupId);
    if (!fs.existsSync(dir)) throw new Error(`Backup not found: ${backupId}`);

    Object.entries(fileMap).forEach(([key, filePath]) => {
      const backupFile = path.join(dir, path.basename(filePath));
      if (fs.existsSync(backupFile)) fs.copyFileSync(backupFile, filePath);
    });

    const promptManifestBackup = path.join(dir, 'prompts-manifest.json');
    if (fs.existsSync(promptManifestBackup)) {
      fs.copyFileSync(promptManifestBackup, promptManifestPath);
      const promptManifest = readJson(promptManifestBackup, { activePrompts: [] });
      for (const prompt of promptManifest.activePrompts || []) {
        const promptBackup = path.join(dir, `prompt-${prompt.id}.json`);
        if (fs.existsSync(promptBackup)) {
          fs.copyFileSync(promptBackup, path.join(promptsDir, `${prompt.id}.json`));
        }
      }
    }

    if (standardsDocPath) {
      const docBackup = path.join(dir, path.basename(standardsDocPath));
      if (fs.existsSync(docBackup)) fs.copyFileSync(docBackup, standardsDocPath);
    }
  }

  /* ============================== Rule CRUD ============================== */
  function updateJsonArray(filePath, updater) {
    const current = readJson(filePath, []);
    const next = updater(Array.isArray(current) ? current : []);
    writeJson(filePath, next);
  }

  function addTypoRule(payload) {
    backupNow('add-typo-rule');
    updateJsonArray(fileMap.typoRules, (rules) =>
      rules.concat([{
        id: createRuleId('typo'),
        wrong: payload.wrong,
        correct: payload.correct,
        severity: payload.severity,
        message: payload.message,
      }])
    );
  }

  function addSensitiveTerm(payload) {
    backupNow('add-sensitive-term');
    updateJsonArray(fileMap.sensitiveTerms, (rules) =>
      rules.concat([{
        id: createRuleId('sensitive'),
        term: payload.term,
        severity: payload.severity,
        message: payload.message,
        suggestion: payload.suggestion,
      }])
    );
  }

  function addFixedPhrase(payload) {
    backupNow('add-fixed-phrase');
    updateJsonArray(fileMap.fixedPhraseRules, (rules) =>
      rules.concat([{
        id: createRuleId('fixed'),
        category: 'fixed_phrase',
        wrong: payload.wrong,
        correct: payload.correct,
        severity: payload.severity || 'medium',
        message: payload.message || `"${payload.wrong}" 建议调整`,
        suggestion: payload.suggestion || `建议改为"${payload.correct}"`,
        pack: Array.isArray(payload.pack) && payload.pack.length
          ? payload.pack
          : ['social-basic', 'gov-strict'],
        enabled: payload.enabled !== false,
        status: payload.status || 'active',
        scope: payload.scope || 'literal',
        matchMode: payload.matchMode || 'exact',
        window: Number(payload.window) || 0,
        tags: Array.isArray(payload.tags) ? payload.tags : [],
        domain: payload.domain || 'general',
        owner: payload.owner || 'manual',
        source: payload.source || 'manual',
        confidence: typeof payload.confidence === 'number' ? payload.confidence : 0.95,
        examples: Array.isArray(payload.examples) && payload.examples.length
          ? payload.examples
          : [payload.wrong],
        counterExamples: Array.isArray(payload.counterExamples)
          ? payload.counterExamples
          : [],
        note: payload.note || '',
        createdAt: payload.createdAt || new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      }])
    );
  }

  function addComboRule(payload) {
    backupNow('add-combo-rule');
    updateJsonArray(fileMap.comboRules, (rules) =>
      rules.concat([{
        id: createRuleId('combo'),
        trigger: payload.trigger,
        requiredAny: Array.isArray(payload.requiredAny) ? payload.requiredAny : [],
        severity: payload.severity,
        message: payload.message,
        enabled: payload.enabled !== false,
        pack: Array.isArray(payload.pack) ? payload.pack : [],
        scope: payload.scope || 'first_occurrence',
        window: Number(payload.window) || 200,
        requiresHumanReview: payload.requiresHumanReview === true,
        tags: Array.isArray(payload.tags) ? payload.tags : [],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      }])
    );
  }

  function removeRule(category, ruleId) {
    const mapping = {
      typoRules: fileMap.typoRules,
      sensitiveTerms: fileMap.sensitiveTerms,
      fixedPhraseRules: fileMap.fixedPhraseRules,
      comboRules: fileMap.comboRules,
    };
    const filePath = mapping[category];
    if (!filePath) throw new Error(`Unsupported category: ${category}`);
    backupNow(`remove-${category}`);
    updateJsonArray(filePath, (rules) =>
      rules.filter((rule) => String(rule.id || '') !== String(ruleId))
    );
  }

  /* ============================== Fixed Phrase Management ============================== */
  function getFixedPhraseById(ruleId) {
    const rules = readJson(fileMap.fixedPhraseRules, []);
    return rules.find((r) => String(r.id) === String(ruleId)) || null;
  }

  function updateFixedPhrase(ruleId, payload) {
    backupNow('update-fixed-phrase');
    updateJsonArray(fileMap.fixedPhraseRules, (rules) =>
      rules.map((r) => {
        if (String(r.id) !== String(ruleId)) return r;
        return {
          ...r,
          wrong: payload.wrong !== undefined ? payload.wrong : r.wrong,
          correct: payload.correct !== undefined ? payload.correct : r.correct,
          severity: payload.severity !== undefined ? payload.severity : r.severity,
          message: payload.message !== undefined ? payload.message : r.message,
          suggestion:
            payload.suggestion !== undefined
              ? payload.suggestion
              : r.suggestion || `建议改为"${payload.correct || r.correct}"`,
          pack:
            payload.pack !== undefined
              ? payload.pack
              : r.pack || ['social-basic', 'gov-strict'],
          enabled: payload.enabled !== undefined ? payload.enabled : r.enabled,
          status: payload.status !== undefined ? payload.status : r.status || 'active',
          scope: payload.scope !== undefined ? payload.scope : r.scope || 'literal',
          matchMode: payload.matchMode !== undefined ? payload.matchMode : r.matchMode || 'exact',
          window: payload.window !== undefined ? Number(payload.window) : Number(r.window) || 0,
          tags: payload.tags !== undefined ? payload.tags : r.tags || [],
          domain: payload.domain !== undefined ? payload.domain : r.domain || 'general',
          owner: payload.owner !== undefined ? payload.owner : r.owner || 'manual',
          source: payload.source !== undefined ? payload.source : r.source || 'manual',
          confidence:
            payload.confidence !== undefined ? payload.confidence : r.confidence || 0.95,
          examples:
            payload.examples !== undefined ? payload.examples : r.examples || [r.wrong],
          counterExamples:
            payload.counterExamples !== undefined
              ? payload.counterExamples
              : r.counterExamples || [],
          note: payload.note !== undefined ? payload.note : r.note || '',
          updatedAt: new Date().toISOString(),
        };
      })
    );
  }

  function toggleRuleStatus(category, ruleId) {
    const VALID_STATUSES = ['draft', 'candidate', 'active', 'disabled', 'deprecated'];
    const NEXT_STATUS = {
      draft: 'candidate',
      candidate: 'active',
      active: 'disabled',
      disabled: 'active',
      deprecated: 'candidate',
    };
    const filePath = fileMap[category];
    if (!filePath) throw new Error(`Unsupported category: ${category}`);
    const rules = readJson(filePath, []);
    const rule = rules.find((r) => String(r.id) === String(ruleId));
    if (!rule) throw new Error(`Rule not found: ${ruleId}`);
    const current = rule.status || 'active';
    const next = NEXT_STATUS[current] || 'active';
    backupNow(`toggle-status-${category}`);
    updateJsonArray(filePath, (rs) =>
      rs.map((r) =>
        String(r.id) === String(ruleId)
          ? { ...r, status: VALID_STATUSES.includes(next) ? next : 'active', updatedAt: new Date().toISOString() }
          : r
      )
    );
    return { ruleId, previousStatus: current, newStatus: next };
  }

  /** Export fixed phrase rules filtered by criteria */
  function exportFixedPhrases({ pack, tag, domain, status, severity, search } = {}) {
    let rules = readJson(fileMap.fixedPhraseRules, []);
    if (pack) rules = rules.filter((r) => Array.isArray(r.pack) && r.pack.includes(pack));
    if (tag) rules = rules.filter((r) => Array.isArray(r.tags) && r.tags.includes(tag));
    if (domain) rules = rules.filter((r) => r.domain === domain);
    if (status) rules = rules.filter((r) => r.status === status);
    if (severity) rules = rules.filter((r) => r.severity === severity);
    if (search) {
      const q = search.toLowerCase();
      rules = rules.filter(
        (r) =>
          (r.wrong || '').toLowerCase().includes(q) ||
          (r.correct || '').toLowerCase().includes(q) ||
          (r.message || '').toLowerCase().includes(q) ||
          (r.note || '').toLowerCase().includes(q)
      );
    }
    return rules;
  }

  /** Get all unique values for filter dimensions */
  function getRuleDimensions() {
    const rules = readJson(fileMap.fixedPhraseRules, []);
    const packs = new Set();
    const tags = new Set();
    const domains = new Set();
    const statuses = new Set();
    const severities = new Set();
    for (const r of rules) {
      if (r.pack) r.pack.forEach((p) => packs.add(p));
      if (r.tags) r.tags.forEach((t) => tags.add(t));
      if (r.domain) domains.add(r.domain);
      if (r.status) statuses.add(r.status);
      if (r.severity) severities.add(r.severity);
    }
    return {
      packs: [...packs].sort(),
      tags: [...tags].sort(),
      domains: [...domains].sort(),
      statuses: [...statuses].sort(),
      severities: [...severities].sort(),
    };
  }

  /** Run conflict detection and regression, save report */
  function runConflictReport() {
    const rules = readJson(fileMap.fixedPhraseRules, []);
    const { duplicates, conflicts, overlapping } = detectFixedPhraseConflicts(rules);
    const regression = runRegressions(rules, fixturesDir);

    const activeRules = rules.filter(
      (r) => r.enabled !== false && (r.status || 'active') === 'active'
    );
    const inactiveRules = rules.filter((r) => r.status && r.status !== 'active');
    const disabledByFlag = rules.filter((r) => r.enabled === false);
    const missingExamples = rules.filter(
      (r) => !r.examples || !Array.isArray(r.examples) || !r.examples.length
    ).length;
    const missingCounterExamples = rules.filter(
      (r) => !r.counterExamples || !Array.isArray(r.counterExamples) || !r.counterExamples.length
    ).length;

    const report = {
      summary: {
        totalRules: rules.length,
        activeRules: activeRules.length,
        inactiveRules: inactiveRules.length,
        disabledByFlag: disabledByFlag.length,
        duplicateGroups: duplicates.length,
        wrongConflictGroups: conflicts.length,
        overlappingGroups: overlapping.length,
        missingExamples,
        missingCounterExamples,
        regressionPass: regression.pass.filter((r) => r.passed).length,
        regressionHit: regression.hit.filter((r) => r.passed).length,
        regressionTotal: regression.pass.length + regression.hit.length,
      },
      duplicates,
      wrongConflicts: conflicts,
      overlapping,
      regression,
      generatedAt: new Date().toISOString(),
    };

    writeJson(fileMap.conflicts, report);
    return report;
  }

  function getConflictReport() {
    return readJson(fileMap.conflicts, null);
  }

  /* ============================== Manifest / Dimensions ============================== */
  function updateManifest(updater, reason) {
    const current = readJson(fileMap.manifest, {
      version: 'ruleset-social-v1',
      policyPacks: [],
      dimensions: [],
    });
    backupNow(reason);
    const next = updater(current);
    writeJson(fileMap.manifest, next);
  }

  function addDimension(payload) {
    updateManifest(
      (manifest) => {
        const dimensions = Array.isArray(manifest.dimensions) ? manifest.dimensions : [];
        return {
          ...manifest,
          dimensions: dimensions.concat([{
            id: payload.id,
            name: payload.name,
            layer: payload.layer || 'rule',
            priority: Number(payload.priority || 2),
          }]),
        };
      },
      'add-dimension'
    );
  }

  function removeDimension(dimensionId) {
    updateManifest(
      (manifest) => ({
        ...manifest,
        dimensions: (manifest.dimensions || []).filter(
          (d) => String(d.id) !== String(dimensionId)
        ),
      }),
      'remove-dimension'
    );
  }

  /* ============================== Prompts ============================== */
  function listPrompts() {
    const manifest = readJson(promptManifestPath, {
      version: 'prompts-v1',
      activePrompts: [],
    });
    return (manifest.activePrompts || []).map((item) => {
      const filePath = path.join(promptsDir, `${item.id}.json`);
      return readJson(filePath, {
        id: item.id,
        name: item.name,
        description: '',
        systemPrompt: '',
        userPromptTemplate: '',
        outputSchema: {},
        modelPolicy: { temperature: 0.1 },
      });
    });
  }

  function savePrompt(promptId, payload) {
    backupNow(`save-prompt-${promptId}`);
    const filePath = path.join(promptsDir, `${promptId}.json`);
    const current = readJson(filePath, {
      id: promptId,
      name: payload.name || promptId,
      description: '',
      systemPrompt: '',
      userPromptTemplate: '',
      outputSchema: {},
      modelPolicy: { temperature: 0.1 },
    });
    const next = {
      ...current,
      ...payload,
      id: promptId,
      modelPolicy: { ...(current.modelPolicy || {}), ...(payload.modelPolicy || {}) },
    };
    writeJson(filePath, next);
  }

  /* ============================== Expose ============================== */
  return {
    backupNow,
    listBackups,
    getLatestBackup,
    ensureScheduledBackup,
    restoreBackup,
    addTypoRule,
    addSensitiveTerm,
    addFixedPhrase,
    addComboRule,
    removeRule,
    getFixedPhraseById,
    updateFixedPhrase,
    toggleRuleStatus,
    exportFixedPhrases,
    getRuleDimensions,
    runConflictReport,
    getConflictReport,
    addDimension,
    removeDimension,
    listPrompts,
    savePrompt,
  };
}

module.exports = {
  createStandardsService,
  detectFixedPhraseConflicts,
  runRegressions,
};
