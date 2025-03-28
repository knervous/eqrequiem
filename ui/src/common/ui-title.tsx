import { Box, Stack } from "@mui/material";
import React from "react";
import { UiImageComponent } from "./ui-image";
import { UiButtonComponent } from "./ui-button";

type Props = {
  name: string;
  handleDragMouseDown: (
    event: React.MouseEvent<HTMLDivElement, MouseEvent>
  ) => void;
  minimized: boolean;
  toggleMinimize: () => void;
  doClose?: () => void;
  closable?: boolean;
};

export const UiTitleComponent: React.FC<Props> = (props: Props) => {
  return (
    <Box
      className="cursor-drag"
      sx={{
        userSelect: "none",
        position: "absolute",
        width: "100%",
        marginTop: "-7px",
        zIndex: 10,
      }}
      onMouseDown={props.handleDragMouseDown}
    >
      <Stack direction="row">
        <Box
          sx={{
            position: "absolute",
            width: "100%",
            fontSize: "11px",
            textAlign: "center",
          }}
        >
          {props.name}
        </Box>
        <Box
          sx={{
            position: "absolute",
            left: '10px',
          }}
        >
          <UiButtonComponent
            buttonName={props.minimized ? "A_MaximizeBtn" : "A_MinimizeBtn"}
            onClick={props.toggleMinimize}
          />
        </Box>
        {props.closable && props.doClose && <Box
          sx={{
            position: "absolute",
            right: '10px',
          }}
        >
          <UiButtonComponent
            buttonName={"A_CloseBtn"}
            onClick={props.doClose}
          />
        </Box>}
        <UiImageComponent name={"A_WindowTitleLeft"} />
        <UiImageComponent
          crop
          sx={{
            width: `100%`,
            backgroundRepeat: "repeat-x",
            backgroundSize: "auto 100%",
          }}
          name={"A_WindowTitleMiddle"}
        />
        <UiImageComponent name={"A_WindowTitleRight"} />
      </Stack>
    </Box>
  );
};
