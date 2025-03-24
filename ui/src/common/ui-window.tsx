import React, { useEffect, useState, useRef } from "react";
import { UiWindow, UiState } from "../state/initial-state";
import { Box } from "@mui/material";
import { UiAction, actions } from "../state/reducer";
import { useDebounce } from "use-debounce";

import "./ui-window.css";

type Props = {
  state: UiWindow;
  index: number;
  title?: string;
  windowName: keyof UiState;
  dispatcher: React.Dispatch<UiAction>;
  children: React.ReactNode;
};

export const UiWindowComponent: React.FC<Props> = (props: Props) => {
  const { state, dispatcher, windowName, title, index, children } = props;

  // Local state for transform values
  const [x, setX] = useState(state.x);
  const [y, setY] = useState(state.y);
  const [width, setWidth] = useState(state.width || 200);
  const [height, setHeight] = useState(state.height || 200);

  // Refs for drag & resize tracking
  const draggingRef = useRef(false);
  const resizingRef = useRef<{ type: "right" | "bottom" | "bottomRight" | "topRight" | null }>({ type: null });
  const dragStartPos = useRef({ x: 0, y: 0 });
  const windowStartPos = useRef({ x: 0, y: 0 });
  const resizeStartPos = useRef({ x: 0, y: 0 });
  const windowStartSize = useRef({ width, height });
  const windowStartY = useRef(y);

  const [reducerUpdate] = useDebounce(() => {
    dispatcher(
      actions.setWindowTransform(windowName, x, y, width, height, index)
    );
  }, 200);

  useEffect(reducerUpdate, [
    dispatcher,
    index,
    windowName,
    x,
    y,
    width,
    height,
  ]);

  /* ====================
   * Dragging Handlers
   * ==================== */
  const handleDragMouseDown = (e: React.MouseEvent) => {
    draggingRef.current = true;
    dragStartPos.current = { x: e.clientX, y: e.clientY };
    windowStartPos.current = { x, y };

    document.addEventListener("mousemove", handleDragMouseMove);
    document.addEventListener("mouseup", handleDragMouseUp);
  };

  const handleDragMouseMove = (e: MouseEvent) => {
    if (!draggingRef.current) return;
    const dx = e.clientX - dragStartPos.current.x;
    const dy = e.clientY - dragStartPos.current.y;
    setX(windowStartPos.current.x + dx);
    setY(windowStartPos.current.y + dy);
  };

  const handleDragMouseUp = () => {
    draggingRef.current = false;
    document.removeEventListener("mousemove", handleDragMouseMove);
    document.removeEventListener("mouseup", handleDragMouseUp);
  };

  /* ====================
   * Resizing Handlers
   * ==================== */
  const handleResizeMouseDown = (e: React.MouseEvent, type: "right" | "bottom" | "bottomRight" | "topRight") => {
    e.stopPropagation();
    resizingRef.current = { type };
    resizeStartPos.current = { x: e.clientX, y: e.clientY };
    windowStartSize.current = { width, height };
    windowStartY.current = y;

    document.addEventListener("mousemove", handleResizeMouseMove);
    document.addEventListener("mouseup", handleResizeMouseUp);
  };

  const handleResizeMouseMove = (e: MouseEvent) => {
    if (!resizingRef.current.type) return;
    const dx = e.clientX - resizeStartPos.current.x;
    const dy = e.clientY - resizeStartPos.current.y;
    const minSize = 50;

    switch (resizingRef.current.type) {
      case "right":
        setWidth(Math.max(minSize, windowStartSize.current.width + dx));
        break;
      case "bottom":
        setHeight(Math.max(minSize, windowStartSize.current.height + dy));
        break;
      case "bottomRight":
        setWidth(Math.max(minSize, windowStartSize.current.width + dx));
        setHeight(Math.max(minSize, windowStartSize.current.height + dy));
        break;
      case "topRight":
        setWidth(Math.max(minSize, windowStartSize.current.width + dx));
        setHeight(Math.max(minSize, windowStartSize.current.height - dy));
        setY(windowStartY.current + dy);
        break;
    }
  };

  const handleResizeMouseUp = () => {
    resizingRef.current = { type: null };
    document.removeEventListener("mousemove", handleResizeMouseMove);
    document.removeEventListener("mouseup", handleResizeMouseUp);
  };

  return (
    <Box
      className="ui-window"
      style={{
        position: "fixed",
        top: `${y}px`,
        left: `${x}px`,
        width: `${width}px`,
        height: `${height}px`,
      }}
      data-ui-window
    >
      {/* Drag Handle */}
      {!title && (
        <Box
          sx={{
            position: "absolute",
            top: 0,
            left: 0,
            width: "100%",
            height: "20px",
            cursor: "grab",
            zIndex: 10,
          }}
          onMouseDown={handleDragMouseDown}
        />
      )}

      {title && (
        <Box
          sx={{
            cursor: "grab",
            userSelect: "none",
          }}
          onMouseDown={handleDragMouseDown}
          className="ui-window-title"
        >
          {title}
        </Box>
      )}

      {/* Right Resize Handle */}
      <Box
        sx={{
          position: "absolute",
          top: 0,
          right: 0,
          width: "5px",
          height: "100%",
          cursor: "ew-resize",
          zIndex: 1000,
          backgroundColor: "rgba(0, 0, 0, 0.1)",
          "&:hover": {
            backgroundColor: "rgba(0, 0, 0, 0.3)",
          },
        }}
        onMouseDown={(e) => handleResizeMouseDown(e, "right")}
      />

      {/* Bottom Resize Handle */}
      <Box
        sx={{
          position: "absolute",
          bottom: 0,
          left: 0,
          width: "100%",
          height: "5px",
          cursor: "ns-resize",
          zIndex: 1000,
          backgroundColor: "rgba(0, 0, 0, 0.1)",
          "&:hover": {
            backgroundColor: "rgba(0, 0, 0, 0.3)",
          },
        }}
        onMouseDown={(e) => handleResizeMouseDown(e, "bottom")}
      />

      {/* Bottom-Right Resize Handle (Minimal L Shape) */}
      <Box
        sx={{
          position: "absolute",
          bottom: -2,
          right: -2,
          width: "10px",
          height: "10px",
          cursor: "nwse-resize",
          zIndex: 1,
          borderRight: "2px solid rgba(255, 255, 255, 0.2)", // Vertical part of L
          borderBottom: "2px solid rgba(255, 255, 255, 0.2)", // Horizontal part of L
          "&:hover": {
            borderColor: "rgba(255, 255, 255, 0.5)", // Darker on hover
          },
        }}
        onMouseDown={(e) => handleResizeMouseDown(e, "bottomRight")}
      />

      {/* Top-Right Resize Handle (Minimal L Shape) */}
      <Box
        sx={{
          position: "absolute",
          top: -2,
          right: -2,
          width: "10px",
          height: "10px",
          cursor: "nesw-resize",
          zIndex: 1,
          borderRight: "2px solid rgba(255, 255, 255, 0.2)", // Vertical part of L
          borderTop: "2px solid rgba(255, 255, 255, 0.2)", // Horizontal part of L
          "&:hover": {
            borderColor: "rgba(255, 255, 255, 0.8)", // Darker on hover
          },
        }}
        onMouseDown={(e) => handleResizeMouseDown(e, "topRight")}
      />

      {/* Content */}
      {children}
    </Box>
  );
};