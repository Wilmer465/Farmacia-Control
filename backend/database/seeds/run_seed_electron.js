const { app } = require('electron');
const { generarRegistrosAleatorios } = require('./generate_1000_random_records');

app.whenReady().then(() => {
  try {
    generarRegistrosAleatorios();
    console.log('SEED_EXITO');
  } catch (err) {
    console.error('SEED_ERROR:', err);
  } finally {
    app.quit();
    process.exit(0);
  }
});
