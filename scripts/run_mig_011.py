import sqlite3

conn = sqlite3.connect(r'data\farmacia.db')
c = conn.cursor()

# Verificar columnas de receptores
colsR = [row[1] for row in c.execute('PRAGMA table_info(receptores)').fetchall()]
if 'email' not in colsR:
    c.execute('ALTER TABLE receptores ADD COLUMN email TEXT;')
if 'telefono' not in colsR:
    c.execute('ALTER TABLE receptores ADD COLUMN telefono TEXT;')

# Verificar columnas de entregas
colsE = [row[1] for row in c.execute('PRAGMA table_info(entregas)').fetchall()]
if 'receptor_telefono' not in colsE:
    c.execute('ALTER TABLE entregas ADD COLUMN receptor_telefono TEXT;')
if 'receptor_email' not in colsE:
    c.execute('ALTER TABLE entregas ADD COLUMN receptor_email TEXT;')

c.execute("INSERT OR IGNORE INTO migrations (nombre) VALUES ('011_receptor_contacto');")

conn.commit()
print("Migración 011 aplicada con éxito.")
conn.close()
