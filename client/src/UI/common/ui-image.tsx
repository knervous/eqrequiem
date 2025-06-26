import { Box, SxProps } from "@mui/material";
import React from "react";
import { useImage, useSakImage } from "../hooks/use-image";

type Props = {
  name: string;
  crop?: boolean;
  children?: React.ReactNode;
  sx?: SxProps;
  sak?: boolean; // If true, use sakui images instead of default images
  onClick?: () => void;
};

export const UiImageComponent: React.FC<Props> = (props: Props) => {
  const imageEntry = props.sak ? useSakImage(props.name, props.crop) : useImage(props.name, props.crop);
  return (
    <Box
      onClick={props.onClick}
      sx={{
        width: `${imageEntry.entry?.width}px`,
        height: `${imageEntry.entry?.height}px`,
        backgroundImage: `url(${imageEntry.image})`,
        backgroundPosition: props.crop
          ? "0px 0px"
          : `-${imageEntry.entry.left}px -${imageEntry.entry?.top}px`,
        ...(props.sx ?? {}),
      }}
    >
      {props.children}
    </Box>
  );
};
