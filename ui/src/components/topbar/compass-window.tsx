import React, { useEffect, useState } from "react";
import { UiWindowComponent } from "../../common/ui-window";
import { Box } from "@mui/material";
import { useUIContext } from "../context";
import atlas from "../../util/atlas.json";
import { ImageCache } from "../../util/image-cache";

// Atlas entries for the compass components
const overlayData = atlas["A_CompassOverlay"];
const stripData = atlas["A_CompassStrip"];

export const CompassWindowComponent: React.FC = () => {
  const state = useUIContext((state) => state.ui.topBarWindow);
  const [overlayUrl, setOverlayUrl] = useState("");
  const [stripUrl, setStripUrl] = useState("");

  useEffect(() => {
    // Load the overlay image URL
    ImageCache.getImageUrl("uifiles/default", overlayData.texture).then((url) => {
      setOverlayUrl(url);
    });
    // Load the strip image URL
    ImageCache.getImageUrl("uifiles/default", stripData.texture).then((url) => {
      setStripUrl(url);
    });
  }, []);

  // Build background style for the overlay using its atlas data
  const getOverlayBackgroundStyle = () => {
    if (!overlayUrl) return {};
    return {
      width: `${overlayData.width}px`,
      height: `${overlayData.height}px`,
      backgroundImage: `url(${overlayUrl})`,
      backgroundPosition: `-${overlayData.left}px -${overlayData.top}px`,
    };
  };

  // Build background style for the strip using its atlas data.
  // Note: The container bounds are defined by the overlay.
  const getStripBackgroundStyle = () => {
    if (!stripUrl) return {};
    return {
      width: `${overlayData.width}px`,
      height: `${overlayData.height}px`,
      backgroundImage: `url(${stripUrl})`,
      backgroundPosition: `-${stripData.left}px -${stripData.top}px`,
    };
  };

  return (
    <UiWindowComponent state={state} windowName="compassWindow">
      <Box
        sx={{
          position: "relative",
          width: `${overlayData.width}px`, // Container size from overlay
          height: `${overlayData.height}px`,
          overflow: "hidden",
        }}
      >
        {/* Compass Strip (underneath) */}
        <Box
          sx={{
            position: "absolute",
            left: 0,
            top: 0,
            zIndex: 0,
            ...getStripBackgroundStyle(),
          }}
        />
        {/* Compass Overlay (on top) */}
        <Box
          sx={{
            position: "absolute",
            left: 0,
            top: 0,
            zIndex: 1,
            ...getOverlayBackgroundStyle(),
          }}
        />
      </Box>
    </UiWindowComponent>
  );
};
