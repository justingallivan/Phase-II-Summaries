/**
 * Shared SSE stream parser for the app's streaming endpoints.
 *
 * Consumes a `ReadableStream` of bytes (e.g., `response.body` from a
 * `fetch` to a server-sent-events endpoint) and yields parsed event
 * objects:
 *
 *     for await (const evt of parseSseStream({ stream, signal })) {
 *       switch (evt.event) {
 *         case 'text_delta': ...
 *         case 'complete': ...
 *       }
 *     }
 *
 * Yielded shape:
 *     { event: string | null, data: any, raw: string }
 *
 * - `event` is the value of the `event:` line, or null for events that
 *   only have a `data:` line.
 * - `data` is the JSON-parsed `data:` payload. If the payload isn't
 *   valid JSON, the event is skipped (logged once via `onParseError`)
 *   instead of throwing — a single malformed event should not abort a
 *   long-running stream.
 * - `raw` is the original frame text, useful for debugging.
 *
 * Cancellation: pass an `AbortSignal` via `signal`. When the signal
 * aborts, the iterator stops yielding cleanly, calls `reader.cancel()`,
 * and releases the lock. The expected pattern is to wire the same
 * `AbortController` to both `fetch()` and this parser so a single
 * `.abort()` tears down the entire chain.
 *
 * Caller cancellation contract: if a consumer `break`s or `throw`s
 * out of the `for await` loop WITHOUT aborting the signal, the
 * parser's `finally` releases the reader lock but does NOT call
 * `reader.cancel()` — that would require knowing the consumer
 * intends to abandon the stream rather than continue elsewhere.
 * Callers that don't use a signal MUST abort their `fetch` directly
 * to free the underlying network stream. Recommended idiom: always
 * pass an AbortSignal even if you don't intend to fire it, so the
 * `.abort()` you eventually call as cleanup tears down everything.
 *
 * Format coverage:
 *   - `data: {...}` (plain event, no name)
 *   - `event: name\ndata: {...}` (named event)
 *   - Multi-line frames split across read() chunks (partial-buffer)
 *   - Multiple events in one chunk
 *   - `[DONE]` sentinel string handled as a synthetic
 *     `{ event: 'done', data: null }` event for callers that need it
 *
 * NOT supported (out of scope):
 *   - `id:` and `retry:` fields (the app's endpoints don't emit them)
 *   - Multi-line `data:` continuation (we expect single-line JSON)
 *   - Comment lines (`:` prefix) — silently dropped
 */

/**
 * @param {object} opts
 * @param {ReadableStream<Uint8Array>} opts.stream - typically `response.body`
 * @param {AbortSignal} [opts.signal] - optional abort signal
 * @param {(err: Error, raw: string) => void} [opts.onParseError] - called
 *   once per malformed event with the parse error and the raw frame.
 *   Default: console.warn.
 * @returns {AsyncGenerator<{ event: string|null, data: any, raw: string }>}
 */
export async function* parseSseStream({ stream, signal, onParseError } = {}) {
  if (!stream) {
    throw new Error('parseSseStream: stream is required');
  }
  const warn = onParseError || ((err, raw) => {
    console.warn('SSE parse error:', err.message, raw.slice(0, 120));
  });

  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  // Wire abort signal: when it fires, cancel the reader so the next
  // read() rejects and we exit the loop cleanly. We attach with a
  // weak guard so an already-aborted signal is honored immediately.
  let aborted = false;
  const onAbort = () => {
    aborted = true;
    // Best-effort cancel; some browsers throw if the reader is in a
    // mid-read state — we don't care, the next iteration of the loop
    // will catch the rejection.
    reader.cancel().catch(() => {});
  };
  if (signal) {
    if (signal.aborted) {
      onAbort();
    } else {
      signal.addEventListener('abort', onAbort, { once: true });
    }
  }

  try {
    while (!aborted) {
      let chunk;
      try {
        const r = await reader.read();
        if (r.done) break;
        chunk = r.value;
      } catch (err) {
        // If aborted, swallow the cancellation error and exit cleanly.
        // Otherwise re-throw — the consumer's await will surface it.
        if (aborted || err?.name === 'AbortError') break;
        throw err;
      }

      buffer += decoder.decode(chunk, { stream: true });

      // SSE frames are separated by a blank line. The spec allows
      // either LF or CRLF line endings; some producers (especially
      // ones behind CRLF-normalizing middleboxes) emit `\r\n\r\n`
      // separators. Split on both forms so we don't accidentally
      // accumulate the entire stream into one giant un-parseable frame.
      const frames = buffer.split(/\r?\n\r?\n/);
      buffer = frames.pop() ?? '';

      for (const frame of frames) {
        if (aborted) break;
        const parsed = parseFrame(frame, warn);
        if (parsed) yield parsed;
      }
    }

    // Flush any remaining partial frame after the stream closes. Some
    // producers don't trail their final event with a blank line.
    if (!aborted && buffer.trim().length > 0) {
      const parsed = parseFrame(buffer, warn);
      if (parsed) yield parsed;
    }
  } finally {
    if (signal) signal.removeEventListener('abort', onAbort);
    try { reader.releaseLock(); } catch { /* may have been cancelled */ }
  }
}

/**
 * Parse a single SSE frame into `{ event, data, raw }` or null if the
 * frame is empty, a comment, or has unrecognized structure.
 */
function parseFrame(frame, warn) {
  if (frame.trim().length === 0) return null;

  let eventName = null;
  let dataLine = null;
  // Split on CRLF or LF to match the frame-separator regex above.
  // Comment LINES (per SSE spec, line starts with `:`) are skipped
  // individually rather than dropping the whole frame — a frame
  // like `: keepalive\ndata: {...}` is valid and should yield the
  // data event.
  for (const line of frame.split(/\r?\n/)) {
    if (line.startsWith(':')) continue;
    if (line.startsWith('event:')) {
      eventName = line.slice('event:'.length).trim();
    } else if (line.startsWith('data:')) {
      // The endpoint convention is single-line JSON. If a producer ever
      // sends multi-line data, only the first line is captured here —
      // surface via warn so we notice.
      if (dataLine !== null) {
        warn(new Error('multi-line data: not supported'), frame);
        continue;
      }
      dataLine = line.slice('data:'.length).trim();
    }
    // Other fields (id:, retry:) ignored by design.
  }

  if (dataLine === null) return null;

  // Synthetic `done` event for callers that need to detect end-of-stream
  // via a sentinel (some endpoints emit `data: [DONE]`).
  if (dataLine === '[DONE]') {
    return { event: 'done', data: null, raw: frame };
  }

  let data;
  try {
    data = JSON.parse(dataLine);
  } catch (err) {
    warn(err, frame);
    return null;
  }

  return { event: eventName, data, raw: frame };
}
