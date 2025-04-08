import ZoneManager from "../Zone/zone-manager";
import { ClientHandler } from "./handler";

export class ChatUIHandler extends ClientHandler {
  public async handler(message: string) {
    const addChatLine = (line: string) => {
      this.sendMessage({ type: "chat", payload: { type: 0, line, color: '#DDD' } });
    };
    const zoneManager = <ZoneManager>this.root.get_node("Zone");

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
            await zoneManager.instantiatePlayer();
            addChatLine(`You have entered ${zone}`);
          } else {
            addChatLine("No zone entered");
          }
          break;
        case "camp":
          addChatLine("Camping...");
          this.sendMessage({ type: "camp" });
          zoneManager.dispose();
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
        case "test":
          addChatLine("Test command");
          break;
        default:
          console.log("Unknown command");
      }
    } else {
      addChatLine(`You say, '${message}'`);
    }
  }
}
