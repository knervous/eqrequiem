import { useEffect, useState } from "react";
import emitter from "./events";
import type { Entity } from "@game/Model/entity";
import Player from "@game/Player/player";
import { PlayerProfile } from "@game/Net/internal/api/capnp/player";

export const usePlayerName = () => {
  const [playerName, setPlayerName] = useState<string>(Player.instance?.player?.name ?? "Soandso");
  useEffect(() => {
    const cb = (name: string) => {
      setPlayerName(name);
    };
    emitter.on("playerName", cb);
    return () => {
      emitter.off("playerName", cb);
    };
  }, []);
  return playerName;
};

export const usePlayerProfile = () => {
  const [profile, setProfile] = useState<PlayerProfile | null>(Player.instance?.player ?? null);
  useEffect(() => {
    const cb = (p: PlayerProfile | null) => {
      setProfile(p);
    };
    emitter.on("setPlayer", cb);
    return () => {
      emitter.off("setPlayer", cb);
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
    emitter.on("toggleInventory", cb);
    return () => {
      emitter.off("toggleInventory", cb);
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
    emitter.on("target", cb);
    return () => {
      emitter.off("target", cb);
    };
  }, []);
  return target;
};