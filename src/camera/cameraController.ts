// Controle único da câmera, compartilhado entre as abas.
// Solicita somente vídeo (sem microfone) e apenas após uma ação da pessoa.
import { useSyncExternalStore } from 'react'

export type CameraErrorKind = 'insecure' | 'unsupported' | 'denied' | 'not-found' | 'busy' | 'interrupted' | 'unknown'

export interface CameraState {
  status: 'off' | 'starting' | 'on' | 'error'
  error: CameraErrorKind | null
  stream: MediaStream | null
  /** Muda a cada ativação/desativação; resultados de gerações anteriores são descartados. */
  generation: number
}

export const CAMERA_ERRORS: Record<CameraErrorKind, { title: string; action: string }> = {
  insecure: {
    title: 'A câmera só funciona em conexão segura.',
    action: 'Abra o FacePass por https:// ou por http://localhost.',
  },
  unsupported: {
    title: 'Este navegador não oferece acesso à câmera.',
    action: 'Use uma versão recente do Chrome, Edge, Firefox ou Safari.',
  },
  denied: {
    title: 'O acesso à câmera foi bloqueado.',
    action: 'Permita a câmera no ícone de cadeado da barra de endereço e tente de novo.',
  },
  'not-found': {
    title: 'Nenhuma câmera foi encontrada.',
    action: 'Conecte uma câmera e tente de novo.',
  },
  busy: {
    title: 'A câmera está em uso por outro aplicativo.',
    action: 'Feche o outro aplicativo ou aba que usa a câmera e tente de novo.',
  },
  interrupted: {
    title: 'O vídeo da câmera foi interrompido.',
    action: 'Verifique a conexão da câmera e ative-a de novo.',
  },
  unknown: {
    title: 'Não foi possível ativar a câmera.',
    action: 'Tente de novo. Se persistir, recarregue a página.',
  },
}

function mapError(err: unknown): CameraErrorKind {
  const name = err instanceof DOMException || err instanceof Error ? err.name : ''
  switch (name) {
    case 'NotAllowedError':
    case 'PermissionDeniedError':
    case 'SecurityError':
      return 'denied'
    case 'NotFoundError':
    case 'DevicesNotFoundError':
    case 'OverconstrainedError':
      return 'not-found'
    case 'NotReadableError':
    case 'TrackStartError':
    case 'AbortError':
      return 'busy'
    default:
      return 'unknown'
  }
}

type Listener = () => void

class CameraController {
  private state: CameraState = { status: 'off', error: null, stream: null, generation: 0 }
  private listeners = new Set<Listener>()
  private startToken = 0

  subscribe = (l: Listener) => {
    this.listeners.add(l)
    return () => this.listeners.delete(l)
  }

  get = () => this.state

  private set(patch: Partial<CameraState>) {
    this.state = { ...this.state, ...patch }
    this.listeners.forEach((l) => l())
  }

  async start() {
    if (this.state.status === 'on' || this.state.status === 'starting') return
    if (!window.isSecureContext) return this.fail('insecure')
    if (!navigator.mediaDevices?.getUserMedia) return this.fail('unsupported')
    const token = ++this.startToken
    this.set({ status: 'starting', error: null })
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: { facingMode: 'user', width: { ideal: 1280 }, height: { ideal: 720 }, frameRate: { ideal: 30 } },
      })
      if (token !== this.startToken) {
        // A pessoa desligou a câmera enquanto a permissão era pedida.
        stream.getTracks().forEach((t) => t.stop())
        return
      }
      const [track] = stream.getVideoTracks()
      track.addEventListener('ended', () => {
        if (this.state.stream === stream) this.release('interrupted')
      })
      this.set({ status: 'on', error: null, stream, generation: this.state.generation + 1 })
    } catch (err) {
      if (token === this.startToken) this.fail(mapError(err))
    }
  }

  stop() {
    this.startToken++
    this.release(null)
  }

  /** Erro vindo da reprodução do vídeo (por exemplo, a câmera foi desconectada). */
  reportInterrupted() {
    if (this.state.status === 'on') this.release('interrupted')
  }

  private release(error: CameraErrorKind | null) {
    this.state.stream?.getTracks().forEach((t) => t.stop())
    this.set({
      status: error ? 'error' : 'off',
      error,
      stream: null,
      generation: this.state.generation + 1,
    })
  }

  private fail(error: CameraErrorKind) {
    this.set({ status: 'error', error, stream: null })
  }
}

export const camera = new CameraController()

export function useCamera(): CameraState {
  return useSyncExternalStore(camera.subscribe, camera.get)
}
