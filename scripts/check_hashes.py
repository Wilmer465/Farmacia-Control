import sqlite3
conn = sqlite3.connect(r'data\farmacia.db')
c = conn.cursor()
rows = c.execute('SELECT id, nombre, username, password_hash, created_at FROM usuarios WHERE username IN (?,?)', ('inv_quibdo','inv_medellin')).fetchall()
for r in rows:
    print('ID:', r[0], '| user:', r[2], '| created:', r[4])
    print('  hash:', r[3][:60], '...')
conn.close()
