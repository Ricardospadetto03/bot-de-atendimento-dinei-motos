const {
  HORARIO_CHEGADA,
  PREVISAO_TERMINO,
  hojeEmBrasilia,
  somarDias,
  diaDaSemana,
  ehDiaDeRevisao,
  proximaDataLivre,
  reservarRevisao,
  cancelarRevisao,
} = require('../src/agenda');
const db = require('../src/database');

const NOMES_DIAS = ['domingo', 'segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado'];

function conferir(descricao, obtido, esperado) {
  const passou = obtido === esperado;
  console.log(`${passou ? 'OK    ' : 'FALHOU'} ${descricao} → ${obtido}${passou ? '' : ` (esperado: ${esperado})`}`);
}

async function testar() {
  console.log('Hoje em Brasília:', hojeEmBrasilia(), '\n');

  conferir('virada de mês (31/10 + 1)', somarDias('2026-10-31', 1), '2026-11-01');
  conferir('virada de ano (31/12 + 1)', somarDias('2026-12-31', 1), '2027-01-01');
  conferir('01/12/2026 é terça', NOMES_DIAS[diaDaSemana('2026-12-01')], 'terça');
  conferir('sexta 04/12 é dia de revisão', ehDiaDeRevisao('2026-12-04'), true);
  conferir('sábado 05/12 NÃO é dia de revisão', ehDiaDeRevisao('2026-12-05'), false);
  conferir('segunda 07/12 NÃO é dia de revisão', ehDiaDeRevisao('2026-12-07'), false);

  const idOcupante = await reservarRevisao({
    cliente: 'Ocupante Teste', telefone: '5511900000092', whatsapp: '5511900000092',
    modeloMoto: 'TESTE', anoMoto: 2020, dataRevisao: '2026-12-01',
  });
  conferir('livre a partir de 01/12 (ocupada)', await proximaDataLivre('2026-12-01'), '2026-12-02');
  await cancelarRevisao(idOcupante, { ignorarPrazo: true, hoje: '2026-11-20' });
  await db.collection('agendamentos').doc(idOcupante).delete();

  conferir('livre a partir de sábado 05/12', await proximaDataLivre('2026-12-05'), '2026-12-08');

  try {
    await reservarRevisao({
      cliente: 'Teste', telefone: '5511900000000',
      modeloMoto: 'Teste', anoMoto: 2020, dataRevisao: '2026-12-05',
    });
    conferir('reserva no sábado é recusada', 'RESERVOU', 'DIA_INVALIDO');
  } catch (erro) {
    conferir('reserva no sábado é recusada', erro.message, 'DIA_INVALIDO');
  }

  const sugestao = await proximaDataLivre();
  console.log(
    `\nPróxima data livre a partir de amanhã: ${sugestao} (${NOMES_DIAS[diaDaSemana(sugestao)]}),` +
    ` chegada às ${HORARIO_CHEGADA}, previsão de término ${PREVISAO_TERMINO}.`
  );
  process.exit(0);
}

testar();
