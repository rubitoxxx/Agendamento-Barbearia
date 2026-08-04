/**
 * Configuração da API — altere API_URL para o endereço do seu backend em produção
 */
const API_CONFIG = {
  BASE_URL: window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'
    ? 'http://localhost:5000/api'
    : 'https://agendamento-barbearia-backend-production.up.railway.app/api',
};

async function apiFetch(endpoint, options = {}) {
  const url = `${API_CONFIG.BASE_URL}${endpoint}`;
  const headers = { 'Content-Type': 'application/json', ...options.headers };

  if (options.token) {
    headers['Authorization'] = `Bearer ${options.token}`;
  }

  const res = await fetch(url, { ...options, headers });

  let data;
  try {
    data = await res.json();
  } catch {
    data = { error: 'Resposta inválida do servidor' };
  }

  if (!res.ok) {
    throw new Error(data.error || `Erro ${res.status}`);
  }

  return data;
}

let API_OFFLINE = false;

async function apiFetchSafe(endpoint, options = {}) {
  try {
    const data = await apiFetch(endpoint, options);
    API_OFFLINE = false;
    return data;
  } catch (err) {
    if (err.message.includes('Failed to fetch') || err.message.includes('NetworkError')) {
      API_OFFLINE = true;
      console.warn('API offline, usando localStorage:', err.message);
      return null;
    }
    throw err;
  }
}

/* ─── Admin ─── */
function getAdminToken() {
  return sessionStorage.getItem('admin_token');
}

function setAdminToken(token) {
  sessionStorage.setItem('admin_token', token);
}

function clearAdminToken() {
  sessionStorage.removeItem('admin_token');
}

function isAdminLoggedIn() {
  return !!getAdminToken();
}

/* ─── Cliente ─── */
function getClienteToken() {
  return localStorage.getItem('cliente_token');
}

function setClienteToken(token) {
  localStorage.setItem('cliente_token', token);
}

function clearClienteToken() {
  localStorage.removeItem('cliente_token');
  localStorage.removeItem('cliente_nome');
  localStorage.removeItem('cliente_telefone');
}

function isClienteLoggedIn() {
  return !!getClienteToken();
}

function getClienteNome() {
  return localStorage.getItem('cliente_nome') || '';
}

function getClienteTelefone() {
  return localStorage.getItem('cliente_telefone') || '';
}

function setClienteSession(data) {
  setClienteToken(data.token);
  localStorage.setItem('cliente_nome', data.nome);
  localStorage.setItem('cliente_telefone', data.telefone);
}

function formatarDataBR(dataISO) {
  if (!dataISO) return '';
  const [ano, mes, dia] = dataISO.split('T')[0].split('-');
  const d = new Date(Number(ano), Number(mes) - 1, Number(dia));
  return d.toLocaleDateString('pt-BR', { weekday: 'short', day: '2-digit', month: '2-digit', year: 'numeric' });
}

function formatarDataConfirmacao(dataISO) {
  if (!dataISO) return '';
  const dataStr = String(dataISO).split('T')[0];
  const [ano, mes, dia] = dataStr.split('-').map(Number);
  const d = new Date(ano, mes - 1, dia);
  const weekday = d.toLocaleDateString('pt-BR', { weekday: 'short' });
  const dataFmt = d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' });
  return `${weekday}, ${dataFmt}`;
}

function montarMensagemConfirmacao(ag) {
  const dataFmt = formatarDataConfirmacao(ag.data);
  return (
    `✅ Agendamento Confirmado!\n` +
    `Cliente: ${ag.nome}\n` +
    `Telefone: ${ag.telefone}\n` +
    `Serviço: ${ag.servico}\n` +
    `Barbeiro: ${ag.barbeiro || 'Qualquer'}\n` +
    `Data: ${dataFmt}\n` +
    `Horário: ${ag.horario}\n` +
    `Valor: ${ag.preco}`
  );
}

function montarWhatsAppUrl(telefone, ag) {
  const tel = String(telefone || ag.telefone || '').replace(/\D/g, '');
  const telComDDI = tel.startsWith('55') ? tel : `55${tel}`;
  const msg = encodeURIComponent(montarMensagemConfirmacao(ag));
  return `https://wa.me/${telComDDI}?text=${msg}`;
}

function abrirWhatsApp(url) {
  if (url) window.open(url, '_blank');
}

function escaparHTML(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function formatarTelefoneInput(v) {
  v = v.replace(/\D/g, '');
  if (v.length > 11) v = v.slice(0, 11);
  if (v.length > 6) return `(${v.slice(0, 2)}) ${v.slice(2, 7)}-${v.slice(7)}`;
  if (v.length > 2) return `(${v.slice(0, 2)}) ${v.slice(2)}`;
  if (v.length > 0) return `(${v}`;
  return v;
}

function labelStatusCliente(status) {
  return {
    pendente: 'Pendente',
    confirmado: 'Confirmado',
    cancelado: 'Cancelado',
    concluido: 'Concluído',
  }[status] || status;
}
