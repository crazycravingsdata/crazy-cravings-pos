# Crazy Cravings POS

Sistema de caixa (PDV) offline-first para as vans e feiras da Crazy Cravings.

## Estrutura

- `packages/domain`: regras de negócio puras (dinheiro em centavos, HST de 13%, troco, totais). Sem I/O.
- `apps/pos`: PWA para tablet Android (React + Vite + Dexie). Abertura de turno, venda em dinheiro, desconto, fechamento cego e fila de sincronização.
- `apps/manager`: painel web do escritório (a criar depois).
- `infra`: regras do Firestore e seus testes.
- `scripts`: utilitários de administração (definir role e van de cada conta).

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

## Login e sincronização

Sem as variáveis `VITE_FIREBASE_*` o PDV roda em modo local: sem login e sem
sincronização (mostra "Sync not set up"). Com elas, o operador entra com a conta
dele, a van vem do login e as vendas são enviadas ao Firestore quando há sinal.
O passo a passo está em `docs/firestore-setup.md`.

As regras do Firestore (`infra/firestore.rules`) têm testes em
`infra/test/firestore.rules.test.js`, que precisam do emulador do Firebase.

## Princípios

- Dinheiro é sempre inteiro, em centavos. Nunca use `number` com decimais para valores monetários.
- A venda é concluída no dispositivo. A nuvem recebe depois.
- Segredos ficam fora do Git (`.env`, tokens, chaves de serviço).
