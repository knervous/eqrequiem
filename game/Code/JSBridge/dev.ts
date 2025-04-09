import Player from "../Player/player";
import { ChatUIHandler } from "./chat";


export const devCommands = (cmd: string, args: string[]): boolean => {
  switch (cmd) {
    case 'speed':
      if (+args[0] > 0 && Player.instance) { 
        Player.instance.move_speed = +args[0];
        ChatUIHandler.addChatLine(`Speed set to ${args[0]}`);
      } else {
        ChatUIHandler.addChatLine("Invalid speed value");
      }
      break;
  }

  return false;
};