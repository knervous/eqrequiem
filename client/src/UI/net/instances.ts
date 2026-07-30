import { EqSocket } from "./eq-socket";

export const WorldSocket = new EqSocket();

if (import.meta.hot) {
  import.meta.hot.dispose(() => {
    void WorldSocket.close(false);
  });
}
