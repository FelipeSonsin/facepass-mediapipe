# Verificações executadas e pendências

Revalidação após separar frontend/backend: 06/11/2026; reprodução em clone limpo: 07/11/2026.
Ambiente atual: Windows, Node 24.20, Chromium 156 em modo headless via Playwright,
Python 3.13.9 e OpenCV 5.0. Medições de tempo da validação original em Edge 154
são mantidas apenas como referência, sem caracterizar desempenho no hardware real.

> **Limitação importante:** o ambiente de desenvolvimento não tinha uma webcam com uma pessoa
> real diante dela. Toda a validação de câmera usou a **câmera simulada do Chromium** alimentada
> por vídeos gerados a partir das imagens públicas de amostra do OpenCV (`lena.jpg`,
> `messi5.jpg`). **A câmera física não foi validada**, e **a taxa de acerto do reconhecimento com
> pessoas reais não foi medida.** Siga o [roteiro de teste manual](#roteiro-de-teste-manual-com-webcam)
> e a [calibração](#calibração-com-pessoas-reais) antes de qualquer uso.

## Reprodução para avaliação a partir do GitHub

Foi criado um clone separado do repositório público, inicialmente no commit `e03492a`, sem
`.env`, `banco.json`, `node_modules`, modelos ou builds copiados da instalação do autor.
O aplicativo foi instalado com Node 24.20 e npm 11.19, e os modelos foram baixados novamente
das fontes oficiais, com conferência de tamanho e hash.

| Verificação na cópia limpa | Resultado |
|---|---|
| `npm ci` | Concluído; neste Windows foi necessário `NODE_USE_SYSTEM_CA=1` para o certificado confiável da rede |
| `npm test` | 74/74 em 11 arquivos |
| `npm run lint` | Sem erros |
| `npm run build` | Front-end e back-end compilados |
| `npm run dev` | Interface, API e modelos disponíveis em HTTP 200, sem `.env` |
| `npm start` | Interface, API e modelos disponíveis em HTTP 200; usada porta alternativa 3101 para preservar a instância do usuário |
| Arquivo de cadastros | Criado automaticamente no clone, vazio e com `schemaVersion: 1` |
| Comparação com OpenCV | 10 imagens comparadas; cosseno mínimo 0,999923 com os mesmos cinco pontos |
| Suíte E2E após corrigir o perfil temporário | 57/57, incluindo cadastro, liberação, negação, persistência, migração e recuperação |

A auditoria demonstrou que um perfil Chromium em caminho longo/sincronizado podia falhar
ao abrir o IndexedDB: o teste de controle falhou no caminho de 226 caracteres e passou no
temporário do Windows de 82 caracteres. O roteiro E2E passou a criar um perfil exclusivo com
`TemporaryDirectory`, fora da pasta do projeto; a suíte completa foi então repetida com êxito.
Isso não altera nem reutiliza o perfil pessoal do navegador de quem está avaliando.

O requisito de Node foi alinhado às dependências atuais: o Vitest 5 não suporta Node 20,
e os testes de persistência usam o carregamento nativo de TypeScript em processos separados.
A versão utilizada nesta reprodução foi Node 24.x; a declaração do projeto aceita a série 22
a partir de 22.18, a série 24 e versões a partir de 26, conforme os requisitos das ferramentas.

O [README](../README.md#como-rodar) contém o procedimento para Git ou Download ZIP, as
orientações para certificado HTTPS e o roteiro manual do avaliador. Python/OpenCV/Playwright
são ferramentas adicionais de validação; não são necessários para abrir e usar o sistema.

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

Testes unitários de equivalência: `frontend/src/sface/similarityTransform.test.ts` (recupera uma
transformação de similaridade conhecida com erro < 0,02 px) e `frontend/src/sface/align.test.ts`
(ordem RGB, layout NCHW, borda 0, sem normalização).

Desempenho medido (Edge headless, GPU por software): SFace ≈ **35 ms** por embedding (mediana,
no worker); MediaPipe ≈ **16 ms** por quadro analisado (mediana; p95 48 ms).

## 2. Testes da lógica (Vitest)

Comando: `npm test` → **74 testes aprovados** em 11 arquivos.

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
- `jsonPeopleRepository.test.ts`: persistência em disco e leitura por outro processo; edição,
  exclusão, escritas concorrentes, importação idempotente e preservação de JSON inválido.
- `peopleApi.test.ts`: validação de pedidos, rejeição de origens externas e erros em JSON.
- `config.test.ts`: leitura do `.env`, prioridade das variáveis do processo, portas inválidas e
  rejeição de arquivos de cadastros em pastas públicas ou geradas.
- `app.test.ts`: servidor final, tipos de conteúdo de HTML/WASM, saúde do arquivo JSON,
  bloqueio de segredos, arquivos privados e origens externas.
- `sfaceClient.test.ts`: falha fatal do worker, inicialização interrompida e transferência de
  quadro com erro, sem deixar a fila ocupada indefinidamente.
- O estabilizador também exige novas confirmações após pausa longa mesmo se o timer
  periódico do navegador estiver suspenso. A persistência cobre escritores em processos separados.

Os testes de comparação e cadastro usam **dados simulados**, isolados e identificados em
`frontend/src/test-support/simulated.ts` (vetores aleatórios com cosseno controlado; não são embeddings reais).

## 3. Testes de ponta a ponta (câmera simulada)

Comandos: `python validation/make_fake_videos.py` (quando os vídeos ainda não existem) e:

```powershell
npm run test:e2e
```

O comando gera o build, inicia o servidor Express final e um arquivo JSON exclusivo em porta livre e usa um perfil
de navegador próprio. Não altera o `banco.json` real. Os resultados atualizados ficam em
`validation/out/e2e/resultados.json`.

Resultado atual da integração JSON: **57 de 57 verificações aprovadas**, incluindo
arquivo, migração, compartilhamento entre perfis e falhas de gravação,
com MediaPipe e SFace reais processando os vídeos da câmera simulada. `npm run build` e
`npm run lint` também passaram. Capturas de acesso liberado e negado, no computador e no
celular, estão em `validation/out/e2e/`.

Além dos cenários abaixo, a rodada atual cobre coleta e interrupção da calibração,
recuperação da API na tela de acesso sem atualizar a página, falha e recarga dos modelos,
`/api/health`, bloqueio do `.env` e ausência de requisições externas.
O pacote MediaPipe pode tentar enviar métricas de uso: `connect-src 'self'` nos cabeçalhos
HTTP bloqueia a telemetria no desenvolvimento, no preview e no servidor final.

Para preparar a validação em outra instalação, use um Python com `opencv-python`, `numpy`
e `playwright`, rode `python -m playwright install chromium`, inicie `npm run dev`, execute
`python validation/opencv_reference.py` e depois `python validation/make_fake_videos.py`.
No PowerShell, `$env:FACEPASS_BROWSER='chromium'` seleciona o Chromium instalado pelo Playwright.
`FACEPASS_PYTHON` permite indicar o executável Python usado pelo E2E. A instalação local isolada
utilizada nesta revisão fica em `validation/out/tools/` e é ignorada pelo Git.

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
| Sem rosto na Interação | “Aguardando identificação”, sem liberar ou negar acesso |
| Desligar a câmera | Liberação removida imediatamente |
| Interrupção do vídeo (trilha encerrada) | Liberação removida e mensagem “O vídeo da câmera foi interrompido.” |
| Troca de aba e volta | Liberação **não** é herdada; volta só após novas confirmações (~0,5 s) |
| Edição de nome | Nome vazio bloqueado; novo nome aparece na Interação |
| Recadastro do mesmo rosto | Diálogo “Este rosto já está cadastrado”; atualiza sem duplicar |
| Exclusão | Pede confirmação; remove o registro persistido; Interação mostra o estado inicial com botão “Cadastrar rosto” |
| Permissão negada | “O acesso à câmera foi bloqueado.” com instrução |
| Falha na API local (simulada) | “Os cadastros não puderam ser lidos…” |
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
toque ≥ 44 px no celular, `prefers-reduced-motion`, `color-scheme: light`, `theme-color`, datas com
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

Os limiares em `frontend/src/config/recognition.ts` são **provisórios**. Para avaliá-los:

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
