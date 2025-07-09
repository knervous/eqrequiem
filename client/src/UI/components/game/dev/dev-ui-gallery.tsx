import { useState } from "react";
import {
  Box,
  Typography,
  Grid,
  Card,
  CardMedia,
  CircularProgress,
  TextField,
} from "@mui/material";

// Main Gallery Component
export const AtlasGallery = ({ atlasData, useImageHook }) => {
  const entries = Object.entries(atlasData);
  const [searchTerm, setSearchTerm] = useState("");

  // Filter entries based on search term
  const filteredEntries = entries.filter(
    ([path, entry]) =>
      path.toLowerCase().includes(searchTerm.toLowerCase()) ||
      entry.texture.toLowerCase().includes(searchTerm.toLowerCase()),
  );

  const handleSearchChange = (event) => {
    setSearchTerm(event.target.value);
  };

  return (
    <Box sx={{ display: "flex", flexDirection: "column" }}>
      {/* Search Input */}
      <Box sx={{ px: 2, pb: 2 }}>
        <TextField
          fullWidth
          variant="outlined"
          label="Search by path"
          value={searchTerm}
          onChange={handleSearchChange}
          placeholder="Enter path to filter images..."
          sx={{ maxWidth: 600 }}
        />
      </Box>

      <Box
        component="section"
        sx={{
          flex: 1,
          overflowY: "auto",
          p: 2,
        }}
      >
        {filteredEntries.length === 0 ? (
          <Typography align="center" sx={{ py: 4 }}>
            No images found matching your search.
          </Typography>
        ) : (
          <Grid container spacing={2}>
            {filteredEntries.map(([path]) => (
              <Grid item key={path} >
                <AtlasImageItem path={path} useImageHook={useImageHook} />
              </Grid>
            ))}
          </Grid>
        )}
      </Box>
    </Box>
  );
};

// Individual Image Item (unchanged)
const AtlasImageItem = ({ path, useImageHook }) => {
  const {
    image,
    entry: { width = 10, height = 10, texture } = {
      width: 10,
      height: 10,
      texture: "",
    },
  } = useImageHook(path, true);

  return (
    <>
      <Typography sx={{ color: "white", fontSize: "14px" }}>
        {path} - {texture}
      </Typography>
      <Card
        sx={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          p: 0,
          backgroundColor: "transparent",
        }}
      >
        {image ? (
          <CardMedia
            component="img"
            image={image}
            title={path}
            alt={path}
            sx={{
              width,
              height,
              objectFit: "contain",
              background: "rgba(0, 0, 0, 0.4)",
            }}
          />
        ) : (
          <Box
            sx={{
              width,
              height,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <CircularProgress size={24} />
          </Box>
        )}
      </Card>
    </>
  );
};

export default AtlasGallery;
