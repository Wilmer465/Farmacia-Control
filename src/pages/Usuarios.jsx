import React, { useState, useEffect } from 'react';
import { inventarioApi } from '../services/inventarioApi.js';
import { useEscapeCerrarModal } from '../hooks/useEscapeCerrarModal.js';

// Tono de la insignia de rol. El color no se calcula en el JSX: se elige la
// clase y el CSS resuelve el par fondo/texto de la escala semántica.
const ROL_CLASE = {
  SUPERADMIN: 'pill pill-rol-superadmin',
  ADMIN: 'pill pill-rol-admin',
  default: 'pill pill-rol-otro'
};

function claseRol(rolNombre) {
  return ROL_CLASE[rolNombre] || ROL_CLASE.default;
}

export default function Usuarios({ usuario }) {
  const [usuarios, setUsuarios] = useState([]);
  const [roles, setRoles] = useState([]);
  const [sedes, setSedes] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState(null);
  const [mensajeExito, setMensajeExito] = useState(null);

  // Modal crear/editar
  const [modalAbierto, setModalAbierto] = useState(false);
  const [usuarioEditando, setUsuarioEditando] = useState(null);
  const [formulario, setFormulario] = useState({
    nombre: '',
    username: '',
    password: '',
    rol_id: '',
    sede_id: '',
    estado: 'ACTIVO'
  });
  const [guardando, setGuardando] = useState(false);
  const [errorModal, setErrorModal] = useState(null);

  const esWilmer = usuario && usuario.rol_nombre === 'SUPERADMIN' && String(usuario.username || '').toLowerCase().trim() === 'wilmer';

  useEffect(() => {
    if (!esWilmer) return;
    cargarDatos();
  }, [esWilmer]);

  useEscapeCerrarModal(() => setModalAbierto(false), modalAbierto);

  async function cargarDatos() {
    setCargando(true);
    setError(null);
    try {
      const [resUsers, resRoles, resSedes] = await Promise.all([
        inventarioApi.usuarios.listar(usuario),
        inventarioApi.usuarios.listarRoles(usuario),
        inventarioApi.sedes.listar()
      ]);

      if (resUsers.ok) setUsuarios(resUsers.data || []);
      else setError(resUsers.error);

      if (resRoles.ok) setRoles(resRoles.data || []);
      if (resSedes.ok) setSedes(resSedes.data || []);
    } catch (err) {
      setError('Error al cargar información de usuarios.');
    } finally {
      setCargando(false);
    }
  }

  function abrirModalCrear() {
    setUsuarioEditando(null);
    setFormulario({
      nombre: '',
      username: '',
      password: '',
      rol_id: roles.length > 0 ? String(roles[0].id) : '',
      sede_id: '',
      estado: 'ACTIVO'
    });
    setErrorModal(null);
    setModalAbierto(true);
  }

  function abrirModalEditar(u) {
    setUsuarioEditando(u);
    setFormulario({
      nombre: u.nombre || '',
      username: u.username || '',
      password: '', // Dejar en blanco para no cambiar
      rol_id: String(u.rol_id || ''),
      sede_id: u.sede_id ? String(u.sede_id) : '',
      estado: u.estado || 'ACTIVO'
    });
    setErrorModal(null);
    setModalAbierto(true);
  }

  async function handleGuardar(e) {
    e.preventDefault();
    setErrorModal(null);
    setGuardando(true);

    try {
      const rolSeleccionado = roles.find((r) => String(r.id) === String(formulario.rol_id));
      const esRolSuperadmin = rolSeleccionado && rolSeleccionado.nombre === 'SUPERADMIN';

      const payload = {
        nombre: formulario.nombre.trim(),
        username: formulario.username.trim(),
        password: formulario.password,
        rol_id: Number(formulario.rol_id),
        sede_id: esRolSuperadmin ? null : (formulario.sede_id ? Number(formulario.sede_id) : null),
        estado: formulario.estado
      };

      if (!esRolSuperadmin && !payload.sede_id) {
        setErrorModal('Los usuarios que no son Superadmin deben tener una sede asignada.');
        setGuardando(false);
        return;
      }

      if (usuarioEditando) {
        const res = await inventarioApi.usuarios.actualizar(usuario, usuarioEditando.id, payload);
        if (!res.ok) {
          setErrorModal(res.error);
          setGuardando(false);
          return;
        }
        setMensajeExito(`Usuario '${res.data.username}' actualizado correctamente.`);
      } else {
        if (!payload.password || payload.password.length < 6) {
          setErrorModal('La contraseña inicial debe tener al menos 6 caracteres.');
          setGuardando(false);
          return;
        }
        const res = await inventarioApi.usuarios.crear(usuario, payload);
        if (!res.ok) {
          setErrorModal(res.error);
          setGuardando(false);
          return;
        }
        setMensajeExito(`Usuario '${res.data.username}' creado con éxito.`);
      }

      setModalAbierto(false);
      await cargarDatos();
      setTimeout(() => setMensajeExito(null), 4000);
    } catch (err) {
      setErrorModal('Error al guardar el usuario.');
    } finally {
      setGuardando(false);
    }
  }

  async function handleToggleEstado(u) {
    if (u.username.toLowerCase() === 'wilmer') {
      alert('No puedes desactivar tu propia cuenta principal de Superadmin.');
      return;
    }

    const nuevoEstado = u.estado === 'ACTIVO' ? 'INACTIVO' : 'ACTIVO';
    const confirmar = window.confirm(`¿Estás seguro de que deseas marcar como ${nuevoEstado} al usuario '${u.username}'?`);
    if (!confirmar) return;

    try {
      const res = await inventarioApi.usuarios.cambiarEstado(usuario, u.id, nuevoEstado);
      if (res.ok) {
        setMensajeExito(`Estado del usuario '${u.username}' cambiado a ${nuevoEstado}.`);
        await cargarDatos();
        setTimeout(() => setMensajeExito(null), 4000);
      } else {
        alert(res.error || 'Error al cambiar estado.');
      }
    } catch (err) {
      alert('Error de conexión al cambiar estado.');
    }
  }

  // Eliminación definitiva = anonimización, no borrado. Por eso la doble
  // confirmación: la fila desaparece del listado y sus credenciales dejan de
  // servir, aunque el histórico de auditoría se conserva intacto.
  async function handleEliminarDefinitivo(u) {
    if (u.username.toLowerCase() === 'wilmer') {
      alert('No puedes eliminar la cuenta principal de Superadmin.');
      return;
    }

    const primera = window.confirm(
      `¿Eliminar definitivamente a '${u.nombre}' (${u.username})?\n\n` +
      'La cuenta se anonimiza: sus credenciales dejan de funcionar y desaparece de los listados.\n' +
      'El histórico de auditoría, órdenes y despachos se conserva.'
    );
    if (!primera) return;

    // Segunda confirmación: es la única operación de la pantalla que no se puede
    // deshacer ni siquiera desde la propia interfaz.
    const segunda = window.confirm(
      `Última confirmación: la eliminación de '${u.username}' es irreversible.\n\n` +
      '¿Continuar?'
    );
    if (!segunda) return;

    try {
      const res = await inventarioApi.usuarios.eliminarDefinitivo(usuario, u.id);
      if (res.ok) {
        setMensajeExito(`Usuario eliminado definitivamente. Su histórico se conserva.`);
        await cargarDatos();
        setTimeout(() => setMensajeExito(null), 5000);
      } else {
        alert(res.error || 'Error al eliminar el usuario.');
      }
    } catch (err) {
      alert('Error de conexión al eliminar el usuario.');
    }
  }

  if (!esWilmer) {
    return (
      <div className="card card-acceso-restringido">
        <h2>Acceso Restringido</h2>
        <p>
          Este módulo está reservado exclusivamente para la administración principal del sistema (Superadmin <strong>Wilmer</strong>).
        </p>
      </div>
    );
  }

  const rolFormSeleccionado = roles.find((r) => String(r.id) === String(formulario.rol_id));
  const esSuperadminForm = rolFormSeleccionado && rolFormSeleccionado.nombre === 'SUPERADMIN';

  // La cuenta principal no se puede degradar ni desactivar desde su propia fila.
  const esFilaWilmer = usuarioEditando && usuarioEditando.username.toLowerCase() === 'wilmer';
  const bloqueadoPorProtegido = Boolean(usuarioEditando && esFilaWilmer);

  return (
    <div className="page-container usuarios-view">
      <div className="page-header-row">
        <div>
          <h2>Gestión de Cuentas y Accesos</h2>
          <p className="page-scope">
            Panel exclusivo para el Superadministrador <strong>Wilmer</strong>. Control total de roles, credenciales y estados.
          </p>
        </div>

        <div className="header-actions">
          <button type="button" className="btn-primario" onClick={abrirModalCrear}>
            <span aria-hidden="true">+</span> Nuevo Usuario
          </button>
        </div>
      </div>

      {mensajeExito && <div className="aviso-ok">{mensajeExito}</div>}
      {error && <div className="aviso-error">{error}</div>}

      <div className="table-card">
        <div className="table-responsive">
          {cargando ? (
            <div className="loading-state loading-state-compact">Cargando lista de usuarios...</div>
          ) : usuarios.length === 0 ? (
            <div className="tabla-vacia">No hay usuarios registrados.</div>
          ) : (
            <table className="tabla">
              <thead>
                <tr>
                  <th>ID</th>
                  <th>Nombre</th>
                  <th>Usuario</th>
                  <th>Rol</th>
                  <th>Sede Asignada</th>
                  <th>Estado</th>
                  <th className="tabla-acciones">Acciones</th>
                </tr>
              </thead>
              <tbody>
                {usuarios.map((u) => {
                  const esPrincipal = u.username.toLowerCase() === 'wilmer';
                  return (
                    <tr key={u.id}>
                      <td className="celda-texto-suave">#{u.id}</td>
                      <td>
                        <strong>{u.nombre}</strong>{' '}
                        {esPrincipal && <span className="pill pill-marcador">TÚ</span>}
                      </td>
                      <td><span className="mono-tag mono-tag-acento">{u.username}</span></td>
                      <td><span className={claseRol(u.rol_nombre)}>{u.rol_nombre}</span></td>
                      <td className="celda-texto-suave">
                        {u.sede_nombre ? u.sede_nombre : <em className="celda-vacia">Global (Todas las sedes)</em>}
                      </td>
                      <td>
                        <span className={`pill ${u.estado === 'ACTIVO' ? 'estado-verde' : 'estado-rojo'}`}>
                          {u.estado}
                        </span>
                      </td>
                      <td className="acciones">
                        <button
                          type="button"
                          className="btn-secundario btn-tabla"
                          onClick={() => abrirModalEditar(u)}
                          title="Editar datos de la cuenta"
                        >
                          Editar
                        </button>
                        {!esPrincipal && (
                          <button
                            type="button"
                            className={`btn-secundario btn-tabla ${u.estado === 'ACTIVO' ? 'btn-estado-baja' : 'btn-estado-alta'}`}
                            onClick={() => handleToggleEstado(u)}
                            title={u.estado === 'ACTIVO' ? 'Desactivar la cuenta' : 'Reactivar la cuenta'}
                          >
                            {u.estado === 'ACTIVO' ? 'Desactivar' : 'Activar'}
                          </button>
                        )}
                        {!esPrincipal && (
                          <button
                            type="button"
                            className="btn-peligro btn-tabla"
                            onClick={() => handleEliminarDefinitivo(u)}
                            title="Anonimiza la cuenta y conserva el histórico de auditoría"
                          >
                            Eliminar
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {modalAbierto && (
        <div className="modal-overlay" onClick={() => setModalAbierto(false)}>
          <div className="modal-card modal-md" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header-row">
              <h3>
                {usuarioEditando ? `Editar Usuario: ${usuarioEditando.username}` : 'Crear Nuevo Usuario'}
              </h3>
              <button
                type="button"
                className="modal-close-x"
                onClick={() => setModalAbierto(false)}
                title="Cerrar"
              >
                ×
              </button>
            </div>

            <form onSubmit={handleGuardar}>
              {errorModal && <div className="aviso-error">{errorModal}</div>}

              <div className="form-grid">
                <div className="form-field">
                  <label className="form-label" htmlFor="usuario-nombre">Nombre Completo *</label>
                  <input
                    id="usuario-nombre"
                    className="form-input"
                    type="text"
                    required
                    value={formulario.nombre}
                    onChange={(e) => setFormulario({ ...formulario, nombre: e.target.value })}
                    placeholder="Ej: Wilmer Díaz"
                  />
                </div>

                <div className="form-field">
                  <label className="form-label" htmlFor="usuario-username">Nombre de Usuario (Login) *</label>
                  <input
                    id="usuario-username"
                    className="form-input"
                    type="text"
                    required
                    disabled={!!usuarioEditando}
                    value={formulario.username}
                    onChange={(e) => setFormulario({ ...formulario, username: e.target.value })}
                    placeholder="Ej: farmaceutico_quibdo"
                  />
                </div>

                <div className="form-field">
                  <label className="form-label" htmlFor="usuario-password">
                    {usuarioEditando ? 'Nueva Contraseña (dejar en blanco para no cambiar)' : 'Contraseña Inicial *'}
                  </label>
                  <input
                    id="usuario-password"
                    className="form-input"
                    type="password"
                    required={!usuarioEditando}
                    value={formulario.password}
                    onChange={(e) => setFormulario({ ...formulario, password: e.target.value })}
                    placeholder={usuarioEditando ? 'Dejar vacío para conservar' : 'Mínimo 6 caracteres'}
                  />
                </div>

                <div className="form-field">
                  <label className="form-label" htmlFor="usuario-rol">Rol *</label>
                  <select
                    id="usuario-rol"
                    className="form-select"
                    disabled={bloqueadoPorProtegido}
                    value={formulario.rol_id}
                    onChange={(e) => setFormulario({ ...formulario, rol_id: e.target.value })}
                  >
                    {roles.map((r) => (
                      <option key={r.id} value={r.id}>{r.nombre}</option>
                    ))}
                  </select>
                  {bloqueadoPorProtegido && (
                    <small className="form-hint">
                      Tu rol de Superadmin está protegido y no puede modificarse.
                    </small>
                  )}
                </div>

                <div className="form-field">
                  <label className="form-label" htmlFor="usuario-sede">Sede</label>
                  <select
                    id="usuario-sede"
                    className="form-select"
                    disabled={esSuperadminForm}
                    value={formulario.sede_id}
                    onChange={(e) => setFormulario({ ...formulario, sede_id: e.target.value })}
                  >
                    <option value="">{esSuperadminForm ? 'Global (Sin sede)' : '-- Seleccionar Sede --'}</option>
                    {sedes.map((s) => (
                      <option key={s.id} value={s.id}>{s.nombre}</option>
                    ))}
                  </select>
                </div>

                {usuarioEditando && (
                  <div className="form-field">
                    <label className="form-label" htmlFor="usuario-estado">Estado</label>
                    <select
                      id="usuario-estado"
                      className="form-select"
                      value={formulario.estado}
                      disabled={bloqueadoPorProtegido}
                      onChange={(e) => setFormulario({ ...formulario, estado: e.target.value })}
                    >
                      <option value="ACTIVO">ACTIVO</option>
                      <option value="INACTIVO">INACTIVO</option>
                    </select>
                  </div>
                )}
              </div>

              <div className="form-actions form-actions-modal">
                <button
                  type="button"
                  className="btn-secundario"
                  onClick={() => setModalAbierto(false)}
                  disabled={guardando}
                >
                  Cancelar
                </button>
                <button type="submit" className="btn-primario" disabled={guardando}>
                  {guardando ? 'Guardando...' : (usuarioEditando ? 'Guardar Cambios' : 'Crear Usuario')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
