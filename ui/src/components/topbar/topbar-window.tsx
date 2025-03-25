import React, { useEffect } from "react";
import { ActionBarWindow } from "../../state/initial-state";
import { UiWindowComponent } from "../../common/ui-window";
import { UiButtonComponent } from "../../common/ui-button";
import { Box, Stack, Typography } from "@mui/material";
import { useUIContext } from "../context";


export const TopBarWindowComponent: React.FC = () => {
  const state = useUIContext(state => state.ui.topBarWindow);
  state.fixedWidth = 10 * 25;
  state.fixedHeight = 25;
  return (
    <UiWindowComponent
      state={state}
      windowName="topBarWindow"
    >
      <Stack
        direction={"row"}
        sx={{
          maxWidth: "100%",
          maxHeight: "100%",
        }}
      >
        <UiButtonComponent onClick={() => {}} buttonName="A_ActionsBtn" />
        <UiButtonComponent onClick={() => {}} buttonName="A_OptionsBtn" />
        <UiButtonComponent onClick={() => {}} buttonName="A_InventoryBtn" />
        <UiButtonComponent onClick={() => {}} buttonName="A_CastSpellBtn" />
        <UiButtonComponent onClick={() => {}} buttonName="A_HotboxBtn" />
        <UiButtonComponent onClick={() => {}} buttonName="A_BuffBtn" />
        <UiButtonComponent onClick={() => {}} buttonName="A_PetInfoBtn" />
        <UiButtonComponent onClick={() => {}} buttonName="A_FriendsBtn" />
        <UiButtonComponent onClick={() => {}} buttonName="A_HelpBtn" />
        <UiButtonComponent onClick={() => {}} buttonName="A_MailBtn" />
  
      </Stack>
    </UiWindowComponent>
  );
};
