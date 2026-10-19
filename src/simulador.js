const readline = require('node:readline');
const { responderMensagem } = require('./bot');

const MODO_CHEFE = process.argv[2] === 'chefe';

if (MODO_CHEFE && !process.env.NUMERO_DINEI) {
  process.env.NUMERO_DINEI = '5527900000001';
}

const TELEFONE_SIMULADO = MODO_CHEFE ? process.env.NUMERO_DINEI : '5527900000000';

async function iniciar() {
  const terminal = readline.createInterface({ input: process.stdin });
  console.log(`Simulador da Dinei Motos — falando como ${MODO_CHEFE ? 'o DINEI' : 'CLIENTE'}.` +
    ' Digite uma mensagem (Ctrl + C para sair).\n');

  for await (const mensagem of terminal) {
    if (!mensagem.trim()) continue;
    if (!process.stdin.isTTY) console.log(`Você: ${mensagem}`);
    const resposta = await responderMensagem(TELEFONE_SIMULADO, mensagem);
    console.log(resposta === null ? '(bot em silêncio)\n' : `Bot: ${resposta}\n`);
  }
}

iniciar();
