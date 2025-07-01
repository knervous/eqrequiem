import BABYLON from "@bjs";
import type * as BJS from "@babylonjs/core";
import emitter from "@game/Events/events";
import GameManager from "@game/Manager/game-manager";
import Player from "@game/Player/player";
import { Box, Stack, Typography } from "@mui/material";
import { useSakImages } from "@ui/hooks/use-image";
import { useEffect, useMemo, useRef } from "react";
import { usePlayerProfile } from "@game/Events/event-hooks";
import { CLASS_DATA_NAMES } from "@game/Constants/class-data";
import { getDeityName } from "@game/Constants/util";
import { UiImageComponent } from "@ui/common/ui-image";

const stoneConfigs = [
  { key: "invTopLeft", name: "INV_BG_TXTOPLEFT", bgSize: "cover" },
  { key: "invTopRight", name: "INV_BG_TXTOPRIGHT", bgSize: "cover" },
  { key: "invBottomLeft", name: "INV_BG_TXLOWLEFT", bgSize: "cover" },
  { key: "invBottomRight", name: "INV_BG_TXLOWRIGHT", bgSize: "cover" },
];

const StoneRow: React.FC<{
  keys: string[];
  stoneImages: Record<string, any>;
  height: number;
  scale: number;
}> = ({ keys, stoneImages, height, scale }) => (
  <Stack direction="row" spacing={0}>
    {keys.map((key) => {
      const { entry, image, bgSize } = stoneImages[key];
      const widthPx = entry.width * scale;
      return (
        <Box
          key={key}
          sx={{
            width: widthPx,
            height: height * scale,
            backgroundImage: `url(${image})`,
            backgroundSize: bgSize,
          }}
        />
      );
    })}
  </Stack>
);
const imageNames = stoneConfigs.map(({ name }) => `${name}`);

export const StoneInventory: React.FC<{
  width: number;
  height: number;
  scale: number;
}> = ({ width, height, scale }) => {
  const inventoryRef = useRef<HTMLDivElement>(null);
  const bgImages = useSakImages(imageNames, true);
  const player = usePlayerProfile();
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
  useEffect(() => {
    if (!GameManager.instance) {
      return;
    }
    GameManager.instance.initializeSecondaryCamera();
    return () => {
      if (GameManager.instance) {
        GameManager.instance.removeSecondaryCamera();
      }
    };
  }, []);

  // Camera update useEffect
  useEffect(() => {
    const cb = () => {
      if (
        !GameManager.instance?.SecondaryCamera ||
        !Player.instance?.playerEntity
      )
        return;
      const camera = GameManager.instance.SecondaryCamera;
      const hDist = 14;
      const vDist = 5;
      const forward = Player.instance?.playerEntity
        .getDirection(BABYLON.Axis.X)
        .scale(-hDist);
      const lookatOffset = new BABYLON.Vector3(0, 1.7, 0);
      camera.position
        .copyFrom(Player.instance.getPlayerPosition()!)
        .addInPlace(new BABYLON.Vector3(0, vDist, 0))
        .addInPlace(forward);
      camera.setTarget(Player.instance.getPlayerPosition()!.add(lookatOffset));
    };
    emitter.on("playerPosition", cb);
    emitter.on("playerRotation", cb);

    return () => {
      emitter.off("playerPosition", cb);
      emitter.off("playerRotation", cb);
    };
  }, []);
  useEffect(() => {
    const clientRect = inventoryRef.current?.getBoundingClientRect();
    if (!clientRect) return;

    GameManager.instance.setInventoryViewport(
      clientRect.right - 132 * scale,
      clientRect.top + 14 * scale,
      118 * scale,
      225 * scale,
    );
  }, [width, height, scale]);

  const dimensions = useMemo(() => {
    const { invTopLeft, invTopRight, invBottomLeft } = stoneImages;
    const width = invTopLeft.entry.width + invTopRight.entry.width;
    const height = invTopLeft.entry.height + invBottomLeft.entry.height;
    return { width: width * scale, height: height * scale };
  }, [stoneImages, scale]);

  return (
    <Box
      ref={inventoryRef}
      onClickCapture={() => {
        console.log("Click captured on StoneInventory");
      }}
      sx={{
        position: "absolute",
        zIndex: 5,
        width: dimensions.width,
        height: dimensions.height,
        top: height / 2 - dimensions.height / 2,
        left: width / 2 - dimensions.width / 2,
      }}
    >
      <StoneRow
        keys={["invTopLeft", "invTopRight"]}
        stoneImages={stoneImages}
        scale={scale}
        height={stoneImages.invTopLeft.entry.height}
      />
      <StoneRow
        keys={["invBottomLeft", "invBottomRight"]}
        stoneImages={stoneImages}
        scale={scale}
        height={stoneImages.invBottomLeft.entry.height}
      />

      {/* Text Overlay */}
      <Box
        sx={{
          position: "absolute",
          top: 0,
          left: 0,
          width: dimensions.width,
          height: dimensions.height,
          transform: `scale(${scale})`,
          transformOrigin: "top left",
          ["& > .invui, .invui p"]: {
            position: "absolute",
            fontSize: "13px",
            color: "white",
            userSelect: "none",
          },
          [".uistat"]: {
            fontSize: "12px !important",
            position: "relative !important",
            lineHeight: "1.2 !important",
          },
        }}
      >
        <Typography className="invui" sx={{ top: 12, left: 17 }}>
          {player?.name || ""}
        </Typography>
        <Typography className="invui" sx={{ top: 53, left: 60 }}>
          {player?.level || ""}
        </Typography>
        <Typography className="invui" sx={{ top: 73, left: 25 }}>
          {CLASS_DATA_NAMES[player?.charClass ?? ""] || ""}
        </Typography>
        <Typography className="invui" sx={{ top: 90, left: 25 }}>
          {getDeityName(player?.deity ?? 0) || ""}
        </Typography>
        <Typography
          className="invui"
          sx={{ top: 114, left: 65, color: "lightgray !important" }}
        >
          100/100{/* HP placeholder */}
        </Typography>
        <Typography
          className="invui"
          sx={{ top: 129, left: 65, color: "lightgray !important" }}
        >
          10 {/* AC placeholder */}
        </Typography>
        <Typography
          className="invui"
          sx={{ top: 145, left: 65, color: "lightgray !important" }}
        >
          10 {/* ATK placeholder */}
        </Typography>
        <Box
          className="invui"
          sx={{ top: 212, left: 24, color: "lightgray !important" }}
        >
          <UiImageComponent sak name="A_Classic_GaugeFill_Yellow" />
        </Box>
        <Stack
          className="invui"
          direction="column"
          sx={{
            top: 257,
            left: 40,
            width: "60px",
            height: "300px",
          }}
          spacing={0}
        >
          <Stack spacing={1} direction="row" justifyContent={"space-between"}>
            <Typography className="uistat">STR</Typography>
            <Typography className="uistat">{player?.str}</Typography>
          </Stack>
          <Stack spacing={1} direction="row" justifyContent={"space-between"}>
            <Typography className="uistat">STA</Typography>
            <Typography className="uistat">{player?.sta}</Typography>
          </Stack>
          <Stack spacing={1} direction="row" justifyContent={"space-between"}>
            <Typography className="uistat">DEX</Typography>
            <Typography className="uistat">{player?.dex}</Typography>
          </Stack>
          <Stack spacing={1} direction="row" justifyContent={"space-between"}>
            <Typography className="uistat">AGI</Typography>
            <Typography className="uistat">{player?.agi}</Typography>
          </Stack>
          <Stack spacing={1} direction="row" justifyContent={"space-between"}>
            <Typography className="uistat">WIS</Typography>
            <Typography className="uistat">{player?.wis}</Typography>
          </Stack>
          <Stack spacing={1} direction="row" justifyContent={"space-between"}>
            <Typography className="uistat">INT</Typography>
            <Typography className="uistat">{player?.intel}</Typography>
          </Stack>
          <Stack spacing={1} direction="row" justifyContent={"space-between"}>
            <Typography className="uistat">CHA</Typography>
            <Typography className="uistat">{player?.cha}</Typography>
          </Stack>
        </Stack>
        {/* Resists */}
        <Stack
          className="invui"
          direction="column"
          sx={{
            top: 400,
            left: 30,
            width: "90px",
            height: "300px",
          }}
          spacing={0}
        >
          <Stack spacing={1} direction="row" justifyContent={"space-between"}>
            <Typography className="uistat">POISON</Typography>
            <Typography className="uistat">{player?.stats?.poisonResist ?? 0}</Typography>

          </Stack>
          <Stack spacing={1} direction="row" justifyContent={"space-between"}>
            <Typography className="uistat">MAGIC</Typography>
            <Typography className="uistat">{player?.stats?.magicResist ?? 0}</Typography>
          </Stack>
          <Stack spacing={1} direction="row" justifyContent={"space-between"}>
            <Typography className="uistat">DISEASE</Typography>
            <Typography className="uistat">{player?.stats?.diseaseResist ?? 0}</Typography>
          </Stack>
          <Stack spacing={1} direction="row" justifyContent={"space-between"}>
            <Typography className="uistat">FIRE</Typography>
            <Typography className="uistat">{player?.stats?.fireResist ?? 0}</Typography>
          </Stack>
          <Stack spacing={1} direction="row" justifyContent={"space-between"}>
            <Typography className="uistat">COLD</Typography>
            <Typography className="uistat">{player?.stats?.coldResist ?? 0}</Typography>
          </Stack>
        </Stack>
      </Box>
    </Box>
  );
};
