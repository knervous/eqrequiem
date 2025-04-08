import { MessageType } from "@protobuf-ts/runtime";

// Define interfaces for WebTransport options and hash
interface CertificateHash {
  algorithm: 'sha-256';
  value: ArrayBuffer;
}

interface WebTransportOptions {
  serverCertificateHashes?: CertificateHash[];
}

// Type for the WebTransport constructor (you might need to adjust based on actual WebTransport type)
interface WebTransportConstructor {
  new(url: string, options?: WebTransportOptions): WebTransport;
}

interface WebTransport {
  datagrams: {
    writable: WritableStream<Uint8Array>;
    readable: ReadableStream<Uint8Array>;
  };
  ready: Promise<void>;
  closed: Promise<boolean>;
  close(): void;
}

// Utility function with explicit return type
function base64ToArrayBuffer(base64: string): ArrayBuffer {
  const binaryString = atob(base64);
  const bytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes.buffer;
}

function concatArrayBuffer(buffer1: ArrayBuffer, buffer2: ArrayBuffer) {
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
  private writeQueue: Promise<void> = Promise.resolve(); // Tracks the chain of writes

  constructor() {
    this.close = this.close.bind(this);
    window.addEventListener('beforeunload', this.close);
  }

  // Initialize the writer when connecting
  public async connect(
    url: string,
    port: number | string,
    onClose: () => void,
  ): Promise<boolean> {
    const WebTransport = (window as any).WebTransport as WebTransportConstructor;
    if (!WebTransport) {
      return false;
    }

    console.log(`Connecting via WebTransport to: ${port}`);
    if (this.webtransport !== null && !(await this.webtransport.closed)) {
      console.log('Clearing webtransport');
      this.close();
    }

    try {
      if (import.meta.env.LOCAL_WT === 'true') {
        const hash = await fetch(`/api/hash?port=${+port + 1}&ip=${url}`).then((r: Response) => r.text());
        this.webtransport = new WebTransport(`https://${url}:${port}/eq`, {
          serverCertificateHashes: [{ algorithm: 'sha-256', value: base64ToArrayBuffer(hash) }],
        });
      } else {
        this.webtransport = new WebTransport(`https://${url}:${port}/eq`);
      }

      await this.webtransport.ready;
      this.writer = this.webtransport.datagrams.writable.getWriter(); // Grab writer once
      this.isConnected = true;
    } catch (e) {
      console.warn('Error connecting socket:', e);
      this.close();
      return false;
    }

    this.readLoop(onClose).catch((e) => {
      console.warn('Error in read loop:', e);
      this.close();
      onClose();
    });

    return true;
  }

  // Queue-based send method
  public async send(buffer: Uint8Array): Promise<void> {
    if (!this.webtransport || !this.writer) {
      console.error('Sending from an unopen socket');
      throw new Error('Socket not connected');
    }

    // Chain the write operation onto the existing queue
    this.writeQueue = this.writeQueue.then(async () => {
      try {
        await this.writer.write(buffer);
      } catch (e) {
        console.error('Error sending data:', e);
        throw e;
      }
    });

    return this.writeQueue; // Return the promise so the caller can await if needed
  }

  public async sendMessage<T extends object>(
    opCode: number,
    messageType: MessageType<T>,
    messageData: Partial<T>,
  ): Promise<void> {
    const message = messageType.create(messageData);
    const messageBuffer = messageType.toBinary(message);
    const opcodeBuffer = new Uint16Array([opCode]).buffer;
    const combinedBuffer = concatArrayBuffer(opcodeBuffer, messageBuffer.buffer);
    await this.send(new Uint8Array(combinedBuffer));
  }

  public registerOpCodeHandler<T extends object>(
    opCode: number,
    messageType: MessageType<T>,
    handler: (data: T) => void,
  ): void {
    this.opCodeHandlers[opCode] = (data: Uint8Array) => {
      try {
        const decoded = messageType.fromBinary(data);
        handler(decoded);
      } catch (e) {
        console.error(`Error decoding message for opcode ${opCode}:`, e);
      }
    };
  }

  public close(): void {
    this.isConnected = false;
    if (this.writer) {
      this.writer.releaseLock();
      this.writer = null;
    }
    if (this.webtransport) {
      console.log('Closing WebTransport');
      this.webtransport.close();
      this.webtransport = null;
    }
  }

  private async readLoop(onClose: () => void): Promise<void> {
    if (!this.webtransport) return;

    const reader = this.webtransport.datagrams.readable.getReader();

    try {
      while (true) {
        const { value, done } = await reader.read();
        if (done) {
          this.close();
          onClose();
          break;
        }
        if (value) {
          const opcode = new Uint16Array(value.buffer.slice(0, 2))[0];
          if (this.opCodeHandlers[opcode]) {
            this.opCodeHandlers[opcode](value.slice(2, value.length));
          } else {
            console.log(`No handler for opcode ${opcode}`, value);
          }
        }
      }
    } catch (e) {
      console.log('Error in readLoop:', e);
      throw e;
    } finally {
      reader.releaseLock();
    }
  }
}