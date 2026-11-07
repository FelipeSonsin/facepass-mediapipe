import type { IncomingMessage, ServerResponse } from 'node:http'
import { basename } from 'node:path'

/** Proteção compartilhada por desenvolvimento, preview e servidor final. */
export function protectLocalFiles(filePath: string) {
  const privateNames = ['banco.json', basename(filePath)].map((name) => name.toLowerCase())
  return (req: IncomingMessage, res: ServerResponse, next: () => void) => {
    let path: string
    try { path = decodeURIComponent(new URL(req.url ?? '/', 'http://localhost').pathname).replaceAll('\\', '/') }
    catch { res.writeHead(400); res.end('Endereço inválido.'); return }
    const blocked = path.split('/').some((part) => {
      const name = part.toLowerCase()
      return name === '.env' || name.startsWith('.env.') ||
        privateNames.some((privateName) => name === privateName || name.startsWith(`${privateName}.`))
    })
    if (blocked) {
      res.writeHead(403, { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' })
      res.end('Arquivo privado do servidor.')
      return
    }
    next()
  }
}
