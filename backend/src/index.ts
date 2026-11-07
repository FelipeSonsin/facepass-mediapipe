import { createApplication } from './app.ts'
import { readServerConfig } from './config.ts'

try {
  const config = readServerConfig()
  const app = await createApplication(config)
  const server = app.listen(config.port, config.host, () => {
    console.log(`FacePass: http://${config.host}:${config.port}`)
    console.log('API e front-end prontos. Cadastros persistidos em arquivo JSON local.')
  })
  server.on('error', (error) => {
    const busy = 'code' in error && error.code === 'EADDRINUSE'
    console.error(busy ? 'Porta ocupada. Altere FACEPASS_PORT no .env ou feche a outra instância.' : error.message)
    process.exitCode = 1
  })
  const shutdown = () => {
    server.close((error) => { process.exitCode = error ? 1 : 0 })
    const deadline = setTimeout(() => { server.closeAllConnections() }, 10_000)
    deadline.unref()
  }
  process.once('SIGINT', shutdown)
  process.once('SIGTERM', shutdown)
} catch (error) {
  console.error(error instanceof Error ? error.message : 'Não foi possível iniciar o FacePass.')
  process.exitCode = 1
}
