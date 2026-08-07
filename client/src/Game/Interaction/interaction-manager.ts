// File: client/src/Game/Interaction/interaction-manager.ts
import { CommandHandler } from '@game/ChatCommands/command-handler';
import { UserConfig } from '@game/Config/config';
import {
  INTERACT_SLOT_BINDINGS,
  presentGamepadBindingShort,
} from '@game/Config/gamepad-bindings';
import emitter from '@game/Events/events';
import type { Entity } from '@game/Model/entity';
import type Player from '@game/Player/player';
import {
  buildPromptText,
  selectFocus,
  type InteractionFocus,
} from './interaction-focus';
import {
  type InteractionAction,
  type InteractionSubject,
} from './interaction-registry';

/** Prompts refresh a few times a second; every frame is wasted work. */
const REFRESH_INTERVAL_MS = 120;

/**
 * Watches the entities around the player and publishes a single contextual
 * prompt for the nearest interactable one.
 *
 * Selection and action rules live in the pure modules next door; this class
 * owns the sampling, the glyph lookup and the dispatch.
 */
export class InteractionManager {
  private player: Player;
  private focus: InteractionFocus | null = null;
  private lastRefreshAt = 0;

  constructor(player: Player) {
    this.player = player;
  }

  public dispose() {
    this.setFocus(null);
    this.player = null as any;
  }

  /** The subject currently carrying a prompt, if any. */
  public get currentFocus(): InteractionFocus | null {
    return this.focus;
  }

  /** Prompt text for the focused subject, or an empty string. */
  public get promptText(): string {
    return buildPromptText(this.focus, (action) => this.glyphFor(action));
  }

  /** The spawn id the prompt should float above. */
  public get focusedSpawnId(): number | null {
    const id = this.focus?.subject.id;
    if (!id) return null;
    const parsed = Number(id);
    return Number.isFinite(parsed) ? parsed : null;
  }

  /**
   * True while the player should not see prompts. Per-NPC hate is not in the
   * render snapshot, so this uses the player's own combat state as the proxy.
   */
  private get inCombat(): boolean {
    return Boolean(this.player.playerCombat?.AutoAttacking);
  }

  private glyphFor(action: InteractionAction): string | null {
    const config = UserConfig.instance.getConfig();
    const slotAction = INTERACT_SLOT_BINDINGS[action.slot];

    // Show controller glyphs whenever a pad is driving, and keys otherwise.
    if (this.player.playerGamepad?.activeGamepad) {
      const binding = config.gamepadBindings[slotAction];
      return binding ? presentGamepadBindingShort(binding) : null;
    }
    const key = config.keyBindings[slotAction];
    return key || null;
  }

  /** Builds the subject list from the live entity pool. */
  private collectSubjects(): InteractionSubject[] {
    const entities =
      this.player.gameManager.ZoneManager?.EntityPool?.entities ?? {};
    const me = this.player.playerEntity;
    const origin = this.player.getPlayerPosition();
    if (!origin) return [];

    const subjects: InteractionSubject[] = [];
    for (const entity of Object.values(entities) as Entity[]) {
      if (!entity || entity === me || entity.hidden) continue;
      const spawn = entity.spawn as {
        spawnId?: number;
        name?: string;
        isNpc?: boolean;
        isCorpse?: boolean;
        charClass?: number;
      };
      if (!spawn?.isNpc) continue;

      const position = entity.spawnPosition;
      if (!position) continue;
      const distance = Math.hypot(
        position.x - origin.x,
        position.y - origin.y,
        position.z - origin.z,
      );

      subjects.push({
        id: String(spawn.spawnId ?? ''),
        kind: spawn.isCorpse ? 'corpse' : 'npc',
        name: (spawn.name ?? '').replaceAll('_', ' '),
        distance,
        charClass: spawn.charClass,
      });
    }
    return subjects;
  }

  public tick() {
    const now = performance.now();
    if (now - this.lastRefreshAt < REFRESH_INTERVAL_MS) return;
    this.lastRefreshAt = now;

    if (!UserConfig.instance.getConfig().ui.interactionPrompts) {
      this.setFocus(null);
      return;
    }

    const next = selectFocus(this.collectSubjects(), {
      inCombat: this.inCombat,
      currentId: this.focus?.subject.id ?? null,
    });
    this.setFocus(next);
  }

  private setFocus(next: InteractionFocus | null) {
    const changed =
      next?.subject.id !== this.focus?.subject.id ||
      next?.actions.length !== this.focus?.actions.length;
    this.focus = next;
    if (changed) emitter.emit('interactionPrompt', this.promptText || null);
  }

  /**
   * Runs the action in a slot against the focused subject. Returns true when
   * something was handled, so the caller can suppress the generic binding.
   */
  public trigger(slot: 'primary' | 'secondary'): boolean {
    const action = this.focus?.actions.find((entry) => entry.slot === slot);
    const subject = this.focus?.subject;
    if (!action || !subject) return false;

    const entity = this.entityFor(subject.id);
    switch (action.id) {
      case 'hail':
        if (entity) this.player.Target = entity;
        CommandHandler.instance().commandHail();
        return true;
      case 'trade':
        if (entity) this.player.Target = entity;
        void this.player.playerMerchant.openTarget();
        return true;
      case 'loot':
        if (entity) this.player.Target = entity;
        void this.player.playerCombat.lootTarget();
        return true;
      default:
        return false;
    }
  }

  private entityFor(id: string): Entity | null {
    const entities =
      this.player.gameManager.ZoneManager?.EntityPool?.entities ?? {};
    return (entities as Record<string, Entity>)[id] ?? null;
  }
}
