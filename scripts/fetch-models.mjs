// Baixa os modelos usados pelo FacePass para public/models e verifica a integridade.
// Execução: npm run models   (roda também automaticamente antes de dev/build)
//
// Os hashes abaixo vêm das fontes oficiais:
//  - SFace: o sha256 é o "oid" do ponteiro Git LFS publicado no repositório opencv_zoo.
//  - Face Landmarker: o md5 é o publicado pelo Google Cloud Storage (cabeçalho x-goog-hash);
//    o sha256 foi registrado no primeiro download e passa a ser verificado também.
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const outDir = join(root, 'public', 'models')

const MODELS = [
  {
    file: 'face_recognition_sface_2021dec.onnx',
    // Endpoint de mídia do GitHub: devolve o binário real, não o ponteiro LFS.
    url: 'https://media.githubusercontent.com/media/opencv/opencv_zoo/main/models/face_recognition_sface/face_recognition_sface_2021dec.onnx',
    size: 38696353,
    sha256: '0ba9fbfa01b5270c96627c4ef784da859931e02f04419c829e83484087c34e79',
  },
  {
    file: 'face_landmarker.task',
    url: 'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task',
    size: 3758596,
    md5Base64: 'sOcnSQehZEQE/vZrKN1thQ==',
    sha256: '64184e229b263107bc2b804c6625db1341ff2bb731874b0bcc2fe6544e0bc9ff',
  },
  {
    // Detector BlazeFace de longo alcance: guarda extra para perceber uma segunda pessoa
    // mais afastada, que o detector de curto alcance do Face Landmarker pode não ver.
    file: 'blaze_face_full_range.tflite',
    url: 'https://storage.googleapis.com/mediapipe-models/face_detector/blaze_face_full_range/float16/1/blaze_face_full_range.tflite',
    size: 1083786,
    md5Base64: 'XeN2/MhVJzxccgdm02UjoA==',
    sha256: '3698b18f063835bc609069ef052228fbe86d9c9a6dc8dcb7c7c2d69aed2b181b',
  },
]

function verify(model, buf) {
  const problems = []
  if (buf.length !== model.size) problems.push(`tamanho ${buf.length} ≠ ${model.size}`)
  if (buf.subarray(0, 40).toString('latin1').startsWith('version https://git-lfs')) {
    problems.push('o arquivo é um ponteiro Git LFS, não o modelo')
  }
  const sha = createHash('sha256').update(buf).digest('hex')
  if (model.sha256 && sha !== model.sha256) problems.push(`sha256 ${sha} ≠ ${model.sha256}`)
  if (model.md5Base64) {
    const md5 = createHash('md5').update(buf).digest('base64')
    if (md5 !== model.md5Base64) problems.push(`md5 ${md5} ≠ ${model.md5Base64}`)
  }
  return { ok: problems.length === 0, problems, sha }
}

mkdirSync(outDir, { recursive: true })
let failed = false
for (const model of MODELS) {
  const target = join(outDir, model.file)
  if (existsSync(target)) {
    const result = verify(model, readFileSync(target))
    if (result.ok) {
      console.log(`✓ ${model.file} já presente e íntegro`)
      continue
    }
    console.warn(`! ${model.file} presente mas inválido (${result.problems.join('; ')}). Baixando de novo…`)
  }
  console.log(`↓ ${model.file}`)
  const res = await fetch(model.url)
  if (!res.ok) {
    console.error(`✗ Falha ao baixar ${model.url}: HTTP ${res.status}`)
    failed = true
    continue
  }
  const buf = Buffer.from(await res.arrayBuffer())
  const result = verify(model, buf)
  if (!result.ok) {
    console.error(`✗ ${model.file}: ${result.problems.join('; ')}`)
    failed = true
    continue
  }
  writeFileSync(target, buf)
  console.log(`✓ ${model.file} (${buf.length} bytes, sha256 ${result.sha})`)
}
if (failed) process.exit(1)
