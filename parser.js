/* Pure parser; no network or account access. */
function parseUsage(text, now = Date.now()) {
  const lines = text.split(/\n/).map(s => s.trim()).filter(Boolean);
  const definitions = [
    ['five', /^(?:5\s*小時(?:用量)?\s*上限|5[- ]hour(?: usage)? limit)$/i],
    ['week', /^(?:每週(?:用量)?\s*上限|weekly(?: usage)? limit)$/i]
  ];
  const rows = {};
  for (const [key, heading] of definitions) {
    const indexes = lines.flatMap((s, i) => heading.test(s) ? [i] : []);
    // Ambiguous matches may be chat content: do not guess.
    if (indexes.length !== 1) continue;
    const start = indexes[0];
    const block = [];
    for (let i = start + 1; i < Math.min(start + 7, lines.length); i++) {
      if (definitions.some(([, re]) => re.test(lines[i]))) break;
      block.push(lines[i]);
    }
    const percentage = block.map(s => s.match(/^(?:剩餘\s*(\d+(?:\.\d+)?)\s*%|(\d+(?:\.\d+)?)\s*%\s*(?:remaining|left))$/i)).find(Boolean);
    const resetText = block.find(s => /重設|重置|resets?/i.test(s));
    if (!percentage || !resetText) continue;
    const remaining = Number(percentage[1] ?? percentage[2]);
    if (remaining < 0 || remaining > 100) continue;
    let minutes = 0, matched = false;
    for (const [re, multiplier] of [[/(\d+)\s*(?:天|days?|d\b)/gi,1440],[/(\d+)\s*(?:小時|hours?|hrs?|h\b)/gi,60],[/(\d+)\s*(?:分鐘|分|minutes?|mins?|m\b)/gi,1]]) {
      for (const m of resetText.matchAll(re)) {minutes += Number(m[1]) * multiplier; matched = true;}
    }
    rows[key] = {remaining, resetText, resetAt: matched ? now + minutes * 60000 : null};
  }
  return Object.keys(rows).length === 2 ? {rows, capturedAt:now} : null;
}
if (typeof module !== 'undefined') module.exports = {parseUsage};
