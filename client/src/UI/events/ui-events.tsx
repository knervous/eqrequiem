type Callback = (...args: any[]) => void;

export const UIEvents = {
  // internal storage for listeners
  _events: new Map<string, Callback[]>(),

  /**
   * Register a listener for `eventName`.
   * @param eventName
   * @param cb your callback, which can accept any args
   */
  on(eventName: string, cb: Callback) {
    const listeners = this._events.get(eventName) || [];
    listeners.push(cb);
    this._events.set(eventName, listeners);
  },

  /**
   * Unregister a listener. If `cb` is omitted, all listeners for that event are removed.
   */
  off(eventName: string, cb?: Callback) {
    if (!cb) {
      this._events.delete(eventName);
    } else {
      const listeners = this._events.get(eventName);
      if (!listeners) return;
      const filtered = listeners.filter((fn) => fn !== cb);
      if (filtered.length) {
        this._events.set(eventName, filtered);
      } else {
        this._events.delete(eventName);
      }
    }
  },

  /**
   * Invoke all listeners for `eventName`, forwarding any arguments.
   */
  emit(eventName: string, ...args: any[]) {
    const listeners = this._events.get(eventName);
    if (!listeners) return;
    // make a copy in case a listener unregisters itself mid‐loop
    for (const fn of [...listeners]) {
      fn(...args);
    }
  },
};
