import { analyzer } from '../vision/analyzer'
import { camera } from './cameraController'

/** Ativa a câmera e, em paralelo, carrega os modelos (uma única vez). */
export function startCamera() {
  void analyzer.ensureModels()
  void camera.start()
}
