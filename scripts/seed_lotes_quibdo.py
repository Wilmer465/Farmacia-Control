import sqlite3

conn = sqlite3.connect(r'data\farmacia.db')
c = conn.cursor()

# Insertar lotes para Quibdo (sede_id=5)
lotes_quibdo = [
    (102, 5, 'QBD-L001', '2026-01-10', '2027-12-31', 10, 0, 200), # Paracetamol 500mg (20 un/caja * 10 = 200)
    (103, 5, 'QBD-L002', '2026-02-15', '2027-10-30', 15, 0, 450), # Ibuprofeno 400mg (30 un/caja * 15 = 450)
    (105, 5, 'QBD-L003', '2026-03-01', '2028-05-15', 20, 0, 400), # Amoxicilina 500mg (20 un/caja * 20 = 400)
]

for med_id, sede_id, num_lote, f_exp, f_venc, c_cajas, c_sueltas, c_total in lotes_quibdo:
    c.execute('''
        INSERT OR IGNORE INTO lotes 
        (medicamento_id, sede_id, numero_lote, fecha_expedicion, fecha_vencimiento, cantidad_cajas, cantidad_unidades_sueltas, cantidad_total_unidades)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    ''', (med_id, sede_id, num_lote, f_exp, f_venc, c_cajas, c_sueltas, c_total))
    
    lote_id = c.lastrowid
    if lote_id:
        c.execute('''
            INSERT INTO movimientos_inventario (lote_id, medicamento_id, sede_id, tipo, cantidad, usuario_id)
            VALUES (?, ?, ?, 'ENTRADA', ?, 8)
        ''', (lote_id, med_id, sede_id, c_total))

conn.commit()

print('=== LOTES EN QUIBDO CREADOS/VERIFICADOS ===')
for row in c.execute('SELECT l.id, l.numero_lote, m.nombre, l.cantidad_total_unidades FROM lotes l JOIN medicamentos m ON m.id = l.medicamento_id WHERE l.sede_id = 5'):
    print(row)

conn.close()
