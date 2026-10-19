const baileys = require('baileys');
const qrcode = require('qrcode-terminal');
const pino = require('pino');
const { responderMensagem, responderMidia } = require('./bot');
const { salvarConversa } = require('./conversa');
const { executarRotinaDiaria, enviarLembretes } = require('./rotinas');
const { registrarEnvioParaDinei, registrarEnvioParaCliente } = require('./avisos');
const {
  ehConversaPrivada,
  numeroDoJid,
  classificarMensagem,
  idadeEmSegundos,
  numeroPermitido,
  tempoDigitando,
  LimitePorConversa,
  MemoriaLimitada,
} = require('./mensagens');

const makeWASocket = baileys.default;
const { useMultiFileAuthState, DisconnectReason, fetchLatestBaileysVersion, generateMessageIDV2 } = baileys;

const PASTA_SESSAO = 'sessao-whatsapp';

const IDADE_MAXIMA_SEGUNDOS = 120;
const INTERVALO_MINIMO_ENTRE_ENVIOS_MS = 800;
const MENSAGEM_DE_ERRO = '😕 Desculpe, tive um probleminha aqui. Pode mandar de novo?';

const ASSINATURA = '🤖 *BOT Dinei Motos*';
const comAssinatura = (texto) => `${ASSINATURA}\n\n${texto}`;

const ajustes = { escalaTempo: 1 };

const idsEnviadosPeloBot = new MemoriaLimitada(2000);
const idsRecebidos = new MemoriaLimitada(5000);
const limite = new LimitePorConversa(20, 60);
const filasPorConversa = new Map();
let filaDeEnvio = Promise.resolve();
let ultimoEnvio = 0;
let tentativasDeReconexao = 0;
let relogioIniciado = false;
let sockAtual = null;
let conectado = false;

const esperar = (ms) => new Promise((ok) => setTimeout(ok, ms * ajustes.escalaTempo));

async function enviarAviso(destino, texto, etapa = 'AGENDADO') {
  if (!conectado || !sockAtual) throw new Error('WhatsApp desconectado');

  if (destino === 'DINEI') {
    await enviarComCalma(sockAtual, `${process.env.NUMERO_DINEI}@s.whatsapp.net`, texto, null);
    return;
  }

  if (!numeroPermitido(destino, process.env.SOMENTE_NUMEROS)) return;
  const [resultado] = await sockAtual.onWhatsApp(destino);
  if (!resultado || !resultado.exists) throw new Error(`o número ${destino} não tem WhatsApp`);

  await salvarConversa(numeroDoJid(resultado.jid), etapa, {});
  await enviarComCalma(sockAtual, resultado.jid, texto, null);
}

function iniciarRelogio() {
  if (relogioIniciado) return;
  relogioIniciado = true;

  const verificar = async () => {
    try {
      const limpeza = await executarRotinaDiaria();
      if (limpeza) {
        console.log(`🧹 Limpeza diária (antes de ${limpeza.corte}): ` +
          `${limpeza.agendamentos} agendamentos, ${limpeza.agenda} dias da agenda, ` +
          `${limpeza.conversas} conversas.`);
      }
    } catch (erro) {
      console.error('Erro na limpeza diária:', erro.message);
    }

    if (!conectado) return;
    try {
      const lembretes = await enviarLembretes(new Date(), enviarAviso);
      if (lembretes > 0) console.log(`🔔 Lembretes enviados: ${lembretes} revisão(ões) de amanhã.`);
    } catch (erro) {
      console.error('Erro nos lembretes:', erro.message);
    }
  };

  verificar();
  setInterval(verificar, 10 * 60 * 1000);
}

async function numeroDoRemetente(sock, chave) {
  for (const jid of [chave.remoteJid, chave.remoteJidAlt]) {
    if (jid && jid.endsWith('@s.whatsapp.net')) return numeroDoJid(jid);
  }
  if (chave.remoteJid && chave.remoteJid.endsWith('@lid')) {
    const pn = await sock.signalRepository.lidMapping.getPNForLID(chave.remoteJid).catch(() => null);
    if (pn) return numeroDoJid(pn);
  }
  return null;
}

function ehChatComigoMesmo(sock, jid) {
  const eu = sock.user || {};
  return [eu.id, eu.lid].filter(Boolean).some((meu) => numeroDoJid(meu) === numeroDoJid(jid));
}

function enviarNaVez(enviar) {
  const minhaVez = filaDeEnvio.then(async () => {
    const falta = ultimoEnvio + INTERVALO_MINIMO_ENTRE_ENVIOS_MS * ajustes.escalaTempo - Date.now();
    if (falta > 0) await new Promise((ok) => setTimeout(ok, falta));
    try {
      await enviar();
    } finally {
      ultimoEnvio = Date.now();
    }
  });
  filaDeEnvio = minhaVez.catch(() => {});
  return minhaVez;
}

async function enviarComCalma(sock, jid, texto, chaveRecebida) {
  try {
    if (chaveRecebida) await sock.readMessages([chaveRecebida]);
    await sock.sendPresenceUpdate('composing', jid);
    await esperar(tempoDigitando(texto));

    await enviarNaVez(async () => {
      await sock.sendPresenceUpdate('paused', jid);
      const idDaMensagem = generateMessageIDV2(sock.user && sock.user.id);
      idsEnviadosPeloBot.add(idDaMensagem);
      await sock.sendMessage(jid, { text: comAssinatura(texto) }, { messageId: idDaMensagem });
    });
  } catch (erro) {
    console.error(`Erro ao enviar para ${jid}:`, erro.message);
  }
}

async function tratarMensagem(sock, msg) {
  const chave = msg.key;
  const jid = chave.remoteJid;

  if (!ehConversaPrivada(jid)) return;
  if (!msg.message) return;
  if (idadeEmSegundos(msg.messageTimestamp) > IDADE_MAXIMA_SEGUNDOS) return;
  if (idsEnviadosPeloBot.has(chave.id)) {
    idsEnviadosPeloBot.delete(chave.id);
    return;
  }
  if (idsRecebidos.has(chave.id)) return;
  idsRecebidos.add(chave.id);

  const conteudo = classificarMensagem(msg.message);
  if (conteudo.tipo === 'ignorar') return;

  if (chave.fromMe) {
    if (ehChatComigoMesmo(sock, jid)) {
      if (conteudo.tipo !== 'texto') return;
      const resposta = await responderMensagem(process.env.NUMERO_DINEI, conteudo.texto)
        .catch((erro) => { console.error('Erro no menu do chefe:', erro); return MENSAGEM_DE_ERRO; });
      if (resposta) await enviarComCalma(sock, jid, resposta, null);
      return;
    }
    const numeroCliente = await numeroDoRemetente(sock, chave);
    if (numeroCliente && numeroPermitido(numeroCliente, process.env.SOMENTE_NUMEROS)) {
      await salvarConversa(numeroCliente, 'COM_DINEI', {});
      console.log(`(Dinei assumiu a conversa com ${numeroCliente}: bot em silêncio por 24h)`);
    }
    return;
  }

  const numero = await numeroDoRemetente(sock, chave);
  if (!numero) {
    console.warn(`Não consegui descobrir o número de ${jid}; mensagem ignorada.`);
    return;
  }
  if (!numeroPermitido(numero, process.env.SOMENTE_NUMEROS)) return;

  let resposta;
  try {
    const extras = { nomePerfil: msg.pushName || null };
    if (conteudo.tipo === 'texto') {
      resposta = await responderMensagem(numero, conteudo.texto, undefined, extras);
    } else {
      resposta = await responderMidia(numero, undefined, extras);
    }
  } catch (erro) {
    console.error(`Erro ao responder ${numero}:`, erro);
    resposta = MENSAGEM_DE_ERRO;
  }
  if (!resposta) return;

  if (!limite.permitir(numero)) {
    console.warn(`Limite de respostas atingido para ${numero}; ficando quieto por um tempo.`);
    return;
  }
  await enviarComCalma(sock, jid, resposta, chave);
}

function enfileirar(sock, msg) {
  const jid = (msg.key && msg.key.remoteJid) || 'desconhecido';
  const anterior = filasPorConversa.get(jid) || Promise.resolve();
  const proxima = anterior
    .then(() => tratarMensagem(sock, msg))
    .catch((erro) => console.error('Erro ao tratar mensagem:', erro))
    .finally(() => {
      if (filasPorConversa.get(jid) === proxima) filasPorConversa.delete(jid);
    });
  filasPorConversa.set(jid, proxima);
  return proxima;
}

async function aguardarFilas() {
  while (filasPorConversa.size > 0) {
    await Promise.all([...filasPorConversa.values()]);
  }
  await filaDeEnvio;
}

async function conectar() {
  const { state, saveCreds } = await useMultiFileAuthState(PASTA_SESSAO);
  const { version } = await fetchLatestBaileysVersion();

  const sock = makeWASocket({
    version,
    auth: state,
    logger: pino({ level: 'silent' }),
    markOnlineOnConnect: false,
    syncFullHistory: false,
  });

  sock.ev.on('creds.update', saveCreds);

  sock.ev.on('connection.update', (atualizacao) => {
    const { connection, lastDisconnect, qr } = atualizacao;

    if (qr) {
      console.log('\nEscaneie no celular: WhatsApp → Dispositivos conectados → Conectar dispositivo\n');
      qrcode.generate(qr, { small: true });
    }

    if (connection === 'open') {
      tentativasDeReconexao = 0;
      sockAtual = sock;
      conectado = true;
      const meuNumero = numeroDoJid(sock.user.id);
      if (!process.env.NUMERO_DINEI) process.env.NUMERO_DINEI = meuNumero;
      console.log(`✅ Conectado como ${meuNumero}. Bot da Dinei Motos funcionando.`);
      console.log(process.env.SOMENTE_NUMEROS
        ? `🧪 MODO TESTE: só respondo a ${process.env.SOMENTE_NUMEROS} (e ao chat "Você").`
        : '⚠️  Respondendo a TODOS os contatos (sem modo teste).');
      iniciarRelogio();
    }

    if (connection === 'close') {
      conectado = false;
      const codigo = lastDisconnect && lastDisconnect.error && lastDisconnect.error.output
        ? lastDisconnect.error.output.statusCode
        : null;
      if (codigo === DisconnectReason.loggedOut) {
        console.error(
          '❌ O WhatsApp desconectou este dispositivo (logout ou remoção no celular).\n' +
          `   Para conectar de novo: apague a pasta "${PASTA_SESSAO}" e rode npm start.`);
        process.exit(1);
      }
      if (codigo === DisconnectReason.connectionReplaced) {
        console.error(
          '❌ Outro bot entrou com esta mesma sessão do WhatsApp (código 440) e este foi desligado.\n' +
          '   Deixe só UM bot ligado: feche os outros terminais (Ctrl + C) ou desligue o do servidor.');
        process.exit(1);
      }
      tentativasDeReconexao++;
      const espera = Math.min(5000 * tentativasDeReconexao, 60000);
      console.log(`Conexão caiu (código ${codigo}). Tentando de novo em ${espera / 1000}s...`);
      setTimeout(() => conectar().catch((e) => console.error('Falha ao reconectar:', e)), espera);
    }
  });

  sock.ev.on('messages.upsert', ({ messages, type }) => {
    if (type !== 'notify') return;
    for (const msg of messages) enfileirar(sock, msg);
  });
}

const ARQUIVO_TRAVA = 'bot-ligado.trava';
function pegarTrava() {
  const fs = require('node:fs');
  try {
    const pidAntigo = Number(fs.readFileSync(ARQUIVO_TRAVA, 'utf8'));
    process.kill(pidAntigo, 0);
    console.error(
      `❌ Já existe um bot ligado neste computador (processo ${pidAntigo}).\n` +
      '   Feche o outro terminal (Ctrl + C) antes de ligar de novo.');
    process.exit(1);
  } catch {
  }
  fs.writeFileSync(ARQUIVO_TRAVA, String(process.pid));
  const soltar = () => { try { fs.unlinkSync(ARQUIVO_TRAVA); } catch {  } };
  process.on('exit', soltar);
  process.on('SIGINT', () => process.exit(0));
  process.on('SIGTERM', () => process.exit(0));
}

function conferirModoDeAtendimento() {
  if (process.env.SOMENTE_NUMEROS) return;
  if (process.env.RESPONDER_TODOS === 'sim') return;
  console.error(
    '❌ O bot NÃO foi ligado: ele responderia a TODOS os contatos deste WhatsApp.\n' +
    '   Para testar, defina antes os números que podem receber resposta:\n' +
    '     $env:SOMENTE_NUMEROS="55DDDNUMERO"\n' +
    '   Para atender todos os clientes (só no número da oficina), coloque no .env:\n' +
    '     RESPONDER_TODOS=sim');
  process.exit(1);
}

if (require.main === module) {
  try {
    process.loadEnvFile();
  } catch {
  }
  conferirModoDeAtendimento();
  pegarTrava();
  registrarEnvioParaDinei((texto) => enviarAviso('DINEI', texto));
  registrarEnvioParaCliente((numero, texto, etapa) => enviarAviso(numero, texto, etapa));
  conectar().catch((erro) => {
    console.error('Não foi possível iniciar:', erro);
    process.exit(1);
  });
}

module.exports = { numeroDoRemetente, ehChatComigoMesmo, enfileirar, aguardarFilas, ajustes };
