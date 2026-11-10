// La importación histórica usó una tabla de staging persistente y dejó sus
// páginas como espacio libre. Recompactar una vez, con respaldo de startupRecovery.
module.exports = {
  name: '038_recompactar_catalogo_local',
  atomic: false,
  up(db) {
    db.exec('VACUUM');
    db.exec('ANALYZE');
  },
  down() {
    // VACUUM solo cambia la disposición física; no hay esquema que revertir.
  }
};
