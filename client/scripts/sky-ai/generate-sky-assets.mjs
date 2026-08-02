#!/usr/bin/env node

import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";
import { SdCppImg2ImgClient } from "../icon-ai/sdcpp-client.mjs";
import { SdCppServer } from "../icon-ai/sdcpp-server.mjs";
import { enforcePeriodicEdges } from "../material-ai/zone-material-pipeline.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, "../../..");
const sourceRoot = path.join(
  repoRoot,
  "assets/src/world/sky/textures/generated",
);
const publicRoot = path.join(
  repoRoot,
  "client/public/eqrequiem/sky/textures",
);
const generationSize = 384;
const outputSize = 512;
const steps = 20;

const sharedNegative = [
  "text",
  "letters",
  "logo",
  "watermark",
  "frame",
  "border",
  "landscape",
  "horizon",
  "building",
  "character",
  "spaceship",
  "satellite",
  "science fiction",
  "modern object",
  "cartoon",
  "vector art",
  "oversaturated",
  "blurry",
].join(", ");

const recipes = [
  {
    id: "cloud-field",
    file: "cloud-field.webp",
    periodic: true,
    strength: 0.48,
    prompt: [
      "seamless tileable neutral-grayscale cloud density field",
      "broad connected cumulus banks mixed with fragmented vapor clusters and feathered wispy cirrus",
      "realistic multi-scale billows, soft self-shadowing, eroded gaps, and fine wind-shaped edge breakup",
      "continuous luminance from dark thin vapor through mid-gray cloud to soft bright dense cores",
      "orthographic horizonless atmospheric texture filling the frame",
      "grounded premium medieval high-fantasy naturalism",
      "no focal cloud, baked sky color, or directional sunlight",
    ].join(", "),
    negative: `${sharedNegative}, sun, moon, stars, storm vortex, face, animal, isolated circular cotton balls, lifeless blobs, repeated puffs, hard cutout edges, featureless smears`,
  },
  {
    id: "star-field",
    file: "star-field.webp",
    periodic: true,
    strength: 0.18,
    prompt: [
      "seamless tileable natural night star field texture",
      "deep charcoal navy-black sky",
      "many tiny sharp stars with realistic variation in brightness and color",
      "very faint milky stellar dust",
      "restrained medieval high-fantasy night atmosphere",
      "flat celestial texture filling the frame",
    ].join(", "),
    negative: `${sharedNegative}, moon, sun, planet, large nebula, galaxy spiral, constellation lines, giant stars`,
  },
  {
    id: "sun-photosphere",
    file: "sun-photosphere.webp",
    periodic: false,
    celestial: true,
    mode: "txt2img",
    strength: null,
    prompt: [
      "astronomical telescope photograph of a single realistic solar photosphere",
      "perfectly centered full circular sun disc",
      "bright warm pale gold surface with restrained amber granulation",
      "turbulent luminous convection cells and subtle natural prominences",
      "isolated on pure black",
      "flat symmetrical front view occupying seventy percent of the frame",
      "medieval high-fantasy natural sky asset",
    ].join(", "),
    negative: `${sharedNegative}, multiple suns, face, symbol, rays reaching frame edge, lens flare, clouds, planet, Jupiter, Saturn, stripes, bands, sphere shading, basket weave, herringbone, zigzag pattern`,
  },
  {
    id: "moon-surface",
    file: "moon-surface.webp",
    periodic: false,
    celestial: true,
    strength: 0.48,
    prompt: [
      "single realistic full moon",
      "perfectly centered circular lunar disc",
      "detailed silver blue-gray cratered stone surface",
      "restrained natural maria and highlands",
      "isolated on pure black",
      "symmetrical orthographic front view with empty margins",
      "medieval high-fantasy natural sky asset",
    ].join(", "),
    negative: `${sharedNegative}, crescent, multiple moons, face, symbol, planet rings, clouds, stars, bubbles, glass spheres, balloons, soap film`,
  },
];

const digest = (bytes) =>
  createHash("sha256").update(bytes).digest("hex");

function seededRandom(seedText) {
  let state = createHash("sha256").update(seedText).digest().readUInt32LE(0);
  return () => {
    state = (Math.imul(state, 1_664_525) + 1_013_904_223) >>> 0;
    return state / 0x1_0000_0000;
  };
}

const clampByte = (value) => Math.max(0, Math.min(255, Math.round(value)));

async function createGuide(recipe) {
  const size = generationSize;
  const pixels = Buffer.alloc(size * size * 3);
  const random = seededRandom(`eltania-sky-guide-v2:${recipe.id}`);
  const setPixel = (x, y, red, green, blue) => {
    const index = (y * size + x) * 3;
    pixels[index] = clampByte(red);
    pixels[index + 1] = clampByte(green);
    pixels[index + 2] = clampByte(blue);
  };

  if (recipe.id === "cloud-field") {
    const clouds = Array.from({ length: 46 }, () => ({
      x: random() * size,
      y: random() * size,
      radiusX: size * (0.035 + random() * 0.11),
      radiusY: size * (0.025 + random() * 0.07),
      weight: 0.4 + random() * 0.6,
    }));
    for (let y = 0; y < size; y += 1) {
      for (let x = 0; x < size; x += 1) {
        let cloud = 0;
        for (const blob of clouds) {
          const dx = Math.min(
            Math.abs(x - blob.x),
            size - Math.abs(x - blob.x),
          );
          const dy = Math.min(
            Math.abs(y - blob.y),
            size - Math.abs(y - blob.y),
          );
          const distance =
            (dx * dx) / (blob.radiusX * blob.radiusX) +
            (dy * dy) / (blob.radiusY * blob.radiusY);
          cloud += Math.exp(-distance * 1.7) * blob.weight;
        }
        const density = Math.max(0, Math.min(1, (cloud - 0.42) * 0.9));
        const variation =
          Math.sin(x * 0.081 + y * 0.037) * 3 +
          Math.sin(x * 0.023 - y * 0.067) * 2;
        setPixel(
          x,
          y,
          47 + density * 188 + variation,
          82 + density * 169 + variation,
          124 + density * 129 + variation,
        );
      }
    }
  } else if (recipe.id === "star-field") {
    for (let y = 0; y < size; y += 1) {
      for (let x = 0; x < size; x += 1) {
        const dust =
          Math.sin(x * 0.018 + y * 0.011) * 2 +
          Math.sin(x * 0.007 - y * 0.021) * 1.5;
        setPixel(x, y, 4 + dust, 7 + dust, 16 + dust * 1.7);
      }
    }
    for (let star = 0; star < 820; star += 1) {
      const x = Math.floor(random() * size);
      const y = Math.floor(random() * size);
      const bright = random() > 0.92;
      const intensity = bright ? 170 + random() * 85 : 55 + random() * 125;
      const warmth = random();
      setPixel(
        x,
        y,
        intensity * (warmth > 0.82 ? 1 : 0.82),
        intensity * 0.9,
        intensity * (warmth < 0.22 ? 1 : 0.88),
      );
      if (bright) {
        for (const [offsetX, offsetY] of [
          [-1, 0],
          [1, 0],
          [0, -1],
          [0, 1],
        ]) {
          setPixel(
            (x + offsetX + size) % size,
            (y + offsetY + size) % size,
            intensity * 0.3,
            intensity * 0.34,
            intensity * 0.42,
          );
        }
      }
    }
  } else if (recipe.id === "sun-photosphere") {
    for (let y = 0; y < size; y += 1) {
      for (let x = 0; x < size; x += 1) {
        const normalizedX = (x + 0.5) / size * 2 - 1;
        const normalizedY = (y + 0.5) / size * 2 - 1;
        const radius = Math.hypot(normalizedX, normalizedY);
        if (radius > 0.78) {
          setPixel(x, y, 0, 0, 0);
          continue;
        }
        const granulation =
          Math.sin(x * 0.31 + Math.sin(y * 0.17) * 2.4) * 13 +
          Math.sin(y * 0.37 - Math.sin(x * 0.13) * 2.1) * 10 +
          Math.sin((x + y) * 0.73) * 5;
        const lane = Math.max(
          0,
          Math.sin(x * 0.083) * Math.sin(y * 0.097),
        );
        const limb = Math.sqrt(Math.max(0, 1 - (radius / 0.8) ** 2));
        setPixel(
          x,
          y,
          (224 + granulation * 0.35) * (0.82 + limb * 0.18),
          (130 + granulation - lane * 24) * (0.72 + limb * 0.28),
          (25 + granulation * 0.42) * (0.62 + limb * 0.38),
        );
      }
    }
  } else {
    const craters = Array.from({ length: 38 }, () => ({
      x: random() * size,
      y: random() * size,
      radius: size * (0.012 + Math.pow(random(), 2) * 0.095),
      depth: 10 + random() * 25,
    }));
    for (let y = 0; y < size; y += 1) {
      for (let x = 0; x < size; x += 1) {
        const normalizedX = (x + 0.5) / size * 2 - 1;
        const normalizedY = (y + 0.5) / size * 2 - 1;
        const radius = Math.hypot(normalizedX, normalizedY);
        if (radius > 0.78) {
          setPixel(x, y, 0, 0, 0);
          continue;
        }
        let craterShade = 0;
        for (const crater of craters) {
          const dx = Math.min(
            Math.abs(x - crater.x),
            size - Math.abs(x - crater.x),
          );
          const dy = Math.min(
            Math.abs(y - crater.y),
            size - Math.abs(y - crater.y),
          );
          const distance = Math.hypot(dx, dy) / crater.radius;
          if (distance < 1) craterShade -= (1 - distance) * crater.depth;
          else if (distance < 1.18) {
            craterShade +=
              (1 - Math.abs(distance - 1.09) / 0.09) * crater.depth * 0.55;
          }
        }
        const terrain =
          Math.sin(x * 0.071 + y * 0.029) * 8 +
          Math.sin(x * 0.019 - y * 0.053) * 6 +
          Math.sin((x + y) * 0.17) * 3;
        const limb = Math.sqrt(Math.max(0, 1 - (radius / 0.8) ** 2));
        const sphereLight = 0.55 + limb * 0.45;
        setPixel(
          x,
          y,
          (139 + terrain + craterShade) * sphereLight,
          (148 + terrain + craterShade) * sphereLight,
          (158 + terrain * 1.08 + craterShade) * sphereLight,
        );
      }
    }
  }

  const guidePath = path.join(sourceRoot, "guides", `${recipe.id}.png`);
  await fs.mkdir(path.dirname(guidePath), { recursive: true });
  await sharp(pixels, {
    raw: { width: size, height: size, channels: 3 },
  })
    .png()
    .toFile(guidePath);
  return guidePath;
}

async function publish(fileName, bytes) {
  await Promise.all([
    fs.mkdir(sourceRoot, { recursive: true }),
    fs.mkdir(publicRoot, { recursive: true }),
  ]);
  await Promise.all([
    fs.writeFile(path.join(sourceRoot, fileName), bytes),
    fs.writeFile(path.join(publicRoot, fileName), bytes),
  ]);
}

async function finishAsset(recipe, raw) {
  if (recipe.periodic) {
    return enforcePeriodicEdges(raw, {
      size: outputSize,
      repairBand: 32,
      sharpenSigma: recipe.id === "star-field" ? 0.7 : 0.35,
      saturation: recipe.id === "star-field" ? 0.82 : 0.9,
      brightness:
        recipe.id === "star-field"
          ? 0.58
          : recipe.id === "sun-photosphere"
            ? 1.08
            : 0.94,
    });
  }
  const alpha = Buffer.alloc(outputSize * outputSize);
  for (let y = 0; y < outputSize; y += 1) {
    for (let x = 0; x < outputSize; x += 1) {
      const normalizedX = (x + 0.5) / outputSize * 2 - 1;
      const normalizedY = (y + 0.5) / outputSize * 2 - 1;
      const radius = Math.hypot(normalizedX, normalizedY);
      alpha[y * outputSize + x] = clampByte(
        (1 - Math.max(0, Math.min(1, (radius - 0.745) / 0.025))) * 255,
      );
    }
  }
  const alphaPng = await sharp(alpha, {
    raw: { width: outputSize, height: outputSize, channels: 1 },
  })
    .png()
    .toBuffer();
  let celestial = sharp(raw)
    .resize(outputSize, outputSize, {
      fit: "fill",
      kernel: sharp.kernel.lanczos3,
    });
  celestial =
    recipe.id === "sun-photosphere"
      ? celestial.grayscale().tint({ r: 255, g: 161, b: 42 })
      : celestial.grayscale().tint({ r: 184, g: 199, b: 214 });
  return celestial
    .ensureAlpha()
    .composite([{ input: alphaPng, blend: "dest-in" }])
    .webp({ quality: 92, effort: 6, smartSubsample: true })
    .toBuffer();
}

async function writeReviewSheet() {
  const cells = await Promise.all(
    recipes.map(async (recipe) => ({
      input: await sharp(path.join(sourceRoot, recipe.file))
        .resize(256, 256, { fit: "cover" })
        .png()
        .toBuffer(),
      left: (recipes.indexOf(recipe) % 2) * 256,
      top: Math.floor(recipes.indexOf(recipe) / 2) * 256,
    })),
  );
  await sharp({
    create: {
      width: 512,
      height: 512,
      channels: 3,
      background: "#11151c",
    },
  })
    .composite(cells)
    .png()
    .toFile(path.join(sourceRoot, "review.png"));
}

async function main() {
  const server = new SdCppServer({ port: 7860, quiet: true });
  console.log("starting Mac-local stable-diffusion.cpp sky worker");
  await server.start();
  const client = new SdCppImg2ImgClient({
    baseUrl: server.baseUrl,
    timeoutMs: 600_000,
  });
  const report = {
    schema: "eltania.sky-texture-generation",
    version: 1,
    generator: "Mac-local stable-diffusion.cpp",
    generationSize,
    outputSize,
    steps,
    assets: [],
  };
  try {
    for (const recipe of recipes) {
      console.log(`generating ${recipe.id}`);
      const guidePath = await createGuide(recipe);
      const request = {
        entry: {
          id: recipe.id,
          sourceHash: digest(recipe.prompt),
        },
        generationSize,
        steps,
        prompt: recipe.prompt,
        negativePrompt: recipe.negative,
      };
      const generated =
        recipe.mode === "txt2img"
          ? await client.textToImage({ ...request, context: {} })
          : await client.variation({
              ...request,
              sourcePath: guidePath,
              strength: recipe.strength,
            });
      const output = await finishAsset(recipe, generated.rawBuffer);
      await publish(recipe.file, output);
      report.assets.push({
        id: recipe.id,
        file: recipe.file,
        prompt: recipe.prompt,
        negativePrompt: recipe.negative,
        seed: generated.seed,
        strength: generated.strength,
        sampler: generated.sampler,
        inferenceMs: generated.inferenceMs,
        sha256: digest(output),
      });
    }
    const reportBytes = Buffer.from(`${JSON.stringify(report, null, 2)}\n`);
    await publish("generation.json", reportBytes);
    await writeReviewSheet();
    console.log(`published ${report.assets.length} generated sky assets`);
  } finally {
    await server.stop();
  }
}

await main();
