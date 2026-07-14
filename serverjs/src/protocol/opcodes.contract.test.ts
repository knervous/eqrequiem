import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { describe, it } from "node:test";

import { OP } from "./opcodes.js";

const sharedNames = {
  JWT_RESPONSE: "JWTResponse",
  JWT_LOGIN: "JWTLogin",
  CHARACTER_CREATE: "CharacterCreate",
  DELETE_CHARACTER: "DeleteCharacter",
  APPROVE_NAME_SERVER: "ApproveName_Server",
  ENTER_WORLD: "EnterWorld",
  POST_ENTER_WORLD: "PostEnterWorld",
  SEND_CHAR_INFO: "SendCharInfo",
  ZONE_SESSION: "ZoneSession",
  ZONE_SESSION_VALID: "ZoneSessionValid",
  BATCH_ZONE_SPAWNS: "BatchZoneSpawns",
  NEW_ZONE: "NewZone",
  PLAYER_PROFILE: "PlayerProfile",
  CLIENT_UPDATE: "ClientUpdate",
  CAMP: "Camp",
  MOVE_ITEM: "MoveItem",
  CHANNEL_MESSAGE: "ChannelMessage",
  GM_COMMAND: "GMCommand",
  DELETE_ITEM: "DeleteItem",
  BULK_DELETE_ITEMS: "DeleteItems",
  ITEM_PACKET: "ItemPacket",
  ADD_ITEM_PACKET: "AddItemPacket",
  ANIMATION: "Animation",
  LEVEL_UPDATE: "LevelUpdate",
  REQUEST_CLIENT_ZONE_CHANGE: "RequestClientZoneChange",
  RENDER_SNAPSHOT: "SpawnPositionUpdate",
} as const;

describe("shared opcode contract", () => {
  it("matches the client enum", async () => {
    const sourceText = await readFile(
      new URL("../../../client/src/Game/Net/opcodes.ts", import.meta.url),
      "utf8",
    );
    const client = readNumericEnum(sourceText, "OpCodes");
    for (const [serverName, clientName] of Object.entries(sharedNames)) {
      assert.equal(
        OP[serverName as keyof typeof OP],
        client.get(clientName),
        `${serverName} drifted from client OpCodes.${clientName}`,
      );
    }
  });
});

function readNumericEnum(sourceText: string, enumName: string): Map<string, number> {
  const body = new RegExp(`export\\s+enum\\s+${enumName}\\s*\\{([\\s\\S]*?)\\}`).exec(
    sourceText.replaceAll(/\/\/.*$/gm, ""),
  )?.[1];
  assert.ok(body, `${enumName} enum not found`);
  const values = new Map<string, number>();
  let value = -1;
  for (const rawMember of body.split(",")) {
    const member = rawMember.trim();
    if (!member) continue;
    const [name, initializer] = member.split("=").map((part) => part.trim());
    assert.ok(name, "Opcode enum member is missing a name");
    value = initializer === undefined ? value + 1 : Number(initializer);
    assert.ok(Number.isInteger(value), `Non-numeric initializer for ${name}`);
    values.set(name, value);
  }
  return values;
}
