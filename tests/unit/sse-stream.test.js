/**
 * Unit tests for parseSseStream.
 *
 * Covers the frame shapes the app's streaming endpoints actually emit:
 *   - named events (`event: thinking\ndata: {...}`)
 *   - plain data-only events (`data: {...}`)
 *   - partial-buffer handling across read() chunks
 *   - multiple events per chunk
 *   - invalid JSON (skipped, not fatal)
 *   - empty/comment frames (silently dropped)
 *   - `[DONE]` sentinel handled as synthetic `done` event
 *   - AbortSignal cancellation (mid-stream + already-aborted)
 *
 * @jest-environment node
 */

import { parseSseStream } from '../../shared/utils/sse-stream.js';

/**
 * Build a ReadableStream that emits the given chunk strings in order.
 * Each `chunks` element becomes one read() result, so we can simulate
 * SSE frames being split across network boundaries.
 */
function streamFromChunks(chunks) {
  const encoder = new TextEncoder();
  let i = 0;
  return new ReadableStream({
    pull(controller) {
      if (i < chunks.length) {
        controller.enqueue(encoder.encode(chunks[i++]));
      } else {
        controller.close();
      }
    },
  });
}

async function collect(iter) {
  const out = [];
  for await (const evt of iter) out.push(evt);
  return out;
}

describe('parseSseStream', () => {
  test('parses a single named event', async () => {
    const stream = streamFromChunks([
      'event: thinking\ndata: {"message":"hi"}\n\n',
    ]);
    const events = await collect(parseSseStream({ stream }));
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      event: 'thinking',
      data: { message: 'hi' },
    });
  });

  test('parses a plain data-only event (no event: line)', async () => {
    const stream = streamFromChunks([
      'data: {"progress":50}\n\n',
    ]);
    const events = await collect(parseSseStream({ stream }));
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      event: null,
      data: { progress: 50 },
    });
  });

  test('parses multiple events in one chunk', async () => {
    const stream = streamFromChunks([
      'event: thinking\ndata: {"m":1}\n\nevent: text_delta\ndata: {"text":"hello"}\n\nevent: complete\ndata: {}\n\n',
    ]);
    const events = await collect(parseSseStream({ stream }));
    expect(events.map((e) => e.event)).toEqual(['thinking', 'text_delta', 'complete']);
    expect(events[1].data).toEqual({ text: 'hello' });
  });

  test('parses a frame split across multiple chunks', async () => {
    // Split the data: line across a read boundary so the parser must
    // buffer the partial frame and stitch it back together.
    const stream = streamFromChunks([
      'event: text_delta\nda',
      'ta: {"text":"split"}\n\n',
    ]);
    const events = await collect(parseSseStream({ stream }));
    expect(events).toHaveLength(1);
    expect(events[0].data).toEqual({ text: 'split' });
  });

  test('frame split across many chunks (byte-by-byte stress test)', async () => {
    const payload = 'event: text_delta\ndata: {"text":"crawl"}\n\n';
    const chunks = payload.split('').map((c) => c);
    const stream = streamFromChunks(chunks);
    const events = await collect(parseSseStream({ stream }));
    expect(events).toHaveLength(1);
    expect(events[0].data).toEqual({ text: 'crawl' });
  });

  test('invalid JSON in one event does not break later events', async () => {
    const warns = [];
    const stream = streamFromChunks([
      'event: a\ndata: {not json}\n\nevent: b\ndata: {"ok":true}\n\n',
    ]);
    const events = await collect(parseSseStream({
      stream,
      onParseError: (err, raw) => warns.push({ message: err.message, raw }),
    }));
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ event: 'b', data: { ok: true } });
    expect(warns).toHaveLength(1);
  });

  test('empty and comment frames are silently dropped', async () => {
    const stream = streamFromChunks([
      '\n\n: keepalive\n\nevent: real\ndata: {"v":1}\n\n',
    ]);
    const events = await collect(parseSseStream({ stream }));
    expect(events).toHaveLength(1);
    expect(events[0].event).toBe('real');
  });

  test('[DONE] sentinel is yielded as synthetic done event', async () => {
    const stream = streamFromChunks([
      'data: [DONE]\n\n',
    ]);
    const events = await collect(parseSseStream({ stream }));
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ event: 'done', data: null });
  });

  test('flushes a trailing frame that lacks the final blank-line separator', async () => {
    const stream = streamFromChunks([
      'event: text_delta\ndata: {"text":"trailing"}\n', // single \n, not \n\n
    ]);
    const events = await collect(parseSseStream({ stream }));
    expect(events).toHaveLength(1);
    expect(events[0].data).toEqual({ text: 'trailing' });
  });

  test('aborts cleanly via AbortSignal mid-stream', async () => {
    const encoder = new TextEncoder();
    const ac = new AbortController();
    let aborted = false;

    // Build a stream that emits 3 events, then a never-ending tail.
    // We abort after consuming the first event; the parser should
    // stop without surfacing an error to the consumer.
    const stream = new ReadableStream({
      async start(controller) {
        controller.enqueue(encoder.encode('event: a\ndata: {"i":1}\n\n'));
        controller.enqueue(encoder.encode('event: b\ndata: {"i":2}\n\n'));
        // Wait a bit so the consumer can abort between events.
        await new Promise((r) => setTimeout(r, 20));
        if (aborted) {
          controller.close();
          return;
        }
        controller.enqueue(encoder.encode('event: c\ndata: {"i":3}\n\n'));
        controller.close();
      },
    });

    const events = [];
    for await (const evt of parseSseStream({ stream, signal: ac.signal })) {
      events.push(evt);
      if (events.length === 1) {
        aborted = true;
        ac.abort();
      }
    }

    // We should have at least the first event; the parser exited cleanly
    // (no thrown error) regardless of how many we caught before abort.
    expect(events.length).toBeGreaterThanOrEqual(1);
    expect(events[0]).toMatchObject({ event: 'a' });
  });

  test('honors an already-aborted signal at start (no events yielded)', async () => {
    const ac = new AbortController();
    ac.abort();
    const stream = streamFromChunks([
      'event: a\ndata: {"i":1}\n\n',
    ]);
    const events = await collect(parseSseStream({ stream, signal: ac.signal }));
    expect(events).toEqual([]);
  });
});
