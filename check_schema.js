const { getDb } = require('./backend/database/connection');
const db = getDb();

// Check catalogo_cum columns
const cols = db.prepare('PRAGMA table_info(catalogo_cum)').all();
console.log('catalogo_cum columns:');
cols.forEach(c => {
  console.log('  ' + c.name + ' pk:' + c.pk + ' notnull:' + c.notnull + ' dflt:' + c.dflt_value);
});

// Check for unique indexes
const idx = db.prepare("SELECT name, sql FROM sqlite_master WHERE type='index' AND tbl_name='catalogo_cum'").all();
console.log('\nIndexes on catalogo_cum:');
idx.forEach(i => console.log('  ' + i.name + ': ' + i.sql));

// Check for any unique indexes
const uniq = db.prepare("SELECT name, tbl_name, sql FROM sqlite_master WHERE type='index' AND sql LIKE '%UNIQUE%'").all();
console.log('\nAll unique indexes:');
uniq.forEach(u => console.log('  ' + u.name + ' on ' + u.tbl_name));

// Check if catalogo_cum has a unique constraint on cum
const cumIdx = idx.find(i => i.sql && i.sql.includes('UNIQUE') && i.sql.includes('cum'));
console.log('\nUnique constraint on cum in catalogo_cum:', cumIdx ? cumIdx.sql : 'none found');

// Count records in catalogo_cum
const count = db.prepare('SELECT COUNT(*) as cnt FROM catalogo_cum').get();
console.log('\nTotal records in catalogo_cum:', count.cnt);

// Check for existing duplicates
const dupes = db.prepare("SELECT cum, COUNT(*) as cnt FROM catalogo_cum WHERE cum IS NOT NULL GROUP BY cum HAVING COUNT(*) > 1 LIMIT 10").all();
console.log('\nDuplicate cum values in catalogo_cum:', dupes.length ? dupes.map(d => d.cum + ' (' + d.cnt + ')').join(', ') : 'none');
