import { OpCodes } from "@game/Net/opcodes";
import * as $ from "capnp-es";
interface WebTransportOptions {
  serverCertificateHashes?: Array<{
    algorithm: 'sha-256'; // Currently, only 'sha-256' is supported
    value: ArrayBuffer;
  }>;
  allowPooling?: boolean;
  congestionControl?: 'default' | 'low-latency' | 'throughput';
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
  readonly incomingUnidirectionalStreams: ReadableStream<ReadableStream<Uint8Array>>;
  readonly ready: Promise<void>;
  readonly closed: Promise<{ reason?: string; closeCode?: number }>;
  close(closeInfo?: { closeCode?: number; reason?: string }): void;
  createBidirectionalStream(): Promise<{
    readable: ReadableStream<Uint8Array>;
    writable: WritableStream<Uint8Array>;
  }>;
  createUnidirectionalStream(): Promise<WritableStream<Uint8Array>>;
}

// Define the constructor type separately
interface WebTransportConstructor {
  new (url: string, options?: WebTransportOptions): WebTransport;
}
function setStructFields<T extends $.Struct>(struct: T, data: Partial<Record<keyof T, any>>) {
  for (const [key, value] of Object.entries(data)) {
    if (value !== undefined) {
      (struct as any)[key] = value;
    }
  }
}

// Utility functions
function base64ToArrayBuffer(base64: string): ArrayBuffer {
  const binaryString = atob(base64);
  const bytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes.buffer;
}

function concatArrayBuffer(buffer1: ArrayBuffer, buffer2: ArrayBuffer): Uint8Array {
  const newBuffer = new Uint8Array(buffer1.byteLength + buffer2.byteLength);
  newBuffer.set(new Uint8Array(buffer1), 0);
  newBuffer.set(new Uint8Array(buffer2), buffer1.byteLength);
  return newBuffer;
}

export class EqSocket {
  private webtransport: WebTransport | null = null;
  private opCodeHandlers: { [key: number]: (data: Uint8Array) => void } = {};
  public isConnected: boolean = false;
  private writer: WritableStreamDefaultWriter<Uint8Array> | null = null;
  private writeQueue: Promise<void> = Promise.resolve();
  private onClose: (() => void) | null = null;
  // Reconnection properties
  private url: string | null = null;
  private port: number | string | null = null;
  private maxRetries: number;
  private retryCount: number = 0;
  private reconnectTimeout: NodeJS.Timeout | null = null;
  private allowReconnect: boolean;
  private sessionId: number | null = null;

  constructor(config: {
    maxRetries?: number; // Default 5
    allowReconnect?: boolean; // Default true
  } = {}) {
    this.maxRetries = config.maxRetries ?? 5;
    this.allowReconnect = config.allowReconnect ?? true;
    this.close = this.close.bind(this);
    window.addEventListener("beforeunload", () => this.close(false));
  }

  public setSessionId(sessionId: number): void {
    this.sessionId = sessionId;
  }

  public async connect(
    url: string,
    port: number | string,
    onClose: () => void,
  ): Promise<boolean> {
    const WebTransport = (window as any).WebTransport as WebTransportConstructor;
    if (!WebTransport) {
      console.error("WebTransport not supported");
      return false;
    }

    // Store connection parameters
    this.url = url;
    this.port = port;
    this.onClose = onClose;

    console.log(`Connecting via WebTransport to: ${port}`);
    if (this.webtransport !== null && !(await this.webtransport.closed)) {
      console.log("Clearing webtransport");
      this.close(false); // Don't schedule reconnect during initial connect
    }

    try {
      const sid = this.sessionId ?? 0;
      if (import.meta.env.VITE_LOCAL_DEV === "true") {
        const hash = await fetch(`/api/hash?port=7100&ip=127.0.0.1`).then((r: Response) => r.text());
        this.webtransport = new WebTransport(`https://127.0.0.1/eq?sid=${sid}`, {
          serverCertificateHashes: [{ algorithm: "sha-256", value: base64ToArrayBuffer(hash) }],
        });
        console.log("Got hash", hash);
      } else {
        this.webtransport = new WebTransport(`https://${url}:${port}/eq?sid=${sid}`);
      }

      await this.webtransport!.ready;
      this.writer = this.webtransport!.datagrams.writable.getWriter();
      this.isConnected = true;
      this.retryCount = 0; // Reset retry count on successful connection

      // Monitor WebTransport closure for reconnection
      this.webtransport!.closed.then(() => {
        console.log("WebTransport closed");
        this.close();
      }).catch((e) => {
        console.warn("WebTransport closed with error:", e);
        this.close();
      });
    } catch (e) {
      console.warn("Error connecting socket:", e);
      this.scheduleReconnect();
      return false;
    }

    // Start datagram read loop
    this.readLoop().catch((e) => {
      console.warn("Error in datagram read loop:", e);
      this.close();
    });

    // Start stream read loop
    this.streamReadLoop().catch((e) => {
      console.warn("Error in stream read loop:", e);
      this.close();
    });

    return true;
  }

  // Send data over datagrams
  public async send(buffer: Uint8Array): Promise<void> {
    if (!this.webtransport || !this.writer) {
      //console.error("Sending from an unopen socket");
      return;
    }

    this.writeQueue = this.writeQueue.then(async () => {
      try {
        await this.writer!.write(buffer);
      } catch (e) {
        console.error("Error sending datagram:", e);
        this.close();
        throw e;
      }
    });

    return this.writeQueue;
  }

  public async sendMessage<T extends $.Struct>(
    opCode: number,
    StructType: Parameters<$.Message["initRoot"]>[0] & { prototype: T },
    messageData: Partial<Record<keyof T, any>>,
  ): Promise<void> {
    const message = new $.Message();
    const root = message.initRoot(StructType);
    setStructFields(root, messageData);
    const buf = $.Message.toArrayBuffer(message);
    const opBuf = new Uint16Array([opCode]).buffer;
    await this.send(new Uint8Array(concatArrayBuffer(opBuf, buf)));
  }

  public async sendStreamMessage<T extends $.Struct>(
    opCode: number,
    StructType: Parameters<$.Message["initRoot"]>[0] & { prototype: T },
    messageData: Partial<Record<keyof T, any>>,
  ): Promise<void> {
    if (!this.webtransport) {
      console.error("Sending stream from an unopen socket");
      throw new Error("Socket not connected");
    }
    const message = new $.Message();
    const root = message.initRoot(StructType);
    setStructFields(root, messageData);
    const buf = $.Message.toArrayBuffer(message);
    const opBuf = new Uint16Array([opCode]).buffer;
    await this.send(new Uint8Array(concatArrayBuffer(opBuf, buf)));
  }

  public registerOpCodeHandler<T extends $.Struct>(
    opCode: OpCodes,
    StructType: Parameters<$.Message["initRoot"]>[0] & { prototype: T },
    handler: (data: T) => void,
  ): void {
    this.opCodeHandlers[opCode] = (data: Uint8Array) => {
      try {
        const reader = new $.Message(data, false);
        const root = reader.getRoot(StructType);
        handler(root as T);
      } catch (e) {
        console.error(`Error decoding Cap’n Proto message for opcode ${opCode}:`, e);
      }
    };
  }

  public close(scheduleReconnect: boolean = true): void {
    this.isConnected = false;
    if (this.writer) {
      this.writer.releaseLock();
      this.writer = null;
    }
    if (this.webtransport) {
      console.log("Closing WebTransport");
      this.webtransport.close();
      this.webtransport = null;
    }
    if (scheduleReconnect && this.allowReconnect) {
      this.scheduleReconnect();
    } else {
      console.log("Connection closed; no reconnection scheduled");
      this.onClose?.();
    }
  }

  // Schedule reconnection with exponential backoff
  private scheduleReconnect(): void {
    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
    }
    if (this.retryCount >= this.maxRetries || !this.url || !this.port || !this.onClose) {
      console.log("Max retries reached or no connection params; calling onClose");
      this.onClose?.();
      this.retryCount = 0;
      return;
    }

    const delay = Math.min(1000 * Math.pow(2, this.retryCount), 30_000); // Exponential backoff, max 30s
    this.retryCount++;
    console.log(`Scheduling reconnect attempt ${this.retryCount}/${this.maxRetries} in ${delay}ms`);

    this.reconnectTimeout = setTimeout(async () => {
      console.log(`Attempting reconnect to ${this.url}:${this.port}`);
      const success = await this.connect(this.url!, this.port!, this.onClose!);
      if (!success) {
        this.scheduleReconnect(); // Retry again if failed
      }
    }, delay);
  }

  // Datagram read loop
  private async readLoop(): Promise<void> {
    if (!this.webtransport) return;

    const reader = this.webtransport.datagrams.readable.getReader();

    try {
      while (true) {
        const { value, done } = await reader.read();
        if (done) {
          console.log('Done loop');
          this.close();
          break;
        }
        if (value) {
          const opcode = new Uint16Array(value.buffer.slice(0, 2))[0];
          if (this.opCodeHandlers[opcode]) {
            this.opCodeHandlers[opcode](value.slice(2));
          } else {
            console.log(`No handler for datagram opcode ${opcode}`, value);
          }
        }
      }
    } catch (e) {
      console.log("Error in datagram readLoop:", e);
      throw e;
    } finally {
      reader.releaseLock();
    }
  }

  // Stream read loop
  private async streamReadLoop(): Promise<void> {
    if (!this.webtransport) return;

    const streamReader = this.webtransport.incomingBidirectionalStreams.getReader();

    try {
      while (true) {
        const { value: stream, done } = await streamReader.read();
        if (done) {
          console.log('Done stream loop');
          this.close();
          break;
        }
        if (stream) {
          this.processStream(stream.readable, stream.writable).catch((e) => {
            console.warn("Error processing stream:", e);
          });
        }
      }
    } catch (e) {
      console.log("Error in streamReadLoop:", e);
      throw e;
    } finally {
      streamReader.releaseLock();
    }
  }

  // Process a single stream
  private async processStream(
    readable: ReadableStream<Uint8Array>,
    writable: WritableStream<Uint8Array>,
  ): Promise<void> {
    const reader = readable.getReader();
    let buffer = new Uint8Array(0);

    try {
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        if (value) {
          const newBuffer = new Uint8Array(buffer.length + value.length);
          newBuffer.set(buffer, 0);
          newBuffer.set(value, buffer.length);
          buffer = newBuffer;

          while (buffer.length >= 4) {
            const length = new DataView(buffer.buffer).getUint32(0, true);
            if (buffer.length < 4 + length) {
              break;
            }

            const message = buffer.slice(4, 4 + length);
            const opcode = new Uint16Array(message.buffer.slice(0, 2))[0];
            const payload = message.slice(2);

            if (this.opCodeHandlers[opcode]) {
              this.opCodeHandlers[opcode](payload);
            } else {
              console.log(`No handler for stream opcode ${opcode}`, payload);
            }

            buffer = buffer.slice(4 + length);
          }
        }
      }
    } catch (e) {
      console.error("Error reading stream:", e);
      throw e;
    } finally {
      reader.releaseLock();
      const writer = writable.getWriter();
      await writer.close();
    }
  }
}