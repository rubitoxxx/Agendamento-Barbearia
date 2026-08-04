require('dotenv').config();
const fs = require('fs');
const path = require('path');
const express = require('express');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const { pool, query } = require('./db');

const authRoutes = require('./routes/auth.routes');
const clientesRoutes = require('./routes/clientes.routes');
const servicosRoutes = require('./routes/servicos.routes');
const horariosRoutes = require('./routes/horarios.routes');
const agendamentosRoutes = require('./routes/agendamentos.routes');
const adminRoutes = require('./routes/admin.routes');
const barbeirosRoutes = require('./routes/barbeiros.routes');

const app = express();
const PORT = process.env.PORT || 5000;
const ADMIN_USER = process.env.ADMIN_USER || 'admin';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'admin123';

app.use(cors({ origin: '*' }));
app.use(express.json());

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

app.use('/api/admin', authRoutes);
app.use('/api/clientes', clientesRoutes);
app.use('/api', servicosRoutes);
app.use('/api', horariosRoutes);
app.use('/api', agendamentosRoutes);
app.use('/api', adminRoutes);
app.use('/api', barbeirosRoutes);

async function initDb() {
  if (!process.env.DATABASE_URL) {
    console.warn('AVISO: DATABASE_URL não configurada. Configure o .env');
    return;
  }

  const schemaPath = path.join(__dirname, '../schema.sql');
  const migrationPath = path.join(__dirname, '../migration.sql');

  try {
    if (fs.existsSync(schemaPath)) {
      const sql = fs.readFileSync(schemaPath, 'utf-8');
      await pool.query(sql);
      console.log('Schema base aplicado.');
    }

    if (fs.existsSync(migrationPath)) {
      const migration = fs.readFileSync(migrationPath, 'utf-8');
      await pool.query(migration);
      console.log('Migração aplicada.');
    }
  } catch (err) {
    console.warn('Schema/migração (pode já existir):', err.message);
  }

  const adminResult = await query('SELECT id FROM admin_users WHERE username = $1', [ADMIN_USER]);
  const hash = await bcrypt.hash(ADMIN_PASSWORD, 10);
  if (!adminResult.rows.length) {
    await query('INSERT INTO admin_users (username, password_hash) VALUES ($1, $2)', [
      ADMIN_USER,
      hash,
    ]);
    console.log(`Admin criado: ${ADMIN_USER}`);
  } else {
    await query('UPDATE admin_users SET password_hash = $1 WHERE username = $2', [hash, ADMIN_USER]);
    console.log(`Senha do admin sincronizada: ${ADMIN_USER}`);
  }
}

initDb().catch((err) => {
  console.error('Init DB falhou (configure DATABASE_URL):', err.message);
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`API rodando em http://localhost:${PORT}`);
});
