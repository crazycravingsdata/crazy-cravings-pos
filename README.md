# Crazy Cravings POS

Sistema de caixa (PDV) offline-first para as vans e feiras da Crazy Cravings.

## Estrutura

- `packages/domain`: regras de negócio puras (dinheiro em centavos, HST de 13%, troco, totais). Sem I/O.
- `apps/pos`: PWA para tablet Android (a criar na Fase 1).
- `apps/manager`: painel web do escritório (a criar depois).

## Requisitos

- Node.js 22 LTS
- pnpm 9

## Comandos

```bash
pnpm install
pnpm test
pnpm typecheck
```

## Princípios

- Dinheiro é sempre inteiro, em centavos. Nunca use `number` com decimais para valores monetários.
- A venda é concluída no dispositivo. A nuvem recebe depois.
- Segredos ficam fora do Git (`.env`, tokens, chaves de serviço).
