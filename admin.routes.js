const express = require('express');
const { query } = require('../db');
const { adminRequired } = require('../middlewares/auth');
const { rowToDict, rowsToDict, isUniqueViolation } = require('../utils/helpers');
const { montarWhatsAppUrl } = require('../utils/whatsapp');

const router = express.Router();

router.get('/admin/agendamentos', adminRequired, async (req, res) => {
  try {
    const busca = req.query.busca || '';
    const dataStr = req.query.data;
    const status = req.query.status;

    let sql = 'SELECT * FROM agendamentos WHERE 1=1';
    const params = [];
    let paramIdx = 1;

    if (dataStr) {
      sql += ` AND data = $${paramIdx++}`;
      params.push(dataStr);
    }
    if (status) {
      sql += ` AND status = $${paramIdx++}`;
      params.push(status);
    }
    if (busca) {
      sql += ` AND (nome ILIKE $${paramIdx} OR telefone ILIKE $${paramIdx} OR servico ILIKE $${paramIdx})`;
      params.push(`%${busca}%`);
      paramIdx++;
    }

    sql += ' ORDER BY data DESC, horario';

    const result = await query(sql, params);
    return res.json(rowsToDict(result.rows));
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

router.put('/admin/agendamentos/:aid', adminRequired, async (req, res) => {
  try {
    const aid = req.params.aid;
    const data = req.body;

    if (data.data && data.horario) {
      const conflito = await query(
        "SELECT id FROM agendamentos WHERE data=$1 AND horario=$2 AND id!=$3 AND status!='cancelado'",
        [data.data, data.horario, aid]
      );
      if (conflito.rows.length) {
        return res.status(409).json({ error: 'Horário já ocupado' });
      }
    }

    const result = await query(
      `UPDATE agendamentos SET nome=$1, telefone=$2, servico=$3, preco=$4,
       data=$5, horario=$6, barbeiro=$7, status=$8 WHERE id=$9 RETURNING *`,
      [
        data.nome,
        data.telefone,
        data.servico,
        data.preco,
        data.data,
        data.horario,
        data.barbeiro || 'Qualquer',
        data.status || 'confirmado',
        aid,
      ]
    );

    if (!result.rows[0]) {
      return res.status(404).json({ error: 'Agendamento não encontrado' });
    }

    return res.json(rowToDict(result.rows[0]));
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

router.patch('/admin/agendamentos/:aid/status', adminRequired, async (req, res) => {
  try {
    const aid = req.params.aid;
    const { status } = req.body;

    if (!['confirmado', 'cancelado', 'concluido', 'pendente'].includes(status)) {
      return res.status(400).json({ error: 'Status inválido' });
    }

    const result = await query(
      'UPDATE agendamentos SET status = $1 WHERE id = $2 RETURNING *',
      [status, aid]
    );

    if (!result.rows[0]) {
      return res.status(404).json({ error: 'Agendamento não encontrado' });
    }

    const ag = rowToDict(result.rows[0]);
    const response = { ...ag };

    if (status === 'confirmado') {
      response.whatsapp_url = montarWhatsAppUrl(ag.telefone, ag);
    }

    return res.json(response);
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

router.delete('/admin/agendamentos/:aid', adminRequired, async (req, res) => {
  try {
    const aid = req.params.aid;
    await query('DELETE FROM agendamentos WHERE id=$1', [aid]);
    return res.json({ ok: true });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

router.post('/admin/agendamentos', adminRequired, async (req, res) => {
  try {
    const data = req.body;

    try {
      const result = await query(
        `INSERT INTO agendamentos (nome, telefone, servico, preco, data, horario, status, barbeiro)
         VALUES ($1,$2,$3,$4,$5,$6,'confirmado',$7) RETURNING *`,
        [
          data.nome,
          data.telefone || '',
          data.servico || 'Encaixe',
          data.preco || '—',
          data.data,
          data.horario,
          data.barbeiro || 'Qualquer',
        ]
      );

      return res.status(201).json(rowToDict(result.rows[0]));
    } catch (err) {
      if (isUniqueViolation(err)) {
        return res.status(409).json({ error: 'Horário já ocupado' });
      }
      throw err;
    }
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

module.exports = router;
