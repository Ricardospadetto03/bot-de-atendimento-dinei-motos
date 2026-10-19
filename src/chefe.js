const { salvarConversa } = require('./conversa');
const { avisarCliente } = require('./avisos');
const {
  HORARIO_CHEGADA,
  PREVISAO_TERMINO,
  ANTECEDENCIA_MINIMA_CANCELAMENTO,
  prazoFinalCancelamento,
  hojeEmBrasilia,
  somarDias,
  ehDiaDeRevisao,
  listarDatasLivres,
  verificarData,
  reservarRevisao,
  listarAgenda,
  consultarDia,
  bloquearDia,
  desbloquearDia,
  cancelarRevisao,
} = require('./agenda');
const { interpretarPedido, interpretarData, formatarData } = require('./texto-data');
const {
  formatarCelular,
  interpretarNome,
  interpretarCelular,
  interpretarModelo,
  interpretarAno,
  escolheuOpcao,
} = require('./validacao');

const OPCOES =
  'Responda com o *número* da opção:\n\n' +
  '1️⃣ Ver a agenda\n' +
  '2️⃣ Bloquear um dia (feriado, folga)\n' +
  '3️⃣ Desbloquear um dia\n' +
  '4️⃣ Cancelar uma revisão\n' +
  '5️⃣ Agendar uma revisão para um cliente\n\n' +
  '💡 Dica: também dá para escrever direto, por exemplo *bloquear 25/12 Natal*';

const QUANTIDADE_DIAS_LIVRES = 5;
const NUMEROS = ['1️⃣', '2️⃣', '3️⃣', '4️⃣', '5️⃣'];

const MENU_CHEFE = `🔧 *Menu do Dinei*\n\n${OPCOES}`;

const VOLTAR = '↩️ Para voltar ao menu, digite *menu*.';

const SEPARADOR = '➖➖➖➖➖➖';

async function responderChefe(telefone, original, conversa, agora) {
  const texto = original.trim().toLowerCase();
  const etapa = conversa ? conversa.etapa : null;
  const dados = conversa ? conversa.dados || {} : {};

  if (texto === 'menu') return mostrarMenu(telefone, agora);
  if (/^agenda\b/.test(texto)) return verAgenda(telefone, agora);
  if (/^(dias )?livres$|^vagas$/.test(texto)) return verDiasLivres(telefone, agora);

  let m = original.trim().match(/^bloquear\s+(.+)/i);
  if (m) return bloquear(telefone, m[1], agora);
  m = original.trim().match(/^desbloquear\s+(.+)/i);
  if (m) return desbloquear(telefone, m[1], agora);
  m = original.trim().match(/^cancelar\s+(.+)/i);
  if (m) return pedirConfirmacaoCancelamento(telefone, m[1], agora);
  m = original.trim().match(/^agendar\s+(.+)/i);
  if (m) return agendarData(telefone, m[1], agora);

  switch (etapa) {
    case 'CHEFE_MENU':        return escolherOpcao(telefone, texto, agora);
    case 'CHEFE_BLOQUEAR':    return bloquear(telefone, original, agora);
    case 'CHEFE_DESBLOQUEAR': return desbloquear(telefone, original, agora);
    case 'CHEFE_CANCELAR':    return pedirConfirmacaoCancelamento(telefone, original, agora);
    case 'CHEFE_CONFIRMA_CANCELAMENTO': return confirmarCancelamento(telefone, texto, dados, agora);
    case 'CHEFE_CONFIRMA_PERIODO': return confirmarBloqueioPeriodo(telefone, texto, dados, agora);
    case 'CHEFE_LIVRES':      return escolherDiaLivre(telefone, original, dados, agora);

    case 'CHEFE_AG_DATA':     return agendarData(telefone, original, agora);
    case 'CHEFE_AG_NOME':     return agendarNome(telefone, original, dados, agora);
    case 'CHEFE_AG_CELULAR':  return agendarCelular(telefone, original, dados, agora);
    case 'CHEFE_AG_MOTO':     return agendarMoto(telefone, original, dados, agora);
    case 'CHEFE_AG_ANO':      return agendarAno(telefone, original, dados, agora);
    case 'CHEFE_AG_CONFIRMA': return agendarConfirma(telefone, texto, dados, agora);

    default:
      return mostrarMenu(telefone, agora);
  }
}

async function escolherOpcao(telefone, texto, agora) {
  const numero = ['1', '2', '3', '4', '5'].find((n) => escolheuOpcao(texto, n));

  if (numero === '1') return verAgenda(telefone, agora);
  if (numero === '2') {
    return perguntar(telefone, 'CHEFE_BLOQUEAR', {}, agora,
      '🚫 *Bloquear dias*\n\n' +
      'Qual dia você *não* vai atender? Pode escrever o motivo junto.\n\n' +
      'Exemplos:\n• *25/12 Natal* (um dia)\n• *15 a 22/12 férias* (vários dias seguidos)');
  }
  if (numero === '3') {
    return perguntar(telefone, 'CHEFE_DESBLOQUEAR', {}, agora,
      '✅ *Desbloquear dias*\n\n' +
      'Qual dia você quer liberar de novo para os clientes?\n\n' +
      'Exemplos:\n• *25/12* (um dia)\n• *15 a 22/12* (vários dias seguidos)');
  }
  if (numero === '4') {
    return perguntar(telefone, 'CHEFE_CANCELAR', {}, agora,
      '❌ *Cancelar uma revisão*\n\n' +
      'De qual dia é a revisão que você quer cancelar?\n\n' +
      'Exemplo: *04/12*\n' +
      '(Se não lembrar o dia, digite *menu* e escolha 1️⃣ para ver a agenda.)');
  }
  if (numero === '5') return verDiasLivres(telefone, agora);

  return `🤔 Não entendi. ${OPCOES}`;
}

async function mostrarMenu(telefone, agora) {
  await salvarConversa(telefone, 'CHEFE_MENU', {}, agora);
  return MENU_CHEFE;
}

async function perguntar(telefone, etapa, dados, agora, pergunta) {
  await salvarConversa(telefone, etapa, dados, agora);
  return `${pergunta}\n\n${VOLTAR}`;
}

async function tentarDeNovo(telefone, etapa, dados, agora, problema, exemplo) {
  await salvarConversa(telefone, etapa, dados, agora);
  return `❌ ${problema}\n\nTente de novo, por exemplo: ${exemplo}\n\n${VOLTAR}`;
}

async function concluir(telefone, agora, resultado) {
  await salvarConversa(telefone, 'CHEFE_MENU', {}, agora);
  return `${resultado}\n\n${SEPARADOR}\nQuer fazer mais alguma coisa?\n\n${OPCOES}`;
}

function lerData(textoData, agora) {
  if (/^\s*hoje\s*$/i.test(textoData)) return hojeEmBrasilia(agora);
  const pedido = interpretarPedido(textoData, hojeEmBrasilia(agora));
  return pedido && pedido.tipo === 'DATA' ? pedido.data : null;
}

function diaMes(data) {
  return `${data.slice(8, 10)}/${data.slice(5, 7)}`;
}

function extrairMotivo(texto) {
  const meses = 'janeiro|fevereiro|mar[cç]o|abril|maio|junho|julho|agosto|setembro|outubro|novembro|dezembro';
  return texto
    .replace(/\d{1,2}\s*[\/.\-]\s*\d{1,2}(\s*[\/.\-]\s*\d{2,4})?/g, '')
    .replace(new RegExp(`\\d{1,2}\\s+(de\\s+)?(${meses})`, 'gi'), '')
    .replace(/\d{1,2}\s+(do|de)\s+\d{1,2}/gi, '')
    .replace(/\bdia\b/gi, '')
    .replace(/^[\s\-:,]+|[\s\-:,]+$/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

const MESES = ['janeiro', 'fevereiro', 'marco', 'abril', 'maio', 'junho',
  'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
const MESES_RE = 'janeiro|fevereiro|mar[cç]o|abril|maio|junho|julho|agosto|setembro|outubro|novembro|dezembro';
const LIGA = '\\s*(?:a|at[eé]|ao)\\s*(?:o\\s+)?(?:dia\\s+)?';
const MAIOR_PERIODO_EM_DIAS = 62;

const numeroDoMes = (nome) => MESES.indexOf(nome.replace('ç', 'c')) + 1;

function lerPeriodo(texto, agora) {
  const t = texto.toLowerCase();
  const hoje = hojeEmBrasilia(agora);
  const DATA = '\\d{1,2}\\s*/\\s*\\d{1,2}(?:\\s*/\\s*\\d{2,4})?';
  let m;
  let inicioTxt;
  let fimTxt;

  if ((m = t.match(new RegExp(`(${DATA})${LIGA}(${DATA})`)))) {
    inicioTxt = m[1]; fimTxt = m[2];
  } else if ((m = t.match(new RegExp(`(\\d{1,2})${LIGA}(\\d{1,2})\\s*/\\s*(\\d{1,2}(?:\\s*/\\s*\\d{2,4})?)`)))) {
    inicioTxt = `${m[1]}/${m[3]}`; fimTxt = `${m[2]}/${m[3]}`;
  } else if ((m = t.match(new RegExp(`(\\d{1,2})\\s+(?:de\\s+)?(${MESES_RE})${LIGA}(\\d{1,2})\\s+(?:de\\s+)?(${MESES_RE})`)))) {
    inicioTxt = `${m[1]}/${numeroDoMes(m[2])}`;
    fimTxt = `${m[3]}/${numeroDoMes(m[4])}`;
  } else if ((m = t.match(new RegExp(`(\\d{1,2})${LIGA}(\\d{1,2})\\s+(?:de\\s+)?(${MESES_RE})`)))) {
    inicioTxt = `${m[1]}/${numeroDoMes(m[3])}`;
    fimTxt = `${m[2]}/${numeroDoMes(m[3])}`;
  } else {
    return null;
  }

  const inicio = interpretarData(inicioTxt, hoje);
  let fim = interpretarData(fimTxt, hoje);
  if (!inicio || !fim) return { erro: 'DATA_INVALIDA', trecho: m[0] };
  if (fim < inicio) fim = `${Number(fim.slice(0, 4)) + 1}${fim.slice(4)}`;
  return { inicio, fim, trecho: m[0] };
}

function pareceIntervalo(texto) {
  return new RegExp(`\\d${LIGA}\\d`).test(texto.toLowerCase());
}

function motivoDoPeriodo(texto, trecho) {
  const posicao = texto.toLowerCase().indexOf(trecho);
  const resto = posicao >= 0 ? texto.slice(0, posicao) + texto.slice(posicao + trecho.length) : texto;
  return extrairMotivo(resto.replace(/^\s*(?:do|de|da)\b/i, ''));
}

function diasDoPeriodo(inicio, fim) {
  const dias = [];
  for (let data = inicio; data <= fim && dias.length <= MAIOR_PERIODO_EM_DIAS; data = somarDias(data, 1)) {
    dias.push(data);
  }
  return dias;
}

function linhaDaAgenda(dia) {
  if (dia.bloqueado) {
    return `• ${formatarData(dia.data)} — 🚫 bloqueado${dia.motivo ? `: ${dia.motivo}` : ''}`;
  }
  const ag = dia.agendamento;
  if (!ag) return `• ${formatarData(dia.data)} — ocupado (sem dados do cliente)`;
  return `• ${formatarData(dia.data)} — ${ag.cliente} (${ag.modeloMoto} ${ag.anoMoto}) 📱 ${formatarCelular(ag.telefone)}`;
}

async function verAgenda(telefone, agora) {
  const dias = await listarAgenda(hojeEmBrasilia(agora), 10);
  if (dias.length === 0) {
    return concluir(telefone, agora, '📅 A agenda está livre: nenhuma revisão ou bloqueio de hoje em diante.');
  }
  return concluir(telefone, agora, `📅 *Próximos dias ocupados:*\n\n${dias.map(linhaDaAgenda).join('\n')}`);
}

async function bloquear(telefone, textoData, agora) {
  const etapa = 'CHEFE_BLOQUEAR';
  const exemplo = '*25/12 Natal*';

  const periodo = lerPeriodo(textoData, agora);
  if (periodo) return prepararBloqueioPeriodo(telefone, textoData, periodo, agora);
  if (pareceIntervalo(textoData)) {
    return tentarDeNovo(telefone, etapa, {}, agora,
      'Não entendi o período. Escreva o mês junto.', '*15 a 22/12 férias*');
  }

  const data = lerData(textoData, agora);

  if (!data) {
    return tentarDeNovo(telefone, etapa, {}, agora, `Não entendi a data em "${textoData.trim()}".`, exemplo);
  }
  if (data < hojeEmBrasilia(agora)) {
    return tentarDeNovo(telefone, etapa, {}, agora,
      `${formatarData(data)} já passou. Escolha um dia de hoje em diante.`, exemplo);
  }
  if (!ehDiaDeRevisao(data)) {
    return tentarDeNovo(telefone, etapa, {}, agora,
      `${formatarData(data)} não precisa ser bloqueado: a oficina já não atende nesse dia pelo bot ` +
      '(só terça a sexta).', exemplo);
  }

  const motivo = extrairMotivo(textoData);
  try {
    await bloquearDia(data, motivo);
  } catch (erro) {
    if (erro.message === 'JA_BLOQUEADO') {
      return concluir(telefone, agora, `👍 ${formatarData(data)} já estava bloqueado. Nada mudou.`);
    }
    if (erro.message === 'DIA_COM_REVISAO') {
      const dia = await consultarDia(data);
      return concluir(telefone, agora,
        `⚠️ Não bloqueei: já tem revisão marcada nesse dia.\n${linhaDaAgenda(dia)}\n\n` +
        `Se quiser liberar o dia, primeiro combine com o cliente e cancele a revisão ` +
        `(mande *cancelar ${diaMes(data)}*). Depois é só bloquear.`);
    }
    throw erro;
  }
  return concluir(telefone, agora,
    `✅ Pronto! ${formatarData(data)} está bloqueado${motivo ? ` (${motivo})` : ''}.\n` +
    'Os clientes não vão conseguir agendar nesse dia.');
}

async function desbloquear(telefone, textoData, agora) {
  const etapa = 'CHEFE_DESBLOQUEAR';
  const exemplo = '*25/12*';

  const periodo = lerPeriodo(textoData, agora);
  if (periodo) return desbloquearPeriodo(telefone, periodo, agora);
  if (pareceIntervalo(textoData)) {
    return tentarDeNovo(telefone, etapa, {}, agora,
      'Não entendi o período. Escreva o mês junto.', '*15 a 22/12*');
  }

  const data = lerData(textoData, agora);

  if (!data) {
    return tentarDeNovo(telefone, etapa, {}, agora, `Não entendi a data em "${textoData.trim()}".`, exemplo);
  }
  try {
    await desbloquearDia(data);
  } catch (erro) {
    if (erro.message === 'NAO_BLOQUEADO') {
      return tentarDeNovo(telefone, etapa, {}, agora,
        `${formatarData(data)} não estava bloqueado. Confira o dia (a opção 1️⃣ do menu mostra a agenda).`,
        exemplo);
    }
    throw erro;
  }
  return concluir(telefone, agora,
    `✅ Pronto! ${formatarData(data)} foi desbloqueado. Os clientes já podem agendar nesse dia.`);
}

async function prepararBloqueioPeriodo(telefone, textoData, periodo, agora) {
  const etapa = 'CHEFE_BLOQUEAR';
  const exemplo = '*15 a 22/12 férias*';
  if (periodo.erro) {
    return tentarDeNovo(telefone, etapa, {}, agora, 'Uma das datas do período não existe.', exemplo);
  }
  const { inicio, fim } = periodo;
  if (inicio < hojeEmBrasilia(agora)) {
    return tentarDeNovo(telefone, etapa, {}, agora,
      `O período começa em ${formatarData(inicio)}, que já passou.`, exemplo);
  }
  const dias = diasDoPeriodo(inicio, fim);
  if (dias.length > MAIOR_PERIODO_EM_DIAS) {
    return tentarDeNovo(telefone, etapa, {}, agora,
      'Esse período é grande demais. Bloqueie no máximo uns 2 meses de cada vez.', exemplo);
  }

  const ocupados = new Map((await listarAgenda(inicio, 200))
    .filter((dia) => dia.data <= fim)
    .map((dia) => [dia.data, dia]));

  const aBloquear = [];
  const comCliente = [];
  const jaBloqueados = [];
  for (const data of dias) {
    if (!ehDiaDeRevisao(data)) continue;
    const dia = ocupados.get(data);
    if (!dia) aBloquear.push(data);
    else if (dia.bloqueado) jaBloqueados.push(data);
    else comCliente.push(dia);
  }

  const motivo = motivoDoPeriodo(textoData, periodo.trecho);
  const titulo = `🚫 *Bloquear de ${diaMes(inicio)} a ${diaMes(fim)}*${motivo ? ` (${motivo})` : ''}`;
  let avisos = '';
  if (comCliente.length) {
    avisos += `\n\n⚠️ *Não vou bloquear* (já têm revisão marcada):\n${comCliente.map(linhaDaAgenda).join('\n')}\n` +
      'Se precisar liberar esses dias, combine com o cliente e cancele antes (opção 4️⃣).';
  }
  if (jaBloqueados.length) {
    avisos += `\n\nJá estavam bloqueados: ${jaBloqueados.map(diaMes).join(', ')}.`;
  }

  if (aBloquear.length === 0) {
    return concluir(telefone, agora, `${titulo}\n\nNão há nenhum dia para bloquear nesse período.${avisos}`);
  }

  return perguntar(telefone, 'CHEFE_CONFIRMA_PERIODO', { dias: aBloquear, motivo, inicio, fim }, agora,
    `${titulo}\n\n` +
    `Vou bloquear ${aBloquear.length === 1 ? 'este dia' : `estes ${aBloquear.length} dias`}:\n` +
    `${aBloquear.map((data) => `• ${formatarData(data)}`).join('\n')}\n\n` +
    `(Sábado, domingo e segunda já não têm atendimento.)${avisos}\n\n` +
    'Confirma?\n1️⃣ Sim, bloquear\n2️⃣ Não');
}

async function confirmarBloqueioPeriodo(telefone, texto, dados, agora) {
  const { dias, motivo, inicio, fim } = dados;
  if (escolheuOpcao(texto, 1) || /^sim\b|^s$/.test(texto)) {
    const feitos = [];
    const pulados = [];
    for (const data of dias) {
      try {
        await bloquearDia(data, motivo);
        feitos.push(data);
      } catch (erro) {
        if (erro.message === 'JA_BLOQUEADO' || erro.message === 'DIA_COM_REVISAO') pulados.push(data);
        else throw erro;
      }
    }
    let mensagem = `✅ Pronto! ${feitos.length} ${feitos.length === 1 ? 'dia bloqueado' : 'dias bloqueados'} ` +
      `de ${diaMes(inicio)} a ${diaMes(fim)}${motivo ? ` (${motivo})` : ''}.\n` +
      'Os clientes não vão conseguir agendar nesses dias.';
    if (pulados.length) {
      mensagem += `\n\n⚠️ Não bloqueei ${pulados.map(diaMes).join(', ')}: ` +
        'alguém agendou (ou já estava bloqueado) enquanto você confirmava.';
    }
    return concluir(telefone, agora, mensagem);
  }
  if (escolheuOpcao(texto, 2) || /^n[aã]o\b|^n$/.test(texto)) {
    return concluir(telefone, agora, '👍 Tudo bem, nada foi bloqueado.');
  }
  return `🤔 Não entendi. Responda *1* para bloquear ou *2* para desistir.\n\n${VOLTAR}`;
}

async function desbloquearPeriodo(telefone, periodo, agora) {
  if (periodo.erro) {
    return tentarDeNovo(telefone, 'CHEFE_DESBLOQUEAR', {}, agora,
      'Uma das datas do período não existe.', '*15 a 22/12*');
  }
  const { inicio, fim } = periodo;
  const bloqueados = (await listarAgenda(inicio, 200))
    .filter((dia) => dia.data <= fim && dia.bloqueado)
    .map((dia) => dia.data);

  if (bloqueados.length === 0) {
    return tentarDeNovo(telefone, 'CHEFE_DESBLOQUEAR', {}, agora,
      `Não havia nenhum dia bloqueado de ${diaMes(inicio)} a ${diaMes(fim)}. ` +
      'Confira as datas (a opção 1️⃣ do menu mostra a agenda).', '*15 a 22/12*');
  }

  const liberados = [];
  for (const data of bloqueados) {
    try {
      await desbloquearDia(data);
      liberados.push(data);
    } catch (erro) {
      if (erro.message !== 'NAO_BLOQUEADO') throw erro;
    }
  }
  return concluir(telefone, agora,
    `✅ Pronto! ${liberados.length} ${liberados.length === 1 ? 'dia desbloqueado' : 'dias desbloqueados'}:\n` +
    `${liberados.map((data) => `• ${formatarData(data)}`).join('\n')}\n\n` +
    'Os clientes já podem agendar nesses dias.');
}

async function pedirConfirmacaoCancelamento(telefone, textoData, agora) {
  const etapa = 'CHEFE_CANCELAR';
  const exemplo = '*04/12*';
  const data = lerData(textoData, agora);

  if (!data) {
    return tentarDeNovo(telefone, etapa, {}, agora, `Não entendi a data em "${textoData.trim()}".`, exemplo);
  }
  const dia = await consultarDia(data);
  if (!dia || dia.bloqueado || !dia.agendamentoId) {
    const extra = dia && dia.bloqueado
      ? ' Esse dia está bloqueado (para liberar, use a opção 3️⃣ do menu).'
      : ' Confira o dia (a opção 1️⃣ do menu mostra a agenda).';
    return tentarDeNovo(telefone, etapa, {}, agora, `Não tem revisão em ${formatarData(data)}.${extra}`, exemplo);
  }

  const ag = dia.agendamento || {};
  return perguntar(telefone, 'CHEFE_CONFIRMA_CANCELAMENTO', {
    agendamentoId: dia.agendamentoId,
    dataRevisao: data,
    cliente: ag.cliente || null,
    numeroCliente: ag.whatsapp || ag.telefone || null,
  }, agora,
    `Você quer *cancelar* esta revisão?\n\n${linhaDaAgenda(dia)}\n\n` +
    'Responda:\n1️⃣ Sim, cancelar\n2️⃣ Não, manter');
}

async function confirmarCancelamento(telefone, texto, dados, agora) {
  if (escolheuOpcao(texto, 1) || /^sim\b|^s$/.test(texto)) {
    try {
      await cancelarRevisao(dados.agendamentoId, { ignorarPrazo: true, hoje: hojeEmBrasilia(agora) });
    } catch (erro) {
      if (erro.message === 'JA_CANCELADO' || erro.message === 'AGENDAMENTO_NAO_ENCONTRADO') {
        return concluir(telefone, agora, '👍 Essa revisão já estava cancelada.');
      }
      throw erro;
    }
    let avisoAoDono = '📲 Não achei o número do cliente: avise ele por outro meio.';
    if (dados.numeroCliente) {
      avisarCliente(dados.numeroCliente, textoCanceladaPelaOficina(dados), {
        etapa: 'FINALIZADO',
        nome: dados.cliente || 'o cliente',
      });
      avisoAoDono = '📲 Estou avisando o cliente no WhatsApp dele.';
    }
    return concluir(telefone, agora,
      `✅ Pronto! A revisão de ${formatarData(dados.dataRevisao)} foi cancelada e o dia ficou livre.\n` +
      avisoAoDono);
  }
  if (escolheuOpcao(texto, 2) || /^n[aã]o\b|^n$/.test(texto)) {
    return concluir(telefone, agora, '👍 Tudo bem, a revisão continua marcada.');
  }
  return `🤔 Não entendi. Responda *1* para cancelar ou *2* para manter a revisão.\n\n${VOLTAR}`;
}

async function verDiasLivres(telefone, agora) {
  const amanha = somarDias(hojeEmBrasilia(agora), 1);
  const livres = await listarDatasLivres(amanha, QUANTIDADE_DIAS_LIVRES);
  if (livres.length === 0) {
    return perguntar(telefone, 'CHEFE_AG_DATA', {}, agora,
      '📅 *Agendar uma revisão*\n\n😕 Não encontrei dias livres nos próximos 60 dias.\n\n' +
      'Se quiser, escreva a data. Exemplo: *hoje*');
  }

  const lista = livres.map((data, i) => `${NUMEROS[i]} ${formatarData(data)}`).join('\n');

  return perguntar(telefone, 'CHEFE_LIVRES', { sugestoes: livres }, agora,
    `📅 *Agendar uma revisão*\n\nPróximos dias livres:\n\n${lista}\n\n` +
    '👉 Responda o *número* do dia.\n' +
    '✍️ Para outro dia, escreva a data. Exemplo: *25/10* ou *hoje*');
}

async function escolherDiaLivre(telefone, original, dados, agora) {
  const texto = original.trim().toLowerCase();
  const sugestoes = dados.sugestoes || [];

  const indice = sugestoes.findIndex((_, i) => escolheuOpcao(texto, i + 1));
  if (indice >= 0) return agendarNaData(telefone, sugestoes[indice], agora);

  if (lerData(original, agora)) return agendarData(telefone, original, agora);

  return `🤔 Não entendi. Responda o *número* do dia (1 a ${sugestoes.length}) ` +
    `ou escreva a data. Exemplo: *25/10*\n\n${VOLTAR}`;
}

async function agendarData(telefone, textoData, agora) {
  const data = lerData(textoData, agora);
  if (!data) {
    return tentarDeNovo(telefone, 'CHEFE_AG_DATA', {}, agora,
      `Não entendi a data em "${textoData.trim()}".`, '*04/12*');
  }
  return agendarNaData(telefone, data, agora);
}

async function agendarNaData(telefone, data, agora) {
  const etapa = 'CHEFE_AG_DATA';
  const exemplo = '*04/12*';
  const hoje = hojeEmBrasilia(agora);
  if (data < hoje) {
    return tentarDeNovo(telefone, etapa, {}, agora,
      `${formatarData(data)} já passou. Escolha um dia de hoje em diante.`, exemplo);
  }

  const resultado = await verificarData(data, somarDias(hoje, -1));

  if (resultado.situacao === 'LIVRE') {
    return perguntar(telefone, 'CHEFE_AG_NOME', { dataRevisao: data }, agora,
      `👍 ${formatarData(data)} está livre!\n\nQual é o *nome* do cliente?`);
  }

  let problema;
  if (resultado.situacao === 'OCUPADA') {
    problema = `Já tem revisão nesse dia:\n${linhaDaAgenda(await consultarDia(data))}`;
  } else if (resultado.situacao === 'BLOQUEADA') {
    problema = `${formatarData(data)} está bloqueado (para liberar, use a opção 3️⃣ do menu).`;
  } else {
    problema = `${formatarData(data)} não é dia de atendimento (só terça a sexta).`;
  }
  const livres = resultado.sugestoes.map((d) => `• ${formatarData(d)}`).join('\n');
  return tentarDeNovo(telefone, etapa, {}, agora,
    `${problema}\n\n📅 Próximos dias livres:\n${livres || '(nenhum nos próximos dias)'}`,
    resultado.sugestoes[0] ? `*${diaMes(resultado.sugestoes[0])}*` : exemplo);
}

async function agendarNome(telefone, original, dados, agora) {
  const nome = interpretarNome(original);
  if (!nome) {
    return tentarDeNovo(telefone, 'CHEFE_AG_NOME', dados, agora, 'Não entendi o nome.', '*João da Silva*');
  }
  return perguntar(telefone, 'CHEFE_AG_CELULAR', { ...dados, cliente: nome }, agora,
    `Qual é o *celular* do ${nome.split(' ')[0]}, com DDD?\n\nExemplo: *27 99999-9999*`);
}

async function agendarCelular(telefone, original, dados, agora) {
  const celular = interpretarCelular(original);
  if (!celular) {
    return tentarDeNovo(telefone, 'CHEFE_AG_CELULAR', dados, agora,
      'Esse número não parece certo (precisa ter o DDD).', '*27 99999-9999*');
  }
  return perguntar(telefone, 'CHEFE_AG_MOTO', { ...dados, telefone: celular }, agora,
    'Qual é o *modelo* da moto?\n\nExemplo: *CG 160*');
}

async function agendarMoto(telefone, original, dados, agora) {
  const modelo = interpretarModelo(original);
  if (!modelo) {
    return tentarDeNovo(telefone, 'CHEFE_AG_MOTO', dados, agora, 'Não entendi o modelo.', '*CG 160*');
  }
  return perguntar(telefone, 'CHEFE_AG_ANO', { ...dados, modeloMoto: modelo }, agora,
    'Qual é o *ano* da moto?\n\nExemplo: *2020*');
}

async function agendarAno(telefone, original, dados, agora) {
  const ano = interpretarAno(original, Number(hojeEmBrasilia(agora).slice(0, 4)));
  if (!ano) {
    return tentarDeNovo(telefone, 'CHEFE_AG_ANO', dados, agora, 'O ano precisa ter 4 números.', '*2020*');
  }
  const completos = { ...dados, anoMoto: ano };
  return perguntar(telefone, 'CHEFE_AG_CONFIRMA', completos, agora,
    '📋 Confira os dados:\n\n' +
    `👤 ${completos.cliente}\n` +
    `📱 ${formatarCelular(completos.telefone)}\n` +
    `🏍️ ${completos.modeloMoto} ${completos.anoMoto}\n` +
    `📅 ${formatarData(completos.dataRevisao)}, chegada às ${HORARIO_CHEGADA}\n\n` +
    'Está certo?\n1️⃣ Sim, agendar\n2️⃣ Não, descartar');
}

async function agendarConfirma(telefone, texto, dados, agora) {
  if (escolheuOpcao(texto, 1) || /^sim\b|^s$/.test(texto)) {
    try {
      await reservarRevisao({ ...dados, whatsapp: dados.telefone, origem: 'dinei' });
    } catch (erro) {
      if (erro.message === 'DATA_OCUPADA') {
        return concluir(telefone, agora,
          `⚠️ Não deu: alguém acabou de reservar ${formatarData(dados.dataRevisao)}. ` +
          'Escolha 5️⃣ de novo e tente outra data.');
      }
      throw erro;
    }
    avisarCliente(dados.telefone, textoAgendadaPelaOficina(dados, hojeEmBrasilia(agora)), {
      etapa: 'AGENDADO',
      nome: dados.cliente,
    });
    return concluir(telefone, agora,
      `✅ Agendado! ${dados.cliente} (${dados.modeloMoto} ${dados.anoMoto}) em ${formatarData(dados.dataRevisao)}.\n` +
      '📲 Estou mandando a confirmação para o WhatsApp do cliente.');
  }
  if (escolheuOpcao(texto, 2) || /^n[aã]o\b|^n$/.test(texto)) {
    return concluir(telefone, agora, '👍 Tudo bem, nada foi agendado.');
  }
  return `🤔 Não entendi. Responda *1* para agendar ou *2* para descartar.\n\n${VOLTAR}`;
}

const primeiroNome = (nome) => String(nome || '').split(' ')[0] || 'cliente';

function textoAgendadaPelaOficina(dados, hoje) {
  const prazo = prazoFinalCancelamento(dados.dataRevisao);
  const regra = `o cancelamento só pode ser feito com até *${ANTECEDENCIA_MINIMA_CANCELAMENTO} dias de antecedência*`;
  const avisoPrazo = prazo >= hoje
    ? `⚠️ *Importante:* ${regra}, ou seja, até *${formatarData(prazo)}*. ` +
      'Para cancelar, digite *menu* e escolha a opção *3*.'
    : `⚠️ *Importante:* ${regra}. Como a sua revisão está bem próxima, ela não poderá ser cancelada.`;

  return `✅ *Revisão agendada na Dinei Motos!*\n\n` +
    `Olá, ${primeiroNome(dados.cliente)}! O Dinei acabou de marcar a sua revisão:\n\n` +
    `📅 *${formatarData(dados.dataRevisao)}*\n` +
    `🕖 Traga a moto às *${HORARIO_CHEGADA}*. A previsão é ficar pronta por volta das *${PREVISAO_TERMINO}*.\n` +
    `🏍️ ${dados.modeloMoto} ${dados.anoMoto}\n\n` +
    `${avisoPrazo}\n\n` +
    'Obrigado pela preferência! 🏍️';
}

function textoCanceladaPelaOficina(dados) {
  return '❌ *Revisão cancelada*\n\n' +
    `Olá, ${primeiroNome(dados.cliente)}! A sua revisão de *${formatarData(dados.dataRevisao)}* ` +
    'na Dinei Motos foi cancelada pela oficina.\n\n' +
    'Se quiser marcar outro dia, é só digitar *menu* e escolher a opção *1*.\n' +
    'Se tiver alguma dúvida, pode escrever aqui que o Dinei te responde.';
}

module.exports = { responderChefe, extrairMotivo, lerPeriodo, motivoDoPeriodo };
