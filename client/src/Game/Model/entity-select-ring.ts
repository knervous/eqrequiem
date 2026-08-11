import BABYLON from "@bjs";
import type * as BJS from "@babylonjs/core";

const TARGET_RING_SHADER = "requiemTargetIndicator";
const ACQUISITION_DURATION_MS = 520;

BABYLON.Effect.ShadersStore[`${TARGET_RING_SHADER}PixelShader`] = `
  precision highp float;

  varying vec2 vUV;

  uniform float time;
  uniform float acquisition;
  uniform vec4 color;

  const float PI = 3.14159265359;
  const float TAU = 6.28318530718;

  float band(float value, float center, float halfWidth, float feather) {
    return 1.0 - smoothstep(
      halfWidth,
      halfWidth + feather,
      abs(value - center)
    );
  }

  void main(void) {
    vec2 point = vUV * 2.0 - 1.0;
    float distanceFromCenter = length(point);
    float angle = atan(point.y, point.x);
    float feather = 0.008;

    // A stable pair of rings provides an immediately readable footprint.
    float outerRing = band(distanceFromCenter, 0.82, 0.018, feather);
    float innerRing = band(distanceFromCenter, 0.61, 0.012, feather);

    // Break the outer ring into deliberate reticle segments.
    float segment = smoothstep(
      0.18,
      0.28,
      sin(angle * 8.0 + time * 0.85)
    );
    float segmentedOuter = outerRing * (0.34 + segment * 0.66);

    // Four cardinal brackets make facing and target center easy to judge.
    float cardinal = pow(
      max(abs(cos(angle)), abs(sin(angle))),
      32.0
    );
    float brackets =
      band(distanceFromCenter, 0.72, 0.055, feather) *
      smoothstep(0.44, 0.78, cardinal);

    // A restrained rotating scan persists after the acquisition flash.
    float scanPhase = fract(angle / TAU - time * 0.10);
    float scanArc =
      band(distanceFromCenter, 0.91, 0.010, feather) *
      smoothstep(0.76, 0.98, scanPhase);

    // On a fresh target, contract a bright wave toward the footprint.
    float acquisitionStrength = 1.0 - acquisition;
    float acquisitionRadius = mix(1.08, 0.66, acquisition);
    float acquisitionWave =
      band(distanceFromCenter, acquisitionRadius, 0.022, 0.016) *
      acquisitionStrength;
    float acquisitionFlash =
      outerRing *
      acquisitionStrength *
      (0.55 + 0.45 * sin(acquisition * PI * 5.0));

    float slowPulse = 0.84 + 0.16 * sin(time * 2.4);
    float intensity =
      segmentedOuter * slowPulse +
      innerRing * 0.56 +
      brackets * 0.92 +
      scanArc * 0.72 +
      acquisitionWave * 1.45 +
      acquisitionFlash * 0.92;

    // Fade the square corners completely and preserve a soft floor glow.
    float footprint = 1.0 - smoothstep(0.93, 1.03, distanceFromCenter);
    float floorGlow =
      (1.0 - smoothstep(0.22, 0.88, distanceFromCenter)) *
      (0.035 + acquisitionStrength * 0.055);
    float alpha = clamp((intensity + floorGlow) * footprint, 0.0, 0.92);
    vec3 finalColor =
      color.rgb *
      (0.72 + intensity * 0.64 + acquisitionStrength * 0.48);

    gl_FragColor = vec4(finalColor, alpha);
  }
`;

export type TargetRingVisual = {
  material: BJS.StandardMaterial;
  texture: BJS.ProceduralTexture;
  setColor: (color: BJS.Color4) => void;
  triggerAcquisition: () => void;
};

export function createTargetRingMaterial(scene: BJS.Scene): TargetRingVisual {
  let elapsedSeconds = 0;
  let acquisitionStartedAt = -Infinity;
  const texture = new BABYLON.ProceduralTexture(
    "requiemTargetIndicatorTexture",
    512,
    TARGET_RING_SHADER,
    scene,
  );
  texture.hasAlpha = true;
  texture.setColor4("color", new BABYLON.Color4(1, 1, 1, 1));
  texture.setFloat("time", elapsedSeconds);
  texture.setFloat("acquisition", 1);

  const material = new BABYLON.StandardMaterial(
    "requiemTargetIndicatorMaterial",
    scene,
  );
  material.emissiveTexture = texture;
  material.opacityTexture = texture;
  material.transparencyMode = BABYLON.Material.MATERIAL_ALPHABLEND;
  material.disableLighting = true;
  material.diffuseTexture = null;
  material.backFaceCulling = false;

  const animationObserver = scene.onBeforeRenderObservable.add(() => {
    elapsedSeconds += scene.getEngine().getDeltaTime() / 1000;
    const acquisition = Math.min(
      1,
      (performance.now() - acquisitionStartedAt) /
        ACQUISITION_DURATION_MS,
    );
    texture.setFloat("time", elapsedSeconds);
    texture.setFloat("acquisition", acquisition);
  });
  texture.onDisposeObservable.addOnce(() => {
    scene.onBeforeRenderObservable.remove(animationObserver);
  });

  return {
    material,
    texture,
    setColor: (color) => {
      texture.setColor4(
        "color",
        new BABYLON.Color4(color.r, color.g, color.b, 1),
      );
    },
    triggerAcquisition: () => {
      acquisitionStartedAt = performance.now();
      texture.setFloat("acquisition", 0);
    },
  };
}
const ATTACK_CONE_SHADER = "requiemAttackCone";

BABYLON.Effect.ShadersStore[`${ATTACK_CONE_SHADER}PixelShader`] = `
  precision highp float;

  varying vec2 vUV;

  uniform float time;
  uniform vec4 color;
  /** Decal depth divided by decal width. See ATTACK_CONE_FORWARD_SCALE. */
  uniform float forwardStretch;

  const float PI = 3.14159265359;
  const float HALF_ANGLE = 0.62; // ~71 degree swing arc
  const float REACH = 0.90;      // Where melee stops connecting.
  // The wedge carries on past reach, so the decal reads as a direction rather
  // than a disc. Only the arc is a promise; the extension is presentation.
  const float TIP = REACH * 1.5;

  void main(void) {
    vec2 point = vUV * 2.0 - 1.0;
    // Facing angle 0 is +Y in UV space; the mesh yaw maps that onto owner forward.
    // The quad is stretched forward, so divide that back out before measuring:
    // otherwise the "circle" at reach is an egg and the wedge angle narrows with
    // the stretch. Everything below is then in true world proportions, scaled so
    // that 1.0 is the decal's lateral half-extent.
    vec2 point3 = vec2(point.x, point.y * forwardStretch);
    float dist = length(point3);
    float angle = atan(point3.x, point3.y);
    float offAxis = abs(angle);

    // Everything is clipped to the wedge and to the decal's forward tip.
    float coneMask = 1.0 - smoothstep(HALF_ANGLE - 0.035, HALF_ANGLE, offAxis);
    float reachMask = 1.0 - smoothstep(TIP - 0.28, TIP, dist);

    // Past the arc the decal is projection, not promise, so everything there is
    // dimmed by the same factor rather than each part choosing its own.
    float insideReach = 1.0 - smoothstep(REACH - 0.02, REACH + 0.03, dist);
    float beyond = mix(0.45, 1.0, insideReach);

    // The reach arc is the line that carries the information, so it is the
    // brightest thing here — a thin arc, not the filled disc the old
    // smoothstep(0.85, 0.95, ...) collapsed into.
    float reachArc = 1.0 - smoothstep(0.012, 0.030, abs(dist - REACH));

    // Side boundaries close the wedge.  They fade out at the apex so the decal
    // does not pool into a bright knot under the character's feet, and taper
    // past the arc so the extension does not read as two lines running off
    // into the grass.
    float sideLines =
      (1.0 - smoothstep(0.010, 0.026, abs(offAxis - HALF_ANGLE))) *
      smoothstep(0.05, 0.28, dist) *
      beyond *
      reachMask;

    // A slow outward sweep reads as "this is the direction you are swinging"
    // without strobing in the player's peripheral vision.  Sine rather than
    // fract: the wrap in fract is a hard edge, and it showed up as a step arc
    // sitting across the middle of the wedge.
    float sweep = 0.5 + 0.5 * sin((dist * 0.62 - time * 0.4) * 6.2831853);
    float sweepBand =
      smoothstep(0.55, 1.0, sweep) *
      (1.0 - smoothstep(0.42, TIP, dist)) *
      reachMask;

    // Interior wash, in two parts. The core fills the wedge inside reach so it
    // reads as a surface rather than three strokes. The carry keeps the forward
    // extension visible down the centre line — a single falloff to the tip left
    // the projection alive only along its two edges, which read as a V rather
    // than a cone pointing somewhere.
    float core = 1.0 - smoothstep(0.08, REACH, dist);
    float carry = (1.0 - smoothstep(REACH, TIP, dist)) * (1.0 - insideReach);
    float fill = (core + carry * 0.55) * reachMask;

    float intensity =
      reachArc * 0.80 +
      sideLines * 0.62 +
      sweepBand * 0.14 +
      fill * 0.12;

    // A floor decal that is present the whole time combat lasts has to stay
    // quiet; the old 0.85 ceiling washed out the ground under the fight. Quieter
    // again now that doubling the reach made it cover four times the ground.
    float alpha = clamp(intensity * coneMask, 0.0, 0.42);
    vec3 finalColor = color.rgb * (0.85 + reachArc * 0.45 + sideLines * 0.3);

    gl_FragColor = vec4(finalColor, alpha);
  }
`;

export type AttackConeVisual = {
  material: BJS.StandardMaterial;
  texture: BJS.ProceduralTexture;
  setColor: (color: BJS.Color4) => void;
};

export function createAttackConeMaterial(
  scene: BJS.Scene,
  forwardStretch = 1,
): AttackConeVisual {
  let elapsedSeconds = 0;
  const texture = new BABYLON.ProceduralTexture(
    "requiemAttackConeTexture",
    512,
    ATTACK_CONE_SHADER,
    scene,
  );
  texture.hasAlpha = true;
  texture.setColor4("color", new BABYLON.Color4(1, 0.85, 0.2, 1));
  texture.setFloat("time", elapsedSeconds);
  texture.setFloat("forwardStretch", forwardStretch);

  const material = new BABYLON.StandardMaterial(
    "requiemAttackConeMaterial",
    scene,
  );
  material.emissiveTexture = texture;
  material.opacityTexture = texture;
  material.transparencyMode = BABYLON.Material.MATERIAL_ALPHABLEND;
  material.disableLighting = true;
  material.diffuseTexture = null;
  material.backFaceCulling = false;

  const animationObserver = scene.onBeforeRenderObservable.add(() => {
    elapsedSeconds += scene.getEngine().getDeltaTime() / 1000;
    texture.setFloat("time", elapsedSeconds);
  });
  texture.onDisposeObservable.addOnce(() => {
    scene.onBeforeRenderObservable.remove(animationObserver);
  });

  return {
    material,
    texture,
    setColor: (color) => {
      texture.setColor4(
        "color",
        new BABYLON.Color4(color.r, color.g, color.b, 1),
      );
    },
  };
}
