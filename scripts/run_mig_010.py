import sqlite3

conn = sqlite3.connect(r'data\farmacia.db')
c = conn.cursor()

# Ejecutar migración 010
c.execute('''
  CREATE TABLE IF NOT EXISTS receptores (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    documento TEXT NOT NULL UNIQUE,
    nombre TEXT NOT NULL,
    telefono TEXT,
    firma_guardada TEXT,
    huella_guardada INTEGER NOT NULL DEFAULT 0,
    documento_adjunto_nombre TEXT,
    documento_adjunto_data TEXT,
    documento_adjunto_tipo TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
''')

c.execute('CREATE INDEX IF NOT EXISTS idx_receptores_documento ON receptores(documento);')
c.execute('CREATE INDEX IF NOT EXISTS idx_receptores_nombre ON receptores(nombre);')

# Verificar columnas de entregas
cols = [row[1] for row in c.execute('PRAGMA table_info(entregas)').fetchall()]
if 'documento_adjunto_nombre' not in cols:
    c.execute('ALTER TABLE entregas ADD COLUMN documento_adjunto_nombre TEXT;')
if 'documento_adjunto_data' not in cols:
    c.execute('ALTER TABLE entregas ADD COLUMN documento_adjunto_data TEXT;')
if 'documento_adjunto_tipo' not in cols:
    c.execute('ALTER TABLE entregas ADD COLUMN documento_adjunto_tipo TEXT;')

# Registrar en migrations
c.execute("INSERT OR IGNORE INTO migrations (nombre) VALUES ('010_receptores_y_documentos');")

conn.commit()
print("Migración 010 aplicada con éxito.")
conn.close()
