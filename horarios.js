const { query } = require('../db');

function filtrarHorariosPassados(dataStr, horarios) {
  const hoje = new Date().toISOString().slice(0, 10);
  if (dataStr !== hoje) return horarios;

  const agora = new Date();
  let minutos = agora.getHours() * 60 + agora.getMinutes();
  if (minutos % 30 !== 0) {
    minutos = (Math.floor(minutos / 30) + 1) * 30;
  }

  return horarios.filter((h) => {
    const [hh, mm] = h.split(':').map(Number);
    return hh * 60 + mm >= minutos;
  });
}

async function getConfigHorarios() {
  const result = await query(
    'SELECT semana, horarios_extras, dias_bloqueados FROM config_horarios WHERE id = 1'
  );
  const row = result.rows[0];

  if (!row) {
    return { semana: {}, horarios_extras: {}, dias_bloqueados: [] };
  }

  return {
    semana: typeof row.semana === 'object' ? row.semana : JSON.parse(row.semana || '{}'),
    horarios_extras:
      typeof row.horarios_extras === 'object'
        ? row.horarios_extras
        : JSON.parse(row.horarios_extras || '{}'),
    dias_bloqueados:
      typeof row.dias_bloqueados === 'object'
        ? row.dias_bloqueados
        : JSON.parse(row.dias_bloqueados || '[]'),
  };
}

function horariosDoDia(dataStr, config) {
  if (config.dias_bloqueados.includes(dataStr)) {
    return [];
  }

  if (config.horarios_extras[dataStr]) {
    return config.horarios_extras[dataStr];
  }

  const d = new Date(dataStr + 'T00:00:00');
  const diaSemana = String(d.getDay());

  const semana = config.semana;
  const diaCfg = semana[diaSemana] ||
    semana[String(diaSemana)] || { aberto: false, horarios: [] };

  if (!diaCfg.aberto) {
    return [];
  }

  return diaCfg.horarios || [];
}

async function getHorariosDoDia(dataStr) {
  const config = await getConfigHorarios();
  return horariosDoDia(dataStr, config);
}

async function getOcupadosEBloqueados(dataStr) {
  const ocupadosResult = await query(
    "SELECT horario FROM agendamentos WHERE data = $1 AND status != 'cancelado'",
    [dataStr]
  );
  const bloqueadosResult = await query(
    'SELECT horario FROM horarios_bloqueados WHERE data = $1',
    [dataStr]
  );

  return [
    ocupadosResult.rows.map((r) => r.horario),
    bloqueadosResult.rows.map((r) => r.horario),
  ];
}

async function verificarHorarioDisponivel(dataStr, horario) {
  let horarios = await getHorariosDoDia(dataStr);
  horarios = filtrarHorariosPassados(dataStr, horarios);

  if (!horarios.includes(horario)) {
    return { ok: false, error: 'Horário indisponível ou já passou.' };
  }

  const [ocupados, bloqueados] = await getOcupadosEBloqueados(dataStr);

  if (ocupados.includes(horario)) {
    return { ok: false, error: 'Horário indisponível. Já existe um agendamento.', status: 409 };
  }
  if (bloqueados.includes(horario)) {
    return { ok: false, error: 'Horário bloqueado pelo administrador.', status: 409 };
  }

  return { ok: true };
}

module.exports = {
  filtrarHorariosPassados,
  getConfigHorarios,
  horariosDoDia,
  getHorariosDoDia,
  getOcupadosEBloqueados,
  verificarHorarioDisponivel,
};
