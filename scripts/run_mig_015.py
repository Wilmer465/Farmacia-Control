import pathlib
import sqlite3


DB_PATH = pathlib.Path(__file__).resolve().parents[1] / "data" / "farmacia.db"
MIGRATION_NAME = "015_pacientes_prioridad_medicamentos"


def main():
    con = sqlite3.connect(DB_PATH)
    cur = con.cursor()

    cols = [row[1] for row in cur.execute("PRAGMA table_info(receptores)")]

    if "prioridad" not in cols:
        cur.execute("ALTER TABLE receptores ADD COLUMN prioridad TEXT NOT NULL DEFAULT 'MEDIA'")
    if "medicamentos_uso" not in cols:
        cur.execute("ALTER TABLE receptores ADD COLUMN medicamentos_uso TEXT")
    if "notas" not in cols:
        cur.execute("ALTER TABLE receptores ADD COLUMN notas TEXT")

    cur.execute("CREATE INDEX IF NOT EXISTS idx_receptores_prioridad ON receptores(prioridad)")
    cur.execute("""
        CREATE TABLE IF NOT EXISTS migrations (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            nombre TEXT NOT NULL UNIQUE,
            ejecutado_en TEXT NOT NULL DEFAULT (datetime('now'))
        )
    """)
    cur.execute("INSERT OR IGNORE INTO migrations (nombre) VALUES (?)", (MIGRATION_NAME,))

    con.commit()
    con.close()
    print(f"Migracion aplicada: {MIGRATION_NAME}")


if __name__ == "__main__":
    main()
