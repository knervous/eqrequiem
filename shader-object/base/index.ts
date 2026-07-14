
import fantasyNameGenerator from 'fantasy-name-generator'
import { InstancePool, NameplateData } from 'shader-object@0.6.1'
import { buildUi } from './ui-overlay'
import './glsl'  
import './wgsl'  
 
const fantasyNames = Array.from({ length: 100 }, () => fantasyNameGenerator.nameByRace('demon'));
  
export class Playground {
    public static async CreateScene(engine: BABYLON.Engine, canvas: HTMLCanvasElement): Promise<BABYLON.Scene> {
        const scene = new BABYLON.Scene(engine);
        const camera = new BABYLON.ArcRotateCamera(
            "orbitCam",   
            -Math.PI / 2,   
            Math.PI / 3,  
            35,
            BABYLON.Vector3.Zero(),
            scene
        );
        camera.attachControl(canvas, true);
        camera.lowerRadiusLimit = 10;
        camera.upperRadiusLimit = 100;
        camera.wheelPrecision = 50;
        camera.panningSensibility = 50;
        const light = new BABYLON.HemisphericLight("light1", new BABYLON.Vector3(0, 1, 0), scene);
        light.intensity = 0.9;

        // Load font, assets
        const sdfFontDefinition = await (await fetch("https://assets.babylonjs.com/fonts/roboto-regular.json")).text();
        const fontAsset = new ADDONS.FontAsset(sdfFontDefinition, "https://assets.babylonjs.com/fonts/roboto-regular.png") as any;

        // // Import mesh
        const importResult = await BABYLON.ImportMeshAsync(
            "https://raw.githubusercontent.com/RaggarDK/Baby/baby/arr.babylon",
            scene,
            undefined
        );
        const animationRanges = [
            { from: 0, to: 33 },
            { from: 33, to: 61 },
            { from: 63, to: 91 },
            { from: 93, to: 130 }
        ];

        const mesh = importResult.meshes[0] as BABYLON.Mesh;
 
        // Bake animations to VAT when scene's ready
        scene.onReadyObservable.addOnce(async () => {
            const baker = new BABYLON.VertexAnimationBaker(scene, mesh);
            const syncVertexData = baker.bakeVertexDataSync(animationRanges as any, true);
            const vertexTexture = baker.textureFromBakedVertexData(syncVertexData);
            const manager = new BABYLON.BakedVertexAnimationManager(scene);
            manager.texture = vertexTexture;
            mesh.bakedVertexAnimationManager = manager;


            const logShaderCode = false;
            const logAssemblyScriptCode = false;

            await NameplateData.initialize(scene.getEngine() as BABYLON.Engine, logShaderCode, logAssemblyScriptCode);
            await InstancePool.initialize(scene.getEngine() as BABYLON.Engine, logShaderCode, logAssemblyScriptCode);

            const nameplates = new NameplateData(scene.getEngine() as BABYLON.Engine, fontAsset);
            const instancePool = new InstancePool(scene.getEngine() as BABYLON.Engine);

            instancePool.nameplates = nameplates;
            instancePool.addNamesToPool(fantasyNames as string[]);
            (window as any).ipool = instancePool; 

            const initialCount = 100;
            instancePool.addInstances(initialCount, animationRanges)

            const isWebGPU =
                (engine as any)._isWebGPU ||
                (engine as any).getClassName?.() === "WebGPUEngine";

            // Actor mesh material
            const ioScene = InstancePool.shaderIO(scene.getEngine() as BABYLON.Engine);
            const actorMat = new BABYLON.ShaderMaterial(
                "schemaInstancedMat",
                scene,
                { vertex: "actorPoolSchema", fragment: "actorPoolSchema" },
                {
                    attributes: ["position", "uv"],
                    defines: ["BAKED_VERTEX_ANIMATION_TEXTURE"],
                    uniforms: isWebGPU
                        ? ["worldViewProjection", "bakedVertexAnimationTime"]
                        : ["worldViewProjection", "bakedVertexAnimationTime", ...ioScene.uniforms],
                    samplers: [...ioScene.samplers],
                    uniformBuffers: ["Scene"],
                    shaderLanguage: isWebGPU ? BABYLON.ShaderLanguage.WGSL : BABYLON.ShaderLanguage.GLSL,
                }
            );

            actorMat.onCompiled = (effect: BABYLON.Effect) => {
                console.log("ACTOR Vertex Shader Code:", effect._vertexSourceCode);
                console.log("ACTOR Fragment Shader Code:", effect._fragmentSourceCode);
            };
 
            mesh.material = actorMat;
            mesh.alwaysSelectAsActiveMesh = true;
 
            const { countLabel, perfLabel, visibleCountLabel, cullPerfLabel, radiusSlider } = buildUi(scene, instancePool, animationRanges);

            (window as any).demo = { instancePool, mesh, material: actorMat };


            // Animate: JS computes tx/ty/tz/s/r/g/b/a, Wasm applies in-place
            (scene as any).__clock = 0;
            scene.onBeforeRenderObservable.add(() => {
                const deltaTime = scene.getEngine().getDeltaTime() * 0.001;
                (scene as any).__clock += deltaTime;
                const t0 = performance.now(); 
                if (mesh.bakedVertexAnimationManager) {
                    mesh.bakedVertexAnimationManager.time += scene.getEngine().getDeltaTime() / 1000.0;
                }
                // ONE call updates all instances
                instancePool.tickInstances("instances", deltaTime);
                const t1 = performance.now();
                const tickMs = t1 - t0;
                const radius = radiusSlider.value | 0;
                instancePool.frustumCull(scene.activeCamera, 5, radius);
                const cullTickMs = performance.now() - t1;

                const n = instancePool.instanceCount | 0;
                countLabel.text = `Instances: ${n}`;
                perfLabel.text = `Move Tick (Wasm): ${tickMs.toFixed(2)} ms`;
                visibleCountLabel.text = `Visible Instances: ${instancePool.visibleCount}`;
                cullPerfLabel.text = `Frustum Culling (Wasm SIMD): ${cullTickMs.toFixed(2)} ms`;

            });


            const sub = mesh.subMeshes[0];
            actorMat.onEffectCreatedObservable.add(({ effect }) => {
                const tex = mesh.bakedVertexAnimationManager?.texture;
                if (tex) {
                    effect.setTexture("bakedVertexAnimationTexture", tex);
                }
            });
            actorMat.onBind = () => {
                instancePool.commitAndBind(actorMat.getEffect());

                if (mesh.bakedVertexAnimationManager) {
                    actorMat.setTexture("bakedVertexAnimationTexture", mesh.bakedVertexAnimationManager.texture);
                    actorMat.setFloat(
                        "bakedVertexAnimationTime",
                        mesh.bakedVertexAnimationManager.time
                    );
                }
                const n = instancePool.visibleCount;
                if (n > 0) {
                    engine.drawElementsType(
                        BABYLON.Material.TriangleFillMode,
                        sub.indexStart,
                        sub.indexCount,
                        n
                    );
                }
            }


            // Nameplate - create cornerQuad Mesh and ShaderMaterial
            const glyphMesh = new BABYLON.Mesh("glyphQuad", scene);
            const corners = new Float32Array([
                0, 0, 1, 0, 0, 1, 1, 1
            ]);
            const indices = new Uint16Array([0, 1, 2, 2, 1, 3]);
            const positions = new Float32Array([
                0, 0, 0,   // v0
                1, 0, 0,   // v1
                0, 1, 0,   // v2
                1, 1, 0    // v3
            ]);
            glyphMesh.setVerticesData(BABYLON.VertexBuffer.PositionKind, positions, false, 3);

            const ioNP = NameplateData.shaderIO(scene.getEngine() as BABYLON.Engine);
            const msdf = new BABYLON.ShaderMaterial("msdfText", scene,
                { vertex: "msdfText", fragment: "msdfText" },
                {
                    attributes: ["position", "corner"],
                    uniforms: isWebGPU
                        ? ["worldViewProjection"] // "view" comes from Scene UBO in WGSL include
                        : ["worldViewProjection", "view", "uThickness", ...ioScene.uniforms, ...ioNP.uniforms],
                    samplers: [...ioScene.samplers, ...ioNP.samplers, "uFontAtlas"],
                    uniformBuffers: ["Scene"],
                    needAlphaBlending: true,
                    shaderLanguage: isWebGPU ? BABYLON.ShaderLanguage.WGSL : BABYLON.ShaderLanguage.GLSL,
                }
            );

            msdf.backFaceCulling = true;
            glyphMesh.setVerticesData("corner", corners, true, 2);
            glyphMesh.setIndices(indices);
            glyphMesh.refreshBoundingInfo();
            glyphMesh.material = msdf;
            glyphMesh.alwaysSelectAsActiveMesh = true;

            // msdf.onCompiled = (effect: BABYLON.Effect) => {
            //     console.log("MSDF Vertex Shader Code:", effect._vertexSourceCode);
            //     console.log("MSDF Fragment Shader Code:", effect._fragmentSourceCode);
            // };
            msdf.onBind = () => {
                const eff = msdf.getEffect();
                instancePool.commitAndBind(eff);
                nameplates.commitAndBind(eff);

                eff.setMatrix("view", scene.getViewMatrix());
                eff.setFloat("uThickness", 0.0);
                eff.setTexture("uFontAtlas", fontAsset.textures[0]);

                const nGlyphs = nameplates.glyphCount();
                if (nGlyphs > 0) {
                    const sub = glyphMesh.subMeshes[0];
                    scene.getEngine().drawElementsType(
                        BABYLON.Material.TriangleFillMode,
                        sub.indexStart,
                        sub.indexCount,
                        nGlyphs
                    );
                }
            };
        })
        return scene;
    }
}



