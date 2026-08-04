/* ===================================================
   BACKES BARBEARIA ADMIN — Painel conectado à API
=================================================== */

const HORARIOS_BASE = [
  "08:00",
  "08:30",
  "09:00",
  "09:30",
  "10:00",
  "10:30",
  "11:00",
  "11:30",
  "13:00",
  "13:30",
  "14:00",
  "14:30",
  "15:00",
  "15:30",
  "16:00",
  "16:30",
  "17:00",
  "17:30",
  "18:00",
  "18:30",
];
const DIAS_NOMES = [
  "Domingo",
  "Segunda",
  "Terça",
  "Quarta",
  "Quinta",
  "Sexta",
  "Sábado",
];

let configHorarios = { semana: {}, horarios_extras: {}, dias_bloqueados: [] };
let agendamentos = [];

document.addEventListener("DOMContentLoaded", async () => {
  if (!isAdminLoggedIn()) {
    window.location.href = "login.html";
    return;
  }

  const hoje = new Date().toISOString().split("T")[0];
  document.getElementById("filtro-data").value = hoje;
  document.getElementById("data-config").value = hoje;

  await carregarConfig();
  await renderizarAgenda();
  renderizarConfigSemanal();
  initAdminEffects();
});

function logout() {
  clearAdminToken();
  window.location.href = "login.html";
}

function switchTab(tab) {
  document
    .querySelectorAll(".nav-item")
    .forEach((n) => n.classList.remove("active"));
  document
    .querySelectorAll(".admin-view")
    .forEach((v) => (v.style.display = "none"));

  const map = { agenda: 1, horarios: 2, "config-geral": 3, servicos: 4, clientes: 5 };
  document
    .querySelector(`.nav-item:nth-child(${map[tab]})`)
    ?.classList.add("active");
  document.getElementById(`view-${tab}`).style.display = "block";

  if (tab === "agenda") renderizarAgenda();
  if (tab === "config-geral") renderizarConfigSemanal();
  if (tab === "servicos") { renderizarServicosAdmin(); renderizarBarbeirosAdmin(); }
  if (tab === "clientes") renderizarClientesAdmin();
}

async function carregarConfig() {
  try {
    configHorarios = await apiFetch("/admin/horarios/config", {
      token: getAdminToken(),
    });
  } catch {
    configHorarios = JSON.parse(
      localStorage.getItem("barbershop_horarios"),
    ) || {
      semana: {},
      horarios_extras: {},
      dias_bloqueados: [],
    };
  }
}

// ─── AGENDA ─────────────────────────────────────────
async function renderizarAgenda() {
  const data = document.getElementById("filtro-data").value;
  const busca = document.getElementById("busca-agenda")?.value?.trim() || "";
  const container = document.getElementById("lista-agenda");

  try {
    let url = `/admin/agendamentos?data=${encodeURIComponent(data)}`;
    if (busca) url += `&busca=${encodeURIComponent(busca)}`;
    agendamentos = await apiFetch(url, { token: getAdminToken() });
  } catch {
    agendamentos = JSON.parse(
      localStorage.getItem("barbershop_agendamentos") || "[]",
    ).filter((a) => a.data === data);
  }

  const filtrados = [...agendamentos].sort((a, b) =>
    a.horario.localeCompare(b.horario),
  );

  if (filtrados.length === 0) {
    container.innerHTML =
      '<div class="empty-state"><p>Nenhum agendamento para este dia.</p></div>';
    return;
  }
  container.innerHTML = filtrados
    .map(
      (a) => `
    <div class="item-agenda ${a.status === "pendente" ? "pendente" : ""} ${a.status === "concluido" ? "concluido" : ""} ${a.status === "cancelado" ? "cancelado" : ""}">
      <div class="item-info">
        <h4>${escaparHTML(a.nome)} ${a.status === "pendente" ? '<span class="badge-novo">Novo</span>' : ""}</h4>
        <p>📞 ${escaparHTML(a.telefone)}</p>
        <p>💈 ${escaparHTML(a.servico)} · ${escaparHTML(a.preco)}</p>
        <p class="status-badge status-${a.status || "confirmado"}">${labelStatus(a.status)}</p>
        <div class="item-acoes">
          ${a.status === "pendente" ? `<button class="btn-acao btn-whatsapp btn-mini" onclick="confirmarEEnviarWhatsApp(${a.id})">📱 Confirmar e enviar WhatsApp</button>` : ""}
          ${a.status !== "concluido" && a.status !== "cancelado" ? `<button class="btn-acao btn-mini" onclick="marcarConcluido(${a.id})">✓ Concluir</button>` : ""}
          ${a.status !== "cancelado" ? `<button class="btn-acao btn-danger btn-mini" onclick="cancelarAgendamento(${a.id}, true)">Cancelar e liberar horário</button>` : ""}
          ${a.status !== "cancelado" ? `<button class="btn-acao btn-danger btn-mini" onclick="cancelarAgendamento(${a.id}, false)">Cancelar e manter bloqueado</button>` : ""}
          ${a.status === "cancelado" ? `<button class="btn-acao btn-info btn-mini" onclick="liberarHorario(${a.id})">Liberar este horário</button>` : ""}
          <button class="btn-acao btn-info btn-mini" onclick="abrirEditar(${a.id})">Editar</button>
        </div>
      </div>
      <div class="item-hora">${escaparHTML(a.horario)}</div>
    </div>
  `,
    )
    .join("");
  // staggered reveal
  Array.from(container.querySelectorAll(".item-agenda")).forEach((it, i) =>
    setTimeout(() => it.classList.add("in-view"), i * 60),
  );
}

function labelStatus(s) {
  return (
    {
      pendente: "Novo",
      confirmado: "Confirmado",
      cancelado: "Cancelado",
      concluido: "Concluído",
    }[s] || s
  );
}

async function confirmarEEnviarWhatsApp(id) {
  const a = agendamentos.find((x) => x.id === id);
  if (!a) return;

  try {
    const result = await apiFetch(`/admin/agendamentos/${id}/status`, {
      method: "PATCH",
      token: getAdminToken(),
      body: JSON.stringify({ status: "confirmado" }),
    });

    const url = result.whatsapp_url || montarWhatsAppUrl(a.telefone, { ...a, status: "confirmado" });
    abrirWhatsApp(url);
    renderizarAgenda();
  } catch (e) {
    alert(e.message || "Erro ao confirmar agendamento");
  }
}

async function cancelarAgendamento(id, liberar) {
  const msg = liberar
    ? "Cancelar este agendamento e liberar o horário para outra pessoa marcar?"
    : "Cancelar este agendamento e manter o horário bloqueado?";
  if (!confirm(msg)) return;
  try {
    if (liberar) {
      await apiFetch(`/admin/agendamentos/${id}`, {
        method: "DELETE",
        token: getAdminToken(),
      });
    } else {
      await apiFetch(`/admin/agendamentos/${id}/status`, {
        method: "PATCH",
        token: getAdminToken(),
        body: JSON.stringify({ status: "cancelado" }),
      });
    }
  } catch {
    agendamentos = agendamentos.filter((a) => a.id !== id);
    localStorage.setItem(
      "barbershop_agendamentos",
      JSON.stringify(agendamentos),
    );
  }
  renderizarAgenda();
}

async function liberarHorario(id) {
  if (!confirm("Liberar este horário para outra pessoa marcar?")) return;
  try {
    await apiFetch(`/admin/agendamentos/${id}`, {
      method: "DELETE",
      token: getAdminToken(),
    });
    renderizarAgenda();
  } catch (e) {
    alert(e.message || "Erro ao liberar horário.");
  }
}

async function marcarConcluido(id) {
  try {
    await apiFetch(`/admin/agendamentos/${id}/status`, {
      method: "PATCH",
      token: getAdminToken(),
      body: JSON.stringify({ status: "concluido" }),
    });
  } catch {
    /* offline */
  }
  renderizarAgenda();
}

function abrirEditar(id) {
  const a = agendamentos.find((x) => x.id === id);
  if (!a) return;
  document.getElementById("edit-id").value = a.id;
  document.getElementById("edit-nome").value = a.nome;
  document.getElementById("edit-tel").value = a.telefone;
  document.getElementById("edit-data").value = a.data?.split("T")[0] || a.data;
  document.getElementById("edit-hora").value = a.horario;
  document.getElementById("edit-servico").value = a.servico;
  document.getElementById("modal-editar").style.display = "flex";
}

function fecharModalEditar() {
  document.getElementById("modal-editar").style.display = "none";
}

async function salvarEdicao() {
  const id = document.getElementById("edit-id").value;
  const payload = {
    nome: document.getElementById("edit-nome").value,
    telefone: document.getElementById("edit-tel").value,
    data: document.getElementById("edit-data").value,
    horario: document.getElementById("edit-hora").value,
    servico: document.getElementById("edit-servico").value,
    preco: agendamentos.find((a) => a.id == id)?.preco || "—",
    status: "confirmado",
  };
  if (!payload.nome || !payload.telefone || !payload.data || !payload.horario) {
    return alert("Preencha os campos obrigatórios.");
  }
  try {
    await apiFetch(`/admin/agendamentos/${id}`, {
      method: "PUT",
      token: getAdminToken(),
      body: JSON.stringify(payload),
    });
  } catch (e) {
    alert(e.message);
    return;
  }
  fecharModalEditar();
  renderizarAgenda();
}

function abrirModalEncaixe() {
  document.getElementById("enc-data").value =
    document.getElementById("filtro-data").value;
  document.getElementById("modal-encaixe").style.display = "flex";
}

function fecharModal() {
  document.getElementById("modal-encaixe").style.display = "none";
}

async function salvarEncaixe() {
  const payload = {
    nome: document.getElementById("enc-nome").value,
    telefone: document.getElementById("enc-tel").value,
    data: document.getElementById("enc-data").value,
    horario: document.getElementById("enc-hora").value,
    servico: "Encaixe",
    preco: "—",
  };
  if (!payload.nome || !payload.horario || !payload.data) {
    return alert("Preencha os campos obrigatórios.");
  }
  try {
    await apiFetch("/admin/agendamentos", {
      method: "POST",
      token: getAdminToken(),
      body: JSON.stringify(payload),
    });
  } catch (e) {
    alert(e.message);
    return;
  }
  fecharModal();
  renderizarAgenda();
}

// ─── CONFIG SEMANAL ─────────────────────────────────
function renderizarConfigSemanal() {
  const container = document.getElementById("config-semanal-dias");
  container.innerHTML = "";

  DIAS_NOMES.forEach((nome, i) => {
    const diaConfig = configHorarios.semana?.[String(i)] ||
      configHorarios.semana?.[i] || { aberto: false, horarios: [] };
    const div = document.createElement("div");
    div.className = "card-admin";
    div.style.marginBottom = "15px";
    div.innerHTML = `
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;">
        <strong>${nome}</strong>
        <label><input type="checkbox" class="dia-aberto" data-dia="${i}" ${diaConfig.aberto ? "checked" : ""}> Aberto</label>
      </div>
      <div class="horarios-grid" id="grid-semana-${i}" style="display:${diaConfig.aberto ? "grid" : "none"}">
        ${HORARIOS_BASE.map(
          (h) => `
          <div class="horario-btn ${diaConfig.horarios?.includes(h) ? "ativo" : ""}" onclick="this.classList.toggle('ativo')">${h}</div>
        `,
        ).join("")}
      </div>`;
    div.querySelector(".dia-aberto").onchange = (e) => {
      div.querySelector(".horarios-grid").style.display = e.target.checked
        ? "grid"
        : "none";
    };
    container.appendChild(div);
  });
}

async function salvarConfigSemanal() {
  DIAS_NOMES.forEach((_, i) => {
    const card = document.querySelectorAll("#config-semanal-dias .card-admin")[
      i
    ];
    const aberto = card.querySelector(".dia-aberto").checked;
    const horarios = Array.from(
      card.querySelectorAll(".horario-btn.ativo"),
    ).map((b) => b.textContent);
    if (!configHorarios.semana) configHorarios.semana = {};
    configHorarios.semana[String(i)] = { aberto, horarios };
  });

  try {
    await apiFetch("/admin/horarios/config", {
      method: "PUT",
      token: getAdminToken(),
      body: JSON.stringify(configHorarios),
    });
    alert("Configuração semanal salva!");
  } catch {
    localStorage.setItem("barbershop_horarios", JSON.stringify(configHorarios));
    alert("Salvo localmente (API offline).");
  }
}

// ─── CONFIG DIÁRIA ──────────────────────────────────
function carregarConfigHorarios() {
  const data = document.getElementById("data-config").value;
  if (!data) return;

  const container = document.getElementById("config-horarios-container");
  const grid = document.getElementById("grid-admin-horarios");
  const checkBloqueio = document.getElementById("bloquear-dia");

  container.style.display = "block";
  grid.innerHTML = "";

  const dataObj = new Date(data + "T00:00:00");
  const diaSemana = String(dataObj.getDay());
  const configSemanal = configHorarios.semana?.[diaSemana] || {
    aberto: true,
    horarios: [],
  };
  const horariosData =
    configHorarios.horarios_extras?.[data] ||
    (configSemanal.aberto ? configSemanal.horarios : []);

  checkBloqueio.checked =
    configHorarios.dias_bloqueados?.includes(data) || !configSemanal.aberto;

  HORARIOS_BASE.forEach((h) => {
    const btn = document.createElement("div");
    btn.className = "horario-btn" + (horariosData.includes(h) ? " ativo" : "");
    btn.textContent = h;
    btn.onclick = () => btn.classList.toggle("ativo");
    grid.appendChild(btn);
  });
}

async function salvarConfigHorarios() {
  const data = document.getElementById("data-config").value;
  const bloqueado = document.getElementById("bloquear-dia").checked;
  const ativos = Array.from(
    document.querySelectorAll("#grid-admin-horarios .horario-btn.ativo"),
  ).map((b) => b.textContent);

  if (!configHorarios.dias_bloqueados) configHorarios.dias_bloqueados = [];
  if (!configHorarios.horarios_extras) configHorarios.horarios_extras = {};

  if (bloqueado) {
    if (!configHorarios.dias_bloqueados.includes(data))
      configHorarios.dias_bloqueados.push(data);
    delete configHorarios.horarios_extras[data];
  } else {
    configHorarios.dias_bloqueados = configHorarios.dias_bloqueados.filter(
      (d) => d !== data,
    );
    configHorarios.horarios_extras[data] = ativos;
  }

  try {
    await apiFetch("/admin/horarios/config", {
      method: "PUT",
      token: getAdminToken(),
      body: JSON.stringify(configHorarios),
    });
    alert("Configuração diária salva!");
  } catch {
    localStorage.setItem("barbershop_horarios", JSON.stringify(configHorarios));
    alert("Salvo localmente (API offline).");
  }
}

// ─── BARBEIROS ──────────────────────────────────────
async function adicionarBarbeiro() {
  const nome = document.getElementById("novo-barbeiro-nome").value.trim();
  if (!nome) {
    alert("Digite o nome do barbeiro.");
    return;
  }
  try {
    await apiFetch("/admin/barbeiros", {
      method: "POST",
      token: getAdminToken(),
      body: JSON.stringify({ nome }),
    });
    document.getElementById("novo-barbeiro-nome").value = "";
    renderizarBarbeirosAdmin();
  } catch (e) {
    alert(e.message || "Erro ao adicionar barbeiro.");
  }
}

async function renderizarBarbeirosAdmin() {
  const container = document.getElementById("lista-barbeiros-admin");
  try {
    const barbeiros = await apiFetch("/admin/barbeiros", {
      token: getAdminToken(),
    });
    container.innerHTML = barbeiros
      .map(
        (b) => `
      <div class="card-admin" style="margin-bottom:12px;display:flex;justify-content:space-between;align-items:center;">
        <strong>${escaparHTML(b.nome)}</strong>
        <button class="btn-acao btn-danger btn-mini" style="width:auto;" onclick="removerBarbeiro(${b.id})">Remover</button>
      </div>
    `,
      )
      .join("");
  } catch {
    container.innerHTML = "<p>Conecte a API para editar barbeiros.</p>";
  }
}

async function removerBarbeiro(id) {
  if (!confirm("Remover este barbeiro?")) return;
  try {
    await apiFetch(`/admin/barbeiros/${id}`, {
      method: "DELETE",
      token: getAdminToken(),
    });
    renderizarBarbeirosAdmin();
  } catch (e) {
    alert(e.message || "Erro ao remover barbeiro.");
  }
}

// ─── SERVIÇOS ───────────────────────────────────────
async function adicionarServico() {
  const nome = document.getElementById("novo-servico-nome").value.trim();
  const preco = document.getElementById("novo-servico-preco").value.trim();
  const duracao = document.getElementById("novo-servico-duracao").value.trim();
  if (!nome || !preco || !duracao) {
    alert("Preencha nome, preço e duração.");
    return;
  }
  try {
    await apiFetch("/admin/servicos", {
      method: "POST",
      token: getAdminToken(),
      body: JSON.stringify({ nome, preco, duracao }),
    });
    document.getElementById("novo-servico-nome").value = "";
    document.getElementById("novo-servico-preco").value = "";
    document.getElementById("novo-servico-duracao").value = "";
    renderizarServicosAdmin();
  } catch (e) {
    alert(e.message || "Erro ao adicionar serviço.");
  }
}

async function renderizarServicosAdmin() {
  const container = document.getElementById("lista-servicos-admin");
  try {
    const servicos = await apiFetch("/admin/servicos", {
      token: getAdminToken(),
    });
    container.innerHTML = servicos
      .map(
        (s) => `
      <div class="card-admin" style="margin-bottom:12px;">
        <strong>${escaparHTML(s.nome)}</strong>
        <div class="form-group"><label>Preço</label><input type="text" id="preco-${s.id}" value="${escaparHTML(s.preco)}"></div>
        <div class="form-group"><label>Duração</label><input type="text" id="duracao-${s.id}" value="${escaparHTML(s.duracao)}"></div>
        <button class="btn-acao btn-mini" onclick="salvarServico(${s.id})">Salvar</button>
        <button class="btn-acao btn-danger btn-mini" onclick="removerServico(${s.id})">Remover</button>
      </div>
    `,
      )
      .join("");
    // animate service cards
    Array.from(container.querySelectorAll(".card-admin")).forEach((c, i) =>
      setTimeout(() => c.classList.add("in-view"), i * 60),
    );
  } catch {
    container.innerHTML = "<p>Conecte a API para editar serviços.</p>";
  }
}

/* Initialize admin UI effects: button micro-interactions and fade-up observer */
function initAdminEffects() {
  // pointer micro-interactions
  document.querySelectorAll(".btn-acao, .btn-mini").forEach((b) => {
    b.addEventListener("pointerdown", () => b.classList.add("pressed"));
    b.addEventListener("pointerup", () => b.classList.remove("pressed"));
    b.addEventListener("pointerleave", () => b.classList.remove("pressed"));
  });

  document.querySelectorAll(".nav-item").forEach((n) => {
    n.addEventListener("pointerdown", () => n.classList.add("pressed"));
    n.addEventListener("pointerup", () => n.classList.remove("pressed"));
    n.addEventListener("pointerleave", () => n.classList.remove("pressed"));
  });

  // simple intersection observer for fade-up utilities
  try {
    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((en) => {
          if (en.isIntersecting) en.target.classList.add("in-view");
        });
      },
      { threshold: 0.12 },
    );
    document.querySelectorAll(".fade-up").forEach((el) => io.observe(el));
  } catch (e) {
    /* ignore */
  }
}

async function salvarServico(id) {
  const preco = document.getElementById(`preco-${id}`).value;
  const duracao = document.getElementById(`duracao-${id}`).value;
  try {
    const servicos = await apiFetch("/admin/servicos", {
      token: getAdminToken(),
    });
    const s = servicos.find((x) => x.id === id);
    await apiFetch(`/admin/servicos/${id}`, {
      method: "PUT",
      token: getAdminToken(),
      body: JSON.stringify({ ...s, preco, duracao }),
    });
    alert("Serviço atualizado!");
  } catch (e) {
    alert(e.message);
  }
}

async function removerServico(id) {
  if (!confirm("Remover este serviço?")) return;
  try {
    await apiFetch(`/admin/servicos/${id}`, {
      method: "DELETE",
      token: getAdminToken(),
    });
    renderizarServicosAdmin();
  } catch (e) {
    alert(e.message || "Erro ao remover serviço.");
  }
}

// ─── CLIENTES (login do site) ──────────────────────
async function renderizarClientesAdmin() {
  const container = document.getElementById("lista-clientes-admin");
  const busca = document.getElementById("busca-clientes").value.trim();
  container.innerHTML = "<p>Carregando...</p>";
  try {
    const qs = busca ? `?busca=${encodeURIComponent(busca)}` : "";
    const clientes = await apiFetch(`/admin/clientes${qs}`, {
      token: getAdminToken(),
    });

    if (!clientes.length) {
      container.innerHTML = "<p>Nenhum cliente encontrado.</p>";
      return;
    }

    container.innerHTML = clientes
      .map(
        (c) => `
      <div class="card-admin" style="margin-bottom:12px;display:flex;justify-content:space-between;align-items:center;gap:10px;">
        <div>
          <strong>${escaparHTML(c.nome)}</strong>
          <div style="font-size:12px;color:#666;">${escaparHTML(formatarTelefoneInput(c.telefone))}</div>
        </div>
        <button class="btn-acao btn-mini" style="width:auto;" onclick="abrirModalSenha(${c.id}, '${escaparHTML(c.nome)}', '${escaparHTML(formatarTelefoneInput(c.telefone))}')">
          <i class="fa-solid fa-key"></i> Redefinir senha
        </button>
      </div>
    `,
      )
      .join("");
  } catch (e) {
    container.innerHTML = "<p>Erro ao carregar clientes.</p>";
  }
}

function abrirModalSenha(id, nome, telefone) {
  document.getElementById("senha-cliente-id").value = id;
  document.getElementById("senha-cliente-info").textContent = `${nome} — ${telefone}`;
  document.getElementById("senha-nova").value = "";
  document.getElementById("modal-senha").style.display = "flex";
}

function fecharModalSenha() {
  document.getElementById("modal-senha").style.display = "none";
}

async function salvarNovaSenha() {
  const id = document.getElementById("senha-cliente-id").value;
  const senha = document.getElementById("senha-nova").value;

  if (!senha || senha.length < 4) {
    alert("A nova senha deve ter pelo menos 4 caracteres.");
    return;
  }

  try {
    await apiFetch(`/admin/clientes/${id}/senha`, {
      method: "PUT",
      token: getAdminToken(),
      body: JSON.stringify({ senha }),
    });
    fecharModalSenha();
    alert("Senha redefinida com sucesso! Repasse a nova senha ao cliente.");
  } catch (e) {
    alert(e.message || "Erro ao redefinir senha.");
  }
}
