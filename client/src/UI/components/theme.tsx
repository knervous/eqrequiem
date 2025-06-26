import { Box } from "@mui/material";
import React, { useMemo } from "react";
import { useImage, useSakImage } from "../hooks/use-image";

type Props = {
  children?: React.ReactNode;
};

export const Theme: React.FC<Props> = ({ children }) => {
  const defaultCursor = useSakImage("A_DefaultCursor", true);
  const resizeEWCursor = useSakImage("A_CursorResizeEW", true);
  const resizeNESWCursor = useSakImage("A_CursorResizeNESW", true);
  const resizeNSCursor = useSakImage("A_CursorResizeNS", true);
  const resizeNWSECursor = useSakImage("A_CursorResizeNWSE", true);
  const dragCursor = useSakImage("A_CursorDrag", true);
  const caretCursor = useSakImage("A_CursorCaret", true);
  const sxStyles = useMemo(
    () => ({
      cursor: defaultCursor.image
        ? `url("${defaultCursor.image}") 0 0, auto`
        : "auto",
      "& .cursor-default": {
        cursor: defaultCursor.image
          ? `url("${defaultCursor.image}") 0 0, auto !important`
          : "auto",
      },
      "& .resize-ew": {
        cursor: resizeEWCursor.image
          ? `url("${resizeEWCursor.image}") 0 0, auto`
          : "ew-resize",
      },
      "& .resize-nesw": {
        cursor: resizeNESWCursor.image
          ? `url("${resizeNESWCursor.image}") 0 0, auto`
          : "nesw-resize",
      },
      "& .resize-ns": {
        cursor: resizeNSCursor.image
          ? `url("${resizeNSCursor.image}") 0 0, auto`
          : "ns-resize",
      },
      "& .resize-nwse": {
        cursor: resizeNWSECursor.image
          ? `url("${resizeNWSECursor.image}") 0 0, auto`
          : "nwse-resize",
      },
      "& .cursor-drag": {
        cursor: dragCursor.image
          ? `url("${dragCursor.image}") 0 0, auto`
          : "grab",
      },
      "& .cursor-caret input": {
        caretColor: 'gold',
        cursor: caretCursor.image
          ? `url("${caretCursor.image}") 0 0, auto !important` // Hotspot at (16, 32)
          : "text",
      },
    }),
    [
      defaultCursor.image,
      resizeEWCursor.image,
      resizeNESWCursor.image,
      resizeNSCursor.image,
      resizeNWSECursor.image,
      dragCursor.image,
      caretCursor.image,
    ],
  );

  return <Box sx={sxStyles}>{children}</Box>;
};
