// File: client/src/Game/Interaction/interaction-registry.ts
//
// What a thing in the world offers when you walk up to it.
//
// The player has two contextual slots rather than one binding per verb. A
// subject declares which action fills each slot, so adding a new interactable
// -- a door, a forge, a signpost -- is a table entry here rather than a new
// keybinding and a new input path.
//
// Pure by design: no Babylon, no config, no sockets, so the rules can be
// tested directly.

/** The two contextual slots a subject can fill. */
export type InteractionSlot = 'primary' | 'secondary';

/** Everything the client knows how to do to a subject. */
export type InteractionActionId =
  | 'hail'
  | 'trade'
  | 'loot'
  | 'open'
  | 'examine';

export interface InteractionAction {
  id: InteractionActionId;
  /** Shown in the floating prompt. Kept to one short word where possible. */
  label: string;
  slot: InteractionSlot;
}

/** Class id the server uses for vendors. */
export const MERCHANT_CLASS_ID = 41;

/**
 * The kinds of thing that can carry a prompt. Entities come from the spawn
 * pool; world objects are the next step and already have a seat here.
 */
export type InteractionSubjectKind = 'npc' | 'corpse' | 'object';

export interface InteractionSubject {
  /** Stable identity, used to keep the prompt attached across frames. */
  id: string;
  kind: InteractionSubjectKind;
  name: string;
  /** Metres from the player. */
  distance: number;
  /** Server class id, for entities. */
  charClass?: number;
  /** Object subtype, for world objects: 'door', 'container', … */
  objectType?: string;
  /** Corpses with nothing on them offer no loot prompt. */
  hasLoot?: boolean;
}

const HAIL: InteractionAction = { id: 'hail', label: 'Hail', slot: 'primary' };
// "Trade" reads better than "Open Merchant" in a floating prompt: it is a
// verb, it fits, and it matches what the player is about to do.
const TRADE: InteractionAction = {
  id: 'trade',
  label: 'Trade',
  slot: 'secondary',
};
const LOOT: InteractionAction = { id: 'loot', label: 'Loot', slot: 'primary' };
const OPEN: InteractionAction = { id: 'open', label: 'Open', slot: 'primary' };
const EXAMINE: InteractionAction = {
  id: 'examine',
  label: 'Examine',
  slot: 'primary',
};

export const isMerchant = (subject: InteractionSubject): boolean =>
  subject.kind === 'npc' && subject.charClass === MERCHANT_CLASS_ID;

/**
 * The actions a subject offers, at most one per slot. Order is primary then
 * secondary, which is the order the prompt renders them.
 */
export const getInteractions = (
  subject: InteractionSubject | null | undefined,
): InteractionAction[] => {
  if (!subject) return [];

  const actions: InteractionAction[] = [];

  switch (subject.kind) {
    case 'npc':
      // Anything alive can be hailed; merchants additionally trade.
      actions.push(HAIL);
      if (isMerchant(subject)) actions.push(TRADE);
      break;

    case 'corpse':
      if (subject.hasLoot !== false) actions.push(LOOT);
      break;

    case 'object':
      if (subject.objectType === 'door' || subject.objectType === 'container') {
        actions.push(OPEN);
      } else {
        actions.push(EXAMINE);
      }
      break;

    default:
      break;
  }

  // One action per slot, primary first, and never more than two.
  const bySlot = new Map<InteractionSlot, InteractionAction>();
  for (const action of actions) {
    if (!bySlot.has(action.slot)) bySlot.set(action.slot, action);
  }
  return (['primary', 'secondary'] as const)
    .map((slot) => bySlot.get(slot))
    .filter((action): action is InteractionAction => Boolean(action));
};

/** True when a subject is worth showing a prompt for at all. */
export const isInteractable = (
  subject: InteractionSubject | null | undefined,
): boolean => getInteractions(subject).length > 0;
