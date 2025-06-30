import React, { useEffect, useState, useRef } from "react";
import { Allotment, AllotmentHandle } from "allotment";
import "allotment/dist/style.css";
import { StoneLeft } from "./left/stone-left";
import { Box } from "@mui/material";
import { StoneRight } from "./right/stone-right";
import { StoneMiddleBottom } from "./middle/stone-middle-bottom";
import GameManager from "@game/Manager/game-manager";
import { StoneMiddleTop } from "./middle/top/stone-middle-top";

export const StoneUIBase: React.FC = () => {
  const [leftPaneWidth, setLeftPaneWidth] = useState(130);
  const [rightPaneWidth, setRightPaneWidth] = useState(130);
  const [viewportHeight, setViewportHeight] = useState(window.innerHeight - 200);
  const [scaleFactor, setScaleFactor] = useState(1);
  const viewportRef = useRef<HTMLDivElement>(null);
  const allotmentRef = useRef<AllotmentHandle>(null);
  const isDraggingRef = useRef(false); // Track if user is dragging

  useEffect(() => {
    const onResize = () => {
      if (isDraggingRef.current) return; //

      const scaleFactor = window.innerHeight / 930;
      setScaleFactor(scaleFactor);
      const newLeftPaneWidth = Math.max(50, Math.min(120, 130 * scaleFactor));
      const newRightPaneWidth = Math.max(50, Math.min(125, 130 * scaleFactor));

      setLeftPaneWidth(newLeftPaneWidth);
      setRightPaneWidth(newRightPaneWidth);

      if (allotmentRef.current) {
        allotmentRef.current.resize([
          newLeftPaneWidth,
          window.innerWidth - newLeftPaneWidth - newRightPaneWidth,
          newRightPaneWidth,
        ]);
      }
    };

    onResize();

    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  return (
    <Box
      sx={{
        width: "100vw",
        height: "100vh",
        background: "transparent",
        position: "fixed",
      }}
    >
      <Allotment
        vertical={false}
        defaultSizes={[130, window.innerWidth - 130 - 130, 130]}
        ref={allotmentRef}
        onDragStart={() => {
          isDraggingRef.current = true; // Set dragging flag
        }}
        onDragEnd={() => {
          isDraggingRef.current = false; // Clear dragging flag
        }}
        onChange={(sizes) => {
          setLeftPaneWidth(sizes[0]);
          setRightPaneWidth(sizes[2]);
        }}
      >
        {/* Left pane */}
        <Allotment.Pane minSize={50} preferredSize={130} maxSize={120}>
          <StoneLeft width={leftPaneWidth} />
        </Allotment.Pane>

        {/* Center pane with vertical split */}
        <Allotment.Pane minSize={100}>
          <Allotment
            vertical={true}
            defaultSizes={[window.innerHeight - 200, 200]}
            onChange={(sizes) => {
              if (viewportRef.current) {
                // Update viewport height based on the center pane size
                setViewportHeight(
                  sizes[0], // Subtract height of bottom pane
                );
                // Get bounding rect relative to the window
                const rect = viewportRef.current.getBoundingClientRect();
                GameManager.instance.setNewViewport(
                  rect.x,
                  rect.y,
                  rect.width,
                  rect.height,
                );
              }
            }}
          >
            {/* Top pane (passthrough) */}
            <Allotment.Pane minSize={100}>
              <Box
                id={'ui-viewport'}
                ref={viewportRef}
                sx={{
                  // position: "absolute",
                  //zIndex: 1, 
                  pointerEvents: "none",
                  background: "transparent",
                  height: "100%",
                }}
              />
              <StoneMiddleTop scale={scaleFactor} width={window.innerWidth - leftPaneWidth - rightPaneWidth} height={viewportHeight} />
            </Allotment.Pane>

            {/* Bottom pane (container) */}
            <Allotment.Pane minSize={100} preferredSize={200}>
              <StoneMiddleBottom
                scale={scaleFactor}
                width={window.innerWidth - leftPaneWidth - rightPaneWidth}
                height={window.innerHeight - viewportHeight}
              />
            </Allotment.Pane>
          </Allotment>
        </Allotment.Pane>

        {/* Right pane */}
        <Allotment.Pane minSize={50} preferredSize={125} maxSize={125}>
          <StoneRight width={rightPaneWidth} />
        </Allotment.Pane>
      </Allotment>
    </Box>
  );
};
