import sqlite3, sys

DB = r'data\farmacia.db'
conn = sqlite3.connect(DB)
c = conn.cursor()

print('=== SEDES ACTUALES ===')
for row in c.execute('SELECT id, nombre, ciudad FROM sedes ORDER BY id'):
    print('  ID={} | {} | {}'.format(row[0], row[1], row[2]))

rol = c.execute("SELECT id FROM roles WHERE nombre='INVENTARIO'").fetchone()
if not rol:
    print('ERROR: No existe rol INVENTARIO')
    sys.exit(1)
rol_id = rol[0]
print('\nRol INVENTARIO id={}'.format(rol_id))

def get_or_create_sede(nombre, ciudad):
    sedes = c.execute('SELECT id, nombre, ciudad FROM sedes').fetchall()
    for s in sedes:
        if ciudad.lower() in s[2].lower() or ciudad.lower() in s[1].lower():
            print('Sede encontrada: {} (ID={})'.format(s[1], s[0]))
            return s[0]
    c.execute("INSERT INTO sedes (nombre, ciudad, estado) VALUES (?, ?, 'ACTIVO')", (nombre, ciudad))
    sid = c.lastrowid
    print('Sede creada: {} (ID={})'.format(nombre, sid))
    return sid

sede_quibdo   = get_or_create_sede('Sede Quibdo',  'Quibdo')
sede_medellin = get_or_create_sede('Sede Medellin', 'Medellin')

HASH_QUIBDO   = ''
HASH_MEDELLIN = '.pOT6FN78q3DIQvi'

usuarios = [
    ('Inventario Quibdo',   'inv_quibdo',   HASH_QUIBDO,   sede_quibdo,   'Quibdo'),
    ('Inventario Medellin', 'inv_medellin', HASH_MEDELLIN, sede_medellin, 'Medellin'),
]

print('\n=== CREANDO USUARIOS ===')
for nombre, username, ph, sede_id, sede_nombre in usuarios:
    existe = c.execute('SELECT id FROM usuarios WHERE username=?', (username,)).fetchone()
    if existe:
        print('YA EXISTE: {} (ID={})'.format(username, existe[0]))
        continue
    c.execute(
        'INSERT INTO usuarios (nombre, username, password_hash, rol_id, sede_id, estado) VALUES (?,?,?,?,?,?)',
        (nombre, username, ph, rol_id, sede_id, 'ACTIVO')
    )
    print('CREADO: {} | Sede: {} (ID={})'.format(username, sede_nombre, sede_id))

conn.commit()
conn.close()
print('\nListo!')
