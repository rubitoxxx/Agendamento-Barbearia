function normalizarTelefone(telefone) {
  return String(telefone || '').replace(/\D/g, '');
}

function rowToDict(row) {
  if (!row) return null;
  const d = { ...row };
  for (const [k, v] of Object.entries(d)) {
    if (v instanceof Date) {
      if (k === 'data') {
        d[k] = v.toISOString().slice(0, 10);
      } else {
        d[k] = v.toISOString();
      }
    }
  }
  return d;
}

function rowsToDict(rows) {
  return rows.map(rowToDict);
}

function isUniqueViolation(err) {
  return err.code === '23505';
}

module.exports = {
  normalizarTelefone,
  rowToDict,
  rowsToDict,
  isUniqueViolation,
};
