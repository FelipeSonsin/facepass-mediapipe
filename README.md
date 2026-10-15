# FacePass

Cadastro e identificação facial com **processamento no navegador e banco JSON local**. Você cadastra uma pessoa
pelo nome e pelo rosto e, depois, verifica a identidade na página **Testar acesso**, mostrando
“Acesso liberado — Olá, nome” ou “Acesso negado” para um rosto não cadastrado.

- **MediaPipe** (Google, pré-treinado, Apache 2.0) localiza o rosto e seus pontos.
- **SFace** (OpenCV Zoo, pré-treinado, Apache 2.0) gera a “assinatura” numérica do rosto (embedding).
- **ONNX Runtime Web** executa o SFace no navegador.
- **API local em Node.js** guarda os cadastros no arquivo `banco.json`, na raiz do projeto.

Sem API paga ou servidor de reconhecimento. Imagens não saem do navegador; apenas nomes,
assinaturas faciais e metadados são enviados à API deste computador.

> ⚠️ **Importante:** o FacePass é uma demonstração de identificação facial com confirmação
> visual. A mensagem “Acesso liberado” **não é, por si só, uma autorização segura** e não deve
> liberar portas, contas ou outros recursos. O app **não detecta fotos, telas ou vídeos** de uma
> pessoa (não há anti-spoofing); isso exige validação específica. Os limiares de comparação são
> **provisórios** até serem calibrados com pessoas reais (veja [Calibração](docs/VALIDACAO.md#calibração-com-pessoas-reais)).

## Do que você precisa

- [Node.js](https://nodejs.org/) 20.19 ou mais recente (testado com 24.1).
- Um navegador recente: Chrome, Edge, Firefox ou Safari (testado em Edge/Chromium).
- Uma webcam.
- Internet **na primeira instalação**, para baixar as dependências e os modelos (~44 MB).

## Como rodar

Abra um terminal na pasta do projeto e execute:

```bash
npm install
npm run dev
```

Abra **http://localhost:5173** no navegador.

O `npm run dev` prepara tudo antes de iniciar: copia o runtime do MediaPipe e baixa os modelos
para `public/models/`, conferindo tamanho e hash de cada arquivo. Se um download falhar ou um
arquivo estiver corrompido, a mensagem diz qual. Para só preparar os arquivos: `npm run setup`.

A API de cadastros inicia junto com o site, sem outro terminal. O servidor cria `banco.json`
automaticamente se ele não existir. Se já existir, preserva os registros.

### Gerar a versão de produção

```bash
npm run build      # gera a pasta dist/
npm run preview    # serve dist/ em http://localhost:4173 para conferir
```

O `npm run preview` também inicia a API local e usa o mesmo `banco.json` do desenvolvimento.
Servir apenas a pasta `dist/` em uma hospedagem estática não disponibiliza o banco: esta etapa
precisa do servidor Node.js. A API atual foi feita para uso local neste computador.

### Outros comandos

| Comando | O que faz |
|---|---|
| `npm test` | Testes da lógica (comparação, estabilização, cadastro, alinhamento) |
| `npm run test:e2e` | Build e testes completos com câmera simulada, servidor e banco isolados |
| `npm run lint` | Verificação de código |
| `npm run validate:pipeline` | Compara o pipeline do navegador com o OpenCV oficial (requer Python; ver [VALIDACAO.md](docs/VALIDACAO.md)) |

## Como usar

### 1. Cadastrar rosto

1. Digite o **nome** da pessoa.
2. Clique em **Ativar câmera** e permita o acesso (só a câmera é pedida, sem microfone).
3. Posicione o rosto dentro da moldura. Quando aparecer “Rosto posicionado”, está pronto.
4. Marque a **autorização** e clique em **Registrar rosto**.
5. Mova a cabeça bem de leve enquanto o app coleta **5 amostras** (“3 de 5 amostras”…).
6. Aguarde “Cadastro concluído” e clique em **Testar acesso agora** para abrir a página de teste.
   A câmera continua ativa, e a identificação começa com novas análises.

Dicas: luz de frente para o rosto, sem janela ou lâmpada atrás; fique só você diante da câmera.
Se outra pessoa entrar, a captura recomeça. Na mesma tela há a lista de pessoas cadastradas,
onde é possível **editar o nome** ou **excluir** um cadastro.

### 2. Testar acesso

Abra a aba **Testar acesso** (`/#/interacao`) e ative a câmera, se estiver desligada.
Após 3 análises consecutivas, uma pessoa cadastrada recebe **Acesso liberado — Olá, nome**;
um rosto não cadastrado recebe **Acesso negado**. Se houver semelhança ambígua entre cadastros,
o acesso também é negado e o app pede uma nova tentativa, sem exibir um nome.
Sem rosto, aparece “Aguardando identificação”, sem decisão de acesso. Com duas pessoas ou enquadramento ruim, siga a
orientação na câmera. Ao trocar de pessoa, desligar a câmera ou mudar de página, o resultado
anterior é descartado; um resultado sem novas confirmações expira em até 1,2 segundo.

## Onde ficam os dados

- Os cadastros ficam no **arquivo `banco.json`, na raiz do projeto**. Outro navegador ou perfil
  acessando esse servidor lê os mesmos registros. Desenvolvimento e preview também compartilham
  esse arquivo. Atualize a página para carregar alterações feitas por outra sessão.
- Limpar os dados do navegador não apaga o banco JSON. Faça uma cópia de `banco.json` para backup;
  mantenha os servidores fechados ao restaurar ou editar o arquivo manualmente.
- O que é salvo: identificador interno, nome, 5 embeddings (128 números cada), datas e versão
  do modelo/processamento. **Nenhuma foto ou quadro do vídeo é salvo**; as imagens usadas no
  processamento são descartadas logo depois.
- Nada é enviado a serviços externos: os cadastros vão somente para a API local, e modelos,
  fontes e runtimes são servidos pelo próprio app.
- `banco.json`, seus arquivos temporários e seu lock são ignorados pelo Git. O exemplo vazio
  `banco.example.json` pode ser versionado. O banco real não fica dentro de `public/` nem de `dist/`.

### Cadastros da versão anterior

Ao abrir a aplicação no **mesmo navegador e endereço** usados antes, os registros do IndexedDB
são importados automaticamente para `banco.json`. O original é preservado. A importação só é
marcada como concluída depois da gravação confirmada, não duplica identificadores existentes e
não reintroduz registros que você excluir depois. Se uma aba antiga impedir a migração, feche
as outras abas do FacePass e atualize a página.

### Próxima etapa: banco real

A interface conversa com `/api/people`. A persistência está isolada em
`server/jsonPeopleRepository.ts`, pelo contrato `PeopleRepository`. A futura integração com
PostgreSQL, SQLite ou outro banco substitui esse repositório; câmera, reconhecimento e páginas
continuam usando o mesmo contrato. Veja [Banco local](docs/BANCO.md).

## Publicar na internet (HTTPS obrigatório)

Navegadores só liberam a câmera em **contexto seguro**: `https://` ou `http://localhost`.
Se você publicar o FacePass, use **HTTPS**. Abrindo por `http://` com um IP da rede (ex.:
`http://192.168.0.10:5173`), o app mostra “A câmera só funciona em conexão segura”.
O layout pode ser testado em emulação de celular. A API JSON atual aceita apenas acesso local;
o acesso por celular físico ou publicação online exige uma etapa de backend para uso em rede.

Não são necessários cabeçalhos especiais (COOP/COEP): o SFace roda com uma thread.
Sirva arquivos `.wasm` com o tipo `application/wasm` (padrão na maioria das hospedagens).

## Problemas comuns

| Mensagem | O que fazer |
|---|---|
| O acesso à câmera foi bloqueado. | Clique no cadeado da barra de endereço, permita a câmera e tente de novo. |
| A câmera está em uso por outro aplicativo. | Feche Teams, Zoom, outra aba com câmera etc. |
| Nenhuma câmera foi encontrada. | Conecte uma webcam. |
| A câmera só funciona em conexão segura. | Use `http://localhost` ou HTTPS. |
| Os modelos de reconhecimento não carregaram. | Rode `npm run setup` e confira a saída; recarregue a página. |
| Os cadastros não puderam ser lidos. | Confira se o servidor está em execução e se `banco.json` é válido. |
| O banco.json está ocupado. | Aguarde a gravação. Se houve encerramento forçado, veja a recuperação do lock em `docs/BANCO.md`. |
| Cadastro “de uma versão anterior” | O processamento mudou desde o cadastro. Exclua e cadastre de novo. |

## Estrutura do projeto

```
src/
  components/      Interface (cabeçalho, palco da câmera, moldura, abas, lista, diálogos)
  camera/          Controle único da câmera e tratamento de erros
  vision/          MediaPipe (pontos + guarda de várias pessoas), qualidade e ciclo de análise
  sface/           Alinhamento/recorte do OpenCV, tensor e worker do ONNX Runtime
  recognition/     Comparação de embeddings, estabilização e hook da Interação
  enrollment/      Coleta das 5 amostras e hook do Cadastro
  storage/         Cliente da API, migração do IndexedDB e estado dos cadastros
  config/          Limiares e parâmetros centralizados (com justificativas)
  calibration/     Ferramenta de calibração (calibracao.html)
  validation/      Página de validação técnica (só em desenvolvimento)
scripts/           Download/verificação dos modelos e cópia dos runtimes
server/            API local e persistência JSON (substituível por banco real)
shared/            Formato e validação dos registros entre navegador e servidor
validation/        Scripts Python de validação (OpenCV oficial) e testes de ponta a ponta
docs/              Decisões técnicas, modelos e licenças, verificações
```

## Documentação

- [Decisões técnicas](docs/DECISOES.md) — como o MediaPipe e o SFace se integram, regras de comparação, sessões, desempenho, privacidade.
- [Verificações e pendências](docs/VALIDACAO.md) — o que foi testado, resultados observados, roteiro manual e calibração.
- [Modelos e licenças](docs/MODELOS.md) — origem, versões, hashes e licenças.
- [Banco local](docs/BANCO.md) — arquivo JSON, API, migração e futura troca de banco.
