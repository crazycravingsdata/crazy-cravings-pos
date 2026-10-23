# Crazy Cravings POS

Sistema de caixa (PDV) offline-first para as vans e feiras da Crazy Cravings.

## Estrutura

- `packages/domain`: regras de negócio puras (dinheiro em centavos, troco, totais; sem imposto por padrão, com alíquota opcional). Sem I/O.
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

## Catálogo inicial

Enquanto não existe a tela de cadastro de produtos, o PDV carrega um catálogo inicial
quando o banco local está vazio: Ice Cream Cup, Slushy, Pop e Water seguem o cardápio
impresso; o preço do Sundae é PROVISÓRIO (não consta no cardápio que temos). Para
desligar, defina `VITE_SEED_DEMO=false`.

## Imposto

O caixa não cobra imposto: o total é o preço do cardápio menos o desconto. O campo `hst`
continua gravado nos pedidos (sempre 0) e `orderTotals` aceita uma alíquota opcional, caso
isso mude.

## Login, motoristas e sincronização

Sem as variáveis `VITE_FIREBASE_*` o PDV roda em modo local: sem login, sem motoristas
por PIN e sem sincronização (mostra "Sync not set up").

Com elas, funciona em duas camadas:

- o tablet é ativado uma vez com o número da van e uma senha de ativação, sem e-mail na tela (a van vem da conta);
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
