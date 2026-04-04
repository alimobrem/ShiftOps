const QUESTION_WORDS = new Set([
  'what', 'why', 'how', 'show', 'find', 'list', 'which',
  'is', 'are', 'can', 'tell', 'where', 'when', 'do', 'does',
]);

const NL_PATTERNS = [
  'my pods', 'my deployments', 'my nodes',
  'over-provisioned', 'under-provisioned',
  'failing', 'crashed', 'crashloop', 'not ready',
  'high cpu', 'high memory', 'out of memory', 'oom',
  'disk pressure', 'node pressure',
];

/** Returns true if the query looks like a natural language question rather than a resource name. */
export function detectNaturalLanguage(query: string): boolean {
  const trimmed = query.trim();
  if (!trimmed) return false;

  // Contains a question mark
  if (trimmed.includes('?')) return true;

  const words = trimmed.toLowerCase().split(/\s+/);

  // Starts with a question/command word
  if (QUESTION_WORDS.has(words[0])) return true;

  // 4+ words likely means a sentence
  if (words.length >= 4) return true;

  // Matches known NL patterns
  const lower = trimmed.toLowerCase();
  if (NL_PATTERNS.some((p) => lower.includes(p))) return true;

  return false;
}

const HISTORY_KEY = 'openshiftpulse-ask-history';
const MAX_HISTORY = 5;

/** Returns the last 5 Ask Pulse queries from localStorage. */
export function getRecentQueries(): string[] {
  try {
    const stored = localStorage.getItem(HISTORY_KEY);
    if (!stored) return [];
    return JSON.parse(stored) as string[];
  } catch {
    return [];
  }
}

/** Saves a query to the Ask Pulse history (deduped, max 5). */
export function saveQuery(query: string): void {
  try {
    const history = getRecentQueries().filter((q) => q !== query);
    const updated = [query, ...history].slice(0, MAX_HISTORY);
    localStorage.setItem(HISTORY_KEY, JSON.stringify(updated));
  } catch {
    // Ignore storage errors
  }
}
