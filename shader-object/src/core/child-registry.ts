import type { ShadoConcreteCtor } from '../types';

const CHILD_BY_CONTAINER = new Map<Function, ShadoConcreteCtor<any>>();

export function setChildForContainer(containerCtor: Function, childCtor: ShadoConcreteCtor<any>) {
  CHILD_BY_CONTAINER.set(containerCtor, childCtor);
}

export function getChildForContainer(containerCtor: Function): ShadoConcreteCtor<any> | undefined {
  return CHILD_BY_CONTAINER.get(containerCtor);
}
