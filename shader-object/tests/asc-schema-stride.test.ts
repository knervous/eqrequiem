import { describe, expect, test } from '@jest/globals';

import { emitASUnmanagedFromSchema } from '../src/asc/schema';
import { EqShowcaseActor } from '../src/showcase/EqShowcase';

describe('AssemblyScript schema stride', () => {
  test('matches the padded JS AoS stride for showcase actors', () => {
    const actor = EqShowcaseActor.getSchema();
    const source = emitASUnmanagedFromSchema({
      name: 'StrideTestContainer',
      headerFloatCount: 0,
      fields: [],
      // Runtime arrays are keyed by their field name, not the child schema
      // name. This is the layout that exposed the prior zero/short SIZEOF.
      structArrays: { instances: { schema: actor } },
    });

    expect(actor.headerFloatCount).toBe(48);
    expect(source).toContain(
      `export const SIZEOF_${actor.name}Header: i32 = ${actor.headerFloatCount * 4};`,
    );
  });
});
