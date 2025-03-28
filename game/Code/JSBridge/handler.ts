import { Node } from "godot";


export class ClientHandler {
  root;
  sendMessage;
  constructor(root: Node, sendMessage: (msg: object) => void) {
    this.root = root;
    this.sendMessage = sendMessage;
  }
}