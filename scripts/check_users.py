import sqlite3
conn = sqlite3.connect(r'data\farmacia.db')
c = conn.cursor()
sql = 'SELECT u.id, u.nombre, u.username, r.nombre, s.nombre, s.ciudad, u.estado FROM usuarios u JOIN roles r ON r.id=u.rol_id LEFT JOIN sedes s ON s.id=u.sede_id WHERE u.username IN (?,?)'
rows = c.execute(sql, ('inv_quibdo', 'inv_medellin')).fetchall()
for row in rows:
    print(row)

# Tambien ver la sede asignada al usuario
print('\n--- Sede de inv_quibdo ---')
r = c.execute('SELECT u.username, u.sede_id, s.nombre, s.ciudad FROM usuarios u LEFT JOIN sedes s ON s.id=u.sede_id WHERE u.username=?', ('inv_quibdo',)).fetchone()
print(r)
print('--- Sede de inv_medellin ---')
r = c.execute('SELECT u.username, u.sede_id, s.nombre, s.ciudad FROM usuarios u LEFT JOIN sedes s ON s.id=u.sede_id WHERE u.username=?', ('inv_medellin',)).fetchone()
print(r)
conn.close()
