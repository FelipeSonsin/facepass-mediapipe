import { afterEach, describe, expect, it, vi } from 'vitest'
import { SfaceEmbedder } from './sfaceClient'

class SimulatedWorker extends EventTarget {
  static last: SimulatedWorker
  terminate = vi.fn()
  postMessage = vi.fn()
  constructor() { super(); SimulatedWorker.last = this }
}

const frame = () => ({ width: 1, height: 1, pixels: new ArrayBuffer(4) })
function ready(worker: SimulatedWorker) {
  worker.dispatchEvent(new MessageEvent('message', { data: { type: 'ready', inputName: 'data', outputName: 'fc1', inputShape: ['1', '3', '112', '112'] } }))
}
function crash(worker: SimulatedWorker) {
  const event = new Event('error')
  Object.defineProperty(event, 'message', { value: 'Falha simulada do worker' })
  worker.dispatchEvent(event)
}

afterEach(() => { vi.unstubAllGlobals() })

describe('Recuperação do worker SFace', () => {
  it('rejeita uma inicialização interrompida', async () => {
    vi.stubGlobal('Worker', SimulatedWorker)
    const embedder = new SfaceEmbedder('/models/teste.onnx')
    const check = expect(embedder.whenReady()).rejects.toThrow('Falha simulada')
    crash(SimulatedWorker.last)
    await check
    expect(embedder.failed).toBe(true)
  })

  it('libera a inferência pendente após falha fatal em vez de travar como ocupada', async () => {
    vi.stubGlobal('Worker', SimulatedWorker)
    const embedder = new SfaceEmbedder('/models/teste.onnx')
    ready(SimulatedWorker.last)
    await embedder.whenReady()
    const result = expect(embedder.embed(frame(), [])).rejects.toThrow('Falha simulada')
    expect(embedder.busy).toBe(true)
    crash(SimulatedWorker.last)
    await result
    expect(embedder.busy).toBe(false)
    await expect(embedder.embed(frame(), [])).rejects.toThrow('Falha simulada')
  })

  it('limpa a fila se o navegador falhar ao transferir o quadro', async () => {
    vi.stubGlobal('Worker', SimulatedWorker)
    const embedder = new SfaceEmbedder('/models/teste.onnx')
    ready(SimulatedWorker.last)
    await embedder.whenReady()
    SimulatedWorker.last.postMessage.mockImplementationOnce(() => { throw new Error('Transferência interrompida') })
    await expect(embedder.embed(frame(), [])).rejects.toThrow('Transferência interrompida')
    expect(embedder.busy).toBe(false)
  })
})
