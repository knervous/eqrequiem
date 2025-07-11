import { Box, BoxProps, SxProps, Typography } from "@mui/material";
import React, { useMemo, useState, useCallback } from "react";
import { ImageEntry, useStoneImage } from "../hooks/use-image";
import classNames from "classnames";

type AtlasEntry = {
  texture: string; // Path to the texture file (e.g., "uifiles/default/atlas.tga")
  left: number;
  top: number;
  width: number;
  height: number;
};

type Props = {
  onClick?: () => void;
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
} & BoxProps

const emptySx = {};

export const UiButtonComponent: React.FC<Props> = (props: Props) => {
  const buttonName = props.buttonName ?? "A_BigBtn";
  const normal = useStoneImage(`${buttonName}Normal`, true);
  const pressed = useStoneImage(`${buttonName}Pressed`, true);
  const hover = useStoneImage(`${buttonName}Flyby`, true);
  const disabled = useStoneImage(`${buttonName}Disabled`, true);

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

  const doClick = useCallback(() => {
    if (props.isDisabled || !props.onClick) {
      return;
    }
    props.onClick();
  }, [props]);

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
        backgroundSize: "cover",
        ...(props.scale ? { transform: `scale(${props.scale})` } : emptySx),
        ...(props.sx ?? {}),
        ...(props.entrySx ? props.entrySx(selectedEntry) : emptySx),
      }}
      onMouseEnter={() => !props.isDisabled && setIsHovered(true)}
      onMouseLeave={() => {
        setIsHovered(false);
        setIsPressed(false);
      }}
      onMouseDown={() => !props.isDisabled && setIsPressed(true)}
      onMouseUp={() => setIsPressed(false)}
      onClick={doClick}
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
