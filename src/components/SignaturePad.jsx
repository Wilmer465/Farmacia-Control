import React, { useRef, useState, useCallback } from 'react';

export default function SignaturePad({ onChange }) {
  const canvasRef = useRef(null);
  const dibujando = useRef(false);
  const [tieneTrazo, setTieneTrazo] = useState(false);

  function coordenadas(e) {
    const rect = canvasRef.current.getBoundingClientRect();
    const punto = e.touches ? e.touches[0] : e;
    return { x: punto.clientX - rect.left, y: punto.clientY - rect.top };
  }

  function iniciarTrazo(e) {
    e.preventDefault();
    dibujando.current = true;
    const ctx = canvasRef.current.getContext('2d');
    const { x, y } = coordenadas(e);
    ctx.beginPath();
    ctx.moveTo(x, y);
  }

  function dibujar(e) {
    if (!dibujando.current) return;
    e.preventDefault();
    const ctx = canvasRef.current.getContext('2d');
    const { x, y } = coordenadas(e);
    ctx.lineTo(x, y);
    ctx.strokeStyle = '#1f2937';
    ctx.lineWidth = 2;
    ctx.lineCap = 'round';
    ctx.stroke();
    if (!tieneTrazo) setTieneTrazo(true);
  }

  function terminarTrazo() {
    if (!dibujando.current) return;
    dibujando.current = false;
    emitirCambio();
  }

  const emitirCambio = useCallback(() => {
    const dataUrl = canvasRef.current.toDataURL('image/png');
    onChange(dataUrl);
  }, [onChange]);

  function limpiar() {
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    setTieneTrazo(false);
    onChange(null);
  }

  return (
    <div className="signature-pad">
      <canvas
        ref={canvasRef}
        width={360}
        height={140}
        className="signature-canvas"
        onMouseDown={iniciarTrazo}
        onMouseMove={dibujar}
        onMouseUp={terminarTrazo}
        onMouseLeave={terminarTrazo}
        onTouchStart={iniciarTrazo}
        onTouchMove={dibujar}
        onTouchEnd={terminarTrazo}
      />
      <div className="signature-actions">
        <span className="page-scope">{tieneTrazo ? 'Firma capturada' : 'Firme en el recuadro'}</span>
        <button type="button" className="btn-secundario" onClick={limpiar}>Limpiar</button>
      </div>
    </div>
  );
}
