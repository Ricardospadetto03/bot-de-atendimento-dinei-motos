const db = require('../src/database');
const {
  diasEntre,
  prazoFinalCancelamento,
  reservarRevisao,
  buscarRevisaoAtiva,
  cancelarRevisao,
} = require('../src/agenda');

const DATA_TESTE = '2026-12-15';
const TELEFONE_TESTE = '5511900000099';

function conferir(descricao, obtido, esperado) {
  const passou = obtido === esperado;
  console.log(`${passou ? 'OK    ' : 'FALHOU'} ${descricao} → ${obtido}${passou ? '' : ` (esperado: ${esperado})`}`);
}

async function resultadoDe(funcao) {
  try {
    await funcao();
    return 'OK';
  } catch (erro) {
    return erro.message;
  }
}

async function testar() {
  conferir('dias entre 17/10 e 20/10', diasEntre('2026-10-17', '2026-10-20'), 3);
  conferir('prazo final p/ revisão em 20/10', prazoFinalCancelamento('2026-10-20'), '2026-10-17');

  const id = await reservarRevisao({
    cliente: 'Teste Cancelamento', telefone: TELEFONE_TESTE,
    modeloMoto: 'Teste', anoMoto: 2021, dataRevisao: DATA_TESTE,
  });
  console.log(`\nReserva de teste criada: ${id} em ${DATA_TESTE}\n`);

  const ativa = await buscarRevisaoAtiva(TELEFONE_TESTE, '2026-12-01');
  conferir('busca pelo telefone acha a reserva', ativa && ativa.id, id);

  conferir('cliente cancelando 2 dias antes',
    await resultadoDe(() => cancelarRevisao(id, { hoje: '2026-12-13' })), 'PRAZO_ENCERRADO');

  conferir('cliente cancelando 3 dias antes',
    await resultadoDe(() => cancelarRevisao(id, { hoje: '2026-12-12' })), 'OK');

  const depois = await db.collection('agendamentos').doc(id).get();
  conferir('status no banco', depois.data().status, 'cancelado');
  conferir('cancelado por', depois.data().canceladoPor, 'cliente');
  const ficha = await db.collection('agenda').doc(DATA_TESTE).get();
  conferir('ficha do dia apagada (vaga livre)', ficha.exists, false);

  conferir('cancelar duas vezes',
    await resultadoDe(() => cancelarRevisao(id, { hoje: '2026-12-12' })), 'JA_CANCELADO');

  conferir('busca depois do cancelamento', await buscarRevisaoAtiva(TELEFONE_TESTE, '2026-12-01'), null);

  const id2 = await reservarRevisao({
    cliente: 'Teste Vaga Liberada', telefone: TELEFONE_TESTE,
    modeloMoto: 'Teste', anoMoto: 2021, dataRevisao: DATA_TESTE,
  });
  conferir('nova reserva no dia liberado', typeof id2, 'string');

  conferir('Dinei cancelando na véspera',
    await resultadoDe(() => cancelarRevisao(id2, { hoje: '2026-12-14', ignorarPrazo: true })), 'OK');
  const depois2 = await db.collection('agendamentos').doc(id2).get();
  conferir('cancelado por', depois2.data().canceladoPor, 'dinei');
}

testar();
