import { useMemo, useState } from "react";
import { Box, Stack, Typography } from "@mui/material";
import { UiButtonComponent } from "@ui/common/ui-button";
import { UiImageComponent } from "@ui/common/ui-image";
import { transform } from "typescript";

const ActionTabs = {
  Main: 0,
  Combat: 1,
  Socials: 2,
  Abilities: 3,
} as const;

export const StoneActions: React.FC = () => {
  const [mode, setMode] = useState<number>(ActionTabs.Main);

  const tabStyles = useMemo(
    () => ({
      "&:hover": {
        boxShadow: "0px 0px 1px 2px rgba(255, 215, 0, 0.3)",
        borderRadius: "25%",
      },
      transform: "scale(3)",
      ["*"]: {
        fontSize: "40px",
      },
    }),
    [],
  );
  const content = useMemo(() => {
    switch (mode) {
      case ActionTabs.Main:
        return (
          <Stack
            sx={{}}
            direction={"column"}
            justifyContent={"center"}
            alignItems={"center"}
          >
            <UiButtonComponent
              onClick={() => console.log("Help")}
              sx={{ mt: 1 }}
              buttonName="A_BTN_WHO"
            />
            <UiButtonComponent
              onClick={() => console.log("Help")}
              sx={{ mt: 1 }}
              buttonName="A_BTN_INVITE"
            />
            <UiButtonComponent
              onClick={() => console.log("Help")}
              sx={{ mt: 1 }}
              buttonName="A_BTN_DISBAND"
            />
            <UiButtonComponent
              onClick={() => console.log("Help")}
              sx={{ mt: 1 }}
              buttonName="A_BTN_CAMP"
            />
            <UiButtonComponent
              onClick={() => console.log("Help")}
              sx={{ mt: 1 }}
              buttonName="A_BTN_SIT"
            />
            <UiButtonComponent
              onClick={() => console.log("Help")}
              sx={{ mt: 1 }}
              buttonName="A_BTN_WALK"
            />
          </Stack>
        );
      case ActionTabs.Combat:
        return <Box sx={{ p: 2 }}>Combat</Box>;
      case ActionTabs.Socials:
        return <Box sx={{ p: 2 }}>Socials</Box>;
      case ActionTabs.Abilities:
        return <Box sx={{ p: 2 }}>Abilities</Box>;
    }
  }, [mode]);

  return (
    <Box>
      <Stack
        direction={"row"}
        sx={{
          justifyContent: "space-around",
          width: "80%",
          alignItems: "center",
          m: "15px auto",
          mb: 5,
        }}
      >
        <UiImageComponent
          sx={tabStyles}
          crop
          onClick={() => setMode(ActionTabs.Main)}
          name={
            mode === ActionTabs.Main ? "A_MainTabActiveIcon" : "A_MainTabIcon"
          }
        />
        <UiImageComponent
          sx={tabStyles}
          crop
          onClick={() => setMode(ActionTabs.Combat)}
          name={
            mode === ActionTabs.Combat
              ? "A_CombatTabActiveIcon"
              : "A_CombatTabIcon"
          }
        />
        <UiImageComponent
          sx={tabStyles}
          crop
          onClick={() => setMode(ActionTabs.Socials)}
          name={
            mode === ActionTabs.Socials
              ? "A_SocialsTabActiveIcon"
              : "A_SocialsTabIcon"
          }
        />
        <UiImageComponent
          sx={tabStyles}
          crop
          onClick={() => setMode(ActionTabs.Abilities)}
          name={
            mode === ActionTabs.Abilities
              ? "A_AbilitiesTabActiveIcon"
              : "A_AbilitiesTabIcon"
          }
        />
      </Stack>
      <Box
        sx={{
          width: "100%",
          height: 300,
          mt: 1,
          ["*"]: {
            fontSize: "40px",
          },
        }}
      >
        {content}
      </Box>
    </Box>
  );
};
