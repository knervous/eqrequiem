import { describe, expect, it } from '@jest/globals';

import { installThinAccessors } from '../src/utils/thin-accessors';

describe('thin struct accessors', () => {
  it('installs a subclass schema even when its base constructor is installed', () => {
    class BaseRecord {
      static getSchema() {
        return {
          fields: [
            {
              name: 'baseValue',
              type: 'f32',
              headerFloatOffset: 0,
              headerFloatSize: 1,
            },
          ],
        };
      }
    }

    class ChildRecord extends BaseRecord {
      static override getSchema() {
        return {
          fields: [
            ...super.getSchema().fields,
            {
              name: 'childValue',
              type: 'f32',
              headerFloatOffset: 1,
              headerFloatSize: 1,
            },
          ],
        };
      }
    }

    installThinAccessors(BaseRecord);
    installThinAccessors(ChildRecord);

    expect(
      Object.getOwnPropertyDescriptor(ChildRecord.prototype, 'childValue')
    ).toBeDefined();
    expect(
      Object.prototype.hasOwnProperty.call(ChildRecord, '__thinInstalled')
    ).toBe(true);
  });
});
