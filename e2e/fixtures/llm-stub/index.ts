import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import type { AddressInfo, Socket } from 'node:net';

/**
 * Servidor falso do vLLM (API compatível com a OpenAI) para testes de integração
 * de `lib/llm` e, no futuro, dos E2E do chat (spec 0001).
 *
 * Cada `POST /v1/chat/completions` consome a próxima resposta da fila
 * (`enqueue`) ou usa a resposta padrão (`setFallback`). O corpo recebido e o
 * aborto da conexão ficam em `requests` para o teste inspecionar.
 */

export type LlmStubUsage = { prompt_tokens: number; completion_tokens: number };

export type LlmStubReply =
  /** Resposta completa. Com `stream: true` no pedido, vira SSE com um único pedaço. */
  | {
      type: 'json';
      content: string;
      delayMs?: number;
      usage?: LlmStubUsage | null;
      /** Padrão `stop`; `length` simula o corte pelo limite de tokens. */
      finishReason?: string;
    }
  /** Resposta SSE pedaço a pedaço. */
  | {
      type: 'stream';
      chunks: string[];
      /** Espera antes do primeiro pedaço de conteúdo (os cabeçalhos saem na hora). */
      firstChunkDelayMs?: number;
      /** Espera entre pedaços. */
      chunkDelayMs?: number;
      /** Depois de N pedaços, para de enviar e nunca termina. */
      stallAfterChunks?: number;
      /** Depois de N pedaços, derruba a conexão. */
      dropAfterChunks?: number;
      usage?: LlmStubUsage | null;
      /** Padrão `stop`; `length` simula o corte pelo limite de tokens. */
      finishReason?: string;
    }
  /** Erro HTTP com corpo no formato da OpenAI. */
  | { type: 'status'; status: number; delayMs?: number; message?: string }
  /** Recebe o pedido e nunca responde. */
  | { type: 'hang' }
  /** Derruba a conexão sem responder (conexão reiniciada). */
  | { type: 'reset'; delayMs?: number };

export type LlmStubRequest = {
  method: string;
  path: string;
  authorization: string | undefined;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  body: any;
  startedAt: number;
  endedAt: number | null;
  /** O cliente fechou a conexão antes de a resposta terminar. */
  aborted: boolean;
};

export type LlmStub = {
  /** Com `/v1` no fim, como `LLM_BASE_URL`. */
  baseUrl: string;
  requests: LlmStubRequest[];
  completionRequests(): LlmStubRequest[];
  /** Pedidos de completion ainda abertos. */
  inFlight(): number;
  enqueue(...replies: LlmStubReply[]): void;
  setFallback(reply: LlmStubReply): void;
  /** Espera até existirem `count` pedidos de completion. */
  waitForCompletions(count: number, timeoutMs?: number): Promise<void>;
  /** Espera até todos os pedidos de completion estarem fechados. */
  waitForIdle(timeoutMs?: number): Promise<void>;
  reset(): void;
  close(): Promise<void>;
};

const DEFAULT_USAGE: LlmStubUsage = { prompt_tokens: 42, completion_tokens: 7 };

export async function startLlmStub(options: { apiKey: string; model: string }): Promise<LlmStub> {
  const requests: LlmStubRequest[] = [];
  const queue: LlmStubReply[] = [];
  let fallback: LlmStubReply = { type: 'json', content: '{}' };
  const sockets = new Set<Socket>();
  const timers = new Set<ReturnType<typeof setTimeout>>();

  function later(ms: number, fn: () => void) {
    const timer = setTimeout(() => {
      timers.delete(timer);
      fn();
    }, ms);
    timers.add(timer);
    return timer;
  }

  function sendJson(res: ServerResponse, status: number, payload: unknown) {
    res.writeHead(status, { 'content-type': 'application/json' });
    res.end(JSON.stringify(payload));
  }

  function chunk(delta: Record<string, unknown>, finishReason: string | null = null) {
    return {
      id: 'chatcmpl-stub',
      object: 'chat.completion.chunk',
      created: 0,
      model: options.model,
      choices: [{ index: 0, delta, finish_reason: finishReason }],
    };
  }

  function writeEvent(res: ServerResponse, payload: unknown) {
    if (!res.writableEnded && !res.destroyed) res.write(`data: ${JSON.stringify(payload)}\n\n`);
  }

  function streamReply(
    req: IncomingMessage,
    res: ServerResponse,
    reply: Extract<LlmStubReply, { type: 'stream' }>,
    includeUsage: boolean,
  ) {
    res.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-cache' });
    writeEvent(res, chunk({ role: 'assistant', content: '' }));

    let index = 0;
    const next = () => {
      if (res.destroyed) return;
      if (reply.dropAfterChunks !== undefined && index >= reply.dropAfterChunks) {
        req.socket.destroy();
        return;
      }
      if (reply.stallAfterChunks !== undefined && index >= reply.stallAfterChunks) return;
      if (index >= reply.chunks.length) {
        writeEvent(res, chunk({}, reply.finishReason ?? 'stop'));
        if (includeUsage && reply.usage !== null) {
          const usage = reply.usage ?? DEFAULT_USAGE;
          writeEvent(res, {
            ...chunk({}),
            choices: [],
            usage: { ...usage, total_tokens: usage.prompt_tokens + usage.completion_tokens },
          });
        }
        res.end('data: [DONE]\n\n');
        return;
      }
      writeEvent(res, chunk({ content: reply.chunks[index] }));
      index += 1;
      later(reply.chunkDelayMs ?? 0, next);
    };
    later(reply.firstChunkDelayMs ?? 0, next);
  }

  function completionReply(
    req: IncomingMessage,
    res: ServerResponse,
    reply: LlmStubReply,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    body: any,
  ) {
    const isStream = body?.stream === true;
    const includeUsage = body?.stream_options?.include_usage === true;

    switch (reply.type) {
      case 'hang':
        return;
      case 'reset':
        later(reply.delayMs ?? 0, () => req.socket.destroy());
        return;
      case 'status':
        later(reply.delayMs ?? 0, () =>
          sendJson(res, reply.status, {
            error: { message: reply.message ?? `stub status ${reply.status}`, type: 'stub' },
          }),
        );
        return;
      case 'stream':
        streamReply(req, res, reply, includeUsage);
        return;
      case 'json':
        later(reply.delayMs ?? 0, () => {
          if (res.destroyed) return;
          if (isStream) {
            streamReply(
              req,
              res,
              {
                type: 'stream',
                chunks: [reply.content],
                usage: reply.usage,
                finishReason: reply.finishReason,
              },
              includeUsage,
            );
            return;
          }
          const usage = reply.usage === null ? undefined : (reply.usage ?? DEFAULT_USAGE);
          sendJson(res, 200, {
            id: 'chatcmpl-stub',
            object: 'chat.completion',
            created: 0,
            model: options.model,
            choices: [
              {
                index: 0,
                message: { role: 'assistant', content: reply.content },
                finish_reason: reply.finishReason ?? 'stop',
              },
            ],
            ...(usage
              ? { usage: { ...usage, total_tokens: usage.prompt_tokens + usage.completion_tokens } }
              : {}),
          });
        });
    }
  }

  const server = createServer((req, res) => {
    const record: LlmStubRequest = {
      method: req.method ?? 'GET',
      path: (req.url ?? '/').split('?')[0],
      authorization: req.headers.authorization,
      body: null,
      startedAt: Date.now(),
      endedAt: null,
      aborted: false,
    };
    requests.push(record);

    res.on('close', () => {
      record.endedAt = Date.now();
      if (!res.writableFinished) record.aborted = true;
    });

    const chunks: Buffer[] = [];
    req.on('data', (data: Buffer) => chunks.push(data));
    req.on('end', () => {
      const raw = Buffer.concat(chunks).toString('utf8');
      try {
        record.body = raw ? JSON.parse(raw) : null;
      } catch {
        record.body = raw;
      }

      if (record.authorization !== `Bearer ${options.apiKey}`) {
        sendJson(res, 401, { error: { message: 'Unauthorized', type: 'stub' } });
        return;
      }

      if (record.method === 'GET' && record.path === '/v1/models') {
        sendJson(res, 200, {
          object: 'list',
          data: [{ id: options.model, object: 'model', owned_by: 'vllm' }],
        });
        return;
      }

      if (record.method === 'POST' && record.path === '/v1/chat/completions') {
        completionReply(req, res, queue.shift() ?? fallback, record.body);
        return;
      }

      sendJson(res, 404, { error: { message: 'not found', type: 'stub' } });
    });
  });

  server.on('connection', (socket) => {
    sockets.add(socket);
    socket.on('close', () => sockets.delete(socket));
  });

  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address() as AddressInfo;

  const completionRequests = () =>
    requests.filter((r) => r.method === 'POST' && r.path === '/v1/chat/completions');

  async function waitUntil(check: () => boolean, timeoutMs: number, what: string) {
    const deadline = Date.now() + timeoutMs;
    while (!check()) {
      if (Date.now() > deadline) throw new Error(`llm-stub: tempo esgotado esperando ${what}`);
      await new Promise((resolve) => setTimeout(resolve, 5));
    }
  }

  return {
    baseUrl: `http://127.0.0.1:${port}/v1`,
    requests,
    completionRequests,
    inFlight: () => completionRequests().filter((r) => r.endedAt === null).length,
    enqueue: (...replies) => queue.push(...replies),
    setFallback: (reply) => {
      fallback = reply;
    },
    waitForCompletions: (count, timeoutMs = 2_000) =>
      waitUntil(() => completionRequests().length >= count, timeoutMs, `${count} pedidos`),
    waitForIdle: (timeoutMs = 2_000) =>
      waitUntil(
        () => completionRequests().every((r) => r.endedAt !== null),
        timeoutMs,
        'pedidos fechados',
      ),
    reset: () => {
      requests.length = 0;
      queue.length = 0;
      fallback = { type: 'json', content: '{}' };
    },
    close: async () => {
      for (const timer of timers) clearTimeout(timer);
      timers.clear();
      for (const socket of sockets) socket.destroy();
      await new Promise<void>((resolve) => server.close(() => resolve()));
    },
  };
}
