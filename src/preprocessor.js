function normalizeText(text) {
  return String(text || '')
    .replace(/\r\n/g, '\n')
    .replace(/\t/g, '  ');
}

function collectAllMatches(text, pattern) {
  const matches = [];
  const regex = new RegExp(pattern.source, pattern.flags.includes('g') ? pattern.flags : `${pattern.flags}g`);
  let match;
  while ((match = regex.exec(text)) !== null) {
    matches.push({
      text: match[0],
      start: match.index,
      end: match.index + match[0].length,
    });
    if (match[0].length === 0) regex.lastIndex += 1;
  }
  return matches;
}

/** 选区在「全文 normalize 后」字符串中的起始下标；找不到返回 -1 */
function normalizedSelectionOffset(fullRaw, selStart, selEnd) {
  const full = normalizeText(fullRaw);
  const slice = normalizeText(String(fullRaw || '').slice(selStart, selEnd));
  if (!slice.length) return -1;
  return full.indexOf(slice);
}

module.exports = {
  normalizeText,
  collectAllMatches,
  normalizedSelectionOffset,
};
