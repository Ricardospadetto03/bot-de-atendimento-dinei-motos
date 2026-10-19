const NUMERO_DINEI = '5511900000090';
process.env.NUMERO_DINEI = NUMERO_DINEI;

const db = require('../src/database');
const { responderMensagem } = require('../src/bot');
const { carregarConversa, encerrarConversa } = require('../src/conversa');
const { extrairMotivo } = require('../src/chefe');
const { registrarEnvioParaCliente, registrarEnvioParaDinei } = require('../src/avisos');

const avisosClientes = [];
const avisosDinei = [];
registrarEnvioParaCliente(async (numero, texto, etapa) => { avisosClientes.push({ numero, texto, etapa }); });
registrarEnvioParaDinei(async (texto) => { avisosDinei.push(texto); });
const { verificarData, reservarRevisao, desbloquearDia, cancelarRevisao } = require('../src/agenda');

const AGORA = new Date('2026-11-20T10:00:00-03:00');

function conferir(descricao, obtido, esperado) {
  const o = JSON.stringify(obtido);
  const e = JSON.stringify(esperado);
  const passou = o === e;
  console.log(`${passou ? 'OK    ' : 'FALHOU'} ${descricao} → ${o}${passou ? '' : ` (esperado: ${e})`}`);
}

async function dinei(mensagem) {
  const resposta = await responderMensagem(NUMERO_DINEI, mensagem, AGORA);
  console.log(`\nDinei: ${mensagem}\nBot:   ${resposta}`);
  return resposta;
}

const etapaAtual = async () => (await carregarConversa(NUMERO_DINEI, AGORA)).etapa;

async function testar() {
  conferir('motivo de "25/12 Natal"', extrairMotivo('25/12 Natal'), 'Natal');
  conferir('motivo de "dia 23 de dezembro férias"', extrairMotivo('dia 23 de dezembro férias'), 'férias');
  conferir('sem motivo', extrairMotivo('25/12'), '');

  await encerrarConversa(NUMERO_DINEI);
  for (const d of ['2026-12-25', '2026-12-23', '2026-12-01']) await desbloquearDia(d).catch(() => {});

  const idClienteB = await reservarRevisao({
    cliente: 'Cliente B', telefone: '5511900000002', whatsapp: '5511900000002',
    modeloMoto: 'FAZER 250', anoMoto: 2022, dataRevisao: '2026-12-01',
  });

  let r = await dinei('oi');
  conferir('menu do chefe', r.startsWith('🔧 *Menu do Dinei*'), true);
  r = await dinei('banana');
  conferir('opção inválida explica e mostra as opções', r.startsWith('🤔 Não entendi.') && r.includes('5️⃣'), true);

  r = await dinei('1');
  conferir('agenda mostra o Cliente B em 01/12', r.includes('terça, 01/12 — Cliente B'), true);
  conferir('depois da tarefa, oferece o menu de novo', r.includes('Quer fazer mais alguma coisa?'), true);

  r = await dinei('2');
  conferir('pergunta do bloqueio tem exemplo e "menu"', r.includes('*25/12 Natal*') && r.includes('digite *menu*'), true);
  r = await dinei('natal');
  conferir('data errada: explica e pede de novo', r.startsWith('❌ Não entendi a data em "natal"') && r.includes('Tente de novo'), true);
  conferir('continua na etapa de bloquear', await etapaAtual(), 'CHEFE_BLOQUEAR');
  r = await dinei('05/12');
  conferir('sábado: explica e pede de novo', r.includes('só terça a sexta') && r.includes('Tente de novo'), true);
  r = await dinei('25/12 Natal');
  conferir('bloqueou 25/12', r.startsWith('✅ Pronto! sexta, 25/12 está bloqueado (Natal).'), true);
  conferir('voltou ao menu', await etapaAtual(), 'CHEFE_MENU');
  conferir('cliente vê 25/12 como BLOQUEADA', (await verificarData('2026-12-25', '2026-11-20')).situacao, 'BLOQUEADA');

  r = await dinei('bloquear 25/12');
  conferir('bloquear de novo', r.includes('já estava bloqueado'), true);
  r = await dinei('bloquear 01/12');
  conferir('dia com cliente: avisa, não bloqueia', r.startsWith('⚠️ Não bloqueei'), true);
  r = await dinei('bloquear dia 23 de dezembro férias');
  conferir('bloqueou com motivo', r.includes('quarta, 23/12 está bloqueado (férias)'), true);
  r = await dinei('agenda');
  conferir('agenda mostra o bloqueio', r.includes('🚫 bloqueado: férias'), true);

  await dinei('3');
  r = await dinei('24/12');
  conferir('desbloquear dia não bloqueado: pede de novo', r.includes('não estava bloqueado') && r.includes('Tente de novo'), true);
  r = await dinei('23/12');
  conferir('desbloqueou', r.startsWith('✅ Pronto! quarta, 23/12 foi desbloqueado'), true);

  const id = await reservarRevisao({
    cliente: 'Teste Chefe', telefone: '5511900000089', whatsapp: '5511900000089',
    modeloMoto: 'BIZ 125', anoMoto: 2019, dataRevisao: '2026-12-09',
  });
  r = await dinei('cancelar 09/12');
  conferir('mostra a revisão antes de cancelar', r.includes('Teste Chefe (BIZ 125 2019)'), true);
  r = await dinei('talvez');
  conferir('resposta estranha: explica as opções', r.startsWith('🤔 Não entendi. Responda *1*'), true);
  r = await dinei('não');
  conferir('manteve', r.startsWith('👍 Tudo bem, a revisão continua marcada.'), true);
  await dinei('4');
  r = await dinei('10/12');
  conferir('dia sem revisão: pede de novo', r.startsWith('❌ Não tem revisão em quinta, 10/12') && r.includes('Tente de novo'), true);
  await dinei('09/12');
  r = await dinei('1');
  conferir('cancelou', r.startsWith('✅ Pronto! A revisão de quarta, 09/12 foi cancelada'), true);
  conferir('Dinei fica sabendo que o cliente vai ser avisado', r.includes('Estou avisando o cliente no WhatsApp dele'), true);
  {
    const aviso = avisosClientes.pop();
    console.log(`\n--- mensagem que o cliente recebeu (cancelado pelo dono) ---\n${aviso && aviso.texto}`);
    conferir('cliente avisado no número dele', aviso && aviso.numero, '5511900000089');
    conferir('aviso diz que a oficina cancelou e como remarcar', aviso.texto.startsWith('❌ *Revisão cancelada*') &&
      aviso.texto.includes('*quarta, 09/12*') && aviso.texto.includes('cancelada pela oficina') &&
      aviso.texto.includes('digitar *menu*'), true);
    conferir('conversa do cliente fica em silêncio (FINALIZADO)', aviso.etapa, 'FINALIZADO');
  }
  const ag = (await db.collection('agendamentos').doc(id).get()).data();
  conferir('status', ag.status, 'cancelado');
  conferir('cancelado por', ag.canceladoPor, 'dinei');

  console.log('\n--- agendamento manual ---');
  r = await dinei('agendar 01/12');
  conferir('dia ocupado: mostra quem e os próximos livres', r.includes('Cliente B') && r.includes('Próximos dias livres'), true);
  conferir('sugere tentar o primeiro livre', r.includes('Tente de novo, por exemplo: *02/12*'), true);
  r = await dinei('02/12');
  conferir('dia livre: pede o nome', r.startsWith('👍 quarta, 02/12 está livre!'), true);
  await dinei('joão da silva');
  r = await dinei('123');
  conferir('celular inválido: pede de novo', r.startsWith('❌ Esse número não parece certo'), true);
  await dinei('11 90000-0087');
  await dinei('pop 110i');
  r = await dinei('2021');
  conferir('resumo', r.includes('👤 João da Silva') && r.includes('🏍️ POP 110I 2021'), true);
  r = await dinei('sim');
  conferir('agendou', r.startsWith('✅ Agendado! João da Silva'), true);
  conferir('Dinei fica sabendo que o cliente vai receber a confirmação', r.includes('Estou mandando a confirmação'), true);
  {
    const aviso = avisosClientes.pop();
    console.log(`\n--- mensagem que o cliente recebeu (agendado pelo dono) ---\n${aviso && aviso.texto}`);
    conferir('cliente recebe no número que o Dinei digitou', aviso && aviso.numero, '5511900000087');
    conferir('resumo: dia, horário e moto', aviso.texto.startsWith('✅ *Revisão agendada na Dinei Motos!*') &&
      aviso.texto.includes('Olá, João!') && aviso.texto.includes('*quarta, 02/12*') &&
      aviso.texto.includes('*07:00*') && aviso.texto.includes('POP 110I 2021'), true);
    conferir('regra dos 3 dias com a data limite', aviso.texto.includes('*3 dias de antecedência*, ou seja, até *domingo, 29/11*'), true);
    conferir('conversa do cliente fica em silêncio (AGENDADO)', aviso.etapa, 'AGENDADO');
  }

  const agManual = (await db.collection('agendamentos')
    .where('telefone', '==', '5511900000087').where('status', '==', 'confirmado').get()).docs[0];
  conferir('origem dinei', agManual.data().origem, 'dinei');
  conferir('whatsapp = celular do cliente', agManual.data().whatsapp, '5511900000087');
  r = await dinei('agenda');
  conferir('aparece na agenda', r.includes('quarta, 02/12 — João da Silva'), true);

  await dinei('5');
  r = await dinei('20/11');
  conferir('Dinei pode agendar para hoje', r.startsWith('👍 sexta, 20/11 está livre!'), true);
  await dinei('menu');

  await cancelarRevisao(agManual.id, { ignorarPrazo: true, hoje: '2026-11-20' });

  console.log('\n--- opção 5: agendar com os dias livres na tela ---');
  r = await dinei('menu');
  conferir('menu tem a opção 5 de agendar', r.includes('5️⃣ Agendar uma revisão para um cliente'), true);
  conferir('menu NÃO tem mais a opção 6', r.includes('6️⃣'), false);
  r = await dinei('5');
  console.log(`\nDinei: 5\nBot:   ${r}`);
  conferir('abre com o título de agendar', r.startsWith('📅 *Agendar uma revisão*'), true);
  conferir('lista NÃO inclui hoje (sexta, 20/11)', r.includes('20/11'), false);
  conferir('começa no próximo dia útil, pulando sábado a segunda', r.includes('1️⃣ terça, 24/11'), true);
  conferir('mostra 5 dias', r.includes('5️⃣'), true);
  conferir('ensina a digitar outra data', r.includes('Para outro dia, escreva a data'), true);
  r = await dinei('talvez');
  conferir('resposta estranha: explica as opções', r.startsWith('🤔 Não entendi. Responda o *número* do dia'), true);
  r = await dinei('2');
  conferir('número do dia → direto para o nome', r.startsWith('👍 quarta, 25/11 está livre!'), true);
  conferir('etapa = nome do cliente', await etapaAtual(), 'CHEFE_AG_NOME');

  await dinei('menu');
  await dinei('5');
  r = await dinei('hoje');
  conferir('"hoje" → Dinei agenda para hoje', r.startsWith('👍 sexta, 20/11 está livre!'), true);

  await dinei('livres');
  r = await dinei('01/12');
  conferir('data escrita na lista: confere (01/12 ocupado)', r.includes('Já tem revisão nesse dia'), true);
  await dinei('menu');

  console.log('\n--- bloqueio por período ---');
  const idNoPeriodo = await reservarRevisao({
    cliente: 'Cliente Ferias', telefone: '5511900000086', whatsapp: '5511900000086',
    modeloMoto: 'CG 160', anoMoto: 2020, dataRevisao: '2027-12-16',
  });
  r = await dinei('bloquear 14 a 22/12/2027 férias');
  console.log(`\nDinei: bloquear 14 a 22/12/2027 férias\nBot:   ${r}`);
  conferir('mostra o período e o motivo', r.startsWith('🚫 *Bloquear de 14/12 a 22/12* (férias)'), true);
  conferir('lista os 5 dias de trabalho livres', r.includes('estes 5 dias') &&
    ['terça, 14/12', 'quarta, 15/12', 'sexta, 17/12', 'terça, 21/12', 'quarta, 22/12'].every((d) => r.includes(d)), true);
  conferir('avisa que 16/12 tem cliente e não será bloqueado', r.includes('Não vou bloquear') && r.includes('Cliente Ferias'), true);
  conferir('pede confirmação', await etapaAtual(), 'CHEFE_CONFIRMA_PERIODO');
  r = await dinei('talvez');
  conferir('resposta estranha: explica', r.startsWith('🤔 Não entendi. Responda *1* para bloquear'), true);
  r = await dinei('1');
  conferir('bloqueou 5 dias', r.startsWith('✅ Pronto! 5 dias bloqueados de 14/12 a 22/12 (férias)'), true);
  const fichas = await Promise.all(['2027-12-14', '2027-12-15', '2027-12-16', '2027-12-17', '2027-12-21', '2027-12-22']
    .map(async (d) => [d, (await db.collection('agenda').doc(d).get()).data()]));
  conferir('no banco: 5 bloqueados com motivo, e o 16 continua com o cliente', fichas.map(([d, f]) =>
    `${d.slice(8)}:${f.bloqueado ? f.motivo : 'cliente'}`),
  ['14:férias', '15:férias', '16:cliente', '17:férias', '21:férias', '22:férias']);

  r = await dinei('bloquear 14 a 22');
  conferir('sem o mês: pede de novo (não bloqueia só o dia 14)', r.startsWith('❌ Não entendi o período'), true);
  r = await dinei('bloquear 14 a 22/12/2027');
  conferir('bloquear de novo: nada a fazer', r.includes('Não há nenhum dia para bloquear') && r.includes('Já estavam bloqueados'), true);
  await dinei('bloquear 23/12/2027 a 24/12/2027');
  r = await dinei('2');
  conferir('desistir não muda nada', r.startsWith('👍 Tudo bem, nada foi bloqueado.') &&
    !(await db.collection('agenda').doc('2027-12-23').get()).exists, true);

  r = await dinei('desbloquear 14/12/2027 até 22/12/2027');
  conferir('desbloqueou os 5 (e não mexeu no cliente)', r.startsWith('✅ Pronto! 5 dias desbloqueados'), true);
  conferir('16/12 continua com o cliente', (await db.collection('agenda').doc('2027-12-16').get()).data().agendamentoId, idNoPeriodo);
  r = await dinei('desbloquear 14 a 22/12/2027');
  conferir('desbloquear de novo: avisa que não havia bloqueio', r.startsWith('❌ Não havia nenhum dia bloqueado'), true);
  await cancelarRevisao(idNoPeriodo, { ignorarPrazo: true, hoje: '2026-11-20' });
  await db.collection('agendamentos').doc(idNoPeriodo).delete();
  await dinei('menu');

  r = await responderMensagem('5511900000088', 'oi', AGORA);
  conferir('cliente comum recebe o menu normal', r.startsWith('Bom dia! Seja bem-vindo'), true);

  await desbloquearDia('2026-12-25');
  await cancelarRevisao(idClienteB, { ignorarPrazo: true, hoje: '2026-11-20' });
  for (const doc of [idClienteB, id, agManual.id]) await db.collection('agendamentos').doc(doc).delete();
  await encerrarConversa(NUMERO_DINEI);
  await encerrarConversa('5511900000088');
  console.log('\n(limpeza: tudo o que o teste criou foi apagado)');
  process.exit(0);
}

testar();
