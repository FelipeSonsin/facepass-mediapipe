import { basename, resolve, sep } from 'node:path'
import type { Plugin, PreviewServer, ViteDevServer } from 'vite'
import { JsonPeopleRepository } from './jsonPeopleRepository.ts'
import { createPeopleApi } from './peopleApi.ts'
import { readServerConfig } from './config.ts'
import { protectLocalFiles } from './privateFiles.ts'

export function localDatabase(): Plugin {
  const { filePath, root } = readServerConfig()
  const repository = new JsonPeopleRepository(filePath)
  const generatedDirectories = ['validation/out', 'backend/data', 'backend/dist', '.npm-cache'].map((path) => resolve(root, path))
  const install = async (server: ViteDevServer | PreviewServer) => {
    await repository.initialize()
    server.middlewares.use(protectLocalFiles(filePath))
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
              basename(absolute) === 'banco.json' || basename(absolute).startsWith('banco.json.') ||
              generatedDirectories.some((directory) => absolute === directory || absolute.startsWith(`${directory}${sep}`))
          },
        },
      },
    }),
    configureServer: install,
    configurePreviewServer: install,
  }
}
