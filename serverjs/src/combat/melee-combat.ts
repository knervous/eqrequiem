import {
  EntityKind,
  type Entity,
  type EntityStore,
  NPC,
} from "../zone/entity-store.js";

export interface MeleeCombatRules {
  readonly baseHitChancePermille: number;
  readonly scoreDeltaPermille: number;
  readonly minimumHitChancePermille: number;
  readonly maximumHitChancePermille: number;
  readonly strengthDamageBaseline: number;
  readonly strengthDamageDivisor: number;
  readonly levelDamageDivisor: number;
  readonly minimumVariancePermille: number;
  readonly maximumVariancePermille: number;
  readonly armorMitigationScale: number;
  readonly unarmedDamage: number;
  readonly unarmedDelayMs: number;
  readonly minimumDelayMs: number;
  readonly baseMaximumHp: number;
  readonly maximumHpPerLevel: number;
  readonly staminaHpDivisor: number;
  readonly meleeRangePadding: number;
  readonly maximumVerticalMeleeSeparation: number;
}

export const DEFAULT_MELEE_COMBAT_RULES: MeleeCombatRules = Object.freeze({
  baseHitChancePermille: 700,
  scoreDeltaPermille: 2,
  minimumHitChancePermille: 50,
  maximumHitChancePermille: 950,
  strengthDamageBaseline: 75,
  strengthDamageDivisor: 15,
  levelDamageDivisor: 5,
  minimumVariancePermille: 800,
  maximumVariancePermille: 1200,
  armorMitigationScale: 400,
  unarmedDamage: 2,
  unarmedDelayMs: 2_500,
  minimumDelayMs: 500,
  baseMaximumHp: 20,
  maximumHpPerLevel: 5,
  staminaHpDivisor: 10,
  meleeRangePadding: 3,
  maximumVerticalMeleeSeparation: 12,
});

export interface CombatantStats {
  readonly level: number;
  readonly strength: number;
  readonly stamina: number;
  readonly dexterity: number;
  readonly agility: number;
  readonly offense: number;
  readonly defense: number;
  readonly armorClass: number;
  readonly maximumHp: number;
  readonly weaponDamage: number;
  readonly attackDelayMs: number;
  readonly haste: number;
  readonly meleeRange: number;
}

export interface MeleeResolution {
  readonly hit: boolean;
  readonly hitChancePermille: number;
  readonly rawDamage: number;
  readonly damage: number;
}

export type CombatEventOutcome =
  | "started"
  | "stopped"
  | "hit"
  | "miss"
  | "out-of-range"
  | "invalid-target";

export interface CombatEvent {
  readonly tick: number;
  readonly attackerId: number;
  readonly targetId: number;
  readonly outcome: CombatEventOutcome;
  readonly swingSequence: number;
  readonly damage: number;
  readonly targetCurrentHp: number;
  readonly targetMaximumHp: number;
  readonly killed: boolean;
}

export function deriveMaximumHp(
  level: number,
  stamina: number,
  bonusHp = 0,
  rules: MeleeCombatRules = DEFAULT_MELEE_COMBAT_RULES,
): number {
  const safeLevel = Math.max(1, Math.trunc(level));
  const staminaPerLevel = Math.floor(
    Math.max(0, Math.trunc(stamina)) / rules.staminaHpDivisor,
  );
  return Math.max(
    1,
    rules.baseMaximumHp
      + safeLevel * (rules.maximumHpPerLevel + staminaPerLevel)
      + Math.trunc(bonusHp),
  );
}

export function resolveMeleeSwing(
  attacker: CombatantStats,
  defender: CombatantStats,
  hitSamplePermille: number,
  varianceSamplePermille: number,
  rules: MeleeCombatRules = DEFAULT_MELEE_COMBAT_RULES,
): MeleeResolution {
  const attackScore =
    attacker.offense
    + attacker.level * 5
    + Math.floor(attacker.dexterity / 4);
  const defenseScore =
    defender.defense
    + defender.level * 5
    + Math.floor(defender.agility / 4);
  const hitChancePermille = clamp(
    rules.baseHitChancePermille
      + (attackScore - defenseScore) * rules.scoreDeltaPermille,
    rules.minimumHitChancePermille,
    rules.maximumHitChancePermille,
  );
  if (hitSamplePermille >= hitChancePermille) {
    return { hit: false, hitChancePermille, rawDamage: 0, damage: 0 };
  }

  const weaponDamage = Math.max(
    rules.unarmedDamage,
    Math.trunc(attacker.weaponDamage),
  );
  const strengthBonus = Math.floor(
    Math.max(0, attacker.strength - rules.strengthDamageBaseline)
      / rules.strengthDamageDivisor,
  );
  const levelBonus = Math.floor(attacker.level / rules.levelDamageDivisor);
  const baseDamage = Math.max(1, weaponDamage + strengthBonus + levelBonus);
  const variancePermille = clamp(
    varianceSamplePermille,
    rules.minimumVariancePermille,
    rules.maximumVariancePermille,
  );
  const rawDamage = Math.max(
    1,
    Math.floor(baseDamage * variancePermille / 1_000),
  );
  const armor = Math.max(0, Math.trunc(defender.armorClass));
  const damage = Math.max(
    1,
    Math.floor(
      rawDamage * rules.armorMitigationScale
        / (rules.armorMitigationScale + armor),
    ),
  );
  return { hit: true, hitChancePermille, rawDamage, damage };
}

/**
 * Component-local authoritative melee state. It is transport-neutral and is
 * shared by the Node zone worker and offline embedded zone runtime.
 */
export class MeleeCombatSystem {
  private readonly profiles: Array<CombatantStats | undefined>;
  private readonly enabled: Uint8Array;
  private readonly targetIds: Uint32Array;
  private readonly nextSwingTicks: Uint32Array;
  private readonly swingSequences: Uint32Array;
  private readonly tickRateHz: number;

  constructor(
    private readonly entities: EntityStore,
    tickRateHz: number,
    private readonly rules: MeleeCombatRules = DEFAULT_MELEE_COMBAT_RULES,
  ) {
    if (!Number.isFinite(tickRateHz) || tickRateHz <= 0) {
      throw new RangeError("Melee tick rate must be positive");
    }
    this.tickRateHz = tickRateHz;
    this.profiles = Array.from({ length: entities.capacity }, () => undefined);
    this.enabled = new Uint8Array(entities.capacity);
    this.targetIds = new Uint32Array(entities.capacity);
    this.nextSwingTicks = new Uint32Array(entities.capacity);
    this.swingSequences = new Uint32Array(entities.capacity);
  }

  register(entity: Entity, stats: CombatantStats): void {
    const normalized = normalizeStats(stats, this.rules);
    this.profiles[entity.index] = normalized;
    entity.maximumHp = normalized.maximumHp;
    entity.currentHp = normalized.maximumHp;
    this.enabled[entity.index] = 0;
    this.targetIds[entity.index] = 0;
    this.nextSwingTicks[entity.index] = 0;
    this.swingSequences[entity.index] = 0;
  }

  setAutoAttack(
    attackerId: number,
    targetId: number,
    value: boolean,
    currentTick: number,
  ): CombatEvent {
    const attacker = this.entities.get(attackerId);
    if (!attacker || !this.profiles[attacker.index]) {
      return this.controlEvent(
        currentTick,
        attackerId,
        targetId,
        "invalid-target",
      );
    }
    if (!value) {
      this.enabled[attacker.index] = 0;
      this.targetIds[attacker.index] = 0;
      return this.controlEvent(currentTick, attackerId, targetId, "stopped");
    }

    const target = this.validTarget(attacker, targetId);
    if (!target) {
      this.enabled[attacker.index] = 0;
      this.targetIds[attacker.index] = 0;
      return this.controlEvent(
        currentTick,
        attackerId,
        targetId,
        "invalid-target",
      );
    }
    this.enabled[attacker.index] = 1;
    this.targetIds[attacker.index] = target.id;
    this.nextSwingTicks[attacker.index] = currentTick >>> 0;
    return this.controlEvent(currentTick, attackerId, target.id, "started");
  }

  tick(currentTick: number): CombatEvent[] {
    const events: CombatEvent[] = [];
    for (let index = 0; index < this.entities.count; index++) {
      if (!this.enabled[index] || currentTick < this.nextSwingTicks[index]!) {
        continue;
      }
      const attacker = this.entities.at(index);
      const attackerStats = this.profiles[index];
      if (!attacker || !attackerStats || attacker.currentHp <= 0) {
        this.enabled[index] = 0;
        continue;
      }

      const targetId = this.targetIds[index]!;
      const target = this.validTarget(attacker, targetId);
      const sequence = (this.swingSequences[index]! + 1) >>> 0;
      this.swingSequences[index] = sequence;
      this.nextSwingTicks[index] =
        (currentTick + this.attackDelayTicks(attackerStats)) >>> 0;

      if (!target) {
        this.enabled[index] = 0;
        events.push(this.event(
          currentTick,
          attacker,
          targetId,
          "invalid-target",
          sequence,
        ));
        continue;
      }

      const targetStats = this.profiles[target.index];
      if (!targetStats) {
        this.enabled[index] = 0;
        events.push(this.event(
          currentTick,
          attacker,
          target.id,
          "invalid-target",
          sequence,
        ));
        continue;
      }

      if (!isWithinMeleeRange(
        attacker,
        target,
        Math.max(attackerStats.meleeRange, targetStats.meleeRange),
        this.rules,
      )) {
        events.push(this.event(
          currentTick,
          attacker,
          target.id,
          "out-of-range",
          sequence,
        ));
        continue;
      }

      const result = resolveMeleeSwing(
        attackerStats,
        targetStats,
        samplePermille(attacker.id, target.id, sequence, 0),
        sampleRange(
          attacker.id,
          target.id,
          sequence,
          1,
          this.rules.minimumVariancePermille,
          this.rules.maximumVariancePermille,
        ),
        this.rules,
      );
      if (!result.hit) {
        events.push(this.event(
          currentTick,
          attacker,
          target.id,
          "miss",
          sequence,
        ));
        continue;
      }

      target.currentHp = Math.max(0, target.currentHp - result.damage);
      const killed = target.currentHp === 0;
      if (killed) {
        this.clearEngagement(target.id);
        if (target instanceof NPC) {
          target.moveSpeed = 0;
          target.target.set(target.position.x, target.position.y, target.position.z);
        }
      } else if (
        attacker.kind === EntityKind.pc
        && target.kind === EntityKind.npc
      ) {
        this.enabled[target.index] = 1;
        this.targetIds[target.index] = attacker.id;
        this.nextSwingTicks[target.index] = currentTick >>> 0;
        if (target instanceof NPC) target.aggroTargetId = attacker.id;
      }
      events.push(this.event(
        currentTick,
        attacker,
        target.id,
        "hit",
        sequence,
        result.damage,
        killed,
      ));
    }
    return events;
  }

  clearEngagement(entityId: number): void {
    const entity = this.entities.get(entityId);
    for (let index = 0; index < this.entities.count; index++) {
      if (
        index === entity?.index
        || this.targetIds[index] === (entityId >>> 0)
      ) {
        this.enabled[index] = 0;
        this.targetIds[index] = 0;
        this.nextSwingTicks[index] = 0;
        const combatant = this.entities.at(index);
        if (combatant instanceof NPC) combatant.aggroTargetId = 0;
      }
    }
  }

  respawn(entityId: number): void {
    const entity = this.entities.get(entityId);
    if (!entity) return;
    this.clearEngagement(entityId);
    entity.currentHp = entity.maximumHp;
  }

  engageNpcTarget(
    npcId: number,
    targetId: number,
    currentTick: number,
  ): boolean {
    const npc = this.entities.get(npcId);
    if (!(npc instanceof NPC) || !this.validTarget(npc, targetId)) return false;
    const wasEnabled = this.enabled[npc.index] !== 0;
    const targetChanged = this.targetIds[npc.index] !== (targetId >>> 0);
    this.enabled[npc.index] = 1;
    this.targetIds[npc.index] = targetId >>> 0;
    if (!wasEnabled) this.nextSwingTicks[npc.index] = currentTick >>> 0;
    if (targetChanged) npc.aggroTargetId = targetId;
    return true;
  }

  stopNpcCombat(npcId: number): void {
    const npc = this.entities.get(npcId);
    if (!(npc instanceof NPC)) return;
    this.enabled[npc.index] = 0;
    this.targetIds[npc.index] = 0;
    this.nextSwingTicks[npc.index] = 0;
    npc.aggroTargetId = 0;
  }

  isWithinMeleeReach(attackerId: number, targetId: number): boolean {
    const attacker = this.entities.get(attackerId);
    const target = this.entities.get(targetId);
    if (!attacker || !target) return false;
    const attackerStats = this.profiles[attacker.index];
    const targetStats = this.profiles[target.index];
    if (!attackerStats || !targetStats) return false;
    return isWithinMeleeRange(
      attacker,
      target,
      Math.max(attackerStats.meleeRange, targetStats.meleeRange),
      this.rules,
    );
  }

  private validTarget(attacker: Entity, targetId: number): Entity | null {
    const target = this.entities.get(targetId);
    if (
      !target
      || target === attacker
      || target.currentHp <= 0
      || (
        attacker.kind === EntityKind.pc
          ? target.kind !== EntityKind.npc
          : attacker.kind === EntityKind.npc
            ? target.kind !== EntityKind.pc
            : true
      )
    ) {
      return null;
    }
    return target;
  }

  private attackDelayTicks(stats: CombatantStats): number {
    const baseDelay = Math.max(this.rules.minimumDelayMs, stats.attackDelayMs);
    const effectiveDelay = Math.max(
      this.rules.minimumDelayMs,
      Math.floor(baseDelay * 100 / Math.max(1, 100 + stats.haste)),
    );
    return Math.max(1, Math.ceil(effectiveDelay * this.tickRateHz / 1_000));
  }

  private controlEvent(
    tick: number,
    attackerId: number,
    targetId: number,
    outcome: CombatEventOutcome,
  ): CombatEvent {
    const target = this.entities.get(targetId);
    return {
      tick,
      attackerId,
      targetId,
      outcome,
      swingSequence: 0,
      damage: 0,
      targetCurrentHp: target?.currentHp ?? 0,
      targetMaximumHp: target?.maximumHp ?? 0,
      killed: false,
    };
  }

  private event(
    tick: number,
    attacker: Entity,
    targetId: number,
    outcome: CombatEventOutcome,
    swingSequence: number,
    damage = 0,
    killed = false,
  ): CombatEvent {
    const target = this.entities.get(targetId);
    return {
      tick,
      attackerId: attacker.id,
      targetId,
      outcome,
      swingSequence,
      damage,
      targetCurrentHp: target?.currentHp ?? 0,
      targetMaximumHp: target?.maximumHp ?? 0,
      killed,
    };
  }
}

function normalizeStats(
  stats: CombatantStats,
  rules: MeleeCombatRules,
): CombatantStats {
  return {
    level: Math.max(1, Math.trunc(stats.level)),
    strength: Math.max(0, Math.trunc(stats.strength)),
    stamina: Math.max(0, Math.trunc(stats.stamina)),
    dexterity: Math.max(0, Math.trunc(stats.dexterity)),
    agility: Math.max(0, Math.trunc(stats.agility)),
    offense: Math.max(0, Math.trunc(stats.offense)),
    defense: Math.max(0, Math.trunc(stats.defense)),
    armorClass: Math.max(0, Math.trunc(stats.armorClass)),
    maximumHp: Math.max(1, Math.trunc(stats.maximumHp)),
    weaponDamage: Math.max(rules.unarmedDamage, Math.trunc(stats.weaponDamage)),
    attackDelayMs: Math.max(rules.minimumDelayMs, Math.trunc(stats.attackDelayMs)),
    haste: Math.max(-99, Math.trunc(stats.haste)),
    meleeRange: Math.max(0.1, stats.meleeRange),
  };
}

function isWithinMeleeRange(
  left: Entity,
  right: Entity,
  reach: number,
  rules: MeleeCombatRules,
): boolean {
  const dx = left.position.x - right.position.x;
  const dy = left.position.y - right.position.y;
  const dz = left.position.z - right.position.z;
  const horizontalReach =
    Math.max(0.1, reach) + Math.max(0, rules.meleeRangePadding);
  return (
    Math.abs(dy) <= Math.max(0, rules.maximumVerticalMeleeSeparation)
    && dx * dx + dz * dz <= horizontalReach * horizontalReach
  );
}

function samplePermille(
  attackerId: number,
  targetId: number,
  sequence: number,
  channel: number,
): number {
  return hash(attackerId, targetId, sequence, channel) % 1_000;
}

function sampleRange(
  attackerId: number,
  targetId: number,
  sequence: number,
  channel: number,
  minimum: number,
  maximum: number,
): number {
  const span = Math.max(1, maximum - minimum + 1);
  return minimum + hash(attackerId, targetId, sequence, channel) % span;
}

function hash(
  attackerId: number,
  targetId: number,
  sequence: number,
  channel: number,
): number {
  let value =
    (attackerId >>> 0)
    ^ Math.imul(targetId >>> 0, 0x9e37_79b1)
    ^ Math.imul(sequence >>> 0, 0x85eb_ca6b)
    ^ Math.imul(channel >>> 0, 0xc2b2_ae35);
  value = Math.imul(value ^ (value >>> 16), 0x7feb_352d);
  value = Math.imul(value ^ (value >>> 15), 0x846c_a68b);
  return (value ^ (value >>> 16)) >>> 0;
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.max(minimum, Math.min(maximum, value));
}
