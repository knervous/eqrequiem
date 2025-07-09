// src/components/UiWindowComponent.tsx
import React, { useEffect, useMemo, useState, useCallback } from "react";
import { UiWindow, UiState } from "../state/initial-state";
import { Box } from "@mui/material";
import { actions } from "../state/reducer";
import { useDebouncedCallback } from "use-debounce";
import { useDispatch } from "../components/context";
import { useDrag } from "../hooks/use-drag";
import { useResize } from "../hooks/use-resize";
import { UiTitleComponent } from "./ui-title";
import "./ui-window.css";
import { useStoneImage } from "@ui/hooks/use-image";

type Props = {
  state: UiWindow;
  index?: number;
  title?: string;
  windowName: keyof UiState;
  children?: React.ReactNode;
  draggable?: boolean;
  closable?: boolean;
  doClose?: () => void;
  background?: string; // Background image path
};

export const UiWindowComponent: React.FC<Props> = ({
  state,
  windowName,
  title,
  index,
  children,
  closable,
  doClose,
  draggable = true,
  background = '',
}) => {
  const dispatcher = useDispatch();
  const { fixed, fixedWidth = 200, fixedHeight = 200 } = state;
  const [minimized, setMinimized] = useState(state.collapsed || false);

  // Dragging is always enabled
  const {
    x,
    y: dragY,
    handleMouseDown: handleDragMouseDown,
  } = useDrag(state.x, state.y);

  // Only use resizing if not fixed
  const initialWidth = fixed && fixedWidth ? fixedWidth : state.width || 200;
  const initialHeight =
    fixed && fixedHeight ? fixedHeight : state.height || 200;
  const resize = fixed
    ? {
      width: initialWidth,
      height: initialHeight,
      y: 0,
      handleMouseDown: () => {},
      isResizing: false,
    }
    : useResize(initialWidth, initialHeight, false);

  const {
    width,
    height,
    y: resizeY,
    handleMouseDown: handleResizeMouseDown,
  } = resize;

  // Combine y from dragging and resizing
  const y = dragY + resizeY;

  // Debounced state update
  const reducerUpdate = useDebouncedCallback(() => {
    dispatcher(
      actions.setWindowTransform(windowName, x, y, width, height, index),
    );
  }, 200);

  useEffect(() => {
    reducerUpdate();
  }, [x, y, width, height, dispatcher, index, windowName, reducerUpdate]);

  useEffect(() => {
    dispatcher(actions.setWindowCollapsed(windowName, minimized, index));
  }, [minimized, dispatcher, windowName, index]);
  // Memoized window styles with minimize behavior


  const bg = useStoneImage(background, true);

  //console.log("Background image for bg", background, bg);
  const windowStyles = useMemo(() => {
    const baseHeight = minimized ? 0 : title ? 30 : 10; // Title bar height or drag handle height
    return {
      position: "fixed" as const,
      top: `${y}px`,
      left: `${x}px`,
      width: `${width}px`,
      height: minimized ? `${baseHeight}px` : `${height}px`,
      backgroundImage: bg ? `url(${bg.image})` : undefined,
      backgroundColor: "rgba(0, 0, 0, 0.7)",
      transition: resize.isResizing ? "" : "height 0.2s ease-in-out", // Smooth height transition
    };
  }, [x, y, width, height, minimized, title, resize, bg]);
  const toggleMinimize = useCallback(() => {
    setMinimized((prev) => !prev);
  }, []);
  return (
    <Box className="ui-window" style={windowStyles} data-ui-window>
      {title ? (
        <UiTitleComponent
          closable={closable}
          doClose={doClose}
          name={title}
          minimized={minimized}
          draggable={draggable}
          toggleMinimize={toggleMinimize}
          handleDragMouseDown={handleDragMouseDown}
        />
      ) : (
        <Box
          className="cursor-drag"
          sx={{
            position: "absolute",
            top: "-5px",
            left: 0,
            width: "100%",
            height: "10px",
            zIndex: 10,
          }}
          onMouseDown={handleDragMouseDown}
        />
      )}

      {/* Resize Handles (only if not fixed and not minimized) */}
      {!fixed && !minimized && (
        <>
          <Box
            className="resize-ew"
            sx={{
              position: "absolute",
              top: 0,
              right: 0,
              width: "5px",
              height: "100%",
              zIndex: 1000,
              backgroundColor: "rgba(0, 0, 0, 0.1)",
              "&:hover": { backgroundColor: "rgba(0, 0, 0, 0.3)" },
            }}
            onMouseDown={(e) => handleResizeMouseDown(e, "right")}
          />
          <Box
            className="resize-ns"
            sx={{
              position: "absolute",
              bottom: 0,
              left: 0,
              width: "100%",
              height: "5px",
              zIndex: 1000,
              backgroundColor: "rgba(0, 0, 0, 0.1)",
              "&:hover": { backgroundColor: "rgba(0, 0, 0, 0.3)" },
            }}
            onMouseDown={(e) => handleResizeMouseDown(e, "bottom")}
          />
          <Box
            className="resize-nwse"
            sx={{
              position: "absolute",
              bottom: -2,
              right: -2,
              width: "13px",
              height: "13px",
              zIndex: 1001,
              borderRight: "2px solid rgba(255, 255, 255, 0.2)",
              borderBottom: "2px solid rgba(255, 255, 255, 0.2)",
              "&:hover": { borderColor: "rgba(255, 255, 255, 0.5)" },
            }}
            onMouseDown={(e) => handleResizeMouseDown(e, "bottomRight")}
          />
          <Box
            className="resize-nesw"
            sx={{
              position: "absolute",
              top: -2,
              right: -2,
              width: "13px",
              height: "13px",
              zIndex: 1001,
              borderRight: "2px solid rgba(255, 255, 255, 0.2)",
              borderTop: "2px solid rgba(255, 255, 255, 0.2)",
              "&:hover": { borderColor: "rgba(255, 255, 255, 0.8)" },
            }}
            onMouseDown={(e) => handleResizeMouseDown(e, "topRight")}
          />
        </>
      )}

      {/* Content (hidden when minimized) */}
      {!minimized && children}
    </Box>
  );
};
