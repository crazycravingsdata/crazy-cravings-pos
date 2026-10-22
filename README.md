# Crazy Cravings POS

Sistema de caixa (PDV) offline-first para as vans e feiras da Crazy Cravings.

## Estrutura

- `packages/domain`: regras de negócio puras (dinheiro em centavos, HST de 13%, troco, totais). Sem I/O.
- `apps/pos`: PWA para tablet Android (React + Vite + Dexie). Abertura de turno, venda em dinheiro, desconto, fechamento cego e fila de sincronização.
- `apps/manager`: painel web do escritório (a criar depois).

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

## Sincronização

Sem as variáveis `VITE_FIREBASE_*` o PDV funciona normalmente e mostra
"Sync not set up". Com elas, os eventos da fila são enviados ao Firestore.
A autenticação por operador ainda não existe, então as regras de
`infra/firestore.rules` vão recusar as gravações até ela ser implementada.

## Princípios

- Dinheiro é sempre inteiro, em centavos. Nunca use `number` com decimais para valores monetários.
- A venda é concluída no dispositivo. A nuvem recebe depois.
- Segredos ficam fora do Git (`.env`, tokens, chaves de serviço).
