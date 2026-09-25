# Comparação de modelos de progressão

> Este texto descreve a investigação anterior, com apenas o primeiro lote pessoal. Para os cinco registros atuais, incluindo os quatro últimos e o Adventurer Badge de +20%, consulte [personal-analysis.md](personal-analysis.md). O JSON é regenerado a partir dos lotes atuais e pode conter mais registros que as tabelas deste texto.

Reprodução: `python analysis/compare_models.py` (Python padrão e Node.js, sem dependências adicionais). Resultados completos em `model-comparison.json`. A calculadora e os lotes do usuário não foram alterados.

## Dados e método

- Ajustes separados para Finders D, C, B e A, usando apenas os checkpoints históricos de `app.js`.
- Quantidade acumulada de receitas como variável prevista; todos os modelos começam em zero no primeiro checkpoint.
- Mínimos quadrados em receitas, com a mesma variável de erro para todos os modelos.
- Validação: remover um checkpoint intermediário, ajustar nos restantes e prever o removido; repetir e calcular o erro absoluto médio (MAE). Os extremos ficam disponíveis. Isso mede interpolação histórica, não capacidade de prever dados atuais ou faixas futuras. Checkpoints cumulativos não são experimentos independentes.
- O lote pessoal de Finder B (4 receitas; 74 + 42,23% → 75 + 26,02%) fica fora de todos os ajustes.
- Correção do emblema: dividir a previsão por 1,20 **supondo que os registros de 2020 não tinham bônus**. Essa condição histórica não está confirmada. O bônus atual de 20% foi confirmado pelo usuário.
- Nenhum modelo foi calibrado para forçar o lote pessoal a retornar quatro.

## Resultado para Finder B

| Modelo | Erro médio na validação histórica (receitas) | Previsão do lote com +20% | Arredondada para cima |
|---|---:|---:|---:|
| Reta única | 16,682 | 3,023 | 4 |
| Potência fixa p = 2 | 15,815 | 3,323 | 4 |
| Potência fixa p = 3 | 14,854 | 3,632 | 4 |
| Potência com expoente ajustado | 0,353 | 6,544 | 7 |
| Polinômio de grau 2 ajustado | 3,795 | 7,575 | 8 |
| Exponencial contínua (inversa do skill logarítmico atual) | 0,044 | 6,411 | 7 |
| Exponencial por nível inteiro | 0,001 | 6,400 | 7 |
| Interpolação linear por trechos | 2,366 | 6,215 | 7 |

O polinômio de grau 2 não é monotônico em toda a faixa histórica de B: em parte dela, prevê diminuição da quantidade acumulada ao aumentar o skill, comportamento incompatível com o problema. Não é candidato adequado, mesmo que o erro médio pareça aceitável.

## Alternativa que explica melhor os checkpoints antigos

A fórmula atual trata `skill + porcentagem/100` como uma coordenada contínua dentro da exponencial. Uma alternativa é aplicar o crescimento exponencial aos **limiares inteiros de skill** e interpolar o XP dentro de cada nível:

```
s = nível + fração
T(s) = exp(k × (floor(s) − s₀)) × (1 + fração × (exp(k) − 1))
N(s) = A × (T(s) − T(s₀))
receitas = N(meta) − N(atual)
```

Aqui `fração` é a porcentagem dividida por 100. Isso é uma hipótese sobre a interpretação da barra de progresso, não uma regra oficial confirmada.

| Finder | MAE: exponencial contínua | MAE: exponencial por nível |
|---|---:|---:|
| D | 0,147 | 0,004 |
| C | 0,049 | < 0,001 |
| B | 0,044 | 0,001 |
| A | 0,173 | 0,001 |

O fator entre níveis inteiros `exp(k)` ficou aproximadamente **1,194** nos quatro ajustes independentes. Isso é evidência de uma estrutura comum nos dados antigos. Não confirma a fórmula do jogo atual.

## Conclusão e limites

Reta e potências fixas retornam quatro receitas após arredondar, mas não explicam bem a trajetória histórica. Esse acerto isolado não valida essas fórmulas.

A exponencial por nível explica os checkpoints antigos melhor que a fórmula atual, mas ainda prevê 6,40 receitas com emblema. A discrepância externa persiste. Para coincidir com o lote observado, a quantidade histórica teria de ser dividida por aproximadamente 1,92 no total, ou por um fator adicional de aproximadamente 1,60 após o emblema. Esses fatores são apenas relações numéricas observadas: não identificam um bônus real nem devem ser aplicados automaticamente.

Não há evidência suficiente para trocar o modelo de produção por uma potência ou para corrigir a diferença apenas mudando a função. São necessários mais lotes atuais, com condições documentadas, para comparar a forma da curva atual e sua escala de ganho.

O script também valida o ajuste em uma curva sintética de parâmetros conhecidos. Esses testes numéricos passaram; isso verifica o procedimento matemático, não a correspondência ao jogo.
