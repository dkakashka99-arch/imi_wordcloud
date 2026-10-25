import type { Word } from './contracts';
type Placed = Word & { x: number; y: number; width: number; height: number; size: number };
export function layoutWords(words: Word[]): Placed[] {
  const placed: Placed[] = [];
  const max = Math.max(1, ...words.map((w) => w.count));
  for (const word of words.slice(0, 80)) {
    const size = Math.max(
      14,
      Math.min(
        68,
        18 + 50 * Math.sqrt(word.count / max),
        (1000 / Math.max(1, Array.from(word.text).length)) * 1.5,
      ),
    );
    const width = Math.min(1050, Array.from(word.text).length * size * 0.66 + 12),
      height = size * 1.25;
    for (let step = 0; step < 1300; step++) {
      const angle = step * 0.48,
        radius = Math.sqrt(step) * 9;
      const x = 560 + Math.cos(angle) * radius * 1.7,
        y = 290 + Math.sin(angle) * radius;
      if (x - width / 2 < 10 || x + width / 2 > 1110 || y - height / 2 < 10 || y + height / 2 > 570)
        continue;
      if (
        placed.some(
          (p) =>
            Math.abs(p.x - x) < (p.width + width) / 2 + 7 &&
            Math.abs(p.y - y) < (p.height + height) / 2 + 7,
        )
      )
        continue;
      placed.push({ ...word, x, y, width, height, size });
      break;
    }
  }
  if (placed.length === Math.min(words.length, 80)) return placed;
  // A crowded spiral must never silently discard accepted answers. Pick a
  // bounded fallback layout that fits every supplied word, including long ones.
  const visible = words.slice(0, 80);
  let columns = 1;
  let bestSize = 0;
  const longest = Math.max(1, ...visible.map((word) => Array.from(word.text).length));
  for (let candidate = 1; candidate <= visible.length; candidate++) {
    const rows = Math.ceil(visible.length / candidate);
    const size = Math.min((560 / rows) * 0.7, (1100 / candidate - 12) / (longest * 0.66));
    if (size > bestSize) {
      bestSize = size;
      columns = candidate;
    }
  }
  const rows = Math.ceil(visible.length / columns);
  const cellWidth = 1100 / columns;
  const cellHeight = 560 / rows;
  return visible.map((word, index) => {
    const length = Math.max(1, Array.from(word.text).length);
    const size = Math.min(
      18 + 50 * Math.sqrt(word.count / max),
      cellHeight * 0.7,
      (cellWidth - 12) / (length * 0.66),
    );
    return {
      ...word,
      x: 10 + cellWidth * ((index % columns) + 0.5),
      y: 10 + cellHeight * (Math.floor(index / columns) + 0.5),
      width: length * size * 0.66 + 12,
      height: size * 1.25,
      size,
    };
  });
}
