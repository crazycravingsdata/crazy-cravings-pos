# Firebase: login do tablet, motoristas por PIN e sincronização

## Como funciona

Há duas camadas, de propósito, porque os motoristas mudam com frequência:

1. **Conta da van (tablet).** Cada tablet entra uma única vez com a conta da sua van
   (`van-01`, `van-02`, `van-03`). Quem faz isso é a administração. A sessão fica salva
   e o caixa vende offline normalmente. A van vem da conta e o campo fica travado.
2. **Motorista (PIN).** No início do turno, o motorista escolhe o nome na lista e digita o
   PIN. O nome e o ID dele ficam gravados no turno e nas vendas daquele turno.

Consequências:

- Motorista novo ou que saiu NÃO mexe em contas do Firebase. A gestão cadastra ou desativa.
- Um motorista pode trocar de van: ele só pega o tablet da outra van e digita o PIN.
- Troca de motorista no meio do dia = fechar o turno (contagem do caixa) e abrir outro.
- O primeiro login do tablet precisa de internet. A lista de motoristas é baixada quando há
  sinal e fica salva no tablet, então abrir turno funciona offline.
- Tablet novo sem lista baixada não abre turno até conectar uma vez.
- Gerentes e admins NÃO operam o caixa: a conta deles mostra "No access" no PDV.
- Sair da conta do tablet fica bloqueado enquanto houver vendas não enviadas.
- Se o tablet tiver um turno aberto de outra van, o app bloqueia até ele ser fechado.

### O que o PIN protege, e o que não protege

O PIN **identifica** quem estava no caixa. Não é uma autenticação forte:

- O tablet precisa conferir o PIN sem internet, então guarda o hash dele. Com 4 a 6 dígitos,
  quem tiver acesso técnico ao aparelho consegue descobrir o PIN por força bruta.
- O bloqueio de 5 tentativas (5 minutos) freia tentativas na tela, mas limpar os dados do
  navegador zera o contador.
- PINs fáceis (1111, 1234, 4321) são recusados ao cadastrar.

A proteção do dinheiro continua sendo o fechamento cego (a diferença aparece por turno) e o
histórico que ninguém apaga. Se um tablet for perdido, desative a conta da van no Firebase.

## 1. Criar os projetos

Dois projetos separados no console do Firebase (https://console.firebase.google.com):

- desenvolvimento (testes, dados falsos)
- produção (vendas reais)

Nunca aponte o ambiente de desenvolvimento para o projeto de produção.

## 2. Ativar o login

No projeto: Build, Authentication, Sign-in method, ativar **Email/Password**.
Crie as contas das vans você mesmo (Authentication, Users, Add user), por exemplo
`van-01@seudominio.ca`. Não deixe cadastro aberto.

## 3. Criar o app web e copiar a configuração

Project settings, Your apps, Web app. Copie `apiKey`, `authDomain`, `projectId` e `appId`
para `apps/pos/.env.local` (este arquivo não vai para o Git):

```
VITE_FIREBASE_API_KEY=...
VITE_FIREBASE_AUTH_DOMAIN=...
VITE_FIREBASE_PROJECT_ID=...
VITE_FIREBASE_APP_ID=...
```

Esses valores identificam o projeto e podem ir no app. A proteção vem das regras do Firestore
e do login, não de esconder a chave.

Em Authentication, Settings, Authorized domains, adicione o domínio onde o PDV for publicado.

## 4. Criar o banco e publicar as regras

Firestore Database, Create database (modo produção). Depois publique as regras:

```bash
cd infra
npx firebase-tools login
npx firebase-tools deploy --only firestore:rules --project <id-do-projeto>
```

## 5. Definir role e van de cada conta de tablet

Baixe uma chave de conta de serviço (Project settings, Service accounts) e guarde FORA do repositório.

```bash
export GOOGLE_APPLICATION_CREDENTIALS=/caminho/fora/do/git/chave.json

node scripts/set-claims.mjs --project <id> --email van-01@seudominio.ca --role operator --van van-01
node scripts/set-claims.mjs --project <id> --email chefe@seudominio.ca --role manager
```

O comando SUBSTITUI todos os claims da conta. O tablet deve sair e entrar de novo.
(O papel `operator` significa "conta de tablet de van".)

## 6. Cadastrar e gerenciar motoristas

Requer Node 22.18 ou superior (o script usa o mesmo módulo de PIN do app).

```bash
# cadastrar, com PIN gerado (aparece uma única vez; anote e entregue ao motorista)
node scripts/drivers.mjs add --project <id> --name "Ana Souza" --generate-pin

node scripts/drivers.mjs list --project <id>
node scripts/drivers.mjs reset-pin --project <id> --id <driver-id> --generate-pin
node scripts/drivers.mjs deactivate --project <id> --id <driver-id>   # quando o motorista sai
node scripts/drivers.mjs activate --project <id> --id <driver-id>
```

- Só o hash do PIN vai para o Firestore, nunca o PIN.
- Para ver o registro sem gravar nada, acrescente `--dry-run` (não precisa de credenciais).
- Prefira `--generate-pin` ou a variável `DRIVER_PIN` a `--pin`, que fica no histórico do terminal.
- Mudanças chegam aos tablets na próxima sincronização (a cada 5 minutos com internet).
- Não é possível ter dois motoristas ativos com o mesmo nome. Use sobrenome ou inicial.

Uma tela de gestão para a gestora fazer isso sem terminal ainda não existe (painel do escritório).

## 7. Testar as regras no emulador

Requer Java 11 ou superior e acesso à internet para baixar o emulador na primeira vez:

```bash
pnpm --filter @crazy-cravings/infra test:rules
```

São 24 casos: criação de eventos só na própria van, reenvio idêntico aceito, reenvio alterado
recusado, exclusão sempre recusada, leitura isolada por van, catálogo, cadastro de vans e
lista de motoristas (o tablet lê, só a gestão escreve).

**Estado atual:** esses testes foram escritos mas ainda NÃO foram executados (o ambiente de
desenvolvimento não conseguiu baixar o emulador). Rode-os antes de usar em produção.

## Limitações conhecidas

- As regras não impedem que uma conta válida de tablet grave um evento falso da própria van.
  O que garantem é isolamento entre vans, formato válido e histórico imutável. A conferência
  de valores é feita na conciliação com a Clover (Fase 2).
- Qualquer tablet de van consegue ler a lista de motoristas, com os hashes de PIN, porque
  precisa dela offline. Por isso o PIN identifica, mas não autentica com força.
- O PIN não é pedido de novo ao fechar o turno nem ao dar desconto. Limite de desconto por
  perfil e PIN de gerente ainda não existem.
