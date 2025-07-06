import BABYLON from "@bjs";
import type * as BJS from "@babylonjs/core";
import Player from "../Player/player";
import CharacterSelect from "../Zone/character-select";
import { supportedZones } from "../Constants/supportedZones";
import { ZoneManager } from "@game/Zone/zone-manager";
import { PlayerProfile } from "@game/Net/internal/api/capnp/player";
import HavokPhysics from "@babylonjs/havok";
import { NewZone, RequestClientZoneChange } from "@game/Net/internal/api/capnp/zone";
import { WorldSocket } from "@ui/net/instances";
import { OpCodes } from "@game/Net/opcodes";
import { ZonePacketHandler } from "@game/Net/zone-packets";
import EntityCache from "@game/Model/entity-cache";
import emitter from "@game/Events/events";
import { animateVignette, gaussianBlurTeleport } from "@game/Effects/effects";

declare const window: Window;

async function getInitializedHavok() {
  return await HavokPhysics();
}
export default class GameManager {
  engine: (BJS.Engine | BJS.WebGPUEngine | BJS.ThinEngine) | null = null;
  engineInitialized: boolean = false;

  canvas: HTMLCanvasElement | null = null;
  loadingRefCount: number = 1;
  scene: BJS.Scene | null = null;

  private worldTickInterval: ReturnType<typeof setInterval> = -1 as unknown as ReturnType<typeof setInterval>;
  private lastPlayer: Partial<PlayerProfile> | null = null;
  public player: Player | null = null;
  public zonePacketHandler: ZonePacketHandler = new ZonePacketHandler(this);
  public havokPlugin: BJS.HavokPlugin | null = null;
  public CurrentZone: NewZone | null = null;

  get CharacterSelect(): CharacterSelect | null {
    return this.characterSelect;
  }
  private characterSelect: CharacterSelect | null = null;

  get ZoneManager(): ZoneManager | null {
    return this.zoneManager;
  }
  private zoneManager: ZoneManager | null = null;

  private camera: BJS.UniversalCamera | null = null;
  get Camera(): BJS.UniversalCamera | null {
    return this.camera;
  }

  private secondaryCamera: BJS.UniversalCamera | null = null;
  get SecondaryCamera(): BJS.UniversalCamera | null {
    return this.secondaryCamera;
  } 

  private static _instance: GameManager | null = null;
  public static get instance(): GameManager {
    if (!this._instance) {
      this._instance = new GameManager();
      window.gm = this._instance;
    }
    return this._instance;
  }

  constructor() {
    this.keyDown = this.keyDown.bind(this);
    this.resize = this.resize.bind(this);
    this.renderLoop = this.renderLoop.bind(this);
  }

  public initializeSecondaryCamera() {
    if (!this.scene) {
      console.error("Scene is not initialized");
      return;
    }
    if (this.secondaryCamera) {
      this.secondaryCamera.dispose();
    }
    this.secondaryCamera = new BABYLON.UniversalCamera(
      "__secondary_camera__",
      new BABYLON.Vector3(0, 0, 0),
      this.scene,
    );
    this.secondaryCamera.viewport = new BABYLON.Viewport(0, 0, 1, 1);
    this.secondaryCamera.attachControl(this.canvas!, true);
    this.scene.activeCameras = [this.Camera!, this.secondaryCamera];
  }

  public removeSecondaryCamera() {
    if (this.secondaryCamera) {
      this.secondaryCamera.dispose();
      this.secondaryCamera = null;
    }
    if (this.scene) {
      this.scene.activeCameras = [this.Camera!];
    }
  }

  public setInventoryViewport(
    x: number,
    y: number,
    width: number,
    height: number) {
    if (!this.scene || !this.secondaryCamera) return;
    const dpi = window.devicePixelRatio || 1;
    x *= dpi;
    y *= dpi;
    width *= dpi;
    height *= dpi;
    const engine       = this.scene.getEngine();
    const rw           = engine.getRenderWidth();   // full internal pixel width
    const rh           = engine.getRenderHeight();  // full internal pixel height

    const xNorm        = x / rw;
    const yNorm        = (rh - y - height) / rh;    // invert Y from top‐origin to bottom‐origin
    const widthNorm    = width  / rw;
    const heightNorm   = height / rh;

    this.secondaryCamera.viewport = new BABYLON.Viewport(
      xNorm,
      yNorm,
      widthNorm,
      heightNorm,
    );

  }
  public setNewViewport(x: number, y: number, width: number, height: number) {
    if (!this.scene || !this.camera) return;
    const dpi = window.devicePixelRatio || 1;
    x *= dpi;
    y *= dpi;
    width *= dpi;
    height *= dpi;
    const engine       = this.scene.getEngine();
    const rw           = engine.getRenderWidth();   // full internal pixel width
    const rh           = engine.getRenderHeight();  // full internal pixel height
    const xNorm        = x / rw;
    const yNorm        = (rh - y - height) / rh;    // invert Y from top‐origin to bottom‐origin
    const widthNorm    = width  / rw;
    const heightNorm   = height / rh;

    // Need to scale by DPI
    
    this.camera.viewport = new BABYLON.Viewport(
      xNorm,
      yNorm,
      widthNorm,
      heightNorm,
    );
  }

  public requestZone(requestZone: RequestClientZoneChange) {
    if (this.canvas && document.pointerLockElement === this.canvas) {
      document.exitPointerLock();
    }

    WorldSocket.sendMessage(
      OpCodes.RequestClientZoneChange,
      RequestClientZoneChange,
      requestZone,
    );

  }


  async loadPhysicsEngine() {
    if (!this.scene) {
      return false;
    }
    try {
      const HK = await getInitializedHavok();
      const havokPlugin = new BABYLON.HavokPlugin(true, HK);
      this.havokPlugin = havokPlugin;
      const worldGravity = new BABYLON.Vector3(0, -9.81 * 4, 0);
      const didEnable = this.scene.enablePhysics(
        worldGravity,
        havokPlugin,
      );
      if (didEnable) {
        this.scene._physicsEngine!.setGravity(worldGravity);
      } else {
        console.error("Failed to enable physics engine");
      }
      return didEnable;
    } catch (error) {
      console.error("Error initializing Havok physics:", error);
      return false;
    }
  }

  async loadEngine(canvas) {
    if (this.engine) {
      return;
    }
    if (this.scene) {
      this.scene.dispose();
    }
    this.zoneManager?.dispose();
    this.scene = null;
    this.canvas = canvas;

    if (navigator.gpu) {
      this.engine = new BABYLON.WebGPUEngine(canvas, { deviceDescriptor: { requiredFeatures: ["timestamp-query"] } });
      
      await this.engine?.initAsync?.();
      this.engineInitialized = true;

      
    } else {
      this.engine = new BABYLON.Engine(canvas);
      this.engineInitialized = true;
    }

    if (!this.engine) {
      console.error("[GameManager] Failed to create engine");
      return;
    }
    this.scene = new BABYLON.Scene(this.engine);
    this.scene.useRightHandedSystem = true;
    this.canvas!.oncontextmenu = (e) => e.preventDefault();
    this.scene.onPointerObservable.add(this.onPointerEvent.bind(this));

    this.zoneManager = new ZoneManager(this);
    
    this.engine.setHardwareScalingLevel(1 / window.devicePixelRatio);
    this.engine.disableManifestCheck = true;
    this.engine.enableOfflineSupport = false;
    this.loadingRefCount = 0;

    if (!(await this.loadPhysicsEngine())) {
      console.error("[GameManager] Could not load physics engine");
      return;
    }

    this.engine.runRenderLoop(this.renderLoop);
  }

  onPointerEvent(eventData: BJS.PointerInfo) {
    //console.log("Pointer event:", eventData);
    if (eventData.type === BABYLON.PointerEventTypes.POINTERDOWN && this.scene) {
    // Only handle left-click (button 0)
      if (eventData.event.button === 0) {
      // Perform a picking operation at the pointer's position
        const pickResult = this.scene.pick(this.scene.pointerX, this.scene.pointerY);
      
        if (pickResult?.hit && pickResult.pickedMesh) {
          const mesh = pickResult.pickedMesh;
          console.log(`Clicked mesh: ${mesh.name}`, mesh);

          // Optional: Add custom logic based on the mesh
          // Example: Check if the mesh has a specific metadata or tag
          if (mesh.metadata?.type === "interactive") {
            console.log(`Interacting with ${mesh.name}`);
          // Trigger custom interaction logic here
          }
        } else {
          console.log("No mesh hit");
        }
      }
    }
  }

  resize() {
    if (!this.engine) {
      return;
    }
    this.engine.resize();
  }

  renderLoop() {
    if (this.scene && this.scene?.activeCamera && !this.loadingRefCount) {
      try {
        this.scene.render();
      } catch (e) {
        console.warn(e);
      }
    }
  }

  private inspector: any | null = null;
  private instantiatingInspector: boolean = false;
  async keyDown(e: BJS.IKeyboardEvent) {
    switch (`${e?.key}`?.toLowerCase?.()) {
      case "i": {
        if (!this.scene || !(e.ctrlKey || e.metaKey)) {
          break;
        }
        if (e?.target?.tagName === "INPUT") {
          return;
        }
        if (this.instantiatingInspector) {
          return;
        }
        if (this.inspector?.IsVisible) {
          this.inspector.Hide();
        } else {
          this.instantiatingInspector = true;
          await import("@babylonjs/inspector").then((i) => {
            this.inspector = i.Inspector;
          });
          this.instantiatingInspector = false;
          this.inspector.Show(this.scene, {
            embedMode: true,
            overlay: true,
            handleResize: true,
          });
        }
        break;
      }
      default:
        break;
    }
  }

  public setLoading(value: boolean) {
    if (window.setSplash) {
      window.setSplash(value);
    }
  }

  public dispose() {
    clearInterval(this.worldTickInterval);
    // for (const material of this.scene?.materials || []) {
    //   if (material instanceof BABYLON.PBRMaterial) {
    //     material.dispose(true, true);
    //   }
    // }

    if (this.zoneManager) {
      this.zoneManager.dispose();
    }
    if (this.characterSelect) {
      this.characterSelect.dispose();
      this.characterSelect = null;
    }
    if (this.camera) {
      this.camera.dispose();
      this.camera = null;
    }
    EntityCache.disposeAll(this.scene!);
  }

  public async loadCharacterSelect() {
    this.player?.dispose();
    if (this.characterSelect) {
      this.characterSelect.dispose();
    }
    this.camera = new BABYLON.UniversalCamera(
      "__camera__",
      new BABYLON.Vector3(0, 0, 0),
      this.scene!,
    );
    this.characterSelect = new CharacterSelect(this);
  }

  public async loadZoneServer(zone: NewZone) {
    this.CurrentZone = zone;
    this.loadingRefCount++;
    this.setLoading(true);
    emitter.once('zoneSpawns', () => {
      this.loadingRefCount--;
      this.setLoading(false);
    });
    await this.loadZoneId(zone.zoneIdNumber);
  }

  public async loadZoneId(zoneId: number): Promise<void> {
    const zoneName = supportedZones[zoneId?.toString()]?.shortName;
    console.log("Loading zone: ", zoneId, zoneName);
    if (zoneName) {
      await this.loadZone(zoneName);
    } else {
      console.error(`Zone ID ${zoneId} not found in supported zones.`);
    }
  }

  public async loadZone(zoneName: string): Promise<void> {
    this.dispose();
    this.camera = new BABYLON.UniversalCamera(
      "__camera__",
      new BABYLON.Vector3(0, 0, 0),
      this.scene!,
    );
    animateVignette(
      this.camera,
              this.scene!,
    );
    gaussianBlurTeleport(
      this.camera,
              this.scene!,
    );
    this.loadingRefCount++;
    emitter.once('playerLoaded', () => {
      this.loadingRefCount--;
    });

    await this.zoneManager?.loadZone(zoneName);
    clearTimeout(this.worldTickInterval);
    this.worldTickInterval = setInterval(() => {
      this.zoneManager?.SkyManager?.worldTick?.();
    }, 1000);
  }

  public async instantiatePlayer(
    player: Partial<PlayerProfile> | null = this.lastPlayer,
  ) {
    console.log("Inst player", player);
    this.lastPlayer = player;
    if (this.player) {
      this.player.dispose();
      this.player = null;
    }
    this.player = new Player(this, this.Camera!, true);
    this.player?.Load(player as PlayerProfile);
  }
}
