# PXG Adventurer Skill Calculator

Calculadora estática para estimar quantos crafts de Adventurer faltam para o próximo rank. O projeto usa HTML, CSS e JavaScript sem frameworks e não tem dependências externas.

## Rodar localmente

Requer Node.js 18 ou mais recente. Na pasta do projeto, execute:

```sh
npm start
```

Abra <http://localhost:8000>. Para encerrar, pressione `Ctrl+C`. No Windows, também pode dar dois cliques em `iniciar.bat`. Não é necessário executar `npm install`.

## Dados

As estimativas usam medições empíricas publicadas em 2020, não dados oficiais do jogo. Confira o avanço depois de um lote pequeno, pois a progressão pode ter mudado.

Finders A–D usam custos de XP exponenciais por nível inteiro, com a barra percentual linear dentro do nível: `T(s) = exp(k × (floor(s) − s₀)) × (1 + frac(s) × expm1(k))` e `n(s) = A × (T(s) − T(s₀))`. `s₀` é o primeiro skill medido; `A` e `k` são ajustados separadamente para cada Finder. A quantidade restante é `ceil(n(meta) − n(atual))`, com tolerância numérica de 1e-9 antes do arredondamento. Tempo, unidades, materiais e Diamond Dust usam essa quantidade inteira.

Finder E e Lockpick mantêm interpolação linear entre checkpoints históricos por falta de dados suficientes para validar uma curva. Modelos históricos não extrapolam; os trechos separados de Lockpick não são unidos. Lotes pessoais consistentes permitem a previsão limitada descrita abaixo.

Para reproduzir o ajuste histórico, execute `python analysis/compare_models.py` (Python e Node, sem dependências externas). Os parâmetros atuais estão em `analysis/model-comparison.json`, na família `discrete_exponential`; os coeficientes do navegador ficam em `progressionModels`, no `app.js`. `fit_progression.py` e `progression-fit.json` preservam a comparação com o modelo contínuo anterior. O ajuste minimiza o erro quadrático em receitas e a validação omite um checkpoint intermediário por vez. Isso avalia a base histórica, não confirma as regras atuais do jogo.

Execute `npm test` para validar o cálculo e os quatro idiomas.

## Registrar seus próprios lotes

Edite `batches.js` e recarregue a página. Não é necessário executar Python, instalar dependências ou copiar coeficientes: o navegador recalcula a curva a cada carregamento. As chaves `a`, `b`, `c`, `d`, `e` e `lock` correspondem às receitas da calculadora.

Dentro da lista do Finder correspondente, acrescente um objeto por lote:

```js
b: [
  // Exemplo fictício de formato: substitua pelos valores medidos no jogo.
  { date: '2026-09-23', crafts: 10, before: [73, 42.15], after: [74, 50.00] },
],
```

- `date`: data real da medição, no formato `AAAA-MM-DD`.
- `crafts`: número inteiro de execuções da receita. Para uma receita que produz 10 Finders, 100 Finders produzidos correspondem a **10 receitas**.
- `before` e `after`: `[skill inteiro, porcentagem]` antes e depois do lote. Escreva `42.15`, não `42,15`. A porcentagem vai de 0 a menos de 100.
- Mantenha os registros em ordem cronológica. O `before` de um lote deve coincidir com o `after` anterior. Não ganhe skill por outras receitas entre as medições. Use o mesmo personagem, servidor e condições de bônus em toda a série.
- Não adicione números fictícios ou os checkpoints de 2020 à sua série pessoal. Caso mude as condições ou comece uma série separada, guarde uma cópia da série anterior e substitua a lista inteira.

Desde **um lote válido**, a calculadora aproveita os checkpoints pessoais por interpolação linear dentro da faixa registrada, respeitando as quantidades medidas. Com **pelo menos três lotes consecutivos** (quatro checkpoints), o navegador tenta ajustar os dois parâmetros da curva por mínimos quadrados. Esse mínimo permite o ajuste, mas não garante precisão; prefira mais medições distribuídas pela faixa de skill. Um ajuste cujo mínimo esteja no limite da busca de curvatura é recusado; nesse caso, a interpolação pessoal continua disponível.

Dentro da faixa pessoal medida, a curva interpola na coordenada de XP entre os totais registrados, preservando exatamente cada lote. Sem curva válida, usa interpolação linear. Quando todos os lotes têm erro relativo de ajuste de no máximo 5%, permite uma **previsão identificada** além do último checkpoint: até o próximo rank, no máximo uma extensão igual à faixa já medida, e nunca além de skill 100. A previsão começa no total do último checkpoint. O critério de 5% é uma verificação de consistência, não uma garantia de precisão.

O progresso atual deve estar a partir do primeiro checkpoint pessoal, e a meta dentro do limite pessoal permitido. Fora desses limites, ou com registros ausentes/inválidos, a calculadora usa a base histórica dentro de sua faixa. As escalas pessoais e históricas não são misturadas. Uma divergência de escala não identifica sozinha a causa: mudança de regras, bônus ou outra condição. A base histórica tem bônus desconhecidos; o ajuste pessoal já incorpora o bônus ativo durante os lotes.

O arquivo fica na pasta do projeto. Se publicar o site, publique também `batches.js` e `progression.js`; as medições incluídas serão públicas e usadas por todos que acessarem essa versão. Alterações apenas no arquivo local não atualizam um site já publicado.
