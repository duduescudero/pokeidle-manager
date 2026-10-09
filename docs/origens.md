# Origens e distribuição

Integração independente com `https://pokeidle.io`. Nomes de jogo, criaturas e itens identificam o contexto e não significam vínculo oficial.

Bundles JavaScript, HTML e módulos baixados para pesquisa, capturas antigas, executáveis, ZIPs e configurações do computador não são distribuídos. A cópia original permanece separada.

O catálogo completo foi obtido de `https://guiapokeidlehardtocapture.site/data.js?v=32`, com geometria consultada pelo script de manutenção. Não foi identificada nesta preparação uma licença explícita de redistribuição do conjunto. Por isso `data/hunt-catalog.json` é uma entrada local opcional no `.gitignore`.

## Obtenção local opcional

Se tiver autorização para usar os dados da origem, execute `npm run catalog:update`. O script consulta fontes externas, valida formato e limites e gera o catálogo localmente. Não executa JavaScript remoto nem envia sessões. Fontes e formatos podem mudar; falhas de validação preservam o arquivo anterior. Não publique o resultado sem verificar a autorização de redistribuição.

## Desenvolvimento e imagens

As imagens foram renderizadas da interface com dados fictícios de `test/desktop-fixture.json`, sem contas reais ou assets gráficos do jogo. As fórmulas do estimador são aproximações, não medições.

O projeto foi desenvolvido com apoio de IA. A publicação reorganiza os arquivos e acrescenta demonstração, testes e documentação; não simula um histórico anterior.

Não se atribui ao autor propriedade sobre marcas ou dados de terceiros. Uma licença pública de redistribuição para o conjunto do projeto ainda não foi definida.
