// Verificação dos recursos do navegador necessários ao FacePass.

export interface CompatIssue {
  title: string
  action: string
}

export function checkCompatibility(): CompatIssue | null {
  const missing: string[] = []
  if (typeof WebAssembly !== 'object') missing.push('WebAssembly')
  if (typeof Worker === 'undefined') missing.push('Web Workers')
  if (typeof document !== 'undefined' && !document.createElement('canvas').getContext('2d')) missing.push('Canvas')
  if (missing.length === 0) return null
  return {
    title: `Este navegador não oferece recursos necessários (${missing.join(', ')}).`,
    action: 'Use uma versão recente do Chrome, Edge, Firefox ou Safari.',
  }
}

export const dateFormat = new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' })
