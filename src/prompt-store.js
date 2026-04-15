const fs = require('fs');
const path = require('path');

function readJsonSafe(filePath, fallback) {
  try {
    const raw = fs.readFileSync(filePath, 'utf8');
    return JSON.parse(raw);
  } catch (error) {
    console.error('[text-review-engine] failed to read prompt file', filePath, error);
    return fallback;
  }
}

function createPromptStore(baseDir) {
  if (!baseDir) {
    return {
      manifest: { version: 'prompts-v1', activePrompts: [] },
      prompts: {},
      getPrompt() {
        return null;
      },
      listPrompts() {
        return [];
      },
    };
  }
  const promptsDir = path.join(baseDir, 'prompts');
  const manifest = readJsonSafe(path.join(promptsDir, 'manifest.json'), {
    version: 'prompts-v1',
    activePrompts: [],
  });

  const prompts = {};
  for (const item of manifest.activePrompts || []) {
    prompts[item.id] = readJsonSafe(path.join(promptsDir, `${item.id}.json`), {
      id: item.id,
      name: item.name,
      description: item.description || '',
      systemPrompt: '',
      userPromptTemplate: '',
      outputSchema: {},
      modelPolicy: { temperature: 0.1 },
    });
  }

  return {
    manifest,
    prompts,
    getPrompt(id) {
      return prompts[id] || null;
    },
    listPrompts() {
      return Object.values(prompts);
    },
  };
}

module.exports = {
  createPromptStore,
};
