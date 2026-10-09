# Validação

Execute `npm test`. Os testes usam `node:test`, sockets simulados e estados locais. A demonstração é testada por HTTP de loopback com porta temporária.

As verificações cobrem reconexão, sessões, deltas, confirmação, gastos, dados antigos, compras e vendas incertas, rotas, métricas e Twitch. A demonstração tem testes de bloqueio de operações reais, autenticação, Host e preservação dos dados fictícios.

O teste `optional local catalog: Squirtle guide reference` só roda com `data/hunt-catalog.json`. Ele depende de dados externos não distribuídos e valores históricos. Na cópia pública limpa, aparece como ignorado. Os demais testes do estimador usam catálogos sintéticos.

## Interface Windows

`npm run test:desktop` compila as classes C# e verifica contas, regras, limites numéricos, abertura e fechamento de telas, salvamento, redimensionamento e bandeja com fixtures. Não inicia o cliente real.

Para gerar imagens em uma pasta existente:

```powershell
powershell.exe -NoProfile -STA -ExecutionPolicy Bypass -File desktop/desktop.ps1 -SmokeTest -PreviewPath docs/images/desktop.png
```

Para verificar brevemente o loop de janela sem credenciais, use `-WindowTest` em vez de `-SmokeTest`.

## Integração contínua e limites

O workflow `quality.yml` executa testes Node.js em Linux e Windows, valida a interface no Windows e verifica arquivos fora do escopo público. Não recebe sessões do jogo.

Os testes simulados não demonstram compatibilidade atual com o servidor real, precisão de XP em todas as rotas ou ausência de defeitos. Verificação visual e execução da demonstração complementam os testes. Operações conectadas precisam de validação específica com controle do usuário.
