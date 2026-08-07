/**
 * Conversational helpers for authored dialogue.
 *
 * The fun of an EQ-style quest is realizing *what* to ask about, never guessing whether
 * the script wants "patrol", "the patrol" or "missing patrol". Intent stays deterministic
 * and code-owned — no model decides whether a condition was satisfied — while the phrasing
 * the player uses is treated generously.
 */

export interface QuestTopic {
  readonly key: string;
  readonly phrases: readonly string[];
}

export interface QuestTopicOptions {
  readonly aliases?: readonly string[];
  /** Offered as a clickable response; defaults to the topic key. */
  readonly label?: string;
}

const STOP_WORDS = new Set([
  "a", "an", "the", "my", "your", "about", "of", "to", "for", "please", "tell", "me",
  "what", "whats", "who", "whos", "where", "wheres", "is", "are", "do", "does", "you",
  "i", "know", "anything", "something", "on", "in", "at", "and",
]);

export function normalizePhrase(text: string): string {
  return text
    .toLowerCase()
    .replaceAll("_", " ")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Word-level normalization: drops filler and a trailing plural/possessive. */
function tokens(text: string): string[] {
  return normalizePhrase(text)
    .split(" ")
    .filter((word) => word.length > 0 && !STOP_WORDS.has(word))
    .map((word) => (word.length > 3 && word.endsWith("s") ? word.slice(0, -1) : word));
}

export function topic(key: string, options: QuestTopicOptions = {}): QuestTopic {
  return { key, phrases: [key, ...(options.aliases ?? [])] };
}

/** True when the message plausibly asks about any of the phrases. */
export function mentions(message: string, ...phrases: readonly string[]): boolean {
  const said = tokens(message);
  if (said.length === 0) return false;
  const haystack = ` ${said.join(" ")} `;
  return phrases.some((phrase) => {
    const wanted = tokens(phrase);
    if (wanted.length === 0) return false;
    // Multi-word phrases must appear together; single words may appear anywhere.
    return wanted.length === 1
      ? haystack.includes(` ${wanted[0]} `)
      : haystack.includes(` ${wanted.join(" ")} `);
  });
}

export function mentionsTopic(message: string, subject: QuestTopic): boolean {
  return mentions(message, ...subject.phrases);
}

export function isHail(message: string): boolean {
  const said = normalizePhrase(message);
  return said.startsWith("hail") || said === "hello" || said === "greetings";
}

const DIALOGUE_LINK_TYPE = 2;

/**
 * Renders a phrase the NPC actually offered as a clickable response. Typing it still
 * works; only offered phrases become links, so the client never shows a dialogue wheel
 * of branches the player has not discovered.
 */
export function say(phrase: string, label = phrase): string {
  const payload = JSON.stringify({
    linkType: DIALOGUE_LINK_TYPE,
    label,
    data: phrase,
  });
  return `{{${Buffer.from(payload, "utf8").toString("base64")}}}`;
}
