import type * as BJS from "@babylonjs/core";
import BABYLON from "@bjs";
import { animateVignette, gaussianBlurTeleport } from "@game/Effects/effects";
import EntityCache from "@game/Model/entity-cache";
import ItemCache from "@game/Model/item-cache";
import { PlayerProfile } from "@game/Net/messages";
import { NewZone, RequestClientZoneChange } from "@game/Net/messages";
import { OpCodes } from "@game/Net/opcodes";
import { ZonePacketHandler } from "@game/Net/zone-packets";
import { ZoneManager } from "@game/Zone/zone-manager";
import { WorldSocket } from "@ui/net/instances";
import { supportedZones } from "../Constants/supportedZones";
import Player from "../Player/player";
import CharacterSelect from "../Zone/character-select";
import {
  normalizeRenderViewport,
  type CssViewportBounds,
} from "./render-viewport";

declare const window: Window;

let initializedHavok: Promise<unknown> | undefined;
const CLIENT_CAMERA_NEAR_PLANE = 0.1;

async function getInitializedHavok() {
  initializedHavok ??= import("@babylonjs/havok").then(
    ({ default: HavokPhysics }) => HavokPhysics(),
  );
  return initializedHavok;
}
export default class GameManager {
  engine: (BJS.Engine | BJS.WebGPUEngine | BJS.ThinEngine) | null = null;
  engineInitialized: boolean = false;

  canvas: HTMLCanvasElement | null = null;
  loadingRefCount: number = 1;
  scene: BJS.Scene | null = null;

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
  private primaryViewportBounds: CssViewportBounds | null = null;
  private inventoryViewportBounds: CssViewportBounds | null = null;
  get SecondaryCamera(): BJS.UniversalCamera | null {
    return this.secondaryCamera;
  }

  private static _instance: GameManager | null = null;
  public static get instance(): GameManager {
    if (!this._instance) {
      this._instance = new GameManager();
      (window as any).gm = this._instance;
    }
    return this._instance;
  }

  constructor() {
    this.keyDown = this.keyDown.bind(this);
    this.keyUp = this.keyUp.bind(this);
    this.resize = this.resize.bind(this);
    this.renderLoop = this.renderLoop.bind(this);
    EntityCache.gameManager = this;
  }

  public initializeSecondaryCamera() {
    if (!this.scene) {
      console.error("Scene is not initialized");
      return;
    }
    if (this.secondaryCamera) {
      this.secondaryCamera.dispose();
    }
    console.log("Initializing secondary camera");
    this.secondaryCamera = new BABYLON.UniversalCamera(
      "__secondary_camera__",
      new BABYLON.Vector3(0, 0, 0),
      this.scene,
    );
    this.secondaryCamera.viewport = new BABYLON.Viewport(0, 0, 1, 1);
    this.secondaryCamera.attachControl(this.canvas!, true);
    this.scene.activeCameras = [this.Camera!, this.secondaryCamera];
    this.applyInventoryViewport();
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
    height: number,
  ) {
    this.inventoryViewportBounds = { x, y, width, height };
    this.applyInventoryViewport();
  }
  public setNewViewport(x: number, y: number, width: number, height: number) {
    this.primaryViewportBounds = { x, y, width, height };
    this.applyPrimaryViewport();
  }

  private applyPrimaryViewport(): void {
    this.applyViewport(this.camera, this.primaryViewportBounds);
  }

  private applyInventoryViewport(): void {
    this.applyViewport(this.secondaryCamera, this.inventoryViewportBounds);
  }

  private applyViewport(
    camera: BJS.UniversalCamera | null,
    bounds: CssViewportBounds | null,
  ): void {
    if (!camera || !bounds || !this.canvas) return;
    const canvasBounds = this.canvas.getBoundingClientRect();
    const viewport = normalizeRenderViewport(bounds, {
      x: canvasBounds.x,
      y: canvasBounds.y,
      width: canvasBounds.width,
      height: canvasBounds.height,
    });
    camera.viewport = new BABYLON.Viewport(
      viewport.x,
      viewport.y,
      viewport.width,
      viewport.height,
    );
  }

  public requestZone(requestZone: RequestClientZoneChange) {
    if (this.canvas && document.pointerLockElement === this.canvas) {
      document.exitPointerLock();
    }

    const heading = this.player?.playerEntity?.getHeading();
    void WorldSocket.sendStreamMessage(
      OpCodes.RequestClientZoneChange,
      RequestClientZoneChange,
      {
        ...requestZone,
        ...(requestZone.heading === undefined && heading !== undefined
          ? { heading }
          : {}),
      },
    ).catch((error: unknown) => {
      console.error("Reliable zone change request failed", error);
    });
  }

  async loadPhysicsEngine() {
    if (!this.scene) {
      return false;
    }
    try {
      const HK = await getInitializedHavok();
      const havokPlugin = new BABYLON.HavokPlugin(true, HK);
      this.havokPlugin = havokPlugin;
      const worldGravity = new BABYLON.Vector3(0, -9.81 * 30, 0);
      const didEnable = this.scene.enablePhysics(worldGravity, havokPlugin);
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
  private pickingList: BJS.AbstractMesh[] = [];
  private pickListTimeout: ReturnType<typeof setTimeout> | null = null;
  public addToPickingList(mesh: BJS.AbstractMesh) {
    if (!mesh || mesh.isDisposed()) {
      return;
    }
    if (!this.pickingList.includes(mesh)) {
      this.pickingList.push(mesh);
    }

    // Publish new entity meshes on the next task. A one-second debounce made
    // freshly zoned NPCs visibly present but untargetable.
    if (this.pickListTimeout) {
      clearTimeout(this.pickListTimeout);
    }
    this.pickListTimeout = setTimeout(() => {
      this.refreshPickingList();
    }, 0);
  }
  public clearPickingList() {
    this.pickingList = [];
    if (this.pickListTimeout) {
      clearTimeout(this.pickListTimeout);
      this.pickListTimeout = null;
    }
    this.gpuPicker?.setPickingList(null);
  }

  public getPickingList(): BJS.AbstractMesh[] {
    return this.pickingList;
  }

  private refreshPickingList() {
    const picker = this.gpuPicker;
    if (!picker) {
      return;
    }

    const scene = this.scene;
    const pickable = this.pickingList.filter(
      (mesh) => !mesh.isDisposed() && (!scene || mesh.getScene() === scene),
    );
    this.pickingList = pickable;

    // Babylon takes ownership of the array and clears it on the next refresh.
    picker.setPickingList(
      pickable.map((mesh) => {
        const material = (
          mesh.metadata as
            | { gpuPickingMaterial?: BJS.ShaderMaterial }
            | null
            | undefined
        )?.gpuPickingMaterial;
        return material ? { mesh, material } : mesh;
      }),
    );
    this.pickListTimeout = null;
  }

  public gpuPicker: BJS.GPUPicker | null = null;
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
    // Physics is required before gameplay starts, but it does not depend on
    // engine construction. Start its WASM download in parallel with WebGPU
    // adapter/device initialization instead of placing it behind that work.
    void getInitializedHavok();
    this.gpuPicker = new BABYLON.GPUPicker();
    let hasWebGPUAdapter = false;
    if (navigator.gpu) {
      try {
        hasWebGPUAdapter = (await navigator.gpu.requestAdapter()) != null;
      } catch (error) {
        console.warn("[GameManager] WebGPU adapter discovery failed", error);
      }
    }
    if (hasWebGPUAdapter) {
      // GPU timestamps are not a rendering requirement. Requiring the
      // optional feature rejected otherwise valid adapters at cold start.
      const webgpu = new BABYLON.WebGPUEngine(canvas);
      try {
        await webgpu.initAsync();
        this.engine = webgpu;
      } catch (error) {
        try {
          webgpu.dispose();
        } catch {
          // Babylon may fail before its WebGPU subsystems are disposable.
        }
        console.warn(
          "[GameManager] WebGPU initialization failed; using WebGL",
          error,
        );
        this.engine = new BABYLON.Engine(canvas);
      }
    } else {
      this.engine = new BABYLON.Engine(canvas);
    }

    if (!this.engine) {
      console.error("[GameManager] Failed to create engine");
      return;
    }
    this.engine.setHardwareScalingLevel(1 / window.devicePixelRatio);
    this.engine.resize(true);
    this.engine.disableManifestCheck = true;
    this.engine.enableOfflineSupport = false;
    this.engineInitialized = true;
    this.scene = new BABYLON.Scene(this.engine);
    this.scene.useRightHandedSystem = true;
    this.canvas!.oncontextmenu = (e) => e.preventDefault();

    this.zoneManager = new ZoneManager(this);

    this.loadingRefCount = 0;

    if (!(await this.loadPhysicsEngine())) {
      console.error("[GameManager] Could not load physics engine");
      return;
    }

    this.engine.runRenderLoop(this.renderLoop);
  }

  resize() {
    if (!this.engine) {
      return;
    }
    this.engine.resize(true);
    this.applyPrimaryViewport();
    this.applyInventoryViewport();
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
  public modifierKeys = {
    ctrl: false,
    shift: false,
    alt: false,
    meta: false,
  };
  async keyUp(e: BJS.IKeyboardEvent) {
    this.modifierKeys.ctrl = e.ctrlKey;
    this.modifierKeys.shift = e.shiftKey;
    this.modifierKeys.alt = e.altKey;
    this.modifierKeys.meta = e.metaKey;
  }
  async keyDown(e: BJS.IKeyboardEvent) {
    this.modifierKeys.ctrl = e.ctrlKey;
    this.modifierKeys.shift = e.shiftKey;
    this.modifierKeys.alt = e.altKey;
    this.modifierKeys.meta = e.metaKey;
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
    if ((window as any).setSplash) {
      (window as any).setSplash(value);
    }
  }

  public dispose() {
    this.player?.dispose();
    this.player = null;
    // for (const material of this.scene?.materials || []) {
    //   if (material instanceof BABYLON.PBRMaterial) {
    //     material.dispose(true, true);
    //   }
    // }
    this.clearPickingList();
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
    ItemCache.disposeAll();
  }

  public async loadCharacterSelect() {
    this.player?.dispose();
    this.player = null;
    if (this.characterSelect) {
      this.characterSelect.dispose();
    }
    this.zoneManager?.dispose();
    this.camera?.dispose();
    this.camera = new BABYLON.UniversalCamera(
      "__camera__",
      new BABYLON.Vector3(0, 0, 0),
      this.scene!,
    );
    this.camera.minZ = CLIENT_CAMERA_NEAR_PLANE;
    this.applyPrimaryViewport();
    const characterSelect = new CharacterSelect(this);
    this.characterSelect = characterSelect;
    try {
      await characterSelect.initialize();
    } catch (error) {
      characterSelect.dispose();
      if (this.characterSelect === characterSelect) {
        this.characterSelect = null;
      }
      throw error;
    }
  }

  public async loadZoneServer(zone: NewZone) {
    this.CurrentZone = zone;
    this.loadingRefCount = 1;
    this.setLoading(true);
    await this.loadZoneId(zone.zoneIdNumber);
  }

  public completeZoneLoad(): void {
    this.loadingRefCount = 0;
    this.setLoading(false);
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
    this.camera.minZ = CLIENT_CAMERA_NEAR_PLANE;
    this.applyPrimaryViewport();
    animateVignette(this.camera, this.scene!);
    gaussianBlurTeleport(this.camera, this.scene!);
    await this.zoneManager?.loadZone(zoneName);
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
    await this.player.Load(player as PlayerProfile);
  }
}
