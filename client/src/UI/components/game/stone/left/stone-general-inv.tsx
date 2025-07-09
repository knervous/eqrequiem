import { Box, Grid } from "@mui/material";
import { useSakImage } from "@ui/hooks/use-image";
import { ActionButton } from "../../action-button/action-button";

export const StoneGeneralInv: React.FC = () => {
  const invImage = useSakImage("HBW_BG_TXUP", true);

  return (
    <Box
      sx={{
        width: invImage.entry.width * 2,
        height: invImage.entry.height * 2,
        backgroundImage: `url(${invImage.image})`,
        backgroundSize: "cover",
      }}
    >
      {/** Inventory Hot Buttons */}
      <Box
        sx={{
          width: 250,
          height: 510,
          position: "relative",
          top: 15,
          left: 25,
        }}
      >
        <Grid container columns={16}>
          {Array.from({ length: 8 }).map((_, idx) => (
            <Grid key={idx} size={8} sx={{ height: 510 / 4, width: 125 }}>
              <ActionButton
                background="A_ClassicButtonBG"
                foreGround="A_ClassicButtonFG"
                action={() => console.log("Action Button Clicked")}
                size={125}
              />
            </Grid>
          ))}
        </Grid>
      </Box>
    </Box>
  );
};
