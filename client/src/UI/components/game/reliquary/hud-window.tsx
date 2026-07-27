import { useEffect, useRef } from 'react';
import type {
  HudWindowId,
  HudWindowPlacement,
} from '@game/Config/types';

type PointerOperation = {
  pointerId: number;
  startX: number;
  startY: number;
  placement: HudWindowPlacement;
};

type Props = {
  id: HudWindowId;
  label: string;
  placement: HudWindowPlacement;
  viewportWidth: number;
  viewportHeight: number;
  uiScale: number;
  locked: boolean;
  minWidth: number;
  minHeight: number;
  className?: string;
  children: React.ReactNode;
  onChange: (id: HudWindowId, placement: HudWindowPlacement) => void;
  onFocus: (id: HudWindowId) => void;
};

const clamp = (value: number, minimum: number, maximum: number) =>
  Math.min(Math.max(value, minimum), Math.max(minimum, maximum));

export const HudWindow: React.FC<Props> = ({
  id,
  label,
  placement,
  viewportWidth,
  viewportHeight,
  uiScale,
  locked,
  minWidth,
  minHeight,
  className = '',
  children,
  onChange,
  onFocus,
}) => {
  const drag = useRef<PointerOperation | null>(null);
  const resize = useRef<PointerOperation | null>(null);
  const width = clamp(placement.width, minWidth, viewportWidth);
  const height = clamp(placement.height, minHeight, viewportHeight);
  const left = clamp(
    placement.x * viewportWidth,
    0,
    viewportWidth - width,
  );
  const top = clamp(
    placement.y * viewportHeight,
    0,
    viewportHeight - height,
  );

  const beginOperation = (
    event: React.PointerEvent<HTMLElement>,
    operation: React.MutableRefObject<PointerOperation | null>,
  ) => {
    if (locked || event.button !== 0) return;
    event.preventDefault();
    event.stopPropagation();
    onFocus(id);
    event.currentTarget.setPointerCapture(event.pointerId);
    operation.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      placement: { ...placement, width, height },
    };
  };

  const moveWindow = (event: React.PointerEvent<HTMLElement>) => {
    const operation = drag.current;
    if (!operation || operation.pointerId !== event.pointerId) return;
    const startLeft = operation.placement.x * viewportWidth;
    const startTop = operation.placement.y * viewportHeight;
    const nextLeft = clamp(
      startLeft + (event.clientX - operation.startX) / uiScale,
      0,
      viewportWidth - width,
    );
    const nextTop = clamp(
      startTop + (event.clientY - operation.startY) / uiScale,
      0,
      viewportHeight - height,
    );
    onChange(id, {
      ...placement,
      x: nextLeft / viewportWidth,
      y: nextTop / viewportHeight,
      width,
      height,
    });
  };

  const resizeWindow = (event: React.PointerEvent<HTMLElement>) => {
    const operation = resize.current;
    if (!operation || operation.pointerId !== event.pointerId) return;
    const nextWidth = clamp(
      operation.placement.width +
        (event.clientX - operation.startX) / uiScale,
      minWidth,
      viewportWidth - left,
    );
    const nextHeight = clamp(
      operation.placement.height +
        (event.clientY - operation.startY) / uiScale,
      minHeight,
      viewportHeight - top,
    );
    onChange(id, {
      ...placement,
      x: left / viewportWidth,
      y: top / viewportHeight,
      width: nextWidth,
      height: nextHeight,
    });
  };

  useEffect(() => {
    const move = (event: PointerEvent) => {
      const dragOperation = drag.current;
      if (dragOperation?.pointerId === event.pointerId) {
        const startLeft = dragOperation.placement.x * viewportWidth;
        const startTop = dragOperation.placement.y * viewportHeight;
        const nextLeft = clamp(
          startLeft + (event.clientX - dragOperation.startX) / uiScale,
          0,
          viewportWidth - width,
        );
        const nextTop = clamp(
          startTop + (event.clientY - dragOperation.startY) / uiScale,
          0,
          viewportHeight - height,
        );
        onChange(id, {
          ...placement,
          x: nextLeft / viewportWidth,
          y: nextTop / viewportHeight,
          width,
          height,
        });
      }

      const resizeOperation = resize.current;
      if (resizeOperation?.pointerId === event.pointerId) {
        onChange(id, {
          ...placement,
          x: left / viewportWidth,
          y: top / viewportHeight,
          width: clamp(
            resizeOperation.placement.width +
              (event.clientX - resizeOperation.startX) / uiScale,
            minWidth,
            viewportWidth - left,
          ),
          height: clamp(
            resizeOperation.placement.height +
              (event.clientY - resizeOperation.startY) / uiScale,
            minHeight,
            viewportHeight - top,
          ),
        });
      }
    };
    const end = (event: PointerEvent) => {
      if (drag.current?.pointerId === event.pointerId) drag.current = null;
      if (resize.current?.pointerId === event.pointerId) resize.current = null;
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', end);
    window.addEventListener('pointercancel', end);
    return () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', end);
      window.removeEventListener('pointercancel', end);
    };
  }, [
    height,
    id,
    left,
    minHeight,
    minWidth,
    onChange,
    placement,
    top,
    uiScale,
    viewportHeight,
    viewportWidth,
    width,
  ]);

  const endOperation = (
    event: React.PointerEvent<HTMLElement>,
    operation: React.MutableRefObject<PointerOperation | null>,
  ) => {
    if (operation.current?.pointerId !== event.pointerId) return;
    operation.current = null;
    event.currentTarget.releasePointerCapture(event.pointerId);
  };

  const beginDragFromZone = (event: React.PointerEvent<HTMLDivElement>) => {
    const target = event.target as HTMLElement;
    if (
      target.closest(
        'button, a, input, textarea, select, [contenteditable="true"]',
      )
      || !target.closest(
        '.rq-hud-panel__header, .rq-compass, .rq-command-deck',
      )
    ) {
      return;
    }
    beginOperation(event, drag);
  };

  const nudgeWindow = (event: React.KeyboardEvent<HTMLButtonElement>) => {
    if (locked || !event.key.startsWith('Arrow')) return;
    event.preventDefault();
    const step = event.shiftKey ? 25 : 5;
    const horizontal =
      event.key === 'ArrowLeft' ? -step : event.key === 'ArrowRight' ? step : 0;
    const vertical =
      event.key === 'ArrowUp' ? -step : event.key === 'ArrowDown' ? step : 0;
    const nextLeft = clamp(left + horizontal, 0, viewportWidth - width);
    const nextTop = clamp(top + vertical, 0, viewportHeight - height);
    onChange(id, {
      ...placement,
      x: nextLeft / viewportWidth,
      y: nextTop / viewportHeight,
      width,
      height,
    });
  };

  const nudgeSize = (event: React.KeyboardEvent<HTMLButtonElement>) => {
    if (!event.key.startsWith('Arrow')) return;
    event.preventDefault();
    const step = event.shiftKey ? 25 : 5;
    const horizontal =
      event.key === 'ArrowLeft' ? -step : event.key === 'ArrowRight' ? step : 0;
    const vertical =
      event.key === 'ArrowUp' ? -step : event.key === 'ArrowDown' ? step : 0;
    onChange(id, {
      ...placement,
      x: left / viewportWidth,
      y: top / viewportHeight,
      width: clamp(width + horizontal, minWidth, viewportWidth - left),
      height: clamp(height + vertical, minHeight, viewportHeight - top),
    });
  };

  return (
    <section
      className={`rq-hud-window ${locked ? 'is-locked' : ''} ${className}`}
      data-hud-window={id}
      onPointerDown={() => onFocus(id)}
      style={{ left, top, width, height, zIndex: placement.z }}
    >
      <button
        className="rq-hud-window__handle"
        aria-label={`Move ${label}`}
        title={locked ? `${label} position locked` : `Move ${label}`}
        onPointerDown={(event) => beginOperation(event, drag)}
        onPointerMove={moveWindow}
        onPointerUp={(event) => endOperation(event, drag)}
        onPointerCancel={(event) => endOperation(event, drag)}
        onKeyDownCapture={nudgeWindow}
      >
        <span>{label}</span>
      </button>
      <div
        className="rq-hud-window__content"
        onPointerDown={beginDragFromZone}
        onPointerMove={moveWindow}
        onPointerUp={(event) => endOperation(event, drag)}
        onPointerCancel={(event) => endOperation(event, drag)}
      >
        {children}
      </div>
      {!locked ? (
        <button
          className="rq-hud-window__resize"
          aria-label={`Resize ${label}`}
          title={`Resize ${label}`}
          onPointerDown={(event) => beginOperation(event, resize)}
          onPointerMove={resizeWindow}
          onPointerUp={(event) => endOperation(event, resize)}
          onPointerCancel={(event) => endOperation(event, resize)}
          onKeyDownCapture={nudgeSize}
        />
      ) : null}
    </section>
  );
};
