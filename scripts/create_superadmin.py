import sqlite3
import subprocess
from pathlib import Path


DB_PATH = Path(__file__).resolve().parents[1] / "data" / "farmacia.db"
USERNAME = "superadmin123"
PASSWORD = "Superadmin123*"

ROLES = [
    ("SUPERADMIN", "Control total del sistema, todas las sedes"),
    ("ADMIN", "Responsable de una sede"),
    ("INVENTARIO", "Gestion de inventario y despachos de su sede"),
    ("USUARIO", "Solo consulta"),
]


def generar_hash(password):
    script = (
        "const bcrypt=require('bcryptjs');"
        f"console.log(bcrypt.hashSync({password!r}, 10));"
    )
    result = subprocess.run(
        ["node", "-e", script],
        cwd=DB_PATH.parents[0],
        check=True,
        capture_output=True,
        text=True,
    )
    return result.stdout.strip()


def main():
    password_hash = generar_hash(PASSWORD)
    con = sqlite3.connect(DB_PATH)
    try:
        cur = con.cursor()
        cur.executemany(
            "INSERT OR IGNORE INTO roles (nombre, descripcion) VALUES (?, ?)",
            ROLES,
        )
        rol_id = cur.execute(
            "SELECT id FROM roles WHERE nombre = 'SUPERADMIN'"
        ).fetchone()[0]
        existente = cur.execute(
            "SELECT id FROM usuarios WHERE LOWER(username) = LOWER(?)",
            (USERNAME,),
        ).fetchone()

        if existente:
            cur.execute(
                """
                UPDATE usuarios
                SET nombre = ?,
                    password_hash = ?,
                    rol_id = ?,
                    sede_id = NULL,
                    estado = 'ACTIVO'
                WHERE id = ?
                """,
                ("Administrador General", password_hash, rol_id, existente[0]),
            )
        else:
            cur.execute(
                """
                INSERT INTO usuarios (nombre, username, password_hash, rol_id, sede_id, estado)
                VALUES (?, ?, ?, ?, NULL, 'ACTIVO')
                """,
                ("Administrador General", USERNAME, password_hash, rol_id),
            )

        con.commit()
        print(f"Superadmin listo: usuario={USERNAME}")
    finally:
        con.close()


if __name__ == "__main__":
    main()
