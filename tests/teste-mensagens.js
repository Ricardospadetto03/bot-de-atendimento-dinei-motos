const {
  ehConversaPrivada,
  numeroDoJid,
  classificarMensagem,
  idadeEmSegundos,
  numeroPermitido,
  tempoDigitando,
  LimitePorConversa,
} = require('../src/mensagens');
const { numeroDoRemetente, ehChatComigoMesmo } = require('../src/conexao');

function conferir(descricao, obtido, esperado) {
  const o = JSON.stringify(obtido);
  const e = JSON.stringify(esperado);
  const passou = o === e;
  console.log(`${passou ? 'OK    ' : 'FALHOU'} ${descricao} → ${o}${passou ? '' : ` (esperado: ${e})`}`);
}

async function testar() {
  conferir('pessoa (número)', ehConversaPrivada('5527999999999@s.whatsapp.net'), true);
  conferir('pessoa (LID)', ehConversaPrivada('123456789012345@lid'), true);
  conferir('grupo', ehConversaPrivada('120363000000000000@g.us'), false);
  conferir('status', ehConversaPrivada('status@broadcast'), false);
  conferir('canal', ehConversaPrivada('120363000000000000@newsletter'), false);
  conferir('número do JID com aparelho', numeroDoJid('5527999999999:12@s.whatsapp.net'), '5527999999999');

  conferir('texto simples', classificarMensagem({ conversation: 'oi' }), { tipo: 'texto', texto: 'oi' });
  conferir('texto com link/resposta', classificarMensagem({ extendedTextMessage: { text: 'quero agendar' } }),
    { tipo: 'texto', texto: 'quero agendar' });
  conferir('texto em conversa temporária',
    classificarMensagem({ ephemeralMessage: { message: { conversation: '1' } } }), { tipo: 'texto', texto: '1' });
  conferir('áudio', classificarMensagem({ audioMessage: {} }), { tipo: 'midia' });
  conferir('figurinha', classificarMensagem({ stickerMessage: {} }), { tipo: 'midia' });
  conferir('reação (👍)', classificarMensagem({ reactionMessage: { text: '👍' } }), { tipo: 'ignorar' });
  conferir('mensagem apagada', classificarMensagem({ protocolMessage: { type: 0 } }), { tipo: 'ignorar' });
  conferir('texto vazio', classificarMensagem({ conversation: '   ' }), { tipo: 'ignorar' });

  const agora = new Date('2026-10-15T20:00:00Z');
  const seg = Math.floor(agora.getTime() / 1000);
  conferir('mensagem de agora', idadeEmSegundos(seg, agora), 0);
  conferir('mensagem de 5 min atrás', idadeEmSegundos(seg - 300, agora), 300);
  conferir('timestamp como objeto Long', idadeEmSegundos({ toNumber: () => seg - 10 }, agora), 10);

  conferir('sem lista: responde todos', numeroPermitido('5527955556666', undefined), true);
  conferir('na lista', numeroPermitido('5527955556666', '5527911112222, 5527955556666'), true);
  conferir('fora da lista', numeroPermitido('5527900000000', '5527911112222,5527955556666'), false);
  conferir('na lista sem o 9', numeroPermitido('552755556666', '5527955556666'), true);

  const { escolheuOpcao } = require('../src/validacao');
  conferir('opção "1"', escolheuOpcao('1', 1), true);
  conferir('opção "1️⃣"', escolheuOpcao('1️⃣', 1), true);
  conferir('opção "1 sim"', escolheuOpcao('1 sim', 1), true);
  conferir('opção "opção 1"', escolheuOpcao('Opção 1', 1), true);
  conferir('"1/12" NÃO é a opção 1', escolheuOpcao('1/12', 1), false);
  conferir('"10" NÃO é a opção 1', escolheuOpcao('10', 1), false);
  conferir('"2 do 2" NÃO é a opção 2', escolheuOpcao('2 do 2', 2), false);
  conferir('"1 - agendar" é a opção 1', escolheuOpcao('1 - agendar', 1), true);

  conferir('texto curto', tempoDigitando('ok', 0), 1250);
  conferir('texto longo tem teto', tempoDigitando('x'.repeat(5000), 0), 6000);

  const lim = new LimitePorConversa(3, 60);
  const t0 = 1_000_000;
  conferir('3 respostas permitidas', [lim.permitir('a', t0), lim.permitir('a', t0 + 1), lim.permitir('a', t0 + 2)], [true, true, true]);
  conferir('4ª bloqueada', lim.permitir('a', t0 + 3), false);
  conferir('outra conversa não é afetada', lim.permitir('b', t0 + 3), true);
  conferir('depois de 1 hora libera', lim.permitir('a', t0 + 60 * 60 * 1000 + 5), true);

  const sockFalso = {
    user: { id: '5527911112222:5@s.whatsapp.net', lid: '99999999999999:5@lid' },
    signalRepository: { lidMapping: { getPNForLID: async (lid) => (lid === '88888888888888@lid' ? '5527933334444@s.whatsapp.net' : null) } },
  };
  conferir('número direto', await numeroDoRemetente(sockFalso, { remoteJid: '5527955556666@s.whatsapp.net' }), '5527955556666');
  conferir('LID com remoteJidAlt', await numeroDoRemetente(sockFalso,
    { remoteJid: '77777777777777@lid', remoteJidAlt: '5527977778888@s.whatsapp.net' }), '5527977778888');
  conferir('LID pela tabela', await numeroDoRemetente(sockFalso, { remoteJid: '88888888888888@lid' }), '5527933334444');
  conferir('LID desconhecido', await numeroDoRemetente(sockFalso, { remoteJid: '11111111111111@lid' }), null);
  conferir('chat "Você" pelo número', ehChatComigoMesmo(sockFalso, '5527911112222@s.whatsapp.net'), true);
  conferir('chat "Você" pelo LID', ehChatComigoMesmo(sockFalso, '99999999999999@lid'), true);
  conferir('chat de cliente', ehChatComigoMesmo(sockFalso, '5527955556666@s.whatsapp.net'), false);

  process.exit(0);
}

testar();
