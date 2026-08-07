import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { CommandHandler } from '@game/ChatCommands/command-handler';
import { CommandParser } from '@game/ChatCommands/command-parser';
import {
  useAbilityButtons,
  useActionButtons,
  useCombatButtons,
  useSocialButtons,
} from '@game/Config/use-config';
import { UserConfig } from '@game/Config/config';
import { keyboardEventToBinding } from '@game/Config/key-bindings';
import type {
  ActionButtonRecord,
  HudWindowId,
  HudWindowPlacement,
  Settings,
  UISettings,
} from '@game/Config/types';
import {
  useEventState,
  useExperience,
  useInventoryOpen,
  useJournal,
  usePlayerLevel,
  usePlayerName,
  usePlayerProfile,
  useTarget,
} from '@game/Events/event-hooks';
import emitter, { ChatMessage } from '@game/Events/events';
import type { JournalLead } from '@game/Net/messages';
import GameManager from '@game/Manager/game-manager';
import type { Entity } from '@game/Model/entity';
import Player from '@game/Player/player';
import { MusicPlayer } from '@game/Music/music-player';
import {
  InventorySlot,
  InventorySlotNames,
} from '@game/Player/player-constants';
import { CLASS_DATA_NAMES } from '@game/Constants/class-data';
import { getDeityName } from '@game/Constants/util';
import { ActionButton, ActionHotButton } from '../action-button/action-button';
import {
  ActionButtonType,
  UIActions,
} from '../action-button/constants';
import { ItemButton } from '../action-button/item-button';
import { ItemTooltip } from '../action-button/item-tooltip';
import { ItemVisual } from '../action-button/item-visual';
import { BagsContainer } from '../inventory/bags-container';
import { useDispatch, useUIContext } from '../../context';
import { actions } from '../../../state/reducer';
import { ParsedMessage } from '../chat/command-link';
import type { JsonCommandLink } from '../chat/command-link-util';
import { linkItemToChat, LinkTypes } from '../chat/command-link-util';
import { ChatInputSlate } from '../chat/chat-input';
import { useDrag } from '../../../hooks/use-drag';
import { ControllerHud } from './controller-hud';
import { ControlsOptions } from './controls-options';
import { HudWindow } from './hud-window';
import './reliquary.css';

const generalSlots = [
  InventorySlot.General1,
  InventorySlot.General2,
  InventorySlot.General3,
  InventorySlot.General4,
  InventorySlot.General5,
  InventorySlot.General6,
  InventorySlot.General7,
  InventorySlot.General8,
];

const equipmentSlots = [
  InventorySlot.Charm,
  InventorySlot.Ear1,
  InventorySlot.Head,
  InventorySlot.Face,
  InventorySlot.Ear2,
  InventorySlot.Neck,
  InventorySlot.Shoulders,
  InventorySlot.Arms,
  InventorySlot.Back,
  InventorySlot.Wrist1,
  InventorySlot.Wrist2,
  InventorySlot.Range,
  InventorySlot.Hands,
  InventorySlot.Primary,
  InventorySlot.Secondary,
  InventorySlot.Finger1,
  InventorySlot.Finger2,
  InventorySlot.Chest,
  InventorySlot.Legs,
  InventorySlot.Feet,
  InventorySlot.Waist,
  InventorySlot.Ammo,
];

const actionTabs = ['Main', 'Combat', 'Socials', 'Abilities'] as const;
type ActionTab = (typeof actionTabs)[number];

type SurveyActor = {
  id: number;
  name: string;
  x: number;
  z: number;
  isNpc: boolean;
  isTarget: boolean;
  distance: number;
};

type PlayerTelemetry = {
  x: number;
  y: number;
  z: number;
  heading: number;
  zone: string;
  zoneKey: string;
  actors: SurveyActor[];
  targetDistance: number | null;
  available: boolean;
};

const emptyTelemetry: PlayerTelemetry = {
  x: 0,
  y: 0,
  z: 0,
  heading: 0,
  zone: '',
  zoneKey: '',
  actors: [],
  targetDistance: null,
  available: false,
};

const presentZoneName = (zoneName: string): string => {
  const normalized = zoneName.toLowerCase();
  if (normalized === 'qeynos' || normalized === 'qeynos2') {
    return 'Southern Reach';
  }
  return zoneName
    .replaceAll('_', ' ')
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
};

const usePlayerTelemetry = (): PlayerTelemetry => {
  const target = useTarget();
  const [telemetry, setTelemetry] = useState<PlayerTelemetry>(emptyTelemetry);

  useEffect(() => {
    const sample = () => {
      const player = Player.instance;
      const position = player?.getPlayerPosition();
      const rotation = player?.getPlayerRotation();
      if (!position || !rotation) {
        setTelemetry(emptyTelemetry);
        return;
      }

      const heading = ((rotation.y * 180) / Math.PI + 360) % 360;
      const actors = Object.values(
        GameManager.instance.ZoneManager?.EntityPool?.entities ?? {},
      )
        .filter((entity) => !entity.hidden)
        .map((entity) => {
          const dx = entity.spawnPosition.x - position.x;
          const dz = entity.spawnPosition.z - position.z;
          return {
            id: entity.spawn.spawnId ?? entity.spawn.id,
            name: entity.cleanName,
            x: entity.spawnPosition.x,
            z: entity.spawnPosition.z,
            isNpc: Boolean(entity.spawn.isNpc),
            isTarget: entity === target,
            distance: Math.hypot(dx, dz),
          };
        })
        .sort((a, b) => a.distance - b.distance)
        .slice(0, 32);

      const targetDistance = target
        ? Math.hypot(
          target.spawnPosition.x - position.x,
          target.spawnPosition.z - position.z,
        )
        : null;

      setTelemetry({
        x: position.x,
        y: position.y,
        z: position.z,
        heading,
        zone: presentZoneName(GameManager.instance.ZoneManager?.zoneName ?? ''),
        zoneKey: GameManager.instance.ZoneManager?.zoneName?.toLowerCase() ?? '',
        actors,
        targetDistance,
        available: true,
      });
    };

    sample();
    const timer = window.setInterval(sample, 125);
    emitter.on('playerPosition', sample);
    emitter.on('playerRotation', sample);
    emitter.on('zoneSpawns', sample);
    return () => {
      window.clearInterval(timer);
      emitter.off('playerPosition', sample);
      emitter.off('playerRotation', sample);
      emitter.off('zoneSpawns', sample);
    };
  }, [target]);

  return telemetry;
};

const ReliquaryPanel: React.FC<{
  title: string;
  eyebrow?: string;
  className?: string;
  children: React.ReactNode;
  onHeaderMouseDown?: React.MouseEventHandler<HTMLElement>;
}> = ({ title, eyebrow, className = '', children, onHeaderMouseDown }) => (
  <section className={`rq-hud-panel ${className}`}>
    <header
      className="rq-hud-panel__header"
      onMouseDown={onHeaderMouseDown}
    >
      <span>
        {eyebrow ? <small>{eyebrow}</small> : null}
        {title}
      </span>
    </header>
    <div className="rq-hud-panel__body">{children}</div>
  </section>
);

const Meter: React.FC<{
  label: string;
  value: number;
  max?: number;
  tone?: 'health' | 'mana' | 'stamina' | 'experience';
}> = ({ label, value, max = 100, tone = 'health' }) => {
  const percent = Math.max(0, Math.min(100, max > 0 ? (value / max) * 100 : 0));
  return (
    <div className={`rq-meter rq-meter--${tone}`} aria-label={`${label} ${Math.round(percent)} percent`}>
      <div className="rq-meter__label">
        <span>{label}</span>
        <span>{Math.round(value)}{max !== 100 ? ` / ${Math.round(max)}` : '%'}</span>
      </div>
      <div className="rq-meter__track">
        <span style={{ width: `${percent}%` }} />
      </div>
    </div>
  );
};

/**
 * The Field Journal is memory, not a tracker: it shows only leads the character has
 * actually discovered, in the order they were learned, and never a step the player has
 * not yet reasoned their way to. Threads whose leads are all spent are archived rather
 * than stamped complete, because "what happened" is more interesting than a done bit.
 */
const placeSummary = (place: JournalLead['place']): string | null => {
  if (!place) return null;
  switch (place.kind) {
    case 'direction':
      return place.text;
    case 'landmark':
      return place.landmarkId.replaceAll('-', ' ');
    case 'area':
      return `somewhere around ${place.regionId.replaceAll('-', ' ')}`;
    case 'point':
      return `${Math.round(place.x)}, ${Math.round(place.z)}`;
    case 'zone':
      return `zone ${place.zoneId}`;
    default:
      return null;
  }
};

const FieldJournal: React.FC = () => {
  const journal = useJournal();
  const threads = useMemo(() => {
    const grouped = new Map<string, JournalLead[]>();
    for (const lead of journal?.entries ?? []) {
      const thread = grouped.get(lead.questKey) ?? [];
      thread.push(lead);
      grouped.set(lead.questKey, thread);
    }
    return [...grouped.entries()]
      .map(([questKey, leads]) => ({
        questKey,
        title: leads.find((lead) => lead.questTitle)?.questTitle
          ?? leads.find((lead) => lead.title)?.title
          ?? 'Loose Thread',
        archived: leads.every((lead) => lead.archived),
        leads: [...leads].sort((left, right) => left.order - right.order),
      }))
      // Threads still worth pulling come first; settled ones fall to the bottom.
      .sort((left, right) => Number(left.archived) - Number(right.archived));
  }, [journal]);

  return (
    <ReliquaryPanel title="Field Journal" className="rq-journal">
      {threads.length === 0 ? (
        <div className="rq-empty-state">No active entries.</div>
      ) : (
        threads.map((thread) => (
          <section
            key={thread.questKey}
            className={`rq-journal__thread${thread.archived ? ' is-archived' : ''}`}
          >
            <h4>{thread.title}</h4>
            {thread.leads.map((lead) => {
              const place = placeSummary(lead.place);
              return (
                <article
                  key={lead.leadKey}
                  className={`rq-journal__lead rq-journal__lead--${lead.kind}${
                    lead.status === 'resolved' ? ' is-resolved' : ''
                  }`}
                >
                  <span className="rq-journal__kind">{lead.kind}</span>
                  <p>{lead.text}</p>
                  {place ? <small>{place}</small> : null}
                </article>
              );
            })}
          </section>
        ))
      )}
    </ReliquaryPanel>
  );
};

const Compass: React.FC<{ heading: number }> = ({ heading }) => {
  const cardinal = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'][
    Math.round(heading / 45) % 8
  ];
  return (
    <div className="rq-compass" aria-label={`Heading ${cardinal}, ${Math.round(heading)} degrees`}>
      <span className="rq-compass__needle" />
      <strong>{cardinal}</strong>
      <small>{String(Math.round(heading)).padStart(3, '0')}°</small>
    </div>
  );
};

/**
 * Phase boundaries of the world day.
 *
 * These are the sky manifest's own keyframe anchors (night 0, dawn 6, noon 12,
 * dusk 18), so the bar's segments line up with what the sky actually does
 * rather than with a separately invented schedule.
 */
const DAY_PHASES = [
  { start: 0, label: 'Night' },
  { start: 5, label: 'Dawn' },
  { start: 8, label: 'Morning' },
  { start: 12, label: 'Midday' },
  { start: 16, label: 'Afternoon' },
  { start: 19, label: 'Dusk' },
  { start: 21, label: 'Night' },
] as const;

const phaseForHour = (hour: number): string => {
  let label: string = DAY_PHASES[0].label;
  for (const phase of DAY_PHASES) {
    if (hour >= phase.start) label = phase.label;
  }
  return label;
};

const skyManager = () => GameManager.instance?.ZoneManager?.SkyManager;

const TimeOfDayBar: React.FC = () => {
  const hour = useEventState('timeOfDay', 12);
  const trackRef = useRef<HTMLDivElement | null>(null);
  const [scrubbing, setScrubbing] = useState(false);

  const wrapped = ((hour % 24) + 24) % 24;
  const totalMinutes = Math.floor(wrapped * 60);
  const clock =
    `${String(Math.floor(totalMinutes / 60)).padStart(2, '0')}:` +
    `${String(totalMinutes % 60).padStart(2, '0')}`;
  const phase = phaseForHour(wrapped);
  const percent = (wrapped / 24) * 100;

  // The sky manager owns the clock and re-emits it, so scrubbing only has to
  // push the new hour in; the displayed value still arrives back through the
  // same event as an ordinary tick.
  const applyFromClientX = useCallback((clientX: number) => {
    const track = trackRef.current;
    if (!track) return;
    const bounds = track.getBoundingClientRect();
    if (bounds.width <= 0) return;
    const ratio = Math.min(1, Math.max(0, (clientX - bounds.left) / bounds.width));
    skyManager()?.setTimeOfDay(ratio * 24);
  }, []);

  const onPointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return;
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    setScrubbing(true);
    applyFromClientX(event.clientX);
  };

  const onPointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!scrubbing) return;
    applyFromClientX(event.clientX);
  };

  const endScrub = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!scrubbing) return;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    setScrubbing(false);
  };

  const onKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    const step = event.shiftKey ? 1 : 1 / 6;
    const jump: Record<string, number> = {
      ArrowLeft: -step,
      ArrowDown: -step,
      ArrowRight: step,
      ArrowUp: step,
    };
    if (event.key in jump) {
      event.preventDefault();
      skyManager()?.setTimeOfDay(wrapped + jump[event.key]!);
      return;
    }
    if (event.key === 'Home' || event.key === 'End') {
      event.preventDefault();
      skyManager()?.setTimeOfDay(event.key === 'Home' ? 0 : 12);
    }
  };

  return (
    <div
      className={`rq-timebar${scrubbing ? ' is-scrubbing' : ''}`}
      aria-label="Time of day"
    >
      <span className="rq-timebar__phase">{phase}</span>
      <div
        ref={trackRef}
        className="rq-timebar__track"
        role="slider"
        tabIndex={0}
        aria-valuemin={0}
        aria-valuemax={24}
        aria-valuenow={Number(wrapped.toFixed(2))}
        aria-valuetext={`${clock}, ${phase}`}
        aria-label="Set time of day"
        title="Drag to set the time of day"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endScrub}
        onPointerCancel={endScrub}
        onKeyDown={onKeyDown}
      >
        {/* Sunrise and sunset, the two boundaries worth reading at a glance. */}
        <i className="rq-timebar__tick" style={{ left: '25%' }} aria-hidden="true" />
        <i className="rq-timebar__tick" style={{ left: '75%' }} aria-hidden="true" />
        <span className="rq-timebar__marker" style={{ left: `${percent}%` }} />
      </div>
      <strong className="rq-timebar__clock">{clock}</strong>
    </div>
  );
};

const Conditions: React.FC = () => {
  const running = useEventState('playerRunning', true);
  const sitting = useEventState('playerSitting', false);
  return (
    <div className="rq-conditions" aria-label="Current conditions">
      <span className={sitting ? 'is-active' : ''}>{sitting ? 'Resting' : 'Standing'}</span>
      <span className={!sitting ? 'is-active' : ''}>{running ? 'Running' : 'Walking'}</span>
    </div>
  );
};

const StatusCluster: React.FC = () => {
  const playerName = usePlayerName();
  const player = usePlayerProfile();
  const level = usePlayerLevel();
  const experience = useExperience();
  return (
    <div className="rq-status-cluster">
      <ReliquaryPanel title={playerName || 'Wayfarer'} eyebrow={`Level ${level}`}>
        <Meter label="Health" value={player?.curHp ?? 0} max={player?.maxHp ?? 1} />
        <Meter label="Mana" value={player?.mana ?? 0} max={player?.maxMana ?? 1} tone="mana" />
        <Meter label="Vigor" value={100} tone="stamina" />
        {experience && experience.forLevel > 0 ? (
          <Meter
            label="Experience"
            value={experience.intoLevel}
            max={experience.forLevel}
            tone="experience"
          />
        ) : null}
      </ReliquaryPanel>
      <Conditions />
    </div>
  );
};

const TargetFrame: React.FC<{
  target: Entity;
  targetDistance: number | null;
}> = ({
  target,
  targetDistance,
}) => {
  const targetHealth = useEventState('entityHealth', {
    spawnId: 0,
    currentHp: 0,
    maximumHp: 0,
  });
  const targetId = target?.spawn.spawnId ?? 0;
  const currentHp =
    targetHealth.spawnId === targetId
      ? targetHealth.currentHp
      : (target?.spawn.currentHp ?? target?.spawn.curHp ?? 0);
  const maximumHp =
    targetHealth.spawnId === targetId
      ? targetHealth.maximumHp
      : (target?.spawn.maximumHp ?? target?.spawn.maxHp ?? 1);
  return (
    <ReliquaryPanel
      title={target.cleanName}
      eyebrow={targetDistance === null ? 'Target' : `${Math.round(targetDistance)}m`}
      className="rq-target"
    >
      <Meter label="Health" value={currentHp} max={maximumHp} />
      {target.spawn.isCorpse ? (
        <button onClick={() => void Player.instance?.playerCombat.lootTarget()}>
          Loot Corpse
        </button>
      ) : null}
    </ReliquaryPanel>
  );
};

const SurveyMap: React.FC<{ telemetry: PlayerTelemetry }> = ({ telemetry }) => {
  type BakedMap = {
    image: string;
    north?: string;
    rotationDegrees?: number;
    bounds: { minX: number; maxX: number; minZ: number; maxZ: number };
  };
  const ranges = [50, 100, 200, 400];
  const [rangeIndex, setRangeIndex] = useState(2);
  const [collapsed, setCollapsed] = useState(false);
  const [journalOpen, setJournalOpen] = useState(false);
  const [bakedMap, setBakedMap] = useState<BakedMap | null>(null);
  const range = ranges[rangeIndex];
  const visibleActors = telemetry.actors.filter((actor) => actor.distance <= range);
  const unitsToPixels = 82 / range;
  const mapWidth = bakedMap
    ? (bakedMap.bounds.maxX - bakedMap.bounds.minX) * unitsToPixels
    : 0;
  const mapHeight = bakedMap
    ? (bakedMap.bounds.maxZ - bakedMap.bounds.minZ) * unitsToPixels
    : 0;
  const mapX = bakedMap
    ? 100 - (telemetry.x - bakedMap.bounds.minX) * unitsToPixels
    : 0;
  const mapY = bakedMap
    ? 100 - (bakedMap.bounds.maxZ - telemetry.z) * unitsToPixels
    : 0;
  const mapRotation = (bakedMap?.rotationDegrees ?? -90) - telemetry.heading;
  const cardinalMarkers = [
    { label: 'N', angle: 0 },
    { label: 'E', angle: 90 },
    { label: 'S', angle: 180 },
    { label: 'W', angle: 270 },
  ].map(({ label, angle }) => {
    const radians = ((angle + mapRotation) * Math.PI) / 180;
    return {
      label,
      x: 100 + Math.cos(radians) * 92,
      y: 100 + Math.sin(radians) * 92,
    };
  });

  useEffect(() => {
    if (!telemetry.zoneKey) {
      setBakedMap(null);
      return;
    }
    const controller = new AbortController();
    fetch(`${import.meta.env.BASE_URL}eltania/maps/${telemetry.zoneKey}-topdown-v1.json`, {
      signal: controller.signal,
    })
      .then((response) => {
        if (!response.ok) throw new Error('No baked minimap');
        return response.json() as Promise<BakedMap>;
      })
      .then(setBakedMap)
      .catch((error: unknown) => {
        if (!(error instanceof DOMException && error.name === 'AbortError')) {
          setBakedMap(null);
        }
      });
    return () => controller.abort();
  }, [telemetry.zoneKey]);

  return (
    <div className="rq-survey-stack">
      <ReliquaryPanel
        title={telemetry.zone || 'Survey'}
        eyebrow="Elrador"
        className={`rq-survey ${collapsed ? 'is-collapsed' : ''}`}
      >
        <div className="rq-survey__toolbar">
          <button
            aria-label={collapsed ? 'Expand minimap' : 'Collapse minimap'}
            aria-expanded={!collapsed}
            onClick={() => setCollapsed((value) => !value)}
          >
            {collapsed ? 'Map' : '—'}
          </button>
        </div>
        {!collapsed ? (
          <>
            <div
              className="rq-survey__map"
              role="img"
              aria-label={telemetry.available
                ? `Heading-up baked minimap, ${visibleActors.length} nearby actors within ${range} meters`
                : 'Minimap unavailable until the player enters the world'}
            >
              <svg viewBox="0 0 200 200" aria-hidden="true">
                <defs>
                  <clipPath id="rq-survey-clip">
                    <circle cx="100" cy="100" r="88" />
                  </clipPath>
                </defs>
                <g
                  clipPath="url(#rq-survey-clip)"
                  transform={`rotate(${mapRotation} 100 100)`}
                >
                  {bakedMap ? (
                    <image
                      className="rq-survey__baked-map"
                      href={bakedMap.image}
                      x={mapX}
                      y={mapY}
                      width={mapWidth}
                      height={mapHeight}
                      preserveAspectRatio="none"
                    />
                  ) : null}
                  {visibleActors.map((actor) => {
                    const dx = actor.x - telemetry.x;
                    const dz = actor.z - telemetry.z;
                    const actorX = 100 + dx * unitsToPixels;
                    const actorY = 100 - dz * unitsToPixels;
                    return (
                      <circle
                        className={actor.isTarget
                          ? 'rq-survey__actor rq-survey__actor--target'
                          : `rq-survey__actor rq-survey__actor--${actor.isNpc ? 'npc' : 'player'}`}
                        cx={actorX}
                        cy={actorY}
                        key={actor.id}
                        r={actor.isTarget ? 4.5 : 3}
                      >
                        <title>{actor.name}, {Math.round(actor.distance)} meters</title>
                      </circle>
                    );
                  })}
                </g>
                <g className="rq-survey__grid" clipPath="url(#rq-survey-clip)">
                  <path d="M12 100h176M100 12v176" />
                  <circle cx="100" cy="100" r="87" />
                </g>
                <path
                  className="rq-survey__player"
                  d="M100 88l7 20-7-4-7 4z"
                />
                {cardinalMarkers.map(({ label, x, y }) => (
                  <text
                    key={label}
                    textAnchor="middle"
                    dominantBaseline="central"
                    x={x}
                    y={y}
                  >
                    {label}
                  </text>
                ))}
              </svg>
              {!telemetry.available
                ? <span className="rq-survey__unavailable">Awaiting world position</span>
                : !bakedMap
                  ? <span className="rq-survey__unavailable">Map not baked</span>
                  : null}
            </div>
            <div className="rq-survey__readout">
              <span>{telemetry.available ? `${Math.round(telemetry.x)}, ${Math.round(telemetry.y)}, ${Math.round(telemetry.z)}` : '—, —, —'}</span>
              <span>{String(Math.round(telemetry.heading)).padStart(3, '0')}°</span>
            </div>
            <div className="rq-survey__controls">
              <button
                aria-label="Decrease minimap range"
                disabled={rangeIndex === 0}
                onClick={() => setRangeIndex((value) => value - 1)}
              >
                +
              </button>
              <span>{range}m</span>
              <button
                aria-label="Increase minimap range"
                disabled={rangeIndex === ranges.length - 1}
                onClick={() => setRangeIndex((value) => value + 1)}
              >
                −
              </button>
              <button
                aria-expanded={journalOpen}
                className="rq-survey__journal-toggle"
                onClick={() => setJournalOpen((value) => !value)}
              >
                Journal
              </button>
            </div>
          </>
        ) : null}
      </ReliquaryPanel>
      {journalOpen && !collapsed ? <FieldJournal /> : null}
    </div>
  );
};

const Chat: React.FC = () => {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const scrollRef = useRef<HTMLDivElement>(null);
  const executeLink = useCallback((payload: JsonCommandLink) => {
    if (payload.linkType === LinkTypes.SummonItem) {
      CommandParser.parseCommand(`#si ${payload.data}`);
      return;
    }
    if (payload.linkType === LinkTypes.DialogueTopic) {
      // Exactly what typing the phrase would do, aimed at the current target.
      CommandParser.parseCommand(payload.data);
    }
  }, []);
  useEffect(() => {
    const addMessage = (message: ChatMessage) =>
      setMessages((current) => [...current.slice(-249), message]);
    emitter.on('chatMessage', addMessage);
    return () => emitter.off('chatMessage', addMessage);
  }, []);
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);
  return (
    <ReliquaryPanel title="Chat" className="rq-chat">
      <div ref={scrollRef} className="rq-chat__messages" aria-live="polite">
        {messages.length ? messages.map((message, index) => (
          <div key={`${index}-${message.message}`} style={{ color: message.color || undefined }}>
            <ParsedMessage text={message.message} onExecute={executeLink} />
          </div>
        )) : <div className="rq-empty-state">The road is quiet.</div>}
      </div>
      <div className="rq-chat__input">
        <ChatInputSlate
          onExecuteCommand={executeLink}
          onSubmit={(message) => CommandParser.parseCommand(message)}
        />
      </div>
    </ReliquaryPanel>
  );
};

const Hotbar: React.FC = () => {
  const [page, setPage] = useState(0);
  const config = useActionButtons();
  return (
    <div className="rq-hotbar" aria-label={`Hotbuttons page ${page + 1}`}>
      <button className="rq-page-button" disabled={page === 0} onClick={() => setPage((value) => value - 1)}>‹</button>
      <div className="rq-hotbar__slots">
        {Array.from({ length: 10 }, (_, index) => {
          const absoluteIndex = index + page * 10;
          return (
            <div className="rq-hotbar__slot" key={absoluteIndex}>
              <kbd>{index === 9 ? '0' : index + 1}</kbd>
              <ActionHotButton
                hotButton
                actionButtonConfig={config}
                actionData={config?.hotButtons?.[absoluteIndex]}
                index={absoluteIndex}
                scale={1}
                size={48}
              />
            </div>
          );
        })}
      </div>
      <button className="rq-page-button" disabled={page === 9} onClick={() => setPage((value) => value + 1)}>›</button>
      <span className="rq-page-index">{page + 1}</span>
    </div>
  );
};

const QuickControls: React.FC<{
  onActions: () => void;
  onDeveloperTools: () => void;
}> = ({ onActions, onDeveloperTools }) => {
  const running = useEventState('playerRunning', true);
  const sitting = useEventState('playerSitting', false);
  const autoAttacking = useEventState('autoAttack', false);
  return (
    <nav className="rq-quick-controls" aria-label="Character controls">
      <button onClick={() => emitter.emit('toggleInventory')}>Equipment</button>
      <button onClick={onActions}>Actions</button>
      <button aria-pressed={sitting} onClick={() => Player.instance?.toggleSit()}>{sitting ? 'Stand' : 'Rest'}</button>
      <button aria-pressed={!running} onClick={() => Player.instance?.toggleWalk()}>{running ? 'Walk' : 'Run'}</button>
      <button
        aria-pressed={autoAttacking}
        title="Toggle auto-attack (T)"
        onClick={(event) => {
          Player.instance?.autoAttack();
          event.currentTarget.blur();
        }}
      >
        {autoAttacking ? 'Stop Attack' : 'Attack'} <kbd>T</kbd>
      </button>
      <button
        title="Open developer tools (F8)"
        onClick={(event) => {
          onDeveloperTools();
          event.currentTarget.blur();
        }}
      >
        Dev <kbd>F8</kbd>
      </button>
    </nav>
  );
};

const CorpseLoot: React.FC = () => {
  const window = useEventState('lootWindow', null);
  const {
    x,
    y,
    handleMouseDown: handleDragMouseDown,
  } = useDrag(260, 180);
  if (!window) return null;
  return (
    <div
      className="rq-open-container"
      style={{ left: x, top: y }}
      role="dialog"
      aria-modal="false"
      aria-label={`Loot ${window.corpseName.replaceAll('_', ' ')}`}
    >
      <ReliquaryPanel
        title={window.corpseName.replaceAll('_', ' ')}
        eyebrow="Corpse Loot"
        className="rq-corpse-loot"
        onHeaderMouseDown={handleDragMouseDown}
      >
        <button
          className="rq-close"
          aria-label="Close loot"
          onMouseDown={(event) => event.stopPropagation()}
          onClick={() => emitter.emit('lootWindow', null)}
        >
          ×
        </button>
        <div className="rq-corpse-loot__items">
          {window.items.length === 0 ? (
            <div className="rq-empty-state">The corpse is empty.</div>
          ) : window.items.map((item) => (
            <button
              key={`${item.slot}:${item.itemId}`}
              onClick={(event) => {
                event.currentTarget.blur();
                void Player.instance?.playerCombat.lootItem(
                  window.corpseId,
                  item.slot,
                );
              }}
            >
              <span>{item.name}</span>
              <small>{item.quantity > 1 ? `×${item.quantity}` : 'Loot'}</small>
            </button>
          ))}
        </div>
      </ReliquaryPanel>
    </div>
  );
};

const formatCopper = (value: number): string => {
  let remainder = Math.max(0, Math.trunc(value));
  const platinum = Math.floor(remainder / 1_000);
  remainder %= 1_000;
  const gold = Math.floor(remainder / 100);
  remainder %= 100;
  const silver = Math.floor(remainder / 10);
  const copper = remainder % 10;
  return [
    platinum > 0 ? `${platinum}p` : '',
    gold > 0 ? `${gold}g` : '',
    silver > 0 ? `${silver}s` : '',
    `${copper}c`,
  ].filter(Boolean).join(' ');
};

const CoinValue: React.FC<{ value: number }> = ({ value }) => {
  let remainder = Math.max(0, Math.trunc(value));
  const denominations = [
    ['platinum', 'p', Math.floor(remainder / 1_000)],
    ['gold', 'g', Math.floor((remainder %= 1_000) / 100)],
    ['silver', 's', Math.floor((remainder %= 100) / 10)],
    ['copper', 'c', remainder % 10],
  ] as const;
  const visible = denominations.filter(([, key, amount]) =>
    amount > 0 || (key === 'c' && denominations.every((part) => part[2] === 0)));
  return (
    <span className="rq-coin-value" aria-label={formatCopper(value)}>
      {visible.map(([name, key, amount]) => (
        <span className="rq-coin-value__part" key={key}>
          <i className={`rq-coin rq-coin--${name}`} aria-hidden="true" />
          <b>{amount}</b>
        </span>
      ))}
    </span>
  );
};

const Merchant: React.FC = () => {
  const merchantWindow = useEventState('merchantWindow', null);
  const {
    x,
    y,
    handleMouseDown: handleDragMouseDown,
  } = useDrag(620, 180);

  if (!merchantWindow) return null;
  const sellItems = merchantWindow.sellItems ?? [];

  return (
    <div
      className="rq-open-container"
      style={{ left: x, top: y }}
      role="dialog"
      aria-modal="false"
      aria-label={`Trade with ${merchantWindow.merchantName}`}
    >
      <ReliquaryPanel
        title={merchantWindow.merchantName.replaceAll('_', ' ')}
        eyebrow="Merchant"
        className="rq-merchant"
        onHeaderMouseDown={handleDragMouseDown}
      >
        <button
          className="rq-close"
          aria-label="Close merchant"
          onMouseDown={(event) => event.stopPropagation()}
          onClick={() => emitter.emit('merchantWindow', null)}
        >
          ×
        </button>
        <div className="rq-merchant__toolbar">
          <span>Carried coin</span>
          <CoinValue value={merchantWindow.currencyCopper} />
        </div>
        <div className="rq-merchant__trade">
          <section className="rq-merchant__pane" aria-labelledby="merchant-stock">
            <h3 id="merchant-stock">
              <span>Merchant stock</span>
              <small>{merchantWindow.items.length} items</small>
            </h3>
            <div className="rq-merchant__items">
              {merchantWindow.items.map((entry) => (
                <ItemTooltip item={entry.item} key={entry.merchantSlot}>
                  <button
                    className="rq-merchant-item"
                    disabled={entry.quantity === 0}
                    onClick={(event) => {
                      event.currentTarget.blur();
                      if (event.ctrlKey) {
                        linkItemToChat(entry.item);
                        return;
                      }
                      void Player.instance?.playerMerchant.buy(
                        merchantWindow.npcId,
                        entry.merchantSlot,
                      );
                    }}
                  >
                    <span className="rq-merchant-item__icon">
                      <ItemVisual
                        isContainer={(entry.item.bagslots ?? 0) > 0}
                        item={entry.item}
                      />
                    </span>
                    <span className="rq-merchant-item__details">
                      <strong>{entry.name.replaceAll('_', ' ')}</strong>
                      <small>
                        {entry.quantity === null
                          ? 'In stock'
                          : `${entry.quantity} remaining`}
                      </small>
                    </span>
                    <CoinValue value={entry.unitPrice} />
                  </button>
                </ItemTooltip>
              ))}
              {merchantWindow.items.length === 0
                ? <div className="rq-empty-state">Nothing is available.</div>
                : null}
            </div>
          </section>
          <section className="rq-merchant__pane" aria-labelledby="player-goods">
            <h3 id="player-goods">
              <span>Your inventory</span>
              <small>{sellItems.length} sellable</small>
            </h3>
            <div className="rq-merchant__items">
              {sellItems.map((quote) => (
                <ItemTooltip
                  item={quote.item}
                  key={`${quote.slot}:${quote.bag}:${quote.item.id}`}
                >
                  <button
                    className="rq-merchant-item"
                    onClick={(event) => {
                      event.currentTarget.blur();
                      if (event.ctrlKey) {
                        linkItemToChat(quote.item);
                        return;
                      }
                      void Player.instance?.playerMerchant.sell(
                        merchantWindow.npcId,
                        quote.slot,
                        quote.bag,
                      );
                    }}
                  >
                    <span className="rq-merchant-item__icon">
                      <ItemVisual
                        isContainer={(quote.item.bagslots ?? 0) > 0}
                        item={quote.item}
                      />
                    </span>
                    <span className="rq-merchant-item__details">
                      <strong>{quote.item.name.replaceAll('_', ' ')}</strong>
                      <small>
                        {quote.quantity > 1 ? `${quote.quantity} carried` : 'Sell one'}
                      </small>
                    </span>
                    <CoinValue value={quote.unitPrice} />
                  </button>
                </ItemTooltip>
              ))}
              {sellItems.length === 0
                ? <div className="rq-empty-state">No sellable items.</div>
                : null}
            </div>
          </section>
        </div>
      </ReliquaryPanel>
    </div>
  );
};

const Inventory: React.FC = () => {
  const open = useInventoryOpen();
  const player = usePlayerProfile();
  const level = usePlayerLevel();
  useEffect(() => {
    if (!open) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') emitter.emit('toggleInventory');
    };
    window.addEventListener('keydown', closeOnEscape);
    return () => window.removeEventListener('keydown', closeOnEscape);
  }, [open]);
  if (!open) {
    return null;
  }
  const stats = [
    ['STR', player?.str], ['STA', player?.sta], ['DEX', player?.dex],
    ['AGI', player?.agi], ['WIS', player?.wis], ['INT', player?.intel],
    ['CHA', player?.cha],
  ];
  const resists = [
    ['Poison', player?.poisonResist], ['Magic', player?.magicResist],
    ['Disease', player?.diseaseResist], ['Fire', player?.fireResist],
    ['Cold', player?.coldResist],
  ];
  return (
    <div className="rq-modal-layer" role="presentation" onMouseDown={(event) => {
      if (event.target === event.currentTarget) emitter.emit('toggleInventory');
    }}>
      <ReliquaryPanel title="Wayfarer's Kit" eyebrow="Equipment" className="rq-inventory">
        <button className="rq-close" aria-label="Close equipment" onClick={() => emitter.emit('toggleInventory')}>×</button>
        <div className="rq-inventory__identity">
          <strong>{player?.name}</strong>
          <span>Level {level} {CLASS_DATA_NAMES[player?.charClass ?? 1]}</span>
          <span>{getDeityName(player?.deity ?? 0)}</span>
          <Meter label="Health" value={player?.curHp ?? 0} max={player?.maxHp ?? 1} />
          <div className="rq-inventory__coin">
            <small>Carried coin</small>
            <CoinValue value={
              (player?.platinum ?? 0) * 1_000
              + (player?.gold ?? 0) * 100
              + (player?.silver ?? 0) * 10
              + (player?.copper ?? 0)
            } />
          </div>
        </div>
        <div className="rq-equipment-grid">
          {equipmentSlots.map((slot) => (
            <div className="rq-equipment-slot" key={slot}>
              <small>{InventorySlotNames[slot] ?? 'Slot'}</small>
              <ItemButton scale={1} slot={slot} />
            </div>
          ))}
        </div>
        <div className="rq-inventory__stats">
          <h3>Attributes</h3>
          <dl>{stats.map(([name, value]) => <div key={name}><dt>{name}</dt><dd>{value ?? 0}</dd></div>)}</dl>
          <h3>Wards</h3>
          <dl>{resists.map(([name, value]) => <div key={name}><dt>{name}</dt><dd>{value ?? 0}</dd></div>)}</dl>
        </div>
        <div className="rq-general-grid">
          {generalSlots.map((slot) => <ItemButton key={slot} scale={1} slot={slot} />)}
        </div>
        <div className="rq-inventory__footer">
          <button className="rq-danger-button" disabled={!Player.instance?.hasCursorItem} onClick={() => Player.instance?.playerInventory.destroyCursorItem()}>Destroy held item</button>
          <button onClick={() => emitter.emit('toggleInventory')}>Done</button>
        </div>
      </ReliquaryPanel>
    </div>
  );
};

const PagedActions: React.FC<{
  actions: ActionButtonRecord | null;
  type: ActionButtonType;
}> = ({ actions, type }) => {
  const [page, setPage] = useState(0);
  return (
    <>
      <div className="rq-action-grid">
        {Array.from({ length: 12 }, (_, index) => {
          const actionData = actions?.[index + page * 12];
          return (
            <ActionButton
              key={index}
              playerAction
              action={(data) => Player.instance?.doAction(data)}
              actionData={actionData ? { ...actionData, type } : undefined}
              size={64}
              text={actionData?.label}
            />
          );
        })}
      </div>
      <div className="rq-pagination">
        <button disabled={page === 0} onClick={() => setPage((value) => value - 1)}>Previous</button>
        <span>{page + 1}</span>
        <button disabled={!actions?.[(page + 1) * 12]} onClick={() => setPage((value) => value + 1)}>Next</button>
      </div>
    </>
  );
};

const Actions: React.FC<{ open: boolean; onClose: () => void }> = ({ open, onClose }) => {
  const [tab, setTab] = useState<ActionTab>('Main');
  const combat = useCombatButtons();
  const socials = useSocialButtons();
  const abilities = useAbilityButtons();
  const mainActions = useMemo(() => [
    [ActionButtonType.WHO, 'Who', CommandHandler.instance().commandWho],
    [ActionButtonType.INVITE, 'Invite', CommandHandler.instance().commandInvite],
    [ActionButtonType.DISBAND, 'Disband', CommandHandler.instance().commandDisband],
    [ActionButtonType.CAMP, 'Camp', CommandHandler.instance().commandCamp],
    [ActionButtonType.HELP, 'Help', CommandHandler.instance().commandHelp],
    [ActionButtonType.OPTIONS, 'Options', CommandHandler.instance().commandOptions],
  ] as const, []);
  if (!open) return null;
  return (
    <div className="rq-modal-layer" role="presentation" onMouseDown={(event) => {
      if (event.target === event.currentTarget) onClose();
    }}>
      <ReliquaryPanel title="Disciplines" eyebrow="Actions" className="rq-actions">
        <button className="rq-close" aria-label="Close actions" onClick={onClose}>×</button>
        <div className="rq-tabs" role="tablist">
          {actionTabs.map((name) => <button role="tab" aria-selected={tab === name} key={name} onClick={() => setTab(name)}>{name}</button>)}
        </div>
        {tab === 'Main' ? (
          <div className="rq-action-grid rq-action-grid--main">
            {mainActions.map(([type, label, action]) => (
              <ActionButton key={type} action={action} actionData={{ ...UIActions[type], label }} size={96} />
            ))}
          </div>
        ) : null}
        {tab === 'Combat' ? <PagedActions actions={combat} type={ActionButtonType.COMBAT} /> : null}
        {tab === 'Socials' ? <PagedActions actions={socials} type={ActionButtonType.SOCIALS} /> : null}
        {tab === 'Abilities' ? <PagedActions actions={abilities} type={ActionButtonType.ABILITIES} /> : null}
      </ReliquaryPanel>
    </div>
  );
};

const optionTabs = ['Gameplay', 'Controls', 'Interface', 'Audio', 'Video'] as const;
type OptionTab = (typeof optionTabs)[number];

const OptionsMenu: React.FC<{
  open: boolean;
  ui: UISettings;
  onClose: () => void;
  onUIChange: <K extends keyof UISettings>(
    key: K,
    value: UISettings[K],
  ) => void;
  onResetHud: () => void;
}> = ({ open, ui, onClose, onUIChange, onResetHud }) => {
  const [tab, setTab] = useState<OptionTab>('Gameplay');
  const [, setRevision] = useState(0);
  const config = UserConfig.instance.getConfig();

  useEffect(() => {
    if (!open) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      onClose();
    };
    window.addEventListener('keydown', closeOnEscape);
    return () => window.removeEventListener('keydown', closeOnEscape);
  }, [open, onClose]);

  if (!open) return null;

  const updateSetting = <K extends keyof Settings>(
    key: K,
    value: Settings[K],
  ) => {
    UserConfig.instance.updateSetting(key, value);
    setRevision((value) => value + 1);
  };

  return (
    <div className="rq-modal-layer rq-options-layer" role="presentation">
      <ReliquaryPanel title="Options" eyebrow="F10" className="rq-options">
        <button className="rq-close" aria-label="Close options" onClick={onClose}>×</button>
        <div className="rq-options__layout">
          <div className="rq-options__tabs" role="tablist" aria-label="Option categories">
            {optionTabs.map((name) => (
              <button
                key={name}
                role="tab"
                aria-selected={tab === name}
                onClick={() => setTab(name)}
              >
                {name}
              </button>
            ))}
          </div>
          <div className="rq-options__page" role="tabpanel" aria-label={`${tab} options`}>
            {tab === 'Gameplay' ? (
              <>
                <h2>World</h2>
                <label className="rq-option-toggle">
                  <span>
                    <strong>Particle effects</strong>
                    <small>Show ambient and combat particles.</small>
                  </span>
                  <input
                    type="checkbox"
                    checked={config.settings.particles}
                    onChange={(event) => updateSetting('particles', event.target.checked)}
                  />
                </label>
                <div className="rq-options__hint">
                  Equipment, actions, targeting, chat, and movement bindings apply immediately.
                </div>
              </>
            ) : null}
            {tab === 'Controls' ? <ControlsOptions /> : null}
            {tab === 'Interface' ? (
              <>
                <h2>HUD</h2>
                <label className="rq-option-range">
                  <span><strong>UI scale</strong><output>{Math.round(ui.uiScale * 100)}%</output></span>
                  <input
                    type="range"
                    min="0.75"
                    max="1.35"
                    step="0.05"
                    value={ui.uiScale}
                    onChange={(event) => onUIChange('uiScale', Number(event.target.value))}
                  />
                </label>
                <label className="rq-option-range">
                  <span><strong>Text size</strong><output>{ui.fontSize}px</output></span>
                  <input
                    type="range"
                    min="11"
                    max="20"
                    step="1"
                    value={ui.fontSize}
                    onChange={(event) => onUIChange('fontSize', Number(event.target.value))}
                  />
                </label>
                <label className="rq-option-toggle">
                  <span><strong>Tooltips</strong><small>Show contextual item and control help.</small></span>
                  <input
                    type="checkbox"
                    checked={ui.showTooltips}
                    onChange={(event) => onUIChange('showTooltips', event.target.checked)}
                  />
                </label>
                <label className="rq-option-toggle">
                  <span><strong>Lock HUD</strong><small>Prevent moving and resizing HUD windows.</small></span>
                  <input
                    type="checkbox"
                    checked={ui.hudLocked}
                    onChange={(event) => onUIChange('hudLocked', event.target.checked)}
                  />
                </label>
                <button className="rq-options__reset" onClick={onResetHud}>Reset HUD layout</button>
              </>
            ) : null}
            {tab === 'Audio' ? (
              <>
                <h2>Audio</h2>
                <label className="rq-option-toggle">
                  <span><strong>Sound</strong><small>Enable game sound effects.</small></span>
                  <input
                    type="checkbox"
                    checked={config.settings.sound}
                    onChange={(event) => updateSetting('sound', event.target.checked)}
                  />
                </label>
                <label className="rq-option-toggle">
                  <span><strong>Music</strong><small>Enable the game soundtrack.</small></span>
                  <input
                    type="checkbox"
                    checked={config.settings.music}
                    onChange={(event) => updateSetting('music', event.target.checked)}
                  />
                </label>
                <label className="rq-option-range">
                  <span>
                    <strong>Music volume</strong>
                    <output>{Math.round(config.settings.musicVolume * 100)}%</output>
                  </span>
                  <input
                    type="range"
                    min="0"
                    max="1"
                    step="0.05"
                    value={config.settings.musicVolume}
                    onChange={(event) => {
                      const volume = Number(event.target.value);
                      MusicPlayer.setVolume(volume);
                      updateSetting('musicVolume', volume);
                    }}
                  />
                </label>
              </>
            ) : null}
            {tab === 'Video' ? (
              <>
                <h2>Display</h2>
                <label className="rq-option-range">
                  <span>
                    <strong>Render scale</strong>
                    <output>{Math.round(config.settings.renderScale * 100)}%</output>
                  </span>
                  <input
                    type="range"
                    min="0.5"
                    max="1.5"
                    step="0.1"
                    value={config.settings.renderScale}
                    onChange={(event) => updateSetting('renderScale', Number(event.target.value))}
                  />
                </label>
                <button
                  className="rq-options__reset"
                  onClick={() => {
                    if (document.fullscreenElement) {
                      void document.exitFullscreen();
                    } else {
                      void document.documentElement.requestFullscreen();
                    }
                  }}
                >
                  Toggle fullscreen
                </button>
              </>
            ) : null}
          </div>
        </div>
        <div className="rq-options__footer">
          <span>Changes save automatically to the active character configuration.</span>
          <button onClick={onClose}>Done</button>
        </div>
      </ReliquaryPanel>
    </div>
  );
};

export const ReliquaryHUD: React.FC = () => {
  const dispatch = useDispatch();
  const developerVisible = useUIContext(
    (state) => Boolean(state.ui.devWindow.visible),
  );
  const viewportRef = useRef<HTMLDivElement>(null);
  const [actionsOpen, setActionsOpen] = useState(false);
  const [optionsOpen, setOptionsOpen] = useState(false);
  const [ui, setUI] = useState<UISettings>(() =>
    structuredClone(UserConfig.instance.getConfig().ui));
  const [viewport, setViewport] = useState({
    width: window.innerWidth,
    height: window.innerHeight,
  });
  const telemetry = usePlayerTelemetry();
  const target = useTarget();
  const logicalWidth = viewport.width / ui.uiScale;
  const logicalHeight = viewport.height / ui.uiScale;

  const updateUISetting = <K extends keyof UISettings>(
    key: K,
    value: UISettings[K],
  ) => {
    setUI((current) => ({ ...current, [key]: value }));
    UserConfig.instance.updateUISetting(key, value);
  };

  const updateHudWindow = (
    id: HudWindowId,
    placement: HudWindowPlacement,
  ) => {
    setUI((current) => ({
      ...current,
      hudWindows: { ...current.hudWindows, [id]: placement },
    }));
    UserConfig.instance.updateHudWindow(id, placement);
  };

  const focusHudWindow = (id: HudWindowId) => {
    const maximumZ = Math.max(
      ...Object.values(ui.hudWindows).map((window) => window.z),
    );
    const placement = ui.hudWindows[id];
    if (placement.z >= maximumZ) return;
    updateHudWindow(id, { ...placement, z: maximumZ + 1 });
  };

  useEffect(() => {
    const updateViewport = () => {
      const bounds = viewportRef.current?.getBoundingClientRect();
      if (bounds) GameManager.instance.setNewViewport(bounds.x, bounds.y, bounds.width, bounds.height);
    };
    updateViewport();
    const resizeObserver = new ResizeObserver(updateViewport);
    if (viewportRef.current) resizeObserver.observe(viewportRef.current);
    window.addEventListener('resize', updateViewport);
    return () => {
      resizeObserver.disconnect();
      window.removeEventListener('resize', updateViewport);
    };
  }, []);
  useEffect(() => {
    if (!actionsOpen) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setActionsOpen(false);
    };
    window.addEventListener('keydown', closeOnEscape);
    return () => window.removeEventListener('keydown', closeOnEscape);
  }, [actionsOpen]);
  useEffect(() => {
    const refreshUI = () =>
      setUI(structuredClone(UserConfig.instance.getConfig().ui));
    emitter.on('updateUI', refreshUI);
    return () => emitter.off('updateUI', refreshUI);
  }, []);
  useEffect(() => {
    const updateDimensions = () => setViewport({
      width: window.innerWidth,
      height: window.innerHeight,
    });
    window.addEventListener('resize', updateDimensions);
    return () => window.removeEventListener('resize', updateDimensions);
  }, []);
  useEffect(() => {
    const applySettings = () => {
      const settings = UserConfig.instance.getConfig().settings;
      MusicPlayer.setVolume(settings.musicVolume);
      if (!settings.music) MusicPlayer.pause();
      const engine = GameManager.instance.engine;
      engine?.setHardwareScalingLevel(1 / settings.renderScale);
      engine?.resize();
    };
    applySettings();
    emitter.on('updateSettings', applySettings);
    return () => emitter.off('updateSettings', applySettings);
  }, []);
  useEffect(() => {
    const toggleOptions = () => {
      setActionsOpen(false);
      setOptionsOpen((current) => !current);
    };
    const toggleOptionsWithKey = (event: KeyboardEvent) => {
      const configured = UserConfig.instance.getConfig().keyBindings.options;
      if (keyboardEventToBinding(event).toLowerCase() !== configured.toLowerCase()) {
        return;
      }
      event.preventDefault();
      toggleOptions();
    };
    emitter.on('toggleOptions', toggleOptions);
    window.addEventListener('keydown', toggleOptionsWithKey);
    return () => {
      emitter.off('toggleOptions', toggleOptions);
      window.removeEventListener('keydown', toggleOptionsWithKey);
    };
  }, []);
  useEffect(() => {
    const toggleDeveloperTools = (event: KeyboardEvent) => {
      if (event.key !== 'F8') return;
      event.preventDefault();
      dispatch(actions.setWindowVisibility('devWindow', !developerVisible));
    };
    window.addEventListener('keydown', toggleDeveloperTools);
    return () => window.removeEventListener('keydown', toggleDeveloperTools);
  }, [developerVisible, dispatch]);

  const windowProps = (id: HudWindowId) => ({
    id,
    placement: ui.hudWindows[id],
    viewportWidth: logicalWidth,
    viewportHeight: logicalHeight,
    uiScale: ui.uiScale,
    locked: ui.hudLocked,
    onChange: updateHudWindow,
    onFocus: focusHudWindow,
  });

  return (
    <div
      className="rq-hud"
      style={{ fontSize: ui.fontSize }}
      data-tooltips={ui.showTooltips ? 'enabled' : 'disabled'}
    >
      <div ref={viewportRef} id="ui-viewport" className="rq-viewport" />
      <div
        className="rq-hud-stage"
        style={{
          width: logicalWidth,
          height: logicalHeight,
          transform: `scale(${ui.uiScale})`,
        }}
      >
        <TimeOfDayBar />
        <ControllerHud />
        <HudWindow
          {...windowProps('player')}
          label="Character"
          minWidth={190}
          minHeight={120}
          className="rq-hud-window--player"
        >
          <StatusCluster />
        </HudWindow>
        {target ? (
          <HudWindow
            {...windowProps('target')}
            label="Target"
            minWidth={260}
            minHeight={82}
            className="rq-hud-window--target"
          >
            <TargetFrame
              target={target}
              targetDistance={telemetry.targetDistance}
            />
          </HudWindow>
        ) : null}
        <HudWindow
          {...windowProps('compass')}
          label="Compass"
          minWidth={96}
          minHeight={42}
          className="rq-hud-window--compass"
        >
          <Compass heading={telemetry.heading} />
        </HudWindow>
        <HudWindow
          {...windowProps('minimap')}
          label="Map"
          minWidth={170}
          minHeight={230}
          className="rq-hud-window--minimap"
        >
          <aside aria-label="Navigation and journal">
            <SurveyMap telemetry={telemetry} />
          </aside>
        </HudWindow>
        <HudWindow
          {...windowProps('chat')}
          label="Chat"
          minWidth={280}
          minHeight={118}
          className="rq-hud-window--chat"
        >
          <Chat />
        </HudWindow>
        <HudWindow
          {...windowProps('commands')}
          label="Commands"
          minWidth={430}
          minHeight={104}
          className="rq-hud-window--commands"
        >
          <div className="rq-command-deck">
            <Hotbar />
            <QuickControls
              onActions={() => {
                setOptionsOpen(false);
                setActionsOpen(true);
              }}
              onDeveloperTools={() =>
                dispatch(actions.setWindowVisibility('devWindow', true))}
            />
          </div>
        </HudWindow>
      </div>
      <Inventory />
      <CorpseLoot />
      <Merchant />
      <Actions open={actionsOpen} onClose={() => setActionsOpen(false)} />
      <OptionsMenu
        open={optionsOpen}
        ui={ui}
        onClose={() => setOptionsOpen(false)}
        onUIChange={updateUISetting}
        onResetHud={() => {
          UserConfig.instance.resetHudWindows();
          setUI((current) => ({
            ...current,
            hudWindows: structuredClone(UserConfig.instance.getConfig().ui.hudWindows),
          }));
        }}
      />
      <BagsContainer scale={1} />
    </div>
  );
};
