const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET_KEY || 'dev-secret-change-me';
const JWT_EXPIRES = '12h';

function createToken(payload) {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: JWT_EXPIRES });
}

function verifyToken(token) {
  return jwt.verify(token, JWT_SECRET);
}

function extractToken(req) {
  const auth = req.headers.authorization || '';
  if (auth.startsWith('Bearer ')) {
    return auth.slice(7);
  }
  return null;
}

function adminRequired(req, res, next) {
  const token = extractToken(req);
  if (!token) {
    return res.status(401).json({ error: 'Token não informado' });
  }
  try {
    const decoded = verifyToken(token);
    if (decoded.role !== 'admin') {
      return res.status(403).json({ error: 'Acesso restrito ao administrador' });
    }
    req.user = decoded;
    next();
  } catch {
    return res.status(401).json({ error: 'Token inválido ou expirado' });
  }
}

function clienteRequired(req, res, next) {
  const token = extractToken(req);
  if (!token) {
    return res.status(401).json({ error: 'Faça login para continuar' });
  }
  try {
    const decoded = verifyToken(token);
    if (decoded.role !== 'cliente') {
      return res.status(403).json({ error: 'Acesso restrito ao cliente' });
    }
    req.cliente = decoded;
    next();
  } catch {
    return res.status(401).json({ error: 'Token inválido ou expirado' });
  }
}

function clienteOptional(req, res, next) {
  const token = extractToken(req);
  if (!token) {
    return next();
  }
  try {
    const decoded = verifyToken(token);
    if (decoded.role === 'cliente') {
      req.cliente = decoded;
    }
  } catch {
    /* token inválido — segue sem cliente */
  }
  next();
}

module.exports = {
  JWT_SECRET,
  createToken,
  verifyToken,
  extractToken,
  adminRequired,
  clienteRequired,
  clienteOptional,
};
