-- Migração: autenticação de clientes + fluxo pendente
-- Execute após o schema.sql base

CREATE TABLE IF NOT EXISTS clientes (
    id SERIAL PRIMARY KEY,
    nome VARCHAR(100) NOT NULL,
    telefone VARCHAR(20) UNIQUE NOT NULL,
    senha_hash VARCHAR(255) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

ALTER TABLE agendamentos ADD COLUMN IF NOT EXISTS cliente_id INTEGER REFERENCES clientes(id);

-- Novos agendamentos do cliente passam a nascer como pendente
ALTER TABLE agendamentos ALTER COLUMN status SET DEFAULT 'pendente';
