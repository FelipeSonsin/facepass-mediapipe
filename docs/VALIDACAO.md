# Verificações executadas e pendências

Validação técnica original: 08/10/2026; fluxo de acesso atualizado em 15/10/2026.
Ambiente: Windows 11, Node 24.1, Microsoft Edge 154 (Chromium)
em modo headless via Playwright, Python 3.13 com OpenCV 5.0.

> **Limitação importante:** o ambiente de desenvolvimento não tinha uma webcam com uma pessoa
> real diante dela. Toda a validação de câmera usou a **câmera simulada do Chromium** alimentada
> por vídeos gerados a partir das imagens públicas de amostra do OpenCV (`lena.jpg`,
> `messi5.jpg`). **A câmera física não foi validada**, e **a taxa de acerto do reconhecimento com
> pessoas reais não foi medida.** Siga o [roteiro de teste manual](#roteiro-de-teste-manual-com-webcam)
> e a [calibração](#calibração-com-pessoas-reais) antes de qualquer uso.

## 1. Validação técnica do processamento facial

Comando: `npm run dev` e, em outro terminal, `npm run validate:pipeline`
(`validation/opencv_reference.py` + página `validacao.html`, só em desenvolvimento).

O script roda o pipeline real no navegador (MediaPipe → 5 pontos → alinhamento → SFace no
ONNX Runtime Web) e compara com a implementação oficial do OpenCV (YuNet + `FaceRecognizerSF`).

| Item verificado | Resultado observado |
|---|---|
| Carregamento real do MediaPipe e do SFace | Ambos carregam; MediaPipe com delegate GPU (WebGL); SFace com entrada `data [1,3,112,112]` e saída `fc1`; ~0,6–0,9 s para os dois em paralelo (modelos já em cache local) |
| Detecção e pontos | 478 pontos por rosto; 5 pontos extraídos em todas as 10 imagens de rosto único |
| **Alinhamento, recorte, canais, tensor e normalização** | Com os **mesmos 5 pontos** do YuNet, embedding do navegador × `FaceRecognizerSF` oficial: **cosseno 0,99992 a 0,99997** (10 imagens). Recortes 112×112 diferem no máximo **3 níveis de cinza** (média ≤ 0,09) |
| Embedding válido | 128 valores finitos; norma bruta 9,8–10,6 antes da normalização L2 |
| Pontos MediaPipe × YuNet | Erro médio de 0,106 da distância entre os olhos com o mapeamento escolhido |
| Pipeline completo MediaPipe+SFace × YuNet+SFace (mesma imagem) | Cosseno médio 0,917 (mín. 0,842). É esperado não ser 1: detectores diferentes geram pontos ligeiramente diferentes. Cadastro e reconhecimento usam o mesmo pipeline |
| Comparação entre embeddings | Variações da mesma foto (rotação 8°, escala 80%, deslocamento, 25% mais escuro): cosseno mín. **0,973**. Identidades diferentes: cosseno máx. **0,169** |
| Duas pessoas no quadro | 4 de 6 quadros sintéticos detectados como 2 rostos (com a guarda *full range*; só o Face Landmarker: 2 de 6). Nos 2 restantes os rostos têm ~9% da largura do quadro: nenhum rosto é analisável (exige-se ≥ 20%), então não há identificação |

Testes unitários de equivalência: `src/sface/similarityTransform.test.ts` (recupera uma
transformação de similaridade conhecida com erro < 0,02 px) e `src/sface/align.test.ts`
(ordem RGB, layout NCHW, borda 0, sem normalização).

Desempenho medido (Edge headless, GPU por software): SFace ≈ **35 ms** por embedding (mediana,
no worker); MediaPipe ≈ **16 ms** por quadro analisado (mediana; p95 48 ms).

## 2. Testes da lógica (Vitest)

Comando: `npm test` → **45 testes aprovados** em 6 arquivos (15/10/2026).

- `match.test.ts`: aceita acima do limiar; **não escolhe o mais parecido** abaixo dele; rejeita
  **ambíguo** (margem < 0,08); aceita com margem suficiente; regra das 3 maiores; sem cadastros.
- `stabilizer.test.ts`: só libera após **3 análises novas consecutivas**; troca de identidade
  reinicia; ausência, desconhecido, ambíguo e múltiplos rostos removem a liberação na hora;
  desconhecido depois de reconhecido não herda; descarta resultado de **sessão anterior**, de
  **quadro anterior** ao último aplicado e **vencido**; vencimento sem novas confirmações;
  quadro inutilizável não renova; exclusão esquece a pessoa. Cobre também negação estável para
  desconhecido e ambiguidade, transição entre negado e liberado, remoção da negação sem rosto,
  com múltiplas pessoas ou qualidade insuficiente, vencimento e reinício da sequência.
- `enrollmentSession.test.ts`: conclui com 5 amostras; reinicia com 2 pessoas; reinicia com
  amostra incoerente (outra pessoa); pausa sem rosto e interrompe após 4 s; pausa por qualidade;
  exige pequena variação de posição; respeita intervalo mínimo; ignora embedding anterior a reinício.
- `stats.test.ts`: estatísticas da calibração.

Os testes de comparação e cadastro usam **dados simulados**, isolados e identificados em
`src/test-support/simulated.ts` (vetores aleatórios com cosseno controlado; não são embeddings reais).

## 3. Testes de ponta a ponta (câmera simulada)

Comandos: `python validation/make_fake_videos.py`, `npm run build`, `npm run preview` e,
em outro terminal PowerShell:

```powershell
$env:FACEPASS_URL='http://localhost:4173'
python validation/e2e_flows.py
```

O script usa um perfil de navegador exclusivo por execução, preserva os cadastros entre os
cenários e grava o resultado atualizado em `validation/out/e2e/resultados.json`.

Resultado em 15/10/2026 sobre o **build de produção**: **35 de 35 verificações aprovadas**,
com MediaPipe e SFace reais processando os vídeos da câmera simulada. `npm run build` e
`npm run lint` também passaram. Capturas de acesso liberado e negado, no computador e no
celular, estão em `validation/out/e2e/`.

| Verificação | Observado |
|---|---|
| Cadastro com nome vazio / nome curto / sem autorização / câmera desligada | Bloqueado, com mensagem e foco no campo |
| Cadastro sem rosto | Bloqueado: “Nenhum rosto detectado…” |
| Cadastro com duas pessoas | Bloqueado: “Há mais de uma pessoa na câmera…” |
| Cadastro com 5 amostras | Concluído ~2,5 s após clicar; confirmação só após gravar |
| Persistência após atualizar a página | Cadastro continua na lista |
| Reconhecimento da pessoa cadastrada | “Acesso liberado” + “Olá, nome” ~1,2 s após ativar a câmera |
| Navegação após cadastro | “Testar acesso agora” abre a página de teste e inicia novas confirmações com a câmera ativa |
| Desconhecido | “Acesso negado”, sem saudação ou nome de pessoa cadastrada; conferido também no celular |
| Desconhecido entra após pessoa reconhecida | A liberação some na troca e o desconhecido recebe “Acesso negado” após novas confirmações |
| Pessoa sai da câmera | A liberação some em ~0,1 s (liberado 1,2–6,1 s → vazio 6,2–11,6 s → …) |
| Duas pessoas na Interação | Só a orientação “Fique apenas uma pessoa diante da câmera.”; sem liberação |
| Sem rosto na Interação | Área vazia |
| Desligar a câmera | Liberação removida imediatamente |
| Interrupção do vídeo (trilha encerrada) | Liberação removida e mensagem “O vídeo da câmera foi interrompido.” |
| Troca de aba e volta | Liberação **não** é herdada; volta só após novas confirmações (~0,5 s) |
| Edição de nome | Nome vazio bloqueado; novo nome aparece na Interação |
| Recadastro do mesmo rosto | Diálogo “Este rosto já está cadastrado”; atualiza sem duplicar |
| Exclusão | Pede confirmação; remove o registro persistido; Interação mostra o estado inicial com botão “Cadastrar rosto” |
| Permissão negada | “O acesso à câmera foi bloqueado.” com instrução |
| Falha no armazenamento (IndexedDB indisponível, simulado) | “Os cadastros não puderam ser lidos…” |
| Celular (390×844) | Uma coluna, formulário logo abaixo da câmera, reconhecimento funciona, sem rolagem horizontal |
| Privacidade | Nenhuma requisição para fora do endereço do app durante todos os cenários |

Capturas de tela: `validation/out/e2e/*.png` (geradas pelo script).

**O que o “resultado atrasado depois de mudar de aba” cobre:** o E2E confirma que nada é herdado
na troca de aba; o caso de uma inferência específica chegando atrasada é coberto de forma
determinística pelos testes do estabilizador (sessão e `frameId`), já que não é possível forçar
esse atraso de modo confiável no navegador.

## 4. Revisão visual e de acessibilidade

Capturas revisadas em desktop (1366×900) e celular (390×844). Correções feitas após a revisão:
formulário do cadastro movido para logo abaixo da câmera no celular; texto de sucesso sem marca de
gênero; link “Pular para o conteúdo” sem conflito com a navegação por hash.

Diretrizes aplicadas (web-design-guidelines): rótulos em todos os campos, botões só com ícone com
`aria-label`, foco visível, `aria-live` para resultado e progresso, erros inline com foco no
primeiro campo inválido, confirmação antes de excluir, aviso ao sair durante a captura, alvos de
toque ≥ 44 px no celular, `prefers-reduced-motion`, `color-scheme: dark`, `theme-color`, datas com
`Intl.DateTimeFormat`, áreas seguras, sem `transition: all`, títulos e botões em caixa de frase
(convenção do português).

## Roteiro de teste manual com webcam

Use apenas pessoas que autorizaram o teste. Abra `http://localhost:5173` (ou o endereço HTTPS).

1. **Câmera**: clique em *Ativar câmera*. O navegador deve pedir só a câmera (sem microfone).
   Negue uma vez e confira a mensagem; permita e confira o vídeo espelhado e a moldura.
2. **Cadastro**: nome vazio → erro; nome válido + autorização → *Registrar rosto*. Mova a cabeça
   de leve. Confira “1 de 5 … 5 de 5 amostras” e “Cadastro concluído”.
3. **Segunda pessoa durante o cadastro**: peça para outra pessoa entrar no quadro no meio da
   captura → a captura recomeça com orientação.
4. **Atualizar a página** → o cadastro continua na lista.
5. **Testar acesso**: clique em “Testar acesso agora” após cadastrar; a pessoa cadastrada → “Acesso liberado / Olá, nome”.
6. **Saída**: a pessoa sai da frente da câmera → o resultado some imediatamente.
7. **Desconhecido**: uma pessoa não cadastrada → “Acesso negado”, sem nome.
8. **Troca**: cadastrada e logo depois não cadastrada → o resultado some na troca.
9. **Duas pessoas** → só a orientação discreta; nada é liberado.
10. **Câmera**: desligue pela interface, depois desconecte a webcam USB com o resultado na tela →
    o resultado some e a mensagem aparece.
11. **Edição e exclusão** na lista; depois da exclusão, a pessoa não é mais reconhecida.
12. **Celular** (via HTTPS): repita 2 e 5 com a câmera frontal.
13. **Foto/tela**: mostre uma foto da pessoa cadastrada. Se for aceita, isso confirma a ausência de
    anti-spoofing (limitação conhecida) — registre o resultado.

Anote, para cada passo, o que foi observado. Itens 5–8 também alimentam a calibração abaixo.

## Calibração com pessoas reais

Os limiares em `src/config/recognition.ts` são **provisórios**. Para avaliá-los:

1. Cadastre de 3 a 10 pessoas autorizadas na aba *Cadastrar rosto*.
2. Abra `calibracao.html` **no mesmo endereço** (ex.: `http://localhost:5173/calibracao.html`).
   Os cadastros ficam no armazenamento daquele endereço.
3. Para cada pessoa cadastrada, selecione o nome e clique em *Coletar 20 análises*, em outro
   momento do cadastro, com variações naturais (luz, distância, óculos). Essas análises são
   quadros novos, **separados das amostras do cadastro**.
4. Faça o mesmo com pessoas **não cadastradas** (“Pessoa não cadastrada”).
5. Leia a maior pontuação impostora, a menor genuína e a margem mínima. A página sugere um limiar
   (maior impostora + 0,05) e mostra quantas análises genuínas ficariam abaixo. Exporte o JSON.
6. Ajuste `acceptThreshold` e `ambiguityMargin`, rode `npm test` e repita a coleta.

Exemplo do que **não** fazer: na execução com a câmera simulada, a página mostrou genuínas ≥ 0,97
e impostoras ≤ 0,19 — mas as “genuínas” eram a mesma foto do cadastro. Esses números não
representam uso real e não foram usados para alterar os limiares.

## Pendências reais

- Validar com webcam física e pessoas reais (roteiro acima) e calibrar os limiares.
- Detectar uma segunda pessoa pequena/afastada não é garantido (ver seção 1).
- Sem detecção de vivacidade: fotos e vídeos podem ser aceitos.
- MediaPipe na thread principal (~16 ms por análise); mover para um worker é uma melhoria possível.
- Testado em Edge/Chromium. Firefox e Safari não foram testados nesta entrega.
- O mapeamento dos 5 pontos foi escolhido com 2 identidades públicas; vale reavaliar com mais rostos.
