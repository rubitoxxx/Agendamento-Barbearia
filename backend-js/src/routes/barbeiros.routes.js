const express = require('express');
const { query } = require('../db');
const { adminRequired } = require('../middlewares/auth');
const { rowToDict, rowsToDict } = require('../utils/helpers');

const router = express.Router();

router.get('/barbeiros', async (req, res) => {
  try {
    const result = await query(
      'SELECT * FROM barbeiros WHERE ativo = TRUE ORDER BY ordem, id'
    );
    return res.json(rowsToDict(result.rows));
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

router.get('/admin/barbeiros', adminRequired, async (req, res) => {
  try {
    const result = await query('SELECT * FROM barbeiros ORDER BY ordem, id');
    return res.json(rowsToDict(result.rows));
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

router.post('/admin/barbeiros', adminRequired, async (req, res) => {
  try {
    const data = req.body;
    const result = await query(
      `INSERT INTO barbeiros (nome, ativo, ordem) VALUES ($1,$2,$3) RETURNING *`,
      [data.nome, data.ativo !== undefined ? data.ativo : true, data.ordem || 0]
    );
    return res.status(201).json(rowToDict(result.rows[0]));
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

router.put('/admin/barbeiros/:bid', adminRequired, async (req, res) => {
  try {
    const { bid } = req.params;
    const data = req.body;
    const result = await query(
      `UPDATE barbeiros SET nome=$1, ativo=$2, ordem=$3 WHERE id=$4 RETURNING *`,
      [data.nome, data.ativo !== undefined ? data.ativo : true, data.ordem || 0, bid]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Barbeiro não encontrado' });
    return res.json(rowToDict(result.rows[0]));
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

router.delete('/admin/barbeiros/:bid', adminRequired, async (req, res) => {
  try {
    const { bid } = req.params;
    await query('DELETE FROM barbeiros WHERE id=$1', [bid]);
    return res.json({ ok: true });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

module.exports = router;
