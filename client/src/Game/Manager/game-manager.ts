import BABYLON from "@bjs";
import type * as BJS from "@babylonjs/core";
import Player from "../Player/player";
import CharacterSelect from "../Zone/character-select";
import { supportedZones } from "../Constants/supportedZones";
import MusicManager from "@game/Music/music-manager";
import { ZoneManager } from "@game/Zone/zone-manager";
import { PlayerProfile } from "@game/Net/internal/api/capnp/player";
import HavokPhysics from "@babylonjs/havok";
import { Effect } from "@babylonjs/core/Materials/effect";

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
    this.sceneMouseDown = this.sceneMouseDown.bind(this);
    this.sceneMouseUp = this.sceneMouseUp.bind(this);
    this.sceneMouseMove = this.sceneMouseMove.bind(this);
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
      const didEnable = this.scene.enablePhysics(
        new BABYLON.Vector3(0, -4.3, 0),
        havokPlugin,
      );
      if (didEnable) {
        this.scene._physicsEngine!.setGravity(new BABYLON.Vector3(0, -0.5, 0));
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
    this.scene.onPointerDown = this.sceneMouseDown;
    this.scene.onPointerUp = this.sceneMouseUp;
    this.scene.onPointerMove = this.sceneMouseMove;   // ← add this line
    this.canvas!.oncontextmenu = (e) => e.preventDefault();
    this.scene.onPointerObservable.add(this.onPointerEvent.bind(this));

    this.camera = new BABYLON.UniversalCamera(
      "__camera__",
      new BABYLON.Vector3(0, 0, 0),
      this.scene,
    );
    this.camera.applyGravity = false;
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
    switch(eventData.type) {
      case BABYLON.PointerEventTypes.POINTERWHEEL:
        // Handle mouse wheel event
        console.log('wheel');
        //this.handleMouseWheel(eventData);
        break;
      case BABYLON.PointerEventTypes.POINTERMOVE:
        // Handle mouse move event
        //this.handleMouseMove(eventData);
        console.log('mouse move');
        break;
      case BABYLON.PointerEventTypes.POINTERDOWN:
        // Handle mouse down event
        console.log('mouse down');
        break;
      case BABYLON.PointerEventTypes.POINTERUP:
        // Handle mouse up event
        console.log('mouse up');
        break;
      default:
        break;
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
        if (this.player) {
          this.player.playerMovement.inputKeyDown(e);
        }
        break;
    }
  }

  // Handle mouse button events
  sceneMouseDown(e: BJS.IPointerEvent) {
    console.log('Hello event',e);
    if (!this.player || !this.scene) return;

    // Route mouse button press to player
    this.player.inputMouseButton(e, true); // true for pressed

    // Emulate Godot's right-click mouse capture behavior
    if (e.button === 2) { // Right mouse button
      this.scene.pointerMoveDisabled = true; // Lock pointer
      this.engine?.enterPointerLock();
    }

    // Route to zoneManager's EntityPool if needed
  }

  // Handle mouse button release
  sceneMouseUp(e: BJS.IPointerEvent) {
    if (!this.player || !this.scene) return;

    // Route mouse button release to player
    // this.player.inputMouseButton(e, false); // false for released

    // Release pointer lock on right mouse button up
    if (e.button === 2) {
      this.scene.pointerMoveDisabled = false;
      //this.engine?.exitPointerLock();
    }
  }

  // Handle mouse motion
  sceneMouseMove(e: BJS.IPointerEvent) {
    if (!this.player || !this.scene) return;

    // Route mouse motion to player
    this.player.inputMouseMotion(e.movementX, e.movementY);
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
    if (this.player) {
      this.player.dispose();
    }
    if (this.characterSelect) {
      this.characterSelect.dispose();
      this.characterSelect = null;
    }
  }

  public async loadCharacterSelect() {
    this.player?.dispose();
    if (this.characterSelect) {
      this.characterSelect.dispose();
    }
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

  public async loadZone(zoneName: string, usePhysics = false): Promise<void> {
    this.dispose();
    this.zoneManager?.loadZone(zoneName, usePhysics);
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
    this.player = new Player(this, this.Camera!);
    this.player?.Load(player as PlayerProfile);
  }

  // _input(event: InputEvent) {
  //   if (!this.player) {
  //     return;
  //   }
  //   switch (true) {
  //     case event instanceof InputEventMouseButton: {
  //       this.player.input(event.button_index);
  //       this.zoneManager?.EntityPool?.mouseEvent(event);
  //       if (event.button_index === MouseButton.MOUSE_BUTTON_RIGHT) {
  //         DisplayServer.mouse_set_mode(
  //           event.pressed
  //             ? Input.MouseMode.MOUSE_MODE_CAPTURED
  //             : Input.MouseMode.MOUSE_MODE_VISIBLE,
  //         );
  //       }
  //       break;
  //     }
  //     case event instanceof InputEventMouseMotion: {
  //       this.player.inputMouseMotion(event.relative.x, event.relative.y);
  //       break;
  //     }
  //     case event instanceof InputEventPanGesture: {
  //       this.player.input_pan(event.delta.y);
  //       break;
  //     }
  //     default:
  //       break;
  //   }
  // }

  // _physics_process(delta: number): void {
  //   if (this.player) {
  //     this.player.tick(delta);
  //   }
  // }

  // _process(delta: number): void {
  //   this.zoneManager?.tick(delta);
  // }
}
