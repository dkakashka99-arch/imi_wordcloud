import { describe, it, expect } from 'vitest';
import { layoutWords } from '../../src/lib/layout';
describe('deterministic word layout', () => {
  it('places Russian words, long phrases and emoji inside bounds without collisions', () => {
    const words = Array.from({ length: 80 }, (_, i) => ({
      text: i === 0 ? 'оченьдлинноеслово'.repeat(6) : `надёжность ${i} 🙂`,
      count: 80 - i,
    }));
    const placed = layoutWords(words);
    expect(placed.length).toBeGreaterThan(5);
    expect(layoutWords(words)).toEqual(placed);
    for (const a of placed) {
      expect(a.x - a.width / 2).toBeGreaterThanOrEqual(0);
      expect(a.x + a.width / 2).toBeLessThanOrEqual(1120);
      for (const b of placed) {
        if (a === b) continue;
        expect(
          Math.abs(a.x - b.x) >= (a.width + b.width) / 2 ||
            Math.abs(a.y - b.y) >= (a.height + b.height) / 2,
        ).toBe(true);
      }
    }
  });
});
