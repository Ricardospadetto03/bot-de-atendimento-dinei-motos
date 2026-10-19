import { initializeApp } from 'https://www.gstatic.com/firebasejs/13.0.0/firebase-app.js';
import {
  getAuth, GoogleAuthProvider, onAuthStateChanged, signInWithPopup, signInWithRedirect, signOut,
} from 'https://www.gstatic.com/firebasejs/13.0.0/firebase-auth.js';
import {
  getFirestore, collection, query, where, onSnapshot,
} from 'https://www.gstatic.com/firebasejs/13.0.0/firebase-firestore.js';
import { firebaseConfig } from './config.js';
import {
  NOMES_MESES, HORARIO_CHEGADA, PREVISAO_TERMINO,
  hojeEmBrasilia, montarData, somarDias, diaDaSemana, ehDiaDeRevisao, diasNoMes,
  dataPorExtenso, dataCurta, quandoRelativo, saudacao, formatarCelular, diasEntre,
} from './datas.js';

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

const provedorGoogle = new GoogleAuthProvider();
provedorGoogle.setCustomParameters({ prompt: 'select_account' });

const $ = (id) => document.getElementById(id);

const NOME_DONO = 'Dinei';

const vibrar = () => { if (navigator.vibrate) navigator.vibrate(8); };

function escapar(texto) {
  return String(texto ?? '').replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}

const hoje = hojeEmBrasilia();
const [anoHoje, mesHoje] = hoje.split('-').map(Number);

const estado = {
  agenda: new Map(),
  agendamentos: new Map(),
  carregou: { agenda: false, agendamentos: false },
  ano: anoHoje,
  mes: mesHoje,
  diaAberto: null,
};
let pararDeEscutar = [];

const CORES_AVATAR = ['#2563eb', '#f97316', '#16a34a', '#9333ea', '#db2777', '#0891b2', '#ca8a04'];
function corDoNome(nome) {
  let soma = 0;
  for (const letra of nome || '?') soma += letra.charCodeAt(0);
  return CORES_AVATAR[soma % CORES_AVATAR.length];
}

function situacaoDoDia(data) {
  const ficha = estado.agenda.get(data);
  if (ficha && ficha.bloqueado) return { tipo: 'bloqueado', motivo: ficha.motivo };
  if (ficha && ficha.agendamentoId) {
    return { tipo: 'revisao', ag: estado.agendamentos.get(ficha.agendamentoId) || null };
  }
  if (!ehDiaDeRevisao(data)) return { tipo: 'fechado' };
  if (data < hoje) return { tipo: 'passado' };
  return { tipo: 'livre' };
}

function proximasRevisoes() {
  return [...estado.agenda.entries()]
    .filter(([data, ficha]) => ficha.agendamentoId && data >= hoje)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([data, ficha]) => ({ data, ag: estado.agendamentos.get(ficha.agendamentoId) || null }));
}

function desenharResumo() {
  const proximas = proximasRevisoes();
  if (proximas.length > 0) {
    const { data, ag } = proximas[0];
    $('proxima-quando').textContent = `${quandoRelativo(data, hoje)[0].toUpperCase()}${quandoRelativo(data, hoje).slice(1)}`;
    $('proxima-quem').textContent = `${dataCurta(data)} · ${ag ? ag.cliente.split(' ')[0] : 'cliente'}`;
  } else {
    $('proxima-quando').textContent = 'Nenhuma';
    $('proxima-quem').textContent = 'Agenda livre 🎉';
  }

  let diasDeTrabalho = 0;
  let ocupados = 0;
  for (let dia = 1; dia <= diasNoMes(estado.ano, estado.mes); dia++) {
    const data = montarData(estado.ano, estado.mes, dia);
    if (!ehDiaDeRevisao(data)) continue;
    const s = situacaoDoDia(data);
    if (s.tipo === 'bloqueado') continue;
    diasDeTrabalho++;
    if (s.tipo === 'revisao') ocupados++;
  }
  $('anel-numero').textContent = ocupados;
  $('anel-legenda').textContent = `de ${diasDeTrabalho} dias em ${NOMES_MESES[estado.mes - 1]}`;
  const fracao = diasDeTrabalho ? ocupados / diasDeTrabalho : 0;
  $('anel-valor').style.strokeDashoffset = String(314.16 * (1 - fracao));
}

const ICONES = { revisao: '🏍️', bloqueado: '🚫', livre: '', fechado: '', passado: '' };

function desenharCalendario(direcao) {
  $('mes-nome').textContent = `${NOMES_MESES[estado.mes - 1]} ${estado.ano}`;
  $('botao-hoje').hidden = estado.ano === anoHoje && estado.mes === mesHoje;

  const grade = $('grade');
  const carregando = !(estado.carregou.agenda && estado.carregou.agendamentos);
  const primeiroDia = montarData(estado.ano, estado.mes, 1);
  const espacosAntes = diaDaSemana(primeiroDia);
  const total = diasNoMes(estado.ano, estado.mes);

  let html = '';
  for (let i = 0; i < espacosAntes; i++) html += '<span class="dia vazio"></span>';
  for (let dia = 1; dia <= total; dia++) {
    const data = montarData(estado.ano, estado.mes, dia);
    const atraso = `animation-delay:${Math.min(dia * 12, 360)}ms`;
    if (carregando) {
      html += `<span class="dia carregando" style="${atraso}"></span>`;
      continue;
    }
    const s = situacaoDoDia(data);
    const classes = ['dia', s.tipo === 'passado' ? 'fechado passado' : s.tipo];
    if (s.tipo === 'revisao' && data < hoje) classes.push('passado');
    if (data === hoje) classes.push('hoje');
    if (data === estado.diaAberto) classes.push('selecionado');
    html += `<button class="${classes.join(' ')}" data-dia="${data}" style="${atraso}"
      aria-label="${escapar(dataPorExtenso(data))}">${dia}<span class="icone">${ICONES[s.tipo]}</span></button>`;
  }
  grade.innerHTML = html;

  grade.classList.remove('vindo-da-direita', 'vindo-da-esquerda');
  if (direcao) {
    void grade.offsetWidth;
    grade.classList.add(direcao > 0 ? 'vindo-da-direita' : 'vindo-da-esquerda');
  }
}

function trocarMes(passo) {
  vibrar();
  estado.mes += passo;
  if (estado.mes > 12) { estado.mes = 1; estado.ano++; }
  if (estado.mes < 1) { estado.mes = 12; estado.ano--; }
  desenharCalendario(passo);
  desenharResumo();
}

function desenharLista() {
  const proximas = proximasRevisoes().slice(0, 8);
  if (proximas.length === 0) {
    $('lista-proximas').innerHTML =
      '<div class="vazio-lista"><span class="grande">🗓️</span>Nenhuma revisão marcada por enquanto.</div>';
    return;
  }
  $('lista-proximas').innerHTML = proximas.map(({ data, ag }, i) => {
    const nome = ag ? ag.cliente : 'Cliente';
    const moto = ag ? `${ag.modeloMoto} ${ag.anoMoto}` : '';
    const faltam = diasEntre(hoje, data);
    return `
      <button class="item" data-dia="${data}" style="animation-delay:${i * 60}ms">
        <span class="avatar" style="background:${corDoNome(nome)}">${escapar(nome.charAt(0).toUpperCase())}</span>
        <span class="item-texto">
          <span class="item-nome">${escapar(nome)}</span>
          <span class="item-sub">${escapar(dataCurta(data))} · ${HORARIO_CHEGADA}${moto ? ` · ${escapar(moto)}` : ''}</span>
        </span>
        <span class="selo ${faltam <= 1 ? 'urgente' : ''}">${escapar(quandoRelativo(data, hoje))}</span>
      </button>`;
  }).join('');
}

function desenharTudo(direcao) {
  desenharResumo();
  desenharCalendario(direcao);
  desenharLista();
  if (estado.diaAberto) preencherFolha(estado.diaAberto);
}

function linha(emoji, rotulo, valor) {
  return `<div class="linha-ficha"><span class="emoji">${emoji}</span>
    <span><span class="rotulo">${rotulo}</span><span class="valor">${escapar(valor)}</span></span></div>`;
}

function preencherFolha(data) {
  const s = situacaoDoDia(data);
  const tipoVisual = s.tipo === 'passado' ? 'fechado' : s.tipo;
  const quando = data === hoje ? 'Hoje' : quandoRelativo(data, hoje);
  const estados = {
    revisao: '🏍️ Revisão marcada',
    livre: '✅ Dia livre',
    bloqueado: '🚫 Dia bloqueado',
    fechado: 'Sem revisões neste dia',
  };
  const icones = { revisao: '🏍️', livre: '✅', bloqueado: '🚫', fechado: '😴' };
  const diaMes = `${data.slice(8, 10)}/${data.slice(5, 7)}`;

  let corpo = '';
  if (s.tipo === 'revisao' && s.ag) {
    const ag = s.ag;
    corpo = `
      <div class="ficha">
        ${linha('👤', 'Cliente', ag.cliente)}
        ${linha('🏍️', 'Moto', `${ag.modeloMoto} ${ag.anoMoto}`)}
        ${linha('📱', 'Celular', formatarCelular(ag.telefone))}
        ${linha('🕖', 'Horário', `Chegada às ${HORARIO_CHEGADA} · pronta por volta das ${PREVISAO_TERMINO}`)}
        ${linha('📝', 'Agendado por', ag.origem === 'dinei' ? 'Você (pelo menu do dono)' : 'O próprio cliente (pelo bot)')}
      </div>
      <div class="botoes-acao">
        <a class="botao-acao whatsapp" href="https://wa.me/${encodeURIComponent(ag.telefone)}" target="_blank" rel="noopener">
          💬 Chamar no WhatsApp</a>
        <a class="botao-acao ligar" href="tel:+${encodeURIComponent(ag.telefone)}">📞 Ligar para o cliente</a>
      </div>`;
  } else if (s.tipo === 'revisao') {
    corpo = '<p class="explicacao">Este dia está ocupado, mas os dados do cliente ainda estão carregando.</p>';
  } else if (s.tipo === 'livre') {
    corpo = `<p class="explicacao">Nenhuma revisão marcada. Para agendar alguém neste dia, mande no seu menu do WhatsApp:
      <code>agendar ${diaMes}</code></p>`;
  } else if (s.tipo === 'bloqueado') {
    corpo = `${s.motivo ? `<div class="ficha">${linha('📌', 'Motivo', s.motivo)}</div>` : ''}
      <p class="explicacao">Os clientes não conseguem agendar neste dia. Para liberar, mande no seu menu do WhatsApp:
      <code>desbloquear ${diaMes}</code></p>`;
  } else {
    corpo = `<p class="explicacao">${data < hoje && ehDiaDeRevisao(data)
      ? 'Este dia já passou e não teve revisão.'
      : 'A oficina não faz revisões aos sábados, domingos e segundas.'}</p>`;
  }

  $('folha-conteudo').innerHTML = `
    <div class="folha-topo">
      <div class="folha-icone ${tipoVisual}">${icones[tipoVisual]}</div>
      <div>
        <h2 class="folha-data">${escapar(dataPorExtenso(data))}</h2>
        <p class="folha-estado ${tipoVisual}">${estados[tipoVisual]} · ${escapar(quando)}</p>
      </div>
    </div>
    ${corpo}`;
}

function abrirFolha(data) {
  vibrar();
  estado.diaAberto = data;
  preencherFolha(data);
  $('fundo-folha').hidden = false;
  $('folha').hidden = false;
  desenharCalendario();
}

function fecharFolha() {
  estado.diaAberto = null;
  $('fundo-folha').hidden = true;
  $('folha').hidden = true;
  desenharCalendario();
}

$('mes-anterior').addEventListener('click', () => trocarMes(-1));
$('mes-seguinte').addEventListener('click', () => trocarMes(1));
$('botao-hoje').addEventListener('click', () => {
  const passo = (anoHoje - estado.ano) * 12 + (mesHoje - estado.mes);
  estado.ano = anoHoje;
  estado.mes = mesHoje;
  vibrar();
  desenharCalendario(Math.sign(passo));
  desenharResumo();
});

document.addEventListener('click', (evento) => {
  const alvo = evento.target.closest('[data-dia]');
  if (alvo) abrirFolha(alvo.dataset.dia);
});
$('cartao-proxima').addEventListener('click', () => {
  const [primeira] = proximasRevisoes();
  if (primeira) abrirFolha(primeira.data);
});
$('fundo-folha').addEventListener('click', fecharFolha);
$('fechar-folha').addEventListener('click', fecharFolha);
document.addEventListener('keydown', (e) => { if (e.key === 'Escape') fecharFolha(); });

let inicioToque = null;
$('grade').addEventListener('touchstart', (e) => { inicioToque = e.touches[0].clientX; }, { passive: true });
$('grade').addEventListener('touchend', (e) => {
  if (inicioToque === null) return;
  const distancia = e.changedTouches[0].clientX - inicioToque;
  inicioToque = null;
  if (Math.abs(distancia) > 60) trocarMes(distancia < 0 ? 1 : -1);
});

function marcarConexao(ok) {
  $('ao-vivo').classList.toggle('sem-conexao', !ok);
  $('ao-vivo').querySelector('.ao-vivo-texto').textContent = ok ? 'Ao vivo' : 'Sem conexão';
}

function erroDoBanco(erro, usuario) {
  console.error(erro);
  if (erro.code === 'permission-denied') {
    $('email-sem-acesso').textContent = usuario.email || 'outra conta';
    mostrarTela('sem-acesso');
    return;
  }
  marcarConexao(false);
}

function comecarAEscutar(usuario) {
  const pararAgenda = onSnapshot(collection(db, 'agenda'), (resultado) => {
    estado.agenda = new Map(resultado.docs.map((doc) => [doc.id, doc.data()]));
    estado.carregou.agenda = true;
    marcarConexao(true);
    desenharTudo();
  }, (erro) => erroDoBanco(erro, usuario));

  const confirmados = query(collection(db, 'agendamentos'), where('status', '==', 'confirmado'));
  const pararAgendamentos = onSnapshot(confirmados, (resultado) => {
    estado.agendamentos = new Map(resultado.docs.map((doc) => [doc.id, doc.data()]));
    estado.carregou.agendamentos = true;
    marcarConexao(true);
    desenharTudo();
  }, (erro) => erroDoBanco(erro, usuario));

  pararDeEscutar = [pararAgenda, pararAgendamentos];
}

function mostrarTela(nome) {
  for (const tela of ['carregando', 'login', 'sem-acesso', 'agenda']) {
    $(`tela-${tela}`).hidden = tela !== nome;
  }
}

function mostrarErroLogin(mensagem) {
  $('erro-login').textContent = mensagem;
  $('erro-login').hidden = false;
  if (navigator.vibrate) navigator.vibrate([30, 40, 30]);
}

$('botao-entrar').addEventListener('click', async () => {
  vibrar();
  $('erro-login').hidden = true;
  try {
    await signInWithPopup(auth, provedorGoogle);
  } catch (erro) {
    if (erro.code === 'auth/popup-blocked' || erro.code === 'auth/operation-not-supported-in-this-environment') {
      await signInWithRedirect(auth, provedorGoogle);
      return;
    }
    if (erro.code === 'auth/popup-closed-by-user' || erro.code === 'auth/cancelled-popup-request') return;
    console.error(erro.code);
    const mensagens = {
      'auth/network-request-failed': 'Sem internet. Confira a conexão e tente de novo.',
      'auth/admin-restricted-operation': 'Esta conta não tem permissão para entrar. Use a conta Google da oficina.',
      'auth/too-many-requests': 'Muitas tentativas seguidas. Espere alguns minutos e tente de novo.',
    };
    mostrarErroLogin(mensagens[erro.code] || 'Não consegui entrar. Tente de novo.');
  }
});

function sair() {
  pararDeEscutar.forEach((parar) => parar());
  pararDeEscutar = [];
  signOut(auth);
}
$('botao-sair').addEventListener('click', sair);
document.querySelector('.botao-sair-grande').addEventListener('click', sair);

setInterval(() => {
  if (hojeEmBrasilia() !== hoje) {
    location.reload();
    return;
  }
  $('saudacao').textContent = saudacao();
}, 60 * 1000);

onAuthStateChanged(auth, (usuario) => {
  if (!usuario) {
    mostrarTela('login');
    return;
  }
  $('saudacao').textContent = saudacao();
  $('nome-usuario').textContent = NOME_DONO;
  $('data-de-hoje').textContent = dataPorExtenso(hoje);
  mostrarTela('agenda');
  desenharTudo();
  comecarAEscutar(usuario);
});
