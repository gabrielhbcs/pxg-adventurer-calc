// Edite este arquivo e recarregue a calculadora. Use ponto nos decimais.
// crafts = receitas executadas, NAO unidades de Finder produzidas.
// before/after = [skill inteiro, porcentagem de 0 a menos de 100].
// Registre lotes consecutivos, com o mesmo servidor e bonus de experiencia.
// O before de cada lote deve ser igual ao after do lote anterior.
// Desde 1 lote: interpolacao linear na faixa medida. A partir de 3: tenta ajustar a curva.
// Nao misture registros pessoais com os de 2020.
// Exemplo de formato (ficticio; substitua pelos valores reais):
// { date: '2026-09-23', crafts: 10, before: [73, 42.15], after: [74, 50.00] },
const personalBatches = {
  a: [],
  b: [{ date: '2026-09-23', crafts: 4, before: [74, 42.23], after: [75, 26.02] },
     { date: '2026-09-23', crafts: 1, before: [75, 26.02], after: [75, 44.62] },
     { date: '2026-09-24', crafts: 4, before: [75, 44.62], after: [76, 16.93] },
     { date: '2026-09-24', crafts: 8, before: [76, 16.93], after: [77, 33.97] },
     { date: '2026-09-24', crafts: 9, before: [77, 33.97], after: [78, 43.04] },
    ],
  c: [],
  d: [],
  e: [],
  lock: [],
};
