# Banco local de registros faciais

O arquivo `banco.json`, na raiz do projeto, é a fonte dos cadastros. É criado automaticamente
quando `npm run dev` ou `npm run preview` inicia, se ainda não existir. Esses comandos usam a
mesma API no mesmo processo do site; não é necessário iniciar outro serviço.

## Conteúdo

Um banco vazio tem este formato:

```json
{
  "schemaVersion": 1,
  "people": []
}
```

Cada pessoa contém `id`, `name`, `samples`, `createdAt`, `updatedAt`, `modelVersion` e
`pipelineVersion`. `samples` tem 5 arrays de 128 números, as assinaturas faciais normalizadas
geradas pelo SFace. As datas são timestamps em milissegundos. Fotos, vídeos e pontos faciais
temporários não são armazenados.

O formato usa tipos comuns de JSON para permitir uma importação posterior em outro banco.
O servidor valida os nomes, identificadores, datas, versões e a dimensão e normalização das
assinaturas antes de salvar. A interface só confirma o cadastro depois da gravação.

## API

| Método | Rota | Operação |
|---|---|---|
| GET | `/api/people` | Retorna `{ "people": [...] }` |
| PUT | `/api/people/:id` | Cria ou atualiza um registro completo; preserva sua data de criação |
| DELETE | `/api/people/:id` | Remove a pessoa e suas assinaturas |
| POST | `/api/people/import` | Recebe `{ "people": [...] }` e importa somente identificadores ausentes |

Os pedidos com corpo usam `Content-Type: application/json`. A resposta confirma a operação
ou retorna um erro JSON com status HTTP adequado. A API local aceita apenas conexões deste
computador e da origem do site. Ela não é uma API de produção para exposição na internet.

O arquivo bruto não é servido pela aplicação, inclusive via `/@fs/` ou importação `?raw`.
`banco.json` e seus temporários estão no `.gitignore`; o exemplo vazio pode ir para o GitHub.

## Gravações e recuperação

Cada gravação cria um temporário ao lado do banco, sincroniza seu conteúdo com o disco e troca
o arquivo por rename. Um lock exclusivo serializa as escritas, inclusive entre processos de
desenvolvimento e preview. Os leitores recebem apenas arquivos completos.

Um JSON inválido não é substituído por um banco vazio: a operação falha e o arquivo é
preservado para recuperação. Faça backups com um nome como `banco.json.backup`, também
ignorado pelo Git. Para restaurá-lo manualmente,
feche os servidores antes e use uma cópia válida com `schemaVersion: 1`.

Um processo encerrado à força pode deixar `banco.json.lock`. O servidor tenta recuperar locks
cujo processo proprietário já terminou. Se permanecer um lock inválido, feche todas as
instâncias do FacePass e remova somente `banco.json.lock` e `banco.json.lock.recovery`, se
existirem, antes de reiniciar. Não remova o banco.

## Migração do IndexedDB

O cliente verifica o banco antigo `facepass` no navegador. Quando há registros ainda não
migrados, envia suas assinaturas para a API em lotes de até 25 pessoas. O servidor mantém os
registros já existentes em colisões de identificador. Só depois da confirmação grava uma
marca de migração no armazenamento antigo.

A importação preserva os originais e pode ser repetida após falha sem criar duplicatas.
Uma exclusão posterior no JSON não é desfeita automaticamente pela cópia antiga. A migração
precisa ser aberta no mesmo perfil e endereço dos cadastros anteriores; outro navegador não
consegue ler aquele IndexedDB. Se uma aba antiga bloquear sua atualização, feche-a e recarregue.

O IndexedDB é opcional para novos cadastros: eles usam diretamente a API e o arquivo.

## Troca por banco real

`server/peopleApi.ts` recebe um objeto que implementa `PeopleRepository`. Atualmente esse objeto
é `JsonPeopleRepository`, em `server/jsonPeopleRepository.ts`, instalado por
`server/localDatabase.ts`.

Para a próxima fase, implemente `list`, `put`, `remove` e `importMissing` em um repositório do
banco escolhido e injete-o na mesma API. Importe os registros de `people` preservando seus
identificadores, assinaturas, datas e versões. O pipeline do MediaPipe/SFace e o cliente HTTP
não dependem do formato de persistência do servidor.

## Testes isolados

`npm run test:e2e` gera o build e inicia uma instância em porta livre com um banco exclusivo
em `validation/out/database-e2e-*/banco.json`. A variável de servidor `FACEPASS_DB_FILE` permite
selecionar esse caminho. Nunca use essa variável para apontar testes para os cadastros reais.

Os testes verificam a gravação em disco, compartilhamento entre perfis, edição, exclusão,
migração, reconhecimento de assinaturas migradas e falhas de API. Os testes de servidor
também verificam leitura em outro processo, concorrência e preservação de arquivos inválidos.
