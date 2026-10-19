const db = require('../src/database');
const { verificarData, reservarRevisao, cancelarRevisao } = require('../src/agenda');
const { interpretarData, formatarData } = require('../src/texto-data');

const HOJE = '2027-11-19';

function conferir(descricao, obtido, esperado) {
  const o = JSON.stringify(obtido);
  const e = JSON.stringify(esperado);
  const passou = o === e;
  console.log(`${passou ? 'OK    ' : 'FALHOU'} ${descricao} → ${o}${passou ? '' : ` (esperado: ${e})`}`);
}

async function testar() {
  conferir('"20/10" em novembro vira ano que vem', interpretarData('20/10', HOJE), '2028-10-20');
  conferir('"01/12"', interpretarData('01/12', HOJE), '2027-12-01');
  conferir('"dia 2/12 pode ser?"', interpretarData('dia 2/12 pode ser?', HOJE), '2027-12-02');
  conferir('"03-12-27"', interpretarData('03-12-27', HOJE), '2027-12-03');
  conferir('"31/02" não existe', interpretarData('31/02', HOJE), null);
  conferir('"amanhã cedo" não é data', interpretarData('amanhã cedo', HOJE), null);
  conferir('formatar 01/12', formatarData('2027-12-01'), 'quarta, 01/12');

  const idOcupante = await reservarRevisao({
    cliente: 'Ocupante Teste', telefone: '5511900000093', whatsapp: '5511900000093',
    modeloMoto: 'TESTE', anoMoto: 2020, dataRevisao: '2027-12-01',
  });

  conferir('02/12 livre', await verificarData('2027-12-02', HOJE), { situacao: 'LIVRE', sugestoes: [] });
  conferir('01/12 ocupada → sugestões (pula sábado a segunda)', await verificarData('2027-12-01', HOJE),
    { situacao: 'OCUPADA', sugestoes: ['2027-12-02', '2027-12-03', '2027-12-07'] });
  conferir('sábado 04/12 → sugestões', await verificarData('2027-12-04', HOJE),
    { situacao: 'DIA_INVALIDO', sugestoes: ['2027-12-07', '2027-12-08', '2027-12-09'] });
  conferir('hoje (19/11) já não pode', (await verificarData('2027-11-19', HOJE)).situacao, 'DATA_PASSADA');

  console.log('\n--- simulação ---');
  const pedido = interpretarData('quero dia 01/12', HOJE);
  const resposta = await verificarData(pedido, HOJE);
  console.log(`Cliente pediu ${formatarData(pedido)} → ${resposta.situacao}`);
  console.log(`Bot: a mais próxima que tenho é ${formatarData(resposta.sugestoes[0])}.` +
    ` Tenho também: ${resposta.sugestoes.slice(1).map(formatarData).join(' e ')}.`);

  const escolhida = resposta.sugestoes[2];
  const recheck = await verificarData(escolhida, HOJE);
  console.log(`Cliente escolheu ${formatarData(escolhida)} → nova checagem: ${recheck.situacao}`);
  conferir('nova checagem da escolhida', recheck.situacao, 'LIVRE');

  const id = await reservarRevisao({
    cliente: 'Teste Escolha', telefone: '5511900000098',
    modeloMoto: 'Teste', anoMoto: 2022, dataRevisao: escolhida,
  });
  console.log(`Reservado: ${id}`);

  conferir('escolhida agora ocupada', (await verificarData(escolhida, HOJE)).situacao, 'OCUPADA');

  await cancelarRevisao(id, { ignorarPrazo: true, hoje: HOJE });
  conferir('liberada de novo após cancelar', (await verificarData(escolhida, HOJE)).situacao, 'LIVRE');

  await cancelarRevisao(idOcupante, { ignorarPrazo: true, hoje: HOJE });
  for (const doc of [id, idOcupante]) await db.collection('agendamentos').doc(doc).delete();
  console.log('\n(limpeza: tudo o que o teste criou foi apagado)');
  process.exit(0);
}

testar();
