const normalizeInstruction = (value: unknown) =>
  String(value ?? "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[\u2019']/g, " ")
    .toLowerCase()
    .replace(/\s+/g, " ");

export function prohibitsTaskCreation(value: unknown): boolean {
  const text = normalizeInstruction(value);
  if (!text.trim()) return false;

  const english =
    /\b(?:do not|dont|without)\s+(?:create|creating|make|making|add|adding|open|opening)\b[^.!?\n]{0,120}\btasks?\b/i;
  const englishNoTask = /\b(?:create|make|add|open)\s+no\b[^.!?\n]{0,40}\btasks?\b/i;
  const french =
    /\bne\s+(?:cree|creer|creez|ajoute|ajouter|ajoutez|ouvre|ouvrir|ouvrez)\s+(?:pas|aucun|aucune)\b[^.!?\n]{0,120}\btaches?\b/i;
  const frenchPast =
    /\bn\s+(?:as|avez)\s+(?:cree|ajoute|ouvert)\s+(?:pas|aucun|aucune)\b[^.!?\n]{0,120}\btaches?\b/i;
  const frenchWithout =
    /\bsans\s+(?:creer|ajouter|ouvrir)\b[^.!?\n]{0,120}\btaches?\b/i;
  return (
    english.test(text) ||
    englishNoTask.test(text) ||
    french.test(text) ||
    frenchPast.test(text) ||
    frenchWithout.test(text)
  );
}
