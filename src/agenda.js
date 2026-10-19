const { FieldValue, FieldPath } = require('firebase-admin/firestore');

const db = require('./database');
const { variantesDoNumero } = require('./validacao');

const DIAS_DE_REVISAO = [2, 3, 4, 5];

const HORARIO_CHEGADA = '07:00';
const PREVISAO_TERMINO = '12:00';

const JANELA_DE_BUSCA_DIAS = 60;

const ANTECEDENCIA_MINIMA_CANCELAMENTO = 3;

const FUSO = 'America/Sao_Paulo';

function hojeEmBrasilia(agora = new Date()) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: FUSO,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(agora);
}

function horaEmBrasilia(agora = new Date()) {
  const hora = new Intl.DateTimeFormat('pt-BR', {
    timeZone: FUSO,
    hour: '2-digit',
    hourCycle: 'h23',
  }).format(agora);
  return Number(hora);
}

function somarDias(data, quantidade) {
  const [ano, mes, dia] = data.split('-').map(Number);
  const resultado = new Date(Date.UTC(ano, mes - 1, dia + quantidade));
  return resultado.toISOString().slice(0, 10);
}

function diaDaSemana(data) {
  return new Date(data + 'T00:00:00Z').getUTCDay();
}

function ehDiaDeRevisao(data) {
  return DIAS_DE_REVISAO.includes(diaDaSemana(data));
}

function diasEntre(de, ate) {
  const MS_POR_DIA = 24 * 60 * 60 * 1000;
  return (Date.parse(ate + 'T00:00:00Z') - Date.parse(de + 'T00:00:00Z')) / MS_POR_DIA;
}

function prazoFinalCancelamento(dataRevisao) {
  return somarDias(dataRevisao, -ANTECEDENCIA_MINIMA_CANCELAMENTO);
}

async function listarDatasLivres(aPartirDe, quantidade) {
  const fim = somarDias(aPartirDe, JANELA_DE_BUSCA_DIAS);

  const ocupados = await db
    .collection('agenda')
    .where(FieldPath.documentId(), '>=', aPartirDe)
    .where(FieldPath.documentId(), '<=', fim)
    .get();

  const datasOcupadas = new Set(ocupados.docs.map((doc) => doc.id));

  const livres = [];
  for (let i = 0; i <= JANELA_DE_BUSCA_DIAS && livres.length < quantidade; i++) {
    const data = somarDias(aPartirDe, i);
    if (ehDiaDeRevisao(data) && !datasOcupadas.has(data)) {
      livres.push(data);
    }
  }
  return livres;
}

async function proximaDataLivre(aPartirDe = somarDias(hojeEmBrasilia(), 1)) {
  const livres = await listarDatasLivres(aPartirDe, 1);
  return livres[0] || null;
}

const QUANTIDADE_DE_SUGESTOES = 3;

async function listarDatasLivresNoMes(ano, mes, hoje = hojeEmBrasilia()) {
  const primeiroDia = `${ano}-${String(mes).padStart(2, '0')}-01`;
  const amanha = somarDias(hoje, 1);
  const inicio = primeiroDia > amanha ? primeiroDia : amanha;

  const ultimoDia = new Date(Date.UTC(ano, mes, 0)).toISOString().slice(0, 10);

  const livres = await listarDatasLivres(inicio, QUANTIDADE_DE_SUGESTOES);
  return livres.filter((data) => data <= ultimoDia);
}

async function verificarData(data, hoje = hojeEmBrasilia()) {
  const amanha = somarDias(hoje, 1);

  if (data < amanha) {
    return { situacao: 'DATA_PASSADA', sugestoes: await listarDatasLivres(amanha, QUANTIDADE_DE_SUGESTOES) };
  }

  if (!ehDiaDeRevisao(data)) {
    return { situacao: 'DIA_INVALIDO', sugestoes: await listarDatasLivres(data, QUANTIDADE_DE_SUGESTOES) };
  }

  const livres = await listarDatasLivres(data, QUANTIDADE_DE_SUGESTOES);
  if (livres[0] === data) {
    return { situacao: 'LIVRE', sugestoes: [] };
  }

  const ficha = await db.collection('agenda').doc(data).get();
  if (ficha.exists && ficha.data().bloqueado) {
    return { situacao: 'BLOQUEADA', sugestoes: livres };
  }
  return { situacao: 'OCUPADA', sugestoes: livres };
}

async function listarAgenda(aPartirDe, limite = 10) {
  const fichas = await db
    .collection('agenda')
    .where(FieldPath.documentId(), '>=', aPartirDe)
    .orderBy(FieldPath.documentId())
    .limit(limite)
    .get();

  const refs = fichas.docs
    .filter((f) => f.data().agendamentoId)
    .map((f) => db.collection('agendamentos').doc(f.data().agendamentoId));
  const agendamentos = refs.length > 0 ? await db.getAll(...refs) : [];

  const porId = new Map(agendamentos.map((doc) => [doc.id, doc.data()]));

  return fichas.docs.map((f) => {
    const ficha = f.data();
    return {
      data: f.id,
      bloqueado: ficha.bloqueado === true,
      motivo: ficha.motivo || null,
      agendamentoId: ficha.agendamentoId || null,
      agendamento: porId.get(ficha.agendamentoId) || null,
    };
  });
}

async function consultarDia(data) {
  const [dia] = await listarAgenda(data, 1);
  return dia && dia.data === data ? dia : null;
}

async function bloquearDia(data, motivo) {
  const refDia = db.collection('agenda').doc(data);
  await db.runTransaction(async (transacao) => {
    const ficha = await transacao.get(refDia);
    if (ficha.exists) {
      throw new Error(ficha.data().bloqueado ? 'JA_BLOQUEADO' : 'DIA_COM_REVISAO');
    }
    transacao.set(refDia, {
      bloqueado: true,
      motivo: motivo || null,
      reservadoEm: FieldValue.serverTimestamp(),
    });
  });
}

async function desbloquearDia(data) {
  const refDia = db.collection('agenda').doc(data);
  await db.runTransaction(async (transacao) => {
    const ficha = await transacao.get(refDia);
    if (!ficha.exists || !ficha.data().bloqueado) {
      throw new Error('NAO_BLOQUEADO');
    }
    transacao.delete(refDia);
  });
}

async function reservarRevisao(dados) {
  const { cliente, telefone, whatsapp, modeloMoto, anoMoto, dataRevisao, origem } = dados;

  if (!ehDiaDeRevisao(dataRevisao)) {
    throw new Error('DIA_INVALIDO');
  }

  const refDia = db.collection('agenda').doc(dataRevisao);

  const refAgendamento = db.collection('agendamentos').doc();

  await db.runTransaction(async (transacao) => {
    const fichaDia = await transacao.get(refDia);

    if (fichaDia.exists) {
      throw new Error('DATA_OCUPADA');
    }

    transacao.set(refDia, {
      agendamentoId: refAgendamento.id,
      reservadoEm: FieldValue.serverTimestamp(),
    });

    transacao.set(refAgendamento, {
      cliente,
      telefone,
      whatsapp: whatsapp || null,
      modeloMoto,
      anoMoto: Number(anoMoto),
      dataRevisao,
      status: 'confirmado',
      origem: origem || 'bot',
      lembreteEnviado: false,
      criadoEm: FieldValue.serverTimestamp(),
    });
  });

  return refAgendamento.id;
}

async function buscarRevisaoAtiva(numeroRecebido, hoje = hojeEmBrasilia()) {
  for (const [campo, numero] of combinacoesDeBusca(numeroRecebido)) {
    const resultado = await db
      .collection('agendamentos')
      .where(campo, '==', numero)
      .where('status', '==', 'confirmado')
      .get();

    const futuras = resultado.docs
      .map((doc) => ({ id: doc.id, ...doc.data() }))
      .filter((ag) => ag.dataRevisao >= hoje)
      .sort((a, b) => a.dataRevisao.localeCompare(b.dataRevisao));

    if (futuras.length > 0) return futuras[0];
  }
  return null;
}

function combinacoesDeBusca(numero) {
  const variantes = variantesDoNumero(numero);
  return ['whatsapp', 'telefone'].flatMap((campo) => variantes.map((v) => [campo, v]));
}

async function cancelarRevisao(agendamentoId, opcoes = {}) {
  const { ignorarPrazo = false, hoje = hojeEmBrasilia() } = opcoes;

  const refAgendamento = db.collection('agendamentos').doc(agendamentoId);

  await db.runTransaction(async (transacao) => {
    const agendamento = await transacao.get(refAgendamento);
    if (!agendamento.exists) {
      throw new Error('AGENDAMENTO_NAO_ENCONTRADO');
    }

    const dados = agendamento.data();
    if (dados.status !== 'confirmado') {
      throw new Error('JA_CANCELADO');
    }

    const diasDeAntecedencia = diasEntre(hoje, dados.dataRevisao);
    if (!ignorarPrazo && diasDeAntecedencia < ANTECEDENCIA_MINIMA_CANCELAMENTO) {
      throw new Error('PRAZO_ENCERRADO');
    }

    const refDia = db.collection('agenda').doc(dados.dataRevisao);
    const fichaDia = await transacao.get(refDia);

    transacao.update(refAgendamento, {
      status: 'cancelado',
      canceladoEm: FieldValue.serverTimestamp(),
      canceladoPor: ignorarPrazo ? 'dinei' : 'cliente',
    });

    if (fichaDia.exists && fichaDia.data().agendamentoId === agendamentoId) {
      transacao.delete(refDia);
    }
  });
}

module.exports = {
  DIAS_DE_REVISAO,
  HORARIO_CHEGADA,
  PREVISAO_TERMINO,
  ANTECEDENCIA_MINIMA_CANCELAMENTO,
  hojeEmBrasilia,
  horaEmBrasilia,
  somarDias,
  diaDaSemana,
  ehDiaDeRevisao,
  diasEntre,
  prazoFinalCancelamento,
  listarDatasLivres,
  listarDatasLivresNoMes,
  proximaDataLivre,
  verificarData,
  reservarRevisao,
  buscarRevisaoAtiva,
  cancelarRevisao,
  listarAgenda,
  consultarDia,
  bloquearDia,
  desbloquearDia,
};
