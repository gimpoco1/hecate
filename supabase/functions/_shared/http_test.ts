import { PayloadTooLargeError, readJson } from './http.ts'

Deno.test('streamed bodies cannot bypass the byte limit without Content-Length', async () => {
  const request = new Request('https://example.invalid', { method: 'POST', body: new ReadableStream({
    start(controller) { controller.enqueue(new TextEncoder().encode('{"message":"oversized"}')); controller.close() },
  }) })
  try { await readJson(request, 10) }
  catch (error) { if (error instanceof PayloadTooLargeError) return; throw error }
  throw new Error('Oversized streamed JSON was accepted.')
})

Deno.test('valid bounded JSON is decoded', async () => {
  const value = await readJson(new Request('https://example.invalid', { method: 'POST', body: '{"message":"ok"}' }), 100)
  if (!value || typeof value !== 'object' || !('message' in value) || value.message !== 'ok') throw new Error('Valid JSON was not decoded.')
})
