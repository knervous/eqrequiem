import { MessageType } from "@protobuf-ts/runtime";

// Define interfaces for WebTransport options and hash
interface CertificateHash {
  algorithm: "sha-256";
  value: ArrayBuffer;
}

interface WebTransportOptions {
  serverCertificateHashes?: CertificateHash[];
}

interface WebTransport {
  datagrams: {
    writable: WritableStream<Uint8Array>;
    readable: ReadableStream<Uint8Array>;
  };
  incomingBidirectionalStreams: ReadableStream<{
    readable: ReadableStream<Uint8Array>;
    writable: WritableStream<Uint8Array>;
  }>;
  ready: Promise<void>;
  closed: Promise<boolean>;
  close(): void;
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

  constructor() {
    this.close = this.close.bind(this);
    window.addEventListener("beforeunload", this.close);
  }

  public async connect(
    url: string,
    port: number | string,
    onClose: () => void,
  ): Promise<boolean> {
    const WebTransport = (window as any).WebTransport;
    if (!WebTransport) {
      console.error("WebTransport not supported");
      return false;
    }

    console.log(`Connecting via WebTransport to: ${port}`);
    if (this.webtransport !== null && !(await this.webtransport.closed)) {
      console.log("Clearing webtransport");
      this.close();
    }

    try {
      if (import.meta.env.VITE_LOCAL_WT === "true") {
        const hash = await fetch(`/api/hash?port=7100&ip=127.0.0.1`).then((r: Response) => r.text());
        this.webtransport = new WebTransport(`https://127.0.0.1/eq`, {
          serverCertificateHashes: [{ algorithm: "sha-256", value: base64ToArrayBuffer(hash) }],
        });
        console.log("Got hash", hash);
      } else {
        this.webtransport = new WebTransport(`https://${url}:${port}/eq`);
      }

      await this.webtransport.ready;
      this.writer = this.webtransport.datagrams.writable.getWriter();
      this.isConnected = true;
    } catch (e) {
      console.warn("Error connecting socket:", e);
      this.close();
      return false;
    }

    // Start datagram read loop
    this.readLoop(onClose).catch((e) => {
      console.warn("Error in datagram read loop:", e);
      this.close();
      onClose();
    });

    // Start stream read loop
    this.streamReadLoop(onClose).catch((e) => {
      console.warn("Error in stream read loop:", e);
      this.close();
      onClose();
    });

    return true;
  }

  // Send data over datagrams
  public async send(buffer: Uint8Array): Promise<void> {
    if (!this.webtransport || !this.writer) {
      console.error("Sending from an unopen socket");
      throw new Error("Socket not connected");
    }

    this.writeQueue = this.writeQueue.then(async () => {
      try {
        await this.writer.write(buffer);
      } catch (e) {
        console.error("Error sending datagram:", e);
        throw e;
      }
    });

    return this.writeQueue;
  }

  // Send message over datagrams
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

  // Send message over streams
  public async sendStreamMessage<T extends object>(
    opCode: number,
    messageType: MessageType<T>,
    messageData: Partial<T>,
  ): Promise<void> {
    if (!this.webtransport) {
      console.error("Sending stream from an unopen socket");
      throw new Error("Socket not connected");
    }

    const message = messageType.create(messageData);
    const messageBuffer = messageType.toBinary(message);
    const opcodeBuffer = new Uint16Array([opCode]).buffer;
    const combinedBuffer = concatArrayBuffer(opcodeBuffer, messageBuffer.buffer);

    try {
      // Open a new unidirectional stream
      const stream = await this.webtransport.createUnidirectionalStream();
      const writer = stream.getWriter();
      await writer.write(new Uint8Array(combinedBuffer));
      await writer.close();
    } catch (e) {
      console.error("Error sending stream message:", e);
      throw e;
    }
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
      console.log("Closing WebTransport");
      this.webtransport.close();
      this.webtransport = null;
    }
  }

  // Datagram read loop
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
  private async streamReadLoop(onClose: () => void): Promise<void> {
    if (!this.webtransport) return;

    const streamReader = this.webtransport.incomingBidirectionalStreams.getReader();

    try {
      while (true) {
        const { value: stream, done } = await streamReader.read();
        if (done) {
          this.close();
          onClose();
          break;
        }
        if (stream) {
          // Process the stream in a separate async function to allow concurrent stream handling
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
          // Append new data to buffer
          const newBuffer = new Uint8Array(buffer.length + value.length);
          newBuffer.set(buffer, 0);
          newBuffer.set(value, buffer.length);
          buffer = newBuffer;

          // Process complete messages (assuming opcode + payload)
          while (buffer.length >= 2) {
            const opcode = new Uint16Array(buffer.buffer.slice(0, 2))[0];
            // Assume the rest is the payload (no length prefix for simplicity)
            // If your server sends a length prefix, adjust accordingly
            const payload = buffer.slice(2);
            if (this.opCodeHandlers[opcode]) {
              this.opCodeHandlers[opcode](payload);
            } else {
              console.log(`No handler for stream opcode ${opcode}`, payload);
            }
            // For simplicity, assume one message per stream
            // If multiple messages are sent, add length prefix and loop
            break;
          }
          // Clear buffer if processed
          buffer = new Uint8Array(0);
        }
      }
    } catch (e) {
      console.error("Error reading stream:", e);
      throw e;
    } finally {
      reader.releaseLock();
      // Close the writable side if not needed
      const writer = writable.getWriter();
      await writer.close();
    }
  }
}