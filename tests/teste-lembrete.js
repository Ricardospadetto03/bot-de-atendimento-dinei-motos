const db = require('../src/database');
const { enviarLembretes } = require('../src/rotinas');
const { reservarRevisao, cancelarRevisao } = require('../src/agenda');

function conferir(descricao, obtido, esperado) {
  const o = JSON.stringify(obtido);
  const e = JSON.stringify(esperado);
  const passou = o === e;
  console.log(`${passou ? 'OK    ' : 'FALHOU'} ${descricao} → ${o}${passou ? '' : ` (esperado: ${e})`}`);
}

const em = (dataHora) => new Date(`${dataHora}:00-03:00`);

async function testar() {
  const id = await reservarRevisao({
    cliente: 'Joana Lembrete', telefone: '5511900005000', whatsapp: '5511900005000',
    modeloMoto: 'CG 160', anoMoto: 2020, dataRevisao: '2027-03-03',
  });
  const cancelada = await db.collection('agendamentos').add({
    cliente: 'Cancelado Lembrete', telefone: '5511900005001', dataRevisao: '2027-03-03',
    status: 'cancelado', lembreteEnviado: false, modeloMoto: 'X', anoMoto: 2020,
  });

  const enviados = [];
  const enviar = async (destino, texto) => { enviados.push({ destino, texto }); };

  conferir('17:59 da véspera: não envia', await enviarLembretes(em('2027-03-02T17:59'), enviar), 0);

  conferir('18:05 da véspera: 1 revisão lembrada', await enviarLembretes(em('2027-03-02T18:05'), enviar), 1);
  console.log('\n--- mensagem para o Dinei ---\n' + (enviados[0] && enviados[0].texto));
  console.log('\n--- mensagem para a cliente ---\n' + (enviados[1] && enviados[1].texto) + '\n');
  conferir('foram 2 mensagens: Dinei e cliente', enviados.map((e) => e.destino), ['DINEI', '5511900005000']);
  conferir('Dinei recebe os dados do cliente', enviados[0].texto.includes('Joana Lembrete') && enviados[0].texto.includes('(11) 90000-5000'), true);
  conferir('cliente recebe o horário', enviados[1].texto.includes('*Amanhã, quarta, 03/03*') && enviados[1].texto.includes('*07:00*'), true);
  conferir('marcado no banco', (await db.collection('agendamentos').doc(id).get()).data().lembreteEnviado, true);

  enviados.length = 0;
  await enviarLembretes(em('2027-03-02T18:15'), enviar);
  await enviarLembretes(em('2027-03-02T21:00'), enviar);
  conferir('não envia duas vezes', enviados.length, 0);

  await db.collection('agendamentos').doc(id).update({ lembreteEnviado: false });
  const [a, b] = await Promise.all([
    enviarLembretes(em('2027-03-02T19:00'), enviar),
    enviarLembretes(em('2027-03-02T19:00'), enviar),
  ]);
  conferir('duas verificações juntas → 1 lembrete só', a + b, 1);
  conferir('e só 2 mensagens', enviados.length, 2);

  await db.collection('agendamentos').doc(id).update({ lembreteEnviado: false });
  enviados.length = 0;
  conferir('00:30 do próprio dia: não envia', await enviarLembretes(em('2027-03-03T00:30'), enviar), 0);

  const enviarComErro = async () => { throw new Error('sem internet (teste)'); };
  conferir('falha no envio não trava', await enviarLembretes(em('2027-03-02T18:30'), enviarComErro), 1);

  await cancelarRevisao(id, { ignorarPrazo: true, hoje: '2027-03-01' });
  await db.collection('agendamentos').doc(id).delete();
  await cancelada.delete();
  console.log('\n(limpeza: revisões de teste apagadas)');
  process.exit(0);
}

testar();
