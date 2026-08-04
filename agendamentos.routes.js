const express = require('express');
const { query } = require('../db');
const { clienteRequired, clienteOptional } = require('../middlewares/auth');
const { rowToDict, rowsToDict, isUniqueViolation, normalizarTelefone } = require('../utils/helpers');
const { verificarHorarioDisponivel } = require('../services/horarios');

const router = express.Router();

router.post('/agendamentos', clienteRequired, async (req, res) => {
  try {
    const data = req.body;
    const required = ['nome', 'telefone', 'servico', 'preco', 'data', 'horario'];

    for (const field of required) {
      if (!data[field]) {
        return res.status(400).json({ error: `Campo '${field}' obrigatório` });
      }
    }

    const dataStr = data.data;
    const horario = data.horario;
    const clienteId = req.cliente.sub;

    const verificacao = await verificarHorarioDisponivel(dataStr, horario);
    if (!verificacao.ok) {
      return res.status(verificacao.status || 400).json({ error: verificacao.error });
    }

    const telNormalizado = normalizarTelefone(req.cliente.telefone);
    const telEnviado = normalizarTelefone(data.telefone);
    if (telEnviado && telEnviado !== telNormalizado) {
      return res.status(403).json({ error: 'Telefone não confere com a conta logada' });
    }

    try {
      const result = await query(
        `INSERT INTO agendamentos (nome, telefone, servico, preco, duracao, barbeiro, data, horario, status, cliente_id)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'pendente',$9) RETURNING *`,
        [
          data.nome || req.cliente.nome,
          req.cliente.telefone,
          data.servico,
          data.preco,
          data.duracao || '30 min',
          data.barbeiro || 'Qualquer',
          dataStr,
          horario,
          clienteId,
        ]
      );

      return res.status(201).json(rowToDict(result.rows[0]));
    } catch (err) {
      if (isUniqueViolation(err)) {
        return res.status(409).json({ error: 'Horário indisponível. Já existe um agendamento.' });
      }
      throw err;
    }
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

router.get('/agendamentos', clienteOptional, async (req, res) => {
  try {
    const telefone = req.query.telefone;
    const dataStr = req.query.data;

    if (req.cliente) {
      const result = await query(
        `SELECT * FROM agendamentos
         WHERE cliente_id = $1 AND status != 'cancelado'
         ORDER BY data, horario`,
        [req.cliente.sub]
      );
      return res.json(rowsToDict(result.rows));
    }

    if (telefone) {
      const telLimpo = normalizarTelefone(telefone);
      const result = await query(
        `SELECT * FROM agendamentos
         WHERE REPLACE(REPLACE(REPLACE(REPLACE(telefone,'(',''),')',''),'-',''),' ','') LIKE $1
         AND status != 'cancelado'
         ORDER BY data, horario`,
        [`%${telLimpo.slice(-9)}`]
      );
      return res.json(rowsToDict(result.rows));
    }

    if (dataStr) {
      const result = await query(
        "SELECT * FROM agendamentos WHERE data = $1 AND status != 'cancelado' ORDER BY horario",
        [dataStr]
      );
      return res.json(rowsToDict(result.rows));
    }

    return res.status(400).json({ error: 'Faça login ou informe telefone ou data' });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

router.delete('/agendamentos/:aid', clienteOptional, async (req, res) => {
  try {
    const aid = req.params.aid;
    const telefone = req.query.telefone || '';

    const existing = await query('SELECT * FROM agendamentos WHERE id = $1', [aid]);
    const row = existing.rows[0];

    if (!row) {
      return res.status(404).json({ error: 'Agendamento não encontrado' });
    }

    if (req.cliente) {
      if (row.cliente_id && row.cliente_id !== req.cliente.sub) {
        return res.status(403).json({ error: 'Agendamento não pertence a este cliente' });
      }
      if (!row.cliente_id) {
        const telLimpo = normalizarTelefone(req.cliente.telefone);
        const rowTel = normalizarTelefone(row.telefone);
        if (!rowTel.includes(telLimpo.slice(-9))) {
          return res.status(403).json({ error: 'Telefone não confere' });
        }
      }
    } else if (telefone) {
      const telLimpo = normalizarTelefone(telefone);
      const rowTel = normalizarTelefone(row.telefone);
      if (!rowTel.includes(telLimpo.slice(-9))) {
        return res.status(403).json({ error: 'Telefone não confere' });
      }
    } else {
      return res.status(401).json({ error: 'Faça login para cancelar' });
    }

    await query("UPDATE agendamentos SET status = 'cancelado' WHERE id = $1", [aid]);
    return res.json({ ok: true });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

module.exports = router;
