
// File: client/src/Game/Config/use-action-buttons.tsx
import { useEffect, useState } from "react";
import { UserConfig } from "./config";
import { ActionButtonsConfig } from "./types";
import emitter from "@game/Events/events";

export const useActionButtons = (): ActionButtonsConfig | null => {
  const [actionButtons, setActionButtons] = useState<ActionButtonsConfig | null>(null);

  useEffect(() => {
    const handler = () => {
      const config = UserConfig.instance.getConfig();
      setActionButtons({
        hotButtons: config.hotButtons,
        combatButtons: config.combatButtons,
        socialButtons: config.socialButtons,
        abilityButtons: config.abilityButtons,
      });
    };

    emitter.on("updateHotButtons", handler);
    emitter.on("updateAbilityButtons", handler);
    emitter.on("updateCombatButtons", handler);
    emitter.on("updateSocialButtons", handler);

    handler(); // initialize state

    return () => {
      emitter.off("updateHotButtons", handler);
      emitter.off("updateAbilityButtons", handler);
      emitter.off("updateCombatButtons", handler);
      emitter.off("updateSocialButtons", handler);
    };
  }, []);

  return actionButtons;
};
