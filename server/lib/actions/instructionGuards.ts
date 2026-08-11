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
  const englishNoAction =
    /\b(?:do not|dont|without)\s+(?:perform|performing|take|taking|execute|executing|trigger|triggering)\b[^.!?\n]{0,80}\b(?:any\s+)?actions?\b/i;
  const englishNoSideEffect =
    /\b(?:take|perform|execute|trigger)\s+no\b[^.!?\n]{0,40}\bactions?\b/i;
  const frenchNoAction =
    /\bn\s+(?:effectue|effectuer|execute|executer|declenche|declencher)\s+(?:pas|aucun|aucune)\b[^.!?\n]{0,80}\bactions?\b/i;
  const frenchNoContact =
    /\bne\s+(?:contacte|contacter|contactez)\s+(?:pas|personne|aucun|aucune)\b/i;
  const frenchWithoutAction =
    /\bsans\s+(?:effectuer|executer|declencher)\b[^.!?\n]{0,80}\bactions?\b/i;
  return (
    english.test(text) ||
    englishNoTask.test(text) ||
    french.test(text) ||
    frenchPast.test(text) ||
    frenchWithout.test(text) ||
    englishNoAction.test(text) ||
    englishNoSideEffect.test(text) ||
    frenchNoAction.test(text) ||
    frenchNoContact.test(text) ||
    frenchWithoutAction.test(text)
  );
}
