import { KeyedMutex } from "@/utils/mutex";

describe("KeyedMutex", () => {
  it("serialises access to the same key", async () => {
    const mutex = new KeyedMutex();
    const order: number[] = [];

    const p1 = (async () => {
      const release = await mutex.acquire("a");
      order.push(1);
      await new Promise((r) => setTimeout(r, 50));
      order.push(2);
      release();
    })();

    const p2 = (async () => {
      // Small delay to ensure p1 acquires first
      await new Promise((r) => setTimeout(r, 10));
      const release = await mutex.acquire("a");
      order.push(3);
      release();
    })();

    await Promise.all([p1, p2]);

    // p2 must wait for p1, so 3 comes after 2
    expect(order).toEqual([1, 2, 3]);
  });

  it("allows concurrent access to different keys", async () => {
    const mutex = new KeyedMutex();
    const order: string[] = [];

    const p1 = (async () => {
      const release = await mutex.acquire("a");
      order.push("a-start");
      await new Promise((r) => setTimeout(r, 50));
      order.push("a-end");
      release();
    })();

    const p2 = (async () => {
      await new Promise((r) => setTimeout(r, 10));
      const release = await mutex.acquire("b");
      order.push("b-start");
      release();
    })();

    await Promise.all([p1, p2]);

    // b-start should occur while a is still held (before a-end)
    const bIdx = order.indexOf("b-start");
    const aEndIdx = order.indexOf("a-end");
    expect(bIdx).toBeLessThan(aEndIdx);
  });

  it("handles release correctly — subsequent acquires succeed", async () => {
    const mutex = new KeyedMutex();
    const release1 = await mutex.acquire("key");
    release1();
    const release2 = await mutex.acquire("key");
    release2();
    // If we get here without hanging, the test passes
    expect(true).toBe(true);
  });
});
