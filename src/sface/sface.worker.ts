/// <reference lib="webworker" />
// Worker dedicado ao SFace: alinhamento, montagem do tensor e inferência ONNX (backend WASM).
// Fica fora da thread principal para que vídeo e controles permaneçam responsivos.
import * as ort from 'onnxruntime-web/wasm'
// URL do binário WebAssembly do ORT, empacotado pelo Vite (sem CDN).
import ortWasmUrl from 'onnxruntime-web/ort-wasm-simd-threaded.wasm?url'
import { alignCrop, toSfaceTensor } from './align'
import { l2Normalize } from '../recognition/embedding'
import type { SfaceRequest, SfaceResponse } from './protocol'

declare const self: DedicatedWorkerGlobalScope

let session: ort.InferenceSession | null = null
let inputName = 'data'
let outputName = 'fc1'

function post(msg: SfaceResponse, transfer: Transferable[] = []) {
  self.postMessage(msg, transfer)
}

async function init(modelUrl: string) {
  ort.env.wasm.wasmPaths = { wasm: ortWasmUrl }
  // Uma thread com SIMD é suficiente para o SFace (~0,15 GFLOP) e dispensa COOP/COEP.
  ort.env.wasm.numThreads = 1
  ort.env.logLevel = 'error'
  const res = await fetch(modelUrl)
  if (!res.ok) throw new Error(`HTTP ${res.status} ao baixar o modelo SFace`)
  const bytes = new Uint8Array(await res.arrayBuffer())
  session = await ort.InferenceSession.create(bytes, {
    executionProviders: ['wasm'],
    graphOptimizationLevel: 'all',
    // O ONNX do SFace lista os pesos também como entradas (exportador antigo); o ORT avisa
    // sobre cada um. São avisos inofensivos, então só erros são registrados.
    logSeverityLevel: 3,
  })
  inputName = session.inputNames[0]
  outputName = session.outputNames[0]
  const meta = session.inputMetadata[0]
  return { inputName, outputName, inputShape: meta && 'shape' in meta ? meta.shape.map(String) : [] }
}

self.onmessage = async (ev: MessageEvent<SfaceRequest>) => {
  const msg = ev.data
  try {
    if (msg.type === 'init') {
      const info = await init(msg.modelUrl)
      post({ type: 'ready', ...info })
    } else if (msg.type === 'embed') {
      if (!session) throw new Error('Modelo SFace ainda não carregado')
      const started = performance.now()
      const frame = { width: msg.width, height: msg.height, data: new Uint8ClampedArray(msg.pixels) }
      const crop = alignCrop(frame, msg.points)
      const input = new ort.Tensor('float32', toSfaceTensor(crop), [1, 3, 112, 112])
      const outputs = await session.run({ [inputName]: input })
      const out = outputs[outputName]
      const raw = new Float32Array(out.data as Float32Array)
      input.dispose()
      out.dispose()
      const embedding = l2Normalize(raw)
      const transfer: Transferable[] = [embedding.buffer]
      const cropOut = msg.returnCrop ? crop : undefined
      if (cropOut) transfer.push(cropOut.buffer)
      post(
        {
          type: 'embedding',
          id: msg.id,
          embedding,
          rawNorm: Math.hypot(...raw),
          ms: performance.now() - started,
          crop: cropOut,
        },
        transfer,
      )
    } else if (msg.type === 'dispose') {
      await session?.release()
      session = null
      post({ type: 'disposed' })
    }
  } catch (err) {
    post({ type: 'error', id: 'id' in msg ? msg.id : undefined, message: err instanceof Error ? err.message : String(err) })
  }
}
