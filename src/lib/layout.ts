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
  return placed;
}
