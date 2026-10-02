import { useEffect, useRef } from 'react';

// Un único listener de Escape para toda la aplicación.
//
// Cada página apila su función de cierre mientras tiene un modal abierto y la
// desapila al cerrarlo. El listener delega SOLO en el último de la pila, que es el
// modal visible: con un listener por modal, Escape cerraría todos a la vez. Esta
// pila es además la razón por la que no se añadió un `onKeyDown` suelto en cada
// overlay — no hay estado global de "qué modal está abierto" que mantener.
const pilaCierres = [];
let listenerInstalado = false;

function alPulsarTecla(evento) {
  if (evento.key !== 'Escape') return;
  const cerrar = pilaCierres[pilaCierres.length - 1];
  if (!cerrar) return;
  evento.preventDefault();
  cerrar();
}

function instalarListener() {
  if (listenerInstalado) return;
  window.addEventListener('keydown', alPulsarTecla);
  listenerInstalado = true;
}

// `alCerrar` es normalmente una arrow function inline, que cambia de identidad en
// cada render. Guardarla en un ref evita que la entrada de la pila se quite y se
// vuelva a apilar en cada render, conservando siempre el cierre más reciente.
export function useEscapeCerrarModal(alCerrar, abierto) {
  const refCierre = useRef(alCerrar);
  refCierre.current = alCerrar;

  useEffect(() => {
    if (!abierto) return undefined;

    const entrada = () => refCierre.current();
    pilaCierres.push(entrada);
    instalarListener();

    return () => {
      const indice = pilaCierres.indexOf(entrada);
      if (indice !== -1) pilaCierres.splice(indice, 1);
    };
  }, [abierto]);
}

export default useEscapeCerrarModal;
