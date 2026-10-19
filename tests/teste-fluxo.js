const db = require('../src/database');
const { responderMensagem } = require('../src/bot');
const { carregarConversa, encerrarConversa } = require('../src/conversa');
const { cancelarRevisao, reservarRevisao } = require('../src/agenda');
const { interpretarCelular, formatarCelular, interpretarAno, interpretarNome } = require('../src/validacao');
const { registrarEnvioParaDinei } = require('../src/avisos');

const avisosAoDinei = [];
registrarEnvioParaDinei(async (texto) => { avisosAoDinei.push(texto); });

const TEL = '5511900000095';
const AGORA = new Date('2027-11-19T10:00:00-03:00');

function conferir(descricao, obtido, esperado) {
  const o = JSON.stringify(obtido);
  const e = JSON.stringify(esperado);
  const passou = o === e;
  console.log(`${passou ? 'OK    ' : 'FALHOU'} ${descricao} → ${o}${passou ? '' : ` (esperado: ${e})`}`);
}

async function diz(mensagem) {
  const resposta = await responderMensagem(TEL, mensagem, AGORA);
  console.log(`\nCliente: ${mensagem}`);
  console.log(resposta === null ? '(bot em silêncio)' : `Bot: ${resposta}`);
  return resposta;
}

async function testar() {
  conferir('nome arrumado', interpretarNome('  ricardo   DA silva '), 'Ricardo da Silva');
  conferir('celular com máscara', interpretarCelular('(27) 99999-8888'), '5527999998888');
  conferir('celular com +55', interpretarCelular('+55 27 99999 8888'), '5527999998888');
  conferir('celular curto', interpretarCelular('99999'), null);
  conferir('formatar celular', formatarCelular('5527999998888'), '(27) 99999-8888');
  conferir('ano "é 2020"', interpretarAno('é 2020', 2026), 2020);
  conferir('ano "20"', interpretarAno('20', 2026), null);
  conferir('ano 2035', interpretarAno('2035', 2026), null);

  await encerrarConversa(TEL);
  const idOcupante = await reservarRevisao({
    cliente: 'Ocupante Teste', telefone: '5511900000094', whatsapp: '5511900000094',
    modeloMoto: 'TESTE', anoMoto: 2020, dataRevisao: '2027-12-01',
  });
  await diz('oi');
  await diz('1');
  await diz('  ricardo   spadetto ');
  let r = await diz('123');
  conferir('celular inválido pede de novo', r.startsWith('❌ Esse número parece incompleto'), true);
  await diz('(11) 90000-0095');
  await diz('crf 250f');
  r = await diz('20');
  conferir('ano inválido pede de novo', r.startsWith('❌ O ano precisa ter 4 números'), true);
  await diz('2020');
  r = await diz('bom dia');
  conferir('data não entendida', r.startsWith('❌ Não consegui entender a data'), true);
  r = await diz('pode ser dia 01/12?');
  conferir('01/12 ocupada oferece 3 opções (pulando sáb a seg)', r.includes('1️⃣ quinta, 02/12') && r.includes('3️⃣ terça, 07/12'), true);
  r = await diz('3');
  conferir('escolheu a 3 → resumo', r.includes('📅 Dia: terça, 07/12'), true);
  r = await diz('hmm');
  conferir('resposta estranha no resumo', r.startsWith('🤔 Não entendi. Responda *1* para confirmar'), true);
  r = await diz('sim');
  conferir('agendado', r.startsWith('✅ *Revisão agendada!*'), true);
  conferir('avisa a regra dos 3 dias', r.includes('*3 dias de antecedência*, ou seja, até *sábado, 04/12*'), true);
  r = await diz('obrigado!');
  conferir('depois de agendar, silêncio', r, null);

  const conversa = await carregarConversa(TEL, AGORA);
  const doc = await db.collection('agendamentos').doc(conversa.dados.agendamentoId).get();
  const ag = doc.data();
  conferir('gravado: cliente', ag.cliente, 'Ricardo Spadetto');
  conferir('gravado: telefone', ag.telefone, '5511900000095');
  conferir('gravado: moto', ag.modeloMoto, 'CRF 250F');
  conferir('gravado: ano (número)', ag.anoMoto, 2020);
  conferir('gravado: data', ag.dataRevisao, '2027-12-07');
  conferir('gravado: status', ag.status, 'confirmado');
  conferir('gravado: whatsapp', ag.whatsapp, TEL);

  console.log('\n--- cancelamento ---');
  r = await diz('menu');
  conferir('menu volta com a opção 3', r.includes('3️⃣ Cancelar uma revisão'), true);
  r = await diz('3');
  conferir('acha a revisão pelo WhatsApp', r.includes('📅 *terça, 07/12*'), true);
  r = await diz('não');
  conferir('desistiu de cancelar', r.includes('continua marcada'), true);
  conferir('desistir NÃO avisa o Dinei', avisosAoDinei.length, 0);

  await diz('menu');
  await diz('quero cancelar');
  r = await diz('1');
  conferir('cancelou', r.startsWith('✅ Pronto! A sua revisão de *terça, 07/12* foi cancelada'), true);
  const depois = await db.collection('agendamentos').doc(conversa.dados.agendamentoId).get();
  conferir('status no banco', depois.data().status, 'cancelado');
  conferir('vaga 07/12 livre de novo', (await db.collection('agenda').doc('2027-12-07').get()).exists, false);
  console.log(`\n--- aviso que chegou para o Dinei ---\n${avisosAoDinei[0]}`);
  conferir('Dinei recebeu 1 aviso', avisosAoDinei.length, 1);
  conferir('aviso diz quem, quando e que o dia ficou livre',
    avisosAoDinei[0].startsWith('🔔 *Revisão cancelada pelo cliente*') &&
    avisosAoDinei[0].includes('*terça, 07/12* — o dia ficou *livre*') &&
    avisosAoDinei[0].includes('Ricardo Spadetto') && avisosAoDinei[0].includes('CRF 250F 2020') &&
    avisosAoDinei[0].includes('(11) 90000-0095'), true);

  await diz('menu');
  r = await diz('3');
  conferir('sem revisão para cancelar', r.startsWith('🔎 Não encontrei nenhuma revisão'), true);

  console.log('\n--- fora do prazo ---');
  const DOMINGO = new Date('2027-11-21T10:00:00-03:00');
  const idPerto = await reservarRevisao({
    cliente: 'Teste Prazo', telefone: TEL, whatsapp: TEL,
    modeloMoto: 'TESTE', anoMoto: 2020, dataRevisao: '2027-11-23',
  });
  await responderMensagem(TEL, 'menu', DOMINGO);
  r = await responderMensagem(TEL, '3', DOMINGO);
  console.log(`Cliente: 3\nBot: ${r}`);
  conferir('recusa por prazo', r.includes('esse prazo já passou'), true);
  conferir('recusa por prazo NÃO avisa o Dinei', avisosAoDinei.length, 1);
  const aindaAtiva = await db.collection('agendamentos').doc(idPerto).get();
  conferir('revisão continua confirmada', aindaAtiva.data().status, 'confirmado');

  await cancelarRevisao(idPerto, { ignorarPrazo: true, hoje: '2027-11-21' });
  await cancelarRevisao(idOcupante, { ignorarPrazo: true, hoje: '2027-11-21' });
  for (const id of [idPerto, idOcupante, conversa.dados.agendamentoId]) {
    await db.collection('agendamentos').doc(id).delete();
  }
  await encerrarConversa(TEL);
  console.log('\n(limpeza: reservas de teste canceladas e conversa apagada)');
}

testar();
