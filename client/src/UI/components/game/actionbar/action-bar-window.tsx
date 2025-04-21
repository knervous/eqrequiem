import React, { useEffect } from "react";
import { ActionBarWindow } from "../../../state/initial-state";
import { UiWindowComponent } from "../../../common/ui-window";
import { UiButtonComponent } from "../../../common/ui-button";
import { Box, Stack, Typography } from "@mui/material";


type Props = {
  state: ActionBarWindow;
  index: number;
  main: boolean;
};

const hotkeyCount = 10;

export const ActionBarWindowComponent: React.FC<Props> = (props: Props) => {
  const { state } = props;

  useEffect(() => { }, []);

  const hotkeys = Array.from({ length: hotkeyCount }, (_, i) => {
    const key = i + 1;
    return (
      <UiButtonComponent
        onClick={() => { }}
        key={key}
        buttonName={`A_HotButton${i + 1}`}
      >
        <Box sx={{ position: "relative", right: "2px", top: "2px" }}>
          {/* {i + 1} */}
        </Box>
      </UiButtonComponent>
    );
  });

  return (
    <UiWindowComponent
      state={state}
      index={props.index}
      windowName="actionBarWindows"
    >
      <Stack
        direction={"column"}
        sx={{
          maxWidth: "100%",
          maxHeight: "100%",
        }}
      >
        <Stack
          sx={{
            padding: "5px",
            justifyContent: "center",
            alignItems: "center",
          }}
          direction="row"
        >
          <UiButtonComponent onClick={() => { }} buttonName="A_HSBLeft" />
          <Typography sx={{ fontSize: "13px", margin: "0px 10px" }}>
            1
          </Typography>
          <UiButtonComponent onClick={() => { }} buttonName="A_HSBRight" />
        </Stack>
        <Box
          sx={{
            display: "flex",
            justifyContent: "center",
            flexDirection: "row",
            flexWrap: "wrap",
            overflow: "hidden",
            gap: "0.2rem",
          }}
        >
          {hotkeys}
        </Box>
      </Stack>
    </UiWindowComponent>
  );
};
