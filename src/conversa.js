const db = require('./database');

const TEMPO_LIMITE_MINUTOS = 120;

const TEMPO_LIMITE_POR_ETAPA = {
  COM_DINEI: 24 * 60,
  AGENDADO: 24 * 60,
  FINALIZADO: 24 * 60,
};

async function carregarConversa(telefone, agora = new Date()) {
  const doc = await db.collection('conversas').doc(telefone).get();
  if (!doc.exists) {
    return null;
  }

  const conversa = doc.data();
  const minutosParado = (agora - conversa.atualizadoEm.toDate()) / 60000;
  const limite = TEMPO_LIMITE_POR_ETAPA[conversa.etapa] || TEMPO_LIMITE_MINUTOS;
  if (minutosParado > limite) {
    return null;
  }
  return conversa;
}

async function salvarConversa(telefone, etapa, dados = {}, agora = new Date()) {
  await db.collection('conversas').doc(telefone).set({
    etapa,
    dados,
    atualizadoEm: agora,
  });
}

async function marcarNaoEntendida(telefone, conversa, agora = new Date()) {
  const total = ((conversa && conversa.naoEntendidas) || 0) + 1;
  await db.collection('conversas').doc(telefone).update({ naoEntendidas: total, atualizadoEm: agora });
  return total;
}

async function encerrarConversa(telefone) {
  await db.collection('conversas').doc(telefone).delete();
}

module.exports = { TEMPO_LIMITE_MINUTOS, carregarConversa, salvarConversa, marcarNaoEntendida, encerrarConversa };
