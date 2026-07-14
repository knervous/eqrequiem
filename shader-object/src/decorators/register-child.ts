import type { ShadoConcreteCtor } from '../types';
import { setChildForContainer } from '../core/child-registry';

/**
 * Decorate a ShadoActor subclass to auto-register it as the child type
 * for the given container class. Runs at module import time.
 *
 * Usage:
 *   @RegisterChildFor(ShadoInstanceContainer)
 *   export class TestClass extends ShadoActor { ... }
 */
export function RegisterChildFor(containerCtor: Function) {
  return function <T extends ShadoConcreteCtor<any>>(childCtor: T) {
    setChildForContainer(containerCtor, childCtor);
    return childCtor;
  };
}
