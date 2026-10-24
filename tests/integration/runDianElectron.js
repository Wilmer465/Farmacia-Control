require('./dianTransmission.electron.js').run().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
