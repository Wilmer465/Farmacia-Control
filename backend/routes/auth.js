const express = require('express');
const authController = require('../controllers/authController');
const { obtenerToken, conSesionHttp } = require('../middleware/authHttp');

const router = express.Router();

const ESTADOS_POR_CODIGO = {
  VALIDACION: 400,
  SIN_TOKEN: 401,
  SESION_INVALIDA: 401,
  CREDENCIALES_INVALIDAS: 401,
  SEDE_NO_ASIGNADA: 401,
  CUENTA_BLOQUEADA: 429
};

function responder(res, resultado) {
  if (resultado.ok) {
    return res.status(200).json(resultado);
  }
  const estado = ESTADOS_POR_CODIGO[resultado.code] || 401;
  return res.status(estado).json({
    ok: false,
    error: resultado.error,
    ...(resultado.code ? { code: resultado.code } : {})
  });
}

router.post('/login', (req, res) => {
  responder(res, authController.loginHttp(req.body));
});

router.post('/refresh', (req, res) => {
  responder(res, authController.refreshHttp(obtenerToken(req)));
});

router.post('/logout', (req, res) => {
  responder(res, authController.logoutHttp(obtenerToken(req)));
});

// Verifica el token opaco que devuelve login/refresh. Es la via para comprobar
// que una sesion creada en el escritorio Electron tambien vale en la app movil.
router.get('/session', conSesionHttp, (req, res) => {
  const { session_token, ...usuario } = req.usuarioSesion;
  res.status(200).json({ ok: true, data: { usuario, expires_in: authController.EXPIRES_IN } });
});

module.exports = router;
