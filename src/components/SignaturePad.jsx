import React, { useRef, useState, useCallback, useEffect } from 'react';
import { inventarioApi } from '../services/inventarioApi.js';

export default function SignaturePad({
  onChange,
  valorInicial = null,
  usuarioSesion = null,
  nombreFirmante = '',
  documentoFirmante = '',
  motivoFirma = 'Recepción de medicamentos'
}) {
  const canvasRef = useRef(null);
  const dibujando = useRef(false);
  const [tieneTrazo, setTieneTrazo] = useState(Boolean(valorInicial));
  const [origenFirma, setOrigenFirma] = useState(null); // 'pad' | 'manual' | null
  const [capturandoPad, setCapturandoPad] = useState(false);
  const [errorPad, setErrorPad] = useState(null);

  useEffect(() => {
    if (!valorInicial || !canvasRef.current) return;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    const img = new Image();
    img.onload = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      setTieneTrazo(true);
    };
    img.src = valorInicial;
  }, [valorInicial]);

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
    setOrigenFirma('manual');
    emitirCambio();
  }

  const emitirCambio = useCallback(() => {
    const dataUrl = canvasRef.current.toDataURL('image/png');
    onChange(dataUrl);
  }, [onChange]);

  // Firma capturada en el pad Wacom STU-540 (STU SDK directo vía IPC/main).
  // Se dibuja en el canvas (vista previa) y se emite el mismo PNG que el
  // trazo manual. El canvas sigue disponible como alternativa.
  async function firmarEnPad() {
    if (capturandoPad) return;
    setCapturandoPad(true);
    setErrorPad(null);
    try {
      const res = await inventarioApi.firmaPad.capturar(usuarioSesion, {
        nombre: nombreFirmante,
        documento: documentoFirmante,
        motivo: motivoFirma
      });
      if (!res || !res.ok) {
        setErrorPad(res?.error || 'No se pudo firmar en el pad. Dibuje en el recuadro.');
        return;
      }
      const canvas = canvasRef.current;
      const ctx = canvas.getContext('2d');
      const img = new Image();
      img.onload = () => {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        setTieneTrazo(true);
        setOrigenFirma('pad');
        onChange(res.data.dataUrl);
      };
      img.onerror = () => setErrorPad('No se pudo mostrar la firma del pad.');
      img.src = res.data.dataUrl;
    } catch (err) {
      setErrorPad('No se pudo firmar en el pad. Dibuje en el recuadro.');
    } finally {
      setCapturandoPad(false);
    }
  }

  function limpiar() {
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    setTieneTrazo(false);
    setOrigenFirma(null);
    setErrorPad(null);
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
        <span className="page-scope">
          {tieneTrazo
            ? (origenFirma === 'pad' ? 'Firma capturada en pad STU-540' : 'Firma capturada')
            : 'Firme en el recuadro'}
        </span>
        <button
          type="button"
          className="btn-secundario"
          onClick={firmarEnPad}
          disabled={capturandoPad}
          title="Capturar la firma en el pad Wacom STU-540"
        >
          {capturandoPad ? 'Firmando en el pad… (cancele en el pad)' : 'Firmar en pad'}
        </button>
        <button type="button" className="btn-secundario" onClick={limpiar}>Limpiar</button>
      </div>
      {errorPad && (
        <div className="form-error" role="alert">{errorPad}</div>
      )}
    </div>
  );
}
