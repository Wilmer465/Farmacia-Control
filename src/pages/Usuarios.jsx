import React, { useState, useEffect } from 'react';
import { inventarioApi } from '../services/inventarioApi.js';

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

  if (!esWilmer) {
    return (
      <div className="card" style={{ padding: '2rem', textAlign: 'center' }}>
        <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>🔒</div>
        <h2 style={{ color: '#dc2626', marginBottom: '0.5rem' }}>Acceso Restringido</h2>
        <p style={{ color: '#64748b' }}>
          Este módulo está reservado exclusivamente para la administración principal del sistema (Superadmin <strong>Wilmer</strong>).
        </p>
      </div>
    );
  }

  const rolFormSeleccionado = roles.find((r) => String(r.id) === String(formulario.rol_id));
  const esSuperadminForm = rolFormSeleccionado && rolFormSeleccionado.nombre === 'SUPERADMIN';

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      {/* Header del módulo */}
      <div style={{
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        flexWrap: 'wrap', gap: '1rem', background: '#fff', padding: '1.25rem 1.5rem',
        borderRadius: '12px', border: '1px solid #e2e8f0', boxShadow: '0 1px 3px rgba(0,0,0,0.05)'
      }}>
        <div>
          <h2 style={{ margin: 0, fontSize: '1.35rem', color: '#0f172a', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <span>👥</span> Gestión de Cuentas y Accesos
          </h2>
          <p style={{ margin: '0.25rem 0 0', color: '#64748b', fontSize: '0.85rem' }}>
            Panel exclusivo para el Superadministrador <strong>Wilmer</strong>. Control total de roles, credenciales y estados.
          </p>
        </div>

        <button
          type="button"
          onClick={abrirModalCrear}
          style={{
            display: 'flex', alignItems: 'center', gap: '0.5rem',
            backgroundColor: '#2563eb', color: '#fff', border: 'none',
            padding: '0.65rem 1.25rem', borderRadius: '8px', fontWeight: '600',
            cursor: 'pointer', fontSize: '0.9rem', transition: 'background 0.2s'
          }}
        >
          <span>➕</span> Nuevo Usuario
        </button>
      </div>

      {/* Alertas */}
      {mensajeExito && (
        <div style={{
          backgroundColor: '#ecfdf5', color: '#065f46', border: '1px solid #a7f3d0',
          padding: '0.75rem 1.25rem', borderRadius: '8px', fontSize: '0.9rem'
        }}>
          ✅ {mensajeExito}
        </div>
      )}
      {error && (
        <div style={{
          backgroundColor: '#fef2f2', color: '#991b1b', border: '1px solid #fecaca',
          padding: '0.75rem 1.25rem', borderRadius: '8px', fontSize: '0.9rem'
        }}>
          ⚠️ {error}
        </div>
      )}

      {/* Tabla de usuarios */}
      <div style={{
        background: '#fff', borderRadius: '12px', border: '1px solid #e2e8f0',
        boxShadow: '0 1px 3px rgba(0,0,0,0.05)', overflow: 'hidden'
      }}>
        {cargando ? (
          <div style={{ padding: '3rem', textAlign: 'center', color: '#64748b' }}>
            Cargando lista de usuarios...
          </div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.9rem' }}>
            <thead>
              <tr style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0', color: '#475569' }}>
                <th style={{ padding: '0.85rem 1.25rem' }}>ID</th>
                <th style={{ padding: '0.85rem 1.25rem' }}>Nombre</th>
                <th style={{ padding: '0.85rem 1.25rem' }}>Usuario</th>
                <th style={{ padding: '0.85rem 1.25rem' }}>Rol</th>
                <th style={{ padding: '0.85rem 1.25rem' }}>Sede Asignada</th>
                <th style={{ padding: '0.85rem 1.25rem' }}>Estado</th>
                <th style={{ padding: '0.85rem 1.25rem', textAlign: 'right' }}>Acciones</th>
              </tr>
            </thead>
            <tbody>
              {usuarios.map((u) => {
                const esFilaWilmer = u.username.toLowerCase() === 'wilmer';
                return (
                  <tr key={u.id} style={{ borderBottom: '1px solid #f1f5f9', transition: 'background 0.15s' }}>
                    <td style={{ padding: '0.85rem 1.25rem', color: '#64748b' }}>#{u.id}</td>
                    <td style={{ padding: '0.85rem 1.25rem', fontWeight: '500', color: '#0f172a' }}>
                      {u.nombre} {esFilaWilmer && <span style={{ fontSize: '0.75rem', background: '#dbeafe', color: '#1d4ed8', padding: '2px 6px', borderRadius: '4px', marginLeft: '6px' }}>TÚ</span>}
                    </td>
                    <td style={{ padding: '0.85rem 1.25rem', fontFamily: 'monospace', color: '#2563eb' }}>
                      {u.username}
                    </td>
                    <td style={{ padding: '0.85rem 1.25rem' }}>
                      <span style={{
                        padding: '3px 8px', borderRadius: '6px', fontSize: '0.78rem', fontWeight: '600',
                        background: u.rol_nombre === 'SUPERADMIN' ? '#fef3c7' : u.rol_nombre === 'ADMIN' ? '#ffedd5' : '#e0f2fe',
                        color: u.rol_nombre === 'SUPERADMIN' ? '#92400e' : u.rol_nombre === 'ADMIN' ? '#9a3412' : '#0369a1'
                      }}>
                        {u.rol_nombre}
                      </span>
                    </td>
                    <td style={{ padding: '0.85rem 1.25rem', color: '#475569' }}>
                      {u.sede_nombre ? (
                        <span>📍 {u.sede_nombre}</span>
                      ) : (
                        <span style={{ color: '#94a3b8', fontStyle: 'italic' }}>Global (Todas las sedes)</span>
                      )}
                    </td>
                    <td style={{ padding: '0.85rem 1.25rem' }}>
                      <span style={{
                        padding: '3px 8px', borderRadius: '6px', fontSize: '0.78rem', fontWeight: '600',
                        background: u.estado === 'ACTIVO' ? '#dcfce7' : '#fee2e2',
                        color: u.estado === 'ACTIVO' ? '#166534' : '#991b1b'
                      }}>
                        {u.estado}
                      </span>
                    </td>
                    <td style={{ padding: '0.85rem 1.25rem', textAlign: 'right' }}>
                      <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end' }}>
                        <button
                          type="button"
                          onClick={() => abrirModalEditar(u)}
                          style={{
                            padding: '4px 10px', fontSize: '0.8rem', borderRadius: '6px',
                            border: '1px solid #cbd5e1', background: '#fff', cursor: 'pointer'
                          }}
                        >
                          ✏️ Editar
                        </button>
                        {!esFilaWilmer && (
                          <button
                            type="button"
                            onClick={() => handleToggleEstado(u)}
                            style={{
                              padding: '4px 10px', fontSize: '0.8rem', borderRadius: '6px',
                              border: '1px solid #cbd5e1', background: u.estado === 'ACTIVO' ? '#fff1f2' : '#f0fdf4',
                              color: u.estado === 'ACTIVO' ? '#e11d48' : '#16a34a',
                              cursor: 'pointer'
                            }}
                          >
                            {u.estado === 'ACTIVO' ? 'Desactivar' : 'Activar'}
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* Modal Crear / Editar */}
      {modalAbierto && (
        <div style={{
          position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
          background: 'rgba(15, 23, 42, 0.6)', backdropFilter: 'blur(3px)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          zIndex: 9999, padding: '1rem'
        }}>
          <div style={{
            background: '#fff', borderRadius: '14px', width: '100%', maxWidth: '520px',
            boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.2)', overflow: 'hidden'
          }}>
            <div style={{
              padding: '1.25rem 1.5rem', borderBottom: '1px solid #e2e8f0',
              display: 'flex', justifyContent: 'space-between', alignItems: 'center'
            }}>
              <h3 style={{ margin: 0, fontSize: '1.15rem', color: '#0f172a' }}>
                {usuarioEditando ? `✏️ Editar Usuario: ${usuarioEditando.username}` : '➕ Crear Nuevo Usuario'}
              </h3>
              <button
                type="button"
                onClick={() => setModalAbierto(false)}
                style={{ background: 'none', border: 'none', fontSize: '1.25rem', cursor: 'pointer', color: '#64748b' }}
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleGuardar} style={{ padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              {errorModal && (
                <div style={{
                  backgroundColor: '#fef2f2', color: '#991b1b', border: '1px solid #fecaca',
                  padding: '0.65rem 1rem', borderRadius: '6px', fontSize: '0.85rem'
                }}>
                  ⚠️ {errorModal}
                </div>
              )}

              <div>
                <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: '600', color: '#334155', marginBottom: '0.35rem' }}>
                  Nombre Completo *
                </label>
                <input
                  type="text"
                  required
                  value={formulario.nombre}
                  onChange={(e) => setFormulario({ ...formulario, nombre: e.target.value })}
                  placeholder="Ej: Wilmer Díaz"
                  style={{ width: '100%', padding: '0.65rem 0.85rem', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '0.9rem' }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: '600', color: '#334155', marginBottom: '0.35rem' }}>
                  Nombre de Usuario (Login) *
                </label>
                <input
                  type="text"
                  required
                  disabled={!!usuarioEditando}
                  value={formulario.username}
                  onChange={(e) => setFormulario({ ...formulario, username: e.target.value })}
                  placeholder="Ej: farmaceutico_quibdo"
                  style={{
                    width: '100%', padding: '0.65rem 0.85rem', borderRadius: '6px',
                    border: '1px solid #cbd5e1', fontSize: '0.9rem',
                    backgroundColor: usuarioEditando ? '#f1f5f9' : '#fff'
                  }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: '600', color: '#334155', marginBottom: '0.35rem' }}>
                  {usuarioEditando ? 'Nueva Contraseña (dejar en blanco para no cambiar)' : 'Contraseña Inicial *'}
                </label>
                <input
                  type="password"
                  required={!usuarioEditando}
                  value={formulario.password}
                  onChange={(e) => setFormulario({ ...formulario, password: e.target.value })}
                  placeholder={usuarioEditando ? '••••••••' : 'Mínimo 6 caracteres'}
                  style={{ width: '100%', padding: '0.65rem 0.85rem', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '0.9rem' }}
                />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: '600', color: '#334155', marginBottom: '0.35rem' }}>
                    Rol *
                  </label>
                  <select
                    disabled={usuarioEditando && usuarioEditando.username.toLowerCase() === 'wilmer'}
                    value={formulario.rol_id}
                    onChange={(e) => setFormulario({ ...formulario, rol_id: e.target.value })}
                    style={{
                      width: '100%', padding: '0.65rem 0.85rem', borderRadius: '6px',
                      border: '1px solid #cbd5e1', fontSize: '0.9rem',
                      backgroundColor: (usuarioEditando && usuarioEditando.username.toLowerCase() === 'wilmer') ? '#f1f5f9' : '#fff'
                    }}
                  >
                    {roles.map((r) => (
                      <option key={r.id} value={r.id}>{r.nombre}</option>
                    ))}
                  </select>
                  {usuarioEditando && usuarioEditando.username.toLowerCase() === 'wilmer' && (
                    <small style={{ color: '#64748b', fontSize: '0.75rem', marginTop: '4px', display: 'block' }}>
                      Tu rol de Superadmin está protegido y no puede modificarse.
                    </small>
                  )}
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: '600', color: '#334155', marginBottom: '0.35rem' }}>
                    Sede
                  </label>
                  <select
                    disabled={esSuperadminForm}
                    value={formulario.sede_id}
                    onChange={(e) => setFormulario({ ...formulario, sede_id: e.target.value })}
                    style={{
                      width: '100%', padding: '0.65rem 0.85rem', borderRadius: '6px',
                      border: '1px solid #cbd5e1', fontSize: '0.9rem',
                      backgroundColor: esSuperadminForm ? '#f1f5f9' : '#fff'
                    }}
                  >
                    <option value="">{esSuperadminForm ? 'Global (Sin sede)' : '-- Seleccionar Sede --'}</option>
                    {sedes.map((s) => (
                      <option key={s.id} value={s.id}>{s.nombre}</option>
                    ))}
                  </select>
                </div>
              </div>

              {usuarioEditando && (
                <div>
                  <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: '600', color: '#334155', marginBottom: '0.35rem' }}>
                    Estado
                  </label>
                  <select
                    value={formulario.estado}
                    disabled={usuarioEditando.username.toLowerCase() === 'wilmer'}
                    onChange={(e) => setFormulario({ ...formulario, estado: e.target.value })}
                    style={{ width: '100%', padding: '0.65rem 0.85rem', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '0.9rem' }}
                  >
                    <option value="ACTIVO">ACTIVO</option>
                    <option value="INACTIVO">INACTIVO</option>
                  </select>
                </div>
              )}

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', marginTop: '1rem' }}>
                <button
                  type="button"
                  onClick={() => setModalAbierto(false)}
                  style={{
                    padding: '0.65rem 1.2rem', borderRadius: '8px', border: '1px solid #cbd5e1',
                    background: '#fff', cursor: 'pointer', fontWeight: '500'
                  }}
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={guardando}
                  style={{
                    padding: '0.65rem 1.25rem', borderRadius: '8px', border: 'none',
                    background: '#2563eb', color: '#fff', cursor: 'pointer', fontWeight: '600'
                  }}
                >
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
