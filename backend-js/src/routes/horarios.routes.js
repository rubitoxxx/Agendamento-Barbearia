const express = require('express');
const { query } = require('../db');
const { adminRequired } = require('../middlewares/auth');
const { rowToDict, rowsToDict } = require('../utils/helpers');
const {
  filtrarHorariosPassados,
  getConfigHorarios,
  horariosDoDia,
  getOcupadosEBloqueados,
} = require('../services/horarios');

const router = express.Router();

router.get('/horarios', async (req, res) => {
  try {
    const dataStr = req.query.data;
    if (!dataStr) {
      return res.status(400).json({ error: "Parâmetro 'data' obrigatório (YYYY-MM-DD)" });
    }

    const config = await getConfigHorarios();
    let horarios = horariosDoDia(dataStr, config);

    if (!horarios.length) {
      return res.json({ data: dataStr, slots: [], dia_fechado: true });
    }

    horarios = filtrarHorariosPassados(dataStr, horarios);
    const [ocupados, bloqueados] = await getOcupadosEBloqueados(dataStr);
    const hoje = new Date().toISOString().slice(0, 10);
    const agora = new Date();

    const slots = horarios.map((h) => {
      const [hh, mm] = h.split(':').map(Number);
      let passou = false;
      if (dataStr === hoje) {
        passou = hh * 60 + mm < agora.getHours() * 60 + agora.getMinutes();
      }

      let status;
      if (passou) status = 'passado';
      else if (ocupados.includes(h)) status = 'ocupado';
      else if (bloqueados.includes(h)) status = 'bloqueado';
      else status = 'livre';

      return { horario: h, status };
    });

    return res.json({ data: dataStr, slots, dia_fechado: false });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

router.get('/admin/horarios/config', adminRequired, async (req, res) => {
  try {
    const config = await getConfigHorarios();
    const bloqueiosResult = await query(
      'SELECT data, horario FROM horarios_bloqueados ORDER BY data, horario'
    );
    config.bloqueios = rowsToDict(bloqueiosResult.rows);
    return res.json(config);
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

router.put('/admin/horarios/config', adminRequired, async (req, res) => {
  try {
    const data = req.body;
    await query(
      'UPDATE config_horarios SET semana=$1, horarios_extras=$2, dias_bloqueados=$3 WHERE id=1',
      [
        JSON.stringify(data.semana || {}),
        JSON.stringify(data.horarios_extras || {}),
        JSON.stringify(data.dias_bloqueados || []),
      ]
    );
    return res.json({ ok: true });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

router.post('/admin/horarios/bloquear', adminRequired, async (req, res) => {
  try {
    const { data: dataStr, horario, acao = 'bloquear' } = req.body;

    if (acao === 'desbloquear') {
      await query('DELETE FROM horarios_bloqueados WHERE data=$1 AND horario=$2', [
        dataStr,
        horario,
      ]);
    } else {
      await query(
        'INSERT INTO horarios_bloqueados (data, horario) VALUES ($1,$2) ON CONFLICT DO NOTHING',
        [dataStr, horario]
      );
    }

    return res.json({ ok: true });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

module.exports = router;
