import sqlite3

conn = sqlite3.connect(r'data\farmacia.db')
c = conn.cursor()

print('=== LOTES EN SEDE QUIBDO (ID=5) ===')
for row in c.execute('SELECT l.id, l.numero_lote, m.nombre, l.cantidad_total_unidades FROM lotes l JOIN medicamentos m ON m.id = l.medicamento_id WHERE l.sede_id = 5'):
    print(row)

print('=== LOTES EN SEDE MEDELLIN (ID=3) ===')
for row in c.execute('SELECT l.id, l.numero_lote, m.nombre, l.cantidad_total_unidades FROM lotes l JOIN medicamentos m ON m.id = l.medicamento_id WHERE l.sede_id = 3'):
    print(row)

conn.close()
