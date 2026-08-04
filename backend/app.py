"""
API Flask — Sistema de Agendamento Barbearia
Conecta ao Supabase (PostgreSQL)
"""

import os
import json
from datetime import date, datetime, timedelta
from functools import wraps

from dotenv import load_dotenv
from flask import Flask, jsonify, request
from flask_cors import CORS
from flask_jwt_extended import (
    JWTManager, create_access_token, jwt_required, get_jwt_identity
)
from werkzeug.security import generate_password_hash, check_password_hash
import psycopg
from psycopg.rows import dict_row
from psycopg.errors import UniqueViolation

load_dotenv()

app = Flask(__name__)
app.config["JWT_SECRET_KEY"] = os.getenv("JWT_SECRET_KEY", "dev-secret-change-me")
app.config["JWT_ACCESS_TOKEN_EXPIRES"] = timedelta(hours=12)

CORS(app, origins="*")
jwt = JWTManager(app)

DATABASE_URL = os.getenv("DATABASE_URL")
ADMIN_USER = os.getenv("ADMIN_USER", "admin")
ADMIN_PASSWORD = os.getenv("ADMIN_PASSWORD", "admin123")
WHATSAPP_BARBEARIA = os.getenv("WHATSAPP_BARBEARIA", "")

HORARIOS_BASE = [
    "08:00", "08:30", "09:00", "09:30", "10:00", "10:30",
    "11:00", "11:30", "13:00", "13:30", "14:00", "14:30",
    "15:00", "15:30", "16:00", "16:30", "17:00", "17:30",
    "18:00", "18:30",
]


def get_db():
    return psycopg.connect(DATABASE_URL, row_factory=dict_row)


def init_db():
    """Cria tabelas e admin inicial se não existirem."""
    if not DATABASE_URL:
        print("AVISO: DATABASE_URL não configurada. Configure o .env")
        return

    schema_path = os.path.join(os.path.dirname(__file__), "schema.sql")
    with open(schema_path, encoding="utf-8") as f:
        sql = f.read()

    conn = get_db()
    cur = conn.cursor()
    try:
        cur.execute(sql)
        conn.commit()
    except Exception as e:
        conn.rollback()
        print(f"Schema (pode já existir): {e}")

    # Criar admin se não existir
    cur.execute("SELECT id FROM admin_users WHERE username = %s", (ADMIN_USER,))
    if not cur.fetchone():
        cur.execute(
            "INSERT INTO admin_users (username, password_hash) VALUES (%s, %s)",
            (ADMIN_USER, generate_password_hash(ADMIN_PASSWORD)),
        )
        conn.commit()
        print(f"Admin criado: {ADMIN_USER}")

    cur.close()
    conn.close()


def row_to_dict(row):
    if row is None:
        return None
    d = dict(row)
    for k, v in d.items():
        if isinstance(v, (date, datetime)):
            d[k] = v.isoformat()
        if k == "data" and v and not isinstance(v, str):
            d[k] = v.strftime("%Y-%m-%d") if hasattr(v, "strftime") else str(v)
    return d


def filtrar_horarios_passados(data_str, horarios):
    """Remove horários que já passaram se a data for hoje."""
    hoje = date.today().isoformat()
    if data_str != hoje:
        return horarios

    agora = datetime.now()
    # Próximo slot de 30 min
    minutos = agora.hour * 60 + agora.minute
    if minutos % 30 != 0:
        minutos = ((minutos // 30) + 1) * 30

    resultado = []
    for h in horarios:
        hh, mm = map(int, h.split(":"))
        if hh * 60 + mm >= minutos:
            resultado.append(h)
    return resultado


def get_config_horarios():
    conn = get_db()
    cur = conn.cursor()
    cur.execute("SELECT semana, horarios_extras, dias_bloqueados FROM config_horarios WHERE id = 1")
    row = cur.fetchone()
    cur.close()
    conn.close()

    if not row:
        return {"semana": {}, "horarios_extras": {}, "dias_bloqueados": []}

    return {
        "semana": row["semana"] if isinstance(row["semana"], dict) else json.loads(row["semana"] or "{}"),
        "horarios_extras": row["horarios_extras"] if isinstance(row["horarios_extras"], dict) else json.loads(row["horarios_extras"] or "{}"),
        "dias_bloqueados": row["dias_bloqueados"] if isinstance(row["dias_bloqueados"], list) else json.loads(row["dias_bloqueados"] or "[]"),
    }


def horarios_do_dia(data_str):
    """Retorna lista de horários disponíveis para uma data."""
    config = get_config_horarios()

    if data_str in config["dias_bloqueados"]:
        return []

    if data_str in config["horarios_extras"]:
        return config["horarios_extras"][data_str]

    d = datetime.strptime(data_str, "%Y-%m-%d")
    dia_semana = str(d.weekday() if d.weekday() < 6 else (0 if d.weekday() == 6 else d.weekday()))
    # Python: Monday=0 ... Sunday=6 — ajustar para nosso schema 0=Dom
    dia_semana = str((d.weekday() + 1) % 7)

    semana = config["semana"]
    dia_cfg = semana.get(dia_semana, semana.get(str(dia_semana), {"aberto": False, "horarios": []}))

    if not dia_cfg.get("aberto", False):
        return []

    return dia_cfg.get("horarios", [])


def get_ocupados_e_bloqueados(data_str):
    conn = get_db()
    cur = conn.cursor()

    cur.execute(
        "SELECT horario FROM agendamentos WHERE data = %s AND status != 'cancelado'",
        (data_str,),
    )
    ocupados = [r["horario"] for r in cur.fetchall()]

    cur.execute("SELECT horario FROM horarios_bloqueados WHERE data = %s", (data_str,))
    bloqueados = [r["horario"] for r in cur.fetchall()]

    cur.close()
    conn.close()
    return ocupados, bloqueados


# ─── Health ─────────────────────────────────────────
@app.route("/api/health")
def health():
    return jsonify({"status": "ok", "timestamp": datetime.now().isoformat()})


# ─── Serviços ───────────────────────────────────────
@app.route("/api/servicos")
def listar_servicos():
    conn = get_db()
    cur = conn.cursor()
    cur.execute("SELECT * FROM servicos WHERE ativo = TRUE ORDER BY ordem, id")
    rows = cur.fetchall()
    cur.close()
    conn.close()
    return jsonify([row_to_dict(r) for r in rows])


@app.route("/api/admin/servicos", methods=["GET"])
@jwt_required()
def admin_listar_servicos():
    conn = get_db()
    cur = conn.cursor()
    cur.execute("SELECT * FROM servicos ORDER BY ordem, id")
    rows = cur.fetchall()
    cur.close()
    conn.close()
    return jsonify([row_to_dict(r) for r in rows])


@app.route("/api/admin/servicos/<int:sid>", methods=["PUT"])
@jwt_required()
def admin_editar_servico(sid):
    data = request.get_json()
    conn = get_db()
    cur = conn.cursor()
    cur.execute(
        """UPDATE servicos SET nome=%s, preco=%s, duracao=%s, descricao=%s, ativo=%s, ordem=%s
           WHERE id=%s RETURNING *""",
        (
            data.get("nome"), data.get("preco"), data.get("duracao"),
            data.get("descricao", ""), data.get("ativo", True),
            data.get("ordem", 0), sid,
        ),
    )
    row = cur.fetchone()
    conn.commit()
    cur.close()
    conn.close()
    return jsonify(row_to_dict(row))


@app.route("/api/admin/servicos", methods=["POST"])
@jwt_required()
def admin_criar_servico():
    data = request.get_json()
    conn = get_db()
    cur = conn.cursor()
    cur.execute(
        """INSERT INTO servicos (nome, preco, duracao, icon, descricao, ativo, ordem)
           VALUES (%s,%s,%s,%s,%s,%s,%s) RETURNING *""",
        (
            data["nome"], data["preco"], data["duracao"],
            data.get("icon", "💈"), data.get("descricao", ""),
            data.get("ativo", True), data.get("ordem", 0),
        ),
    )
    row = cur.fetchone()
    conn.commit()
    cur.close()
    conn.close()
    return jsonify(row_to_dict(row)), 201


# ─── Horários ───────────────────────────────────────
@app.route("/api/horarios")
def horarios_disponiveis():
    """Retorna slots com status: livre, ocupado, passado, bloqueado."""
    data_str = request.args.get("data")
    if not data_str:
        return jsonify({"error": "Parâmetro 'data' obrigatório (YYYY-MM-DD)"}), 400

    horarios = horarios_do_dia(data_str)
    if not horarios:
        return jsonify({"data": data_str, "slots": [], "dia_fechado": True})

    horarios = filtrar_horarios_passados(data_str, horarios)
    ocupados, bloqueados = get_ocupados_e_bloqueados(data_str)
    hoje = date.today().isoformat()
    agora = datetime.now()

    slots = []
    for h in horarios:
        hh, mm = map(int, h.split(":"))
        passou = False
        if data_str == hoje:
            passou = (hh * 60 + mm) < (agora.hour * 60 + agora.minute)

        if passou:
            status = "passado"
        elif h in ocupados:
            status = "ocupado"
        elif h in bloqueados:
            status = "bloqueado"
        else:
            status = "livre"

        slots.append({"horario": h, "status": status})

    return jsonify({"data": data_str, "slots": slots, "dia_fechado": False})


@app.route("/api/admin/horarios/config", methods=["GET"])
@jwt_required()
def get_horarios_config():
    config = get_config_horarios()
    conn = get_db()
    cur = conn.cursor()
    cur.execute("SELECT data, horario FROM horarios_bloqueados ORDER BY data, horario")
    bloqueios = [row_to_dict(r) for r in cur.fetchall()]
    cur.close()
    conn.close()
    config["bloqueios"] = bloqueios
    return jsonify(config)


@app.route("/api/admin/horarios/config", methods=["PUT"])
@jwt_required()
def salvar_horarios_config():
    data = request.get_json()
    conn = get_db()
    cur = conn.cursor()
    cur.execute(
        """UPDATE config_horarios SET semana=%s, horarios_extras=%s, dias_bloqueados=%s WHERE id=1""",
        (
            json.dumps(data.get("semana", {})),
            json.dumps(data.get("horarios_extras", {})),
            json.dumps(data.get("dias_bloqueados", [])),
        ),
    )
    conn.commit()
    cur.close()
    conn.close()
    return jsonify({"ok": True})


@app.route("/api/admin/horarios/bloquear", methods=["POST"])
@jwt_required()
def bloquear_horario():
    data = request.get_json()
    data_str = data.get("data")
    horario = data.get("horario")
    acao = data.get("acao", "bloquear")  # bloquear | desbloquear

    conn = get_db()
    cur = conn.cursor()

    if acao == "desbloquear":
        cur.execute("DELETE FROM horarios_bloqueados WHERE data=%s AND horario=%s", (data_str, horario))
    else:
        cur.execute(
            "INSERT INTO horarios_bloqueados (data, horario) VALUES (%s,%s) ON CONFLICT DO NOTHING",
            (data_str, horario),
        )

    conn.commit()
    cur.close()
    conn.close()
    return jsonify({"ok": True})


# ─── Agendamentos (público) ─────────────────────────
@app.route("/api/agendamentos", methods=["POST"])
def criar_agendamento():
    data = request.get_json()

    required = ["nome", "telefone", "servico", "preco", "data", "horario"]
    for field in required:
        if not data.get(field):
            return jsonify({"error": f"Campo '{field}' obrigatório"}), 400

    data_str = data["data"]
    horario = data["horario"]

    # Verificar se horário está disponível
    horarios = horarios_do_dia(data_str)
    horarios = filtrar_horarios_passados(data_str, horarios)

    if horario not in horarios:
        return jsonify({"error": "Horário indisponível ou já passou."}), 400

    ocupados, bloqueados = get_ocupados_e_bloqueados(data_str)
    if horario in ocupados:
        return jsonify({"error": "Horário indisponível. Já existe um agendamento."}), 409
    if horario in bloqueados:
        return jsonify({"error": "Horário bloqueado pelo administrador."}), 409

    conn = get_db()
    cur = conn.cursor()
    try:
        cur.execute(
            """INSERT INTO agendamentos (nome, telefone, servico, preco, duracao, barbeiro, data, horario, status)
               VALUES (%s,%s,%s,%s,%s,%s,%s,%s,'confirmado') RETURNING *""",
            (
                data["nome"], data["telefone"], data["servico"], data["preco"],
                data.get("duracao", "30 min"), data.get("barbeiro", "Qualquer"),
                data_str, horario,
            ),
        )
        row = cur.fetchone()
        conn.commit()
    except UniqueViolation:
        conn.rollback()
        cur.close()
        conn.close()
        return jsonify({"error": "Horário indisponível. Já existe um agendamento."}), 409
    except Exception as e:
        conn.rollback()
        cur.close()
        conn.close()
        return jsonify({"error": str(e)}), 500

    cur.close()
    conn.close()

    ag = row_to_dict(row)
    whatsapp_msg = montar_mensagem_whatsapp(ag)
    ag["whatsapp_url"] = f"https://wa.me/{WHATSAPP_BARBEARIA}?text={whatsapp_msg}" if WHATSAPP_BARBEARIA else None

    return jsonify(ag), 201


@app.route("/api/agendamentos")
def listar_por_telefone():
    telefone = request.args.get("telefone")
    data_str = request.args.get("data")

    conn = get_db()
    cur = conn.cursor()

    if telefone:
        tel_limpo = "".join(c for c in telefone if c.isdigit())
        cur.execute(
            """SELECT * FROM agendamentos
               WHERE REPLACE(REPLACE(REPLACE(REPLACE(telefone,'(',''),')',''),'-',''),' ','') LIKE %s
               AND status != 'cancelado'
               ORDER BY data, horario""",
            (f"%{tel_limpo[-9:]}",),
        )
    elif data_str:
        cur.execute(
            "SELECT * FROM agendamentos WHERE data = %s AND status != 'cancelado' ORDER BY horario",
            (data_str,),
        )
    else:
        cur.close()
        conn.close()
        return jsonify({"error": "Informe telefone ou data"}), 400

    rows = cur.fetchall()
    cur.close()
    conn.close()
    return jsonify([row_to_dict(r) for r in rows])


@app.route("/api/agendamentos/<int:aid>", methods=["DELETE"])
def cancelar_agendamento_publico(aid):
    telefone = request.args.get("telefone", "")
    conn = get_db()
    cur = conn.cursor()
    cur.execute("SELECT * FROM agendamentos WHERE id = %s", (aid,))
    row = cur.fetchone()
    if not row:
        cur.close()
        conn.close()
        return jsonify({"error": "Agendamento não encontrado"}), 404

    if telefone:
        tel_limpo = "".join(c for c in telefone if c.isdigit())
        row_tel = "".join(c for c in row["telefone"] if c.isdigit())
        if tel_limpo[-9:] not in row_tel:
            cur.close()
            conn.close()
            return jsonify({"error": "Telefone não confere"}), 403

    cur.execute("UPDATE agendamentos SET status = 'cancelado' WHERE id = %s", (aid,))
    conn.commit()
    cur.close()
    conn.close()
    return jsonify({"ok": True})


def montar_mensagem_whatsapp(ag):
    from urllib.parse import quote
    data_fmt = datetime.strptime(ag["data"][:10], "%Y-%m-%d").strftime("%d/%m/%Y")
    msg = (
        f"Olá {ag['nome']}!\n\n"
        f"Seu horário foi confirmado.\n\n"
        f"Data: {data_fmt}\n"
        f"Horário: {ag['horario']}\n"
        f"Serviço: {ag['servico']}\n"
        f"Valor: {ag['preco']}"
    )
    return quote(msg)


# ─── Admin: Agendamentos ────────────────────────────
@app.route("/api/admin/agendamentos")
@jwt_required()
def admin_listar_agendamentos():
    busca = request.args.get("busca", "")
    data_str = request.args.get("data")
    status = request.args.get("status")

    conn = get_db()
    cur = conn.cursor()

    query = "SELECT * FROM agendamentos WHERE 1=1"
    params = []

    if data_str:
        query += " AND data = %s"
        params.append(data_str)
    if status:
        query += " AND status = %s"
        params.append(status)
    if busca:
        query += " AND (nome ILIKE %s OR telefone ILIKE %s OR servico ILIKE %s)"
        like = f"%{busca}%"
        params.extend([like, like, like])

    query += " ORDER BY data DESC, horario"
    cur.execute(query, params)
    rows = cur.fetchall()
    cur.close()
    conn.close()
    return jsonify([row_to_dict(r) for r in rows])


@app.route("/api/admin/agendamentos/<int:aid>", methods=["PUT"])
@jwt_required()
def admin_editar_agendamento(aid):
    data = request.get_json()
    conn = get_db()
    cur = conn.cursor()

    # Se mudou data/horário, verificar conflito
    if data.get("data") and data.get("horario"):
        cur.execute(
            "SELECT id FROM agendamentos WHERE data=%s AND horario=%s AND id!=%s AND status!='cancelado'",
            (data["data"], data["horario"], aid),
        )
        if cur.fetchone():
            cur.close()
            conn.close()
            return jsonify({"error": "Horário já ocupado"}), 409

    cur.execute(
        """UPDATE agendamentos SET nome=%s, telefone=%s, servico=%s, preco=%s,
           data=%s, horario=%s, barbeiro=%s, status=%s WHERE id=%s RETURNING *""",
        (
            data.get("nome"), data.get("telefone"), data.get("servico"), data.get("preco"),
            data.get("data"), data.get("horario"), data.get("barbeiro", "Qualquer"),
            data.get("status", "confirmado"), aid,
        ),
    )
    row = cur.fetchone()
    conn.commit()
    cur.close()
    conn.close()
    return jsonify(row_to_dict(row))


@app.route("/api/admin/agendamentos/<int:aid>/status", methods=["PATCH"])
@jwt_required()
def admin_alterar_status(aid):
    data = request.get_json()
    status = data.get("status")
    if status not in ("confirmado", "cancelado", "concluido"):
        return jsonify({"error": "Status inválido"}), 400

    conn = get_db()
    cur = conn.cursor()
    cur.execute("UPDATE agendamentos SET status = %s WHERE id = %s RETURNING *", (status, aid))
    row = cur.fetchone()
    conn.commit()
    cur.close()
    conn.close()
    return jsonify(row_to_dict(row))


@app.route("/api/admin/agendamentos", methods=["POST"])
@jwt_required()
def admin_criar_encaixe():
    data = request.get_json()
    conn = get_db()
    cur = conn.cursor()
    try:
        cur.execute(
            """INSERT INTO agendamentos (nome, telefone, servico, preco, data, horario, status, barbeiro)
               VALUES (%s,%s,%s,%s,%s,%s,'confirmado',%s) RETURNING *""",
            (
                data["nome"], data.get("telefone", ""), data.get("servico", "Encaixe"),
                data.get("preco", "—"), data["data"], data["horario"],
                data.get("barbeiro", "Qualquer"),
            ),
        )
        row = cur.fetchone()
        conn.commit()
    except UniqueViolation:
        conn.rollback()
        cur.close()
        conn.close()
        return jsonify({"error": "Horário já ocupado"}), 409

    cur.close()
    conn.close()
    return jsonify(row_to_dict(row)), 201


# ─── Auth ───────────────────────────────────────────
@app.route("/api/admin/login", methods=["POST"])
def admin_login():
    data = request.get_json()
    username = data.get("username", "")
    password = data.get("password", "")

    conn = get_db()
    cur = conn.cursor()
    cur.execute("SELECT * FROM admin_users WHERE username = %s", (username,))
    user = cur.fetchone()
    cur.close()
    conn.close()

    if not user or not check_password_hash(user["password_hash"], password):
        return jsonify({"error": "Usuário ou senha inválidos"}), 401

    token = create_access_token(identity=username)
    return jsonify({"token": token, "username": username})


@app.route("/api/admin/me")
@jwt_required()
def admin_me():
    return jsonify({"username": get_jwt_identity()})


# ─── Inicialização ──────────────────────────────────
with app.app_context():
    try:
        init_db()
    except Exception as e:
        print(f"Init DB falhou (configure DATABASE_URL): {e}")


if __name__ == "__main__":
    port = int(os.getenv("PORT", 5000))
    app.run(host="0.0.0.0", port=port, debug=True)
