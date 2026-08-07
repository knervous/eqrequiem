// File: client/src/Game/Interaction/interaction-focus.ts
//
// Picks the one subject that gets a prompt. Pure, so the selection rules can
// be tested without a scene.
import {
  getInteractions,
  type InteractionAction,
  type InteractionSubject,
} from './interaction-registry';

/** Beyond this the prompt is noise rather than help. */
export const DEFAULT_FOCUS_RANGE = 18;

/**
 * Once something is focused it keeps the prompt until a rival is meaningfully
 * closer. Without this the prompt flickers between two entities standing near
 * each other.
 */
export const FOCUS_HYSTERESIS = 2;

export interface InteractionFocus {
  subject: InteractionSubject;
  actions: InteractionAction[];
}

export interface FocusOptions {
  /** Metres. Subjects further than this are ignored. */
  range?: number;
  /**
   * Prompts are hidden in combat: the player has other things to read, and a
   * hail prompt over something hitting them is worse than nothing.
   */
  inCombat?: boolean;
  /** The currently focused subject id, for hysteresis. */
  currentId?: string | null;
}

/**
 * Chooses the nearest interactable subject, biased toward whatever is already
 * focused so the prompt does not flicker.
 */
export const selectFocus = (
  subjects: readonly InteractionSubject[],
  options: FocusOptions = {},
): InteractionFocus | null => {
  if (options.inCombat) return null;

  const range = options.range ?? DEFAULT_FOCUS_RANGE;
  const candidates = subjects
    .filter((subject) => subject.distance <= range)
    .map((subject) => ({ subject, actions: getInteractions(subject) }))
    .filter((entry) => entry.actions.length > 0);

  if (candidates.length === 0) return null;

  let best = candidates[0];
  for (const candidate of candidates) {
    if (candidate.subject.distance < best.subject.distance) best = candidate;
  }

  // Keep the incumbent unless the newcomer is clearly closer.
  const incumbent = options.currentId
    ? candidates.find((entry) => entry.subject.id === options.currentId)
    : undefined;
  if (
    incumbent &&
    incumbent.subject.distance - best.subject.distance < FOCUS_HYSTERESIS
  ) {
    return incumbent;
  }

  return best;
};

/**
 * The prompt text for a focused subject, e.g. `[X] Hail   [Y] Trade`.
 * `glyphFor` supplies the key or button label for a slot, so the same builder
 * serves keyboard and controller.
 */
export const buildPromptText = (
  focus: InteractionFocus | null,
  glyphFor: (action: InteractionAction) => string | null,
): string => {
  if (!focus) return '';
  return focus.actions
    .map((action) => {
      const glyph = glyphFor(action);
      return glyph ? `[${glyph}] ${action.label}` : action.label;
    })
    .join('   ');
};
