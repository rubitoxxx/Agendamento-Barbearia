const express = require('express');
const bcrypt = require('bcryptjs');
const { query } = require('../db');
const { createToken, clienteRequired } = require('../middlewares/auth');
const { normalizarTelefone, rowToDict, isUniqueViolation } = require('../utils/helpers');

const router = express.Router();

router.post('/registrar', async (req, res) => {
  try {
    const { nome, telefone, senha } = req.body;

    if (!nome || !telefone || !senha) {
      return res.status(400).json({ error: 'Nome, telefone e senha são obrigatórios' });
    }

    if (String(nome).trim().length < 3) {
      return res.status(400).json({ error: 'Nome deve ter pelo menos 3 caracteres' });
    }

    if (String(senha).length < 4) {
      return res.status(400).json({ error: 'Senha deve ter pelo menos 4 caracteres' });
    }

    const tel = normalizarTelefone(telefone);
    if (tel.length < 10) {
      return res.status(400).json({ error: 'Telefone inválido' });
    }

    const senhaHash = await bcrypt.hash(senha, 10);

    const result = await query(
      'INSERT INTO clientes (nome, telefone, senha_hash) VALUES ($1, $2, $3) RETURNING id, nome, telefone, created_at',
      [nome.trim(), tel, senhaHash]
    );

    const cliente = rowToDict(result.rows[0]);
    const token = createToken({
      sub: cliente.id,
      telefone: cliente.telefone,
      nome: cliente.nome,
      role: 'cliente',
    });

    return res.status(201).json({ token, nome: cliente.nome, telefone: cliente.telefone });
  } catch (err) {
    if (isUniqueViolation(err)) {
      return res.status(409).json({ error: 'Telefone já cadastrado' });
    }
    return res.status(500).json({ error: err.message });
  }
});

router.post('/login', async (req, res) => {
  try {
    const { telefone, senha } = req.body;
    const tel = normalizarTelefone(telefone);

    const result = await query('SELECT * FROM clientes WHERE telefone = $1', [tel]);
    const cliente = result.rows[0];

    if (!cliente || !(await bcrypt.compare(senha, cliente.senha_hash))) {
      return res.status(401).json({ error: 'Telefone ou senha inválidos' });
    }

    const token = createToken({
      sub: cliente.id,
      telefone: cliente.telefone,
      nome: cliente.nome,
      role: 'cliente',
    });

    return res.json({ token, nome: cliente.nome, telefone: cliente.telefone });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

router.get('/me', clienteRequired, (req, res) => {
  return res.json({
    id: req.cliente.sub,
    nome: req.cliente.nome,
    telefone: req.cliente.telefone,
  });
});

module.exports = router;
