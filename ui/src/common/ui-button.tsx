import { Box } from "@mui/material";
import React, { useMemo, useState } from "react";
import { useImage } from "../hooks/use-image";

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
  buttonName?: string;
};

export const UiButtonComponent: React.FC<Props> = (props: Props) => {
  const normal = useImage(`${props.buttonName}Normal`);
  const pressed = useImage(`${props.buttonName}Pressed`);
  const hover = useImage(`${props.buttonName}Flyby`);
  const disabled = useImage(`${props.buttonName}Disabled`);

  const [isHovered, setIsHovered] = useState(false);
  const [isPressed, setIsPressed] = useState(false);

  const selectedEntry = useMemo(
    () =>
      props.isDisabled
        ? disabled
        : isPressed
        ? pressed
        : isHovered
        ? hover
        : normal,
    [props.isDisabled, isPressed, isHovered, normal, pressed, hover, disabled]
  );

  return (
    <Box
    className="cursor-default"
      sx={{
        userSelect: "none",
        color: "white",
        width: `${selectedEntry.entry?.width}px`,
        height: `${selectedEntry.entry?.height}px`,
        backgroundImage: `url(${selectedEntry.image})`,
        backgroundPosition: `-${selectedEntry.entry.left}px -${selectedEntry.entry?.top}px`,
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
