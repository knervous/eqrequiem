import { useEffect, useState } from "react";
import emitter from "./events";
import type { Entity } from "@game/Model/entity";

export const usePlayerName = () => {
  const [playerName, setPlayerName] = useState<string>("Soandso");
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