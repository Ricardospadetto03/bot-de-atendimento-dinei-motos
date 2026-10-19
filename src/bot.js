const { carregarConversa, salvarConversa, marcarNaoEntendida } = require('./conversa');
const { responderChefe } = require('./chefe');
const { avisarDinei } = require('./avisos');
const {
  HORARIO_CHEGADA,
  PREVISAO_TERMINO,
  ANTECEDENCIA_MINIMA_CANCELAMENTO,
  hojeEmBrasilia,
  horaEmBrasilia,
  somarDias,
  diasEntre,
  listarDatasLivres,
  listarDatasLivresNoMes,
  verificarData,
  reservarRevisao,
  prazoFinalCancelamento,
  buscarRevisaoAtiva,
  cancelarRevisao,
} = require('./agenda');
const { interpretarPedido, formatarData, nomeDoMes } = require('./texto-data');
const {
  interpretarNome,
  interpretarCelular,
  formatarCelular,
  interpretarModelo,
  interpretarAno,
  mesmoNumero,
  escolheuOpcao,
} = require('./validacao');

const ETAPAS_EM_SILENCIO = ['COM_DINEI', 'AGENDADO', 'FINALIZADO'];

function ehDinei(telefone) {
  return Boolean(process.env.NUMERO_DINEI) && mesmoNumero(process.env.NUMERO_DINEI, telefone);
}

async function deveFicarEmSilencio(telefone, agora = new Date()) {
  if (ehDinei(telefone)) return false;
  const conversa = await carregarConversa(telefone, agora);
  return Boolean(conversa) && ETAPAS_EM_SILENCIO.includes(conversa.etapa);
}

const QUANTIDADE_DE_OPCOES = 3;
const NUMEROS = ['1️⃣', '2️⃣', '3️⃣', '4️⃣', '5️⃣'];

const OPCOES_MENU =
  'Responda com o *número* da opção:\n\n' +
  '1️⃣ Agendar uma revisão\n' +
  '2️⃣ Falar com o Dinei\n' +
  '3️⃣ Cancelar uma revisão';

const VOLTAR = '↩️ Para voltar ao início, digite *menu*.';

const SO_TEXTO = '🙂 Por enquanto eu só consigo ler mensagens de *texto*.\nPode escrever, por favor?';

const LIMITE_NAO_ENTENDIDAS = 2;

const ehNaoEntendi = (resposta) => typeof resposta === 'string' && /^(❌|🤔)/.test(resposta);

const PERGUNTA_DATA =
  '*5/5* · Para qual *dia* você quer a revisão?\n\n' +
  'Pode escrever do seu jeito, por exemplo:\n' +
  '• *20/10*\n' +
  '• *terça que vem*\n' +
  '• *em março*\n' +
  '• *próxima vaga*\n\n' +
  `🕖 Atendemos de *terça a sexta*. A moto deve chegar às *${HORARIO_CHEGADA}* ` +
  `e fica pronta por volta das *${PREVISAO_TERMINO}*.`;

function saudacao(agora) {
  const hora = horaEmBrasilia(agora);
  if (hora >= 5 && hora < 12) return 'Bom dia';
  if (hora >= 12 && hora < 18) return 'Boa tarde';
  return 'Boa noite';
}

async function perguntar(telefone, etapa, dados, agora, pergunta) {
  await salvarConversa(telefone, etapa, dados, agora);
  return `${pergunta}\n\n${VOLTAR}`;
}

function tentarDeNovo(problema, exemplo) {
  return `❌ ${problema}\n\nTente de novo, por exemplo: ${exemplo}\n\n${VOLTAR}`;
}

const negrito = (data) => `*${formatarData(data)}*`;

function textoBoasVindas(agora) {
  return `${saudacao(agora)}! Seja bem-vindo à *Dinei Motos* 🏍️\n` +
    'Eu sou o assistente virtual da oficina.\n\n' +
    `Como posso te ajudar? ${OPCOES_MENU}`;
}

async function responderMensagem(telefone, mensagem, agora = new Date(), extras = {}) {
  const original = mensagem.trim();
  const texto = original.toLowerCase();
  const conversa = await carregarConversa(telefone, agora);

  if (ehDinei(telefone)) {
    return responderChefe(telefone, original, conversa, agora);
  }

  if (!conversa || texto === 'menu') {
    await salvarConversa(telefone, 'MENU', {}, agora);
    return textoBoasVindas(agora);
  }

  const contexto = { original, nomePerfil: extras.nomePerfil };
  const resposta = await responderEtapa(telefone, conversa, original, texto, agora, contexto);

  if (conversa.etapa === 'MENU' && ehNaoEntendi(resposta)) {
    return contarNaoEntendida(telefone, conversa, resposta, agora, contexto);
  }
  return resposta;
}

async function responderMidia(telefone, agora = new Date(), extras = {}) {
  if (ehDinei(telefone)) return null;
  let conversa = await carregarConversa(telefone, agora);
  let comeco = '';

  if (!conversa) {
    await salvarConversa(telefone, 'MENU', {}, agora);
    conversa = { etapa: 'MENU' };
    comeco = `${textoBoasVindas(agora)}\n\n`;
  }
  if (ETAPAS_EM_SILENCIO.includes(conversa.etapa)) return null;
  if (conversa.etapa !== 'MENU') return SO_TEXTO;

  const contexto = { original: '🎤 (áudio, foto ou outro arquivo)', nomePerfil: extras.nomePerfil };
  return contarNaoEntendida(telefone, conversa, `${comeco}${SO_TEXTO}`, agora, contexto);
}

async function contarNaoEntendida(telefone, conversa, resposta, agora, contexto) {
  const seguidas = await marcarNaoEntendida(telefone, conversa, agora);
  if (seguidas < LIMITE_NAO_ENTENDIDAS) return resposta;

  await chamarDinei(telefone, agora, contexto,
    `🤖 O bot não entendeu ${seguidas} mensagens seguidas e passou o atendimento para você.`);
  return '😊 Parece que eu não estou conseguindo te ajudar por aqui.\n\n' +
    '👍 *Já chamei o Dinei!* Ele vai te responder assim que possível.\n\n' +
    '💬 Enquanto isso, pode ir contando o que você precisa. Pode mandar por escrito, áudio ou foto.\n\n' +
    'Se quiser voltar ao início, é só digitar *menu*.';
}

async function chamarDinei(telefone, agora, contexto, motivo) {
  await salvarConversa(telefone, 'COM_DINEI', {}, agora);
  const ultima = contexto.original ? String(contexto.original).slice(0, 150) : '';
  avisarDinei(
    '🔔 *Um cliente quer falar com você*\n\n' +
    `👤 ${contexto.nomePerfil || 'Sem nome no WhatsApp'}\n` +
    `📱 ${formatarCelular(telefone)}\n` +
    (ultima ? `💬 Última mensagem: "${ultima}"\n` : '') +
    `\n${motivo}\n📲 Responda direto na conversa com ele.`);
}

async function responderEtapa(telefone, conversa, original, texto, agora, contexto) {
  const dados = conversa.dados || {};

  switch (conversa.etapa) {
    case 'MENU':         return tratarMenu(telefone, texto, agora, contexto);
    case 'NOME':         return tratarNome(telefone, original, dados, agora);
    case 'CELULAR':      return tratarCelular(telefone, original, dados, agora);
    case 'MOTO':         return tratarMoto(telefone, original, dados, agora);
    case 'ANO':          return tratarAno(telefone, original, dados, agora);
    case 'DATA':         return tratarData(telefone, original, dados, agora);
    case 'ESCOLHA_DATA': return tratarEscolhaData(telefone, original, dados, agora);
    case 'CONFIRMACAO':  return tratarConfirmacao(telefone, texto, dados, agora);
    case 'CONFIRMA_CANCELAMENTO': return tratarConfirmaCancelamento(telefone, texto, dados, agora);

    case 'COM_DINEI':
    case 'AGENDADO':
    case 'FINALIZADO':
      return null;

    default:
      await salvarConversa(telefone, 'MENU', {}, agora);
      return `Vamos recomeçar. ${OPCOES_MENU}`;
  }
}

async function tratarMenu(telefone, texto, agora, contexto = {}) {
  if (escolheuOpcao(texto, 1) || /agend/.test(texto)) {
    return perguntar(telefone, 'NOME', {}, agora,
      'Ótimo! Vou fazer o seu agendamento. São só *5 perguntas* rapidinhas. 😊\n\n' +
      '*1/5* · Qual é o seu *nome*?');
  }

  if (escolheuOpcao(texto, 2) || /contato|falar/.test(texto)) {
    await chamarDinei(telefone, agora, contexto, '👉 Ele escolheu a opção "Falar com o Dinei".');
    return '👍 Certo! Aguarde, que assim que possível o Dinei vai te responder por aqui.\n\n' +
      '💬 *Enquanto isso, pode ir nos contando o que você está precisando:* o que está ' +
      'acontecendo com a moto, o modelo e o ano. Pode mandar por escrito, áudio ou foto. ' +
      'Assim o Dinei já chega sabendo como te ajudar. 🏍️\n\n' +
      'Se decidir agendar uma revisão, é só digitar *menu* que iniciamos novamente.';
  }

  if (escolheuOpcao(texto, 3) || /cancel|desmarc/.test(texto)) {
    return iniciarCancelamento(telefone, agora);
  }

  return `🤔 Não entendi. ${OPCOES_MENU}`;
}

async function tratarNome(telefone, original, dados, agora) {
  const nome = interpretarNome(original);
  if (!nome) {
    return tentarDeNovo('Não consegui entender o seu nome. Digite só o nome.', '*João da Silva*');
  }
  return perguntar(telefone, 'CELULAR', { ...dados, cliente: nome }, agora,
    `Prazer, ${nome.split(' ')[0]}! 👋\n\n` +
    '*2/5* · Qual é o seu *celular* com DDD?\nExemplo: *27 99999-9999*');
}

async function tratarCelular(telefone, original, dados, agora) {
  const celular = interpretarCelular(original);
  if (!celular) {
    return tentarDeNovo('Esse número parece incompleto. Lembre de colocar o DDD.', '*27 99999-9999*');
  }
  return perguntar(telefone, 'MOTO', { ...dados, telefone: celular }, agora,
    '*3/5* · Qual é o *modelo* da sua moto?\nExemplo: *CG 160*, *Fazer 250*, *Biz 125*');
}

async function tratarMoto(telefone, original, dados, agora) {
  const modelo = interpretarModelo(original);
  if (!modelo) {
    return tentarDeNovo('Não consegui entender o modelo da moto.', '*CG 160*');
  }
  return perguntar(telefone, 'ANO', { ...dados, modeloMoto: modelo }, agora,
    '*4/5* · Qual é o *ano* da moto?\nExemplo: *2020*');
}

async function tratarAno(telefone, original, dados, agora) {
  const anoAtual = Number(hojeEmBrasilia(agora).slice(0, 4));
  const ano = interpretarAno(original, anoAtual);
  if (!ano) {
    return tentarDeNovo('O ano precisa ter 4 números.', '*2020*');
  }
  return perguntar(telefone, 'DATA', { ...dados, anoMoto: ano }, agora, PERGUNTA_DATA);
}

async function tratarData(telefone, original, dados, agora) {
  const hoje = hojeEmBrasilia(agora);
  const pedido = interpretarPedido(original, hoje);

  if (!pedido) {
    return tentarDeNovo('Não consegui entender a data.', '*20/10* ou *próxima vaga*');
  }

  if (pedido.tipo === 'PROXIMA') {
    const opcoes = await listarDatasLivres(somarDias(hoje, 1), QUANTIDADE_DE_OPCOES);
    return oferecerOpcoes(telefone, dados, agora, opcoes, '📅 Estas são as próximas datas livres:');
  }

  if (pedido.tipo === 'MES') {
    const opcoes = await listarDatasLivresNoMes(pedido.ano, pedido.mes, hoje);
    if (opcoes.length === 0) {
      return tentarDeNovo(`Em ${nomeDoMes(pedido.mes)} não tenho mais vaga. 😕 Escolha outro mês ou dia.`,
        '*próxima vaga*');
    }
    return oferecerOpcoes(telefone, dados, agora, opcoes, `📅 Em ${nomeDoMes(pedido.mes)} tenho estas datas livres:`);
  }

  const resultado = await verificarData(pedido.data, hoje);
  if (resultado.situacao === 'LIVRE') {
    return irParaConfirmacao(telefone, { ...dados, dataRevisao: pedido.data }, agora);
  }

  const motivo = {
    OCUPADA: 'já está ocupada',
    BLOQUEADA: 'não vamos atender nesse dia',
    DIA_INVALIDO: 'não tem atendimento (atendemos de terça a sexta)',
    DATA_PASSADA: 'não está mais disponível (o mais cedo possível é amanhã)',
  }[resultado.situacao];
  return oferecerOpcoes(telefone, dados, agora, resultado.sugestoes,
    `😕 ${negrito(pedido.data)} ${motivo}.\n\nA mais próxima que tenho, e outras mais para frente:`);
}

async function oferecerOpcoes(telefone, dados, agora, opcoes, introducao) {
  if (opcoes.length === 0) {
    return '😕 Não encontrei vagas nos próximos dias.\n\n' +
      'Digite *menu* e escolha a opção *2* para falar com o Dinei.';
  }
  const lista = opcoes.map((data, i) => `${NUMEROS[i]} ${formatarData(data)}`).join('\n');
  return perguntar(telefone, 'ESCOLHA_DATA', { ...dados, sugestoes: opcoes }, agora,
    `${introducao}\n\n${lista}\n\n` +
    'Responda com o *número* da data que preferir, ou escreva outra data.');
}

async function tratarEscolhaData(telefone, original, dados, agora) {
  const sugestoes = dados.sugestoes || [];
  const numero = original.match(/^([1-9])(\uFE0F?\u20E3)?$/);

  if (numero && Number(numero[1]) <= sugestoes.length) {
    const escolhida = sugestoes[Number(numero[1]) - 1];
    const resultado = await verificarData(escolhida, hojeEmBrasilia(agora));
    if (resultado.situacao !== 'LIVRE') {
      return oferecerOpcoes(telefone, dados, agora, resultado.sugestoes,
        `😕 Poxa, ${negrito(escolhida)} acabou de ser reservada por outra pessoa. Tenho estas:`);
    }
    const novosDados = { ...dados, dataRevisao: escolhida };
    delete novosDados.sugestoes;
    return irParaConfirmacao(telefone, novosDados, agora);
  }

  return tratarData(telefone, original, dados, agora);
}

async function irParaConfirmacao(telefone, dados, agora) {
  return perguntar(telefone, 'CONFIRMACAO', dados, agora,
    '📋 *Confira os dados do agendamento:*\n\n' +
    `👤 Nome: ${dados.cliente}\n` +
    `📱 Celular: ${formatarCelular(dados.telefone)}\n` +
    `🏍️ Moto: ${dados.modeloMoto} ${dados.anoMoto}\n` +
    `📅 Dia: ${formatarData(dados.dataRevisao)}\n` +
    `🕖 Chegada: ${HORARIO_CHEGADA} (fica pronta por volta das ${PREVISAO_TERMINO})\n\n` +
    'Está tudo certo?\n1️⃣ Sim, confirmar\n2️⃣ Não, quero corrigir');
}

async function tratarConfirmacao(telefone, texto, dados, agora) {
  if (escolheuOpcao(texto, 1) || /^sim\b|^s$|confirm|^isso|^certo|^pode/.test(texto)) {
    try {
      const agendamentoId = await reservarRevisao({ ...dados, whatsapp: telefone });
      await salvarConversa(telefone, 'AGENDADO', { agendamentoId, dataRevisao: dados.dataRevisao }, agora);

      const prazo = prazoFinalCancelamento(dados.dataRevisao);
      const regra = `o cancelamento só pode ser feito com até *${ANTECEDENCIA_MINIMA_CANCELAMENTO} dias de antecedência*`;
      const avisoPrazo = prazo >= hojeEmBrasilia(agora)
        ? `⚠️ *Importante:* ${regra}, ou seja, até ${negrito(prazo)}. ` +
          'Para cancelar, digite *menu* e escolha a opção *3*.'
        : `⚠️ *Importante:* ${regra}. Como a sua revisão está bem próxima, ela não poderá ser cancelada.`;

      return '✅ *Revisão agendada!*\n\n' +
        `📅 ${negrito(dados.dataRevisao)}\n` +
        `🕖 Traga a moto às *${HORARIO_CHEGADA}*. A previsão é ficar pronta por volta das *${PREVISAO_TERMINO}*.\n\n` +
        `${avisoPrazo}\n\n` +
        'Obrigado pela preferência! 🏍️\nSe precisar de mais alguma coisa, é só digitar *menu*.';
    } catch (erro) {
      if (erro.message === 'DATA_OCUPADA') {
        const opcoes = await listarDatasLivres(dados.dataRevisao, QUANTIDADE_DE_OPCOES);
        return oferecerOpcoes(telefone, dados, agora, opcoes,
          `😕 Poxa, alguém acabou de reservar ${negrito(dados.dataRevisao)}. Tenho estas datas:`);
      }
      throw erro;
    }
  }

  if (escolheuOpcao(texto, 2) || /^n[aã]o\b|^n$|corrig|errad/.test(texto)) {
    return perguntar(telefone, 'NOME', {}, agora,
      'Sem problema! Vamos preencher de novo. ✍️\n\n*1/5* · Qual é o seu *nome*?');
  }

  return `🤔 Não entendi. Responda *1* para confirmar ou *2* para corrigir os dados.\n\n${VOLTAR}`;
}

async function iniciarCancelamento(telefone, agora) {
  const hoje = hojeEmBrasilia(agora);
  const revisao = await buscarRevisaoAtiva(telefone, hoje);

  if (!revisao) {
    await salvarConversa(telefone, 'FINALIZADO', {}, agora);
    return '🔎 Não encontrei nenhuma revisão marcada para este número.\n\n' +
      'Se você agendou usando outro número, digite *menu* e escolha a opção *2* para falar com o Dinei.';
  }

  const quando = negrito(revisao.dataRevisao);

  if (diasEntre(hoje, revisao.dataRevisao) < ANTECEDENCIA_MINIMA_CANCELAMENTO) {
    await salvarConversa(telefone, 'FINALIZADO', {}, agora);
    return `Sua revisão está marcada para ${quando}.\n\n` +
      `⚠️ O cancelamento só pode ser feito com até *${ANTECEDENCIA_MINIMA_CANCELAMENTO} dias de antecedência*, ` +
      'e esse prazo já passou. Por isso não consigo cancelar por aqui. 😕\n\n' +
      'Se aconteceu algum imprevisto, digite *menu* e escolha a opção *2* para falar com o Dinei.';
  }

  return perguntar(telefone, 'CONFIRMA_CANCELAMENTO', {
    agendamentoId: revisao.id,
    dataRevisao: revisao.dataRevisao,
    cliente: revisao.cliente,
    telefone: revisao.telefone,
    modeloMoto: revisao.modeloMoto,
    anoMoto: revisao.anoMoto,
  }, agora,
    'Encontrei a sua revisão:\n\n' +
    `📅 ${quando}\n🏍️ ${revisao.modeloMoto} ${revisao.anoMoto}\n\n` +
    'Você quer mesmo *cancelar*?\n1️⃣ Sim, cancelar\n2️⃣ Não, manter a revisão');
}

async function tratarConfirmaCancelamento(telefone, texto, dados, agora) {
  const quando = negrito(dados.dataRevisao);

  if (escolheuOpcao(texto, 1) || /^sim\b|^s$|cancel/.test(texto)) {
    try {
      await cancelarRevisao(dados.agendamentoId, { hoje: hojeEmBrasilia(agora) });
    } catch (erro) {
      await salvarConversa(telefone, 'FINALIZADO', {}, agora);
      if (erro.message === 'PRAZO_ENCERRADO') {
        return `😕 O prazo para cancelar a revisão de ${quando} acabou de encerrar.\n\n` +
          'Digite *menu* e escolha a opção *2* para falar com o Dinei.';
      }
      if (erro.message === 'JA_CANCELADO' || erro.message === 'AGENDAMENTO_NAO_ENCONTRADO') {
        return `👍 A revisão de ${quando} já estava cancelada.`;
      }
      throw erro;
    }
    avisarDinei(
      '🔔 *Revisão cancelada pelo cliente*\n\n' +
      `📅 ${quando} — o dia ficou *livre* de novo\n` +
      `👤 ${dados.cliente}\n` +
      `🏍️ ${dados.modeloMoto} ${dados.anoMoto}\n` +
      `📱 ${formatarCelular(dados.telefone)}`);

    await salvarConversa(telefone, 'FINALIZADO', {}, agora);
    return `✅ Pronto! A sua revisão de ${quando} foi cancelada.\n\n` +
      'Se quiser marcar outro dia, é só digitar *menu*.';
  }

  if (escolheuOpcao(texto, 2) || /^n[aã]o\b|^n$|manter/.test(texto)) {
    await salvarConversa(telefone, 'FINALIZADO', {}, agora);
    return `👍 Combinado! A sua revisão continua marcada para ${quando}.\n\n` +
      'Se precisar de mais alguma coisa, é só digitar *menu*.';
  }

  return `🤔 Não entendi. Responda *1* para cancelar ou *2* para manter a revisão.\n\n${VOLTAR}`;
}

module.exports = { saudacao, responderMensagem, responderMidia, deveFicarEmSilencio, SO_TEXTO };
