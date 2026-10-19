delete process.env.SOMENTE_NUMEROS;
process.env.NUMERO_DINEI = '5527911112222';

const db = require('../src/database');
const { responderMensagem } = require('../src/bot');
const { salvarConversa, encerrarConversa, carregarConversa } = require('../src/conversa');
const { cancelarRevisao } = require('../src/agenda');
const { enfileirar, aguardarFilas, ajustes } = require('../src/conexao');

const AGORA = new Date('2027-03-01T10:00:00-03:00');
let falhas = 0;

function conferir(descricao, obtido, esperado) {
  const o = JSON.stringify(obtido);
  const e = JSON.stringify(esperado);
  const passou = o === e;
  if (!passou) falhas++;
  console.log(`${passou ? 'OK    ' : 'FALHOU'} ${descricao} → ${o}${passou ? '' : ` (esperado: ${e})`}`);
}

const segundos = (inicio) => ((Date.now() - inicio) / 1000).toFixed(1);

async function parteA() {
  console.log('\n=== (A) 15 clientes agendando ao mesmo tempo ===');
  const N = 15;
  const telefones = Array.from({ length: N }, (_, i) => `55119000010${String(i).padStart(2, '0')}`);
  for (const t of telefones) await encerrarConversa(t);

  async function cliente(tel, i) {
    for (const passo of ['oi', '1', `Cliente Estresse ${i}`, tel.slice(2), 'CG 160', '2020', 'próxima vaga']) {
      await responderMensagem(tel, passo, AGORA);
    }
    for (let tentativa = 1; tentativa <= 40; tentativa++) {
      let r = await responderMensagem(tel, '1', AGORA);
      if (r.startsWith('📋')) {
        r = await responderMensagem(tel, 'sim', AGORA);
        if (r.startsWith('✅')) return tentativa;
      }
    }
    throw new Error(`${tel} não conseguiu agendar em 40 tentativas`);
  }

  const inicio = Date.now();
  const resultados = await Promise.allSettled(telefones.map(cliente));
  console.log(`(tempo total: ${segundos(inicio)} s)`);

  const ok = resultados.filter((r) => r.status === 'fulfilled');
  resultados.filter((r) => r.status === 'rejected').forEach((r) => console.log('  erro:', r.reason.message));
  conferir('todos os 15 conseguiram agendar', ok.length, N);
  console.log(`(tentativas por cliente: ${ok.map((r) => r.value).join(', ')})`);

  const confirmados = [];
  for (const tel of telefones) {
    const snap = await db.collection('agendamentos').where('telefone', '==', tel).get();
    snap.docs.forEach((d) => confirmados.push({ id: d.id, ...d.data() }));
  }
  const ativos = confirmados.filter((a) => a.status === 'confirmado');
  conferir('exatamente 1 agendamento por cliente (nenhum duplicado)', ativos.length, N);
  const dias = ativos.map((a) => a.dataRevisao);
  conferir('nenhum dia com duas revisões', new Set(dias).size, N);

  let fichasCertas = 0;
  for (const a of ativos) {
    const ficha = await db.collection('agenda').doc(a.dataRevisao).get();
    if (ficha.exists && ficha.data().agendamentoId === a.id) fichasCertas++;
  }
  conferir('cada ficha da agenda aponta para o agendamento certo', fichasCertas, N);
  const diasDaSemana = new Set(dias.map((d) => new Date(d + 'T00:00:00Z').getUTCDay()));
  conferir('só terças a sextas', [...diasDaSemana].every((d) => d >= 2 && d <= 5), true);

  for (const a of ativos) await cancelarRevisao(a.id, { ignorarPrazo: true, hoje: '2027-03-01' });
  for (const a of confirmados) await db.collection('agendamentos').doc(a.id).delete();
  for (const t of telefones) await encerrarConversa(t);
}

async function parteB() {
  console.log('\n=== (B) conexão: 20 mensagens simultâneas e casos especiais ===');
  ajustes.escalaTempo = 0.02;

  const enviados = [];
  const sockFalso = {
    user: { id: '5527911112222:5@s.whatsapp.net' },
    signalRepository: { lidMapping: { getPNForLID: async () => null } },
    readMessages: async () => {},
    sendPresenceUpdate: async () => {},
    sendMessage: async (jid, { text }, { messageId }) => {
      enviados.push({ jid, text, id: messageId, quando: Date.now() });
    },
  };

  let contador = 0;
  const agoraEmSegundos = () => Math.floor(Date.now() / 1000);
  const msg = (numero, texto, extra = {}) => ({
    key: { remoteJid: `${numero}@s.whatsapp.net`, id: `TESTE-${++contador}`, fromMe: false, ...extra.key },
    message: { conversation: texto },
    messageTimestamp: extra.timestamp || agoraEmSegundos(),
  });
  const pegarEnviados = () => enviados.splice(0, enviados.length);

  const clientes = Array.from({ length: 20 }, (_, i) => `55119000020${String(i).padStart(2, '0')}`);
  const extras = ['5511900003000', '5511900003001', '5511900003002'];
  for (const t of [...clientes, ...extras, process.env.NUMERO_DINEI]) await encerrarConversa(t);

  let inicio = Date.now();
  clientes.forEach((c) => enfileirar(sockFalso, msg(c, 'oi')));
  await aguardarFilas();
  let lote = pegarEnviados();
  console.log(`(20 respostas em ${segundos(inicio)} s com esperas reduzidas)`);
  conferir('20 clientes, 20 respostas', lote.length, 20);
  conferir('toda mensagem sai assinada "🤖 *BOT Dinei Motos*"',
    lote.every((e) => e.text.startsWith('🤖 *BOT Dinei Motos*\n\n')), true);
  conferir('cada cliente recebeu a SUA saudação',
    clientes.every((c) => lote.some((e) => e.jid === `${c}@s.whatsapp.net` && e.text.includes('Seja bem-vindo'))), true);
  const intervalos = lote.slice(1).map((e, i) => e.quando - lote[i].quando);
  console.log(`(menor intervalo entre envios: ${Math.min(...intervalos)} ms; mínimo exigido: ${800 * ajustes.escalaTempo} ms)`);
  conferir('intervalo mínimo entre envios respeitado', Math.min(...intervalos) >= 800 * ajustes.escalaTempo - 1, true);

  const [c1] = extras;
  enfileirar(sockFalso, msg(c1, 'oi'));
  enfileirar(sockFalso, msg(c1, '1'));
  enfileirar(sockFalso, msg(c1, 'Maria'));
  await aguardarFilas();
  lote = pegarEnviados();
  conferir('3 respostas na ordem (saudação → nome → celular)',
    [lote[0].text.includes('Seja bem-vindo'), lote[1].text.includes('*1/5*'), lote[2].text.includes('*2/5*')],
    [true, true, true]);

  const repetida = msg(extras[1], 'oi');
  enfileirar(sockFalso, repetida);
  enfileirar(sockFalso, { ...repetida });
  await aguardarFilas();
  conferir('mensagem repetida respondida só uma vez', pegarEnviados().length, 1);

  enfileirar(sockFalso, msg(extras[2], 'oi', { timestamp: agoraEmSegundos() - 600 }));
  enfileirar(sockFalso, msg('120363000000000000', 'oi', { key: { remoteJid: '120363000000000000@g.us' } }));
  await aguardarFilas();
  conferir('mensagem antiga e de grupo ignoradas', pegarEnviados().length, 0);

  enfileirar(sockFalso, msg(extras[2], 'oi'));
  await aguardarFilas();
  const [nossa] = pegarEnviados();
  enfileirar(sockFalso, msg(extras[2], nossa.text, { key: { id: nossa.id, fromMe: true } }));
  await aguardarFilas();
  conferir('eco da nossa resposta ignorado', (await carregarConversa(extras[2])).etapa, 'MENU');

  enfileirar(sockFalso, msg(extras[2], 'Oi, aqui é o Dinei!', { key: { fromMe: true } }));
  await aguardarFilas();
  conferir('resposta à mão do Dinei → COM_DINEI', (await carregarConversa(extras[2])).etapa, 'COM_DINEI');
  enfileirar(sockFalso, msg(extras[2], 'beleza, obrigado'));
  await aguardarFilas();
  conferir('depois disso o bot fica quieto', pegarEnviados().length, 0);

  enfileirar(sockFalso, msg('5527911112222', 'oi', { key: { fromMe: true } }));
  await aguardarFilas();
  lote = pegarEnviados();
  conferir('chat "Você" responde com o menu do chefe', lote[0] && lote[0].text.includes('🔧 *Menu do Dinei*'), true);

  inicio = Date.now();
  for (let i = 0; i < 25; i++) enfileirar(sockFalso, msg(extras[0], `mensagem ${i}`));
  await aguardarFilas();
  const respostasEnxurrada = pegarEnviados().length;
  console.log(`(enxurrada: ${respostasEnxurrada} respostas em ${segundos(inicio)} s)`);
  conferir('enxurrada limitada a 20 respostas', respostasEnxurrada <= 20, true);

  for (const t of [...clientes, ...extras, process.env.NUMERO_DINEI]) await encerrarConversa(t);
  ajustes.escalaTempo = 1;
}

async function parteC() {
  console.log('\n=== (C) entradas estranhas em todas as etapas ===');
  const ESTRANHAS = [
    '', '   ', '😀😀😀', '🏍️', 'x'.repeat(5000), "'; DROP TABLE agenda; --", '<script>alert(1)</script>',
    'null', 'undefined', '[object Object]', '99999999999999999999', '-1', '0', '00/00', '32/13',
    '31/02', '29/02/2027', '1/1/1', 'dia 99', '25 de banana', 'çãõéü', '\u0000\u0001', '1/5/2027/9',
    'próxima vaga em março de 1999', '2 do 2 do 2', '12345678901234567890 de dezembro',
  ];
  const dadosCompletos = {
    cliente: 'Teste Estranho', telefone: '5511900004000', modeloMoto: 'CG 160', anoMoto: 2020,
    dataRevisao: '2027-03-02', sugestoes: ['2027-03-02', '2027-03-03'],
  };
  const etapasCliente = ['MENU', 'NOME', 'CELULAR', 'MOTO', 'ANO', 'DATA', 'ESCOLHA_DATA',
    'CONFIRMACAO', 'CONFIRMA_CANCELAMENTO', 'COM_DINEI', 'AGENDADO', 'FINALIZADO', 'ETAPA_QUE_NAO_EXISTE'];
  const etapasChefe = ['CHEFE_MENU', 'CHEFE_BLOQUEAR', 'CHEFE_DESBLOQUEAR', 'CHEFE_CANCELAR',
    'CHEFE_CONFIRMA_CANCELAMENTO', 'CHEFE_AG_DATA', 'CHEFE_AG_NOME', 'CHEFE_AG_CELULAR',
    'CHEFE_AG_MOTO', 'CHEFE_AG_ANO', 'CHEFE_AG_CONFIRMA'];

  const telCliente = '5511900004000';
  let total = 0;
  const quebras = [];
  const inicio = Date.now();

  async function bombardear(tel, etapas, dadosExtra) {
    for (const etapa of etapas) {
      for (const entrada of ESTRANHAS) {
        await salvarConversa(tel, etapa, { ...dadosCompletos, ...dadosExtra }, AGORA);
        total++;
        try {
          const r = await responderMensagem(tel, entrada, AGORA);
          if (r !== null && typeof r !== 'string') quebras.push(`${etapa} / ${JSON.stringify(entrada).slice(0, 30)}: resposta ${typeof r}`);
        } catch (erro) {
          quebras.push(`${etapa} / ${JSON.stringify(entrada).slice(0, 30)}: ${erro.message}`);
        }
      }
    }
  }

  await bombardear(telCliente, etapasCliente, { agendamentoId: 'nao-existe' });
  await bombardear(process.env.NUMERO_DINEI, etapasChefe, { agendamentoId: 'nao-existe' });

  console.log(`(${total} combinações em ${segundos(inicio)} s)`);
  quebras.slice(0, 10).forEach((q) => console.log('  quebrou:', q));
  conferir(`nenhuma das ${total} combinações quebrou o bot`, quebras.length, 0);

  const criados = await db.collection('agendamentos').where('telefone', '==', '5511900004000').get();
  conferir('nenhum agendamento criado por entrada estranha', criados.size, 0);
  for (const doc of criados.docs) {
    await cancelarRevisao(doc.id, { ignorarPrazo: true, hoje: '2027-03-01' }).catch(() => {});
    await doc.ref.delete();
  }
  const fichas2027 = await db.collection('agenda').where('motivo', '!=', null).get();
  const bloqueiosEstranhos = fichas2027.docs.filter((d) => d.id.startsWith('2027'));
  conferir('nenhum bloqueio criado por entrada estranha', bloqueiosEstranhos.length, 0);

  await encerrarConversa(telCliente);
  await encerrarConversa(process.env.NUMERO_DINEI);
}

(async () => {
  const inicio = Date.now();
  await parteA();
  await parteB();
  await parteC();
  console.log(`\n${falhas === 0 ? '✅ TUDO CERTO' : `❌ ${falhas} FALHA(S)`} — teste de estresse em ${segundos(inicio)} s`);
  process.exit(falhas === 0 ? 0 : 1);
})();
