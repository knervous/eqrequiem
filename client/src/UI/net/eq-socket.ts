import { Int } from "@game/Net/internal/api/capnp/common";
import { OpCodes } from "@game/Net/opcodes";
import * as capnp    from "capnp-ts";

import { MessageType } from "@protobuf-ts/runtime";
import * as $ from "capnp-es";
import { JWTResponse } from "@game/Net/internal/api/capnp/world";

// Define interfaces for WebTransport options and hash
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

function setStructFields<T extends $.Struct>(struct: T, data: Partial<Record<keyof T, any>>) {
  for (const [key, value] of Object.entries(data)) {
    if (value !== undefined) {
      // TypeScript ensures key is a valid field of T, and we use 'any' for value to allow flexibility
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
      if (import.meta.env.VITE_LOCAL_DEV === "true") {
        const hash = await fetch(`/api/hash?port=7100&ip=127.0.0.1`).then((r: Response) => r.text());
        this.webtransport = new WebTransport(`https://127.0.0.1/eq`, {
          serverCertificateHashes: [{ algorithm: "sha-256", value: base64ToArrayBuffer(hash) }],
        });
        console.log("Got hash", hash);
      } else {
        this.webtransport = new WebTransport(`https://${url}:${port}/eq`);
      }

      await this.webtransport!.ready;
      this.writer = this.webtransport!.datagrams.writable.getWriter();
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
        await this.writer!.write(buffer);
      } catch (e) {
        console.error("Error sending datagram:", e);
        throw e;
      }
    });

    return this.writeQueue;
  }
  

  // change your signature to accept the actual struct class

  public async sendMessage<T extends $.Struct>(
    opCode: number,
    StructType: Parameters<$.Message["initRoot"]>[0] & { prototype: T },
    messageData: Partial<Record<keyof T, any>>,
  ): Promise<void> {
    const message = new $.Message();
    const root    = message.initRoot(StructType);
    setStructFields(root, messageData);
    const buf     = $.Message.toArrayBuffer(message);
    const opBuf   = new Uint16Array([opCode]).buffer;
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
    const root    = message.initRoot(StructType);
    setStructFields(root, messageData);
    const buf     = $.Message.toArrayBuffer(message);
    const opBuf   = new Uint16Array([opCode]).buffer;
    await this.send(new Uint8Array(concatArrayBuffer(opBuf, buf)));
  }


  public registerOpCodeHandler<T extends $.Struct>(
    opCode: OpCodes,
    StructType: Parameters<$.Message["initRoot"]>[0] & { prototype: T },
    handler: (data: T) => void,
  ): void {
    this.opCodeHandlers[opCode] = (data: Uint8Array) => {
      try {
        const message = new $.Message();
        const root1    = message.initRoot(JWTResponse);
        root1.status = 7;
        const buf     = $.Message.toArrayBuffer(message);

        
        const testReader = new $.Message(buf, false, true);
        const testRoot = testReader.getRoot(JWTResponse);
        {
          const message = new $.Message();
          const root1   = message.initRoot(JWTResponse);
          root1.status  = 7;
          const buf     = $.Message.toArrayBuffer(message);     // <-- has framing header
  
          // 2) parse with framing
          //    • pass a Uint8Array (so we respect its .byteOffset/.byteLength)
          //    • omit ‘singleSegment’ (defaults to false) so capnp-es will parse the header
          const u8         = new Uint8Array(buf);
          const testReader = new $.Message(u8, /* packed= */ false);
          const testRoot   = testReader.getRoot(JWTResponse);
  
        }
        const reader = new $.Message(data, false);
        const root = reader.getRoot(StructType);
        handler(root);
      } catch (e) {
        console.error(`Error decoding Cap’n Proto message for opcode ${opCode}:`, e);
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
          console.log('Done loop');
          this.close();
          onClose();
          break;
        }
        if (value) {
          const opcode = new Uint16Array(value.buffer.slice(0, 2))[0];
          if (this.opCodeHandlers[opcode]) {
            console.log('Handler for datagram opcode', opcode);
            // Call the handler with the rest of the datagram
            console.log(value.buffer);
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
          console.log('Done stream loop');
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
          const newBuffer = new Uint8Array(buffer.length + value.length);
          newBuffer.set(buffer, 0);
          newBuffer.set(value, buffer.length);
          buffer = newBuffer;
  
          // Process messages while we have enough data
          while (buffer.length >= 4) {
            // Read 4-byte length prefix
            const length = new DataView(buffer.buffer).getUint32(0, true); // Little-endian
            if (buffer.length < 4 + length) {
              break; // Wait for more data
            }
  
            // Extract message (opcode + payload)
            const message = buffer.slice(4, 4 + length);
            const opcode = new Uint16Array(message.buffer.slice(0, 2))[0];
            const payload = message.slice(2);
  
            if (this.opCodeHandlers[opcode]) {
              this.opCodeHandlers[opcode](payload);
            } else {
              console.log(`No handler for stream opcode ${opcode}`, payload);
            }
  
            // Remove processed message from buffer
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