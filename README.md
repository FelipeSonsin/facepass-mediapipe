# FacePass

Cadastro e identificação facial com **processamento no navegador e banco JSON local**. Você cadastra uma pessoa
pelo nome e pelo rosto e, depois, verifica a identidade na página **Testar acesso**, mostrando
“Acesso liberado — Olá, nome” ou “Acesso negado” para um rosto não cadastrado.

- **MediaPipe** (Google, pré-treinado, Apache 2.0) localiza o rosto e seus pontos.
- **SFace** (OpenCV Zoo, pré-treinado, Apache 2.0) gera a “assinatura” numérica do rosto (embedding).
- **ONNX Runtime Web** executa o SFace no navegador.
- **API local em Node.js** guarda os cadastros no arquivo `backend/data/banco.json`.

Sem API paga ou servidor de reconhecimento. Imagens não saem do navegador; apenas nomes,
assinaturas faciais e metadados são enviados à API deste computador.

> ⚠️ **Importante:** o FacePass é uma demonstração de identificação facial com confirmação
> visual. A mensagem “Acesso liberado” **não é, por si só, uma autorização segura** e não deve
> liberar portas, contas ou outros recursos. O app **não detecta fotos, telas ou vídeos** de uma
> pessoa (não há anti-spoofing); isso exige validação específica. Os limiares de comparação são
> **provisórios** até serem calibrados com pessoas reais (veja [Calibração](docs/VALIDACAO.md#calibração-com-pessoas-reais)).

## Do que você precisa

- [Node.js](https://nodejs.org/) **24.x** para reproduzir o ambiente validado (24.20).
  O projeto também declara suporte à série 22 a partir de 22.18; Node 20 não atende às
  dependências atuais da suíte de testes.
- Um navegador recente: Chrome, Edge, Firefox ou Safari (testado em Edge/Chromium).
- Uma webcam.
- Internet **na primeira instalação**, para baixar as dependências e os modelos (~44 MB).

## Como rodar

O link do GitHub contém o código: o sistema é executado no computador de quem vai avaliar.
Para reproduzir o ambiente validado, use **Node.js 24.x**, **Chrome ou Edge**, uma webcam
ativada e internet durante a instalação. Python, chaves de API e um banco externo não são
necessários para usar o FacePass.

Para baixar com Git e iniciar:

```bash
git clone https://github.com/FelipeSonsin/facepass-mediapipe.git
cd facepass-mediapipe
npm ci
npm run dev
```

Se preferir **Code → Download ZIP** no GitHub, extraia o ZIP, abra o terminal na pasta que
contém `package.json` e execute os dois últimos comandos.

Abra **http://127.0.0.1:5173** no navegador. Execute todos os comandos na raiz
`facepass-mediapipe/`, onde está o `package.json`.

O `npm run dev` prepara tudo antes de iniciar: copia o runtime do MediaPipe e baixa os modelos
para `frontend/public/models/`, conferindo tamanho e hash de cada arquivo. Se um download falhar ou um
arquivo estiver corrompido, a mensagem diz qual. Para só preparar os arquivos: `npm run setup`.

A API de cadastros inicia junto com o site, sem outro terminal. O servidor cria `backend/data/banco.json`
automaticamente se ele não existir. Se já existir, preserva os registros.

### Configuração no .env

O arquivo **`.env` é opcional e fica na raiz**, fora do front-end. Ele não é enviado ao GitHub.
Um clone novo funciona com os valores padrão, cria o JSON vazio automaticamente e permite
cadastrar as pessoas que participarão da avaliação. Para personalizar, copie `.env.example`
para `.env` e edite as configurações.

| Variável | Uso |
|---|---|
| `FACEPASS_PORT` | Porta de `npm start` (padrão 3000) |
| `FACEPASS_DEV_PORT` | Porta de desenvolvimento (5173) |
| `FACEPASS_PREVIEW_PORT` | Porta do preview (4173) |
| `FACEPASS_DB_FILE` | Arquivo local de cadastros (`backend/data/banco.json`) |
| `EXTERNAL_API_URL`, `EXTERNAL_API_KEY` | Reservadas, opcionais, para uma futura integração de API no back-end |

MediaPipe e SFace funcionam **sem chave ou API externa**. Preencher os campos reservados não
ativa automaticamente um serviço: a integração depende do provedor que você escolher.
As variáveis do processo têm prioridade sobre o arquivo. Reinicie o servidor após editar.
O `.env` é ignorado pelo Git e bloqueado no HTTP; não coloque segredos em variáveis `VITE_`.

### Gerar a versão de produção

```bash
npm run build      # gera frontend/dist/ e backend/dist/
npm start          # front-end + API em http://127.0.0.1:3000
```

O servidor final em Node.js/Express serve a interface compilada e a API, sem depender do Vite.
`GET /api/health` confirma que o arquivo de cadastros está legível. O comando opcional
`npm run preview` serve a mesma interface com Vite em `http://127.0.0.1:4173`.
Desenvolvimento, preview e servidor final compartilham `backend/data/banco.json`.
Servir apenas `frontend/dist/` não disponibiliza a persistência; mantenha o servidor Node.js.

### Outros comandos

| Comando | O que faz |
|---|---|
| `npm test` | Testes da lógica (comparação, estabilização, cadastro, alinhamento) |
| `npm run test:e2e` | Build e testes completos com câmera simulada, servidor e banco isolados |
| `npm run lint` | Verificação de código |
| `npm run validate:pipeline` | Compara o pipeline do navegador com o OpenCV oficial (requer Python; ver [VALIDACAO.md](docs/VALIDACAO.md)) |

### Roteiro rápido para avaliação

1. Cadastre uma pessoa com nome, autorização e as cinco amostras de rosto.
2. Clique em **Testar acesso agora**: a pessoa cadastrada deve receber **Acesso liberado** e seu nome.
3. Faça uma pessoa não cadastrada aparecer sozinha, bem enquadrada: deve mostrar **Acesso negado**.
4. Saia do enquadramento ou desligue a câmera: a liberação deve desaparecer.
5. Atualize a página ou reinicie o servidor: o cadastro deve continuar na lista e no arquivo
   `backend/data/banco.json`.

O JSON começa vazio em cada instalação; nenhum cadastro facial real do autor é publicado.
Detalhes de cada fluxo estão abaixo. A validação automatizada com câmera simulada e suas
limitações estão em [VALIDACAO.md](docs/VALIDACAO.md).

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

- Os cadastros ficam no **arquivo `backend/data/banco.json`**. Outro navegador ou perfil
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
  `banco.example.json` pode ser versionado. O banco real não fica dentro de `frontend/public/` nem de `dist/`.

### Cadastros da versão anterior

Ao abrir a aplicação no **mesmo navegador e endereço** usados antes, os registros do IndexedDB
são importados automaticamente para `banco.json`. O original é preservado. A importação só é
marcada como concluída depois da gravação confirmada, não duplica identificadores existentes e
não reintroduz registros que você excluir depois. Se uma aba antiga impedir a migração, feche
as outras abas do FacePass e atualize a página.

### Próxima etapa: banco real

A interface conversa com `/api/people`. A persistência está isolada em
`backend/src/jsonPeopleRepository.ts`, pelo contrato `PeopleRepository`. A futura integração com
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
| Nenhuma câmera foi encontrada. | Confira a conexão e se a câmera está ativada no sistema. No Windows, veja Gerenciador de Dispositivos → Câmeras. |
| A câmera só funciona em conexão segura. | Use `http://localhost` ou HTTPS. |
| Os modelos de reconhecimento não carregaram. | Rode `npm run setup` e use “Carregar de novo”. |
| Os cadastros não puderam ser lidos. | Confira o servidor e o JSON; use “Tentar carregar cadastros”. |
| O banco.json está ocupado. | Aguarde a gravação. Se houve encerramento forçado, veja a recuperação do lock em `docs/BANCO.md`. |
| Cadastro “de uma versão anterior” | O processamento mudou desde o cadastro. Exclua e cadastre de novo. |

### Certificado HTTPS na instalação

Em uma rede institucional, `npm ci` ou o download dos modelos pode retornar
`UNABLE_TO_VERIFY_LEAF_SIGNATURE` quando o Node não utiliza o certificado confiável instalado
no Windows. Com Node.js 24.x, abra o PowerShell na pasta do projeto e execute:

```powershell
$env:NODE_USE_SYSTEM_CA='1'
npm ci
npm run dev
```

Essa configuração vale para o terminal atual e utiliza os certificados confiáveis do sistema,
mantendo a verificação HTTPS. A rede precisa permitir o registro npm, o GitHub e o Google
Cloud Storage durante a primeira instalação. Depois de baixar os arquivos, o processamento
e os cadastros funcionam localmente.

## Estrutura do projeto

```
frontend/
  src/             Interface React, câmera, MediaPipe, SFace, cadastro e reconhecimento
  public/          Modelos verificados, runtimes locais e ícone
  dist/            Interface compilada (gerada por npm run build)
  vite.config.ts   Desenvolvimento, preview e configuração dos testes
backend/
  src/             Servidor Express, API, configuração privada e persistência JSON
  data/            Cadastros locais; banco.example.json é o exemplo vazio versionado
  dist/            Back-end compilado (gerado por npm run build)
shared/            Tipos, validação de nomes e operações de embeddings comuns aos dois lados
scripts/           Download/verificação dos modelos e cópia dos runtimes
validation/        Comparação com OpenCV e testes de ponta a ponta com câmera simulada
docs/              Decisões técnicas, modelos, verificações e revisão da entrega
.env               Configuração local privada (não versionada)
.env.example       Exemplo de configuração sem credenciais
package.json       Comandos e dependências centralizados
```

## Documentação

- [Decisões técnicas](docs/DECISOES.md) — como o MediaPipe e o SFace se integram, regras de comparação, sessões, desempenho, privacidade.
- [Verificações e pendências](docs/VALIDACAO.md) — o que foi testado, resultados observados, roteiro manual e calibração.
- [Modelos e licenças](docs/MODELOS.md) — origem, versões, hashes e licenças.
- [Banco local](docs/BANCO.md) — arquivo JSON, API, migração e futura troca de banco.
- [Revisão da entrega](docs/REVISAO.md) — escopo conferido, correções e limitações verificáveis.
