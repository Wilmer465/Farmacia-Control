const { runMigrations } = require('./backend/database/migrate');
runMigrations().then(() => {
  console.log('Migraciones completadas');
  process.exit(0);
}).catch(e => {
  console.error(e);
  process.exit(1);
});