import BABYLON from "@bjs";
import type * as BJS from "@babylonjs/core";
import emitter from "@game/Events/events";
import GameManager from "@game/Manager/game-manager";
import Player from "@game/Player/player";
import { Box, Stack } from "@mui/material";
import { useSakImages } from "@ui/hooks/use-image";
import { useEffect, useMemo, useRef } from "react";

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
      const widthPx = (entry.width) * scale;
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

export const StoneInventory: React.FC<{ width: number; height: number, scale: number }> = ({
  width,
  height,
  scale,
}) => {
  const inventoryRef = useRef<HTMLDivElement>(null);
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
      if (!GameManager.instance?.SecondaryCamera || !Player.instance?.playerEntity) return;
      const camera = GameManager.instance.SecondaryCamera;
      const hDist = 14 ;
      const vDist = 5;
      const forward = Player.instance?.playerEntity.getDirection(BABYLON.Axis.X).scale(-hDist);
      const lookatOffset = new BABYLON.Vector3(0, 1.7, 0);
      camera.position
        .copyFrom(Player.instance.getPlayerPosition()!)
        .addInPlace(new BABYLON.Vector3(0,  vDist, 0))
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
      clientRect.right - (132 * scale),
      clientRect.top + (18 * scale),
      116 * scale,
      223 * scale,
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
    </Box>
  );
};
