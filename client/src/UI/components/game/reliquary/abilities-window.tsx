import React, { useEffect, useMemo, useState } from 'react';
import { abilityIconUrl, iconInitials, iconTint } from '@game/Combat/ability-icons';
import {
  ProgressionStore,
  progressionRequests,
} from '@game/Combat/progression-store';
import emitter from '@game/Events/events';
import { useEventState } from '@game/Events/event-hooks';
import {
  ActivateAbility,
  ProgressionRequest,
  type ProgressionAbility,
  type ProgressionRequestBody,
  type ProgressionState,
} from '@game/Net/messages';
import { OpCodes } from '@game/Net/opcodes';
import Player from '@game/Player/player';
import { WorldSocket } from '@ui/net/instances';
import { ActionButtonType, type FullActionData } from '../action-button/constants';
import { useImmediateDragClone } from '../action-button/hooks';
import { useDrag } from '../../../hooks/use-drag';
import './reliquary.css';

const send = (request: ProgressionRequestBody): void => {
  WorldSocket.sendMessage(OpCodes.ProgressionRequest, ProgressionRequest, { request });
};

export const AbilityIcon: React.FC<{
  id: string;
  name: string;
  kind: string;
  school?: string | null;
  size?: number;
}> = ({ id, name, kind, school, size = 32 }) => {
  const url = abilityIconUrl(id);
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [id]);
  const tint = iconTint(kind, school);

  if (!url || failed) {
    return (
      <span
        aria-hidden="true"
        className="rq-technique-icon rq-technique-icon--fallback"
        style={{ background: tint, height: size, width: size }}
      >
        {iconInitials(name)}
      </span>
    );
  }
  return (
    <img
      alt=""
      aria-hidden="true"
      className="rq-technique-icon"
      draggable={false}
      height={size}
      src={url}
      width={size}
      onError={() => setFailed(true)}
    />
  );
};

const GrimoireSpellItem: React.FC<{
  ability: ProgressionAbility;
  slot: number | null;
}> = ({ ability, slot }) => {
  const actionData: FullActionData = useMemo(
    () => ({
      type: ActionButtonType.TECHNIQUE,
      index: slot ?? 0,
      label: ability.name,
    }),
    [ability.name, slot],
  );

  const { elementRef, onMouseDown } = useImmediateDragClone<HTMLDivElement>(1, actionData);

  const handleSpellClick = () => {
    if (!ability.known) return;
    const player = Player.instance;
    WorldSocket.sendMessage(OpCodes.ActivateAbility, ActivateAbility, {
      abilityId: ability.abilityId,
      targetId: player?.Target?.spawn?.spawnId ?? 0,
    });
  };

  return (
    <div
      ref={elementRef}
      onMouseDown={ability.known ? onMouseDown : undefined}
      onClick={handleSpellClick}
      className={`rq-grimoire-spell ${ability.known ? 'rq-grimoire-spell--draggable' : 'rq-grimoire-spell--unknown'}`}
      data-testid={`grimoire-spell-${ability.abilityId}`}
      title={ability.known ? 'Click to cast, or drag to any hotbar slot' : `Requires Level ${ability.minLevel}`}
    >
      <AbilityIcon id={ability.abilityId} kind={ability.kind} name={ability.name} size={30} />
      <div className="rq-grimoire-spell__body">
        <strong className="rq-grimoire-spell__name">{ability.name}</strong>
        <small className="rq-grimoire-spell__level">Lvl {ability.minLevel}</small>
      </div>
      <div className="rq-grimoire-spell__action">
        {ability.known ? (
          <span className="rq-grimoire-spell__cast-hint">Cast / Drag</span>
        ) : ability.learnable ? (
          <button
            className="rq-grimoire-btn rq-grimoire-btn--learn"
            onMouseDown={(event) => event.stopPropagation()}
            onClick={(event) => {
              event.stopPropagation();
              send(progressionRequests.learn(ability.abilityId));
            }}
          >
            Learn
          </button>
        ) : (
          <span className="rq-grimoire-spell__locked">
            Lvl {ability.minLevel}
          </span>
        )}
      </div>
    </div>
  );
};

export const AbilitiesWindow: React.FC = () => {
  const [open, setOpen] = useState(false);
  const pushed = useEventState('progressionState', ProgressionStore.state as ProgressionState);
  const state: ProgressionState | null = pushed ?? ProgressionStore.state;
  const { x, y, handleMouseDown } = useDrag(420, 140);

  useEffect(() => {
    const toggle = () => setOpen((prev) => !prev);
    emitter.on('toggleAbilitiesWindow', toggle);
    emitter.on('toggleTechniques', toggle);
    return () => {
      emitter.off('toggleAbilitiesWindow', toggle);
      emitter.off('toggleTechniques', toggle);
    };
  }, []);

  useEffect(() => {
    if (!open) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    window.addEventListener('keydown', closeOnEscape);
    return () => window.removeEventListener('keydown', closeOnEscape);
  }, [open]);

  const slotOf = useMemo(() => {
    const map = new Map<string, number>();
    for (const entry of state?.prepared ?? []) map.set(entry.abilityId, entry.slot);
    return map;
  }, [state?.prepared]);

  const [known, learnable] = useMemo(() => {
    const sorted = [...(state?.abilities ?? [])].sort((a, b) => a.minLevel - b.minLevel);
    return [
      sorted.filter((ability) => ability.known),
      sorted.filter((ability) => !ability.known),
    ];
  }, [state?.abilities]);

  if (!open) return null;

  return (
    <div
      className="rq-open-container rq-grimoire-container"
      style={{ left: x, top: y }}
      role="dialog"
      aria-label="Abilities & Spells Grimoire"
    >
      <div className="rq-grimoire-book">
        {/* Ancient Spellbook Background Image with Vignette */}
        <div className="rq-grimoire-book__bg" aria-hidden="true" />
        <div className="rq-grimoire-book__vignette" aria-hidden="true" />

        <header className="rq-grimoire-book__header" onMouseDown={handleMouseDown}>
          <span className="rq-grimoire-book__title">Grimoire of Spells & Techniques</span>
          <button
            aria-label="Close grimoire"
            className="rq-close rq-grimoire-book__close"
            onMouseDown={(event) => event.stopPropagation()}
            onClick={() => setOpen(false)}
          >
            ×
          </button>
        </header>

        <div className="rq-grimoire-book__pages">
          {/* Left Page: Known Spells & Abilities */}
          <div className="rq-grimoire-page rq-grimoire-page--left">
            <h4 className="rq-grimoire-page__heading">Known Spells ({known.length})</h4>
            <div className="rq-grimoire-page__list">
              {known.length === 0 ? (
                <div className="rq-grimoire-empty">No known spells.</div>
              ) : (
                known.map((ability) => (
                  <GrimoireSpellItem
                    key={ability.abilityId}
                    ability={ability}
                    slot={slotOf.get(ability.abilityId) ?? null}
                  />
                ))
              )}
            </div>
          </div>

          {/* Right Page: Learnable Spells */}
          <div className="rq-grimoire-page rq-grimoire-page--right">
            <h4 className="rq-grimoire-page__heading">To Learn ({learnable.length})</h4>
            <div className="rq-grimoire-page__list">
              {learnable.length === 0 ? (
                <div className="rq-grimoire-empty">All available spells mastered.</div>
              ) : (
                learnable.map((ability) => (
                  <GrimoireSpellItem
                    key={ability.abilityId}
                    ability={ability}
                    slot={null}
                  />
                ))
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
