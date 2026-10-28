export class PayloadTooLargeError extends Error {
  constructor(limit: number) { super(`Request body exceeds ${limit} bytes.`); this.name = 'PayloadTooLargeError' }
}

/** Count streamed bytes as well as Content-Length; clients cannot bypass the limit with chunked bodies. */
export async function readJson(request: Request, limit: number): Promise<unknown> {
  const length = request.headers.get('content-length')
  if (length !== null && (!/^\d+$/.test(length) || Number(length) > limit)) throw new PayloadTooLargeError(limit)
  if (!request.body) throw new TypeError('A JSON request body is required.')
  const reader = request.body.getReader()
  const chunks: Uint8Array[] = []
  let size = 0
  try {
    for (;;) {
      const chunk = await reader.read()
      if (chunk.done) break
      size += chunk.value.byteLength
      if (size > limit) { await reader.cancel(); throw new PayloadTooLargeError(limit) }
      chunks.push(chunk.value)
    }
  } finally { reader.releaseLock() }
  const bytes = new Uint8Array(size)
  let offset = 0
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength }
  return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes))
}
