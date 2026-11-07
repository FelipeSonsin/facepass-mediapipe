import { access } from 'node:fs/promises'
import { join } from 'node:path'
import express from 'express'
import type { ServerConfig } from './config.ts'
import { JsonPeopleRepository } from './jsonPeopleRepository.ts'
import { createPeopleApi } from './peopleApi.ts'
import { protectLocalFiles } from './privateFiles.ts'
import { LOCAL_HTTP_HEADERS } from './httpHeaders.ts'

/** O mesmo contrato de API usado no desenvolvimento, com o front-end compilado. */
export async function createApplication(config: ServerConfig) {
  try { await access(join(config.distDir, 'index.html')) }
  catch { throw new Error('Front-end compilado ausente. Execute npm run build antes de npm start.') }
  const repository = new JsonPeopleRepository(config.filePath)
  await repository.initialize()
  const app = express()
  app.disable('x-powered-by')
  app.use((_req, res, next) => {
    for (const [name, value] of Object.entries(LOCAL_HTTP_HEADERS)) res.setHeader(name, value)
    next()
  })
  app.use(protectLocalFiles(config.filePath))
  app.use(createPeopleApi(repository))
  // Serve apenas frontend/dist; .env e arquivo de cadastros ficam fora.
  app.use(express.static(config.distDir, { dotfiles: 'deny', redirect: false, maxAge: 0 }))
  app.use((_req, res) => { res.status(404).json({ error: 'Recurso não encontrado.' }) })
  return app
}
