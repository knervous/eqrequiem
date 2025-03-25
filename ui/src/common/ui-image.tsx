import { Box, SxProps } from "@mui/material";
import React from "react";
import { useImage } from "../hooks/use-image";

type Props = {
  name: string;
  crop?: boolean;
  children?: React.ReactNode;
  sx?: SxProps;
};

export const UiImageComponent: React.FC<Props> = (props: Props) => {
  const imageEntry = useImage(props.name, props.crop);
  return (
    <Box
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
