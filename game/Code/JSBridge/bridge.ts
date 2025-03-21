import { Node, RichTextLabel } from "godot";
import ZoneManager from "../Zone/zone-manager";

export default class JSBridge extends Node {
  public async chatLine(message: string) {
    console.log("Got message", message);
    const root = this.get_tree().root;
    const content = this.get_node(
      "/root/Zone/DebugUI/ChatContainer/ScrollContainer/Content"
    ) as RichTextLabel;
    const addChatLine = (line: string) => {
      if (content) {
        content?.add_text("\n" + line);
      }
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
            addChatLine('Movement: W, A, S, D');
            addChatLine('Jump (Up): Space');
            addChatLine('Sprint: Shift');
            addChatLine('Crouch (Down): Ctrl')
            addChatLine('Look around: Mouse with Right Click = Mouse lock');
          break;
        default:
          console.log("Unknown command");
      }
    }
  }
}
