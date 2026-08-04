-- Tabela de usuários administradores
CREATE TABLE IF NOT EXISTS admin_users (
    id SERIAL PRIMARY KEY,
    username VARCHAR(50) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL
);

-- Tabela de serviços
CREATE TABLE IF NOT EXISTS servicos (
    id SERIAL PRIMARY KEY,
    nome VARCHAR(100) NOT NULL,
    preco VARCHAR(50) NOT NULL,
    duracao VARCHAR(50) NOT NULL,
    icon VARCHAR(50) DEFAULT '💈',
    descricao TEXT,
    ativo BOOLEAN DEFAULT TRUE,
    ordem INTEGER DEFAULT 0
);

-- Tabela de agendamentos
CREATE TABLE IF NOT EXISTS agendamentos (
    id SERIAL PRIMARY KEY,
    nome VARCHAR(100) NOT NULL,
    telefone VARCHAR(50) NOT NULL,
    servico VARCHAR(100) NOT NULL,
    preco VARCHAR(50) NOT NULL,
    duracao VARCHAR(50) DEFAULT '30 min',
    barbeiro VARCHAR(100) DEFAULT 'Qualquer',
    data DATE NOT NULL,
    horario VARCHAR(5) NOT NULL,
    status VARCHAR(20) DEFAULT 'confirmado',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (data, horario)
);

-- Tabela de configuração de horários
CREATE TABLE IF NOT EXISTS config_horarios (
    id SERIAL PRIMARY KEY,
    semana JSONB DEFAULT '{}'::jsonb,
    horarios_extras JSONB DEFAULT '{}'::jsonb,
    dias_bloqueados JSONB DEFAULT '[]'::jsonb
);

-- Inserir configuração inicial se não existir
INSERT INTO config_horarios (id, semana, horarios_extras, dias_bloqueados) VALUES (1, '{}'::jsonb, '{}'::jsonb, '[]'::jsonb) ON CONFLICT (id) DO NOTHING;

-- Tabela de horários bloqueados manualmente
CREATE TABLE IF NOT EXISTS horarios_bloqueados (
    id SERIAL PRIMARY KEY,
    data DATE NOT NULL,
    horario VARCHAR(5) NOT NULL,
    UNIQUE (data, horario)
);
