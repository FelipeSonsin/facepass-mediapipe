# Modelos, versões e licenças

Todos os modelos são **pré-treinados, públicos e open source**. Eles são baixados das fontes
oficiais por `npm run setup` (executado automaticamente antes de `npm run dev` e `npm run build`)
e verificados por tamanho e hash antes de serem usados. O script recusa ponteiros Git LFS.

| Arquivo (em `public/models/`) | Papel no FacePass | Origem oficial | Versão | Tamanho (bytes) | Integridade verificada | Licença |
|---|---|---|---|---|---|---|
| `face_landmarker.task` | Localiza o rosto e fornece 478 pontos (BlazeFace curto alcance + FaceMesh‑V2 + blendshapes, empacotados pelo Google) | `storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/` | float16 / 1 | 3.758.596 | MD5 publicado pelo Google Cloud Storage (`sOcnSQehZEQE/vZrKN1thQ==`) e sha256 `64184e22…0bc9ff` | Apache 2.0 (model cards do BlazeFace e do FaceMesh‑V2) |
| `blaze_face_full_range.tflite` | Guarda de multiplicidade: percebe uma segunda pessoa mais afastada | `storage.googleapis.com/mediapipe-models/face_detector/blaze_face_full_range/float16/1/` | float16 / 1 | 1.083.786 | MD5 do GCS (`XeN2/MhVJzxccgdm02UjoA==`) e sha256 `3698b18f…ed2b181b` | Apache 2.0 (model card do BlazeFace) |
| `face_recognition_sface_2021dec.onnx` | Gera o embedding de identidade (128 valores) | [OpenCV Zoo · face_recognition_sface](https://github.com/opencv/opencv_zoo/tree/main/models/face_recognition_sface), baixado de `media.githubusercontent.com` (binário real, não o ponteiro LFS) | 2021dec (float32) | 38.696.353 | sha256 `0ba9fbfa…087c34e79`, igual ao `oid` do ponteiro Git LFS publicado no repositório | Apache 2.0 (`LICENSE` da pasta do modelo no OpenCV Zoo) |

O texto da licença Apache 2.0 está em [`public/models/licenses/APACHE-2.0.txt`](../public/models/licenses/APACHE-2.0.txt).
Os hashes completos estão em [`scripts/fetch-models.mjs`](../scripts/fetch-models.mjs).

## Créditos

- **SFace**: Yaoyao Zhong (modelo, perda SFace — *“SFace: Sigmoid-Constrained Hypersphere Loss for Robust Face Recognition”*), Chengrui Wang (conversão ONNX). Treinado como MobileFaceNet. OpenCV Zoo.
- **MediaPipe Face Landmarker / BlazeFace / FaceMesh‑V2**: Google.

## Bibliotecas de execução

| Pacote | Versão instalada (lockfile) | Licença | Uso |
|---|---|---|---|
| `@mediapipe/tasks-vision` | 1.1.0 | Apache‑2.0 | Executa Face Landmarker e Face Detector (WASM + WebGL) |
| `onnxruntime-web` | 1.30.0 | MIT | Executa o SFace no backend WASM, dentro de um Web Worker |
| `react` / `react-dom` | 19.3.0 | MIT | Interface |
| `vite` | 8.3.4 | MIT | Servidor de desenvolvimento e build |
| `tailwindcss` | 4.3.3 | MIT | Estilos |
| `lucide-react` | 1.53.0 | ISC | Ícones |
| `@fontsource/ibm-plex-sans` | 5.3.0 | OFL‑1.1 | Fonte IBM Plex Sans, servida localmente |

Os runtimes WebAssembly do MediaPipe são copiados de `node_modules` para `public/mediapipe/wasm`
(`scripts/copy-runtime.mjs`); o `.wasm` do ONNX Runtime é empacotado pelo Vite. Nada é carregado de CDN.

## Ao trocar um modelo

Qualquer mudança de modelo, de pontos faciais, de alinhamento ou de tensor muda os embeddings.
Incremente `PIPELINE_VERSION` em `src/config/recognition.ts`: cadastros antigos passam a ser
marcados como “de uma versão anterior” e deixam de ser comparados.
