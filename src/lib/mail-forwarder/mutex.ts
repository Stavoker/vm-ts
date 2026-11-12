export class Mutex {
  private chain: Promise<void> = Promise.resolve();

  run<T>(fn: () => T | Promise<T>): Promise<T> {
    const next = this.chain.then(fn);
    this.chain = next.then(
      () => undefined,
      () => undefined,
    );
    return next;
  }
}
