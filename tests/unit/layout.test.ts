import { describe, it, expect } from 'vitest';
import { layoutWords, CLOUD_LIMIT } from '../../src/lib/layout';
describe('deterministic word layout', () => {
  it('places Russian words, long phrases and emoji inside bounds without collisions', () => {
    const words = Array.from({ length: 80 }, (_, i) => ({
      text: i === 0 ? 'оченьдлинноеслово'.repeat(6) : `надёжность ${i} 🙂`,
      count: 80 - i,
    }));
    const placed = layoutWords(words);
    expect(placed.length).toBeGreaterThanOrEqual(15);
    expect(placed.length).toBeLessThanOrEqual(CLOUD_LIMIT);
    expect(placed[0].text).toBe(words[0].text);
    expect(placed.map((p) => p.text)).toEqual(words.slice(0, placed.length).map((w) => w.text));
    expect(placed.every((p) => p.size >= 20)).toBe(true);
    expect(layoutWords(words)).toEqual(placed);
    for (const a of placed) {
      expect(a.x - a.width / 2).toBeGreaterThanOrEqual(0);
      expect(a.x + a.width / 2).toBeLessThanOrEqual(1120);
      expect(a.y - a.height / 2).toBeGreaterThanOrEqual(0);
      expect(a.y + a.height / 2).toBeLessThanOrEqual(580);
      for (const b of placed) {
        if (a === b) continue;
        expect(
          Math.abs(a.x - b.x) >= (a.width + b.width) / 2 ||
            Math.abs(a.y - b.y) >= (a.height + b.height) / 2,
        ).toBe(true);
      }
    }
  });
  it('keeps all ten long answers even when the spiral has no free position', () => {
    const words = Array.from({ length: 10 }, (_, i) => ({
      text: `длинный ответ участника номер ${i}`,
      count: 1,
    }));
    expect(layoutWords(words).map((word) => word.text)).toEqual(words.map((word) => word.text));
  });
});
