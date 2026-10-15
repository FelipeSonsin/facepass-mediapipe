# Decisões técnicas

## Divisão de responsabilidades

| Etapa | Quem faz | Onde |
|---|---|---|
| Localizar o rosto e obter 478 pontos | MediaPipe Face Landmarker (pré-treinado, Apache 2.0) | `src/vision/faceLandmarker.ts` |
| Perceber uma segunda pessoa | Face Landmarker (`numFaces: 2`) **e** BlazeFace *full range* como guarda | `src/vision/faceLandmarker.ts` |
| Converter os 478 pontos nos 5 pontos do SFace | Mapeamento medido contra o YuNet | `src/vision/keypoints.ts` |
| Alinhar e recortar 112×112 | Porta de `FaceRecognizerSFImpl::alignCrop` do OpenCV | `src/sface/similarityTransform.ts`, `src/sface/align.ts` |
| Gerar o embedding (128 valores) | SFace 2021dec no ONNX Runtime Web (WASM) | `src/sface/sface.worker.ts` |
| Comparar e decidir | Cosseno + regra de combinação + limiar + margem | `src/recognition/match.ts` |
| Estabilizar e invalidar resultados | Máquina de estados com sessão e horário do quadro | `src/recognition/stabilizer.ts` |
| Coletar as 5 amostras do cadastro | Máquina de estados testável | `src/enrollment/enrollmentSession.ts` |
| Câmera única e compartilhada | Controlador com `generation` | `src/camera/cameraController.ts` |
| Ciclo único de análise | Analisador de quadros | `src/vision/analyzer.ts` |
| Persistência | API local + `banco.json` (Node.js) | `server/`, `src/storage/` |

A identificação **nunca** usa só pontos, formato do rosto ou presença de face: a decisão vem
sempre da comparação de embeddings do SFace.

## Reprodução fiel do pré-processamento oficial do SFace

Reproduzido de [`face_recognize.cpp`](https://github.com/opencv/opencv/blob/4.x/modules/objdetect/src/face_recognize.cpp):

- **Pontos**: ordem do YuNet — olho direito, olho esquerdo, nariz, canto direito e canto esquerdo da boca (direito/esquerdo **da pessoa**).
- **Transformação**: `getSimilarityTransformMatrix` portado linha a linha (Umeyama, com o mesmo modelo de destino e a mesma média fixa `56,0262; 71,9008`, SVD 2×2 analítica, tratamento de posto 1).
- **Recorte**: `warpAffine` 112×112, interpolação bilinear com coordenadas quantizadas em 1/32 de pixel (como o OpenCV), borda constante 0, arredondamento para 8 bits.
- **Tensor**: `blobFromImage(scale=1, mean=0, swapRB=true)` ⇒ NCHW `[1,3,112,112]`, float32, canais **RGB**, valores **0–255**, sem normalização. (No OpenCV a imagem é BGR e `swapRB` a converte para RGB; no navegador o canvas já é RGBA.)
- **Comparação**: normalização L2 e produto interno (`FR_COSINE`).

Resultado medido: com os mesmos 5 pontos, o embedding do navegador tem cosseno ≥ 0,99992 com o
`FaceRecognizerSF` oficial (detalhes em [VALIDACAO.md](VALIDACAO.md)).

## Mapeamento MediaPipe → 5 pontos

Testei 80 combinações semanticamente válidas (centro do olho por cantos, íris, pálpebras ou
cantos+íris; nariz 1/4/5/19/94; boca 61/291, 78/308, 62/292, 76/306) e escolhi a que deixa o
embedding mais próximo do pipeline oficial YuNet + `alignCrop`: **ponto médio dos cantos dos
olhos (33/133 e 362/263), nariz 4, boca 62/292**. Usar os cantos (e não a íris) também torna o
alinhamento independente da direção do olhar. Ressalva: a escolha foi medida em 2 identidades
(amostras públicas do OpenCV) com variações; ela é comparativa, não uma medida de acerto.

## Mesmo quadro para pontos e pixels

O analisador copia o quadro do `<video>` para um canvas e, a partir daí, **tudo** usa esse canvas:
o MediaPipe detecta nele e os pixels enviados ao SFace saem dele. Assim pontos e imagem vêm
sempre do mesmo quadro. O buffer de pixels é transferido ao worker e descartado após o recorte;
só o vetor de 128 números volta.

## Mesmo processamento no cadastro e no reconhecimento

As duas abas usam o mesmo analisador, o mesmo mapeamento de pontos, o mesmo alinhamento, o mesmo
worker e o mesmo modelo. Cada cadastro grava `modelVersion` e `pipelineVersion`; cadastros de
outra versão não são comparados e aparecem marcados na lista.

## Regra de comparação (provisória)

Configuração central: [`src/config/recognition.ts`](../src/config/recognition.ts).

1. **Pontuação por pessoa**: média das **3 maiores** similaridades entre o quadro e as 5 amostras
   da pessoa. Uma amostra ruim não decide sozinha, e uma única amostra parecida por acaso não basta.
2. **Limiar de aceitação**: **0,45**. Referência oficial do OpenCV Zoo: 0,363 (LFW). Escolhemos
   um valor mais restritivo porque um falso “Acesso liberado” é pior que pedir mais um instante de câmera.
3. **Ambiguidade**: com 2+ pessoas cadastradas, se `melhor − segunda < 0,08`, a identidade não
   é confirmada: após 3 análises consecutivas ambíguas, aparece “Acesso negado”, sem nome.
4. **Estabilidade**: **3 análises novas e consecutivas** (quadros distintos, em ordem) com a mesma
   pessoa antes de liberar. Um rosto desconhecido também exige 3 análises consecutivas para
   mostrar “Acesso negado”. Mudança de decisão remove o resultado anterior na hora e reinicia
   a sequência. Ausência e múltiplos rostos removem o resultado; qualidade insuficiente interrompe
   a sequência e remove a negação, enquanto uma liberação já confirmada fica sujeita ao vencimento.
5. **Vencimento**: o resultado e a sequência expiram se a última análise correspondente tiver mais de **1,2 s** (por exemplo,
   processamento travado ou rosto inutilizável). Não existe temporizador que mantenha a liberação
   depois que a pessoa sai: a próxima análise válida sem ela já remove o resultado.
6. Nunca se escolhe “o mais parecido” quando a semelhança é insuficiente.

Esses valores precisam ser recalibrados com amostras reais e autorizadas, separadas das do
cadastro — use `calibracao.html` (ver [VALIDACAO.md](VALIDACAO.md#calibração-com-pessoas-reais)).

## Sessões e resultados atrasados

Toda troca de câmera, de aba, de cadastros (inclusive exclusão) ou reinício abre uma **nova
sessão** no analisador. Cada análise leva `session`, `frameId` e `frameTime`. O estabilizador
descarta resultados de outra sessão, de quadros anteriores ao último aplicado e mais velhos que
1,2 s. Assim, uma inferência atrasada nunca libera acesso depois de uma mudança.

## Cadastro

- 5 amostras válidas, com intervalo mínimo de 450 ms e pequena variação de posição (≥ 4% da
  distância entre os olhos) entre amostras consecutivas.
- Cada nova amostra precisa ter cosseno ≥ 0,55 com a média das anteriores; ao final, todos os
  pares também. Se não, a captura recomeça e a pessoa é orientada.
- Segunda pessoa no quadro: a captura recomeça. Rosto ausente ou ruim: pausa com orientação;
  mais de 4 s assim: a captura é interrompida e a pessoa é orientada a recomeçar.
- Antes de gravar, as novas amostras são comparadas com os cadastros existentes. Se o rosto já
  existe, um diálogo pergunta se deve **atualizar** o cadastro existente; nada é sobrescrito em
  silêncio. Nomes repetidos são permitidos (identificador interno é um UUID) e sinalizados.
- A confirmação “Cadastro concluído” só aparece depois que a API confirma a gravação no `banco.json`.

## Detecção de várias pessoas

O detector interno do Face Landmarker é o BlazeFace de **curto alcance** (selfie). Nos testes,
ele deixou de ver um segundo rosto menor em 4 de 6 quadros. Por isso há uma guarda com o
BlazeFace **full range**; se qualquer detector vir mais de um rosto, cadastro e identificação
são suspensos. A guarda roda em CPU: nos testes, a versão GPU perdeu rostos que a CPU encontrou.

## Desempenho

- O vídeo é exibido pelo navegador na taxa nativa; a análise roda a no máximo **12 quadros/s**
  sobre uma cópia de até 640 px de largura (`requestVideoFrameCallback`, só quadros novos).
- O SFace roda num **Web Worker** próprio, uma inferência por vez (quadros chegam enquanto ele
  está ocupado são analisados, mas não geram embedding). Medido: ~35 ms por embedding.
- O MediaPipe roda na thread principal (≈16 ms por quadro analisado, medido em Edge headless).
  Mover o MediaPipe para um worker é uma melhoria possível; não foi feito nesta versão porque o
  carregador WASM do tasks-vision em *module workers* exige ajustes, e a medição mostrou a
  interface responsiva.
- Backend **WASM** do ONNX Runtime com 1 thread + SIMD: suficiente, e dispensa cabeçalhos
  COOP/COEP na hospedagem. WebGPU/multithread não foram adotados por não haver ganho necessário.
- O MediaPipe só é baixado quando a câmera é ativada (import dinâmico); o bundle inicial tem ~280 kB.

## Privacidade e armazenamento

- Só vídeo é solicitado (sem microfone), e só após clique.
- Imagens ficam no navegador; nomes e embeddings são enviados apenas à API local. Nenhum recurso vem de CDN.
- O `banco.json` guarda: `id`, `name`, `samples` (5 vetores de 128 números), `createdAt`,
  `updatedAt`, `modelVersion`, `pipelineVersion`. Nenhuma imagem.
- Excluir remove o registro persistido e a representação em memória, e abre nova sessão (a
  liberação daquela pessoa some).
- O IndexedDB é usado somente para migrar uma vez os registros da versão anterior, preservando
  os originais. A persistência futura pode trocar de repositório sem alterar o reconhecimento.
  Detalhes em [BANCO.md](BANCO.md).

## Limites de segurança

O FacePass demonstra identificação facial com confirmação visual. **Ele não é um mecanismo de
autorização segura**: a confirmação na tela não deve, sozinha, liberar portas, contas ou recursos
externos. **Não há detecção de vivacidade (anti-spoofing)**: fotos, telas ou vídeos de uma pessoa
cadastrada podem ser aceitos; resistência a isso exige validação específica. Os dados ficam no
arquivo local e podem ser lidos por quem tem acesso ao computador e à pasta do projeto.
