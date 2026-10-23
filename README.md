# Crazy Cravings POS

Sistema de caixa (PDV) offline-first para as vans e feiras da Crazy Cravings.

## Estrutura

- `packages/domain`: regras de negócio puras (dinheiro em centavos, HST de 13%, troco, totais). Sem I/O.
- `apps/pos`: PWA para tablet Android (React + Vite + Dexie). Abertura de turno, venda em dinheiro, desconto, fechamento cego e fila de sincronização.
- `apps/manager`: painel web do escritório (a criar depois).
- `infra`: regras do Firestore e seus testes.
- `scripts`: administração (`set-claims.mjs` define a conta de cada van; `drivers.mjs` cadastra motoristas e PINs).

## Requisitos

- Node.js 22 LTS
- pnpm 9

## Comandos

```bash
pnpm install
pnpm test
pnpm typecheck

# rodar o PDV em desenvolvimento
pnpm --filter @crazy-cravings/pos dev

# build de produção (PWA instalável)
pnpm --filter @crazy-cravings/pos build
```

## Catálogo de demonstração

Enquanto não existe a tela de cadastro de produtos, o PDV carrega um catálogo
FICTÍCIO (itens e preços de exemplo) quando o banco local está vazio. Para
desligar, defina `VITE_SEED_DEMO=false`.

## Login, motoristas e sincronização

Sem as variáveis `VITE_FIREBASE_*` o PDV roda em modo local: sem login, sem motoristas
por PIN e sem sincronização (mostra "Sync not set up").

Com elas, funciona em duas camadas:

- o tablet entra uma vez com a conta da sua van (a van vem da conta);
- o motorista escolhe o nome e digita o PIN para abrir o turno, o que dispensa conta
  individual e facilita a troca de motoristas.

Os motoristas são cadastrados com `scripts/drivers.mjs`. O passo a passo completo, o que o
PIN protege e o que não protege, está em `docs/firestore-setup.md`.

As regras do Firestore (`infra/firestore.rules`) têm testes em
`infra/test/firestore.rules.test.js`, que precisam do emulador do Firebase.

## Princípios

- Dinheiro é sempre inteiro, em centavos. Nunca use `number` com decimais para valores monetários.
- A venda é concluída no dispositivo. A nuvem recebe depois.
- Segredos ficam fora do Git (`.env`, tokens, chaves de serviço).
