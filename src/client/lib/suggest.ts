/** Lower case and strip combining marks, so "Ö" matches "o". */
export function fold(s: string): string {
  return s.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();
}

/** Names that contain the typed text (case and diacritics ignored), in the given order. Hints only. */
export function suggest(names: readonly string[], text: string, limit = 8): string[] {
  const needle = fold(text.trim());
  return names.filter((name) => fold(name).includes(needle)).slice(0, limit);
}
