# Rastreamento das vans (GPS no próprio app do caixa)

O app grava a posição do tablet a cada 30 segundos **enquanto há turno aberto** e só com
conta de van logada. Ao fechar o turno, o rastreamento para.

## Como funciona

- `features/tracking/tracker.ts`: lê o GPS do navegador (`watchPosition`) e grava um ponto a
  cada 30 s. A primeira posição é gravada na hora.
- Se a última posição tiver mais de 75 s (a tela apagou e o navegador parou o GPS), **não**
  grava ponto falso: o selo mostra "GPS waiting for signal" e o buraco na trilha fica visível.
- `features/tracking/useLocationTracking.ts`: liga e desliga com o turno e pede ao navegador
  para manter a tela acesa (Screen Wake Lock) enquanto o turno está aberto.
- Cada ponto vira um evento `location.recorded` na mesma fila de envio das vendas
  (`vans/{vanId}/events/{id}`), então funciona offline e chega sem duplicar.
- O selo "GPS" na barra de cima mostra o estado: ligado, esperando sinal, bloqueado (permissão
  negada) ou indisponível.
- Os pontos não entram na contagem "N to send" do selo de sincronização, mas ainda impedem
  sair da conta do tablet enquanto não forem enviados.
- Desligar: `VITE_TRACKING=false`.

## Dados de cada ponto (`payload`)

`shiftId`, `driverId` (se houver), `lat`, `lng`, `accuracy` (m), `speed` (m/s, se o aparelho
informar), `heading` (graus, se informar), `recordedAt` (hora da medição, ms).

Volume: ~960 pontos por van em 8 h, ~2.900 por dia nas 3 vans (cota gratuita do Firestore:
20.000 gravações por dia, somadas a vendas e outros eventos).

## Limites conhecidos

- Aplicativo web: o navegador pode pausar o GPS com a tela apagada ou o app em segundo plano.
  O Wake Lock ajuda, mas não é garantia em todos os aparelhos. Por isso existe o piloto.
- Ainda não existe tela no painel de gestão para ver o trajeto (próximo passo).
- Se o piloto mostrar muitos buracos, a próxima opção é um app Android com serviço em
  segundo plano, ou um aparelho GPS fixo na van (Traccar).

## Roteiro do piloto (1 van, 1 semana)

1. Ativar o tablet da van de teste, abrir o turno e **permitir a localização** quando o
   tablet perguntar. Instalar o app na tela inicial (PWA) e manter o tablet carregando.
2. Trabalhar normalmente. Não desligar a tela de propósito.
3. No fim de cada dia, contar os pontos do turno na coleção `vans/{vanId}/events`
   (`type == location.recorded`). Esperado: perto de 2 por minuto.
4. Anotar os buracos (intervalos maiores que 2 minutos) e o que o motorista estava fazendo.
5. Decidir: buracos raros = seguir com o app; buracos frequentes = app Android ou GPS na van.
