# Firebase: login por operador e sincronização por van

## Como funciona

- Cada operador tem uma conta (email e senha) no Firebase Auth.
- A conta carrega dois "claims", definidos só por um administrador: `role` e `vanId`.
- A van do operador vem do claim. No tablet, o campo de van fica travado.
- O Firestore só aceita eventos da van que a conta representa (`infra/firestore.rules`).
- O primeiro login num tablet precisa de internet. Depois, a sessão fica salva e o caixa
  vende offline normalmente. Uma sessão salva continua valendo sem conexão.
- Gerentes e admins NÃO operam o caixa: o app mostra "No access" para eles. Eles usam o
  painel do escritório (a criar).
- Sair da conta fica bloqueado enquanto houver vendas não enviadas, para elas não ficarem presas.
- Se o tablet tiver um turno aberto de outra van, o app bloqueia e pede para fechar com a conta certa.

## 1. Criar os projetos

Dois projetos separados no console do Firebase (https://console.firebase.google.com):

- desenvolvimento (testes, dados falsos)
- produção (vendas reais)

Nunca aponte o ambiente de desenvolvimento para o projeto de produção.

## 2. Ativar o login

No projeto: Build, Authentication, Sign-in method, ativar **Email/Password**.
Desative o cadastro aberto: crie as contas você mesmo (Authentication, Users, Add user).

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

## 5. Definir role e van de cada conta

Baixe uma chave de conta de serviço (Project settings, Service accounts) e guarde FORA do repositório.

```bash
GOOGLE_APPLICATION_CREDENTIALS=/caminho/fora/do/git/chave.json \
  node scripts/set-claims.mjs --project <id> --email ana@exemplo.ca --role operator --van van-01

GOOGLE_APPLICATION_CREDENTIALS=/caminho/fora/do/git/chave.json \
  node scripts/set-claims.mjs --project <id> --email chefe@exemplo.ca --role manager
```

O comando SUBSTITUI todos os claims da conta. Peça para a pessoa sair e entrar de novo.

## 6. Testar as regras no emulador

Requer Java 11 ou superior e acesso à internet para baixar o emulador na primeira vez:

```bash
pnpm --filter @crazy-cravings/infra test:rules
```

São 20 casos: criação só na própria van, reenvio idêntico aceito, reenvio alterado recusado,
exclusão sempre recusada, leitura isolada por van, catálogo e cadastro de vans.

**Estado atual:** esses testes foram escritos mas ainda NÃO foram executados (o ambiente de
desenvolvimento não conseguiu baixar o emulador). Rode-os antes de usar em produção.

## Limitações conhecidas

- As regras não impedem que um operador com uma conta válida grave um evento falso da própria
  van. O que elas garantem é isolamento entre vans, formato válido e histórico imutável.
  A conferência de valores é feita na conciliação com a Clover (Fase 2).
- Contas de operador compartilhadas entre pessoas apagam a rastreabilidade. Prefira uma conta
  por pessoa, todas com o `vanId` da van em que trabalham.
