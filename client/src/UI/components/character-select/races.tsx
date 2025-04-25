import { CharRaceStrings } from "@game/Constants/constants";
import RACE_DATA from "@game/Constants/race-data";
import { Stack } from "@mui/material";
import { UiButtonComponent } from "@ui/common/ui-button";
import classNames from "classnames";
import { memo } from "react";

const supportedRaces = Object.entries(RACE_DATA)
  .slice(0, 12)
  .sort(([_key, race], [_key2, race2]) => (race.name > race2.name ? 1 : -1));


export const SupportedRaces = memo(({ selectedRace, setDescription, setSelectedRace }) => {
  return <Stack
    sx={{ marginTop: "5px" }}
    alignContent={"center"}
    direction={"column"}
  >
    {supportedRaces.map(([key, race]) => (
      <UiButtonComponent
        buttonName="A_BigBtn"
        sx={{
          margin: "10px",
        }}
        scale={1.3}
        selected={selectedRace === key}
        key={`char-select-race-${key}`}
        className={classNames({
          "btn-selected": key === selectedRace,
        })}
        onClick={() => {
          setDescription(CharRaceStrings[key]);
          setSelectedRace(key);
        }}
        text={race.name}
      />
    ))}
  </Stack>;
});