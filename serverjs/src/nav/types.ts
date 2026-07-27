export interface NavPoint {
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

export interface NavPathRequest {
  /** Stable zone type key, shared by every live instance of that zone. */
  readonly zoneKey: string;
  readonly zoneId: number;
  readonly instanceId: number;
  readonly start: NavPoint;
  readonly end: NavPoint;
}

export interface NavPathResult {
  readonly zoneId: number;
  readonly instanceId: number;
  readonly path: readonly NavPoint[];
}

export interface NavWorkerRequestMessage {
  readonly type: "find_path";
  readonly requestId: number;
  readonly zoneId: number;
  readonly instanceId: number;
  readonly start: NavPoint;
  readonly end: NavPoint;
}

export interface NavWorkerReadyMessage {
  readonly type: "ready";
  readonly tileCount: number;
  readonly layoutHash: string;
}

export interface NavWorkerPathMessage {
  readonly type: "path";
  readonly requestId: number;
  readonly zoneId: number;
  readonly instanceId: number;
  readonly path: NavPoint[];
}

export interface NavWorkerErrorMessage {
  readonly type: "error";
  readonly requestId?: number;
  readonly message: string;
}

export type NavWorkerInboundMessage = NavWorkerRequestMessage;
export type NavWorkerOutboundMessage =
  | NavWorkerReadyMessage
  | NavWorkerPathMessage
  | NavWorkerErrorMessage;
