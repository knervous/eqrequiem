import { JournalNote } from "@game/Net/messages";
import { OpCodes } from "@game/Net/opcodes";
import { WorldSocket } from "@ui/net/instances";

/**
 * The player's own memory of the world.
 *
 * The Field Journal records what the game told the character; this records what the
 * player decided was worth keeping. Both live in the same panel, but only this half is
 * theirs to write — which means a useful sentence never has to have been annotated by
 * a content author to be keepable.
 */
export class PlayerJournal {
  /** Keeps a line — usually something an NPC just said — with who said it. */
  remember(body: string, source = "", withPosition = true): Promise<void> {
    return WorldSocket.sendStreamMessage(OpCodes.JournalNote, JournalNote, {
      action: "add",
      body,
      source,
      withPosition,
    });
  }

  forget(noteId: number): Promise<void> {
    return WorldSocket.sendStreamMessage(OpCodes.JournalNote, JournalNote, {
      action: "remove",
      noteId,
    });
  }

  pin(noteId: number, pinned: boolean): Promise<void> {
    return WorldSocket.sendStreamMessage(OpCodes.JournalNote, JournalNote, {
      action: "pin",
      noteId,
      pinned,
    });
  }
}

export const playerJournal = new PlayerJournal();
