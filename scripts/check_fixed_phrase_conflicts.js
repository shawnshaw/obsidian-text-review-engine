/**
 * check_fixed_phrase_conflicts.js
 * 固定搭配冲突检测 — 独立脚本版
 *
 * 用法：node scripts/check_fixed_phrase_conflicts.js
 * 输出：rules/fixed-phrases-conflicts.json
 *
 * 检测类型：
 *   1. 精确重复  — 同 (wrong, correct, pack) 完全相同
 *   2. wrong 冲突 — 同一 wrong 对应多个不同 correct
 *   3. 覆盖冲突  — one wrong 是另一 wrong 的 substring（长度 > 2）
 *   4. 缺失样例  — examples 为空
 *   5. 缺失反例  — counterExamples 为空
 *   6. 非 active 状态 — status !== 'active'
 */
const fs = require('fs');
const path = require('path');

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function writeJson(filePath, data) {
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2) + '\n', 'utf8');
}

function groupBy(list, keyFn) {
  const map = new Map();
  for (const item of list) {
    const key = keyFn(item);
    const bucket = map.get(key) || [];
    bucket.push(item);
    map.set(key, bucket);
  }
  return map;
}

function buildReport(rules) {
  const activeRules = rules.filter(
    (r) => r.enabled !== false && (r.status || 'active') === 'active'
  );
  const byWrong = groupBy(activeRules, (r) => String(r.wrong || '').trim());

  /* 1 — 精确重复（同一 wrong+correct+pack） */
  const duplicates = [];
  for (const [, bucket] of byWrong.entries()) {
    const byCorrectPack = groupBy(bucket, (r) => {
      const pack = Array.isArray(r.pack) ? [...r.pack].sort().join('|') : '';
      return `${r.correct}__${pack}`;
    });
    for (const [, samePair] of byCorrectPack.entries()) {
      if (samePair.length > 1) {
        duplicates.push({
          wrong: samePair[0].wrong,
          correct: samePair[0].correct,
          pack: samePair[0].pack || [],
          ids: samePair.map((r) => r.id),
        });
      }
    }
  }

  /* 2 — wrong 冲突（同一 wrong 对应多个不同 correct） */
  const wrongConflicts = [];
  for (const [wrong, bucket] of byWrong.entries()) {
    const uniqueCorrects = [...new Set(bucket.map((r) => String(r.correct || '').trim()))];
    if (uniqueCorrects.length > 1) {
      wrongConflicts.push({
        wrong,
        ids: bucket.map((r) => r.id),
        corrects: uniqueCorrects,
      });
    }
  }

  /* 3 — 覆盖冲突（substring，包含长度 > 2 的规则）
     只遍历 j > i，确保每对只记录一次 */
  const overlapping = [];
  const activeWrongs = activeRules.map((r) => ({ id: r.id, wrong: String(r.wrong || '').trim() }));
  for (let i = 0; i < activeWrongs.length; i++) {
    for (let j = i + 1; j < activeWrongs.length; j++) {
      const a = activeWrongs[i];
      const b = activeWrongs[j];
      if (
        a.wrong.length > 2 &&
        b.wrong.length > 2 &&
        a.wrong !== b.wrong &&
        (a.wrong.includes(b.wrong) || b.wrong.includes(a.wrong))
      ) {
        overlapping.push({
          outer: a.wrong.includes(b.wrong) ? a.id : b.id,
          outerWrong: a.wrong.includes(b.wrong) ? a.wrong : b.wrong,
          inner: a.wrong.includes(b.wrong) ? b.id : a.id,
          innerWrong: a.wrong.includes(b.wrong) ? b.wrong : a.wrong,
          relationship: 'outer-covers-inner',
        });
      }
    }
  }

  /* 4 — 缺失样例 */
  const missingExamples = rules
    .filter((r) => !r.examples || !Array.isArray(r.examples) || !r.examples.length)
    .map((r) => r.id);

  /* 5 — 缺失反例 */
  const missingCounterExamples = rules
    .filter((r) => !r.counterExamples || !Array.isArray(r.counterExamples) || !r.counterExamples.length)
    .map((r) => r.id);

  /* 6 — 非 active 状态 */
  const inactiveRules = rules
    .filter((r) => r.status && r.status !== 'active')
    .map((r) => ({ id: r.id, status: r.status }));

  /* 6b — 临时停用（enabled=false） */
  const disabledByFlag = rules
    .filter((r) => r.enabled === false)
    .map((r) => ({ id: r.id, reason: r.status !== 'active' ? 'both' : 'enabled-false' }));

  /* 汇总 — 与明细口径统一：inactiveRules = status !== 'active' */
  const summary = {
    totalRules: rules.length,
    activeRules: activeRules.length,
    inactiveRules: inactiveRules.length,
    disabledByFlag: disabledByFlag.length,
    duplicateGroups: duplicates.length,
    wrongConflictGroups: wrongConflicts.length,
    overlappingGroups: overlapping.length,
    missingExamples: missingExamples.length,
    missingCounterExamples: missingCounterExamples.length,
  };

  return { summary, duplicates, wrongConflicts, overlapping, missingExamples, missingCounterExamples, inactiveRules, disabledByFlag };
}

function main() {
  const pluginDir = path.resolve(__dirname, '..');
  const rulesPath = path.join(pluginDir, 'rules', 'fixed-phrases.json');
  const outputPath = path.join(pluginDir, 'rules', 'fixed-phrases-conflicts.json');

  if (!fs.existsSync(rulesPath)) {
    console.error(`Rules file not found: ${rulesPath}`);
    process.exit(1);
  }

  const rules = readJson(rulesPath);
  const report = buildReport(rules);

  writeJson(outputPath, report);

  const s = report.summary;
  console.log('固定搭配冲突检测报告');
  console.log('========================');
  console.log(`总规则数        : ${s.totalRules}`);
  console.log(`已激活规则      : ${s.activeRules}`);
  console.log(`非 active 状态  : ${s.inactiveRules}`);
  console.log(`enabled=false  : ${s.disabledByFlag}`);
  console.log(`精确重复组      : ${s.duplicateGroups}`);
  console.log(`wrong 冲突组    : ${s.wrongConflictGroups}`);
  console.log(`覆盖冲突组      : ${s.overlappingGroups}`);
  console.log(`缺失样例        : ${s.missingExamples}`);
  console.log(`缺失反例        : ${s.missingCounterExamples}`);
  console.log(`输出文件        : ${outputPath}`);

  if (s.duplicateGroups === 0 && s.wrongConflictGroups === 0 && s.overlappingGroups === 0) {
    console.log('\n状态：无可检测冲突。达到可维护基线。');
  } else {
    console.log('\n状态：发现冲突，请查看输出文件。');
  }
}

main();
