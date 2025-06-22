import BABYLON from "@bjs";
import type * as BJS from "@babylonjs/core";
import Player from "../Player/player";
import CharacterSelect from "../Zone/character-select";
import { supportedZones } from "../Constants/supportedZones";
import MusicManager from "@game/Music/music-manager";
import { ZoneManager } from "@game/Zone/zone-manager";
import { PlayerProfile } from "@game/Net/internal/api/capnp/player";
import HavokPhysics from "@babylonjs/havok";
import { NewZone } from "@game/Net/internal/api/capnp/zone";

declare const window: Window;

async function getInitializedHavok() {
  return await HavokPhysics();
}
export default class GameManager {
  engine: (BJS.Engine | BJS.WebGPUEngine | BJS.ThinEngine) | null = null;
  engineInitialized: boolean = false;

  canvas: HTMLCanvasElement | null = null;
  loading: boolean = true;
  scene: BJS.Scene | null = null;

  get MusicManager(): MusicManager | null {
    return this.musicManager;
  }
  private musicManager: MusicManager | null = null;
  private worldTickInterval: number = -1;
  private lastPlayer: Partial<PlayerProfile> | null = null;
  private player: Player | null = null;
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

  private static _instance: GameManager | null = null;
  public static get instance(): GameManager {
    if (!this._instance) {
      this._instance = new GameManager();
      window.gm = this._instance;
    }
    return this._instance;
  }

  constructor() {
    this.zoneManager = new ZoneManager(this);
    this.keyDown = this.keyDown.bind(this);
    this.resize = this.resize.bind(this);
    this.renderLoop = this.renderLoop.bind(this);
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

    if (false && navigator.gpu) {
      this.engine = new BABYLON.WebGPUEngine(canvas);
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

    
    this.engine.setHardwareScalingLevel(1 / window.devicePixelRatio);
    this.engine.disableManifestCheck = true;
    this.engine.enableOfflineSupport = false;
    this.loading = false;

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
    if (this.scene && this.scene?.activeCamera && !this.loading) {
      try {
        this.scene.render();
      } catch (e) {
        console.warn(e);
      }
    }
  }

  async keyDown(e: BJS.IKeyboardEvent) {
    switch (`${e?.key}`?.toLowerCase?.()) {
      case "i": {
        if (!this.scene || !(e.ctrlKey || e.metaKey)) {
          break;
        }
        if (e?.target?.tagName === "INPUT") {
          return;
        }
        let inspector;
        await import("@babylonjs/inspector").then((i) => {
          inspector = i.Inspector;
        });
        if (inspector.IsVisible) {
          inspector.Hide();
        } else {
          inspector.Show(this.scene, {
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
    if (this.zoneManager) {
      this.zoneManager.dispose();
    }
    if (this.musicManager) {
      this.musicManager.dispose();
    }
    if (this.characterSelect) {
      this.characterSelect.dispose();
      this.characterSelect = null;
    }
    if (this.camera) {
      this.camera.dispose();
      this.camera = null;
    }
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

  public loadZone(zoneName: string): void {
    this.dispose();
    this.camera = new BABYLON.UniversalCamera(
      "__camera__",
      new BABYLON.Vector3(0, 0, 0),
      this.scene!,
    );
    this.zoneManager?.loadZone(zoneName);
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
