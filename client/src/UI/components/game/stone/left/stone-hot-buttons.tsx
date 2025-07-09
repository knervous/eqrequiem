import { Box, Grid, Stack, Typography } from "@mui/material";
import { ActionHotButton } from "../../action-button/action-button";
import { useState } from "react";
import { useSakImage } from "@ui/hooks/use-image";
import { UiButtonComponent } from "@ui/common/ui-button";
import { useActionButtons } from "@game/Config/use-config";
 
const itemsPerPage = 10;

export const StoneHotButtons: React.FC<{ scale: number}> = ({ scale }) => {
  const hbImage = useSakImage("HBW_BG_TXDN", true);
  const [page, setPage] = useState(0);
  const actionButtons = useActionButtons();

  return (
    <Box
      sx={{
        width: hbImage.entry.width * 2,
        height: hbImage.entry.height * 2,
        backgroundImage: `url(${hbImage.image})`,
        backgroundSize: "cover",
      }}
    >
      <Stack direction="row" alignItems="center" justifyContent="center">
        <UiButtonComponent
          onClick={() => setPage((prev) => Math.max(prev - 1, 0))}
          scale={1.5}
          buttonName="A_LeftArrowBtn"
        />
        <Typography
          sx={{
            width: 30,
            textAlign: "center",
            fontSize: 35,
            color: "white",
            mx: 3,
          }}
        >
          {page + 1}
        </Typography>
        <UiButtonComponent
          scale={1.5}
          onClick={() => setPage((prev) => Math.min(prev + 1, 9))}
          buttonName="A_RightArrowBtn"
        />
      </Stack>
      <Box
        sx={{
          width: 250,
          height: 640,
          position: "relative",
          top: 7,
          left: 26,
        }}
      >
        <Grid container columns={16}>
          {Array.from({ length: itemsPerPage }).map((_, idx) => (
            <Grid key={idx} size={8} sx={{ height: 640 / 5, width: 125 }}>
              <ActionHotButton
                actionButtonConfig={actionButtons}
                scale={scale}
                actionData={actionButtons?.hotButtons?.[idx + (page * itemsPerPage)]}
                index={idx + (page * itemsPerPage)}
                hotButton
                size={125}
              />
            </Grid>
          ))}
        </Grid>
      </Box>
    </Box>
  );
};
