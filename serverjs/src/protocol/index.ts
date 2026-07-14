export type Opcode = number;

export interface PacketEnvelope {
  opcode: Opcode;
  payload: Uint8Array;
}

export type InboundTransport = 'datagram' | 'control-stream';

export interface InboundPacket extends PacketEnvelope {
  transport: InboundTransport;
  sessionId: number;
}

export function encodePacket(opcode: Opcode, payload: Uint8Array = new Uint8Array(0)): Uint8Array {
  const packet = new Uint8Array(2 + payload.length);
  const view = new DataView(packet.buffer, packet.byteOffset, packet.byteLength);
  view.setUint16(0, opcode, true);
  packet.set(payload, 2);
  return packet;
}

export function decodePacket(packet: Uint8Array): PacketEnvelope | null {
  if (packet.byteLength < 2) {
    return null;
  }

  const view = new DataView(packet.buffer, packet.byteOffset, packet.byteLength);
  const opcode = view.getUint16(0, true);
  return {
    opcode,
    payload: packet.slice(2),
  };
}

export function encodeControlStreamFrame(opcode: Opcode, payload: Uint8Array = new Uint8Array(0)): Uint8Array {
  const packet = encodePacket(opcode, payload);
  const frame = new Uint8Array(4 + packet.byteLength);
  const frameView = new DataView(frame.buffer, frame.byteOffset, frame.byteLength);
  frameView.setUint32(0, packet.byteLength, true);
  frame.set(packet, 4);
  return frame;
}

export class ControlFrameAssembler {
  private buffer: Uint8Array<ArrayBufferLike> = new Uint8Array(0);

  push(chunk: Uint8Array): Uint8Array[] {
    this.buffer = concatUint8(this.buffer, chunk);
    const frames: Uint8Array[] = [];

    while (this.buffer.byteLength >= 4) {
      const view = new DataView(this.buffer.buffer, this.buffer.byteOffset, this.buffer.byteLength);
      const frameLen = view.getUint32(0, true);

      if (frameLen === 0) {
        throw new Error('Invalid control frame length 0');
      }

      const frameEnd = 4 + frameLen;
      if (this.buffer.byteLength < frameEnd) {
        break;
      }

      frames.push(this.buffer.slice(4, frameEnd));
      this.buffer = this.buffer.slice(frameEnd);
    }

    return frames;
  }
}

function concatUint8(a: Uint8Array, b: Uint8Array): Uint8Array {
  if (a.byteLength === 0) {
    const copy = new Uint8Array(new ArrayBuffer(b.byteLength));
    copy.set(b, 0);
    return copy;
  }
  if (b.byteLength === 0) {
    const copy = new Uint8Array(new ArrayBuffer(a.byteLength));
    copy.set(a, 0);
    return copy;
  }

  const merged = new Uint8Array(new ArrayBuffer(a.byteLength + b.byteLength));
  merged.set(a, 0);
  merged.set(b, a.byteLength);
  return merged;
}
