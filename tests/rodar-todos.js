const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const pasta = __dirname;
const testes = fs.readdirSync(pasta)
  .filter((nome) => nome.startsWith('teste-') && nome.endsWith('.js') && nome !== 'teste-estresse.js')
  .sort();

let totalOk = 0;
let totalFalhas = 0;
const comProblema = [];

for (const teste of testes) {
  const resultado = spawnSync(process.execPath, [path.join(pasta, teste)], { encoding: 'utf8' });
  const saida = `${resultado.stdout}${resultado.stderr}`;
  const ok = (saida.match(/^OK /gm) || []).length;
  const falhas = (saida.match(/^FALHOU/gm) || []).length;
  const quebrou = resultado.status !== 0 || /Error:/.test(resultado.stderr);
  totalOk += ok;
  totalFalhas += falhas;
  if (falhas > 0 || quebrou) comProblema.push({ teste, saida });
  console.log(`${falhas || quebrou ? '❌' : '✅'} ${teste.padEnd(24)} ${String(ok).padStart(3)} OK  ${falhas} falha(s)${quebrou ? '  (erro ao rodar)' : ''}`);
}

console.log(`\nTotal: ${totalOk} verificações OK, ${totalFalhas} falha(s).`);
for (const { teste, saida } of comProblema) {
  console.log(`\n--- ${teste} ---`);
  console.log(saida.split('\n').filter((l) => /FALHOU|Error/.test(l)).slice(0, 10).join('\n'));
}
process.exit(comProblema.length ? 1 : 0);
