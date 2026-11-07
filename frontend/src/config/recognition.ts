// Configuração técnica central do FacePass.
//
// TODOS OS VALORES SÃO PROVISÓRIOS. Eles partem da referência oficial do SFace e de
// margens conservadoras, mas precisam ser recalibrados com amostras reais e
// autorizadas, separadas das usadas no cadastro (ver docs/VALIDACAO.md, seção
// "Calibração"). A justificativa de cada valor está ao lado dele.

/** Versão do pipeline de processamento gravada em cada cadastro. Se mudar o modelo,
 *  os pontos, o alinhamento ou o tensor, incremente: cadastros antigos deixam de ser
 *  comparados (embeddings de pipelines diferentes não são comparáveis). */
export const PIPELINE_VERSION = 'mp-face-landmarker-v1+sface-2021dec+opencv-aligncrop-v1'

export const FACE_DETECTION = {
  /** Pelo menos 2 para perceber uma segunda pessoa e suspender o processo. */
  maxFaces: 2,
  minDetectionConfidence: 0.5,
  minPresenceConfidence: 0.5,
  minTrackingConfidence: 0.5,
  /** Confiança mínima do detector-guarda (BlazeFace full range) para contar um rosto extra. */
  guardMinConfidence: 0.5,
} as const

export const QUALITY = {
  /** Largura do rosto / largura do quadro. Abaixo disso o recorte de 112 px fica pobre. */
  minFaceWidthRatio: 0.2,
  /** Rosto grande demais tende a sair do quadro durante pequenos movimentos. */
  maxFaceWidthRatio: 0.7,
  /** Distância mínima entre os olhos, em pixels do quadro analisado. No modelo de
   *  112 px do SFace ela é ~35 px; exigir mais evita ampliar o rosto no alinhamento. */
  minInterocularPx: 40,
  /** Margem mínima (fração do quadro) entre o rosto e a borda. */
  edgeMargin: 0.02,
  /** Deslocamento do centro do rosto em relação ao centro do quadro (fração). */
  maxCenterOffset: 0.22,
  /** |nariz − ponto médio dos olhos| / distância entre olhos: estimativa de giro lateral.
   *  0,35 corresponde a ~30–35° de giro. O SFace mantém embeddings estáveis nessa faixa
   *  (nas imagens de teste, um rosto com 0,31 teve cosseno ≥ 0,97 entre variações). */
  maxYawRatio: 0.35,
  /** Inclinação máxima da linha dos olhos, em graus. */
  maxRollDeg: 18,
  /** Luminância média (0–255) aceitável na região do rosto. */
  minBrightness: 55,
  maxBrightness: 225,
} as const

export const MATCHING = {
  /** Similaridade de cosseno mínima para aceitar uma pessoa.
   *  Referência oficial do OpenCV Zoo para o SFace: 0,363 (avaliação em LFW).
   *  Adotamos 0,45, mais restritivo, porque um falso aceite ("Acesso liberado" para
   *  a pessoa errada) é pior que pedir mais um segundo de câmera. Provisório. */
  acceptThreshold: 0.45,
  /** Diferença mínima entre a melhor pessoa e a segunda melhor. Abaixo disso o
   *  resultado é ambíguo e o acesso é negado após confirmação estável. Provisório. */
  ambiguityMargin: 0.08,
  /** Regra de combinação das amostras de cada pessoa: média das K maiores
   *  similaridades entre o quadro e as amostras dessa pessoa. Com 5 amostras e K = 3,
   *  uma amostra ruim não decide sozinha e uma única amostra parecida por acaso
   *  também não basta. */
  topK: 3,
} as const

export const STABILITY = {
  /** Análises novas, de quadros distintos e consecutivas, com a mesma decisão
   *  antes de mostrar "Acesso liberado" ou "Acesso negado". */
  requiredConfirmations: 3,
  /** Um resultado mais antigo que isso (desde o quadro analisado) é considerado
   *  vencido e não pode liberar nem manter a liberação. Cobre travamentos do
   *  processamento sem depender de um temporizador de exibição. */
  maxResultAgeMs: 1200,
} as const

export const ENROLLMENT = {
  samples: 5,
  /** Intervalo mínimo entre amostras: garante momentos distintos. */
  minIntervalMs: 450,
  /** Variação mínima de posição entre amostras consecutivas (deslocamento do centro
   *  do rosto ou do nariz, como fração da distância entre os olhos). Garante pequenas
   *  variações naturais sem exigir movimentos amplos. */
  minPoseChange: 0.04,
  /** Similaridade mínima de cada amostra com a média das anteriores e entre todos os
   *  pares ao final. Fotos da mesma pessoa em sequência ficam bem acima disso; valores
   *  abaixo indicam troca de pessoa ou quadro ruim. Provisório. */
  minConsistency: 0.55,
  /** Tempo máximo sem rosto válido antes de reiniciar a captura. */
  maxPauseMs: 4000,
} as const

export const PROCESSING = {
  /** Frequência de análise (detecção). O vídeo é exibido pelo navegador na taxa
   *  nativa; só a análise é limitada. */
  analysisFps: 12,
  /** Largura máxima do quadro analisado (pontos e pixels vêm deste mesmo quadro). */
  maxAnalysisWidth: 640,
} as const
