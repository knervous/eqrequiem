import { LocalBackendConnection } from "@/LocalBackend/connection";
import { isLocalBackendEnabled } from "@/LocalBackend/config";
function base64ToBytes(base64) {
    const normalized = base64.trim();
    if (normalized.length !== 44) {
        throw new Error(`Invalid cert hash length ${normalized.length}; expected 44 base64 chars`);
    }
    const binaryString = atob(normalized);
    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
        bytes[i] = binaryString.charCodeAt(i);
    }
    if (bytes.length !== 32) {
        throw new Error(`Invalid cert hash byte length ${bytes.length}; expected 32`);
    }
    return bytes;
}
function exactArrayBuffer(bytes) {
    // Ensure a tightly-sized buffer regardless of underlying view offset/length.
    return Uint8Array.from(bytes).buffer;
}
function concatUint8(a, b) {
    const c = new Uint8Array(a.length + b.length);
    c.set(a, 0);
    c.set(b, a.length);
    return c;
}
function envValue(name) {
    const value = import.meta.env[name];
    if (typeof value !== "string") {
        return null;
    }
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
}
function webTransportTarget(fallbackHost, fallbackPort) {
    return {
        host: envValue("VITE_WT_HOST") ?? fallbackHost,
        port: envValue("VITE_WT_PORT") ?? String(fallbackPort),
        path: envValue("VITE_WT_PATH") ?? "/game",
    };
}
function hashLookupTarget(transportHost, transportPort) {
    return {
        host: envValue("VITE_WT_HASH_HOST") ?? transportHost,
        port: envValue("VITE_WT_HASH_PORT") ?? transportPort,
    };
}
function boolEnv(name, fallback) {
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
    localBackend = null;
    connectingLocalBackend = null;
    localConnectPromise = null;
    webtransport = null;
    datagramWriter = null;
    controlWriter = null;
    writeQueue = Promise.resolve();
    opCodeHandlers = {};
    isConnected = false;
    onClose = null;
    // Reconnect
    url = null;
    port = null;
    sessionId = null;
    allowReconnect;
    maxRetries;
    retryCount = 0;
    reconnectTimer = null;
    constructor(config = {}) {
        this.allowReconnect = config.allowReconnect ?? true;
        this.maxRetries = config.maxRetries ?? 2;
        this.close = this.close.bind(this);
        window.addEventListener("beforeunload", () => this.close(false));
    }
    setSessionId(id) {
        this.sessionId = id;
    }
    async connect(url, port, onClose) {
        this.url = url;
        this.port = port;
        this.onClose = onClose;
        if (url === "local" || isLocalBackendEnabled()) {
            if (this.isConnected && this.localBackend)
                return true;
            if (this.localConnectPromise)
                return this.localConnectPromise;
            const pending = this.connectLocalBackend();
            this.localConnectPromise = pending;
            const clearPending = () => {
                if (this.localConnectPromise === pending) {
                    this.localConnectPromise = null;
                }
            };
            void pending.then(clearPending, clearPending);
            return pending;
        }
        const WT = window.WebTransport;
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
                        .then((r) => r.text())
                        .then((value) => value.trim());
                    if (!hash) {
                        throw new Error(`Missing server certificate hash for ${hashTarget.host}:${hashTarget.port}.` +
                            " Set VITE_WT_HASH_HOST/VITE_WT_HASH_PORT or expose /hash on the target.");
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
                }
                else {
                    // Trusted local cert workflow (mkcert/keychain); do not rely on hash pinning.
                    console.log("[WT] Opening transport without cert hash (VITE_WT_USE_CERT_HASH=false)", {
                        transportUrl,
                    });
                    this.webtransport = new WebTransport(transportUrl, {
                        allowPooling: false,
                    });
                }
            }
            else {
                this.webtransport = new WebTransport(transportUrl);
            }
            // wait for handshake
            await this.webtransport.ready;
            // ——— datagram writer & loop ———
            this.datagramWriter = this.webtransport.datagrams.writable.getWriter();
            this.startDatagramLoop();
            console.log("Datagram writer started", this.datagramWriter);
            // Accept server-opened control stream(s)
            const streamReader = this.webtransport.incomingBidirectionalStreams.getReader();
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
        }
        catch (e) {
            console.warn("Connect failed:", e);
            this.scheduleReconnect();
            return false;
        }
    }
    /** Fire-and-forget datagram */
    async sendMessage(opCode, codec, data) {
        const buf = codec && data ? codec.encode(data) : new Uint8Array(0);
        const op = new Uint16Array([opCode]).buffer;
        const packet = concatUint8(new Uint8Array(op), buf);
        await this.sendDatagram(packet);
    }
    /** Reliable, ordered “stream” message */
    async sendStreamMessage(opCode, codec, data) {
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
        const frame = concatUint8(new Uint8Array(header), concatUint8(new Uint8Array(op), payload));
        await this.controlWriter.write(frame);
    }
    registerOpCodeHandler(opCode, codec, handler) {
        this.opCodeHandlers[opCode] = (buf) => {
            try {
                const result = handler(codec.decode(buf));
                if (result instanceof Promise) {
                    void result.catch((error) => {
                        console.error(`Async handler error for opcode ${opCode}:`, error);
                    });
                }
            }
            catch (e) {
                console.error(`Decode error for opcode ${opCode}:`, e);
            }
        };
    }
    registerRawOpCodeHandler(opCode, handler) {
        this.opCodeHandlers[opCode] = handler;
    }
    close(scheduleReconnect = true) {
        this.isConnected = false;
        void this.connectingLocalBackend?.close();
        this.connectingLocalBackend = null;
        void this.localBackend?.close();
        this.localBackend = null;
        this.datagramWriter?.releaseLock();
        this.controlWriter?.releaseLock();
        this.webtransport?.close();
        this.webtransport = null;
        this.datagramWriter = null;
        this.controlWriter = null;
        if (scheduleReconnect && this.allowReconnect) {
            this.scheduleReconnect();
        }
        else {
            this.clearReconnectTimer();
            this.onClose?.();
        }
    }
    // ——— private helpers ———
    async connectLocalBackend() {
        const previousBackend = this.localBackend;
        this.localBackend = null;
        await previousBackend?.close();
        const localBackend = new LocalBackendConnection();
        this.connectingLocalBackend = localBackend;
        localBackend.onPacket((opcode, payload) => this.opCodeHandlers[opcode]?.(payload));
        try {
            const info = await localBackend.connect();
            if (this.connectingLocalBackend !== localBackend) {
                await localBackend.close();
                return false;
            }
            this.connectingLocalBackend = null;
            this.localBackend = localBackend;
            this.isConnected = true;
            this.retryCount = 0;
            this.clearReconnectTimer();
            console.info("[local-backend] connected", info);
            return true;
        }
        catch (error) {
            console.error("[local-backend] connection failed", error);
            await localBackend.close();
            if (this.connectingLocalBackend === localBackend) {
                this.connectingLocalBackend = null;
            }
            if (this.localBackend === localBackend) {
                this.localBackend = null;
            }
            return false;
        }
    }
    async sendDatagram(buf) {
        if (this.localBackend) {
            if (buf.byteLength < 2) {
                throw new Error("Local backend packet is missing its opcode");
            }
            const opcode = new DataView(buf.buffer, buf.byteOffset, buf.byteLength).getUint16(0, true);
            this.localBackend.send("datagram", opcode, buf.slice(2));
            return;
        }
        if (!this.datagramWriter) {
            return;
        }
        this.writeQueue = this.writeQueue.then(() => this.datagramWriter.write(buf));
        return this.writeQueue;
    }
    startDatagramLoop() {
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
            }
            catch (e) {
                console.error("Datagram loop error:", e);
            }
            finally {
                rdr.releaseLock();
            }
        })();
    }
    startControlReadLoop(stream) {
        const rdr = stream.getReader();
        let buffer = new Uint8Array(0);
        (async () => {
            try {
                while (true) {
                    const { value, done } = await rdr.read();
                    if (done) {
                        break;
                    }
                    buffer = concatUint8(buffer, value);
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
            }
            catch (e) {
                console.error("Control stream loop error:", e);
            }
            finally {
                rdr.releaseLock();
            }
        })();
    }
    scheduleReconnect() {
        if (this.reconnectTimer) {
            return;
        }
        if (this.retryCount >= this.maxRetries ||
            !this.url ||
            !this.port ||
            !this.onClose) {
            this.clearReconnectTimer();
            this.onClose?.();
            this.retryCount = 0;
            return;
        }
        const delay = Math.min(2 ** this.retryCount * 1000, 30_000);
        this.retryCount++;
        this.reconnectTimer = setTimeout(async () => {
            this.reconnectTimer = null;
            const ok = await this.connect(this.url, this.port, this.onClose);
            // connect() owns retry scheduling on failure; avoid stacking extra timers here.
            if (!ok) {
            }
        }, delay);
    }
    clearReconnectTimer() {
        if (!this.reconnectTimer) {
            return;
        }
        clearTimeout(this.reconnectTimer);
        this.reconnectTimer = null;
    }
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZXEtc29ja2V0LmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsiZXEtc29ja2V0LnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUVBLE9BQU8sRUFBRSxzQkFBc0IsRUFBRSxNQUFNLDJCQUEyQixDQUFDO0FBQ25FLE9BQU8sRUFBRSxxQkFBcUIsRUFBRSxNQUFNLHVCQUF1QixDQUFDO0FBOEI5RCxTQUFTLGFBQWEsQ0FBQyxNQUFjO0lBQ25DLE1BQU0sVUFBVSxHQUFHLE1BQU0sQ0FBQyxJQUFJLEVBQUUsQ0FBQztJQUNqQyxJQUFJLFVBQVUsQ0FBQyxNQUFNLEtBQUssRUFBRSxFQUFFLENBQUM7UUFDN0IsTUFBTSxJQUFJLEtBQUssQ0FDYiw0QkFBNEIsVUFBVSxDQUFDLE1BQU0sNEJBQTRCLENBQzFFLENBQUM7SUFDSixDQUFDO0lBQ0QsTUFBTSxZQUFZLEdBQUcsSUFBSSxDQUFDLFVBQVUsQ0FBQyxDQUFDO0lBQ3RDLE1BQU0sS0FBSyxHQUFHLElBQUksVUFBVSxDQUFDLFlBQVksQ0FBQyxNQUFNLENBQUMsQ0FBQztJQUNsRCxLQUFLLElBQUksQ0FBQyxHQUFHLENBQUMsRUFBRSxDQUFDLEdBQUcsWUFBWSxDQUFDLE1BQU0sRUFBRSxDQUFDLEVBQUUsRUFBRSxDQUFDO1FBQzdDLEtBQUssQ0FBQyxDQUFDLENBQUMsR0FBRyxZQUFZLENBQUMsVUFBVSxDQUFDLENBQUMsQ0FBQyxDQUFDO0lBQ3hDLENBQUM7SUFDRCxJQUFJLEtBQUssQ0FBQyxNQUFNLEtBQUssRUFBRSxFQUFFLENBQUM7UUFDeEIsTUFBTSxJQUFJLEtBQUssQ0FDYixpQ0FBaUMsS0FBSyxDQUFDLE1BQU0sZUFBZSxDQUM3RCxDQUFDO0lBQ0osQ0FBQztJQUNELE9BQU8sS0FBSyxDQUFDO0FBQ2YsQ0FBQztBQUVELFNBQVMsZ0JBQWdCLENBQUMsS0FBaUI7SUFDekMsNkVBQTZFO0lBQzdFLE9BQU8sVUFBVSxDQUFDLElBQUksQ0FBQyxLQUFLLENBQUMsQ0FBQyxNQUFNLENBQUM7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LENBQUMsSUFBSSxDQUFDLE9BQU8sRUFDYixDQUFDO1lBQ0QsSUFBSSxDQUFDLG1CQUFtQixFQUFFLENBQUM7WUFDM0IsSUFBSSxDQUFDLE9BQU8sRUFBRSxFQUFFLENBQUM7WUFDakIsSUFBSSxDQUFDLFVBQVUsR0FBRyxDQUFDLENBQUM7WUFDcEIsT0FBTztRQUNULENBQUM7UUFDRCxNQUFNLEtBQUssR0FBRyxJQUFJLENBQUMsR0FBRyxDQUFDLENBQUMsSUFBSSxJQUFJLENBQUMsVUFBVSxHQUFHLElBQUksRUFBRSxNQUFNLENBQUMsQ0FBQztRQUM1RCxJQUFJLENBQUMsVUFBVSxFQUFFLENBQUM7UUFDbEIsSUFBSSxDQUFDLGNBQWMsR0FBRyxVQUFVLENBQUMsS0FBSyxJQUFJLEVBQUU7WUFDMUMsSUFBSSxDQUFDLGNBQWMsR0FBRyxJQUFJLENBQUM7WUFDM0IsTUFBTSxFQUFFLEdBQUcsTUFBTSxJQUFJLENBQUMsT0FBTyxDQUFDLElBQUksQ0FBQyxHQUFJLEVBQUUsSUFBSSxDQUFDLElBQUssRUFBRSxJQUFJLENBQUMsT0FBUSxDQUFDLENBQUM7WUFDcEUsZ0ZBQWdGO1lBQ2hGLElBQUksQ0FBQyxFQUFFLEVBQUUsQ0FBQztZQUNWLENBQUM7UUFDSCxDQUFDLEVBQUUsS0FBSyxDQUFDLENBQUM7SUFDWixDQUFDO0lBRU8sbUJBQW1CO1FBQ3pCLElBQUksQ0FBQyxJQUFJLENBQUMsY0FBYyxFQUFFLENBQUM7WUFDekIsT0FBTztRQUNULENBQUM7UUFDRCxZQUFZLENBQUMsSUFBSSxDQUFDLGNBQWMsQ0FBQyxDQUFDO1FBQ2xDLElBQUksQ0FBQyxjQUFjLEdBQUcsSUFBSSxDQUFDO0lBQzdCLENBQUM7Q0FDRiIsInNvdXJjZXNDb250ZW50IjpbImltcG9ydCB7IE9wQ29kZXMgfSBmcm9tIFwiQGdhbWUvTmV0L29wY29kZXNcIjtcbmltcG9ydCB0eXBlIHsgTmV0TWVzc2FnZUNvZGVjIH0gZnJvbSBcIkBnYW1lL05ldC9tZXNzYWdlc1wiO1xuaW1wb3J0IHsgTG9jYWxCYWNrZW5kQ29ubmVjdGlvbiB9IGZyb20gXCJAL0xvY2FsQmFja2VuZC9jb25uZWN0aW9uXCI7XG5pbXBvcnQgeyBpc0xvY2FsQmFja2VuZEVuYWJsZWQgfSBmcm9tIFwiQC9Mb2NhbEJhY2tlbmQvY29uZmlnXCI7XG5cbmludGVyZmFjZSBXZWJUcmFuc3BvcnRPcHRpb25zIHtcbiAgc2VydmVyQ2VydGlmaWNhdGVIYXNoZXM/OiBBcnJheTx7XG4gICAgYWxnb3JpdGhtOiBcInNoYS0yNTZcIjtcbiAgICB2YWx1ZTogQnVmZmVyU291cmNlO1xuICB9PjtcbiAgcmVxdWlyZVVucmVsaWFibGU/OiBib29sZWFuO1xuICBhbGxvd1Bvb2xpbmc/OiBib29sZWFuO1xuICBjb25nZXN0aW9uQ29udHJvbD86IFwiZGVmYXVsdFwiIHwgXCJsb3ctbGF0ZW5jeVwiIHwgXCJ0aHJvdWdocHV0XCI7XG59XG5cbmludGVyZmFjZSBXZWJUcmFuc3BvcnQge1xuICByZWFkb25seSBkYXRhZ3JhbXM6IHtcbiAgICByZWFkb25seSB3cml0YWJsZTogV3JpdGFibGVTdHJlYW08VWludDhBcnJheT47XG4gICAgcmVhZG9ubHkgcmVhZGFibGU6IFJlYWRhYmxlU3RyZWFtPFVpbnQ4QXJyYXk+O1xuICB9O1xuICByZWFkb25seSBpbmNvbWluZ0JpZGlyZWN0aW9uYWxTdHJlYW1zOiBSZWFkYWJsZVN0cmVhbTx7XG4gICAgcmVhZGFibGU6IFJlYWRhYmxlU3RyZWFtPFVpbnQ4QXJyYXk+O1xuICAgIHdyaXRhYmxlOiBXcml0YWJsZVN0cmVhbTxVaW50OEFycmF5PjtcbiAgfT47XG4gIHJlYWRvbmx5IHJlYWR5OiBQcm9taXNlPHZvaWQ+O1xuICByZWFkb25seSBjbG9zZWQ6IFByb21pc2U8eyByZWFzb24/OiBzdHJpbmc7IGNsb3NlQ29kZT86IG51bWJlciB9PjtcbiAgY2xvc2UoY2xvc2VJbmZvPzogeyBjbG9zZUNvZGU/OiBudW1iZXI7IHJlYXNvbj86IHN0cmluZyB9KTogdm9pZDtcbiAgY3JlYXRlQmlkaXJlY3Rpb25hbFN0cmVhbSgpOiBQcm9taXNlPHtcbiAgICByZWFkYWJsZTogUmVhZGFibGVTdHJlYW08VWludDhBcnJheT47XG4gICAgd3JpdGFibGU6IFdyaXRhYmxlU3RyZWFtPFVpbnQ4QXJyYXk+O1xuICB9Pjtcbn1cblxuZnVuY3Rpb24gYmFzZTY0VG9CeXRlcyhiYXNlNjQ6IHN0cmluZyk6IFVpbnQ4QXJyYXkge1xuICBjb25zdCBub3JtYWxpemVkID0gYmFzZTY0LnRyaW0oKTtcbiAgaWYgKG5vcm1hbGl6ZWQubGVuZ3RoICE9PSA0NCkge1xuICAgIHRocm93IG5ldyBFcnJvcihcbiAgICAgIGBJbnZhbGlkIGNlcnQgaGFzaCBsZW5ndGggJHtub3JtYWxpemVkLmxlbmd0aH07IGV4cGVjdGVkIDQ0IGJhc2U2NCBjaGFyc2AsXG4gICAgKTtcbiAgfVxuICBjb25zdCBiaW5hcnlTdHJpbmcgPSBhdG9iKG5vcm1hbGl6ZWQpO1xuICBjb25zdCBieXRlcyA9IG5ldyBVaW50OEFycmF5KGJpbmFyeVN0cmluZy5sZW5ndGgpO1xuICBmb3IgKGxldCBpID0gMDsgaSA8IGJpbmFyeVN0cmluZy5sZW5ndGg7IGkrKykge1xuICAgIGJ5dGVzW2ldID0gYmluYXJ5U3RyaW5nLmNoYXJDb2RlQXQoaSk7XG4gIH1cbiAgaWYgKGJ5dGVzLmxlbmd0aCAhPT0gMzIpIHtcbiAgICB0aHJvdyBuZXcgRXJyb3IoXG4gICAgICBgSW52YWxpZCBjZXJ0IGhhc2ggYnl0ZSBsZW5ndGggJHtieXRlcy5sZW5ndGh9OyBleHBlY3RlZCAzMmAsXG4gICAgKTtcbiAgfVxuICByZXR1cm4gYnl0ZXM7XG59XG5cbmZ1bmN0aW9uIGV4YWN0QXJyYXlCdWZmZXIoYnl0ZXM6IFVpbnQ4QXJyYXkpOiBBcnJheUJ1ZmZlciB7XG4gIC8vIEVuc3VyZSBhIHRpZ2h0bHktc2l6ZWQgYnVmZmVyIHJlZ2FyZGxlc3Mgb2YgdW5kZXJseWluZyB2aWV3IG9mZnNldC9sZW5ndGguXG4gIHJldHVybiBVaW50OEFycmF5LmZyb20oYnl0ZXMpLmJ1ZmZlcjtcbn1cblxuZnVuY3Rpb24gY29uY2F0VWludDgoYTogVWludDhBcnJheSwgYjogVWludDhBcnJheSk6IFVpbnQ4QXJyYXkge1xuICBjb25zdCBjID0gbmV3IFVpbnQ4QXJyYXkoYS5sZW5ndGggKyBiLmxlbmd0aCk7XG4gIGMuc2V0KGEsIDApO1xuICBjLnNldChiLCBhLmxlbmd0aCk7XG4gIHJldHVybiBjO1xufVxuXG5mdW5jdGlvbiBlbnZWYWx1ZShuYW1lOiBzdHJpbmcpOiBzdHJpbmcgfCBudWxsIHtcbiAgY29uc3QgdmFsdWUgPSAoaW1wb3J0Lm1ldGEuZW52IGFzIFJlY29yZDxzdHJpbmcsIHVua25vd24+KVtuYW1lXTtcbiAgaWYgKHR5cGVvZiB2YWx1ZSAhPT0gXCJzdHJpbmdcIikge1xuICAgIHJldHVybiBudWxsO1xuICB9XG5cbiAgY29uc3QgdHJpbW1lZCA9IHZhbHVlLnRyaW0oKTtcbiAgcmV0dXJuIHRyaW1tZWQubGVuZ3RoID4gMCA/IHRyaW1tZWQgOiBudWxsO1xufVxuXG5mdW5jdGlvbiB3ZWJUcmFuc3BvcnRUYXJnZXQoXG4gIGZhbGxiYWNrSG9zdDogc3RyaW5nLFxuICBmYWxsYmFja1BvcnQ6IG51bWJlciB8IHN0cmluZyxcbik6IHsgaG9zdDogc3RyaW5nOyBwb3J0OiBzdHJpbmc7IHBhdGg6IHN0cmluZyB9IHtcbiAgcmV0dXJuIHtcbiAgICBob3N0OiBlbnZWYWx1ZShcIlZJVEVfV1RfSE9TVFwiKSA/PyBmYWxsYmFja0hvc3QsXG4gICAgcG9ydDogZW52VmFsdWUoXCJWSVRFX1dUX1BPUlRcIikgPz8gU3RyaW5nKGZhbGxiYWNrUG9ydCksXG4gICAgcGF0aDogZW52VmFsdWUoXCJWSVRFX1dUX1BBVEhcIikgPz8gXCIvZ2FtZVwiLFxuICB9O1xufVxuXG5mdW5jdGlvbiBoYXNoTG9va3VwVGFyZ2V0KFxuICB0cmFuc3BvcnRIb3N0OiBzdHJpbmcsXG4gIHRyYW5zcG9ydFBvcnQ6IHN0cmluZyxcbik6IHsgaG9zdDogc3RyaW5nOyBwb3J0OiBzdHJpbmcgfSB7XG4gIHJldHVybiB7XG4gICAgaG9zdDogZW52VmFsdWUoXCJWSVRFX1dUX0hBU0hfSE9TVFwiKSA/PyB0cmFuc3BvcnRIb3N0LFxuICAgIHBvcnQ6IGVudlZhbHVlKFwiVklURV9XVF9IQVNIX1BPUlRcIikgPz8gdHJhbnNwb3J0UG9ydCxcbiAgfTtcbn1cblxuZnVuY3Rpb24gYm9vbEVudihuYW1lOiBzdHJpbmcsIGZhbGxiYWNrOiBib29sZWFuKTogYm9vbGVhbiB7XG4gIGNvbnN0IHZhbHVlID0gZW52VmFsdWUobmFtZSk7XG4gIGlmICh2YWx1ZSA9PT0gbnVsbCkge1xuICAgIHJldHVybiBmYWxsYmFjaztcbiAgfVxuICBpZiAodmFsdWUgPT09IFwidHJ1ZVwiIHx8IHZhbHVlID09PSBcIjFcIiB8fCB2YWx1ZS50b0xvd2VyQ2FzZSgpID09PSBcInllc1wiKSB7XG4gICAgcmV0dXJuIHRydWU7XG4gIH1cbiAgaWYgKHZhbHVlID09PSBcImZhbHNlXCIgfHwgdmFsdWUgPT09IFwiMFwiIHx8IHZhbHVlLnRvTG93ZXJDYXNlKCkgPT09IFwibm9cIikge1xuICAgIHJldHVybiBmYWxzZTtcbiAgfVxuICByZXR1cm4gZmFsbGJhY2s7XG59XG5cbmV4cG9ydCBjbGFzcyBFcVNvY2tldCB7XG4gIHByaXZhdGUgbG9jYWxCYWNrZW5kOiBMb2NhbEJhY2tlbmRDb25uZWN0aW9uIHwgbnVsbCA9IG51bGw7XG4gIHByaXZhdGUgY29ubmVjdGluZ0xvY2FsQmFja2VuZDogTG9jYWxCYWNrZW5kQ29ubmVjdGlvbiB8IG51bGwgPSBudWxsO1xuICBwcml2YXRlIGxvY2FsQ29ubmVjdFByb21pc2U6IFByb21pc2U8Ym9vbGVhbj4gfCBudWxsID0gbnVsbDtcbiAgcHJpdmF0ZSB3ZWJ0cmFuc3BvcnQ6IFdlYlRyYW5zcG9ydCB8IG51bGwgPSBudWxsO1xuICBwcml2YXRlIGRhdGFncmFtV3JpdGVyOiBXcml0YWJsZVN0cmVhbURlZmF1bHRXcml0ZXI8VWludDhBcnJheT4gfCBudWxsID0gbnVsbDtcbiAgcHJpdmF0ZSBjb250cm9sV3JpdGVyOiBXcml0YWJsZVN0cmVhbURlZmF1bHRXcml0ZXI8VWludDhBcnJheT4gfCBudWxsID0gbnVsbDtcbiAgcHJpdmF0ZSB3cml0ZVF1ZXVlOiBQcm9taXNlPHZvaWQ+ID0gUHJvbWlzZS5yZXNvbHZlKCk7XG4gIHByaXZhdGUgb3BDb2RlSGFuZGxlcnM6IHtcbiAgICBbb3Bjb2RlOiBudW1iZXJdOiAocGF5bG9hZDogVWludDhBcnJheSkgPT4gdm9pZDtcbiAgfSA9IHt9O1xuXG4gIHB1YmxpYyBpc0Nvbm5lY3RlZCA9IGZhbHNlO1xuICBwcml2YXRlIG9uQ2xvc2U6ICgoKSA9PiB2b2lkKSB8IG51bGwgPSBudWxsO1xuXG4gIC8vIFJlY29ubmVjdFxuICBwcml2YXRlIHVybDogc3RyaW5nIHwgbnVsbCA9IG51bGw7XG4gIHByaXZhdGUgcG9ydDogbnVtYmVyIHwgc3RyaW5nIHwgbnVsbCA9IG51bGw7XG4gIHByaXZhdGUgc2Vzc2lvbklkOiBudW1iZXIgfCBudWxsID0gbnVsbDtcbiAgcHJpdmF0ZSBhbGxvd1JlY29ubmVjdDogYm9vbGVhbjtcbiAgcHJpdmF0ZSBtYXhSZXRyaWVzOiBudW1iZXI7XG4gIHByaXZhdGUgcmV0cnlDb3VudCA9IDA7XG4gIHByaXZhdGUgcmVjb25uZWN0VGltZXI6IFJldHVyblR5cGU8dHlwZW9mIHNldFRpbWVvdXQ+IHwgbnVsbCA9IG51bGw7XG5cbiAgY29uc3RydWN0b3IoY29uZmlnOiB7IG1heFJldHJpZXM/OiBudW1iZXI7IGFsbG93UmVjb25uZWN0PzogYm9vbGVhbiB9ID0ge30pIHtcbiAgICB0aGlzLmFsbG93UmVjb25uZWN0ID0gY29uZmlnLmFsbG93UmVjb25uZWN0ID8/IHRydWU7XG4gICAgdGhpcy5tYXhSZXRyaWVzID0gY29uZmlnLm1heFJldHJpZXMgPz8gMjtcbiAgICB0aGlzLmNsb3NlID0gdGhpcy5jbG9zZS5iaW5kKHRoaXMpO1xuICAgIHdpbmRvdy5hZGRFdmVudExpc3RlbmVyKFwiYmVmb3JldW5sb2FkXCIsICgpID0+IHRoaXMuY2xvc2UoZmFsc2UpKTtcbiAgfVxuXG4gIHB1YmxpYyBzZXRTZXNzaW9uSWQoaWQ6IG51bWJlcikge1xuICAgIHRoaXMuc2Vzc2lvbklkID0gaWQ7XG4gIH1cblxuICBwdWJsaWMgYXN5bmMgY29ubmVjdChcbiAgICB1cmw6IHN0cmluZyxcbiAgICBwb3J0OiBudW1iZXIgfCBzdHJpbmcsXG4gICAgb25DbG9zZTogKCkgPT4gdm9pZCxcbiAgKTogUHJvbWlzZTxib29sZWFuPiB7XG4gICAgdGhpcy51cmwgPSB1cmw7XG4gICAgdGhpcy5wb3J0ID0gcG9ydDtcbiAgICB0aGlzLm9uQ2xvc2UgPSBvbkNsb3NlO1xuXG4gICAgaWYgKHVybCA9PT0gXCJsb2NhbFwiIHx8IGlzTG9jYWxCYWNrZW5kRW5hYmxlZCgpKSB7XG4gICAgICBpZiAodGhpcy5pc0Nvbm5lY3RlZCAmJiB0aGlzLmxvY2FsQmFja2VuZCkgcmV0dXJuIHRydWU7XG4gICAgICBpZiAodGhpcy5sb2NhbENvbm5lY3RQcm9taXNlKSByZXR1cm4gdGhpcy5sb2NhbENvbm5lY3RQcm9taXNlO1xuXG4gICAgICBjb25zdCBwZW5kaW5nID0gdGhpcy5jb25uZWN0TG9jYWxCYWNrZW5kKCk7XG4gICAgICB0aGlzLmxvY2FsQ29ubmVjdFByb21pc2UgPSBwZW5kaW5nO1xuICAgICAgY29uc3QgY2xlYXJQZW5kaW5nID0gKCkgPT4ge1xuICAgICAgICBpZiAodGhpcy5sb2NhbENvbm5lY3RQcm9taXNlID09PSBwZW5kaW5nKSB7XG4gICAgICAgICAgdGhpcy5sb2NhbENvbm5lY3RQcm9taXNlID0gbnVsbDtcbiAgICAgICAgfVxuICAgICAgfTtcbiAgICAgIHZvaWQgcGVuZGluZy50aGVuKGNsZWFyUGVuZGluZywgY2xlYXJQZW5kaW5nKTtcbiAgICAgIHJldHVybiBwZW5kaW5nO1xuICAgIH1cblxuICAgIGNvbnN0IFdUID0gKHdpbmRvdyBhcyBhbnkpLldlYlRyYW5zcG9ydCBhcyB7XG4gICAgICBuZXcgKHVybDogc3RyaW5nLCBvcHRzPzogV2ViVHJhbnNwb3J0T3B0aW9ucyk6IFdlYlRyYW5zcG9ydDtcbiAgICB9O1xuICAgIGlmICghV1QpIHtcbiAgICAgIGNvbnNvbGUuZXJyb3IoXCJXZWJUcmFuc3BvcnQgbm90IHN1cHBvcnRlZFwiKTtcbiAgICAgIHJldHVybiBmYWxzZTtcbiAgICB9XG5cbiAgICAvLyBpZiBhbHJlYWR5IG9wZW4sIHNodXQgaXQgZG93biBmaXJzdFxuICAgIGlmICh0aGlzLndlYnRyYW5zcG9ydCkge1xuICAgICAgY29uc3QgY2xvc2VkSW5mbyA9IGF3YWl0IHRoaXMud2VidHJhbnNwb3J0LmNsb3NlZC5jYXRjaCgoKSA9PiBudWxsKTtcbiAgICAgIGlmICghY2xvc2VkSW5mbykge1xuICAgICAgICB0aGlzLmNsb3NlKGZhbHNlKTtcbiAgICAgIH1cbiAgICB9XG5cbiAgICB0cnkge1xuICAgICAgY29uc3QgdGFyZ2V0ID0gd2ViVHJhbnNwb3J0VGFyZ2V0KHVybCwgcG9ydCk7XG4gICAgICBjb25zdCB0cmFuc3BvcnRVcmwgPSBgaHR0cHM6Ly8ke3RhcmdldC5ob3N0fToke3RhcmdldC5wb3J0fSR7dGFyZ2V0LnBhdGh9YDtcbiAgICAgIGlmIChpbXBvcnQubWV0YS5lbnYuVklURV9MT0NBTF9ERVYgPT09IFwidHJ1ZVwiKSB7XG4gICAgICAgIGNvbnN0IHVzZUNlcnRIYXNoID0gYm9vbEVudihcIlZJVEVfV1RfVVNFX0NFUlRfSEFTSFwiLCB0cnVlKTtcbiAgICAgICAgaWYgKHVzZUNlcnRIYXNoKSB7XG4gICAgICAgICAgY29uc3QgaGFzaFRhcmdldCA9IGhhc2hMb29rdXBUYXJnZXQodGFyZ2V0Lmhvc3QsIHRhcmdldC5wb3J0KTtcbiAgICAgICAgICBjb25zdCBwYXJhbXMgPSBuZXcgVVJMU2VhcmNoUGFyYW1zKHtcbiAgICAgICAgICAgIGlwOiBoYXNoVGFyZ2V0Lmhvc3QsXG4gICAgICAgICAgICBwb3J0OiBoYXNoVGFyZ2V0LnBvcnQsXG4gICAgICAgICAgfSk7XG4gICAgICAgICAgY29uc29sZS5sb2coXCJbV1RdIFJlcXVlc3RpbmcgY2VydCBoYXNoXCIsIHtcbiAgICAgICAgICAgIGVuZHBvaW50OiBgL2FwaS9oYXNoPyR7cGFyYW1zLnRvU3RyaW5nKCl9YCxcbiAgICAgICAgICAgIHRyYW5zcG9ydFVybCxcbiAgICAgICAgICB9KTtcbiAgICAgICAgICBjb25zdCBoYXNoID0gYXdhaXQgZmV0Y2goYC9hcGkvaGFzaD8ke3BhcmFtcy50b1N0cmluZygpfWApXG4gICAgICAgICAgICAudGhlbigocjogUmVzcG9uc2UpID0+IHIudGV4dCgpKVxuICAgICAgICAgICAgLnRoZW4oKHZhbHVlKSA9PiB2YWx1ZS50cmltKCkpO1xuXG4gICAgICAgICAgaWYgKCFoYXNoKSB7XG4gICAgICAgICAgICB0aHJvdyBuZXcgRXJyb3IoXG4gICAgICAgICAgICAgIGBNaXNzaW5nIHNlcnZlciBjZXJ0aWZpY2F0ZSBoYXNoIGZvciAke2hhc2hUYXJnZXQuaG9zdH06JHtoYXNoVGFyZ2V0LnBvcnR9LmAgK1xuICAgICAgICAgICAgICAgIFwiIFNldCBWSVRFX1dUX0hBU0hfSE9TVC9WSVRFX1dUX0hBU0hfUE9SVCBvciBleHBvc2UgL2hhc2ggb24gdGhlIHRhcmdldC5cIixcbiAgICAgICAgICAgICk7XG4gICAgICAgICAgfVxuICAgICAgICAgIGNvbnN0IGNlcnRIYXNoQnl0ZXMgPSBiYXNlNjRUb0J5dGVzKGhhc2gpO1xuICAgICAgICAgIGNvbnN0IGNlcnRIYXNoQnVmZmVyID0gZXhhY3RBcnJheUJ1ZmZlcihjZXJ0SGFzaEJ5dGVzKTtcblxuICAgICAgICAgIGNvbnNvbGUubG9nKFwiW1dUXSBSZWNlaXZlZCBjZXJ0IGhhc2hcIiwge1xuICAgICAgICAgICAgaGFzaDogeyBhbGdvcml0aG06IFwic2hhLTI1NlwiLCB2YWx1ZTogY2VydEhhc2hCeXRlcyB9LFxuICAgICAgICAgIH0pO1xuICAgICAgICAgIHRoaXMud2VidHJhbnNwb3J0ID0gbmV3IFdlYlRyYW5zcG9ydCh0cmFuc3BvcnRVcmwsIHtcbiAgICAgICAgICAgIC8vIENocm9taXVtIGFjY2VwdHMgQnVmZmVyU291cmNlOyB1c2UgZXhhY3QgQXJyYXlCdWZmZXIgZm9yIG1heGltdW0gY29tcGF0aWJpbGl0eS5cbiAgICAgICAgICAgIHNlcnZlckNlcnRpZmljYXRlSGFzaGVzOiBbXG4gICAgICAgICAgICAgIHsgYWxnb3JpdGhtOiBcInNoYS0yNTZcIiwgdmFsdWU6IGNlcnRIYXNoQnVmZmVyIH0sXG4gICAgICAgICAgICBdLFxuICAgICAgICAgICAgLy8gQXZvaWQgUVVJQyBjb25uZWN0aW9uIHJldXNlIHNvIGNlcnQgaGFzaCBwaW5uaW5nIGFwcGxpZXMgdG8gdGhpcyBzcGVjaWZpYyB0YXJnZXQuXG4gICAgICAgICAgICBhbGxvd1Bvb2xpbmc6IGZhbHNlLFxuICAgICAgICAgIH0pO1xuICAgICAgICAgIGNvbnNvbGUubG9nKFwiW1dUXSBBcHBseWluZyBjZXJ0IGhhc2ggYW5kIG9wZW5pbmcgdHJhbnNwb3J0XCIsIHtcbiAgICAgICAgICAgIHRyYW5zcG9ydFVybCxcbiAgICAgICAgICAgIGhhc2hMZW5ndGg6IGhhc2gubGVuZ3RoLFxuICAgICAgICAgIH0pO1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgIC8vIFRydXN0ZWQgbG9jYWwgY2VydCB3b3JrZmxvdyAobWtjZXJ0L2tleWNoYWluKTsgZG8gbm90IHJlbHkgb24gaGFzaCBwaW5uaW5nLlxuICAgICAgICAgIGNvbnNvbGUubG9nKFxuICAgICAgICAgICAgXCJbV1RdIE9wZW5pbmcgdHJhbnNwb3J0IHdpdGhvdXQgY2VydCBoYXNoIChWSVRFX1dUX1VTRV9DRVJUX0hBU0g9ZmFsc2UpXCIsXG4gICAgICAgICAgICB7XG4gICAgICAgICAgICAgIHRyYW5zcG9ydFVybCxcbiAgICAgICAgICAgIH0sXG4gICAgICAgICAgKTtcbiAgICAgICAgICB0aGlzLndlYnRyYW5zcG9ydCA9IG5ldyBXZWJUcmFuc3BvcnQodHJhbnNwb3J0VXJsLCB7XG4gICAgICAgICAgICBhbGxvd1Bvb2xpbmc6IGZhbHNlLFxuICAgICAgICAgIH0pO1xuICAgICAgICB9XG4gICAgICB9IGVsc2Uge1xuICAgICAgICB0aGlzLndlYnRyYW5zcG9ydCA9IG5ldyBXZWJUcmFuc3BvcnQodHJhbnNwb3J0VXJsKTtcbiAgICAgIH1cblxuICAgICAgLy8gd2FpdCBmb3IgaGFuZHNoYWtlXG4gICAgICBhd2FpdCB0aGlzLndlYnRyYW5zcG9ydC5yZWFkeTtcblxuICAgICAgLy8g4oCU4oCU4oCUIGRhdGFncmFtIHdyaXRlciAmIGxvb3Ag4oCU4oCU4oCUXG4gICAgICB0aGlzLmRhdGFncmFtV3JpdGVyID0gdGhpcy53ZWJ0cmFuc3BvcnQuZGF0YWdyYW1zLndyaXRhYmxlLmdldFdyaXRlcigpO1xuICAgICAgdGhpcy5zdGFydERhdGFncmFtTG9vcCgpO1xuICAgICAgY29uc29sZS5sb2coXCJEYXRhZ3JhbSB3cml0ZXIgc3RhcnRlZFwiLCB0aGlzLmRhdGFncmFtV3JpdGVyKTtcblxuICAgICAgLy8gQWNjZXB0IHNlcnZlci1vcGVuZWQgY29udHJvbCBzdHJlYW0ocylcbiAgICAgIGNvbnN0IHN0cmVhbVJlYWRlciA9XG4gICAgICAgIHRoaXMud2VidHJhbnNwb3J0LmluY29taW5nQmlkaXJlY3Rpb25hbFN0cmVhbXMuZ2V0UmVhZGVyKCk7XG4gICAgICAoYXN5bmMgKCkgPT4ge1xuICAgICAgICB3aGlsZSAodHJ1ZSkge1xuICAgICAgICAgIGNvbnN0IHsgdmFsdWU6IHN0cmVhbSwgZG9uZSB9ID0gYXdhaXQgc3RyZWFtUmVhZGVyLnJlYWQoKTtcbiAgICAgICAgICBpZiAoZG9uZSkge1xuICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgfVxuICAgICAgICAgIGlmICghc3RyZWFtKSB7XG4gICAgICAgICAgICBjb250aW51ZTtcbiAgICAgICAgICB9XG4gICAgICAgICAgLy8gZ3JhYiB3cml0ZXIgJiBzdGFydCByZWFkZXJcbiAgICAgICAgICB0aGlzLmNvbnRyb2xXcml0ZXIgPSBzdHJlYW0ud3JpdGFibGUuZ2V0V3JpdGVyKCk7XG4gICAgICAgICAgdGhpcy5zdGFydENvbnRyb2xSZWFkTG9vcChzdHJlYW0ucmVhZGFibGUpO1xuICAgICAgICB9XG4gICAgICB9KSgpO1xuXG4gICAgICB0aGlzLmlzQ29ubmVjdGVkID0gdHJ1ZTtcbiAgICAgIHRoaXMucmV0cnlDb3VudCA9IDA7XG4gICAgICB0aGlzLmNsZWFyUmVjb25uZWN0VGltZXIoKTtcbiAgICAgIC8vIHdhdGNoIGZvciBjbG9zZVxuICAgICAgdGhpcy53ZWJ0cmFuc3BvcnQuY2xvc2VkXG4gICAgICAgIC50aGVuKCgpID0+IHRoaXMuY2xvc2UoKSlcbiAgICAgICAgLmNhdGNoKCgpID0+IHRoaXMuY2xvc2UoKSk7XG5cbiAgICAgIHJldHVybiB0cnVlO1xuICAgIH0gY2F0Y2ggKGUpIHtcbiAgICAgIGNvbnNvbGUud2FybihcIkNvbm5lY3QgZmFpbGVkOlwiLCBlKTtcbiAgICAgIHRoaXMuc2NoZWR1bGVSZWNvbm5lY3QoKTtcbiAgICAgIHJldHVybiBmYWxzZTtcbiAgICB9XG4gIH1cblxuICAvKiogRmlyZS1hbmQtZm9yZ2V0IGRhdGFncmFtICovXG4gIHB1YmxpYyBhc3luYyBzZW5kTWVzc2FnZTxUPihcbiAgICBvcENvZGU6IG51bWJlcixcbiAgICBjb2RlYzogTmV0TWVzc2FnZUNvZGVjPFQ+IHwgbnVsbCxcbiAgICBkYXRhOiBQYXJ0aWFsPFQ+IHwgbnVsbCxcbiAgKTogUHJvbWlzZTx2b2lkPiB7XG4gICAgY29uc3QgYnVmID0gY29kZWMgJiYgZGF0YSA/IGNvZGVjLmVuY29kZShkYXRhKSA6IG5ldyBVaW50OEFycmF5KDApO1xuICAgIGNvbnN0IG9wID0gbmV3IFVpbnQxNkFycmF5KFtvcENvZGVdKS5idWZmZXI7XG4gICAgY29uc3QgcGFja2V0ID0gY29uY2F0VWludDgobmV3IFVpbnQ4QXJyYXkob3ApLCBidWYpO1xuICAgIGF3YWl0IHRoaXMuc2VuZERhdGFncmFtKHBhY2tldCk7XG4gIH1cblxuICAvKiogUmVsaWFibGUsIG9yZGVyZWQg4oCcc3RyZWFt4oCdIG1lc3NhZ2UgKi9cbiAgcHVibGljIGFzeW5jIHNlbmRTdHJlYW1NZXNzYWdlPFQ+KFxuICAgIG9wQ29kZTogbnVtYmVyLFxuICAgIGNvZGVjOiBOZXRNZXNzYWdlQ29kZWM8VD4sXG4gICAgZGF0YTogUGFydGlhbDxUPixcbiAgKTogUHJvbWlzZTx2b2lkPiB7XG4gICAgY29uc3QgcGF5bG9hZCA9IGNvZGVjLmVuY29kZShkYXRhKTtcblxuICAgIGlmICh0aGlzLmxvY2FsQmFja2VuZCkge1xuICAgICAgdGhpcy5sb2NhbEJhY2tlbmQuc2VuZChcImNvbnRyb2wtc3RyZWFtXCIsIG9wQ29kZSwgcGF5bG9hZCk7XG4gICAgICByZXR1cm47XG4gICAgfVxuICAgIGlmICghdGhpcy5jb250cm9sV3JpdGVyKSB7XG4gICAgICB0aHJvdyBuZXcgRXJyb3IoXCJDb250cm9sIHN0cmVhbSBub3Qgb3BlblwiKTtcbiAgICB9XG5cbiAgICAvLyBbbGVuZ3RoOnVpbnQzMl9MRV1bb3Bjb2RlOnVpbnQxNl9MRV1bcGF5bG9hZF1cbiAgICBjb25zdCBoZWFkZXIgPSBuZXcgQXJyYXlCdWZmZXIoNCk7XG4gICAgbmV3IERhdGFWaWV3KGhlYWRlcikuc2V0VWludDMyKDAsIDIgKyBwYXlsb2FkLmJ5dGVMZW5ndGgsIHRydWUpO1xuICAgIGNvbnN0IG9wID0gbmV3IFVpbnQxNkFycmF5KFtvcENvZGVdKS5idWZmZXI7XG5cbiAgICBjb25zdCBmcmFtZSA9IGNvbmNhdFVpbnQ4KFxuICAgICAgbmV3IFVpbnQ4QXJyYXkoaGVhZGVyKSxcbiAgICAgIGNvbmNhdFVpbnQ4KG5ldyBVaW50OEFycmF5KG9wKSwgcGF5bG9hZCksXG4gICAgKTtcbiAgICBhd2FpdCB0aGlzLmNvbnRyb2xXcml0ZXIud3JpdGUoZnJhbWUpO1xuICB9XG5cbiAgcHVibGljIHJlZ2lzdGVyT3BDb2RlSGFuZGxlcjxUPihcbiAgICBvcENvZGU6IE9wQ29kZXMsXG4gICAgY29kZWM6IE5ldE1lc3NhZ2VDb2RlYzxUPixcbiAgICBoYW5kbGVyOiAobXNnOiBUKSA9PiB2b2lkIHwgUHJvbWlzZTx2b2lkPixcbiAgKSB7XG4gICAgdGhpcy5vcENvZGVIYW5kbGVyc1tvcENvZGVdID0gKGJ1ZjogVWludDhBcnJheSkgPT4ge1xuICAgICAgdHJ5IHtcbiAgICAgICAgY29uc3QgcmVzdWx0ID0gaGFuZGxlcihjb2RlYy5kZWNvZGUoYnVmKSk7XG4gICAgICAgIGlmIChyZXN1bHQgaW5zdGFuY2VvZiBQcm9taXNlKSB7XG4gICAgICAgICAgdm9pZCByZXN1bHQuY2F0Y2goKGVycm9yOiB1bmtub3duKSA9PiB7XG4gICAgICAgICAgICBjb25zb2xlLmVycm9yKGBBc3luYyBoYW5kbGVyIGVycm9yIGZvciBvcGNvZGUgJHtvcENvZGV9OmAsIGVycm9yKTtcbiAgICAgICAgICB9KTtcbiAgICAgICAgfVxuICAgICAgfSBjYXRjaCAoZSkge1xuICAgICAgICBjb25zb2xlLmVycm9yKGBEZWNvZGUgZXJyb3IgZm9yIG9wY29kZSAke29wQ29kZX06YCwgZSk7XG4gICAgICB9XG4gICAgfTtcbiAgfVxuXG4gIHB1YmxpYyByZWdpc3RlclJhd09wQ29kZUhhbmRsZXIoXG4gICAgb3BDb2RlOiBPcENvZGVzLFxuICAgIGhhbmRsZXI6IChwYXlsb2FkOiBVaW50OEFycmF5KSA9PiB2b2lkLFxuICApOiB2b2lkIHtcbiAgICB0aGlzLm9wQ29kZUhhbmRsZXJzW29wQ29kZV0gPSBoYW5kbGVyO1xuICB9XG5cbiAgcHVibGljIGNsb3NlKHNjaGVkdWxlUmVjb25uZWN0OiBib29sZWFuID0gdHJ1ZSkge1xuICAgIHRoaXMuaXNDb25uZWN0ZWQgPSBmYWxzZTtcbiAgICB2b2lkIHRoaXMuY29ubmVjdGluZ0xvY2FsQmFja2VuZD8uY2xvc2UoKTtcbiAgICB0aGlzLmNvbm5lY3RpbmdMb2NhbEJhY2tlbmQgPSBudWxsO1xuICAgIHZvaWQgdGhpcy5sb2NhbEJhY2tlbmQ/LmNsb3NlKCk7XG4gICAgdGhpcy5sb2NhbEJhY2tlbmQgPSBudWxsO1xuICAgIHRoaXMuZGF0YWdyYW1Xcml0ZXI/LnJlbGVhc2VMb2NrKCk7XG4gICAgdGhpcy5jb250cm9sV3JpdGVyPy5yZWxlYXNlTG9jaygpO1xuICAgIHRoaXMud2VidHJhbnNwb3J0Py5jbG9zZSgpO1xuICAgIHRoaXMud2VidHJhbnNwb3J0ID0gbnVsbDtcbiAgICB0aGlzLmRhdGFncmFtV3JpdGVyID0gbnVsbDtcbiAgICB0aGlzLmNvbnRyb2xXcml0ZXIgPSBudWxsO1xuXG4gICAgaWYgKHNjaGVkdWxlUmVjb25uZWN0ICYmIHRoaXMuYWxsb3dSZWNvbm5lY3QpIHtcbiAgICAgIHRoaXMuc2NoZWR1bGVSZWNvbm5lY3QoKTtcbiAgICB9IGVsc2Uge1xuICAgICAgdGhpcy5jbGVhclJlY29ubmVjdFRpbWVyKCk7XG4gICAgICB0aGlzLm9uQ2xvc2U/LigpO1xuICAgIH1cbiAgfVxuXG4gIC8vIOKAlOKAlOKAlCBwcml2YXRlIGhlbHBlcnMg4oCU4oCU4oCUXG5cbiAgcHJpdmF0ZSBhc3luYyBjb25uZWN0TG9jYWxCYWNrZW5kKCk6IFByb21pc2U8Ym9vbGVhbj4ge1xuICAgIGNvbnN0IHByZXZpb3VzQmFja2VuZCA9IHRoaXMubG9jYWxCYWNrZW5kO1xuICAgIHRoaXMubG9jYWxCYWNrZW5kID0gbnVsbDtcbiAgICBhd2FpdCBwcmV2aW91c0JhY2tlbmQ/LmNsb3NlKCk7XG5cbiAgICBjb25zdCBsb2NhbEJhY2tlbmQgPSBuZXcgTG9jYWxCYWNrZW5kQ29ubmVjdGlvbigpO1xuICAgIHRoaXMuY29ubmVjdGluZ0xvY2FsQmFja2VuZCA9IGxvY2FsQmFja2VuZDtcbiAgICBsb2NhbEJhY2tlbmQub25QYWNrZXQoKG9wY29kZSwgcGF5bG9hZCkgPT5cbiAgICAgIHRoaXMub3BDb2RlSGFuZGxlcnNbb3Bjb2RlXT8uKHBheWxvYWQpLFxuICAgICk7XG4gICAgdHJ5IHtcbiAgICAgIGNvbnN0IGluZm8gPSBhd2FpdCBsb2NhbEJhY2tlbmQuY29ubmVjdCgpO1xuICAgICAgaWYgKHRoaXMuY29ubmVjdGluZ0xvY2FsQmFja2VuZCAhPT0gbG9jYWxCYWNrZW5kKSB7XG4gICAgICAgIGF3YWl0IGxvY2FsQmFja2VuZC5jbG9zZSgpO1xuICAgICAgICByZXR1cm4gZmFsc2U7XG4gICAgICB9XG4gICAgICB0aGlzLmNvbm5lY3RpbmdMb2NhbEJhY2tlbmQgPSBudWxsO1xuICAgICAgdGhpcy5sb2NhbEJhY2tlbmQgPSBsb2NhbEJhY2tlbmQ7XG4gICAgICB0aGlzLmlzQ29ubmVjdGVkID0gdHJ1ZTtcbiAgICAgIHRoaXMucmV0cnlDb3VudCA9IDA7XG4gICAgICB0aGlzLmNsZWFyUmVjb25uZWN0VGltZXIoKTtcbiAgICAgIGNvbnNvbGUuaW5mbyhcIltsb2NhbC1iYWNrZW5kXSBjb25uZWN0ZWRcIiwgaW5mbyk7XG4gICAgICByZXR1cm4gdHJ1ZTtcbiAgICB9IGNhdGNoIChlcnJvcikge1xuICAgICAgY29uc29sZS5lcnJvcihcIltsb2NhbC1iYWNrZW5kXSBjb25uZWN0aW9uIGZhaWxlZFwiLCBlcnJvcik7XG4gICAgICBhd2FpdCBsb2NhbEJhY2tlbmQuY2xvc2UoKTtcbiAgICAgIGlmICh0aGlzLmNvbm5lY3RpbmdMb2NhbEJhY2tlbmQgPT09IGxvY2FsQmFja2VuZCkge1xuICAgICAgICB0aGlzLmNvbm5lY3RpbmdMb2NhbEJhY2tlbmQgPSBudWxsO1xuICAgICAgfVxuICAgICAgaWYgKHRoaXMubG9jYWxCYWNrZW5kID09PSBsb2NhbEJhY2tlbmQpIHtcbiAgICAgICAgdGhpcy5sb2NhbEJhY2tlbmQgPSBudWxsO1xuICAgICAgfVxuICAgICAgcmV0dXJuIGZhbHNlO1xuICAgIH1cbiAgfVxuXG4gIHByaXZhdGUgYXN5bmMgc2VuZERhdGFncmFtKGJ1ZjogVWludDhBcnJheSkge1xuICAgIGlmICh0aGlzLmxvY2FsQmFja2VuZCkge1xuICAgICAgaWYgKGJ1Zi5ieXRlTGVuZ3RoIDwgMikge1xuICAgICAgICB0aHJvdyBuZXcgRXJyb3IoXCJMb2NhbCBiYWNrZW5kIHBhY2tldCBpcyBtaXNzaW5nIGl0cyBvcGNvZGVcIik7XG4gICAgICB9XG4gICAgICBjb25zdCBvcGNvZGUgPSBuZXcgRGF0YVZpZXcoXG4gICAgICAgIGJ1Zi5idWZmZXIsXG4gICAgICAgIGJ1Zi5ieXRlT2Zmc2V0LFxuICAgICAgICBidWYuYnl0ZUxlbmd0aCxcbiAgICAgICkuZ2V0VWludDE2KDAsIHRydWUpO1xuICAgICAgdGhpcy5sb2NhbEJhY2tlbmQuc2VuZChcImRhdGFncmFtXCIsIG9wY29kZSwgYnVmLnNsaWNlKDIpKTtcbiAgICAgIHJldHVybjtcbiAgICB9XG4gICAgaWYgKCF0aGlzLmRhdGFncmFtV3JpdGVyKSB7XG4gICAgICByZXR1cm47XG4gICAgfVxuICAgIHRoaXMud3JpdGVRdWV1ZSA9IHRoaXMud3JpdGVRdWV1ZS50aGVuKCgpID0+XG4gICAgICB0aGlzLmRhdGFncmFtV3JpdGVyIS53cml0ZShidWYpLFxuICAgICk7XG4gICAgcmV0dXJuIHRoaXMud3JpdGVRdWV1ZTtcbiAgfVxuXG4gIHByaXZhdGUgc3RhcnREYXRhZ3JhbUxvb3AoKSB7XG4gICAgaWYgKCF0aGlzLndlYnRyYW5zcG9ydCkge1xuICAgICAgcmV0dXJuO1xuICAgIH1cbiAgICBjb25zdCByZHIgPSB0aGlzLndlYnRyYW5zcG9ydC5kYXRhZ3JhbXMucmVhZGFibGUuZ2V0UmVhZGVyKCk7XG4gICAgKGFzeW5jICgpID0+IHtcbiAgICAgIHRyeSB7XG4gICAgICAgIHdoaWxlICh0cnVlKSB7XG4gICAgICAgICAgY29uc3QgeyB2YWx1ZSwgZG9uZSB9ID0gYXdhaXQgcmRyLnJlYWQoKTtcbiAgICAgICAgICBpZiAoZG9uZSkge1xuICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgfVxuICAgICAgICAgIGlmICghdmFsdWUpIHtcbiAgICAgICAgICAgIGNvbnRpbnVlO1xuICAgICAgICAgIH1cbiAgICAgICAgICBjb25zdCBvcGNvZGUgPSBuZXcgVWludDE2QXJyYXkodmFsdWUuYnVmZmVyLnNsaWNlKDAsIDIpKVswXTtcbiAgICAgICAgICBjb25zdCBwYXlsb2FkID0gdmFsdWUuc2xpY2UoMik7XG4gICAgICAgICAgdGhpcy5vcENvZGVIYW5kbGVyc1tvcGNvZGVdPy4ocGF5bG9hZCk7XG4gICAgICAgIH1cbiAgICAgIH0gY2F0Y2ggKGUpIHtcbiAgICAgICAgY29uc29sZS5lcnJvcihcIkRhdGFncmFtIGxvb3AgZXJyb3I6XCIsIGUpO1xuICAgICAgfSBmaW5hbGx5IHtcbiAgICAgICAgcmRyLnJlbGVhc2VMb2NrKCk7XG4gICAgICB9XG4gICAgfSkoKTtcbiAgfVxuXG4gIHByaXZhdGUgc3RhcnRDb250cm9sUmVhZExvb3Aoc3RyZWFtOiBSZWFkYWJsZVN0cmVhbTxVaW50OEFycmF5Pikge1xuICAgIGNvbnN0IHJkciA9IHN0cmVhbS5nZXRSZWFkZXIoKTtcbiAgICBsZXQgYnVmZmVyOiBVaW50OEFycmF5ID0gbmV3IFVpbnQ4QXJyYXkoMCk7XG4gICAgKGFzeW5jICgpID0+IHtcbiAgICAgIHRyeSB7XG4gICAgICAgIHdoaWxlICh0cnVlKSB7XG4gICAgICAgICAgY29uc3QgeyB2YWx1ZSwgZG9uZSB9ID0gYXdhaXQgcmRyLnJlYWQoKTtcbiAgICAgICAgICBpZiAoZG9uZSkge1xuICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgfVxuICAgICAgICAgIGJ1ZmZlciA9IGNvbmNhdFVpbnQ4KGJ1ZmZlciwgdmFsdWUhKTtcbiAgICAgICAgICB3aGlsZSAoYnVmZmVyLmxlbmd0aCA+PSA0KSB7XG4gICAgICAgICAgICBjb25zdCBsZW4gPSBuZXcgRGF0YVZpZXcoYnVmZmVyLmJ1ZmZlcikuZ2V0VWludDMyKDAsIHRydWUpO1xuICAgICAgICAgICAgaWYgKGJ1ZmZlci5sZW5ndGggPCA0ICsgbGVuKSB7XG4gICAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgY29uc3QgbXNnID0gYnVmZmVyLnNsaWNlKDQsIDQgKyBsZW4pO1xuICAgICAgICAgICAgY29uc3Qgb3Bjb2RlID0gbmV3IFVpbnQxNkFycmF5KG1zZy5idWZmZXIuc2xpY2UoMCwgMikpWzBdO1xuICAgICAgICAgICAgY29uc3QgcGF5bG9hZCA9IG1zZy5zbGljZSgyKTtcbiAgICAgICAgICAgIHRoaXMub3BDb2RlSGFuZGxlcnNbb3Bjb2RlXT8uKHBheWxvYWQpO1xuICAgICAgICAgICAgYnVmZmVyID0gYnVmZmVyLnNsaWNlKDQgKyBsZW4pO1xuICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgfSBjYXRjaCAoZSkge1xuICAgICAgICBjb25zb2xlLmVycm9yKFwiQ29udHJvbCBzdHJlYW0gbG9vcCBlcnJvcjpcIiwgZSk7XG4gICAgICB9IGZpbmFsbHkge1xuICAgICAgICByZHIucmVsZWFzZUxvY2soKTtcbiAgICAgIH1cbiAgICB9KSgpO1xuICB9XG5cbiAgcHJpdmF0ZSBzY2hlZHVsZVJlY29ubmVjdCgpIHtcbiAgICBpZiAodGhpcy5yZWNvbm5lY3RUaW1lcikge1xuICAgICAgcmV0dXJuO1xuICAgIH1cbiAgICBpZiAoXG4gICAgICB0aGlzLnJldHJ5Q291bnQgPj0gdGhpcy5tYXhSZXRyaWVzIHx8XG4gICAgICAhdGhpcy51cmwgfHxcbiAgICAgICF0aGlzLnBvcnQgfHxcbiAgICAgICF0aGlzLm9uQ2xvc2VcbiAgICApIHtcbiAgICAgIHRoaXMuY2xlYXJSZWNvbm5lY3RUaW1lcigpO1xuICAgICAgdGhpcy5vbkNsb3NlPy4oKTtcbiAgICAgIHRoaXMucmV0cnlDb3VudCA9IDA7XG4gICAgICByZXR1cm47XG4gICAgfVxuICAgIGNvbnN0IGRlbGF5ID0gTWF0aC5taW4oMiAqKiB0aGlzLnJldHJ5Q291bnQgKiAxMDAwLCAzMF8wMDApO1xuICAgIHRoaXMucmV0cnlDb3VudCsrO1xuICAgIHRoaXMucmVjb25uZWN0VGltZXIgPSBzZXRUaW1lb3V0KGFzeW5jICgpID0+IHtcbiAgICAgIHRoaXMucmVjb25uZWN0VGltZXIgPSBudWxsO1xuICAgICAgY29uc3Qgb2sgPSBhd2FpdCB0aGlzLmNvbm5lY3QodGhpcy51cmwhLCB0aGlzLnBvcnQhLCB0aGlzLm9uQ2xvc2UhKTtcbiAgICAgIC8vIGNvbm5lY3QoKSBvd25zIHJldHJ5IHNjaGVkdWxpbmcgb24gZmFpbHVyZTsgYXZvaWQgc3RhY2tpbmcgZXh0cmEgdGltZXJzIGhlcmUuXG4gICAgICBpZiAoIW9rKSB7XG4gICAgICB9XG4gICAgfSwgZGVsYXkpO1xuICB9XG5cbiAgcHJpdmF0ZSBjbGVhclJlY29ubmVjdFRpbWVyKCkge1xuICAgIGlmICghdGhpcy5yZWNvbm5lY3RUaW1lcikge1xuICAgICAgcmV0dXJuO1xuICAgIH1cbiAgICBjbGVhclRpbWVvdXQodGhpcy5yZWNvbm5lY3RUaW1lcik7XG4gICAgdGhpcy5yZWNvbm5lY3RUaW1lciA9IG51bGw7XG4gIH1cbn1cbiJdfQ==