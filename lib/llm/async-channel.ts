import 'server-only';

/**
 * Fila assíncrona de um produtor para um consumidor, usada para entregar os
 * objetos parciais do streaming. Nunca rejeita: `close()` encerra a iteração.
 * Se o consumidor sair do `for await`, os próximos itens são descartados.
 */
export class AsyncChannel<T> implements AsyncIterable<T> {
  private readonly items: T[] = [];
  private readonly waiters: ((result: IteratorResult<T>) => void)[] = [];
  private closed = false;
  private detached = false;

  push(item: T): void {
    if (this.closed || this.detached) return;
    const waiter = this.waiters.shift();
    if (waiter) waiter({ value: item, done: false });
    else this.items.push(item);
  }

  close(): void {
    if (this.closed) return;
    this.closed = true;
    for (const waiter of this.waiters.splice(0)) waiter({ value: undefined, done: true });
  }

  [Symbol.asyncIterator](): AsyncIterator<T> {
    return {
      next: () => {
        if (this.items.length > 0) {
          return Promise.resolve({ value: this.items.shift() as T, done: false });
        }
        if (this.closed || this.detached) {
          return Promise.resolve({ value: undefined, done: true });
        }
        return new Promise((resolve) => this.waiters.push(resolve));
      },
      return: () => {
        this.detached = true;
        this.items.length = 0;
        for (const waiter of this.waiters.splice(0)) waiter({ value: undefined, done: true });
        return Promise.resolve({ value: undefined, done: true });
      },
    };
  }
}

/** Promessa com `resolve` exposto. */
export function createDeferred<T>(): { promise: Promise<T>; resolve: (value: T) => void } {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}
