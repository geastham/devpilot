/**
 * Display helpers for text the planner wrote.
 *
 * Task labels and descriptions come straight out of the model's plan table,
 * where emphasis and code spans are markdown. Nothing that renders them is a
 * markdown renderer — SVG <text> nodes, one-line summaries, sidebar lists — so
 * the asterisks and backticks were drawn literally: a critical-path entry read
 * `**Public contract.** \`FormatBytesOptions\``.
 *
 * Stripping rather than rendering is deliberate. These are labels, not prose:
 * the emphasis marked a word inside a sentence that is no longer there, and a
 * bold run in a 20-character truncated node label communicates nothing.
 */
export function plainText(value: string): string {
  return value
    .replace(/\*\*(.+?)\*\*/g, '$1')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/(^|\s)_([^_]+)_(?=\s|$)/g, '$1$2')
    .trim();
}

/** `1 task` / `2 tasks` — the plural bug this repo keeps re-growing by hand. */
export function pluralize(count: number, noun: string, plural = `${noun}s`): string {
  return `${count} ${count === 1 ? noun : plural}`;
}
