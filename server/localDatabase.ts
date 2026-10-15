import { basename, resolve } from 'node:path'
import type { Plugin, PreviewServer, ViteDevServer } from 'vite'
import { JsonPeopleRepository } from './jsonPeopleRepository.ts'
import { createPeopleApi } from './peopleApi.ts'

export function localDatabase(): Plugin {
  const filePath = resolve(process.env.FACEPASS_DB_FILE || 'banco.json')
  const repository = new JsonPeopleRepository(filePath)
  const privateNames = ['banco.json', basename(filePath)].map((name) => name.toLowerCase())
  const install = async (server: ViteDevServer | PreviewServer) => {
    await repository.initialize()
    server.middlewares.use((req, res, next) => {
      let path: string
      try { path = decodeURIComponent(new URL(req.url ?? '/', 'http://localhost').pathname).replaceAll('\\', '/') }
      catch { res.writeHead(400); res.end('Endereço inválido.'); return }
      // O arquivo nunca é um recurso estático, nem via /@fs/ ou ?raw.
      if (path.split('/').some((part) => privateNames.some((name) => part.toLowerCase() === name || part.toLowerCase().startsWith(`${name}.`)))) {
        res.writeHead(403, { 'Content-Type': 'text/plain; charset=utf-8' })
        res.end('Arquivo de dados privado. Use a API local.')
        return
      }
      next()
    })
    server.middlewares.use(createPeopleApi(repository))
  }
  return {
    name: 'facepass-local-json-database',
    config: () => ({
      server: {
        watch: {
          // Gravar um cadastro não deve recarregar a página durante a captura.
          ignored: (path: string) => {
            const absolute = resolve(path)
            return absolute === filePath || absolute.startsWith(`${filePath}.`) ||
              basename(absolute) === 'banco.json' || basename(absolute).startsWith('banco.json.')
          },
        },
      },
    }),
    configureServer: install,
    configurePreviewServer: install,
  }
}
