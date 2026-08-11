import React, { useEffect, useState } from 'react';
import { abilityIconUrl, iconInitials, iconTint } from '@game/Combat/ability-icons';
import { AbilityStore } from '@game/Combat/ability-store';
import { useEvent } from '@game/Events/event-hooks';
import './technique-face.css';

/**
 * What a hotbar slot holding a technique looks like.
 *
 * The icon is the ability id, because the generated art is written per id — no mapping
 * table to fall out of step with the content. A slot with no art yet shows its initials
 * over the school colour rather than an empty square, so a half-finished art pass still
 * produces a usable bar.
 *
 * The sweep runs off the store's local deadline rather than a timer per button: one
 * animation frame loop for the whole bar, and it stops as soon as nothing is cooling.
 */
export const TechniqueFace: React.FC<{ slot: number }> = ({ slot }) => {
  const [, setTick] = useState(0);
  const [failed, setFailed] = useState(false);
  const ability = AbilityStore.inSlot(slot);

  // Redraw when the loadout changes or an activation answers.
  useEvent('abilityLoadout', () => setTick((tick) => tick + 1));
  useEvent('abilityResult', () => setTick((tick) => tick + 1));

  const remaining = ability ? ability.readyAtLocalMs - Date.now() : 0;
  // Only whether something is cooling drives the loop; the value itself is read fresh on
  // every frame, so depending on it here would restart the loop each tick.
  const cooling = remaining > 0;

  useEffect(() => {
    if (!cooling) return;
    let frame = 0;
    const step = (): void => {
      setTick((tick) => tick + 1);
      frame = requestAnimationFrame(step);
    };
    frame = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frame);
  }, [cooling]);

  if (!ability) return <span className="rq-technique-face__empty" />;

  const url = failed ? null : abilityIconUrl(ability.abilityId);
  const total = Math.max(ability.cooldownMs, ability.recoveryMs, 1);
  const fraction = Math.max(0, Math.min(1, remaining / total));

  return (
    <span className="rq-technique-face" title={ability.name}>
      {url ? (
        <img
          alt=""
          aria-hidden="true"
          draggable={false}
          src={url}
          onError={() => setFailed(true)}
        />
      ) : (
        <span
          aria-hidden="true"
          className="rq-technique-face__initials"
          style={{ background: iconTint(ability.kind) }}
        >
          {iconInitials(ability.name)}
        </span>
      )}
      {fraction > 0 ? (
        <>
          <span
            aria-hidden="true"
            className="rq-technique-face__sweep"
            style={{ height: `${fraction * 100}%` }}
          />
          <span className="rq-technique-face__timer">
            {remaining >= 10_000
              ? `${Math.ceil(remaining / 1000)}`
              : (remaining / 1000).toFixed(1)}
          </span>
        </>
      ) : null}
    </span>
  );
};
