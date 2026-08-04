const express = require('express');
const bcrypt = require('bcryptjs');
const { query } = require('../db');
const { createToken, adminRequired } = require('../middlewares/auth');
const { rowToDict } = require('../utils/helpers');

const router = express.Router();

router.post('/login', async (req, res) => {
  try {
    const { username = '', password = '' } = req.body;

    const result = await query('SELECT * FROM admin_users WHERE username = $1', [username]);
    const user = result.rows[0];

    if (!user || !(await bcrypt.compare(password, user.password_hash))) {
      return res.status(401).json({ error: 'Usuário ou senha inválidos' });
    }

    const token = createToken({ sub: username, role: 'admin' });
    return res.json({ token, username });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

router.get('/me', adminRequired, (req, res) => {
  return res.json({ username: req.user.sub });
});

module.exports = router;
