'use client';
import { useMemo } from 'react';
import { layoutWords, CLOUD_LIMIT } from '@/lib/layout';
import type { Word } from '@/lib/contracts';
export function familyColor(family: string) {
  // Stable hue shared by every member, independent of vote order or frequency.
  let hash = 0;
  for (const c of family) hash = (Math.imul(hash, 31) + c.charCodeAt(0)) >>> 0;
  return `hsl(${hash % 360} 65% 79%)`;
}
export function WordCloud({ words }: { words: Word[] }) {
  const placed = useMemo(() => {
    const canvas = typeof document !== 'undefined' ? document.createElement('canvas') : null;
    const context = canvas?.getContext('2d');
    return layoutWords(
      words,
      context
        ? (text, size) => {
            context.font = `600 ${size}px Arial`;
            return context.measureText(text).width;
          }
        : undefined,
    );
  }, [words]);
  return (
    <div className="cloud-wrap">
      {!words.length ? (
        <div className="cloud-empty">
          <span className="orbit" aria-hidden="true" />
          <p>Ваши мысли создают общую картину</p>
          <small>Отсканируйте код — первый ответ появится здесь</small>
        </div>
      ) : (
        <svg
          className="cloud"
          viewBox="0 0 1120 580"
          role="img"
          aria-label={words.map((w) => `${w.text}: ${w.count}`).join('; ')}
        >
          {placed.map((word) => (
            <text
              key={word.text}
              x={word.x}
              y={word.y}
              textAnchor="middle"
              dominantBaseline="central"
              fontSize={word.size}
              fontFamily="Arial"
              fontWeight={600}
              fill={familyColor(word.family || word.text)}
            >
              <title>
                {word.text}: {word.count}
              </title>
              {word.label}
            </text>
          ))}
        </svg>
      )}
      {words.length > placed.length && (
        <p className="cloud-caption">
          Самые частые ответы · показано {placed.length} из {words.length}
          {words.length >= CLOUD_LIMIT ? ' категорий' : ''}. Все голоса учтены.
        </p>
      )}
    </div>
  );
}
