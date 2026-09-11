function validarLogin({ username, password }) {
  const errores = [];
  if (!username || typeof username !== 'string' || username.trim().length === 0) {
    errores.push('El usuario es obligatorio.');
  }
  if (!password || typeof password !== 'string' || password.length < 4) {
    errores.push('La contraseña es obligatoria y debe tener al menos 4 caracteres.');
  }
  return { valido: errores.length === 0, errores };
}

module.exports = { validarLogin };
