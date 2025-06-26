import { Box, BoxProps, SxProps, Typography } from "@mui/material";
import React, { useMemo, useState } from "react";
import { ImageEntry, useImage, useStoneImage } from "../hooks/use-image";
import classNames from "classnames";

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
  className?: string;
  icon?: React.ReactNode;
  normal?: AtlasEntry;
  pressed?: AtlasEntry;
  hover?: AtlasEntry;
  disabled?: AtlasEntry;
  isDisabled?: boolean;
  buttonName?: string;
  sx?: SxProps;
  textSx?: SxProps;
  text?: string;
  scale?: number;
  textFontSize?: string;
  selected?: boolean;
  stone?: boolean;
  entrySx?: (entry: ImageEntry) => SxProps;
  crop?: boolean; // If true, use cropped images
} & BoxProps

export const UiButtonComponent: React.FC<Props> = (props: Props) => {
  const buttonName = props.buttonName ?? "A_BigBtn";
  const normal = useStoneImage(`${buttonName}Normal`, props.crop);
  const pressed = useStoneImage(`${buttonName}Pressed`, props.crop);
  const hover = useStoneImage(`${buttonName}Flyby`, props.crop);
  const disabled = useStoneImage(`${buttonName}Disabled`, props.crop);

  const [isHovered, setIsHovered] = useState(false);
  const [isPressed, setIsPressed] = useState(false);

  const selectedEntry = useMemo(
    () =>
      props.isDisabled
        ? disabled
        : (isPressed || props.selected)
          ? pressed
          : isHovered
            ? hover
            : normal,
    [
      props.isDisabled,
      props.selected,
      isPressed,
      isHovered,
      normal,
      pressed,
      hover,
      disabled,
    ],
  );

  return !selectedEntry.entry ? null : (
    <Box
      className={classNames("cursor-default", "eq-button", props.className)}
      sx={{
        userSelect: "none",
        color: "white",
        width: `${selectedEntry.entry?.width}px`,
        height: `${selectedEntry.entry?.height}px`,
        backgroundImage: `url(${selectedEntry.image})`,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        alignContent: "center",
        backgroundSize: props.crop ? "cover" : "",
        backgroundPosition: props.crop ? '' : `-${selectedEntry.entry.left}px -${selectedEntry.entry?.top}px`,
        ...(props.scale ? { transform: `scale(${props.scale})` } : {}),
        ...(props.sx ?? {}),
        ...(props.entrySx ? props.entrySx(selectedEntry) : {}),
      }}
      onMouseEnter={() => !props.isDisabled && setIsHovered(true)}
      onMouseLeave={() => {
        setIsHovered(false);
        setIsPressed(false);
      }}
      onMouseDown={() => !props.isDisabled && setIsPressed(true)}
      onMouseUp={() => setIsPressed(false)}
      onClick={() => !props.isDisabled && props.onClick()}
      onFocus={props.onFocus}
      onBlur={props.onBlur}
      tabIndex={0}
    >
      {props.children}
      {props.icon}
      {props.text && (
        <Typography
          sx={{
            display: "inline-block",
            fontSize: props.textFontSize ?? "12px",
            textAlign: "center",
            color: props.isDisabled ? "gray" : "#111",
            ...(props.textSx ?? {}),
          }}
        >
          {props.text}
        </Typography>
      )}
    </Box>
  );
};
