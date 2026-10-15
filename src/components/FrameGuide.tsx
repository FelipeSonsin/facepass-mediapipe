// Moldura de enquadramento sobre o vídeo. A cor e o traço refletem o estado real da
// detecção; durante o cadastro, os 5 segmentos inferiores mostram as amostras capturadas.
export type GuideTone = 'idle' | 'searching' | 'adjust' | 'ready' | 'multiple' | 'granted'

const TONE: Record<GuideTone, { stroke: string; opacity: number; dash?: string }> = {
  idle: { stroke: '#94a3b8', opacity: 0.35 },
  searching: { stroke: '#cbd5e1', opacity: 0.55, dash: '2 7' },
  adjust: { stroke: '#e8b25c', opacity: 0.9 },
  ready: { stroke: '#8fb3ff', opacity: 1 },
  multiple: { stroke: '#cbd5e1', opacity: 0.5, dash: '2 7' },
  granted: { stroke: '#3fbf86', opacity: 1 },
}

// Região-guia em coordenadas de um quadro 100×100 (centralizada, proporção de rosto).
const X = 31
const Y = 13
const W = 38
const H = 74
const L = 9 // comprimento das cantoneiras

export function FrameGuide({ tone, progress }: { tone: GuideTone; progress?: { count: number; total: number } }) {
  const t = TONE[tone]
  const corners = [
    `M${X} ${Y + L} V${Y + 2} Q${X} ${Y} ${X + 2} ${Y} H${X + L}`,
    `M${X + W - L} ${Y} H${X + W - 2} Q${X + W} ${Y} ${X + W} ${Y + 2} V${Y + L}`,
    `M${X + W} ${Y + H - L} V${Y + H - 2} Q${X + W} ${Y + H} ${X + W - 2} ${Y + H} H${X + W - L}`,
    `M${X + L} ${Y + H} H${X + 2} Q${X} ${Y + H} ${X} ${Y + H - 2} V${Y + H - L}`,
  ]
  const segW = (W - 2 * L - 4) / 5
  return (
    <svg className="pointer-events-none absolute inset-0 h-full w-full" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
      <g
        fill="none"
        stroke={t.stroke}
        strokeOpacity={t.opacity}
        strokeLinecap="round"
        strokeDasharray={t.dash}
        vectorEffect="non-scaling-stroke"
        style={{ transition: 'stroke 200ms ease, stroke-opacity 200ms ease' }}
      >
        {corners.map((d) => (
          <path key={d} d={d} strokeWidth={3} vectorEffect="non-scaling-stroke" />
        ))}
      </g>
      {progress ? (
        <g>
          {Array.from({ length: progress.total }, (_, i) => (
            <line
              key={i}
              x1={X + L + 2 + i * (segW + 1) - 0.5}
              x2={X + L + 2 + i * (segW + 1) + segW - 1}
              y1={Y + H}
              y2={Y + H}
              stroke={i < progress.count ? '#8fb3ff' : '#94a3b8'}
              strokeOpacity={i < progress.count ? 1 : 0.35}
              strokeWidth={4}
              strokeLinecap="round"
              vectorEffect="non-scaling-stroke"
              style={{ transition: 'stroke 200ms ease, stroke-opacity 200ms ease' }}
            />
          ))}
        </g>
      ) : null}
    </svg>
  )
}
