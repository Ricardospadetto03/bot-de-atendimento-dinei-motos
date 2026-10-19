const { saudacao, responderMensagem } = require('../src/bot');
const { carregarConversa, encerrarConversa } = require('../src/conversa');

const TEL_A = '5511900000097';
const TEL_B = '5511900000096';

function conferir(descricao, obtido, esperado) {
  const passou = obtido === esperado;
  console.log(`${passou ? 'OK    ' : 'FALHOU'} ${descricao} → ${JSON.stringify(obtido)}${passou ? '' : ` (esperado: ${JSON.stringify(esperado)})`}`);
}

const as = (hora) => new Date(`2026-10-15T${hora}:00-03:00`);

async function testar() {
  conferir('07:00', saudacao(as('07:00')), 'Bom dia');
  conferir('11:59', saudacao(as('11:59')), 'Bom dia');
  conferir('12:00', saudacao(as('12:00')), 'Boa tarde');
  conferir('18:00', saudacao(as('18:00')), 'Boa noite');
  conferir('02:00 (madrugada)', saudacao(as('02:00')), 'Boa noite');

  await encerrarConversa(TEL_A);
  await encerrarConversa(TEL_B);

  console.log('\n--- cliente A ---');
  let r = await responderMensagem(TEL_A, 'oi', as('09:00'));
  console.log(r);
  conferir('primeira mensagem começa com Bom dia', r.startsWith('Bom dia!'), true);

  r = await responderMensagem(TEL_A, '7', as('09:01'));
  conferir('opção inválida repete o menu', r.startsWith('🤔 Não entendi.'), true);

  r = await responderMensagem(TEL_A, '1', as('09:02'));
  console.log(r);
  conferir('etapa salva no banco', (await carregarConversa(TEL_A, as('09:02'))).etapa, 'NOME');

  conferir('30 min depois ainda está em NOME', (await carregarConversa(TEL_A, as('09:32'))).etapa, 'NOME');
  conferir('3h depois a conversa expirou', await carregarConversa(TEL_A, as('12:02')), null);
  r = await responderMensagem(TEL_A, 'oi de novo', as('14:00'));
  conferir('volta com saudação da tarde', r.startsWith('Boa tarde!'), true);

  console.log('\n--- cliente B ---');
  await responderMensagem(TEL_B, 'olá', as('20:00'));
  r = await responderMensagem(TEL_B, '2', as('20:01'));
  console.log(r);
  conferir('resposta ensina a digitar menu', r.includes('*menu*'), true);

  r = await responderMensagem(TEL_B, 'ok, obrigado', as('21:01'));
  conferir('bot em silêncio 1h depois', r, null);

  r = await responderMensagem(TEL_B, 'a moto está fazendo barulho', new Date('2026-10-16T19:00:00-03:00'));
  conferir('bot em silêncio 23h depois', r, null);

  r = await responderMensagem(TEL_B, 'oi', new Date('2026-10-16T20:30:00-03:00'));
  conferir('depois de 24h volta a saudação', r.startsWith('Boa noite!'), true);

  await responderMensagem(TEL_B, '2', as('20:31'));
  r = await responderMensagem(TEL_B, 'menu', as('20:40'));
  conferir('"menu" chama o bot de volta na hora', r.startsWith('Boa noite!'), true);

  await encerrarConversa(TEL_A);
  await encerrarConversa(TEL_B);
}

testar();
