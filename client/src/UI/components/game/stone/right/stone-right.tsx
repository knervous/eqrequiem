import React, { useRef, useState, useEffect, useMemo } from "react";
import { Box, Stack, Typography } from "@mui/material";
import {
  useSakImage,
  useSakImages,
} from "@ui/hooks/use-image";
import { UiButtonComponent } from "@ui/common/ui-button";
import { usePlayerName } from "@game/Events/event-hooks";
import { UiImageComponent } from "@ui/common/ui-image";

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

// Hook for hover/fade behavior
const useIdle = (timeout = 2000) => {
  const [active, setActive] = useState(true);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const onMouseEnter = () => {
    if (timer.current) clearTimeout(timer.current);
    setActive(true);
  };

  const onMouseLeave = () => {
    timer.current = setTimeout(() => setActive(false), timeout);
  };

  useEffect(() => {
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, []);

  return { active, handlers: { onMouseEnter, onMouseLeave } };
};

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
            width: widthPx / scale,
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
export const StoneRight: React.FC<{ width: number }> = ({ width }) => {
  const playerName = usePlayerName();
  const bgImages = useSakImages(imageNames, true);
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

  // Calculate scale factor (clamped)
  const scale = useMemo(() => {
    const sW = width / 300;
    return sW;
  }, [width]);
  // Hover/fade handlers
  const { active: isActive, handlers } = useIdle(2000);

  // Frame row heights
  const topHeight = stoneImages.topLeft.entry.height * scale;
  const middleHeight = window.innerHeight  - (2 * topHeight);

  const playerImage = useSakImage("PW_BG_TX", true);
  const partyMembersImage = useSakImage("GW_BG_TX", true);
  const targetImage = useSakImage("TARGET_BG_TX", true);
  const buffImage = useSakImage("BUFF_BG_TX", true);

  const totalTopHeight =
    playerImage.entry.height +
    partyMembersImage.entry.height +
    targetImage.entry.height +
    buffImage.entry.height - 25;
  return (
    <Box
      sx={{
        width: "100%",
        height: "100%",
        overflow: "hidden",
        //opacity: isActive ? 1 : 0.5,
        transition: "opacity 0.5s ease",
      }}
      {...handlers}
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
        onMouseEnter={handlers.onMouseEnter}
        onMouseLeave={handlers.onMouseLeave}
        sx={{ position: "absolute", top: 0, left: 0, width, height: "100vh" }}
      >
        <Box
          sx={{
            transform: `scale(${scale})`,
            transformOrigin: "top left",
            width: (width) / scale,
            height: `calc(100vh / ${scale})`,
          }}
        >
          <Stack sx={{ height: totalTopHeight * 2 }} direction={"column"}>
            <Box
              sx={{
                width: playerImage.entry.width * 2,
                height: playerImage.entry.height * 2,
                backgroundImage: `url(${playerImage.image})`,
                backgroundSize: "cover",
              }}
            >
              <Box sx ={{ m: 7 }}>
                <Typography
                  variant="h6"
                  sx={{
                    fontSize: '30px',
                    color: "white",
                    textShadow: "1px 1px 2px black",
                  }}
                >
                  {playerName}
                </Typography>

                <UiImageComponent sak name="A_Classic_GaugeFill" sx={{}} />
                <UiImageComponent sak name="A_Classic_GaugeFill_Blue" sx={{}} />
                <UiImageComponent sak name="A_Classic_GaugeFill_Yellow" sx={{}} />

              </Box>
        
            </Box>
            <Box
              sx={{
                width: partyMembersImage.entry.width * 2,
                height: partyMembersImage.entry.height * 2,
                backgroundImage: `url(${partyMembersImage.image})`,
                backgroundSize: "cover",
              }}
            />
            <Box
              sx={{
                width: targetImage.entry.width * 2,
                height: targetImage.entry.height * 2,
                backgroundImage: `url(${targetImage.image})`,
                backgroundSize: "cover",
              }}
            />
            <Box
              sx={{
                width: buffImage.entry.width * 2,
                height: buffImage.entry.height * 2,
                backgroundImage: `url(${buffImage.image})`,
                backgroundSize: "cover",
              }}
            />
      
          </Stack>
          <Stack
            sx={{ height: `calc(100% - ${totalTopHeight * 2}px)` }}
            direction={"column"}
            justifyContent={"center"}
            //p="20px"
          >
            <Stack
              direction={"row"}
              justifyContent={"space-between"}
              alignItems={"center"}
              sx={{ width: '75%', m: '0 auto', height: '100px',
                ['.eq-button']: {
                  borderRadius: 15,
                },
              }}
            >
              <UiButtonComponent
                onClick={() => console.log("Help")}
                buttonName="A_InventoryBtn"
                crop={true}
                entrySx={(selectedEntry) => ({
                  width: 0.8 * (selectedEntry.entry.width / scale),
                  height: 0.8 * selectedEntry.entry.height / scale,
                })}
              />
              <UiButtonComponent
                onClick={() => console.log("Help")}
                buttonName="A_ActionsBtn"
                crop={true}
                entrySx={(selectedEntry) => ({
                  width: 0.8 * (selectedEntry.entry.width / scale),
                  height: 0.8 * selectedEntry.entry.height / scale,
                })}
              />
              <UiButtonComponent
                onClick={() => console.log("Help")}
                buttonName="A_CombatSkillBtn"
                crop={true}
                entrySx={(selectedEntry) => ({
                  width: 0.8 * (selectedEntry.entry.width / scale),
                  height: 0.8 * selectedEntry.entry.height / scale,
                })}
              />
              <UiButtonComponent
                onClick={() => console.log("Help")}
                buttonName="A_FriendsBtn"
                crop={true}
                entrySx={(selectedEntry) => ({
                  width: 0.8 * (selectedEntry.entry.width / scale),
                  height: 0.8 * selectedEntry.entry.height / scale,
                })}
              />
            </Stack>
            <Stack
              sx={{ }}
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
          </Stack>
        </Box>
      </Box>
    </Box>
  );
};
