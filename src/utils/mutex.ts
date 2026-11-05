/**
 * Promise-based mutex that serialises access per logical key (e.g. document ID).
 *
 * Usage:
 *   const release = await mutex.acquire("doc-id");
 *   try { ... } finally { release(); }
 */
export class KeyedMutex {
  private locks = new Map<string, Promise<void>>();

  async acquire(key: string): Promise<() => void> {
    // Wait for the previous holder (if any) to finish
    while (this.locks.has(key)) {
      await this.locks.get(key);
    }

    let releaseFn!: () => void;
    const gate = new Promise<void>((resolve) => {
      releaseFn = resolve;
    });
    this.locks.set(key, gate);

    return () => {
      this.locks.delete(key);
      releaseFn();
    };
  }
}
