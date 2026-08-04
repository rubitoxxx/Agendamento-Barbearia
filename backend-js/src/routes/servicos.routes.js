const express = require('express');
const { query } = require('../db');
const { adminRequired } = require('../middlewares/auth');
const { rowToDict, rowsToDict } = require('../utils/helpers');

const router = express.Router();

router.get('/servicos', async (req, res) => {
  try {
    const result = await query(
      'SELECT * FROM servicos WHERE ativo = TRUE ORDER BY ordem, id'
    );
    return res.json(rowsToDict(result.rows));
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

router.get('/admin/servicos', adminRequired, async (req, res) => {
  try {
    const result = await query('SELECT * FROM servicos ORDER BY ordem, id');
    return res.json(rowsToDict(result.rows));
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

router.put('/admin/servicos/:sid', adminRequired, async (req, res) => {
  try {
    const sid = req.params.sid;
    const data = req.body;

    const result = await query(
      `UPDATE servicos SET nome=$1, preco=$2, duracao=$3, descricao=$4, ativo=$5, ordem=$6
       WHERE id=$7 RETURNING *`,
      [
        data.nome,
        data.preco,
        data.duracao,
        data.descricao || '',
        data.ativo !== undefined ? data.ativo : true,
        data.ordem || 0,
        sid,
      ]
    );

    if (!result.rows[0]) {
      return res.status(404).json({ error: 'Serviço não encontrado' });
    }

    return res.json(rowToDict(result.rows[0]));
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

router.post('/admin/servicos', adminRequired, async (req, res) => {
  try {
    const data = req.body;

    const result = await query(
      `INSERT INTO servicos (nome, preco, duracao, icon, descricao, ativo, ordem)
       VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
      [
        data.nome,
        data.preco,
        data.duracao,
        data.icon || '💈',
        data.descricao || '',
        data.ativo !== undefined ? data.ativo : true,
        data.ordem || 0,
      ]
    );

    return res.status(201).json(rowToDict(result.rows[0]));
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

router.delete('/admin/servicos/:sid', adminRequired, async (req, res) => {
  try {
    const sid = req.params.sid;
    await query('DELETE FROM servicos WHERE id=$1', [sid]);
    return res.json({ ok: true });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

module.exports = router;
