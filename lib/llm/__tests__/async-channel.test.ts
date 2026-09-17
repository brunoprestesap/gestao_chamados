import { describe, expect, it } from 'vitest';

import { AsyncChannel } from '@/lib/llm/async-channel';

/** Fila dos objetos parciais do streaming (spec 0001, AC-2). */

async function collect<T>(iterable: AsyncIterable<T>): Promise<T[]> {
  const items: T[] = [];
  for await (const item of iterable) items.push(item);
  return items;
}

describe('AsyncChannel', () => {
  it('guarda os itens empurrados antes da leitura e entrega na ordem (AC-2)', async () => {
    const channel = new AsyncChannel<number>();
    channel.push(1);
    channel.push(2);
    channel.close();

    expect(await collect(channel)).toEqual([1, 2]);
  });

  it('quem já está esperando recebe o próximo item empurrado', async () => {
    const channel = new AsyncChannel<string>();
    const iterator = channel[Symbol.asyncIterator]();

    const pending = iterator.next();
    channel.push('parcial');

    expect(await pending).toEqual({ value: 'parcial', done: false });
  });

  it('close acorda quem está esperando com fim da iteração', async () => {
    const channel = new AsyncChannel<string>();
    const iterator = channel[Symbol.asyncIterator]();

    const pending = iterator.next();
    channel.close();

    expect(await pending).toEqual({ value: undefined, done: true });
  });

  it('itens empurrados depois de close são ignorados', async () => {
    const channel = new AsyncChannel<number>();
    channel.push(1);
    channel.close();
    channel.push(2);
    channel.close();

    expect(await collect(channel)).toEqual([1]);
  });

  it('sair do for await descarta o que estava na fila e o que vier depois (AC-2)', async () => {
    const channel = new AsyncChannel<number>();
    channel.push(1);
    channel.push(2);
    channel.push(3);

    for await (const item of channel) {
      expect(item).toBe(1);
      break;
    }
    channel.push(4);

    // A leitura termina sem esperar close: quem produz não fica preso a um consumidor que saiu.
    expect(await collect(channel)).toEqual([]);
  });
});
