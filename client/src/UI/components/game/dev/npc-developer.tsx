import { useEffect, useMemo, useState } from 'react';
import type * as BJS from '@babylonjs/core';
import BABYLON from '@bjs';
import emitter from '@game/Events/events';
import { useTarget } from '@game/Events/event-hooks';
import GameManager from '@game/Manager/game-manager';
import type { NpcDebugPoint, NpcDebugState } from '@game/Net/messages';

const formatPoint = (point: NpcDebugPoint): string =>
  `${point.x.toFixed(1)}, ${point.y.toFixed(1)}, ${point.z.toFixed(1)}`;

export const NpcDeveloper: React.FC = () => {
  const target = useTarget();
  const targetId = target?.spawn.spawnId ?? target?.spawn.id ?? 0;
  const [state, setState] = useState<NpcDebugState | null>(null);

  useEffect(() => {
    setState(null);
    const receive = (next: NpcDebugState) => {
      if (next.npcId === targetId) setState(next);
    };
    emitter.on('npcDebugState', receive);
    return () => emitter.off('npcDebugState', receive);
  }, [targetId]);

  const projectedPath = useMemo(() => {
    if (!state) return [];
    return [
      state.position,
      ...state.navigation.path.slice(state.navigation.waypointIndex),
    ];
  }, [state]);

  useEffect(() => {
    const scene = GameManager.instance.scene;
    if (!scene || !state) return;
    const meshes: BJS.LinesMesh[] = [];
    if (projectedPath.length > 1) {
      const path = BABYLON.MeshBuilder.CreateLines(
        '__npc_nav_debug_path__',
        {
          points: projectedPath.map(
            (point) => new BABYLON.Vector3(point.x, point.y + 0.35, point.z),
          ),
        },
        scene,
      );
      path.color = new BABYLON.Color3(0.18, 0.9, 1);
      path.alpha = 0.9;
      path.isPickable = false;
      path.renderingGroupId = 3;
      meshes.push(path);
    }
    if (state.roam && state.roam.path.length > 1) {
      const roamPoints = [...state.roam.path, state.roam.path[0]!];
      const roam = BABYLON.MeshBuilder.CreateLines(
        '__npc_roam_debug_path__',
        {
          points: roamPoints.map(
            (point) => new BABYLON.Vector3(point.x, point.y + 0.2, point.z),
          ),
        },
        scene,
      );
      roam.color = new BABYLON.Color3(0.65, 0.65, 0.65);
      roam.alpha = state.roam.suspended ? 0.25 : 0.6;
      roam.isPickable = false;
      roam.renderingGroupId = 3;
      meshes.push(roam);
    }
    const intent = BABYLON.MeshBuilder.CreateLines(
      '__npc_nav_debug_intent__',
      {
        points: [state.position, state.movementTarget].map(
          (point) => new BABYLON.Vector3(point.x, point.y + 0.5, point.z),
        ),
      },
      scene,
    );
    intent.color = new BABYLON.Color3(1, 0.55, 0.12);
    intent.alpha = 0.85;
    intent.isPickable = false;
    intent.renderingGroupId = 3;
    meshes.push(intent);
    return () => meshes.forEach((mesh) => mesh.dispose());
  }, [projectedPath, state]);

  if (!target || !target.spawn.isNpc || target.spawn.isCorpse) {
    return (
      <div className="rq-npc-debug rq-empty-state">
        Select a living NPC to inspect hate and navigation state.
      </div>
    );
  }
  if (!state) {
    return <div className="rq-npc-debug is-loading">Waiting for zone diagnostics…</div>;
  }

  return (
    <div className="rq-npc-debug">
      <div className="rq-npc-debug__summary">
        <strong>{target.cleanName}</strong>
        <span className={state.engaged ? 'is-engaged' : ''}>
          {state.engaged ? 'ENGAGED' : 'IDLE'}
        </span>
        <span>tick {state.tick}</span>
      </div>
      <dl>
        <dt>NPC / top hate</dt><dd>{state.npcId} / {state.aggroTargetId || 'none'}</dd>
        <dt>Position</dt><dd>{formatPoint(state.position)}</dd>
        <dt>Move intent</dt><dd>{formatPoint(state.movementTarget)}</dd>
        <dt>Speed</dt><dd>{state.moveSpeed.toFixed(2)}</dd>
        <dt>Navigation</dt><dd>{state.navigation.status}</dd>
        <dt>Path cursor</dt>
        <dd>{state.navigation.waypointIndex} / {state.navigation.path.length}</dd>
        <dt>Path request</dt>
        <dd>{state.navigation.requestId || 'none'} · repath {state.navigation.nextRepathTick}</dd>
        <dt>Roam route</dt>
        <dd>
          {state.roam
            ? `${state.roam.suspended ? 'suspended' : 'active'} · `
              + `${state.roam.targetIndex} / ${state.roam.path.length}`
            : 'none'}
        </dd>
      </dl>
      {state.navigation.error ? (
        <p className="is-error">{state.navigation.error}</p>
      ) : null}
      <h3>Hate list</h3>
      {state.hateList.length === 0 ? (
        <p className="rq-empty-state">No hate entries</p>
      ) : (
        <table>
          <thead><tr><th>#</th><th>Entity</th><th>Hate</th><th>Damage</th><th>Tick</th></tr></thead>
          <tbody>
            {state.hateList.map((entry, index) => (
              <tr key={entry.entityId}>
                <td>{index + 1}</td>
                <td>{entry.entityId}</td>
                <td>{entry.hate}</td>
                <td>{entry.damage}</td>
                <td>{entry.lastModifiedTick}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <h3>Projected path</h3>
      <ol className="rq-npc-debug__path">
        {state.navigation.path.map((point, index) => (
          <li
            className={index === state.navigation.waypointIndex ? 'is-current' : ''}
            key={`${index}:${point.x}:${point.z}`}
          >
            {index}: {formatPoint(point)}
          </li>
        ))}
      </ol>
      <small>
        Cyan: remaining navmesh path · amber: movement intent · gray: retained roam route
      </small>
    </div>
  );
};
