const STOP_WORDS = new Set(['le','la','les','un','une','des','de','du','d','l','a','au','aux','et','en','pour','par','sur','avec','dans']);

export function normalizeLexicalText(text: string) {
  return text.toLocaleLowerCase('fr')
    .replace(/œ/g, 'oe').replace(/æ/g, 'ae')
    .normalize('NFKD').replace(/\p{M}+/gu, '')
    .match(/[\p{L}\p{N}]+/gu)?.join(' ') || '';
}

export function lexicalTokens(text: string) {
  return normalizeLexicalText(text).split(' ')
    .filter(token => token && !STOP_WORDS.has(token))
    .slice(0, 20);
}

export function lexicalPattern(token: string) {
  return `% ${token}%`;
}

export function lexicalPredicate(column: string, tokens: string[]) {
  return {
    sql: tokens.length ? `(${tokens.map(() => `(' ' || ${column}) LIKE ?`).join(' OR ')})` : '0',
    args: tokens.map(lexicalPattern),
  };
}

export function stampSearchText(stamp: { title: string; series: string; description: string; country: string }) {
  return normalizeLexicalText(`${stamp.title} ${stamp.series} ${stamp.description} ${stamp.country}`);
}
