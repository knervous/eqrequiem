import { describe, expect, it } from '@jest/globals';

import { createRendererGate } from '../src/renderer/RendererGate';

type Features = {
  models: { load: true };
  effects: { glow: true };
};

describe('typed renderer gate', () => {
  it('loads only the selected renderer and requested feature once', async () => {
    const loads: string[] = [];
    const gate = createRendererGate<'lite' | 'babylonjs', { renderer: string }, Features>(
      {
        lite: async () => {
          loads.push('lite:core');
          return {
            id: 'lite',
            core: { renderer: 'lite' },
            capabilities: new Set<keyof Features>(['models']),
            features: {
              models: async () => {
                loads.push('lite:models');
                return { load: true as const };
              },
            },
          };
        },
        babylonjs: async () => {
          loads.push('babylonjs:core');
          return {
            id: 'babylonjs',
            core: { renderer: 'babylonjs' },
            capabilities: new Set<keyof Features>(['models', 'effects']),
            features: {
              models: async () => ({ load: true as const }),
              effects: async () => ({ glow: true as const }),
            },
          };
        },
      },
      'lite'
    );

    await expect(gate.loadCore()).resolves.toEqual({ renderer: 'lite' });
    const first = gate.loadFeature('models');
    const second = gate.loadFeature('models');
    await expect(first).resolves.toEqual({ load: true });
    await expect(second).resolves.toEqual({ load: true });
    expect(loads).toEqual(['lite:core', 'lite:models']);
    await expect(gate.loadFeature('effects')).rejects.toThrow(
      'does not support feature "effects"'
    );
  });
});

