export function normalizeWord(text: string): string {
  return text
    .normalize('NFC')
    .trim()
    .replace(/\s+/gu, ' ')
    .toLocaleLowerCase('ru-RU')
    .replace(/ё/gu, 'е');
}
