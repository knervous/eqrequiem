import React, { useEffect, useState } from "react";
import { Box, Tab, Tabs, FormControl, Slider, Typography } from "@mui/material";
import { UiWindowComponent } from "../../../common/ui-window";
import { useUIContext } from "../../context";
import { DevPlayer } from "./dev-player";
import GameManager from "@game/Manager/game-manager";

// TabPanel component to handle tab content
interface TabPanelProps {
  children?: React.ReactNode;
  index: number;
  value: number;
}

function TabPanel(props: TabPanelProps) {
  const { children, value, index, ...other } = props;

  return (
    <Box
      role="tabpanel"
      hidden={value !== index}
      id={`dev-tabpanel-${index}`}
      aria-labelledby={`dev-tab-${index}`}
      sx={{ overflow: "auto", maxHeight: "calc(100% - 50px)" }}
      {...other}
    >
      {value === index && (
        <Box sx={{ p: 2, color: "white", "*": { color: "white" } }}>
          {children}
        </Box>
      )}
    </Box>
  );
}

// Main Dev Window component
export const DevWindowComponent: React.FC = () => {
  const state = useUIContext((state) => state.ui.devWindow);
  const [tabValue, setTabValue] = useState(0);
  const [timeOfDay, setTimeOfDay] = useState(12);
  useEffect(() => {
    if (GameManager.instance?.ZoneManager?.SkyManager) {
      GameManager.instance.ZoneManager?.SkyManager.setTimeOfDay(timeOfDay);
    }
  }, [timeOfDay]);

  const handleTabChange = (_event: React.SyntheticEvent, newValue: number) => {
    setTabValue(newValue);
  };
  const tabStyle = {
    color: "white",
    fontSize: "13px",
    width: "50%",
    minHeight: "24px", // Override MUI default min-height
    padding: "0 8px", // Reduce padding for a tighter look
    margin: 0, // Remove any margin
    textTransform: "none", // Optional: Prevent uppercase text for better fit
  };
  return (
    <UiWindowComponent state={state} title="Debug Mode" windowName="devWindow">
      <Box
        sx={{
          width: "100%",
          height: "100%",
          "*": { color: "white !important" },
        }}
      >
        <Box
          sx={{
            borderBottom: 1,
            borderColor: "divider",
            padding: 0,
            margin: 0,
          }}
        >
          {" "}
          <Tabs
            value={tabValue}
            onChange={handleTabChange}
            sx={{
              justifyContent: "center",
              alignContent: "center",
              marginTop: '10px',
              minHeight: "24px", // Reduce Tabs container height
              "& .MuiTabs-indicator": { height: "2px" }, // Thinner indicator
              "& .MuiTabs-flexContainer": { height: "24px" }, // Match tab height
            }}
            aria-label="dev window tabs"
          >
            <Tab
              sx={tabStyle}
              label="Player"
              id="dev-tab-0"
              aria-controls="dev-tabpanel-0"
            />
            <Tab
              sx={tabStyle}
              label="Zone"
              id="dev-tab-1"
              aria-controls="dev-tabpanel-1"
            />
          </Tabs>
        </Box>

        <TabPanel value={tabValue} index={0}>
          <DevPlayer />
        </TabPanel>
        <TabPanel value={tabValue} index={1}>
          <FormControl sx={{ width: "300px", color: "white" }}>
            <Typography
              sx={{ fontSize: 14, marginTop: 2, width: "80%" }}
              color="text.secondary"
              gutterBottom
            >
              Time of Day: {timeOfDay}
            </Typography>
            <Slider
              value={timeOfDay}
              onChange={(e) => {
                setTimeOfDay(e.target.value);
              }}
              step={0.01}
              min={0.1}
              max={24}
            />
          </FormControl>
        </TabPanel>
      </Box>
    </UiWindowComponent>
  );
};
