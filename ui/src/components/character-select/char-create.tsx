import React, { useCallback, useEffect, useState } from "react";
import { nameByRace } from "fantasy-name-generator";
import * as EQMessage from "../../../../Game/Code/Net/message/EQMessage";

import {
  Divider,
  MenuItem,
  Select,
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import { RACE_DATA } from "../../../../game/Code/Constants/race-data";
import { CLASS_DATA_NAMES } from "../../../../game/Code/Constants/class-data";
import {
  getAvailableDeities,
  startingCityMap,
} from "../../../../game/Code/Constants/util";

import {
  CharClassStrings,
  CharRaceStrings,
  Races,
  VIEWS,
  baseClassStats,
  baseStats,
  classLookupTable,
  preferredStats,
} from "../../../../game/Code/Constants/constants";

import classNames from "classnames";
import { UiButtonComponent } from "../../common/ui-button";
import { MainInvoker } from "../../state/bridge";
import { UiWindowComponent } from "../../common/ui-window";
import { StringTable } from "../../util/string-table";
import { WorldSocket } from "../../net/instances";

const selectProps = {
  size: "small",

  MenuProps: {
    PaperProps: {
      sx: {
        color: "white",
        background: "black",
        "*": {
          fontSize: "12px",
        },
      },
    },
  },
};

const selectSx = {
  "*": {
    borderColor: "rgba(255, 217, 0, 0.561) !important",
    color: "white !important",
    fontSize: "12px !important",
  },
  height: "35px",
  margin: "15px auto !important",
  width: "200px",
};

export const CharacterCreate = ({ setView, charInfo }) => {
  const [selectedRace, setSelectedRace] = useState("1");
  const [selectedClass, setSelectedClass] = useState(1);
  const [selectedDeity, setSelectedDeity] = useState(1);
  const [selectedCity, setSelectedCity] = useState(1);
  const [gender, setGender] = useState(0);
  const [face, setFace] = useState(0);
  const [name, setName] = useState("");
  const [deities, setDeities] = useState([]);
  const [startingCities, setStartingCities] = useState([]);
  const [character, setCharacter] = useState({});
  const [baseCharacter, setBaseCharacter] = useState({});
  const [initialLength] = useState(charInfo?.characters?.length);
  const [description, setDescription] = useState(CharClassStrings[1]);

  const createCharacter = useCallback(() => {
    WorldSocket.sendMessage(
      EQMessage.OpCodes.OP_ApproveName,
      EQMessage.NameApproval,
      {
        name,
        race: +selectedRace,
        charClass: selectedClass,
        deity: selectedDeity,
      },
    );
    const char = {
      gender,
      face,
      tutorial: 0,
      race: +selectedRace,
      charClass: selectedClass,
      startZone: selectedCity,
      deity: selectedDeity,
      ...character,
    };
    WorldSocket.registerOpCodeHandler(EQMessage.OpCodes.OP_SendMaxCharacters, EQMessage.Int, (data) => {
      setView(VIEWS.CHAR_SELECT);
    });
    WorldSocket.registerOpCodeHandler(
      EQMessage.OpCodes.OP_ApproveName_Server,
      EQMessage.Int,
      (data) => {
        console.log("Got data", data);
        if (data) {
          WorldSocket.sendMessage(
            EQMessage.OpCodes.OP_CharacterCreate,
            EQMessage.CharCreate,
            char,
          );
        } else {
          WorldSocket.sendMessage(
            EQMessage.OpCodes.OP_DeleteCharacter,
            EQMessage.String$,
            { value: name },
          );
        }
      },
    );

    console.log("Sending char", char);
    // WorldSocket.sendMessage(
    //   EQMessage.OpCodes.OP_CharacterCreateRequest,
    //   EQMessage.CharCreate,
    //   char,
    // );
  }, [
    name,
    gender,
    selectedRace,
    character,
    selectedClass,
    selectedDeity,
    selectedCity,
    face,
    setView,
  ]);

  useEffect(() => {
    if (initialLength !== charInfo?.characters?.length) {
      //setView(VIEWS.CHAR_SELECT);
    }
  }, [charInfo?.characters?.length, setView, initialLength]);

  useEffect(() => {
    const deities = getAvailableDeities(+selectedRace, selectedClass);
    if (!deities.length) {
      return;
    }
    setDeities(deities);
    setSelectedDeity(deities[0][0]);
  }, [selectedRace, selectedClass]);

  useEffect(() => {
    const deity = deities.find(([val]) => val === selectedDeity);
    const availableCities =
      startingCityMap[selectedClass]?.[selectedRace]?.[deity];
    if (!availableCities) {
      return;
    }
    setStartingCities(availableCities);
    setSelectedCity(availableCities[0][0]);
  }, [selectedRace, selectedClass, selectedDeity, deities]);

  useEffect(() => {
    const newCharacter = {
      charClass: selectedClass,
      race: selectedRace,
      equip: [],
      name: "",
      face,
      gender,
    };

    // Check if we can keep the same class applied
    // If not, find the first available class for a new race
    if (!classLookupTable[selectedClass - 1][selectedRace - 1]) {
      for (const [idx, classEntry] of Object.entries(classLookupTable)) {
        if (classEntry[selectedRace - 1]) {
          setSelectedClass(+idx + 1);
          return;
        }
      }
    }

    MainInvoker.current({
      type: "characterSelectPlayer",
      payload: { player: newCharacter },
    });

    const classStats = baseClassStats[selectedClass - 1];
    const raceStats = baseStats[selectedRace - 1];
    // Initialize stats
    const char = {
      str: classStats[0] + raceStats[0],
      sta: classStats[1] + raceStats[1],
      agi: classStats[2] + raceStats[2],
      dex: classStats[3] + raceStats[3],
      wis: classStats[4] + raceStats[4],
      intel: classStats[5] + raceStats[5],
      cha: classStats[6] + raceStats[6],
      statPoints: classStats[7],
      deity: 0,
    };
    setCharacter(char);
    setBaseCharacter(char);
  }, [selectedRace, selectedClass, gender, face]);

  return (
    <>
      <UiWindowComponent
        title="Character"
        state={{
          x: 10,
          y: 25,
          fixed: true,
          fixedHeight: window.innerHeight - 50,
          fixedWidth: 350,
        }}
      >
        <Stack
          sx={{ marginTop: "25px" }}
          justifyContent={"center"}
          alignContent={"center"}
          alignItems={"center"}
          direction={"row"}
        >
          <UiButtonComponent
            selected={gender === 0}
            className={classNames({ "btn-selected": gender === 0 })}
            text={"Male"}
            onClick={() => {
              setGender(0);
            }}
          />
          <Divider sx={{ margin: "5px" }} />
          <UiButtonComponent
            className={classNames({ "btn-selected": gender === 1 })}
            selected={gender === 1}
            text={"Female"}
            onClick={() => {
              setGender(1);
            }}
          />
        </Stack>
        <Stack alignContent={"center"} direction={"row"}>
          <Select
            value={face}
            sx={{
              position: "fixed",
              top: "10px",
              left: "calc(50vw - 100px)",
              ...selectSx,
            }}
            {...selectProps}
            onChange={(e) => setFace(e.target.value)}
          >
            {Array.from({ length: 8 }).map((_, idx) => (
              <MenuItem value={idx}>Face {idx + 1}</MenuItem>
            ))}
          </Select>
        </Stack>

        <Stack
          sx={{ marginTop: "5px" }}
          justifyContent={"center"}
          alignContent={"center"}
          direction={"row"}
        >
          {/** Races */}
          <Stack
            sx={{ marginTop: "5px" }}
            alignContent={"center"}
            direction={"column"}
          >
            {Object.entries(RACE_DATA)
              .slice(0, 12)
              .sort(([key, race], [key2, race2]) =>
                race.name > race2.name ? 1 : -1,
              )
              .map(([key, race]) => (
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
          </Stack>

          {/** Classes */}
          <Stack
            sx={{ marginTop: "5px", marginLeft: "15px" }}
            justifyContent={"center"}
            alignContent={"center"}
            direction={"column"}
          >
            {Object.entries(CLASS_DATA_NAMES)
              .slice(0, 14)
              .sort(([, name], [, name2]) => (name > name2 ? 1 : -1))
              .map(([id, name]) => (
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
        </Stack>
        <Stack sx={{ width: "100%" }} direction="row" justifyContent="center">
          <UiButtonComponent
            sx={{
              marginTop: "40px !important",
            }}
            textFontSize={"8px"}
            scale={2}
            text="Back to Character Select"
            onClick={() => setView(VIEWS.CHAR_SELECT)}
          />
        </Stack>
      </UiWindowComponent>

      <UiWindowComponent
        title="Abilities"
        state={{
          fixed: true,
          fixedHeight: 700,
          fixedWidth: 300,
          x: window.innerWidth - 310,
          y: 25,
        }}
      >
        <Stack
          direction={"column"}
          sx={{ width: "100%", paddingTop: "30px" }}
          justifyContent={"center"}
          alignItems={"center"}
        >
          <Typography sx={{ fontSize: "15px" }} noWrap component="div">
            Points Remaining: {character.statPoints}
          </Typography>
          {[
            ["Strength", "str"],
            ["Stamina", "sta"],
            ["Agility", "agi"],
            ["Dexterity", "dex"],
            ["Wisdom", "wis"],
            ["Intelligence", "intel"],
            ["Charisma", "cha"],
          ].map(([label, stat]) => (
            <Stack
              key={`stat-${stat}`}
              sx={{ marginTop: "0px" }}
              direction={"row"}
            >
              <Stack
                key={`stat-inner-${stat}`}
                minWidth={200}
                sx={{ marginTop: "15px" }}
                justifyContent={"center"}
                direction={"column"}
              >
                <Typography
                  textAlign={"left"}
                  paddingLeft={3}
                  fontSize={"15px"}
                  noWrap
                  component="div"
                >
                  {label}:{" "}
                  <Typography
                    sx={{
                      color: preferredStats[selectedClass].includes(stat)
                        ? "lightgreen"
                        : "white",
                    }}
                    variant="p"
                  >
                    {character[stat]}
                  </Typography>
                </Typography>
              </Stack>

              <Stack
                key={`stat-${stat}`}
                sx={{ marginTop: "15px" }}
                width={"40px"}
                justifyContent={"space-between"}
                direction={"row"}
              >
                <UiButtonComponent
                  scale={1.5}
                  buttonName="A_MinusBtn"
                  isDisabled={character[stat] === baseCharacter[stat]}
                  onClick={() =>
                    setCharacter((char) => ({
                      ...char,
                      [stat]: char[stat] - 1,
                      statPoints: char.statPoints + 1,
                    }))
                  }
                />
                <UiButtonComponent
                  scale={1.5}
                  buttonName="A_PlusBtn"
                  isDisabled={character.statPoints === 0}
                  onClick={() => {
                    setCharacter((char) => ({
                      ...char,
                      [stat]: char[stat] + 1,
                      statPoints: char.statPoints - 1,
                    }));
                  }}
                />
              </Stack>
            </Stack>
          ))}
          <Typography
            sx={{ marginTop: "15px", fontSize: "15px" }}
            noWrap
            component="div"
          >
            Deity
          </Typography>
          <Select
            value={selectedDeity}
            {...selectProps}
            sx={{ ...selectSx }}
            onChange={(e) => setSelectedDeity(e.target.value)}
          >
            {deities.map(([value, display]) => (
              <MenuItem value={value}>{display}</MenuItem>
            ))}
          </Select>

          <Typography
            sx={{ marginTop: "15px", fontSize: "15px" }}
            noWrap
            component="div"
          >
            Starting City
          </Typography>
          <Select
            value={selectedCity}
            {...selectProps}
            sx={{ ...selectSx }}
            onChange={(e) => setSelectedCity(e.target.value)}
          >
            {startingCities.map(([value, display]) => (
              <MenuItem value={value}>{display}</MenuItem>
            ))}
          </Select>

          <UiButtonComponent
            scale={1.8}
            textFontSize="9px"
            text="Create Character"
            isDisabled={character.statPoints > 0 || name === ""}
            sx={{ marginTop: "30px !important" }}
            onClick={createCharacter}
          />
        </Stack>
      </UiWindowComponent>

      <UiWindowComponent
        state={{
          fixed: true,
          fixedHeight: 240,
          fixedWidth: 600,
          x: window.innerWidth / 2 - 300,
          y: window.innerHeight - 260,
        }}
      >
        <Stack
          sx={{
            width: "100%",
            padding: "10px",
            position: "absolute",
            top: "-70px",
          }}
          direction={"row"}
          justifyContent={"space-around"}
          alignContent={"center"}
          alignItems={"center"}
        >
          <TextField
            autoComplete="off"
            size="small"
            slotProps={{
              input: {
                sx: {
                  background: "rgba(0,0,0,0.5) !important",
                  color: "white",
                },
              },
            }}
            sx={{
              width: "300px",
              color: "white",
              "*": {
                borderColor: "rgba(255, 217, 0, 0.561) !important",
                color: "white !important",
              },
            }}
            label="Name"
            value={name}
            onKeyDown={(e) => {
              e.stopPropagation();
            }}
            onChange={(e) => setName(e.target.value)}
          />
          <UiButtonComponent
            scale={1.5}
            textFontSize="9px"
            text="Generate Name"
            sx={{
              marginRight: "50px",
            }}
            onClick={() => {
              const nameMap = {
                [Races.HUMAN]: "human",
                [Races.BARBARIAN]: "cavePerson",
                [Races.ERUDITE]: "drow",
                [Races.WOODELF]: "elf",
                [Races.HIGHELF]: "highelf",
                [Races.DARKELF]: "darkelf",
                [Races.HALFELF]: "human",
                [Races.DWARF]: "dwarf",
                [Races.TROLL]: "ogre",
                [Races.OGRE]: "ogre",
                [Races.HALFLING]: "halfling",
                [Races.GNOME]: "gnome",
              };

              let name = nameByRace(nameMap[selectedRace], {
                gender: gender === 0 ? "male" : "female",
              }) as string;

              name = name.replaceAll("-", "");
              name = name.toLowerCase();
              name = name[0].toUpperCase() + name.slice(1);
              name = name.split(" ")[0];
              setName(name);
            }}
          ></UiButtonComponent>
        </Stack>
        <textarea
          value={StringTable.getString(description)}
          readOnly
          style={{
            color: "white",
            height: "200px",
            width: "calc(100% - 20px)",
            background: "transparent",
            border: "none",
            outline: "none",
            margin: "10px",
          }}
        ></textarea>
      </UiWindowComponent>
    </>
  );
};
