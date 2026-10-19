const { responderMensagem, responderMidia } = require('../src/bot');
const { carregarConversa, encerrarConversa } = require('../src/conversa');
const { registrarEnvioParaDinei } = require('../src/avisos');

const AGORA = new Date('2027-03-02T10:00:00-03:00');
const TEL = '5511900000071';
const avisos = [];
registrarEnvioParaDinei(async (texto) => { avisos.push(texto); });

function conferir(descricao, obtido, esperado) {
  const o = JSON.stringify(obtido);
  const e = JSON.stringify(esperado);
  const passou = o === e;
  console.log(`${passou ? 'OK    ' : 'FALHOU'} ${descricao} → ${o}${passou ? '' : ` (esperado: ${e})`}`);
}

const diz = (texto, nomePerfil = 'Seu Zé') => responderMensagem(TEL, texto, AGORA, { nomePerfil });
const etapa = async () => (await carregarConversa(TEL, AGORA) || {}).etapa;
async function recomecar() { await encerrarConversa(TEL); avisos.length = 0; await diz('oi'); }

async function testar() {
  await recomecar();
  let r = await diz('dinei é você?');
  conferir('1ª não entendida: ainda explica o menu', r.startsWith('🤔 Não entendi.'), true);
  r = await diz('quero arrumar a moto');
  console.log(`\nCliente: quero arrumar a moto\nBot: ${r}`);
  conferir('2ª seguida: passa para o Dinei', r.startsWith('😊 Parece que eu não estou conseguindo te ajudar'), true);
  conferir('bot fica em silêncio (COM_DINEI)', await etapa(), 'COM_DINEI');
  conferir('depois disso não responde mais', await diz('alô?'), null);
  console.log(`\n--- aviso que o Dinei recebeu ---\n${avisos[0]}\n`);
  conferir('Dinei avisado com nome, número e última mensagem', avisos.length === 1 &&
    avisos[0].includes('Seu Zé') && avisos[0].includes('(11) 90000-0071') &&
    avisos[0].includes('quero arrumar a moto') && avisos[0].includes('não entendeu 2 mensagens'), true);

  await recomecar();
  await diz('hã?');
  r = await diz('menu');
  r = await diz('???');
  conferir('erro, acerto, erro: não chama o Dinei', r.startsWith('🤔 Não entendi.'), true);
  conferir('sem aviso ao Dinei', avisos.length, 0);

  await recomecar();
  await diz('1');
  await diz('123');
  r = await diz('!!!');
  conferir('no agendamento, erros seguidos NÃO chamam o Dinei', r.startsWith('❌'), true);
  conferir('continua na etapa do nome', await etapa(), 'NOME');
  await diz('Zé');
  await diz('11 90000-0071');
  await diz('cg 160');
  await diz('2020');
  await diz('bom dia');
  r = await diz('tanto faz');
  conferir('na data, erros seguidos também não chamam o Dinei', r.startsWith('❌'), true);
  conferir('nenhum aviso ao Dinei', avisos.length, 0);

  await recomecar();
  r = await diz('3');
  conferir('opção 3 sem revisão: mensagem normal', r.startsWith('🔎 Não encontrei'), true);
  conferir('sem aviso ao Dinei', avisos.length, 0);

  await recomecar();
  r = await diz('2');
  conferir('opção 2: mensagem de aguarde', r.startsWith('👍 Certo! Aguarde'), true);
  conferir('Dinei avisado que o cliente escolheu falar com ele', avisos.length === 1 &&
    avisos[0].includes('escolheu a opção "Falar com o Dinei"'), true);

  await encerrarConversa(TEL);
  avisos.length = 0;
  r = await responderMidia(TEL, AGORA, { nomePerfil: 'Dona Maria' });
  conferir('1º áudio: boas-vindas + pede texto', r.includes('Seja bem-vindo') && r.includes('só consigo ler mensagens de *texto*'), true);
  r = await responderMidia(TEL, AGORA, { nomePerfil: 'Dona Maria' });
  conferir('2º áudio seguido: chama o Dinei', r.startsWith('😊 Parece que eu não estou conseguindo'), true);
  conferir('aviso diz que foi áudio', avisos[0] && avisos[0].includes('Dona Maria') && avisos[0].includes('áudio'), true);
  conferir('depois, áudio fica em silêncio', await responderMidia(TEL, AGORA, {}), null);

  await recomecar();
  await diz('1');
  await responderMidia(TEL, AGORA, {});
  r = await responderMidia(TEL, AGORA, {});
  conferir('áudio no agendamento: só pede texto', r.startsWith('🙂 Por enquanto eu só consigo ler'), true);
  conferir('nenhum aviso ao Dinei', avisos.length, 0);

  await encerrarConversa(TEL);
  console.log('\n(limpeza: conversa de teste apagada)');
  process.exit(0);
}

testar();
