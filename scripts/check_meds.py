import sqlite3

conn = sqlite3.connect(r'data\farmacia.db')
c = conn.cursor()

print('=== MEDICAMENTOS REGISTRADOS ===')
for row in c.execute('SELECT id, codigo, nombre, unidades_por_caja FROM medicamentos LIMIT 15'):
    print(row)

conn.close()
