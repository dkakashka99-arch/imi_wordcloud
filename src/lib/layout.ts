import type { Word } from './contracts';
export type Placed = Word & {
  x: number;
  y: number;
  width: number;
  height: number;
  size: number;
  label: string;
};
export const CLOUD_LIMIT = 36;
export type Measure = (text: string, size: number) => number;
export function layoutWords(
  words: Word[],
  measure: Measure = (text, size) => Array.from(text).length * size * 0.65,
): Placed[] {
  const visible = [...words]
    .sort((a, b) => b.count - a.count || a.text.localeCompare(b.text, 'ru'))
    .slice(0, CLOUD_LIMIT);
  const max = Math.max(1, ...visible.map((w) => w.count));
  // Repack at a smaller common scale before reducing visible top-N. Never use rows or stretch glyphs.
  let best: Placed[] = [];
  for (const scale of [1, 0.9, 0.8, 0.7, 0.6, 0.5, 0.4, 0.3]) {
    const placed: Placed[] = [];
    for (const word of visible) {
      const label =
        Array.from(word.text).length > 52
          ? Array.from(word.text).slice(0, 49).join('') + '…'
          : word.text;
      const desired =
        (28 + 78 * Math.sqrt(word.count / max)) *
        scale *
        Math.min(1, 3 / Math.sqrt(visible.length));
      const size = Math.max(
        20,
        Math.min(desired, (desired * 1030) / Math.max(1, measure(label, desired))),
      );
      const width = measure(label, size) + 16,
        height = size * 1.22 + 6;
      for (let step = 0; step < 8000; step++) {
        const angle = step * 0.39,
          radius = Math.sqrt(step) * 4.2;
        const x = 560 + Math.cos(angle) * radius * 1.8,
          y = 290 + Math.sin(angle) * radius;
        if (
          x - width / 2 < 14 ||
          x + width / 2 > 1106 ||
          y - height / 2 < 14 ||
          y + height / 2 > 566
        )
          continue;
        if (
          placed.some(
            (p) =>
              Math.abs(p.x - x) < (p.width + width) / 2 + 4 &&
              Math.abs(p.y - y) < (p.height + height) / 2 + 4,
          )
        )
          continue;
        placed.push({ ...word, label, size, width, height, x, y });
        break;
      }
      // Keep a contiguous top-N: a lower-frequency word can never displace an unplaced leader.
      if (placed.length < visible.indexOf(word) + 1) break;
    }
    if (placed.length > best.length) best = placed;
    if (placed.length === visible.length) return placed;
  }
  return best;
}
