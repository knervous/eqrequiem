import { useEffect, useMemo, useRef } from 'react';
import BABYLON from '@bjs';
import { CLASS_DATA_NAMES } from '@game/Constants/class-data';
import { getDeityName } from '@game/Constants/util';
import { usePlayerLevel, usePlayerProfile } from '@game/Events/event-hooks';
import emitter from '@game/Events/events';
import GameManager from '@game/Manager/game-manager';
import Player from '@game/Player/player';
import { InventorySlot } from '@game/Player/player-constants';
import { Box, Stack, Typography } from '@mui/material';
import { UiButtonComponent } from '@ui/common/ui-button';
import { UiImageComponent } from '@ui/common/ui-image';
import { ItemButton } from '@ui/components/game/action-button/item-button';
import { useSakImages } from '@ui/hooks/use-image';
import { StoneGeneralInv } from '../../left/stone-general-inv';

const stoneConfigs = [
  { key: 'invTopLeft', name: 'INV_BG_TXTOPLEFT', bgSize: 'cover' },
  { key: 'invTopRight', name: 'INV_BG_TXTOPRIGHT', bgSize: 'cover' },
  { key: 'invBottomLeft', name: 'INV_BG_TXLOWLEFT', bgSize: 'cover' },
  { key: 'invBottomRight', name: 'INV_BG_TXLOWRIGHT', bgSize: 'cover' },
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
            width          : widthPx,
            height         : height * scale,
            backgroundImage: `url(${image})`,
            backgroundSize : bgSize,
          }}
        />
      );
    })}
  </Stack>
);
const imageNames = stoneConfigs.map(({ name }) => `${name}`);

export const StoneInventory: React.FC<{
  open: boolean;
  width: number;
  height: number;
  scale: number;
}> = ({ width, height, scale, open }) => {
  const inventoryRef = useRef<HTMLDivElement>(null);
  const bgImages = useSakImages(imageNames, true);
  const level = usePlayerLevel();
  const player = usePlayerProfile();
  const stoneImages = useMemo(
    () =>
      stoneConfigs.reduce(
        (acc, { key, bgSize }, idx) => {
          acc[key] = {
            entry: bgImages[idx]?.entry ?? {},
            image: bgImages[idx]?.image ?? '',
            bgSize,
          };
          return acc;
        },
        {} as Record<string, any>,
      ),
    [bgImages],
  );
  useEffect(() => {
    console.log('StoneInventory mounted', open);
    if (open) {
      GameManager.instance.initializeSecondaryCamera();
    } else {
      GameManager.instance.removeSecondaryCamera();
    }
  }, [open]);

  // Camera update useEffect
  useEffect(() => {
    const cb = () => {
      if (
        !GameManager.instance?.SecondaryCamera ||
        !Player.instance?.playerEntity
      ) {
        return;
      }
      const camera = GameManager.instance.SecondaryCamera;
      const hDist = 10;
      const vDist = 3;
      const forward = Player.instance?.playerEntity
        .getDirection(BABYLON.Axis.X)
        .scale(-hDist);
      const lookatOffset = new BABYLON.Vector3(0, 1.0, 0);
      camera.position
        .copyFrom(Player.instance.getPlayerPosition()!)
        .addInPlace(new BABYLON.Vector3(0, vDist, 0))
        .addInPlace(forward);
      camera.setTarget(Player.instance.getPlayerPosition()!.add(lookatOffset));
    };
    emitter.on('playerPosition', cb);
    emitter.on('playerRotation', cb);

    return () => {
      emitter.off('playerPosition', cb);
      emitter.off('playerRotation', cb);
    };
  }, []);
  useEffect(() => {
    const clientRect = inventoryRef.current?.getBoundingClientRect();
    if (!clientRect) {
      return;
    }

    GameManager.instance.setInventoryViewport(
      clientRect.right - 132 * scale,
      clientRect.top + 14 * scale,
      118 * scale,
      225 * scale,
    );
  }, [width, height, scale, open]);

  const dimensions = useMemo(() => {
    const { invTopLeft, invTopRight, invBottomLeft } = stoneImages;
    const width = invTopLeft.entry.width + invTopRight.entry.width;
    const height = invTopLeft.entry.height + invBottomLeft.entry.height;
    return { width: width * scale, height: height * scale };
  }, [stoneImages, scale]);

  return (
    <Box
      ref={inventoryRef}
      sx={{
        position: 'absolute',
        display : open ? 'initial' : 'none',
        zIndex  : 5,
        width   : dimensions.width,
        height  : dimensions.height,
        top     : height / 2 - dimensions.height / 2,
        left    : width / 2 - dimensions.width / 2,
      }}
      onClickCapture={() => {
        // console.log('Click captured on StoneInventory');
      }}
    >
      <StoneRow
        height={stoneImages.invTopLeft.entry.height}
        keys={['invTopLeft', 'invTopRight']}
        scale={scale}
        stoneImages={stoneImages}
      />
      <StoneRow
        height={stoneImages.invBottomLeft.entry.height}
        keys={['invBottomLeft', 'invBottomRight']}
        scale={scale}
        stoneImages={stoneImages}
      />

      {/* Text Overlay */}
      <Box
        sx={{
          position                : 'absolute',
          top                     : 0,
          left                    : 0,
          width                   : dimensions.width,
          height                  : dimensions.height,
          transform               : `scale(${scale})`,
          transformOrigin         : 'top left',
          ['& > .invui, .invui p']: {
            position  : 'absolute',
            fontSize  : '13px',
            color     : 'white',
            userSelect: 'none',
          },
          ['.uistat']: {
            fontSize  : '12px !important',
            position  : 'relative !important',
            lineHeight: '1.2 !important',
          },
        }}
      >
        <Typography className="invui" sx={{ top: 12, left: 17 }}>
          {player?.name || ''}
        </Typography>
        <Typography className="invui" sx={{ top: 53, left: 60 }}>
          {level || ''}
        </Typography>
        <Typography className="invui" sx={{ top: 73, left: 25 }}>
          {CLASS_DATA_NAMES[player?.charClass ?? ''] || ''}
        </Typography>
        <Typography className="invui" sx={{ top: 90, left: 25 }}>
          {getDeityName(player?.deity ?? 0) || ''}
        </Typography>
        <Typography
          className="invui"
          sx={{ top: 114, left: 65, color: 'lightgray !important' }}
        >
          {player?.curHp ?? 0}/{player?.maxHp ?? 0}
          {/* HP placeholder */}
        </Typography>
        <Typography
          className="invui"
          sx={{ top: 129, left: 65, color: 'lightgray !important' }}
        >
          10 {/* AC placeholder */}
        </Typography>
        <Typography
          className="invui"
          sx={{ top: 145, left: 65, color: 'lightgray !important' }}
        >
          10 {/* ATK placeholder */}
        </Typography>
        <Box
          className="invui"
          sx={{ top: 212, left: 23, color: 'lightgray !important' }}
        >
          <UiImageComponent sak name="A_Classic_GaugeFill_Yellow" />
        </Box>
        <Stack
          className="invui"
          direction="column"
          spacing={0}
          sx={{
            top   : 257,
            left  : 30,
            width : '90px',
            height: '300px',
          }}
        >
          <Stack direction="row" justifyContent={'space-between'} spacing={1}>
            <Typography className="uistat">STR</Typography>
            <Typography className="uistat">{player?.str}</Typography>
          </Stack>
          <Stack direction="row" justifyContent={'space-between'} spacing={1}>
            <Typography className="uistat">STA</Typography>
            <Typography className="uistat">{player?.sta}</Typography>
          </Stack>
          <Stack direction="row" justifyContent={'space-between'} spacing={1}>
            <Typography className="uistat">DEX</Typography>
            <Typography className="uistat">{player?.dex}</Typography>
          </Stack>
          <Stack direction="row" justifyContent={'space-between'} spacing={1}>
            <Typography className="uistat">AGI</Typography>
            <Typography className="uistat">{player?.agi}</Typography>
          </Stack>
          <Stack direction="row" justifyContent={'space-between'} spacing={1}>
            <Typography className="uistat">WIS</Typography>
            <Typography className="uistat">{player?.wis}</Typography>
          </Stack>
          <Stack direction="row" justifyContent={'space-between'} spacing={1}>
            <Typography className="uistat">INT</Typography>
            <Typography className="uistat">{player?.intel}</Typography>
          </Stack>
          <Stack direction="row" justifyContent={'space-between'} spacing={1}>
            <Typography className="uistat">CHA</Typography>
            <Typography className="uistat">{player?.cha}</Typography>
          </Stack>
        </Stack>
        {/* Resists */}
        <Stack
          className="invui"
          direction="column"
          spacing={0}
          sx={{
            top   : 400,
            left  : 30,
            width : '90px',
            height: '300px',
          }}
        >
          <Stack direction="row" justifyContent={'space-between'} spacing={1}>
            <Typography className="uistat">POISON</Typography>
            <Typography className="uistat">
              {player?.poisonResist ?? 0}
            </Typography>
          </Stack>
          <Stack direction="row" justifyContent={'space-between'} spacing={1}>
            <Typography className="uistat">MAGIC</Typography>
            <Typography className="uistat">
              {player?.magicResist ?? 0}
            </Typography>
          </Stack>
          <Stack direction="row" justifyContent={'space-between'} spacing={1}>
            <Typography className="uistat">DISEASE</Typography>
            <Typography className="uistat">
              {player?.diseaseResist ?? 0}
            </Typography>
          </Stack>
          <Stack direction="row" justifyContent={'space-between'} spacing={1}>
            <Typography className="uistat">FIRE</Typography>
            <Typography className="uistat">
              {player?.fireResist ?? 0}
            </Typography>
          </Stack>
          <Stack direction="row" justifyContent={'space-between'} spacing={1}>
            <Typography className="uistat">COLD</Typography>
            <Typography className="uistat">
              {player?.coldResist ?? 0}
            </Typography>
          </Stack>
        </Stack>

        {/* Bottom Buttons */}
        <Box
          className="invui"
          sx={{
            top : 425,
            left: 400,
          }}
        >
          <UiButtonComponent
            buttonName="DESTROYButton_"
            scale={0.5}
            onClick={() => {
              if (!Player.instance?.hasCursorItem) {
                return;
              }
              Player.instance?.playerInventory?.destroyCursorItem();
            }}
          />
        </Box>
        <Box
          className="invui"
          sx={{
            top : 455,
            left: 435,
          }}
        >
          <UiButtonComponent
            buttonName="DONEButton_"
            scale={0.5}
            onClick={() => {
              emitter.emit('toggleInventory');
            }}
          />
        </Box>
        {/* Equipment Slots */}
        {/* Row 1 */}
        <Box
          className="invui"
          sx={{
            top   : 23,
            left  : 195,
            width : 62,
            height: 62,
          }}
        >
          <ItemButton bagSlot={-1} scale={scale} slot={InventorySlot.Ear1} />
        </Box>
        <Box
          className="invui"
          sx={{
            top   : 23,
            left  : 261,
            width : 62,
            height: 62,
          }}
        >
          <ItemButton bagSlot={-1} scale={scale} slot={InventorySlot.Neck} />
        </Box>
        <Box
          className="invui"
          sx={{
            top   : 23,
            left  : 327,
            width : 62,
            height: 62,
          }}
        >
          <ItemButton bagSlot={-1} scale={scale} slot={InventorySlot.Face} />
        </Box>
        <Box
          className="invui"
          sx={{
            top   : 23,
            left  : 393,
            width : 62,
            height: 62,
          }}
        >
          <ItemButton bagSlot={-1} scale={scale} slot={InventorySlot.Head} />
        </Box>
        <Box
          className="invui"
          sx={{
            top   : 23,
            left  : 459,
            width : 62,
            height: 62,
          }}
        >
          <ItemButton bagSlot={-1} scale={scale} slot={InventorySlot.Ear2} />
        </Box>

        {/* Row 2 */}
        <Box
          className="invui"
          sx={{
            top   : 107,
            left  : 161,
            width : 62,
            height: 62,
          }}
        >
          <ItemButton bagSlot={-1} scale={scale} slot={InventorySlot.Finger1} />
        </Box>

        <Box
          className="invui"
          sx={{
            top   : 107,
            left  : 227,
            width : 62,
            height: 62,
          }}
        >
          <ItemButton bagSlot={-1} scale={scale} slot={InventorySlot.Wrist1} />
        </Box>
        <Box
          className="invui"
          sx={{
            top   : 107,
            left  : 293,
            width : 62,
            height: 62,
          }}
        >
          <ItemButton bagSlot={-1} scale={scale} slot={InventorySlot.Arms} />
        </Box>
        <Box
          className="invui"
          sx={{
            top   : 107,
            left  : 359,
            width : 62,
            height: 62,
          }}
        >
          <ItemButton bagSlot={-1} scale={scale} slot={InventorySlot.Hands} />
        </Box>
        <Box
          className="invui"
          sx={{
            top   : 107,
            left  : 425,
            width : 62,
            height: 62,
          }}
        >
          <ItemButton bagSlot={-1} scale={scale} slot={InventorySlot.Wrist2} />
        </Box>
        <Box
          className="invui"
          sx={{
            top   : 107,
            left  : 491,
            width : 62,
            height: 62,
          }}
        >
          <ItemButton bagSlot={-1} scale={scale} slot={InventorySlot.Finger2} />
        </Box>

        {/* Row 3 */}
        <Box
          className="invui"
          sx={{
            top   : 191,
            left  : 161,
            width : 62,
            height: 62,
          }}
        >
          <ItemButton
            bagSlot={-1}
            scale={scale}
            slot={InventorySlot.Shoulders}
          />
        </Box>
        <Box
          className="invui"
          sx={{
            top   : 191,
            left  : 227,
            width : 62,
            height: 62,
          }}
        >
          <ItemButton bagSlot={-1} scale={scale} slot={InventorySlot.Chest} />
        </Box>
        <Box
          className="invui"
          sx={{
            top   : 191,
            left  : 293,
            width : 62,
            height: 62,
          }}
        >
          <ItemButton bagSlot={-1} scale={scale} slot={InventorySlot.Back} />
        </Box>
        <Box
          className="invui"
          sx={{
            top   : 191,
            left  : 359,
            width : 62,
            height: 62,
          }}
        >
          <ItemButton bagSlot={-1} scale={scale} slot={InventorySlot.Waist} />
        </Box>
        <Box
          className="invui"
          sx={{
            top   : 191,
            left  : 425,
            width : 62,
            height: 62,
          }}
        >
          <ItemButton bagSlot={-1} scale={scale} slot={InventorySlot.Legs} />
        </Box>
        <Box
          className="invui"
          sx={{
            top   : 191,
            left  : 491,
            width : 62,
            height: 62,
          }}
        >
          <ItemButton bagSlot={-1} scale={scale} slot={InventorySlot.Feet} />
        </Box>

        {/* Row 4 */}
        <Box
          className="invui"
          sx={{
            top   : 275,
            left  : 227,
            width : 62,
            height: 62,
          }}
        >
          <ItemButton bagSlot={-1} scale={scale} slot={InventorySlot.Primary} />
        </Box>
        <Box
          className="invui"
          sx={{
            top   : 275,
            left  : 293,
            width : 62,
            height: 62,
          }}
        >
          <ItemButton
            bagSlot={-1}
            scale={scale}
            slot={InventorySlot.Secondary}
          />
        </Box>
        <Box
          className="invui"
          sx={{
            top   : 275,
            left  : 359,
            width : 62,
            height: 62,
          }}
        >
          <ItemButton bagSlot={-1} scale={scale} slot={InventorySlot.Range} />
        </Box>
        <Box
          className="invui"
          sx={{
            top   : 275,
            left  : 425,
            width : 62,
            height: 62,
          }}
        >
          <ItemButton bagSlot={-1} scale={scale} slot={InventorySlot.Ammo} />
        </Box>

        {/* Inventory Slots */}
        <Box
          className="invui"
          sx={{
            top   : 256,
            left  : 578,
            width : 125,
            height: 254,
          }}
        >
          <StoneGeneralInv contain scale={scale} />
        </Box>
      </Box>
    </Box>
  );
};
