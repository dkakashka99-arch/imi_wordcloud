'use client';
import { useMemo } from 'react';
import { layoutWords, CLOUD_LIMIT } from '@/lib/layout';
import type { Word } from '@/lib/contracts';
const colors = ['#e6edff', '#a6b8ff', '#81dbd0', '#bdd4ff'];
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
          {placed.map((word, i) => (
            <text
              key={word.text}
              x={word.x}
              y={word.y}
              textAnchor="middle"
              dominantBaseline="central"
              fontSize={word.size}
              fontFamily="Arial"
              fontWeight={600}
              fill={colors[i % colors.length]}
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
