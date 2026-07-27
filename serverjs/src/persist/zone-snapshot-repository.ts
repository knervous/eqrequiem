import type { DatabaseBackend, DatabaseRow } from "../db/backend.js";
import {
  decodeZoneSnapshot,
  type ZoneSnapshot,
  ZONE_SNAPSHOT_FORMAT_VERSION,
} from "../zone/zone-snapshot.js";

interface ZoneSnapshotRow extends DatabaseRow {
  id: number | bigint;
  zone_id: number | bigint;
  instance_id: number;
  created_at: string | number;
  format_version: number;
  blob_data: unknown;
}

export interface StoredZoneSnapshot {
  readonly id: number;
  readonly zoneId: number;
  readonly instanceId: number;
  readonly createdAt: string | number;
  readonly formatVersion: number;
  readonly blobData: Uint8Array;
  readonly snapshot: ZoneSnapshot;
}

/** Persistence port shared by server databases and browser OPFS SQLite. */
export class ZoneSnapshotRepository {
  constructor(private readonly runtime: DatabaseBackend) {}

  async save(
    zoneId: number,
    instanceId: number,
    blobData: Uint8Array,
    formatVersion = ZONE_SNAPSHOT_FORMAT_VERSION,
  ): Promise<void> {
    await this.runtime.execute(
      `INSERT INTO zone_snapshots
       (zone_id, instance_id, format_version, blob_data)
       VALUES (?, ?, ?, ?)`,
      [zoneId, instanceId, formatVersion, blobData],
    );
  }

  async latest(
    zoneId: number,
    instanceId: number,
  ): Promise<StoredZoneSnapshot | null> {
    const row = (
      await this.runtime.query<ZoneSnapshotRow>(
        `SELECT id, zone_id, instance_id, created_at, format_version, blob_data
         FROM zone_snapshots
         WHERE zone_id = ? AND instance_id = ?
         ORDER BY created_at DESC, id DESC LIMIT 1`,
        [zoneId, instanceId],
      )
    ).rows[0];
    if (!row) return null;
    const blobData = asBytes(row.blob_data);
    const snapshot = decodeZoneSnapshot(blobData);
    const formatVersion = Number(row.format_version);
    if (formatVersion !== snapshot.formatVersion) {
      throw new Error(
        `Zone snapshot row version ${formatVersion} does not match blob version ${snapshot.formatVersion}`,
      );
    }
    if (
      snapshot.zoneId !== Number(row.zone_id)
      || snapshot.instanceId !== Number(row.instance_id)
    ) {
      throw new Error("Zone snapshot row identity does not match its blob");
    }
    return {
      id: Number(row.id),
      zoneId: Number(row.zone_id),
      instanceId: Number(row.instance_id),
      createdAt: row.created_at,
      formatVersion,
      blobData,
      snapshot,
    };
  }
}

function asBytes(value: unknown): Uint8Array {
  if (value instanceof Uint8Array) {
    return new Uint8Array(value.buffer, value.byteOffset, value.byteLength);
  }
  if (value instanceof ArrayBuffer) return new Uint8Array(value);
  if (Array.isArray(value)) return Uint8Array.from(value.map(Number));
  throw new TypeError("Zone snapshot blob has an unsupported database value");
}
