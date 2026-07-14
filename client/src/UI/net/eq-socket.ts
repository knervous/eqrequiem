import { OpCodes } from "@game/Net/opcodes";
import type { NetMessageCodec } from "@game/Net/messages";
import { LocalBackendConnection } from "@/LocalBackend/connection";
import { isLocalBackendEnabled } from "@/LocalBackend/config";

interface WebTransportOptions {
  serverCertificateHashes?: Array<{
    algorithm: "sha-256";
    value: BufferSource;
  }>;
  requireUnreliable?: boolean;
  allowPooling?: boolean;
  congestionControl?: "default" | "low-latency" | "throughput";
}

interface WebTransport {
  readonly datagrams: {
    readonly writable: WritableStream<Uint8Array>;
    readonly readable: ReadableStream<Uint8Array>;
  };
  readonly incomingBidirectionalStreams: ReadableStream<{
    readable: ReadableStream<Uint8Array>;
    writable: WritableStream<Uint8Array>;
  }>;
  readonly ready: Promise<void>;
  readonly closed: Promise<{ reason?: string; closeCode?: number }>;
  close(closeInfo?: { closeCode?: number; reason?: string }): void;
  createBidirectionalStream(): Promise<{
    readable: ReadableStream<Uint8Array>;
    writable: WritableStream<Uint8Array>;
  }>;
}

function base64ToBytes(base64: string): Uint8Array {
  const normalized = base64.trim();
  if (normalized.length !== 44) {
    throw new Error(
      `Invalid cert hash length ${normalized.length}; expected 44 base64 chars`,
    );
  }
  const binaryString = atob(normalized);
  const bytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  if (bytes.length !== 32) {
    throw new Error(
      `Invalid cert hash byte length ${bytes.length}; expected 32`,
    );
  }
  return bytes;
}

function exactArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  // Ensure a tightly-sized buffer regardless of underlying view offset/length.
  return bytes.buffer.slice(
    bytes.byteOffset,
    bytes.byteOffset + bytes.byteLength,
  );
}

function concatArrayBuffer(a: ArrayBuffer, b: ArrayBuffer): Uint8Array {
  const c = new Uint8Array(a.byteLength + b.byteLength);
  c.set(new Uint8Array(a), 0);
  c.set(new Uint8Array(b), a.byteLength);
  return c;
}

function concatUint8(a: Uint8Array, b: Uint8Array): Uint8Array {
  const c = new Uint8Array(a.length + b.length);
  c.set(a, 0);
  c.set(b, a.length);
  return c;
}

function envValue(name: string): string | null {
  const value = (import.meta.env as Record<string, unknown>)[name];
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function webTransportTarget(
  fallbackHost: string,
  fallbackPort: number | string,
): { host: string; port: string; path: string } {
  return {
    host: envValue("VITE_WT_HOST") ?? fallbackHost,
    port: envValue("VITE_WT_PORT") ?? String(fallbackPort),
    path: envValue("VITE_WT_PATH") ?? "/game",
  };
}

function hashLookupTarget(
  transportHost: string,
  transportPort: string,
): { host: string; port: string } {
  return {
    host: envValue("VITE_WT_HASH_HOST") ?? transportHost,
    port: envValue("VITE_WT_HASH_PORT") ?? transportPort,
  };
}

function boolEnv(name: string, fallback: boolean): boolean {
  const value = envValue(name);
  if (value === null) {
    return fallback;
  }
  if (value === "true" || value === "1" || value.toLowerCase() === "yes") {
    return true;
  }
  if (value === "false" || value === "0" || value.toLowerCase() === "no") {
    return false;
  }
  return fallback;
}

export class EqSocket {
  private localBackend: LocalBackendConnection | null = null;
  private webtransport: WebTransport | null = null;
  private datagramWriter: WritableStreamDefaultWriter<Uint8Array> | null = null;
  private controlWriter: WritableStreamDefaultWriter<Uint8Array> | null = null;
  private writeQueue: Promise<void> = Promise.resolve();
  private opCodeHandlers: {
    [opcode: number]: (payload: Uint8Array) => void;
  } = {};

  public isConnected = false;
  private onClose: (() => void) | null = null;

  // Reconnect
  private url: string | null = null;
  private port: number | string | null = null;
  private sessionId: number | null = null;
  private allowReconnect: boolean;
  private maxRetries: number;
  private retryCount = 0;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(config: { maxRetries?: number; allowReconnect?: boolean } = {}) {
    this.allowReconnect = config.allowReconnect ?? true;
    this.maxRetries = config.maxRetries ?? 2;
    this.close = this.close.bind(this);
    window.addEventListener("beforeunload", () => this.close(false));
  }

  public setSessionId(id: number) {
    this.sessionId = id;
  }

  public async connect(
    url: string,
    port: number | string,
    onClose: () => void,
  ): Promise<boolean> {
    this.url = url;
    this.port = port;
    this.onClose = onClose;

    if (isLocalBackendEnabled() || url === "local") {
      try {
        this.localBackend?.close();
        const localBackend = new LocalBackendConnection();
        localBackend.onPacket((opcode, payload) =>
          this.opCodeHandlers[opcode]?.(payload),
        );
        const info = await localBackend.connect();
        this.localBackend = localBackend;
        this.isConnected = true;
        this.retryCount = 0;
        this.clearReconnectTimer();
        console.info("[local-backend] connected", info);
        return true;
      } catch (error) {
        console.error("[local-backend] connection failed", error);
        this.localBackend?.close();
        this.localBackend = null;
        return false;
      }
    }

    const WT = (window as any).WebTransport as {
      new (url: string, opts?: WebTransportOptions): WebTransport;
    };
    if (!WT) {
      console.error("WebTransport not supported");
      return false;
    }

    // if already open, shut it down first
    if (this.webtransport) {
      const closedInfo = await this.webtransport.closed.catch(() => null);
      if (!closedInfo) {
        this.close(false);
      }
    }

    try {
      const target = webTransportTarget(url, port);
      const transportUrl = `https://${target.host}:${target.port}${target.path}`;
      if (import.meta.env.VITE_LOCAL_DEV === "true") {
        const useCertHash = boolEnv("VITE_WT_USE_CERT_HASH", true);
        if (useCertHash) {
          const hashTarget = hashLookupTarget(target.host, target.port);
          const params = new URLSearchParams({
            ip: hashTarget.host,
            port: hashTarget.port,
          });
          console.log("[WT] Requesting cert hash", {
            endpoint: `/api/hash?${params.toString()}`,
            transportUrl,
          });
          const hash = await fetch(`/api/hash?${params.toString()}`)
            .then((r: Response) => r.text())
            .then((value) => value.trim());

          if (!hash) {
            throw new Error(
              `Missing server certificate hash for ${hashTarget.host}:${hashTarget.port}.` +
                " Set VITE_WT_HASH_HOST/VITE_WT_HASH_PORT or expose /hash on the target.",
            );
          }
          const certHashBytes = base64ToBytes(hash);
          const certHashBuffer = exactArrayBuffer(certHashBytes);

          console.log("[WT] Received cert hash", {
            hash: { algorithm: "sha-256", value: certHashBytes },
          });
          this.webtransport = new WebTransport(transportUrl, {
            // Chromium accepts BufferSource; use exact ArrayBuffer for maximum compatibility.
            serverCertificateHashes: [
              { algorithm: "sha-256", value: certHashBuffer },
            ],
            // Avoid QUIC connection reuse so cert hash pinning applies to this specific target.
            allowPooling: false,
          });
          console.log("[WT] Applying cert hash and opening transport", {
            transportUrl,
            hashLength: hash.length,
          });
        } else {
          // Trusted local cert workflow (mkcert/keychain); do not rely on hash pinning.
          console.log(
            "[WT] Opening transport without cert hash (VITE_WT_USE_CERT_HASH=false)",
            {
              transportUrl,
            },
          );
          this.webtransport = new WebTransport(transportUrl, {
            allowPooling: false,
          });
        }
      } else {
        this.webtransport = new WebTransport(transportUrl);
      }

      // wait for handshake
      await this.webtransport.ready;

      // ——— datagram writer & loop ———
      this.datagramWriter = this.webtransport.datagrams.writable.getWriter();
      this.startDatagramLoop();
      console.log("Datagram writer started", this.datagramWriter);

      // Accept server-opened control stream(s)
      const streamReader =
        this.webtransport.incomingBidirectionalStreams.getReader();
      (async () => {
        while (true) {
          const { value: stream, done } = await streamReader.read();
          if (done) {
            break;
          }
          if (!stream) {
            continue;
          }
          // grab writer & start reader
          this.controlWriter = stream.writable.getWriter();
          this.startControlReadLoop(stream.readable);
        }
      })();

      this.isConnected = true;
      this.retryCount = 0;
      this.clearReconnectTimer();
      // watch for close
      this.webtransport.closed
        .then(() => this.close())
        .catch(() => this.close());

      return true;
    } catch (e) {
      console.warn("Connect failed:", e);
      this.scheduleReconnect();
      return false;
    }
  }

  /** Fire-and-forget datagram */
  public async sendMessage<T>(
    opCode: number,
    codec: NetMessageCodec<T> | null,
    data: Partial<T> | null,
  ): Promise<void> {
    const buf = codec && data ? codec.encode(data) : new Uint8Array(0);
    const op = new Uint16Array([opCode]).buffer;
    const packet = concatUint8(new Uint8Array(op), buf);
    await this.sendDatagram(packet);
  }

  /** Reliable, ordered “stream” message */
  public async sendStreamMessage<T>(
    opCode: number,
    codec: NetMessageCodec<T>,
    data: Partial<T>,
  ): Promise<void> {
    const payload = codec.encode(data);

    if (this.localBackend) {
      this.localBackend.send("control-stream", opCode, payload);
      return;
    }
    if (!this.controlWriter) {
      throw new Error("Control stream not open");
    }

    // [length:uint32_LE][opcode:uint16_LE][payload]
    const header = new ArrayBuffer(4);
    new DataView(header).setUint32(0, 2 + payload.byteLength, true);
    const op = new Uint16Array([opCode]).buffer;

    const frame = concatUint8(
      new Uint8Array(header),
      concatUint8(new Uint8Array(op), payload),
    );
    await this.controlWriter.write(frame);
  }

  public registerOpCodeHandler<T>(
    opCode: OpCodes,
    codec: NetMessageCodec<T>,
    handler: (msg: T) => void | Promise<void>,
  ) {
    this.opCodeHandlers[opCode] = (buf: Uint8Array) => {
      try {
        const result = handler(codec.decode(buf));
        if (result instanceof Promise) {
          void result.catch((error: unknown) => {
            console.error(`Async handler error for opcode ${opCode}:`, error);
          });
        }
      } catch (e) {
        console.error(`Decode error for opcode ${opCode}:`, e);
      }
    };
  }

  public registerRawOpCodeHandler(
    opCode: OpCodes,
    handler: (payload: Uint8Array) => void,
  ): void {
    this.opCodeHandlers[opCode] = handler;
  }

  public close(scheduleReconnect: boolean = true) {
    this.isConnected = false;
    this.localBackend?.close();
    this.localBackend = null;
    this.datagramWriter?.releaseLock();
    this.controlWriter?.releaseLock();
    this.webtransport?.close();
    this.webtransport = null;
    this.datagramWriter = null;
    this.controlWriter = null;

    if (scheduleReconnect && this.allowReconnect) {
      this.scheduleReconnect();
    } else {
      this.clearReconnectTimer();
      this.onClose?.();
    }
  }

  // ——— private helpers ———

  private async sendDatagram(buf: Uint8Array) {
    if (this.localBackend) {
      if (buf.byteLength < 2) {
        throw new Error("Local backend packet is missing its opcode");
      }
      const opcode = new DataView(
        buf.buffer,
        buf.byteOffset,
        buf.byteLength,
      ).getUint16(0, true);
      this.localBackend.send("datagram", opcode, buf.slice(2));
      return;
    }
    if (!this.datagramWriter) {
      return;
    }
    this.writeQueue = this.writeQueue.then(() =>
      this.datagramWriter!.write(buf),
    );
    return this.writeQueue;
  }

  private startDatagramLoop() {
    if (!this.webtransport) {
      return;
    }
    const rdr = this.webtransport.datagrams.readable.getReader();
    (async () => {
      try {
        while (true) {
          const { value, done } = await rdr.read();
          if (done) {
            break;
          }
          if (!value) {
            continue;
          }
          const opcode = new Uint16Array(value.buffer.slice(0, 2))[0];
          const payload = value.slice(2);
          this.opCodeHandlers[opcode]?.(payload);
        }
      } catch (e) {
        console.error("Datagram loop error:", e);
      } finally {
        rdr.releaseLock();
      }
    })();
  }

  private startControlReadLoop(stream: ReadableStream<Uint8Array>) {
    const rdr = stream.getReader();
    let buffer: Uint8Array = new Uint8Array(0);
    (async () => {
      try {
        while (true) {
          const { value, done } = await rdr.read();
          if (done) {
            break;
          }
          buffer = concatUint8(buffer, value!);
          while (buffer.length >= 4) {
            const len = new DataView(buffer.buffer).getUint32(0, true);
            if (buffer.length < 4 + len) {
              break;
            }
            const msg = buffer.slice(4, 4 + len);
            const opcode = new Uint16Array(msg.buffer.slice(0, 2))[0];
            const payload = msg.slice(2);
            this.opCodeHandlers[opcode]?.(payload);
            buffer = buffer.slice(4 + len);
          }
        }
      } catch (e) {
        console.error("Control stream loop error:", e);
      } finally {
        rdr.releaseLock();
      }
    })();
  }

  private scheduleReconnect() {
    if (this.reconnectTimer) {
      return;
    }
    if (
      this.retryCount >= this.maxRetries ||
      !this.url ||
      !this.port ||
      !this.onClose
    ) {
      this.clearReconnectTimer();
      this.onClose?.();
      this.retryCount = 0;
      return;
    }
    const delay = Math.min(2 ** this.retryCount * 1000, 30_000);
    this.retryCount++;
    this.reconnectTimer = setTimeout(async () => {
      this.reconnectTimer = null;
      const ok = await this.connect(this.url!, this.port!, this.onClose!);
      // connect() owns retry scheduling on failure; avoid stacking extra timers here.
      if (!ok) {
      }
    }, delay);
  }

  private clearReconnectTimer() {
    if (!this.reconnectTimer) {
      return;
    }
    clearTimeout(this.reconnectTimer);
    this.reconnectTimer = null;
  }
}
