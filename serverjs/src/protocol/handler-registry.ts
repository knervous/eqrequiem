export type PacketHandler<TCtx> = (ctx: TCtx) => boolean | void;

export interface RegistryMetrics {
  handled: number;
  unknown: number;
}

export class HandlerRegistry<TCtx> {
  private readonly handlers = new Map<number, PacketHandler<TCtx>>();
  private handledCount = 0;
  private unknownCount = 0;

  register(opcode: number, handler: PacketHandler<TCtx>): void {
    this.handlers.set(opcode, handler);
  }

  dispatch(opcode: number, ctx: TCtx): boolean {
    const handler = this.handlers.get(opcode);
    if (!handler) {
      this.unknownCount += 1;
      return false;
    }

    this.handledCount += 1;
    const result = handler(ctx);
    return result === true;
  }

  has(opcode: number): boolean {
    return this.handlers.has(opcode);
  }

  metrics(): RegistryMetrics {
    return {
      handled: this.handledCount,
      unknown: this.unknownCount,
    };
  }
}
