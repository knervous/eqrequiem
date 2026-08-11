import React, { useEffect, useMemo, useState } from 'react';
import { abilityIconUrl, iconInitials, iconTint } from '@game/Combat/ability-icons';
import {
  PROGRESSION_REFUSAL_TEXT,
  ProgressionStore,
  progressionRequests,
} from '@game/Combat/progression-store';
import emitter from '@game/Events/events';
import { useEventState, useTechniquesOpen } from '@game/Events/event-hooks';
import {
  ProgressionRequest,
  type ProgressionAbility,
  type ProgressionNode,
  type ProgressionRequestBody,
  type ProgressionState,
} from '@game/Net/messages';
import { OpCodes } from '@game/Net/opcodes';
import { WorldSocket } from '@ui/net/instances';
import { ActionButtonType, type FullActionData } from '../action-button/constants';
import { useImmediateDragClone } from '../action-button/hooks';
import { useDrag } from '../../../hooks/use-drag';
import './techniques.css';

/**
 * The Techniques window: what this character knows, what is on the bar, and where their
 * Aspect Points went.
 *
 * Both halves read one pushed `ProgressionState` rather than deriving anything locally.
 * The server already answers "can this be learned" and "can this point be spent" — the
 * panel asking the same questions again in JavaScript would be a second rulebook, and
 * the two would disagree the first time either changed.
 */

const send = (request: ProgressionRequestBody): void => {
  WorldSocket.sendMessage(OpCodes.ProgressionRequest, ProgressionRequest, { request });
};

/** Art if it exists, initials over the school colour if it does not. */
export const AbilityIcon: React.FC<{
  id: string;
  name: string;
  kind: string;
  school?: string | null;
  size?: number;
}> = ({ id, name, kind, school, size = 44 }) => {
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

const seconds = (ms: number): string =>
  ms >= 60_000 ? `${Math.round(ms / 60_000)}m` : `${Math.round(ms / 1000)}s`;

const AbilityRow: React.FC<{
  ability: ProgressionAbility;
  slot: number | null;
  freeSlot: number | null;
}> = ({ ability, slot, freeSlot }) => {
  const actionData: FullActionData = useMemo(
    () => ({
      type: ActionButtonType.TECHNIQUE,
      index: slot ?? 0,
      label: ability.name,
    }),
    [ability.name, slot],
  );

  const { elementRef, onMouseDown } = useImmediateDragClone<HTMLLIElement>(1, actionData);

  return (
    <li
      ref={elementRef}
      onMouseDown={ability.known ? onMouseDown : undefined}
      className={`rq-technique ${ability.known ? 'rq-technique--draggable' : 'rq-technique--unknown'}`}
      data-testid={`technique-${ability.abilityId}`}
    >
      <AbilityIcon id={ability.abilityId} kind={ability.kind} name={ability.name} />
      <div className="rq-technique__body">
        <div className="rq-technique__title">
          <strong>{ability.name}</strong>
          <small>Level {ability.minLevel}</small>
        </div>
        <div className="rq-technique__meta">
          {ability.resource ? (
            <span>{ability.resourceAmount} {ability.resource}</span>
          ) : (
            <span>no cost</span>
          )}
          {ability.cooldownMs > 0 ? <span>{seconds(ability.cooldownMs)} cooldown</span> : null}
          {ability.rangeMetres > 0 ? <span>{ability.rangeMetres}m</span> : <span>self</span>}
          {ability.tags.map((tag) => (
            <span key={tag} className="rq-technique__tag">{tag.replace(/_/g, ' ')}</span>
          ))}
        </div>
      </div>
      <div className="rq-technique__actions">
        {ability.known ? (
          slot === null ? (
            <button
              disabled={freeSlot === null}
              onClick={() => freeSlot !== null
                && send(progressionRequests.prepare(ability.abilityId, freeSlot))}
            >
              {freeSlot === null ? 'Bar full' : 'Add to bar'}
            </button>
          ) : (
            <>
              <span className="rq-technique__slot">Slot {slot + 1}</span>
              <button onClick={() => send(progressionRequests.clearSlot(slot))}>Remove</button>
            </>
          )
        ) : ability.learnable ? (
          <button
            className="rq-technique__learn"
            onClick={() => send(progressionRequests.learn(ability.abilityId))}
          >
            Learn
          </button>
        ) : (
          <span className="rq-technique__locked">
            {PROGRESSION_REFUSAL_TEXT[ability.refusal ?? ''] ?? 'Not yet'}
          </span>
        )}
      </div>
    </li>
  );
};

const AspectNodeCard: React.FC<{ node: ProgressionNode; canSpend: boolean }> = ({
  node,
  canSpend,
}) => {
  const taken = node.points > 0;
  const actionData: FullActionData = useMemo(
    () => ({
      type: ActionButtonType.TECHNIQUE,
      index: 0,
      label: node.name,
    }),
    [node.name],
  );

  const { elementRef, onMouseDown } = useImmediateDragClone<HTMLLIElement>(1, actionData);

  return (
    <li
      ref={elementRef}
      onMouseDown={taken ? onMouseDown : undefined}
      className={`rq-aspect-node ${taken ? 'rq-aspect-node--taken rq-aspect-node--draggable' : ''} ${
        canSpend ? 'rq-aspect-node--available' : ''
      }`}
      data-testid={`aspect-${node.nodeId}`}
    >
      <AbilityIcon id={node.nodeId} kind={node.kind} name={node.name} size={38} />
      <div className="rq-aspect-node__body">
        <div className="rq-aspect-node__title">
          <strong>{node.name}</strong>
          <small>{node.kind}{node.cost > 1 ? ` · ${node.cost} points` : ''}</small>
        </div>
        <p>{node.effect}</p>
      </div>
      {taken ? (
        <span className="rq-aspect-node__taken">Taken</span>
      ) : (
        <button
          disabled={!canSpend}
          title={canSpend ? undefined : PROGRESSION_REFUSAL_TEXT[node.refusal ?? ''] ?? ''}
          onClick={() => send(progressionRequests.spend(node.nodeId))}
        >
          Spend
        </button>
      )}
    </li>
  );
};

const Abilities: React.FC<{ state: ProgressionState }> = ({ state }) => {
  const slotOf = useMemo(() => {
    const map = new Map<string, number>();
    for (const entry of state.prepared) map.set(entry.abilityId, entry.slot);
    return map;
  }, [state.prepared]);

  const freeSlot = useMemo(() => {
    const used = new Set(state.prepared.map((entry) => entry.slot));
    for (let slot = 0; slot < state.slots.primary; slot++) {
      if (!used.has(slot)) return slot;
    }
    return null;
  }, [state.prepared, state.slots.primary]);

  const [known, rest] = useMemo(() => {
    const sorted = [...state.abilities].sort((a, b) => a.minLevel - b.minLevel);
    return [
      sorted.filter((ability) => ability.known),
      sorted.filter((ability) => !ability.known),
    ];
  }, [state.abilities]);

  return (
    <>
      <p className="rq-techniques__hint">
        {state.prepared.length} of {state.slots.primary} bar slots filled. Drag any known ability onto your hotbar slots.
      </p>
      <h4>Known</h4>
      <ul className="rq-technique-list">
        {known.map((ability) => (
          <AbilityRow
            key={ability.abilityId}
            ability={ability}
            freeSlot={freeSlot}
            slot={slotOf.get(ability.abilityId) ?? null}
          />
        ))}
      </ul>
      <h4>Yet to learn</h4>
      <ul className="rq-technique-list">
        {rest.map((ability) => (
          <AbilityRow
            key={ability.abilityId}
            ability={ability}
            freeSlot={freeSlot}
            slot={null}
          />
        ))}
      </ul>
    </>
  );
};

const Aspects: React.FC<{ state: ProgressionState }> = ({ state }) => (
  <>
    <div className="rq-aspects__summary">
      <strong>{state.aspectPointsAvailable}</strong>
      <span>
        {state.aspectPointsAvailable === 1 ? 'point' : 'points'} unspent
        {state.aspectPointsSpent > 0 ? ` · ${state.aspectPointsSpent} committed` : ''}
      </span>
      <button
        disabled={state.aspectPointsSpent === 0}
        onClick={() => send(progressionRequests.respec())}
      >
        Reconsider all
      </button>
    </div>
    {state.neverLost.length > 0 ? (
      <p className="rq-techniques__hint">
        Whatever you choose, you keep: {state.neverLost.join(', ')}.
      </p>
    ) : null}
    <div className="rq-aspect-tracks">
      {state.tracks.map((track) => (
        <section key={track.trackId} className="rq-aspect-track">
          <header>
            <strong>{track.name}</strong>
            <small>{track.focus}</small>
            <span className="rq-aspect-track__depth">{track.depth} spent</span>
          </header>
          <ul>
            {track.nodes.map((node) => (
              <AspectNodeCard
                key={node.nodeId}
                canSpend={node.affordable && state.aspectPointsAvailable >= node.cost}
                node={node}
              />
            ))}
          </ul>
        </section>
      ))}
    </div>
  </>
);

export const TechniquesWindow: React.FC = () => {
  const open = useTechniquesOpen();
  // The store holds whatever the last push said, so a window opened later still draws
  // immediately rather than waiting for the next change.
  const pushed = useEventState('progressionState', ProgressionStore.state as ProgressionState);
  const state: ProgressionState | null = pushed ?? ProgressionStore.state;
  const [tab, setTab] = useState<'abilities' | 'aspects'>('abilities');
  const { x, y, handleMouseDown } = useDrag(480, 160);

  useEffect(() => {
    if (!open) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') emitter.emit('toggleTechniques');
    };
    window.addEventListener('keydown', closeOnEscape);
    return () => window.removeEventListener('keydown', closeOnEscape);
  }, [open]);

  if (!open) return null;

  return (
    <div
      className="rq-open-container rq-techniques-container"
      style={{ left: x, top: y }}
      role="dialog"
      aria-modal="false"
      aria-label="Techniques & Aspect Tree"
    >
      <section className="rq-hud-panel rq-techniques">
        <header className="rq-hud-panel__header" onMouseDown={handleMouseDown}>
          <span>
            <small>Progression</small>
            Techniques
          </span>
        </header>
        <div className="rq-hud-panel__body">
          <button
            aria-label="Close techniques"
            className="rq-close"
            onMouseDown={(event) => event.stopPropagation()}
            onClick={() => emitter.emit('toggleTechniques')}
          >
            ×
          </button>
          <nav className="rq-techniques__tabs">
            <button
              aria-pressed={tab === 'abilities'}
              onClick={() => setTab('abilities')}
            >
              Abilities
            </button>
            <button aria-pressed={tab === 'aspects'} onClick={() => setTab('aspects')}>
              Aspects
              {state && state.aspectPointsAvailable > 0 ? (
                <em className="rq-techniques__pip">{state.aspectPointsAvailable}</em>
              ) : null}
            </button>
          </nav>
          {state ? (
            tab === 'abilities' ? <Abilities state={state} /> : <Aspects state={state} />
          ) : (
            <p className="rq-techniques__hint">Waiting for the world to answer…</p>
          )}
        </div>
      </section>
    </div>
  );
};
