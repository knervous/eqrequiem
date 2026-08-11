import React, { useEffect, useMemo, useState } from 'react';
import {
  PROGRESSION_REFUSAL_TEXT,
  ProgressionStore,
  progressionRequests,
} from '@game/Combat/progression-store';
import emitter from '@game/Events/events';
import { useEventState } from '@game/Events/event-hooks';
import {
  ProgressionRequest,
  type ProgressionNode,

  type ProgressionRequestBody,
  type ProgressionState,
  type ProgressionTrack,
} from '@game/Net/messages';
import { OpCodes } from '@game/Net/opcodes';
import { WorldSocket } from '@ui/net/instances';
import { AbilityIcon } from './abilities-window';
import { useDrag } from '../../../hooks/use-drag';
import './reliquary.css';

const send = (request: ProgressionRequestBody): void => {
  WorldSocket.sendMessage(OpCodes.ProgressionRequest, ProgressionRequest, { request });
};

const WoWTalentNode: React.FC<{
  node: ProgressionNode;
  canSpend: boolean;
}> = ({ node, canSpend }) => {
  const taken = node.points > 0;
  const [hovered, setHovered] = useState(false);

  return (
    <div
      className={`rq-wow-node ${taken ? 'rq-wow-node--mastered' : ''} ${
        canSpend ? 'rq-wow-node--available' : ''
      } ${!taken && !canSpend ? 'rq-wow-node--locked' : ''}`}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      data-testid={`wow-talent-${node.nodeId}`}
    >
      <div className="rq-wow-node__frame">
        <AbilityIcon id={node.nodeId} kind={node.kind} name={node.name} size={42} />
        <span className="rq-wow-node__rank">
          {taken ? `${node.points}/${node.cost}` : `0/${node.cost}`}
        </span>
      </div>

      <div className="rq-wow-node__label">
        <span className="rq-wow-node__name">{node.name}</span>
        {!taken && canSpend ? (
          <button
            className="rq-wow-spend-btn"
            onClick={() => send(progressionRequests.spend(node.nodeId))}
          >
            +Spend
          </button>
        ) : null}
      </div>

      {/* WoW Style Hover Tooltip */}
      {hovered ? (
        <div className="rq-wow-tooltip" role="tooltip">
          <div className="rq-wow-tooltip__header">
            <strong>{node.name}</strong>
            <span className="rq-wow-tooltip__rank">Rank {taken ? node.points : 0}/{node.cost}</span>
          </div>
          <p className="rq-wow-tooltip__effect">{node.effect}</p>
          {!taken && !canSpend ? (
            <div className="rq-wow-tooltip__refusal">
              {PROGRESSION_REFUSAL_TEXT[node.refusal ?? ''] ?? 'Requires points in previous tier'}
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
};

export const AspectsWindow: React.FC = () => {
  const [open, setOpen] = useState(false);
  const pushed = useEventState('progressionState', ProgressionStore.state as ProgressionState);
  const state: ProgressionState | null = pushed ?? ProgressionStore.state;
  const { x, y, handleMouseDown } = useDrag(420, 100);

  useEffect(() => {
    const toggle = () => setOpen((prev) => !prev);
    emitter.on('toggleAspectsWindow', toggle);
    return () => emitter.off('toggleAspectsWindow', toggle);
  }, []);

  useEffect(() => {
    if (!open) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    window.addEventListener('keydown', closeOnEscape);
    return () => window.removeEventListener('keydown', closeOnEscape);
  }, [open]);

  // Separate tracks into two primary side-by-side WoW-style specialization trees
  const [treeA, treeB] = useMemo(() => {
    const tracks: ProgressionTrack[] = state?.tracks ?? [];
    if (tracks.length === 0) return [[], []];
    const half = Math.ceil(tracks.length / 2);
    return [tracks.slice(0, half), tracks.slice(half)];
  }, [state?.tracks]);

  // Calculate total points spent per tree
  const pointsSpentA = useMemo(
    () => treeA.reduce((sum, track) => sum + track.depth, 0),
    [treeA],
  );
  const pointsSpentB = useMemo(
    () => treeB.reduce((sum, track) => sum + track.depth, 0),
    [treeB],
  );

  if (!open) return null;

  return (
    <div
      className="rq-open-container rq-wow-aspects-container"
      style={{ left: x, top: y }}
      role="dialog"
      aria-label="Aspect Talent Trees"
    >
      <div className="rq-wow-talent-panel">
        {/* Cosmic Nebula Background & Vignette */}
        <div className="rq-aspects-tree__bg" aria-hidden="true" />
        <div className="rq-aspects-tree__vignette" aria-hidden="true" />

        {/* Panel Header */}
        <header className="rq-wow-talent-panel__header" onMouseDown={handleMouseDown}>
          <div className="rq-wow-talent-panel__title-group">
            <span className="rq-aspects-tree__sigil" aria-hidden="true" />
            <span className="rq-wow-talent-panel__title">Aspect Specialization Trees</span>
          </div>

          <div className="rq-wow-talent-panel__actions">
            {state ? (
              <div className="rq-aspects-tree__points">
                <span className="rq-aspects-tree__gem" aria-hidden="true" />
                <strong>{state.aspectPointsAvailable}</strong>
                <small>{state.aspectPointsAvailable === 1 ? 'Point' : 'Points'} Unspent</small>
              </div>
            ) : null}

            {state && state.aspectPointsSpent > 0 ? (
              <button
                className="rq-aspects-respec-btn"
                onClick={() => send(progressionRequests.respec())}
              >
                Reset Talents
              </button>
            ) : null}

            <button
              aria-label="Close aspect tree"
              className="rq-close rq-aspects-tree__close"
              onMouseDown={(event) => event.stopPropagation()}
              onClick={() => setOpen(false)}
            >
              ×
            </button>
          </div>
        </header>

        {/* Dual WoW Talent Tree Columns */}
        <div className="rq-wow-talent-panel__body">
          {state ? (
            <div className="rq-dual-trees">
              {/* Tree 1 Column (Top-to-Bottom) */}
              <div className="rq-talent-tree-col">
                <header className="rq-talent-tree-col__header">
                  <strong>Specialization I</strong>
                  <span className="rq-talent-tree-col__pts">{pointsSpentA} pts spent</span>
                </header>
                <div className="rq-talent-tree-col__tiers">
                  {treeA.map((track) => (
                    <div key={track.trackId} className="rq-talent-track-group">
                      <span className="rq-talent-track-label">{track.name}</span>
                      <div className="rq-talent-nodes-column">
                        {track.nodes.map((node) => (
                          <WoWTalentNode
                            key={node.nodeId}
                            canSpend={node.affordable && state.aspectPointsAvailable >= node.cost}
                            node={node}
                          />
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="rq-dual-trees__divider" aria-hidden="true" />

              {/* Tree 2 Column (Top-to-Bottom) */}
              <div className="rq-talent-tree-col">
                <header className="rq-talent-tree-col__header">
                  <strong>Specialization II</strong>
                  <span className="rq-talent-tree-col__pts">{pointsSpentB} pts spent</span>
                </header>
                <div className="rq-talent-tree-col__tiers">
                  {treeB.map((track) => (
                    <div key={track.trackId} className="rq-talent-track-group">
                      <span className="rq-talent-track-label">{track.name}</span>
                      <div className="rq-talent-nodes-column">
                        {track.nodes.map((node) => (
                          <WoWTalentNode
                            key={node.nodeId}
                            canSpend={node.affordable && state.aspectPointsAvailable >= node.cost}
                            node={node}
                          />
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          ) : (
            <div className="rq-aspects-empty">Attuning to aspect specialization trees…</div>
          )}
        </div>
      </div>
    </div>
  );
};
