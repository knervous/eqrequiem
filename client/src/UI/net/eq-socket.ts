import { setStructFields } from '@game/Constants/util';
import { OpCodes } from '@game/Net/opcodes';
import * as $ from 'capnp-es';

interface WebTransportOptions {
  serverCertificateHashes?: Array<{
    algorithm: 'sha-256';
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
  readonly ready: Promise<void>;
  readonly closed: Promise<{ reason?: string; closeCode?: number }>;
  close(closeInfo?: { closeCode?: number; reason?: string }): void;
  createBidirectionalStream(): Promise<{
    readable: ReadableStream<Uint8Array>;
    writable: WritableStream<Uint8Array>;
  }>;
}

function base64ToArrayBuffer(base64: string): ArrayBuffer {
  const binaryString = atob(base64);
  const bytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes.buffer;
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


export class EqSocket {
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
    this.maxRetries = config.maxRetries ?? 5;
    this.close = this.close.bind(this);
    window.addEventListener('beforeunload', () => this.close(false));
  }

  public setSessionId(id: number) {
    this.sessionId = id;
  }

  public async connect(
    url: string,
    port: number | string,
    onClose: () => void,
  ): Promise<boolean> {
    const WT = (window as any).WebTransport as {
      new (url: string, opts?: WebTransportOptions): WebTransport;
    };
    if (!WT) {
      console.error('WebTransport not supported');
      return false;
    }

    this.url = url;
    this.port = port;
    this.onClose = onClose;

    // if already open, shut it down first
    if (this.webtransport) {
      const closedInfo = await this.webtransport.closed.catch(() => null);
      if (!closedInfo) {this.close(false);}
    }

    try {
      // const _sid = this.sessionId ?? 0;
      if (import.meta.env.VITE_LOCAL_DEV === 'true') {
        const hash = await fetch('/api/hash?port=7100&ip=127.0.0.1').then((r: Response) => r.text());
        this.webtransport = new WebTransport('https://127.0.0.1/eq', {
          serverCertificateHashes: [{ algorithm: 'sha-256', value: base64ToArrayBuffer(hash) }],
        });
        console.log('Got hash', hash);
      } else {
        this.webtransport = new WebTransport(`https://${url}:${port}/eq`);
      }

      // wait for handshake
      await this.webtransport.ready;

      // ——— datagram writer & loop ———
      this.datagramWriter = this.webtransport.datagrams.writable.getWriter();
      this.startDatagramLoop();
      console.log('Datagram writer started', this.datagramWriter);

      // Accept server-opened control stream(s)
      const streamReader = this.webtransport.incomingBidirectionalStreams.getReader();
      (async () => {
        while (true) {
          const { value: stream, done } = await streamReader.read();
          if (done) {break;}
          if (!stream) {continue;}
          // grab writer & start reader
          this.controlWriter = stream.writable.getWriter();
          this.startControlReadLoop(stream.readable);
        }
      })();

      this.isConnected = true;
      this.retryCount = 0;
      // watch for close
      this.webtransport.closed
        .then(() => this.close())
        .catch(() => this.close());

      return true;
    } catch (e) {
      console.warn('Connect failed:', e);
      this.scheduleReconnect();
      return false;
    }
  }

  /** Fire-and-forget datagram */
  public async sendMessage<T extends $.Struct>(
    opCode: number,
    StructType: Parameters<$.Message['initRoot']>[0] & { prototype: T } | null,
    data: Partial<Record<keyof T, any>> | null,
  ): Promise<void> {
    const msg = new $.Message();
    if (!StructType || !data) {
      const buf = new Uint8Array(2).buffer;
      const op = new Uint16Array([opCode]).buffer;
      await this.sendDatagram(new Uint8Array(concatArrayBuffer(op, buf)));
      return;
    }
    const root = msg.initRoot(StructType);
    setStructFields(root, data);
    const buf = $.Message.toArrayBuffer(msg);
    const op = new Uint16Array([opCode]).buffer;
    const packet = concatArrayBuffer(op, buf);
    await this.sendDatagram(new Uint8Array(packet));
  }

  /** Reliable, ordered “stream” message */
  public async sendStreamMessage<T extends $.Struct>(
    opCode: number,
    StructType: Parameters<$.Message['initRoot']>[0] & { prototype: T },
    data: Partial<Record<keyof T, any>>,
  ): Promise<void> {
    if (!this.controlWriter) {throw new Error('Control stream not open');}
    const msg = new $.Message();
    const root = msg.initRoot(StructType);
    setStructFields(root, data);
    const payload = new Uint8Array($.Message.toArrayBuffer(msg));

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

  public registerOpCodeHandler<T extends $.Struct>(
    opCode: OpCodes,
    StructType: Parameters<$.Message['initRoot']>[0] & { prototype: T },
    handler: (msg: T) => void,
  ) {
    this.opCodeHandlers[opCode] = (buf: Uint8Array) => {
      try {
        const reader = new $.Message(buf, false);
        const root = reader.getRoot(StructType);
        handler(root as T);
      } catch (e) {
        console.error(`Decode error for opcode ${opCode}:`, e);
      }
    };
  }

  public close(scheduleReconnect: boolean = true) {
    this.isConnected = false;
    this.datagramWriter?.releaseLock();
    this.controlWriter?.releaseLock();
    this.webtransport?.close();
    this.webtransport = null;
    this.datagramWriter = null;
    this.controlWriter = null;

    if (scheduleReconnect && this.allowReconnect) {
      this.scheduleReconnect();
    } else {
      this.onClose?.();
    }
  }

  // ——— private helpers ———

  private async sendDatagram(buf: Uint8Array) {
    if (!this.datagramWriter) {return;}
    this.writeQueue = this.writeQueue.then(() =>
      this.datagramWriter!.write(buf),
    );
    return this.writeQueue;
  }

  private startDatagramLoop() {
    if (!this.webtransport) {return;}
    const rdr = this.webtransport.datagrams.readable.getReader();
    (async () => {
      try {
        while (true) {
          const { value, done } = await rdr.read();
          if (done) {break;}
          if (!value) {continue;}
          const opcode = new Uint16Array(value.buffer.slice(0, 2))[0];
          const payload = value.slice(2);
          this.opCodeHandlers[opcode]?.(payload);
        }
      } catch (e) {
        console.error('Datagram loop error:', e);
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
          if (done) {break;}
          buffer = concatUint8(buffer, value!); 
          while (buffer.length >= 4) {
            const len = new DataView(buffer.buffer).getUint32(0, true);
            if (buffer.length < 4 + len) {break;}
            const msg = buffer.slice(4, 4 + len);
            const opcode = new Uint16Array(msg.buffer.slice(0, 2))[0];
            const payload = msg.slice(2);
            this.opCodeHandlers[opcode]?.(payload);
            buffer = buffer.slice(4 + len);
          }
        }
      } catch (e) {
        console.error('Control stream loop error:', e);
      } finally {
        rdr.releaseLock();
      }
    })();
  }

  private scheduleReconnect() {
    if (
      this.retryCount >= this.maxRetries ||
      !this.url ||
      !this.port ||
      !this.onClose
    ) {
      this.onClose?.();
      this.retryCount = 0;
      return;
    }
    const delay = Math.min(2 ** this.retryCount * 1000, 30_000);
    this.retryCount++;
    this.reconnectTimer = setTimeout(async () => {
      const ok = await this.connect(
        this.url!,
        this.port!,
        this.onClose!,
      );
      if (!ok) {this.scheduleReconnect();}
    }, delay);
  }
}
