import { useEffect, useState } from 'react';
import type { Entity } from '@game/Model/entity';
import { PlayerProfile } from '@game/Net/internal/api/capnp/player';
import Player from '@game/Player/player';
import type { InventorySlot, NullableItemInstance } from '@game/Player/player-constants';
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
  expectedValue: Events[T] | ((val: any) => boolean) = () => true,
) => {
  useEffect(() => {
    const internalCallback = (arg: Events[T]) => {
      if (typeof expectedValue === 'function') {
        if (expectedValue(arg)) {
          callback(arg);
        }
        return;
      }
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

export const useEventArgState = <T extends keyof Events>(
  eventName: T,
  expectedValue: Events[T] | ((val: any) => boolean) = () => true,
  initialState: Events[T] | null = null,
) => {
  const [state, setState] = useState<Events[T] | null>(initialState);
  useEffect(() => {
    const internalCallback = (arg: Events[T]) => {
      if (typeof expectedValue === 'function') {
        if (expectedValue(arg)) {
          setState(arg);
        }
        return;
      }
      if (arg === expectedValue) {
        setState(arg);
      }
    };
    emitter.on(eventName, internalCallback);
    return () => {
      emitter.off(eventName, internalCallback);
    };
  }, [eventName, expectedValue]);
  return state;
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

export const usePlayerLevel = () => {
  const [level, setLevel] = useState<number>(Player.instance?.player?.level ?? 1);
  useEffect(() => {
    const cb = (level: number) => {
      setLevel(level);
    };
    emitter.on('levelUpdate', cb);
    return () => {
      emitter.off('levelUpdate', cb);
    };
  }, []);
  return level;
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

export const useInventorySlot = (slot: InventorySlot, bagSlot: number) => {
  const [item, setItem] = useState<NullableItemInstance>(Player.instance?.playerInventory.get(slot, bagSlot) ?? null);
  useEffect(() => {
    const cb = (data: { slot: number, bag?: number }) => {
      if (data.slot !== slot || (data.bag !== undefined && data.bag !== bagSlot)) {
        return;
      }
      setItem(Player.instance?.playerInventory.get(data.slot, data.bag) ?? null);
    };
    emitter.on('updateInventorySlot', cb);
    return () => {
      emitter.off('updateInventorySlot', cb);
    };
  }, [slot, bagSlot]);
  return item;
};

export const usePlayerInventory = () => {
  const [inventory, setInventory] = useState<PlayerInventory | null>(Player.instance?.playerInventory ?? null);
  const [_, setCount] = useState<number>(0);
  useEffect(() => {
    const cb = () => {
      setInventory(Player.instance?.playerInventory ?? null);
      setCount((prevCount) => prevCount + 1);
    };
    emitter.on('updateInventory', cb);
    return () => {
      emitter.off('updateInventory', cb);
    };
  }, []);
  return inventory;
};
