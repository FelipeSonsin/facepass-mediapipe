// Integração com o MediaPipe (@mediapipe/tasks-vision), modelos oficiais pré-treinados:
//  - Face Landmarker: localiza o rosto e fornece 478 pontos; daqui saem os 5 pontos
//    usados para alinhar o recorte do SFace.
//  - Face Detector com BlazeFace "full range": guarda de multiplicidade. O detector
//    interno do Face Landmarker é de curto alcance e pode não ver uma segunda pessoa
//    mais afastada; se QUALQUER um dos dois vir mais de um rosto, o processo é suspenso.
import { FaceDetector, FaceLandmarker, FilesetResolver, type NormalizedLandmark } from '@mediapipe/tasks-vision'
import { FACE_DETECTION } from '../config/recognition'

export const MEDIAPIPE_MODELS = {
  landmarker: { file: 'face_landmarker.task', version: 'face_landmarker/float16/1' },
  guard: { file: 'blaze_face_full_range.tflite', version: 'blaze_face_full_range/float16/1' },
} as const

export type RunningMode = 'IMAGE' | 'VIDEO'
type ImageInput = HTMLCanvasElement | OffscreenCanvas | HTMLImageElement | HTMLVideoElement | ImageBitmap

export interface FaceObservation {
  /** Pontos do único rosto analisável (presente só quando faceCount === 1). */
  landmarks: NormalizedLandmark[] | null
  /** Quantidade de rostos: o maior valor entre os dois detectores. */
  faceCount: number
  landmarkerFaces: number
  guardFaces: number
}

export interface VisionModels {
  delegate: 'GPU' | 'CPU'
  observe(image: ImageInput, timestampMs?: number): FaceObservation
  close(): void
}

interface Box {
  x: number
  y: number
  w: number
  h: number
}

function iou(a: Box, b: Box) {
  const x1 = Math.max(a.x, b.x), y1 = Math.max(a.y, b.y)
  const x2 = Math.min(a.x + a.w, b.x + b.w), y2 = Math.min(a.y + a.h, b.y + b.h)
  const inter = Math.max(0, x2 - x1) * Math.max(0, y2 - y1)
  return inter / (a.w * a.h + b.w * b.h - inter || 1)
}

function landmarkBox(lm: NormalizedLandmark[], w: number, h: number): Box {
  let minX = 1, minY = 1, maxX = 0, maxY = 0
  for (const p of lm) {
    if (p.x < minX) minX = p.x
    if (p.x > maxX) maxX = p.x
    if (p.y < minY) minY = p.y
    if (p.y > maxY) maxY = p.y
  }
  return { x: minX * w, y: minY * h, w: (maxX - minX) * w, h: (maxY - minY) * h }
}

function sizeOf(image: ImageInput): [number, number] {
  if (image instanceof HTMLVideoElement) return [image.videoWidth, image.videoHeight]
  if (image instanceof HTMLImageElement) return [image.naturalWidth, image.naturalHeight]
  return [image.width, image.height]
}

export async function createVisionModels(runningMode: RunningMode = 'VIDEO'): Promise<VisionModels> {
  const base = import.meta.env.BASE_URL
  const fileset = await FilesetResolver.forVisionTasks(`${base}mediapipe/wasm`)

  const make = async (delegate: 'GPU' | 'CPU') => {
    const [landmarker, guard] = await Promise.all([
      FaceLandmarker.createFromOptions(fileset, {
        baseOptions: { modelAssetPath: `${base}models/${MEDIAPIPE_MODELS.landmarker.file}`, delegate },
        runningMode,
        numFaces: FACE_DETECTION.maxFaces,
        minFaceDetectionConfidence: FACE_DETECTION.minDetectionConfidence,
        minFacePresenceConfidence: FACE_DETECTION.minPresenceConfidence,
        minTrackingConfidence: FACE_DETECTION.minTrackingConfidence,
        outputFaceBlendshapes: false,
        outputFacialTransformationMatrixes: false,
      }),
      FaceDetector.createFromOptions(fileset, {
        // Sempre em CPU: nos testes, a versão GPU deixou de ver o segundo rosto em
        // quadros onde a CPU o encontrou (ver docs/VALIDACAO.md). O modelo é leve.
        baseOptions: { modelAssetPath: `${base}models/${MEDIAPIPE_MODELS.guard.file}`, delegate: 'CPU' },
        runningMode,
        minDetectionConfidence: FACE_DETECTION.guardMinConfidence,
      }),
    ])
    return { landmarker, guard }
  }

  let delegate: 'GPU' | 'CPU' = 'GPU'
  let models: Awaited<ReturnType<typeof make>>
  try {
    models = await make('GPU')
  } catch {
    // Sem WebGL utilizável: o MediaPipe também roda na CPU (WASM).
    delegate = 'CPU'
    models = await make('CPU')
  }
  const { landmarker, guard } = models

  return {
    delegate,
    observe(image, timestampMs) {
      const [w, h] = sizeOf(image)
      const lmResult =
        runningMode === 'VIDEO' ? landmarker.detectForVideo(image, timestampMs ?? performance.now()) : landmarker.detect(image)
      const detResult = runningMode === 'VIDEO' ? guard.detectForVideo(image, timestampMs ?? performance.now()) : guard.detect(image)
      const faces = lmResult.faceLandmarks
      const lmBoxes = faces.map((f) => landmarkBox(f, w, h))
      // Rostos do guarda que não coincidem com nenhum rosto do Face Landmarker são extras.
      const extra = detResult.detections.filter((d) => {
        const b = d.boundingBox
        if (!b) return false
        const box = { x: b.originX, y: b.originY, w: b.width, h: b.height }
        return !lmBoxes.some((lb) => iou(lb, box) > 0.2)
      }).length
      const faceCount = Math.max(faces.length + extra, detResult.detections.length)
      return {
        landmarks: faceCount === 1 && faces.length === 1 ? faces[0] : null,
        faceCount,
        landmarkerFaces: faces.length,
        guardFaces: detResult.detections.length,
      }
    },
    close() {
      landmarker.close()
      guard.close()
    },
  }
}
