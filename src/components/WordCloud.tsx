import { layoutWords } from '@/lib/layout';
import type { Word } from '@/lib/contracts';
const colors = ['#d7ee83', '#e9e6c7', '#9cd1bb', '#e6b78f', '#aac6ed'];
export function WordCloud({ words }: { words: Word[] }) {
  if (!words.length)
    return (
      <div className="notice" style={{ margin: '80px 20px' }}>
        Здесь появятся ваши ответы. Отсканируйте QR-код и поделитесь мнением.
      </div>
    );
  return (
    <svg
      className="cloud"
      viewBox="0 0 1120 580"
      role="img"
      aria-label={words.map((w) => `${w.text}: ${w.count}`).join('; ')}
    >
      {layoutWords(words).map((word, i) => (
        <text
          key={word.text}
          x={word.x}
          y={word.y}
          textAnchor="middle"
          dominantBaseline="central"
          fontSize={word.size}
          fontWeight={600}
          fill={colors[i % colors.length]}
          textLength={Math.max(1, word.width - 12)}
          lengthAdjust="spacingAndGlyphs"
        >
          <title>
            {word.text}: {word.count}
          </title>
          {word.text}
        </text>
      ))}
    </svg>
  );
}
