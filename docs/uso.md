# Executar o projeto

## Demonstração

Com Node.js 24 ou posterior, execute `npm run demo` e abra `http://127.0.0.1:3848`. Clique nas contas para consultar detalhes. Não há dependências npm externas ou necessidade de importar uma conta. Encerre com `Ctrl+C`.

No Windows 10/11, `npm run demo:desktop` abre a interface Windows Forms. As telas podem ser consultadas, mas operações reais são bloqueadas. Fechar o painel encerra essa execução. O painel web é uma apresentação resumida; o desktop inclui as telas nativas.

## Modo conectado — Windows

Execute `npm start`. O backend consulta os itens do jogo, abre o painel e oferece a API em `http://127.0.0.1:3847`. Começa sem contas importadas.

Para importar uma conta, use o fluxo da interface: entre no jogo e copie localmente o item `sessao` do localStorage. O programa lê o clipboard, valida, protege os dados com DPAPI e limpa o clipboard. Esse conteúdo dá acesso à conta: não envie a terceiros nem publique no Git.

Sessões e preferências ficam em `%LOCALAPPDATA%\PokeidleManager`, separadas da aplicação original. Não há migração automática. A proteção DPAPI depende do usuário e computador Windows.

## Operações

- **Suprimentos:** estoque mínimo, quantidade desejada, orçamento e saldo a preservar. Um resultado incerto bloqueia repetição até revisão.
- **Hunts:** seleção manual aguarda o combate liberar; seleção automática é opcional e depende de dados suficientes do catálogo.
- **Depot:** venda exige confirmação. Coleção, equipe e Exp. Share equipada são excluídas; shiny e P5 no Depot podem entrar. Confira antes de confirmar.
- **Navegador:** abre contexto isolado e pausa aquela conta no gerenciador; ao fechar a janela, retome manualmente.
- **Twitch:** apresenta dados recebidos do jogo. Abrir uma live não comprova aplicação de bônus.

No modo conectado, fechar o painel pode recolhê-lo na bandeja e manter o backend ativo. Use a opção de encerrar ou `Ctrl+C` no terminal para parar. Na demonstração desktop, fechar o painel termina a execução.

## Catálogo opcional

O catálogo completo não é distribuído. Sem `data/hunt-catalog.json`, as recomendações ficam indisponíveis; o aplicativo não inventa rotas. Veja [origens e obtenção local](origens.md).

## PowerShell e distribuição

O desktop usa Windows PowerShell 5.1. `ExecutionPolicy Bypass` vale somente para o processo iniciado; os comandos não alteram a política global do Windows.

A distribuição é de código-fonte, sem download automático de runtime ou executável. Para produzir um ZIP:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File scripts/package.ps1
```

O script exclui catálogo externo, sessões, configurações, executáveis e pesquisa. Recusa sobrescrever um ZIP existente; use `-OutputDirectory` para escolher outra pasta.