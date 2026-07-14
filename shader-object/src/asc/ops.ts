export function buildOpsForParent(parentSchema: any, exports: any) {
  const ops: any = {};
  for (const [arrField, meta] of Object.entries(parentSchema.structArrays)) {
    const child = (meta as any).schema;
    const stride = child.headerFloatCount | 0;
    const entry: any = { vec4: {} };
    for (const cf of child.fields) {
      if (cf?.type?.arrayOf) continue;
      const tOff = child.fields.find((f: any) => f.name === 'translation')?.headerFloatOffset | 0;
      const cOff = child.fields.find((f: any) => f.name === 'color')?.headerFloatOffset | 0;

      // Orbit delta
      entry.orbitDelta = (
        base: number,
        count: number,
        deltaTime: number,
        phaseStep: number,
        radMin: number,
        radRange: number,
        wobbleAmp: number
      ) =>
        exports.orbitDelta(
          base,
          count | 0,
          stride | 0,
          tOff | 0,
          cOff | 0,
          deltaTime,
          phaseStep,
          radMin,
          radRange,
          wobbleAmp
        );
      // mat4 family
      if (cf.type === 'mat4') {
        const off = cf.headerFloatOffset | 0;
        const offT = off + 12; // translation slot in our packed mat4

        entry.mat4[cf.name] = {
          setTransSoA: (base: number, count: number, tx: number, ty: number, tz: number) =>
            exports.mat4_setTranslation_SoA(base, count | 0, stride | 0, offT | 0, tx, ty, tz),

          uniformScale: (base: number, count: number, sPtr: number) =>
            exports.mat4_uniformScale_FromArray(base, count | 0, stride | 0, off | 0, sPtr),

          uniformScaleAbs: (base: number, count: number, sPtr: number, baseR: number) =>
            exports.mat4_uniformScaleAbs_FromArray(
              base,
              count | 0,
              stride | 0,
              off | 0,
              sPtr,
              baseR
            ),
        };

        // convenient “first mat4” shorthands for legacy callsites
        if (!entry.setTransSoA) {
          entry.setTransSoA = entry.mat4[cf.name].setTransSoA;
          entry.uniformScale = entry.mat4[cf.name].uniformScale;
          entry.uniformScaleA = entry.mat4[cf.name].uniformScaleAbs;
        }
      }

      // vec4 family
      if (cf.type === 'vec4') {
        const off = cf.headerFloatOffset | 0;

        entry.vec4[cf.name] = {
          setColorSoA: (
            base: number,
            count: number,
            rp: number,
            gp: number,
            bp: number,
            ap: number
          ) => exports.vec4_setRGBA_SoA(base, count | 0, stride | 0, off | 0, rp, gp, bp, ap),

          mulColor: (base: number, count: number, r: number, g: number, b: number, a: number) =>
            exports.vec4_mulRGBA(base, count | 0, stride | 0, off | 0, r, g, b, a),
        };

        entry.setColorSoA ??= entry.vec4[cf.name].setColorSoA;
      }
    }

    // Optional cull wrappers if kernels present
    const tx = child.fields.find((f: any) => f.name === 'translation')?.headerFloatOffset ?? 0;
    const ty = tx + 1,
      tz = tx + 2;
    const scale = child.fields.find((f: any) => f.name === 'scale')?.headerFloatOffset ?? -1;
    const vis = child.fields.find((f: any) => f.name === 'visibleSlot')?.headerFloatOffset ?? -1;

    if (exports.frustumCullCompactAoS && scale >= 0 && vis >= 0) {
      entry.cull = entry.cull ?? {};
      entry.cull.frustumCompact = (
        base: number,
        count: number,
        planesPtr: number,
        outDrawIds: number,
        outVisibleCountPtr: number,
        baseRadius: number
      ) =>
        exports.frustumCullCompactAoS(
          base,
          count | 0,
          stride | 0,
          tx | 0,
          ty | 0,
          tz | 0,
          scale | 0,
          vis | 0,
          planesPtr,
          outDrawIds,
          outVisibleCountPtr,
          baseRadius
        );
    }

    ops[arrField] = entry;

    ops[arrField] = entry;
  }
  return ops;
}
