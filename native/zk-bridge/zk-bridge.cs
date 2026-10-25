// Puente ZKTeco ZK9500 (libzkfp x64) para Farmacia-Control.
//
// Proceso helper x64, sin ventanas: P/Invoke por nombre contra la DLL oficial
// instalada por el driver o colocada junto al helper si su licencia lo permite.
// Firmas contrastadas estructuralmente con metadatos locales de
// libzkfpcsharp.dll (CallingConvention Winapi); la versión de ese wrapper no
// está vinculada aún a una versión oficial verificable de libzkfp.dll.
// Entrada por argumentos, salida por stdout
// como UNA línea JSON. stderr solo diagnóstico operativo.
//
// Alcance: CONSTANCIA de captura (huella presente + plantilla válida en
// memoria). No se guardan ni registran imágenes ni plantillas.
//
// Comandos:
//   detectar                       Init, cuenta lectores, abre el 0, lee
//                                  parámetros (106 = buffer imagen, captura
//                                  ancho/alto/dpi) y cierra todo.
//   capturar [--timeout S]         Espera el dedo hasta S s (defecto 30):
//                                  reintenta ante -8 (sin dedo); devuelve
//                                  constancia + tamaño de plantilla.
//   diagnostico [--timeout S]      Flujo completo: dos capturas + 1:1 con
//                                  ZKFPM_MatchFinger; reporta tamaños,
//                                  score y parámetros DB crudos. Sin
//                                  contenido de plantillas.
//
// Códigos de error (ok:false): SIN_LECTOR, APERTURA_FALLIDA, TIMEOUT_DEDO,
// ERROR_SDK, ERROR_INESPERADO.

using System;
using System.Collections.Generic;
using System.IO;
using System.Runtime.InteropServices;
using System.Text;

internal static class ZkBridge
{
    private const string DllZkfp = "libzkfp.dll";
    private static IntPtr moduloDllZkfp = IntPtr.Zero;
    private const uint LoadWithAlteredSearchPath = 0x00000008;

    [DllImport("kernel32.dll", CharSet = CharSet.Unicode, SetLastError = true,
        EntryPoint = "LoadLibraryExW", ExactSpelling = true)]
    private static extern IntPtr LoadLibraryEx(string fileName, IntPtr file, uint flags);
    private const int ParBufferImagen = 106;
    private const int TamMaxPlantilla = 2048;
    private const int ErrSinDedo = -8;
    private const int TimeoutCapturaSegDefecto = 30;

    // ---- P/Invoke: libzkfp x64 (firmas del wrapper oficial) ----

    [DllImport(DllZkfp, CallingConvention = CallingConvention.Winapi)]
    private static extern int ZKFPM_Init();

    [DllImport(DllZkfp, CallingConvention = CallingConvention.Winapi)]
    private static extern int ZKFPM_Terminate();

    [DllImport(DllZkfp, CallingConvention = CallingConvention.Winapi)]
    private static extern int ZKFPM_GetDeviceCount();

    [DllImport(DllZkfp, CallingConvention = CallingConvention.Winapi)]
    private static extern IntPtr ZKFPM_OpenDevice(int index);

    [DllImport(DllZkfp, CallingConvention = CallingConvention.Winapi)]
    private static extern int ZKFPM_CloseDevice(IntPtr handle);

    [DllImport(DllZkfp, CallingConvention = CallingConvention.Winapi)]
    private static extern int ZKFPM_GetParameters(
        IntPtr handle, int code, byte[] paramValue, ref int size);

    [DllImport(DllZkfp, CallingConvention = CallingConvention.Winapi)]
    private static extern int ZKFPM_GetCaptureParamsEx(
        IntPtr handle, ref int width, ref int height, ref int dpi);

    [DllImport(DllZkfp, CallingConvention = CallingConvention.Winapi)]
    private static extern int ZKFPM_AcquireFingerprint(
        IntPtr handle, byte[] imgBuffer, uint imgSize,
        byte[] template, ref int size);

    [DllImport(DllZkfp, CallingConvention = CallingConvention.Winapi)]
    private static extern IntPtr ZKFPM_CreateDBCache();

    [DllImport(DllZkfp, CallingConvention = CallingConvention.Winapi)]
    private static extern int ZKFPM_CloseDBCache(IntPtr dbHandle);

    [DllImport(DllZkfp, CallingConvention = CallingConvention.Winapi)]
    private static extern int ZKFPM_MatchFinger(
        IntPtr dbHandle, byte[] temp1, uint temp1Size,
        byte[] temp2, uint temp2Size);

    [DllImport(DllZkfp, CallingConvention = CallingConvention.Winapi)]
    private static extern int ZKFPM_DBGetParameter(
        IntPtr dbHandle, int code, ref int value);

    private sealed class ZkException : Exception
    {
        public readonly string Codigo;
        public ZkException(string codigo, string mensaje) : base(mensaje)
        {
            Codigo = codigo;
        }
    }

    private static string JsonEscape(string valor)
    {
        if (valor == null) return "null";
        var sb = new StringBuilder("\"");
        foreach (char c in valor)
        {
            switch (c)
            {
                case '"': sb.Append("\\\""); break;
                case '\\': sb.Append("\\\\"); break;
                case '\n': sb.Append("\\n"); break;
                case '\r': sb.Append("\\r"); break;
                case '\t': sb.Append("\\t"); break;
                default:
                    if (c < 0x20) sb.Append("\\u").Append(((int)c).ToString("x4"));
                    else sb.Append(c);
                    break;
            }
        }
        sb.Append('"');
        return sb.ToString();
    }

    private static void SalirJson(bool ok, string codigo, string cuerpoJson)
    {
        Console.WriteLine("{\"ok\":" + (ok ? "true" : "false") +
                          ",\"codigo\":" + (ok ? "null" : JsonEscape(codigo)) +
                          "," + cuerpoJson + "}");
    }

    private static void SalirError(string codigo, string mensaje)
    {
        SalirJson(false, codigo, "\"error\":" + JsonEscape(mensaje));
    }

    // ---------- sesión SDK ----------

    private sealed class Sesion : IDisposable
    {
        public IntPtr Lector = IntPtr.Zero;
        private bool cerrado;

        public void Dispose()
        {
            if (cerrado) return;
            cerrado = true;
            try { if (Lector != IntPtr.Zero) ZKFPM_CloseDevice(Lector); } catch { }
            try { ZKFPM_Terminate(); } catch { }
            Lector = IntPtr.Zero;
        }
    }

    private static Sesion AbrirLector()
    {
        int rc = ZKFPM_Init();
        if (rc != 0)
            throw new ZkException("ERROR_SDK", "ZKFPM_Init devolvió " + rc + ".");
        var sesion = new Sesion();
        try
        {
            int cantidad = ZKFPM_GetDeviceCount();
            if (cantidad < 0)
                throw new ZkException("ERROR_SDK", "ZKFPM_GetDeviceCount devolvió " + cantidad + ".");
            if (cantidad == 0)
                throw new ZkException("SIN_LECTOR", "Sin lectores ZK por USB.");
            sesion.Lector = ZKFPM_OpenDevice(0);
            if (sesion.Lector == IntPtr.Zero)
                throw new ZkException("APERTURA_FALLIDA",
                    "No se pudo abrir el lector 0 (¿ocupado por otra aplicación?).");
            return sesion;
        }
        catch
        {
            sesion.Dispose();
            throw;
        }
    }

    private static int LeerParametro(Sesion sesion, int codigo)
    {
        var buf = new byte[64];
        int tam = buf.Length;
        int rc = ZKFPM_GetParameters(sesion.Lector, codigo, buf, ref tam);
        if (rc != 0)
            throw new ZkException("ERROR_SDK",
                "ZKFPM_GetParameters(" + codigo + ") devolvió " + rc + ".");
        if (tam < 4)
            throw new ZkException("ERROR_SDK",
                "ZKFPM_GetParameters(" + codigo + ") devolvió tamaño " + tam + ".");
        return buf[0] | (buf[1] << 8) | (buf[2] << 16) | (buf[3] << 24);
    }

    private sealed class Captura
    {
        public byte[] Plantilla;
        public int Tamano;
    }

    // Captura una plantilla esperando el dedo hasta el límite. -8 = sin dedo:
    // se reintenta (acotado por plazo, nunca infinito). La imagen se usa
    // solo para extraer la plantilla y se descarta (no se almacena).
    private static Captura CapturarPlantilla(Sesion sesion, int tamImagen, DateTime limite)
    {
        var imagen = new byte[tamImagen];
        var plantilla = new byte[TamMaxPlantilla];
        while (DateTime.UtcNow < limite)
        {
            int tam = plantilla.Length;
            int rc = ZKFPM_AcquireFingerprint(
                sesion.Lector, imagen, (uint)imagen.Length, plantilla, ref tam);
            if (rc == 0)
            {
                if (tam <= 0 || tam > plantilla.Length)
                    throw new ZkException("ERROR_SDK",
                        "Plantilla de tamaño inválido: " + tam + ".");
                Array.Clear(imagen, 0, imagen.Length);
                var recorte = new byte[tam];
                Buffer.BlockCopy(plantilla, 0, recorte, 0, tam);
                Array.Clear(plantilla, 0, plantilla.Length);
                return new Captura { Plantilla = recorte, Tamano = tam };
            }
            if (rc != ErrSinDedo)
                throw new ZkException("ERROR_SDK",
                    "ZKFPM_AcquireFingerprint devolvió " + rc + ".");
            System.Threading.Thread.Sleep(150);
        }
        Array.Clear(imagen, 0, imagen.Length);
        Array.Clear(plantilla, 0, plantilla.Length);
        throw new ZkException("TIMEOUT_DEDO",
            "Sin dedo en el lector dentro del plazo.");
    }

    // ---------- comandos ----------

    private static int ComandoDetectar()
    {
        using (var sesion = AbrirLector())
        {
            int tamImagen = LeerParametro(sesion, ParBufferImagen);
            int ancho = 0, alto = 0, dpi = 0;
            int rc = ZKFPM_GetCaptureParamsEx(sesion.Lector, ref ancho, ref alto, ref dpi);
            string resolucion = rc == 0
                ? ("\"" + ancho + "x" + alto + "@" + dpi + "dpi\"")
                : "null";
            SalirJson(true, null,
                "\"lectores\":" + ZKFPM_GetDeviceCount() +
                ",\"tamImagen\":" + tamImagen +
                ",\"resolucion\":" + resolucion);
        }
        return 0;
    }

    private static int ComandoCapturar(string[] args)
    {
        int timeoutSeg = LeerTimeout(args);
        DateTime limite = DateTime.UtcNow.AddSeconds(timeoutSeg);
        var inicio = DateTime.UtcNow;
        using (var sesion = AbrirLector())
        {
            int tamImagen = LeerParametro(sesion, ParBufferImagen);
            Captura cap = CapturarPlantilla(sesion, tamImagen, limite);
            double segundos = (DateTime.UtcNow - inicio).TotalSeconds;
            // La plantilla NO sale del proceso: solo su tamaño (metadato).
            // lectores/tamImagen evidencian Init + DeviceCount + OpenDevice.
            SalirJson(true, null,
                "\"dispositivo\":\"ZK9500\"" +
                ",\"lectores\":1" +
                ",\"tamImagen\":" + tamImagen +
                ",\"tamanoPlantilla\":" + cap.Tamano +
                ",\"duracionSeg\":" + segundos.ToString("0.0",
                    System.Globalization.CultureInfo.InvariantCulture));
        }
        return 0;
    }

    private static int ComandoDiagnostico(string[] args)
    {
        int timeoutSeg = LeerTimeout(args);
        var inicio = DateTime.UtcNow;
        using (var sesion = AbrirLector())
        {
            int tamImagen = LeerParametro(sesion, ParBufferImagen);
            int ancho = 0, alto = 0, dpi = 0;
            int rcCap = ZKFPM_GetCaptureParamsEx(sesion.Lector, ref ancho, ref alto, ref dpi);

            Captura primera = CapturarPlantilla(sesion, tamImagen,
                DateTime.UtcNow.AddSeconds(timeoutSeg));
            Captura segunda = CapturarPlantilla(sesion, tamImagen,
                DateTime.UtcNow.AddSeconds(timeoutSeg));

            IntPtr db = ZKFPM_CreateDBCache();
            if (db == IntPtr.Zero)
                throw new ZkException("ERROR_SDK", "ZKFPM_CreateDBCache falló.");
            int score;
            try
            {
                score = ZKFPM_MatchFinger(db, primera.Plantilla, (uint)primera.Tamano,
                    segunda.Plantilla, (uint)segunda.Tamano);
                if (score < 0)
                    throw new ZkException("ERROR_SDK",
                        "ZKFPM_MatchFinger devolvió " + score + ".");

                // Parámetros DB crudos (estrategia de umbral del SDK, sin
                // inventar: se reportan tal cual para documentar).
                var sb = new StringBuilder("{");
                for (int codigo = 1; codigo <= 5; codigo++)
                {
                    int valor = 0;
                    int rc = ZKFPM_DBGetParameter(db, codigo, ref valor);
                    if (codigo > 1) sb.Append(',');
                    sb.Append('"').Append(codigo).Append("\":");
                    sb.Append(rc == 0 ? valor.ToString() : "null");
                }
                sb.Append('}');

                double segundos = (DateTime.UtcNow - inicio).TotalSeconds;
                SalirJson(true, null,
                    "\"dispositivo\":\"ZK9500\"" +
                    ",\"tamanoPlantilla1\":" + primera.Tamano +
                    ",\"tamanoPlantilla2\":" + segunda.Tamano +
                    ",\"score\":" + score +
                    ",\"parametrosDb\":" + sb +
                    ",\"resolucion\":" + (rcCap == 0
                        ? ("\"" + ancho + "x" + alto + "@" + dpi + "dpi\"") : "null") +
                    ",\"duracionSeg\":" + segundos.ToString("0.0",
                        System.Globalization.CultureInfo.InvariantCulture));
            }
            finally
            {
                try { ZKFPM_CloseDBCache(db); } catch { }
            }
        }
        return 0;
    }

    private static int LeerTimeout(string[] args)
    {
        for (int i = 0; i + 1 < args.Length; i++)
        {
            if (args[i] == "--timeout")
            {
                int t;
                if (int.TryParse(args[i + 1], out t) && t >= 5 && t <= 300) return t;
            }
        }
        return TimeoutCapturaSegDefecto;
    }

    private static void CargarSdk()
    {
        var candidatas = new List<string>();
        string juntoAlPuente = Path.Combine(AppDomain.CurrentDomain.BaseDirectory, DllZkfp);
        if (File.Exists(juntoAlPuente)) candidatas.Add(juntoAlPuente);

        // SystemDirectory devuelve System32 para este helper x64. Farmacia-Control
        // no escribe allí: esta ruta solo admite archivos instalados por ZKTeco.
        string system32 = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.System), DllZkfp);
        if (File.Exists(system32)) candidatas.Add(system32);
        if (candidatas.Count == 0)
            throw new DllNotFoundException("No se encontró libzkfp.dll junto al puente ni en el directorio del sistema. Instale el paquete oficial ZKFinger x64.");

        string seleccionada = candidatas[0];
        IntPtr modulo = LoadLibraryEx(seleccionada, IntPtr.Zero, LoadWithAlteredSearchPath);
        if (modulo == IntPtr.Zero)
        {
            int errorWin32 = Marshal.GetLastWin32Error();
            throw new DllNotFoundException("No se pudo inicializar libzkfp.dll desde " + seleccionada + " ni sus dependencias (Win32 " + errorWin32 + "). Revise arquitectura x64 y reinstale el paquete oficial ZKFinger.");
        }
        moduloDllZkfp = modulo; // mantiene el módulo cargado para P/Invoke
    }

    public static int Main(string[] args)
    {
        try
        {
            CargarSdk();
            if (args.Length == 0)
            {
                SalirError("ERROR_SDK", "Sin comando. Uso: detectar | capturar | diagnostico ...");
                return 2;
            }
            switch (args[0].ToLowerInvariant())
            {
                case "detectar": return ComandoDetectar();
                case "capturar": return ComandoCapturar(args);
                case "diagnostico": return ComandoDiagnostico(args);
                default:
                    SalirError("ERROR_SDK", "Comando desconocido: " + args[0]);
                    return 2;
            }
        }
        catch (ZkException ex)
        {
            SalirError(ex.Codigo, ex.Message);
            return 0;
        }
        catch (DllNotFoundException ex)
        {
            SalirError("ERROR_SDK", "No se cargó libzkfp.dll x64 del sistema: " + ex.Message);
            return 0;
        }
        catch (Exception ex)
        {
            try { Console.Error.WriteLine("zk-bridge: " + ex.GetType().Name + ": " + ex.Message); } catch { }
            SalirError("ERROR_INESPERADO", "Fallo interno del puente (" + ex.GetType().Name + ").");
            return 0;
        }
    }
}
