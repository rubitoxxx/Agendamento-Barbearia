/* ===================================================
   BARBERSHOP — Sistema de Agendamento (API Node.js)
=================================================== */

let servicoSelecionado = null;
let horarioSelecionado = null;
let agendamentos = [];
let servicosLista = [];

const HORARIOS_FALLBACK = [
  "08:00", "08:30", "09:00", "09:30", "10:00", "10:30",
  "11:00", "11:30", "13:00", "13:30", "14:00", "14:30",
  "15:00", "15:30", "16:00", "16:30", "17:00", "17:30",
  "18:00", "18:30",
];

document.addEventListener("DOMContentLoaded", async () => {
  configurarDataMinima();
  await carregarServicos();
  await carregarBarbeiros();
  configurarTelefones();
  configurarData();
  configurarFormulario();
  initUIEffects();
  atualizarUIAuth();
  if (isClienteLoggedIn()) {
    preencherDadosCliente();
    await renderizarAgendamentos();
  }
});

function showSection(id) {
  document.querySelectorAll(".section").forEach((s) => s.classList.remove("active"));
  document.querySelectorAll(".nav-btn").forEach((b) => b.classList.remove("active"));
  document.getElementById("section-" + id).classList.add("active");
  document.querySelectorAll(".nav-btn").forEach((b) => {
    if (b.getAttribute("onclick")?.includes("'" + id + "'")) b.classList.add("active");
  });
  if (id === "agendamentos") renderizarAgendamentos();
  if (id === "agendar") atualizarUIAuth();
}

function switchAuthTab(tab) {
  document.getElementById("tab-login").classList.toggle("active", tab === "login");
  document.getElementById("tab-registrar").classList.toggle("active", tab === "registrar");
  document.getElementById("form-login-wrap").style.display = tab === "login" ? "block" : "none";
  document.getElementById("form-registrar-wrap").style.display = tab === "registrar" ? "block" : "none";
}

function atualizarUIAuth() {
  const logado = isClienteLoggedIn();
  const btnAuth = document.getElementById("btn-auth-nav");
  const aviso = document.getElementById("aviso-login");
  const form = document.getElementById("form-agendamento");
  const btnSubmit = document.getElementById("btn-submit-agendar");

  if (logado) {
    btnAuth.textContent = "Sair";
    btnAuth.onclick = () => { logoutCliente(); };
    aviso.style.display = "none";
    form.style.opacity = "1";
    form.style.pointerEvents = "auto";
    btnSubmit.disabled = false;
  } else {
    btnAuth.textContent = "Entrar";
    btnAuth.onclick = () => showSection("auth");
    aviso.style.display = "block";
    form.style.opacity = "0.5";
    form.style.pointerEvents = "none";
    btnSubmit.disabled = true;
  }
}

function preencherDadosCliente() {
  document.getElementById("nome").value = getClienteNome();
  document.getElementById("telefone").value = getClienteTelefone();
}

function logoutCliente() {
  clearClienteToken();
  agendamentos = [];
  resetarFormulario();
  atualizarUIAuth();
  showSection("auth");
}

async function fazerLoginCliente() {
  const telefone = document.getElementById("login-telefone").value.trim();
  const senha = document.getElementById("login-senha").value;
  limparErro("login-tel");
  limparErro("login-senha");

  if (!telefone || !senha) {
    mostrarErro("login-senha", "Preencha telefone e senha.");
    return;
  }

  try {
    const data = await apiFetch("/clientes/login", {
      method: "POST",
      body: JSON.stringify({ telefone, senha }),
    });
    setClienteSession(data);
    preencherDadosCliente();
    atualizarUIAuth();
    showSection("agendar");
    await renderizarAgendamentos();
  } catch (e) {
    mostrarErro("login-senha", e.message || "Erro ao fazer login");
  }
}

async function fazerRegistroCliente() {
  const nome = document.getElementById("reg-nome").value.trim();
  const telefone = document.getElementById("reg-telefone").value.trim();
  const senha = document.getElementById("reg-senha").value;

  limparErro("reg-nome");
  limparErro("reg-tel");
  limparErro("reg-senha");

  if (nome.length < 3) { mostrarErro("reg-nome", "Informe seu nome completo."); return; }
  if (telefone.replace(/\D/g, "").length < 10) { mostrarErro("reg-tel", "Telefone inválido."); return; }
  if (senha.length < 4) { mostrarErro("reg-senha", "Senha deve ter pelo menos 4 caracteres."); return; }

  try {
    const data = await apiFetch("/clientes/registrar", {
      method: "POST",
      body: JSON.stringify({ nome, telefone, senha }),
    });
    setClienteSession(data);
    preencherDadosCliente();
    atualizarUIAuth();
    showSection("agendar");
  } catch (e) {
    mostrarErro("reg-senha", e.message || "Erro ao cadastrar");
  }
}

async function carregarServicos() {
  const data = await apiFetchSafe("/servicos");
  if (data) {
    servicosLista = data;
    renderizarServicosGrid();
  } else {
    servicosLista = [
      { nome: "Corte Cabelo", preco: "R$ 30,00", duracao: "40 min", icon: "💈" },
      { nome: "Barba", preco: "R$ 25,00", duracao: "20 min", icon: "🪒" },
      { nome: "Corte + Barba", preco: "R$ 50,00", duracao: "50 min", icon: "✂" },
    ];
    renderizarServicosGrid();
  }
}

async function carregarBarbeiros() {
  const data = await apiFetchSafe("/barbeiros");
  const select = document.getElementById("barbeiro");
  if (!select) return;
  const lista = data && data.length ? data : [
    { nome: "Carlos" }, { nome: "Rafael" }, { nome: "Diego" },
  ];
  select.innerHTML =
    '<option value="">Selecione um barbeiro</option>' +
    lista.map((b) => `<option value="${escaparHTML(b.nome)}">${escaparHTML(b.nome)}</option>`).join("") +
    '<option value="Qualquer">Sem preferência</option>';
}

function renderizarServicosGrid() {
  const grid = document.getElementById("servicos-grid");
  if (!grid) return;
  grid.innerHTML = servicosLista
    .map(
      (s) => `
    <div class="servico-card" data-servico="${escaparHTML(s.nome)}" data-preco="${escaparHTML(s.preco)}" data-duracao="${escaparHTML(s.duracao)}">
      <span class="servico-icon">${s.icon || "💈"}</span>
      <span class="servico-nome">${escaparHTML(s.nome)}</span>
      <span class="servico-info">${escaparHTML(s.preco)} · ${escaparHTML(s.duracao)}</span>
    </div>
  `,
    )
    .join("");
  configurarServicos();
  grid.classList.remove("animated");
  requestAnimationFrame(() =>
    requestAnimationFrame(() => grid.classList.add("animated")),
  );
}

function initUIEffects() {
  try {
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((e) => {
          if (e.isIntersecting) e.target.classList.add("in-view");
        });
      },
      { threshold: 0.12 },
    );
    document.querySelectorAll(".fade-up").forEach((el) => observer.observe(el));
  } catch { /* ignore */ }

  document.querySelectorAll(".btn-agendar").forEach((btn) => {
    btn.addEventListener("pointerdown", () => btn.classList.add("pressed"));
    btn.addEventListener("pointerup", () => btn.classList.remove("pressed"));
    btn.addEventListener("pointerleave", () => btn.classList.remove("pressed"));
  });

  const grid = document.getElementById("servicos-grid");
  if (grid) setTimeout(() => grid.classList.add("animated"), 80);
}

function configurarDataMinima() {
  const hoje = new Date();
  const ano = hoje.getFullYear();
  const mes = String(hoje.getMonth() + 1).padStart(2, "0");
  const dia = String(hoje.getDate()).padStart(2, "0");
  document.getElementById("data").min = `${ano}-${mes}-${dia}`;
}

function configurarServicos() {
  document.querySelectorAll(".servico-card").forEach((card) => {
    card.addEventListener("click", () => {
      document.querySelectorAll(".servico-card").forEach((c) => c.classList.remove("selected"));
      card.classList.add("selected");
      servicoSelecionado = {
        nome: card.dataset.servico,
        preco: card.dataset.preco,
        duracao: card.dataset.duracao,
      };
      limparErro("servico");
    });
  });
}

function configurarTelefones() {
  ["telefone", "login-telefone", "reg-telefone"].forEach((id) => {
    const tel = document.getElementById(id);
    if (!tel) return;
    tel.addEventListener("input", () => {
      tel.value = formatarTelefoneInput(tel.value);
    });
  });
}

function configurarData() {
  document.getElementById("data").addEventListener("change", gerarHorarios);
}

async function gerarHorarios() {
  const dataVal = document.getElementById("data").value;
  if (!dataVal) return;

  const grupoHorarios = document.getElementById("grupo-horarios");
  const grid = document.getElementById("horarios-grid");
  grid.innerHTML = '<p class="loading-horarios">Carregando horários...</p>';
  horarioSelecionado = null;
  grupoHorarios.style.display = "block";

  const slotsData = await apiFetchSafe(`/horarios?data=${dataVal}`);
  grid.innerHTML = "";

  if (slotsData && slotsData.slots) {
    if (slotsData.dia_fechado || slotsData.slots.length === 0) {
      grid.innerHTML = '<p class="sem-horarios">Nenhum horário disponível neste dia.</p>';
      return;
    }
    slotsData.slots.forEach((slot) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.textContent = slot.horario;
      btn.className = `horario-btn ${slot.status}`;
      btn.title = { livre: "Disponível", ocupado: "Horário ocupado", passado: "Horário já passou", bloqueado: "Horário bloqueado" }[slot.status] || "";

      if (slot.status === "livre") {
        btn.addEventListener("click", () => {
          document.querySelectorAll(".horario-btn").forEach((b) => b.classList.remove("selected"));
          btn.classList.add("selected");
          horarioSelecionado = slot.horario;
          limparErro("horario");
        });
      }
      grid.appendChild(btn);
    });
  } else {
    const horariosFiltrados = filtrarHorariosPassadosLocal(dataVal, HORARIOS_FALLBACK);
    horariosFiltrados.forEach((h) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.textContent = h;
      btn.className = "horario-btn livre";
      btn.addEventListener("click", () => {
        document.querySelectorAll(".horario-btn").forEach((b) => b.classList.remove("selected"));
        btn.classList.add("selected");
        horarioSelecionado = h;
        limparErro("horario");
      });
      grid.appendChild(btn);
    });
  }
}

function filtrarHorariosPassadosLocal(dataStr, horarios) {
  const hoje = new Date().toISOString().split("T")[0];
  if (dataStr !== hoje) return horarios;
  const agora = new Date();
  let minutos = agora.getHours() * 60 + agora.getMinutes();
  if (minutos % 30 !== 0) minutos = (Math.floor(minutos / 30) + 1) * 30;
  return horarios.filter((h) => {
    const [hh, mm] = h.split(":").map(Number);
    return hh * 60 + mm >= minutos;
  });
}

function configurarFormulario() {
  document.getElementById("form-agendamento").addEventListener("submit", async (e) => {
    e.preventDefault();
    if (!isClienteLoggedIn()) {
      showSection("auth");
      return;
    }
    if (validarFormulario()) await salvarAgendamento();
  });
}

function validarFormulario() {
  let valido = true;
  const nome = document.getElementById("nome").value.trim();
  const telefone = document.getElementById("telefone").value.trim();
  const barbeiro = document.getElementById("barbeiro").value;
  const data = document.getElementById("data").value;

  if (nome.length < 3) { mostrarErro("nome", "Informe seu nome completo."); valido = false; }
  else limparErro("nome");

  if (telefone.replace(/\D/g, "").length < 10) { mostrarErro("telefone", "Informe um telefone válido."); valido = false; }
  else limparErro("telefone");

  if (!servicoSelecionado) { mostrarErro("servico", "Selecione um serviço."); valido = false; }
  else limparErro("servico");

  if (!barbeiro) { mostrarErro("barbeiro", "Selecione um barbeiro."); valido = false; }
  else limparErro("barbeiro");

  if (!data) { mostrarErro("data", "Selecione uma data."); valido = false; }
  else limparErro("data");

  if (!horarioSelecionado) { mostrarErro("horario", "Selecione um horário disponível."); valido = false; }
  else limparErro("horario");

  return valido;
}

async function salvarAgendamento() {
  const payload = {
    nome: document.getElementById("nome").value.trim(),
    telefone: document.getElementById("telefone").value.trim(),
    servico: servicoSelecionado.nome,
    preco: servicoSelecionado.preco,
    duracao: servicoSelecionado.duracao,
    barbeiro: document.getElementById("barbeiro").value,
    data: document.getElementById("data").value,
    horario: horarioSelecionado,
  };

  try {
    await apiFetch("/agendamentos", {
      method: "POST",
      token: getClienteToken(),
      body: JSON.stringify(payload),
    });
    mostrarToastSucesso("Agendamento enviado! Aguarde a confirmação da barbearia.");
    resetarFormulario();
    preencherDadosCliente();
    await renderizarAgendamentos();
  } catch (err) {
    alert(err.message || "Erro ao agendar. Tente outro horário.");
    gerarHorarios();
  }
}

function mostrarToastSucesso(msg) {
  const toast = document.getElementById("toast-sucesso");
  document.getElementById("toast-msg").textContent = msg;
  toast.style.display = "flex";
  setTimeout(() => { toast.style.display = "none"; }, 5000);
}

function resetarFormulario() {
  document.getElementById("form-agendamento").reset();
  preencherDadosCliente();
  document.querySelectorAll(".servico-card").forEach((c) => c.classList.remove("selected"));
  document.getElementById("grupo-horarios").style.display = "none";
  document.getElementById("horarios-grid").innerHTML = "";
  servicoSelecionado = null;
  horarioSelecionado = null;
}

async function renderizarAgendamentos() {
  const lista = document.getElementById("lista-agendamentos");

  if (!isClienteLoggedIn()) {
    lista.innerHTML = `
      <div class="empty-state">
        <span>🔐</span>
        <p>Faça login para ver seus agendamentos.</p>
      </div>`;
    return;
  }

  try {
    agendamentos = await apiFetch("/agendamentos", { token: getClienteToken() });
  } catch {
    agendamentos = [];
  }

  const ordenados = [...agendamentos].sort((a, b) => {
    return new Date(`${a.data}T${a.horario}`) - new Date(`${b.data}T${b.horario}`);
  });

  if (ordenados.length === 0) {
    lista.innerHTML = `
      <div class="empty-state">
        <span>📅</span>
        <p>Nenhum agendamento ainda.<br>Faça seu primeiro agendamento!</p>
      </div>`;
    return;
  }

  lista.innerHTML = ordenados
    .map(
      (a) => `
    <div class="agendamento-item status-item-${a.status || "pendente"}" id="item-${a.id}">
      <div class="agendamento-info">
        <h4>${escaparHTML(a.nome)}</h4>
        <p>📞 ${escaparHTML(a.telefone)}</p>
        <p>💈 ${escaparHTML(a.barbeiro || "Qualquer")}</p>
        <span class="tag-servico">${escaparHTML(a.servico)} · ${escaparHTML(a.preco)}</span>
        <span class="tag-status status-${a.status || "pendente"}">${labelStatusCliente(a.status)}</span>
      </div>
      <div class="agendamento-data">
        <div class="data-hora">${escaparHTML(a.horario)}</div>
        <div class="data-dia">${formatarDataBR(a.data)}</div>
      </div>
      ${a.status !== "cancelado" && a.status !== "concluido" ? `<button class="btn-cancelar" onclick="cancelarAgendamento(${a.id})" title="Cancelar">✕</button>` : ""}
    </div>
  `,
    )
    .join("");
}

async function cancelarAgendamento(id) {
  if (!confirm("Deseja cancelar este agendamento?")) return;

  try {
    await apiFetch(`/agendamentos/${id}`, {
      method: "DELETE",
      token: getClienteToken(),
    });
  } catch (e) {
    alert(e.message || "Erro ao cancelar");
    return;
  }
  await renderizarAgendamentos();
  const dataAtual = document.getElementById("data").value;
  if (dataAtual) gerarHorarios();
}

function mostrarErro(campo, msg) {
  const el = document.getElementById("erro-" + campo);
  if (el) el.textContent = msg;
  const input = document.getElementById(campo);
  if (input) input.classList.add("invalid");
}

function limparErro(campo) {
  const el = document.getElementById("erro-" + campo);
  if (el) el.textContent = "";
  const input = document.getElementById(campo);
  if (input) input.classList.remove("invalid");
}

function formatarData(dataISO) {
  return formatarDataBR(dataISO);
}
