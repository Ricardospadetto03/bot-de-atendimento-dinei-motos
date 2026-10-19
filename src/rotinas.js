const { FieldPath, FieldValue } = require('firebase-admin/firestore');
const db = require('./database');
const {
  HORARIO_CHEGADA,
  PREVISAO_TERMINO,
  hojeEmBrasilia,
  horaEmBrasilia,
  somarDias,
} = require('./agenda');
const { formatarData } = require('./texto-data');
const { formatarCelular } = require('./validacao');

const DIAS_DE_HISTORICO = 30;

async function apagarTudo(consulta) {
  let total = 0;
  while (true) {
    const resultado = await consulta.limit(400).get();
    if (resultado.empty) break;

    const lote = db.batch();
    resultado.docs.forEach((doc) => lote.delete(doc.ref));
    await lote.commit();

    total += resultado.size;
    if (resultado.size < 400) break;
  }
  return total;
}

async function limparDadosAntigos(hoje = hojeEmBrasilia(), agora = new Date()) {
  const corte = somarDias(hoje, -DIAS_DE_HISTORICO);
  const UM_DIA = 24 * 60 * 60 * 1000;
  const limiteConversas = new Date(agora.getTime() - DIAS_DE_HISTORICO * UM_DIA);

  return {
    corte,
    agendamentos: await apagarTudo(db.collection('agendamentos').where('dataRevisao', '<', corte)),
    agenda: await apagarTudo(db.collection('agenda').where(FieldPath.documentId(), '<', corte)),
    conversas: await apagarTudo(db.collection('conversas').where('atualizadoEm', '<', limiteConversas)),
  };
}

async function executarRotinaDiaria(agora = new Date(), refControle = db.collection('sistema').doc('rotinas')) {
  const hoje = hojeEmBrasilia(agora);

  const jaRodouHoje = await db.runTransaction(async (transacao) => {
    const controle = await transacao.get(refControle);
    if (controle.exists && controle.data().ultimaLimpeza === hoje) return true;
    transacao.set(refControle, { ultimaLimpeza: hoje }, { merge: true });
    return false;
  });

  if (jaRodouHoje) return null;
  return limparDadosAntigos(hoje, agora);
}

const HORA_DO_LEMBRETE = 18;

function textoLembreteDinei(ag) {
  return '🔔 *Lembrete: revisão amanhã*\n\n' +
    `📅 *${formatarData(ag.dataRevisao)}*, chegada às *${HORARIO_CHEGADA}*\n` +
    `👤 ${ag.cliente}\n` +
    `🏍️ ${ag.modeloMoto} ${ag.anoMoto}\n` +
    `📱 ${formatarCelular(ag.telefone)}`;
}

function textoLembreteCliente(ag) {
  return `🔔 Olá, ${ag.cliente.split(' ')[0]}! Passando para lembrar da sua revisão na *Dinei Motos*:\n\n` +
    `📅 *Amanhã, ${formatarData(ag.dataRevisao)}*\n` +
    `🕖 Traga a moto às *${HORARIO_CHEGADA}*. A previsão é ficar pronta por volta das *${PREVISAO_TERMINO}*.\n\n` +
    'Até amanhã! 🏍️\n' +
    'Se tiver algum imprevisto, digite *menu* e escolha a opção *2* para falar com o Dinei.';
}

async function enviarLembretes(agora, enviar) {
  if (horaEmBrasilia(agora) < HORA_DO_LEMBRETE) return 0;

  const amanha = somarDias(hojeEmBrasilia(agora), 1);
  const candidatos = await db.collection('agendamentos').where('dataRevisao', '==', amanha).get();

  let enviados = 0;
  for (const doc of candidatos.docs) {
    const ag = await db.runTransaction(async (transacao) => {
      const atual = await transacao.get(doc.ref);
      if (!atual.exists) return null;
      const dados = atual.data();
      if (dados.status !== 'confirmado' || dados.lembreteEnviado) return null;
      transacao.update(doc.ref, { lembreteEnviado: true, lembreteEnviadoEm: FieldValue.serverTimestamp() });
      return dados;
    });
    if (!ag) continue;

    await enviar('DINEI', textoLembreteDinei(ag)).catch((e) => console.error('Lembrete ao Dinei falhou:', e.message));
    await enviar(ag.whatsapp || ag.telefone, textoLembreteCliente(ag))
      .catch((e) => console.error(`Lembrete ao cliente ${ag.cliente} falhou:`, e.message));
    enviados++;
  }
  return enviados;
}

module.exports = { DIAS_DE_HISTORICO, HORA_DO_LEMBRETE, limparDadosAntigos, executarRotinaDiaria, enviarLembretes };
