import sqlite3
from pathlib import Path


DB_PATH = Path(__file__).resolve().parents[1] / "data" / "farmacia.db"
PRESERVE_TABLES = {"migrations"}


def quote_identifier(name):
    return '"' + name.replace('"', '""') + '"'


def main():
    con = sqlite3.connect(DB_PATH)
    try:
        cur = con.cursor()
        cur.execute("PRAGMA foreign_keys = OFF")
        tables = [
            row[0]
            for row in cur.execute(
                """
                SELECT name
                FROM sqlite_master
                WHERE type = 'table'
                AND name NOT LIKE 'sqlite_%'
                ORDER BY name
                """
            )
        ]

        deleted = {}
        for table in tables:
            if table in PRESERVE_TABLES:
                continue
            before = cur.execute(f"SELECT COUNT(*) FROM {quote_identifier(table)}").fetchone()[0]
            cur.execute(f"DELETE FROM {quote_identifier(table)}")
            deleted[table] = before

        cur.execute("PRAGMA foreign_keys = ON")
        con.commit()
        cur.execute("VACUUM")
        con.commit()

        print(f"Base de datos limpiada: {DB_PATH}")
        for table, count in deleted.items():
            print(f"{table}: {count} registros eliminados")
    finally:
        con.close()


if __name__ == "__main__":
    main()
