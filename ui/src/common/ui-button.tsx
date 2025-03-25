import { Box } from "@mui/material";
import React, { useEffect, useMemo, useState } from "react";
import { ImageCache } from "../util/image-cache";

import atlas from "../util/atlas";

type AtlasEntry = {
  texture: string; // Path to the texture file (e.g., "uifiles/default/atlas.tga")
  left: number;
  top: number;
  width: number;
  height: number;
};

type Props = {
  onClick: () => void;
  children?: React.ReactNode;
  normal?: AtlasEntry;
  pressed?: AtlasEntry;
  hover?: AtlasEntry;
  disabled?: AtlasEntry;
  isDisabled?: boolean;
  buttonName?: string
};


export const UiButtonComponent: React.FC<Props> = (props: Props) => {
  const { normal, pressed, hover, disabled } = useMemo(() => {
    return {
      normal: atlas[`${props.buttonName}Normal`],
      pressed: atlas[`${props.buttonName}Pressed`],
      hover: atlas[`${props.buttonName}Flyby`],
      disabled: atlas[`${props.buttonName}Disabled`],
    }
  }, [props.buttonName]);

  // State for interaction
  const [isHovered, setIsHovered] = useState(false);
  const [isPressed, setIsPressed] = useState(false);

  // Texture map for states
  const [textureMap, setTextureMap] = useState<Map<string, string>>(new Map());
  
  // Determine current state
  const currentState = props.isDisabled
    ? "disabled"
    : isPressed
    ? "pressed"
    : isHovered
    ? "hover"
    : "normal";


  useEffect(() => {
    const loadTextures = async () => {
      const map = new Map<string, string>();

      // Normal state: fallback to path if no atlas
      if (normal) {
        const url = await ImageCache.getImageUrl('uifiles/default', normal.texture);
        map.set("normal", url);
      }

      // Pressed state: atlas or pressedPath
      if (pressed) {
        const url = await ImageCache.getImageUrl('uifiles/default', pressed.texture);
        map.set("pressed", url);
      }

      // Hover state
      if (hover) {
        const url = await ImageCache.getImageUrl('uifiles/default', hover.texture);
        map.set("hover", url);
      }

      // Disabled state
      if (disabled) {
        const url = await ImageCache.getImageUrl('uifiles/default', disabled.texture);
        map.set("disabled", url);
      }

      setTextureMap(map);
    };

    loadTextures();
  }, [normal, pressed, hover, disabled]);
  // Compute background style based on atlas or full image
  const getBackgroundStyle = () => {
    const textureUrl = textureMap.get(currentState);
    if (!textureUrl) {
      return undefined;}

    const atlasEntry = {
      normal: normal,
      pressed: pressed,
      hover: hover,
      disabled: disabled,
    }[currentState];

    if (atlasEntry) {
      // Use atlas region with background-position and size
      return {
        width: `${atlasEntry.width}px`,
        height: `${atlasEntry.height}px`,
        backgroundImage: `url(${textureUrl})`,
        backgroundPosition: `-${atlasEntry.left}px -${atlasEntry.top}px`,
      };
    }
    // Full image fallback
    return { backgroundImage: `url(${textureUrl})` };
  };

  return (
    <Box
      sx={{
        userSelect: "none",
        color: "white",
        ...getBackgroundStyle(), // Dynamic background based on state
      }}
      onMouseEnter={() => !props.isDisabled && setIsHovered(true)}
      onMouseLeave={() => {
        setIsHovered(false);
        setIsPressed(false);
      }}
      onMouseDown={() => !props.isDisabled && setIsPressed(true)}
      onMouseUp={() => setIsPressed(false)}
      onClick={() => !props.isDisabled && props.onClick()}
    >
      {props.children}
    </Box>
  );
};