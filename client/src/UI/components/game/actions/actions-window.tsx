// src/components/ChatWindowComponent.tsx
import React, { useMemo } from "react";
import { Box, Stack } from "@mui/material";

import { UiWindowComponent } from "../../../common/ui-window";
import { useUIContext } from "../../context";
import { UiButtonComponent } from "../../../common/ui-button";
import { UiImageComponent } from "../../../common/ui-image";

const ActionTabs = {
  Main: 0,
  Combat: 1,
  Socials: 2,
  Abilities: 3,
};

export const ActionWindowComponent: React.FC = () => {
  const state = useUIContext((state) => state.ui.actionWindow);
  const setMode = useUIContext((state) => state.setMode);
  const doClose = () => { };
  const [activeTab, setActiveTab] = React.useState(ActionTabs.Main);

  const tabStyles = useMemo(
    () => ({
      "&:hover": {
        outline: "1px dashed gold",
      },
    }),
    [],
  );
  const content = useMemo(() => {
    switch (activeTab) {
      case ActionTabs.Main:
        return <Stack direction="column" spacing={0.5}>
          <UiButtonComponent
            buttonName="A_BigBtn"
            text={'Invite'}
            onClick={() => { }}
          />
          <UiButtonComponent
            buttonName="A_BigBtn"
            text={'Disband'}
            isDisabled
            onClick={() => { }}
          />
          <UiButtonComponent
            buttonName="A_BigBtn"
            text={'Camp'}
            onClick={() => {
              setMode('character-select');
            }}
          />
          <UiButtonComponent
            buttonName="A_BigBtn"
            text={'Sit'}
            onClick={() => { }}
          />
          <UiButtonComponent
            buttonName="A_BigBtn"
            text={'Walk'}
            onClick={() => { }}
          />
        </Stack>;
      case ActionTabs.Combat:
        return <Box>Combat</Box>;
      case ActionTabs.Socials:
        return <Box>Socials</Box>;
      case ActionTabs.Abilities:
        return <Box>Abilities</Box>;
    }
  }, [activeTab, setMode]);
  return (
    <UiWindowComponent
      state={state}
      title="Actions"
      windowName="actionWindow"
      closable
      doClose={doClose}
    >
      <Stack direction={"row"} sx={{ padding: "20px", justifyContent: 'space-around' }}>
        <UiImageComponent
          sx={tabStyles}
          onClick={() => setActiveTab(ActionTabs.Main)}
          name={
            activeTab === ActionTabs.Main
              ? "A_MainTabActiveIcon"
              : "A_MainTabIcon"
          }
        />
        <UiImageComponent
          sx={tabStyles}
          onClick={() => setActiveTab(ActionTabs.Combat)}
          name={
            activeTab === ActionTabs.Combat
              ? "A_CombatTabActiveIcon"
              : "A_CombatTabIcon"
          }
        />
        <UiImageComponent
          sx={tabStyles}
          onClick={() => setActiveTab(ActionTabs.Socials)}
          name={
            activeTab === ActionTabs.Socials
              ? "A_SocialsTabActiveIcon"
              : "A_SocialsTabIcon"
          }
        />
        <UiImageComponent
          sx={tabStyles}
          onClick={() => setActiveTab(ActionTabs.Abilities)}
          name={
            activeTab === ActionTabs.Abilities
              ? "A_AbilitiesTabActiveIcon"
              : "A_AbilitiesTabIcon"
          }
        />
      </Stack>
      <Box sx={{ padding: " 0px 20px", overflow: "hidden" }}>
        {content}
      </Box>
    </UiWindowComponent>
  );
};
