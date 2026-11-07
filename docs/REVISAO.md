# Revisão da entrega

## Escopo e arquitetura

O sistema mantém **MediaPipe + SFace + ONNX Runtime Web**, conforme a orientação final.
Face Landmarker e BlazeFace detectam rostos; o SFace pré-treinado produz embeddings reais
de 128 números. A comparação com as cinco amostras de cada cadastro determina a identidade.
Detectar um rosto, por si só, nunca libera acesso.

O front-end está em `frontend/`, a API e a persistência em `backend/`, e os tipos e as
validações comuns em `shared/`. Há um único `package.json` na raiz para os comandos.
O `.env` foi criado na raiz, com `.env.example` versionável. O nome anterior `env.env`
foi substituído. Não é necessária chave de API para o reconhecimento local.

Esta etapa usa somente `backend/data/banco.json`. Não foi conectado banco de dados externo.
As configurações `EXTERNAL_API_URL` e `EXTERNAL_API_KEY` são espaços opcionais para uma
integração futura; preenchê-las não ativa um provedor automaticamente.

## Conferência dos componentes

| Componente | Conferência e evidência |
|---|---|
| Câmera | Vídeo sem microfone, permissão negada, interrupção da trilha e desligamento; E2E |
| MediaPipe/SFace | Modelos com tamanho/hash conferidos, carregamento real, retry e alinhamento comparado ao OpenCV |
| Cadastro | Nome e autorização, cinco amostras, coerência, variação de pose, duplicidade e gravação confirmada; testes e E2E |
| Acesso liberado | Três confirmações novas da mesma pessoa; nome correto e reconhecimento após atualizar; testes e E2E |
| Acesso negado | Desconhecido e ambiguidade; sem herdar nome/liberação anterior; testes e E2E |
| Ausência/múltiplos rostos | Não concede acesso; orienta enquadramento e remove resultados; testes e E2E |
| Sessões e falhas | Rejeita resultados antigos, expira confirmações e recupera API/modelos; testes e E2E |
| API final | Express serve front-end compilado e `/api/people`; `/api/health` lê o arquivo de cadastros; testes e execução real |
| Persistência | Criação do arquivo, escrita atômica, concorrência entre processos, edição, exclusão, migração e JSON corrompido; testes e E2E |
| Configuração privada | `.env` não é servido ao navegador; variáveis do processo têm prioridade; testes de configuração e servidor |
| Rede | Recursos locais, cabeçalho CSP contra telemetria e nenhuma requisição externa na rodada E2E |
| Calibração | Vinte análises novas com inferência real; cancelamento ao desligar a câmera; E2E |
| Layout | Cadastro e acesso em desktop e 390×844, sem rolagem horizontal; E2E e capturas revisadas |

## Correções realizadas

- Servidor final independente do Vite, configuração central e compilação do back-end.
- Movimentação dos arquivos para frontend/backend, imports atualizados, scripts, testes e
  documentação adaptados. Validações comuns movidas para shared, sem cópias paralelas.
- Correção de `EPERM/EACCES` transitório na disputa de lock do Windows, com espera limitada.
- Artefatos de validação e arquivos de cadastros fora do monitoramento de desenvolvimento.
- Leitura e escrita de imagens/modelos por bytes na validação OpenCV, compatíveis com
  acentos no caminho da pasta.
- Falhas de API visíveis na tela de acesso, retry de cadastros e bloqueio do cadastro
  enquanto os registros estão indisponíveis.
- Expiração aplicada também ao receber um quadro novo, sem depender apenas do timer.
- Limpeza de modelos parcialmente carregados e rejeição de inferências após falha fatal
  do worker, permitindo recarregar sem travar o processamento.
- Interrupção da calibração em mudanças de câmera/cadastros; rótulo de mediana corrigido.
- Bloqueio HTTP do `.env`, JSON e locks; política de rede local para impedir telemetria.

## Resultados desta revisão

- `npm test`: **74/74**, em 11 arquivos.
- `npm run lint`: sem erros.
- `npm run build`: interface e servidor compilados.
- `npm run test:e2e`: **57/57**, executando o servidor final e os modelos reais com câmera simulada.
- Comparação com OpenCV: **10 imagens de rosto único**, cosseno mínimo **0,999923**
  com os mesmos cinco pontos; relatório em `validation/out/report.json`.
- Desenvolvimento: HTTP 200, lista inicial carregada e nenhum erro de navegador no smoke test.
- `npm start`: inicia o servidor final em `http://127.0.0.1:3000` por padrão.

As imagens e vídeos de validação são amostras públicas do OpenCV e não são cadastros reais.
Os testes usam um JSON e um perfil de navegador isolados; o arquivo de cadastros do usuário
é preservado. Capturas e resultado completo: `validation/out/e2e/`.

## Limitações e pendências explícitas

- **Webcam física e pessoas reais ainda precisam de validação e calibração.** Testes com
  vídeos de fotos não medem acurácia biométrica real. O roteiro está em `VALIDACAO.md`.
- A consulta somente de leitura ao Windows encontrou `Integrated Camera` com
  `ConfigManagerErrorCode = 22` (`CM_PROB_DISABLED`: dispositivo desativado), confirmado por
  `Get-PnpDevice` e `Win32_PnPEntity`. A sessão não está elevada. Para a etapa física, habilite
  a câmera no Gerenciador de Dispositivos, autorize o navegador e execute o roteiro.
  Referência: https://learn.microsoft.com/en-us/windows-hardware/drivers/install/cm-prob-disabled.
- Sem detecção de vivacidade. Fotos/telas podem ser aceitas; esta entrega mostra uma decisão
  visual e não foi certificada para controlar portas, contas ou outros recursos.
- Uma segunda pessoa pequena/afastada pode não ser detectada; Firefox e Safari não foram
  verificados nesta rodada.

## Limpeza das pastas antigas

As antigas pastas `src/` e `public/` da raiz foram enviadas à **Lixeira**, após confirmar que
não continham arquivos. A exclusão permanente pelo terminal foi rejeitada pela revisão
automática, e o controle do Explorador estava indisponível. A alternativa reversível via API
de arquivos do Windows foi permitida e concluída. As pastas funcionais `frontend/src/` e
`frontend/public/` foram preservadas. Não restaram diretórios vazios nas árvores de código
`frontend/src/`, `backend/src/` e `shared/`.

## Reutilização e novos componentes

Skills aplicadas nesta sessão: `brainstorming`, `no-duplicate-files`, `correction-review`,
`karpathy-guidelines` e `verification-before-completion`. A conferência final também verificou
59 arquivos nas árvores de código/testes, sem arquivos de zero bytes ou diretórios vazios.

**REUSED_EXISTING_COMPONENT:** pipeline facial, API de pessoas e formato JSON existentes.
**EXTENDED_EXISTING_COMPONENT:** tratamento de falhas, confirmação de identidade, calibração,
persistência e testes. **REFACTORED_EXISTING_COMPONENT:** organização de pastas e validações
comuns, com uma implementação por responsabilidade.

**NEW_COMPONENT_JUSTIFIED:** `backend/src/app.ts` e `index.ts` são necessários porque a API
anterior só iniciava por plugin do Vite. `config.ts` centraliza o `.env` e os caminhos para os
dois modos de execução. `privateFiles.ts` e `httpHeaders.ts` compartilham as proteções entre
Vite e Express, evitando duas implementações divergentes. Os testes adicionais verificam
essas integrações e as falhas demonstradas durante a revisão.
