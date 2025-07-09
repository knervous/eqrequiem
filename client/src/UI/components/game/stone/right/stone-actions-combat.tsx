import { Grid, Stack, Typography } from "@mui/material";
import { UiButtonComponent } from "@ui/common/ui-button";
import { ActionButton } from "../../action-button/action-button";


export const StoneActionsCombat: React.FC<{
  scale: number;
}> = ({ scale }) => {
  return  (
    <>
      <Stack direction="row" sx={{ m: 0, p: 0 }} alignItems="center" justifyContent="center">
        <UiButtonComponent
          onClick={() => console.log("Prev")}
          scale={1.5}
          buttonName="A_LeftArrowBtn"
        />
        <Typography sx={{ fontSize: 35, color: "white", mx: 3 }}>
                1
        </Typography>
        <UiButtonComponent
          scale={1.5}
          onClick={() => console.log("Next")}
          buttonName="A_RightArrowBtn"
        />
      </Stack>
      <Grid
        container
        sx={{
          width: '100%',
          height: "350px",
          margin: "10px auto",
          padding: "0px 40px",
        }}
        columns={16}
      >
        {Array.from({ length: 6 }).map((_, idx) => (
          <Grid key={idx} size={8}>
            <ActionButton
              scale={scale}
              size={105}
              text={`Test`}
              buttonName={"A_SquareBtn"}
              action={() => console.log("Action Button Clicked")}
            />
          </Grid>
        ))}
      </Grid>
    </>
  );
};