import { memo } from "react";
import {
  Divider,
  MenuItem,
  Select,
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import { UiButtonComponent } from "@ui/common/ui-button";

// ↑ at top of file, outside of CharacterCreate
export const StatRow = memo(function StatRow({
  label,
  stat,
  value,
  isPreferred,
  baseValue,
  isDisabled,
  onDecrement,
  onIncrement,
}) {
  return (
    <Stack sx={{ marginTop: "0px" }} direction={"row"}>
      <Stack
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
            sx={{ color: isPreferred ? "lightgreen" : "white" }}
            variant="p"
          >
            {value}
          </Typography>
        </Typography>
      </Stack>
      <Stack
        sx={{ marginTop: "15px" }}
        width={"40px"}
        justifyContent={"space-between"}
        direction={"row"}
      >
        <UiButtonComponent
          scale={1.5}
          buttonName="A_MinusBtn"
          isDisabled={value === baseValue}
          onClick={() => onDecrement(stat)}
        />
        <UiButtonComponent
          scale={1.5}
          isDisabled={isDisabled}
          buttonName="A_PlusBtn"
          onClick={() => onIncrement(stat)}
        />
      </Stack>
    </Stack>
  );
});