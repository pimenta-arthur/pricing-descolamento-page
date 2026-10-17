# pricing-descolamento-page

Páginas estáticas da precificação do descolamento do NE e do N em relação ao SE (modelo v2.2).

- `descolamento/index.html`: página de precificação (curva do SE → descolamento por produto, faixa por ano climático).
- `descolamento/metodologia.html`: metodologia, desempenho no backtest e histórico de rodadas.
- `padrao/`: padrão visual Quant Energia (estilos e funções de gráfico).

Os dados (`descolamento/dados.js` e `descolamento/metodologia_dados.js`) são gerados pelo repositório
`pricing-descolamento-analytics`, a cada deck:

```
uv run python -m pricing_descolamento_analytics.web --deck AAAA-MM --site ../pricing-descolamento-page
```

Não editar os arquivos de dados à mão. Para abrir localmente, basta abrir `index.html` no navegador.
