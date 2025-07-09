import React, { useEffect, useMemo, useState } from "react";
import { Box, Grid, Stack, Typography } from "@mui/material";
import { useRawImage, useSakImage, useSakImages } from "@ui/hooks/use-image";
import { UiButtonComponent } from "@ui/common/ui-button";
import { PlayerProfile } from "@game/Net/internal/api/capnp/player";
import { CLASS_DATA_NAMES } from "@game/Constants/class-data";
import emitter from "@game/Events/events";
import Player from "@game/Player/player";
import { ActionButton, ActionHotButton } from "../../action-button/action-button";
import { StoneHotButtons } from "./stone-hot-buttons";
import { StoneGeneralInv } from "./stone-general-inv";

// Configuration for all stone frame pieces
const stoneConfigs = [
  { key: "topLeft", name: "A_ClassicTopLeft", bgSize: "cover" },
  { key: "top", name: "A_ClassicTop", bgSize: "cover" },
  { key: "topRight", name: "A_ClassicTopRight", bgSize: "cover" },
  { key: "midLeft", name: "A_ClassicLeft", bgSize: "repeat-y" },
  { key: "mid", name: "BG_Light", bgSize: "repeat" },
  { key: "midRight", name: "A_ClassicRight", bgSize: "repeat-y" },
  { key: "botLeft", name: "A_ClassicBottomLeft", bgSize: "cover" },
  { key: "bot", name: "A_ClassicBottom", bgSize: "repeat-x" },
  { key: "botRight", name: "A_ClassicBottomRight", bgSize: "cover" },
];

// Component to render a row of stone pieces
const StoneRow: React.FC<{
  keys: string[];
  stoneImages: Record<string, any>;
  scale: number;
  height: number | string;
}> = ({ keys, stoneImages, scale, height }) => (
  <Stack direction="row" spacing={0}>
    {keys.map((key) => {
      const { entry, image, bgSize } = stoneImages[key];
      const widthPx = (entry.width * 2) / scale;
      return (
        <Box
          key={key}
          sx={{
            width: widthPx,
            height,
            backgroundImage: `url(${image})`,
            backgroundSize: bgSize,
          }}
        />
      );
    })}
  </Stack>
);
const imageNames = stoneConfigs.map(({ name }) => `${name}`);
export const StoneLeft: React.FC<{ width: number }> = ({ width }) => {
  const bgImages = useSakImages(imageNames, true);
  const [playerClass, setPlayerClass] = useState(
    CLASS_DATA_NAMES[Player.instance?.player?.charClass ?? 1],
  );
  const stoneImages = useMemo(
    () =>
      stoneConfigs.reduce(
        (acc, { key, bgSize }, idx) => {
          acc[key] = {
            entry: bgImages[idx]?.entry ?? {},
            image: bgImages[idx]?.image ?? "",
            bgSize: bgSize,
          };
          return acc;
        },
        {} as Record<string, any>,
      ),
    [bgImages],
  );
  // Other assets
  const classGif = useRawImage(
    "uifiles/stone",
    `${playerClass}.gif`,
    "image/gif",
  );
  const spellGem = useSakImage("Jib_SpellGemBG", true);

  const bottomHeight = 1400;

  // Calculate scale factor (clamped)
  const scale = useMemo(() => {
    const sW = width / 300;
    return sW;
  }, [width]);

  // Frame row heights
  const topHeight = stoneImages.topLeft.entry.height * scale;
  const middleHeight = window.innerHeight - 2 * topHeight;

  // Spell gems and hot buttons arrays
  const spellGems = useMemo(
    () =>
      Array.from({ length: 8 }, (_, i) => (
        <Box
          key={i}
          sx={{
            width: spellGem.entry.width * 2.3,
            height: spellGem.entry.height * 2.3,
            backgroundImage: `url(${spellGem.image})`,
            backgroundSize: "cover",
            //transform: `scale(${2})`,
          }}
        >
          <ActionButton
            background="A_ClassicButtonBG"
            foreGround="A_ClassicButtonFG"
            action={() => console.log(`Spell Gem ${i + 1} Clicked`)}
            size={spellGem.entry.width * 2.3}
          />
        </Box>
      )),
    [spellGem],
  );

  useEffect(() => {
    const cb = (player: PlayerProfile) => {
      setPlayerClass(CLASS_DATA_NAMES[player.charClass] || "warrior");
    };
    emitter.on("setPlayer", cb);
    return () => {
      emitter.off("setPlayer", cb);
    };
  }, []);
  return (
    <Box
      sx={{
        width: "100%",
        height: "100%",
        overflow: "hidden",
      }}
    >
      {/* Frame */}
      <StoneRow
        keys={["topLeft", "top", "topRight"]}
        stoneImages={stoneImages}
        scale={scale}
        height={topHeight}
      />
      <StoneRow
        keys={["midLeft", "mid", "midRight"]}
        stoneImages={stoneImages}
        scale={scale}
        height={`${middleHeight}px`}
      />
      <StoneRow
        keys={["botLeft", "bot", "botRight"]}
        stoneImages={stoneImages}
        scale={scale}
        height={topHeight}
      />

      {/* Overlay UI */}
      <Box
        sx={{ position: "absolute", top: 0, left: 0, width, height: "100vh" }}
      >
        <Box
          sx={{
            p: `${16 * scale}px`,
            transform: `scale(${scale})`,
            transformOrigin: "top left",
            width: (width - 8) / scale,
            height: `calc(100vh / ${scale})`,
          }}
        >
          {/* Top half: buttons & gems */}
          <Stack
            direction="row"
            sx={{
              width: "100%",
              height: `calc(100% - ${bottomHeight}px)`,
              ml: "12px",
            }}
          >
            {/* Left buttons */}
            <Stack
              direction="column"
              sx={{
                height: "100%",
                width: `calc(100% - ${spellGem.entry.width * 2.3}px)`,
              }}
            >
              <UiButtonComponent
                onClick={() => console.log("Help")}
                sx={{ mt: 2 }}
                buttonName="A_BTN_HELP"
                scale={1.1}
              />
              <UiButtonComponent
                onClick={() => console.log("Options")}
                sx={{ mt: 2 }}
                buttonName="A_BTN_OPTIONS"
                scale={1.1}
              />
              <UiButtonComponent
                onClick={() => {
                  emitter.emit("toggleInventory");
                }}
                sx={{ mt: 12 }}
                scale={1.1}
                buttonName="A_BTN_PERSONA"
              />
              <Box
                sx={{
                  backgroundImage: `url(${classGif})`,
                  backgroundSize: "cover",
                  width: 165,
                  height: 420,
                  position: "relative",
                  mt: 2,
                }}
              >
                {!["warrior", "rogue", "monk"].includes(
                  playerClass?.toLowerCase(),
                ) && (
                  <UiButtonComponent
                    onClick={() => console.log("Spells")}
                    sx={{
                      position: "absolute",
                      top: 315,
                      left: "50%",
                      transform: "translateX(-50%) scale(1.1)",
                    }}
                    buttonName="A_BTN_SPELLS"
                  />
                )}
              </Box>
            </Stack>

            {/* Gems */}
            <Stack
              direction="column"
              sx={{ height: "100%", width: spellGem.entry.width * 2, mt: 1 }}
            >
              {spellGems}
            </Stack>
          </Stack>

          {/* Bottom half: navigation & hot buttons */}
          <Stack
            direction="column"
            alignItems="center"
            justifyContent={"center"}
            sx={{ width: "100%", height: bottomHeight }}
          >
            <StoneGeneralInv />

            {/** Action Hot Buttons */}
            <StoneHotButtons scale={scale} />
            
    

           
          </Stack>
        </Box>
      </Box>
    </Box>
  );
};
