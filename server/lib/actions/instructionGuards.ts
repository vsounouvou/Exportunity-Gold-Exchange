const normalizeInstruction = (value: unknown) =>
  String(value ?? "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();

export function prohibitsTaskCreation(value: unknown): boolean {
  const text = normalizeInstruction(value);
  if (!text.trim()) return false;

  const english = /\b(?:do not|don't|dont)\s+(?:create|make|add|open)\b[^.!?\n]{0,120}\btasks?\b/i;
  const french = /\bne\s+(?:cree|creer|ajoute|ajouter|ouvre|ouvrir)\s+pas\b[^.!?\n]{0,120}\btaches?\b/i;
  return english.test(text) || french.test(text);
}
