import { Box } from "@mui/material";
import React, { useMemo } from "react";
import { useImage } from "../hooks/use-image";

type Props = {
  children?: React.ReactNode;
};

export const Theme: React.FC<Props> = ({ children }) => {
  const defaultCursor = useImage("A_DefaultCursor", true);
  const resizeEWCursor = useImage("A_CursorResizeEW", true);
  const resizeNESWCursor = useImage("A_CursorResizeNESW", true);
  const resizeNSCursor = useImage("A_CursorResizeNS", true);
  const resizeNWSECursor = useImage("A_CursorResizeNWSE", true);
  const dragCursor = useImage("A_CursorDrag", true);
  const caretCursor = useImage("A_CursorCaret", true);
  console.log("Caret", caretCursor);
  // Memoize the sx object to avoid recalculating on every render
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
    ]
  );

  return <Box sx={sxStyles}>{children}</Box>;
};
