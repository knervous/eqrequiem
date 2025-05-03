import React, { useEffect, useRef, useState } from "react";
import { Box } from "@mui/material";

import { UiWindowComponent } from "../../../common/ui-window";
import { useUIContext } from "../../context";
import { useImage } from "../../../hooks/use-image";
import Player from "@game/Player/player";

// Atlas entries for the compass components
export const CompassWindowComponent: React.FC = () => {
  const state = useUIContext((state) => state.ui.compassWindow);
  const overlay = useImage("A_CompassOverlay");
  const strip = useImage("A_CompassStrip", true);
  const [offset, setOffset] = useState(0);
  const prevRotationRef = useRef(0); // Track previous rotation
  const totalDegreesRef = useRef(0); // Accumulate total degrees for continuity

  useEffect(() => {
    const interval = setInterval(() => {
      // Get player rotation in radians from Godot
      try {
        const rotation =
      Player.instance?.getPlayerRotation()
        ?.y ?? 0;

        // Convert current and previous rotations to degrees
        const currentDegrees = (rotation * 180) / Math.PI;
        const prevDegrees = (prevRotationRef.current * 180) / Math.PI;

        // Calculate the difference, accounting for wrap-around
        let deltaDegrees = currentDegrees - prevDegrees;
        if (deltaDegrees > 180) {
          deltaDegrees -= 360; // Adjust for crossing from PI to -PI
        } else if (deltaDegrees < -180) {
          deltaDegrees += 360; // Adjust for crossing from -PI to PI
        }

        // Update total degrees for continuous rotation
        totalDegreesRef.current += deltaDegrees;

        // Update previous rotation
        prevRotationRef.current = rotation;

        // Calculate offset based on total degrees
        const stripWidth = strip.entry.width; // Width of one instance of the strip image
        const offsetPerDegree = stripWidth / 360; // Pixels per degree
        const newOffset = (totalDegreesRef.current % 360) * offsetPerDegree * -1;

        setOffset(newOffset);
      } finally {
        // Do nothing
      }
    }, 10); // Update every 50ms for smoother movement (adjust as needed)

    // Cleanup interval on unmount
    return () => clearInterval(interval);
  }, [strip.entry.width]);
  return (
    <UiWindowComponent
      state={state}
      windowName="compassWindow"
    >
      <Box
        sx={{
          position: "relative",
          width: `${overlay.entry.width}px`,
          height: `${overlay.entry.height}px`,
          overflow: "hidden",
        }}
      >
        {/* Compass Strip (underneath) */}
        <Box
          sx={{
            position: "absolute",
            zIndex: 0,
            width: `${strip.entry.width * 2}px`,
            height: `${strip.entry.height}px`,
            backgroundImage: `url(${strip.image})`,
            backgroundPosition: `${-offset + strip.entry.width / 2}px 0px`,
            backgroundRepeat: "repeat-x",
          }}
        />
        {/* Compass Overlay (on top) */}
        <Box
          sx={{
            position: "absolute",
            left: 0,
            top: 0,
            zIndex: 1,
            width: `${overlay.entry.width}px`,
            height: `${overlay.entry.height}px`,
            backgroundImage: `url(${overlay.image})`,
            backgroundPosition: `-${overlay.entry.left}px -${overlay.entry.top}px`,
          }}
        />
      </Box>
    </UiWindowComponent>
  );
};
