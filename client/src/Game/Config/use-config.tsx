// File: client/src/Game/Config/use-action-buttons.tsx
import { useEffect, useMemo, useState } from 'react';
import emitter from '@game/Events/events';
import { UserConfig } from './config';
import { ActionButtonRecord, ActionButtonsConfig } from './types';

function createUseButtonsHook<
  K extends keyof ActionButtonsConfig,
  E extends 'Combat' | 'Ability' | 'Socials' | 'Hot'
>(category: K, event: `update${E}Buttons`, addIndex: boolean = true) {
  return (): ActionButtonRecord | null => {
    const [buttons, setButtons] = useState<ActionButtonRecord | null>(null);
    useEffect(() => {
      const handler = () => {
        const raw = UserConfig.instance.getConfig()[category] as ActionButtonRecord;
        const cloned = structuredClone(raw) as ActionButtonRecord;
        if (addIndex) {
          for (const [k, v] of Object.entries(cloned)) {
            v && (v.index = Number(k));
          }
        }
        setButtons(cloned);
      };
      emitter.on(event as any, handler);
      handler();
      return () => { emitter.off(event as any, handler); };
    }, []);
    return buttons;
  };
}

export const useCombatButtons = createUseButtonsHook('combatButtons', 'updateCombatButtons');
export const useAbilityButtons = createUseButtonsHook('abilityButtons', 'updateAbilityButtons');
export const useSocialButtons = createUseButtonsHook('socialButtons', 'updateSocialsButtons');
export const useHotButtons = createUseButtonsHook('hotButtons', 'updateHotButtons', false);

export const useActionButtons = (): ActionButtonsConfig | null => {
  const combatButtons = useCombatButtons();
  const abilityButtons = useAbilityButtons();
  const socialButtons = useSocialButtons();
  const hotButtons = useHotButtons();

  return useMemo<ActionButtonsConfig | null>(() => {
    if (!combatButtons || !abilityButtons || !socialButtons || !hotButtons) {
      return null;
    }
    return {
      combatButtons,
      abilityButtons,
      socialButtons,
      hotButtons,
    };
  }, [combatButtons, abilityButtons, socialButtons, hotButtons]);
};
