const fs = require('fs');
const path = require('path');

function readJsonSafe(filePath, fallback) {
  try {
    const raw = fs.readFileSync(filePath, 'utf8');
    return JSON.parse(raw);
  } catch (error) {
    console.error('[text-review-engine] failed to read rule file', filePath, error);
    return fallback;
  }
}

function writeJsonSafe(filePath, data) {
  try {
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf8');
    return true;
  } catch (error) {
    console.error('[text-review-engine] failed to write rule file', filePath, error);
    return false;
  }
}

function createRuleStore(baseDir) {
  if (!baseDir) {
    return {
      manifest: { version: 'ruleset-social-v1', policyPacks: [], dimensions: [] },
      typoRules: [],
      punctuationRules: {},
      sensitiveTerms: [],
      fixedPhraseRules: [],
      comboRules: [],
      addTypoRule() {},
      addSensitiveTerm() {},
      addFixedPhraseRule() {},
      addComboRule() {},
    };
  }
  const rulesDir = path.join(baseDir, 'rules');
  const manifests = readJsonSafe(path.join(rulesDir, 'manifest.json'), {
    version: 'ruleset-social-v1',
    policyPacks: [],
  });

  const store = {
    manifest: manifests,
    typoRules: readJsonSafe(path.join(rulesDir, 'typo-rules.json'), []),
    punctuationRules: readJsonSafe(path.join(rulesDir, 'punctuation-rules.json'), {}),
    sensitiveTerms: readJsonSafe(path.join(rulesDir, 'sensitive-terms.json'), []),
    fixedPhraseRules: readJsonSafe(path.join(rulesDir, 'fixed-phrases.json'), []),
    comboRules: readJsonSafe(path.join(rulesDir, 'combo-rules.json'), []),

    addTypoRule(rule) {
      store.typoRules.push(rule);
      writeJsonSafe(path.join(rulesDir, 'typo-rules.json'), store.typoRules);
    },
    addSensitiveTerm(rule) {
      store.sensitiveTerms.push(rule);
      writeJsonSafe(path.join(rulesDir, 'sensitive-terms.json'), store.sensitiveTerms);
    },
    addFixedPhraseRule(rule) {
      store.fixedPhraseRules.push(rule);
      writeJsonSafe(path.join(rulesDir, 'fixed-phrases.json'), store.fixedPhraseRules);
    },
    addComboRule(rule) {
      store.comboRules.push(rule);
      writeJsonSafe(path.join(rulesDir, 'combo-rules.json'), store.comboRules);
    },
  };
  return store;
}

module.exports = {
  createRuleStore,
};
