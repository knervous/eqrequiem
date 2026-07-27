import { Box } from "@mui/material";
import React from "react";

type Props = {
  children?: React.ReactNode;
};

export const Theme: React.FC<Props> = ({ children }) => {
  return (
    <Box
      sx={{
        cursor: "default",
        "& .cursor-default": { cursor: "default" },
        "& .resize-ew": { cursor: "ew-resize" },
        "& .resize-nesw": { cursor: "nesw-resize" },
        "& .resize-ns": { cursor: "ns-resize" },
        "& .resize-nwse": { cursor: "nwse-resize" },
        "& .cursor-drag": { cursor: "grab" },
        "& .cursor-caret, & .cursor-caret input": {
          caretColor: "#da8b3d",
          cursor: "text",
        },
      }}
    >
      {children}
    </Box>
  );
};
