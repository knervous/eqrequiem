import React, { useMemo } from "react";
import { Box, Stack, Typography } from "@mui/material";
import { useSakImage, useSakImages } from "@ui/hooks/use-image";
import { usePlayerName } from "@game/Events/event-hooks";
import { UiImageComponent } from "@ui/common/ui-image";
import { StoneTarget } from "./stone-target";
import { StoneActions } from "./stone-actions";

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

  // Frame row heights
  const topHeight = stoneImages.topLeft.entry.height * scale;
  const middleHeight = window.innerHeight - 2 * topHeight;

  const playerImage = useSakImage("PW_BG_TX", true);
  const partyMembersImage = useSakImage("GW_BG_TX", true);
  const targetImage = useSakImage("TARGET_BG_TX", true);
  const buffImage = useSakImage("BUFF_BG_TX", true);

  const totalTopHeight =
    playerImage.entry.height +
    partyMembersImage.entry.height +
    targetImage.entry.height +
    buffImage.entry.height -
    25;
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
            transform: `scale(${scale})`,
            transformOrigin: "top left",
            width: width / scale,
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
              <Box sx={{ m: 7 }}>
                <Typography
                  variant="h6"
                  sx={{
                    fontSize: "30px",
                    color: "white",
                    textShadow: "1px 1px 2px black",
                  }}
                >
                  {playerName}
                </Typography>

                <UiImageComponent sak name="A_Classic_GaugeFill" sx={{}} />
                <UiImageComponent sak name="A_Classic_GaugeFill_Blue" sx={{}} />
                <UiImageComponent
                  sak
                  name="A_Classic_GaugeFill_Yellow"
                  sx={{}}
                />
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
            >
              <StoneTarget />
            </Box>
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
          >
            <StoneActions scale={scale} />

          </Stack>
        </Box>
      </Box>
    </Box>
  );
};
