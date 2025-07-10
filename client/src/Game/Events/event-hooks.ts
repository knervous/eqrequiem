import { useEffect, useState } from 'react';
import type { Entity } from '@game/Model/entity';
import { PlayerProfile } from '@game/Net/internal/api/capnp/player';
import Player from '@game/Player/player';
import type { PlayerInventory } from '@game/Player/player-inventory';
import emitter, { Events } from './events';

export const usePlayerName = () => {
  const [playerName, setPlayerName] = useState<string>(Player.instance?.player?.name ?? 'Soandso');
  useEffect(() => {
    const cb = (name: string) => {
      setPlayerName(name);
    };
    emitter.on('playerName', cb);
    return () => {
      emitter.off('playerName', cb);
    };
  }, []);
  return playerName;
};

export const useEventArg = <T extends keyof Events>(
  eventName: T,
  callback: (arg: Events[T]) => void,
  expectedValue: Events[T],
) => {
  useEffect(() => {
    const internalCallback = (arg: Events[T]) => {
      if (arg === expectedValue) {
        callback(arg);
      }
    };
    emitter.on(eventName, internalCallback);
    return () => {
      emitter.off(eventName, internalCallback);
    };
  }, [eventName, expectedValue, callback]);
};

export const useEvent = <T extends keyof Events>(
  eventName: T,
  callback: (arg: Events[T]) => void,
) => {
  useEffect(() => {
    emitter.on(eventName, callback);
    return () => {
      emitter.off(eventName, callback);
    };
  }, [eventName, callback]);
};

export const useEventState = <T extends keyof Events>(
  eventName: T,
  initialState: Events[T],
): Events[T] => {
  const [state, setState] = useState<Events[T]>(initialState);
  useEffect(() => {
    const cb = (value: Events[T]) => {
      setState(value);
    };
    emitter.on(eventName, cb);
    return () => {
      emitter.off(eventName, cb);
    };
  }, [eventName]);

  return state;
};

export const usePlayerProfile = () => {
  const [profile, setProfile] = useState<PlayerProfile | null>(Player.instance?.player ?? null);
  useEffect(() => {
    const cb = (p: PlayerProfile | null) => {
      setProfile(p);
    };
    emitter.on('setPlayer', cb);
    return () => {
      emitter.off('setPlayer', cb);
    };
  }, []);
  return profile; 
};

export const useInventoryOpen = () => {
  const [open, setOpen] = useState<boolean>(false);
  useEffect(() => {
    const cb = () => {
      setOpen((open) => !open);
    };
    emitter.on('toggleInventory', cb);
    return () => {
      emitter.off('toggleInventory', cb);
    };
  }, []);
  return open;
};

export const useTarget = () => {
  const [target, setTarget] = useState<Entity | null>(null);
  useEffect(() => {
    const cb = (t: Entity | null) => {
      setTarget(t);
    };
    emitter.on('target', cb);
    return () => {
      emitter.off('target', cb);
    };
  }, []);
  return target;
};

export const usePlayerInventory = () => {
  const [inventory, setInventory] = useState<PlayerInventory | null>(Player.instance?.playerInventory ?? null);
  useEffect(() => {
    const cb = () => {
      setInventory(Player.instance?.playerInventory ?? null);
    };
    emitter.on('updateInventory', cb);
    return () => {
      emitter.off('updateInventory', cb);
    };
  }, []);
  return inventory;
};
