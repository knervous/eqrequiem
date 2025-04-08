import { GDictionary, Node } from "godot";
import ZoneManager from "../Zone/zone-manager";
import { inEditor } from "../Util/constants";
import { ChatUIHandler } from "./chat";
import { supportedZones } from "../Constants/supportedZones";

declare const window: {
  godotBridge: JSBridge;
};
export default class JSBridge extends Node {
  listeners: { [key: string]: ((message: object | string) => void)[] } = {};
  ChatUI!: ChatUIHandler;
  public _ready(): void {
    if (!inEditor) {
      window.godotBridge = this;
      window.onGodotBridgeRegistered?.();
      window.newProp = { ok: 'some new prop' };
    }
    const root = this.get_tree().root;
    this.ChatUI = new ChatUIHandler(root, this.sendMessage.bind(this));

    // motd later?
    setTimeout(() => {
      this.ChatUI.handler('Welcome to EQ Requiem!');
      this.ChatUI.handler('Type /help to see available commands');
    }, 2500);

  }

  public postMessage(message: object) {
    this.handleMessage(message);
  }

  public addEventListener(event: string, cb: (message: object | string) => void) {
    if (!this.listeners[event]) {
      this.listeners[event] = [];
    }
    this.listeners[event].push(cb);
  }

  public removeEventListener(event: string, cb: (message: object | string) => void) {
    if (this.listeners[event]) {
      this.listeners[event] = this.listeners[event].filter(
        (listener) => listener !== cb,
      );
    }
  }

  public sendMessage(message: object) {
    if (inEditor) {
      this.get_node('/root/Zone/CEFBridge').call('_invoke_js_callback', JSON.stringify(message));
    } else if (this.listeners["message"])
      this.listeners["message"].forEach((listener) =>
        listener(
          inEditor ? JSON.stringify(message) : message,
        ),
      );
  }

  public handleMessage(message: GDictionary & object) {
    try {
      const data = typeof message?.toObject === 'function' ? message.toObject() : message;
      const zoneManager = <ZoneManager>this.get_node("/root/Zone");
      console.log('Got message', message);
      switch(data.type) {
        case "dispose":
          zoneManager.dispose();
          break;
        case "loadCharacterSelect":
          zoneManager.loadCharacterSelect();
          break;
        case "loadPlayer":
          zoneManager.instantiatePlayer(data.payload);
          break;
        case "characterSelectPlayer":
          zoneManager.CharacterSelect?.loadModel(data.payload.player);
          break;
        case "loadZone":
          zoneManager.loadZone(supportedZones[data.payload?.toString()].shortName);
          break;
        case "chat":
          this.ChatUI.handler(data.payload);
          break;
      }
    } catch (e) {
      console.error(e);
    }
  }

  public async chatLine(message: string) {
    console.log("Got message", message);
    const root = this.get_tree().root;
    const addChatLine = (line: string) => {
      this.sendMessage({ type: "chat", payload: line });
    };
    const zoneManager = <ZoneManager>root.get_node("Zone");

    if (message.startsWith("/")) {
      const [command, ...args] = message
        .substring(1)
        .split(" ")
        .filter(Boolean);
      console.log("Got command", command);
      switch (command) {
        case "help":
          addChatLine("----- Available commands -----");
          addChatLine("/zone {shortname} - Example /zone qeynos2");
          addChatLine("/spawn {model} - Example /spawn hum");
          addChatLine("/controls - Displays controls");
          break;
        case "zone":
          const zone = args[0];
          if (zone) {
            addChatLine(`LOADING, PLEASE WAIT...`);
            await zoneManager.loadZone(zone);
            addChatLine(`You have entered ${zone}`);
          } else {
            addChatLine("No zone entered");
          }
          break;
        case "spawn":
          const spawn = args[0];
          if (spawn) {
            addChatLine(`Spawning ${spawn}`);
            zoneManager.spawnModel(spawn);
          } else {
            addChatLine("No model entered");
          }
          break;
        case "controls":
          addChatLine("Movement: W, A, S, D");
          addChatLine("Jump (Up): Space");
          addChatLine("Sprint: Shift");
          addChatLine("Crouch (Down): Ctrl");
          addChatLine("Look around: Mouse with Right Click = Mouse lock");
          break;
        default:
          console.log("Unknown command");
      }
    }
  }
}
