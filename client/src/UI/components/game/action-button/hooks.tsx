import { useRef, useCallback } from 'react';
import { UserConfig } from '@game/Config/config';
import type { FullActionData } from './action-button';
import { ActionButtonData } from './constants';

type DropDetail<T> = { data: T; originalEvent: MouseEvent };

export function useImmediateDragClone<T extends HTMLElement>(
  scale = 1,
  actionData: FullActionData | null = null,
) {
  const elementRef = useRef<T | null>(null);
  const cloneRef = useRef<HTMLElement | null>(null);
  const offsetRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  const startRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });

  const onMouseMove = useCallback(
    (e: MouseEvent) => {
      if (!cloneRef.current) {return;}

      const dx = e.clientX - startRef.current.x;
      const dy = e.clientY - startRef.current.y;
      if (Math.abs(dx) > 20 || Math.abs(dy) > 20) {
        cloneRef.current.style.display = 'block';
        if (actionData?.hotButton && elementRef.current) {
          elementRef.current.style.display = 'none';
        }
      }

      cloneRef.current.style.left = `${e.clientX - offsetRef.current.x}px`;
      cloneRef.current.style.top = `${e.clientY - offsetRef.current.y}px`;
    },
    [actionData?.hotButton],
  );

  const onMouseUp = useCallback(
    (e: MouseEvent) => {
      if (cloneRef.current) {
        cloneRef.current.remove();
        cloneRef.current = null;
      }
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);

      const dropTarget = document.elementFromPoint(
        e.clientX,
        e.clientY,
      ) as HTMLElement | null;
      if (elementRef.current) {
        elementRef.current.style.display = 'block';

      }

      if (dropTarget?.contains(elementRef.current)) {
        return;
      }
      let currentElement: HTMLElement | null = dropTarget;
      let hotButtonElement: HTMLElement | null = null;
      while (currentElement) {
        if (currentElement.hasAttribute('data-hot-button')) {
          hotButtonElement = currentElement;
          break;
        }
        currentElement = currentElement.parentElement;
      }

      if (
        !hotButtonElement &&
        actionData?.hotButton &&
        actionData.hotButtonIndex !== undefined
      ) {
        UserConfig.instance.updateHotButton(actionData.hotButtonIndex, null);
        return;
      }

      if (actionData?.hotButton && elementRef.current) {
        elementRef.current.style.display = 'block';
      }
      if (hotButtonElement) {
        const dropEvent = new CustomEvent<DropDetail<ActionButtonData | null>>(
          'action-drop',
          { detail: { data: actionData, originalEvent: e }, bubbles: true },
        );
        hotButtonElement.dispatchEvent(dropEvent);
      }
    },
    [onMouseMove, actionData],
  );

  const onMouseDown = useCallback(
    (e: React.MouseEvent) => {
      if (!elementRef.current) {return;}
      const rect = elementRef.current.getBoundingClientRect();

      offsetRef.current = { x: e.clientX - rect.left, y: e.clientY - rect.top };
      startRef.current = { x: e.clientX, y: e.clientY };

      const clone = elementRef.current.cloneNode(true) as HTMLElement;
      Object.assign(clone.style, {
        position     : 'absolute',
        pointerEvents: 'none',
        margin       : 0,
        zIndex       : 9999,
        top          : `${rect.top}px`,
        left         : `${rect.left}px`,
        transform    : `scale(${scale})`,
        display      : 'none',
      });
      document.body.appendChild(clone);
      cloneRef.current = clone;

      document.addEventListener('mousemove', onMouseMove);
      document.addEventListener('mouseup', onMouseUp, { once: true });
    },
    [scale, onMouseMove, onMouseUp],
  );

  return { elementRef, onMouseDown };
}
