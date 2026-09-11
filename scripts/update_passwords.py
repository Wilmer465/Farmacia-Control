import sqlite3

conn = sqlite3.connect(r'data\farmacia.db')
c = conn.cursor()

# Hashes generados con bcrypt para Quibdo123* y Medellin123*
HASH_QUIBDO   = ''
HASH_MEDELLIN = '.pOT6FN78q3DIQvi'

c.execute('UPDATE usuarios SET password_hash = ? WHERE username = ?', (HASH_QUIBDO, 'inv_quibdo'))
c.execute('UPDATE usuarios SET password_hash = ? WHERE username = ?', (HASH_MEDELLIN, 'inv_medellin'))

conn.commit()

print("--- Usuarios Actualizados ---")
for row in c.execute('SELECT u.id, u.nombre, u.username, r.nombre, s.nombre, s.ciudad, u.estado FROM usuarios u JOIN roles r ON r.id = u.rol_id JOIN sedes s ON s.id = u.sede_id WHERE u.username IN (?, ?)', ('inv_quibdo', 'inv_medellin')):
    print(row)

conn.close()
