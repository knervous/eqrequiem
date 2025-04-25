import { CLASS_DATA_NAMES } from "@game/Constants/class-data";
import { CharClassStrings, classLookupTable } from "@game/Constants/constants";
import { Stack } from "@mui/material";
import { UiButtonComponent } from "@ui/common/ui-button";
import classNames from "classnames";
import { memo } from "react";

const supportedClasses = Object.entries(CLASS_DATA_NAMES)
  .slice(0, 14)
  .sort(([, name], [, name2]) => (name > name2 ? 1 : -1));

export const SupportedClasses = memo(
  ({ selectedClass, setDescription, setSelectedClass, selectedRace }) => {
    return (
      <Stack
        sx={{ marginTop: "5px", marginLeft: "15px" }}
        justifyContent={"center"}
        alignContent={"center"}
        direction={"column"}
      >
        {supportedClasses.map(([id, name]) => (
          <UiButtonComponent
            buttonName="A_BigBtn"
            selected={selectedClass === +id}
            text={name}
            sx={{
              margin: "10px",
            }}
            scale={1.2}
            isDisabled={!classLookupTable[id - 1][selectedRace - 1]}
            className={classNames({
              "btn-selected": +id === selectedClass,
            })}
            onClick={() => {
              setDescription(CharClassStrings[+id]);
              setSelectedClass(+id);
            }}
          />
        ))}
      </Stack>
    );
  },
);
