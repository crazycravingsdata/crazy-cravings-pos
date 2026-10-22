# Firestore: configuração e isolamento por van

## Projetos

Use dois projetos Firebase separados:

- desenvolvimento (testes, emulador, dados falsos)
- produção (vendas reais)

Nunca aponte o ambiente de desenvolvimento para o projeto de produção.

## Modelo de acesso

O acesso é decidido por custom claims no Firebase Auth, definidos só pelo Admin SDK:

| Claim | Valores | Efeito |
|---|---|---|
| `role` | `operator`, `manager`, `admin` | Define o que a conta pode fazer |
| `vanId` | ex. `van-01` | Obrigatório para `operator`; limita a conta aos dados da própria van |

Regras (`infra/firestore.rules`):

- Operador cria eventos só em `vans/{sua-van}/events/*`, com formato validado.
- Reenvio de um evento já gravado só é aceito se o conteúdo for idêntico (idempotência).
- Ninguém apaga eventos. Correção é um novo evento.
- Gerentes leem todas as vans. Admin cadastra vans.
- Todo o resto é negado.

## Definir os claims (uma vez por conta, em máquina de confiança)

```js
// scripts/set-claims.mjs (rodar localmente com credenciais de serviço; NUNCA versionar a chave)
import { initializeApp, applicationDefault } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';

initializeApp({ credential: applicationDefault() });
await getAuth().setCustomUserClaims('<UID_DO_TABLET>', { role: 'operator', vanId: 'van-01' });
```

O usuário precisa renovar o token (`getIdToken(true)`) para o claim valer.

## Testar as regras

```bash
cd infra
npx firebase emulators:start --only firestore,auth
```

Casos mínimos a testar no emulador antes de ir a produção:

1. Operador da `van-01` cria evento em `vans/van-01/events/x`: permitido.
2. Mesmo operador em `vans/van-02/events/x`: negado.
3. Reenvio idêntico: permitido. Reenvio com conteúdo alterado: negado.
4. Delete: negado para todos.
5. Operador sem claim `vanId`: negado.
6. Gerente lê todas as vans: permitido.
