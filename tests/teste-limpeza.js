const db = require('../src/database');
const { limparDadosAntigos, executarRotinaDiaria } = require('../src/rotinas');

const HOJE = '2020-03-01';
const AGORA = new Date('2020-03-01T10:00:00-03:00');

function conferir(descricao, obtido, esperado) {
  const o = JSON.stringify(obtido);
  const e = JSON.stringify(esperado);
  const passou = o === e;
  console.log(`${passou ? 'OK    ' : 'FALHOU'} ${descricao} → ${o}${passou ? '' : ` (esperado: ${e})`}`);
}

const existe = async (colecao, id) => (await db.collection(colecao).doc(id).get()).exists;

async function testar() {
  await db.collection('agendamentos').doc('teste-limpeza-velho').set({ cliente: 'Teste Limpeza', dataRevisao: '2020-01-10', status: 'confirmado' });
  await db.collection('agendamentos').doc('teste-limpeza-recente').set({ cliente: 'Teste Limpeza', dataRevisao: '2020-02-20', status: 'confirmado' });
  await db.collection('agenda').doc('2020-01-10').set({ agendamentoId: 'teste-limpeza-velho' });
  await db.collection('agenda').doc('2020-02-20').set({ agendamentoId: 'teste-limpeza-recente' });
  await db.collection('agenda').doc('2020-03-10').set({ agendamentoId: 'teste-limpeza-futuro' });
  await db.collection('conversas').doc('teste-limpeza-velha').set({ etapa: 'NOME', dados: {}, atualizadoEm: new Date('2020-01-10T10:00:00-03:00') });
  await db.collection('conversas').doc('teste-limpeza-nova').set({ etapa: 'NOME', dados: {}, atualizadoEm: new Date('2020-02-20T10:00:00-03:00') });

  const resultado = await limparDadosAntigos(HOJE, AGORA);
  console.log('Resultado:', resultado);
  conferir('data de corte (30 dias antes)', resultado.corte, '2020-01-31');

  conferir('agendamento velho apagado', await existe('agendamentos', 'teste-limpeza-velho'), false);
  conferir('agendamento recente mantido', await existe('agendamentos', 'teste-limpeza-recente'), true);
  conferir('ficha velha da agenda apagada', await existe('agenda', '2020-01-10'), false);
  conferir('ficha recente da agenda mantida', await existe('agenda', '2020-02-20'), true);
  conferir('conversa parada há 50 dias apagada', await existe('conversas', 'teste-limpeza-velha'), false);
  conferir('conversa de 10 dias atrás mantida', await existe('conversas', 'teste-limpeza-nova'), true);

  conferir('dia futuro (10/03/2020) mantido', await existe('agenda', '2020-03-10'), true);

  const controle = db.collection('sistema').doc('rotinas-teste');
  await controle.delete();
  conferir('1ª vez no dia: roda', (await executarRotinaDiaria(AGORA, controle)) !== null, true);
  conferir('2ª vez no mesmo dia: não roda', await executarRotinaDiaria(AGORA, controle), null);
  conferir('no dia seguinte: roda de novo',
    (await executarRotinaDiaria(new Date('2020-03-02T10:00:00-03:00'), controle)) !== null, true);

  await db.collection('agendamentos').doc('teste-limpeza-recente').delete();
  await db.collection('agenda').doc('2020-02-20').delete();
  await db.collection('agenda').doc('2020-03-10').delete();
  await db.collection('conversas').doc('teste-limpeza-nova').delete();
  await controle.delete();
  console.log('\n(limpeza: dados de teste apagados)');
}

testar();
