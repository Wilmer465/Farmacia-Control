// Puente STU-540 (Wacom STU SDK, C API) para Farmacia-Control.
//
// Proceso helper x64, sin ventanas: habla con el pad por USB mediante
// P/Invoke directo contra wgssSTU.dll x64 2.18.0.82 instalada con el SDK
// (sin registro COM, sin copiar la DLL, sin SigCaptX). Entrada por
// argumentos, salida por stdout como UNA línea JSON. stderr solo lleva
// diagnóstico operativo (nunca coordenadas ni trazos: dato biométrico).
//
// Comandos:
//   detectar                       Lista pads STU por USB (abre sin
//                                  exclusividad y lee modelo/capacidad).
//   probar-pantalla                Abre el pad, escribe la pantalla de firma,
//                                  espera 6 s, limpia y cierra.
//   capturar --nombre X --documento Y --motivo Z [--timeout S]
//                                  Flujo interactivo completo: pantalla,
//                                  trazos, botones OK/Cancelar en el pad,
//                                  devuelve PNG en base64 + metadatos.
//
// Códigos de error (campo "codigo" con ok:false):
//   SIN_DISPOSITIVO, MODELO_NO_SOPORTADO, OCUPADO, DESCONECTADO, TIMEOUT,
//   CANCELADO, FIRMA_VACIA, ERROR_SDK, ERROR_INESPERADO.

using System;
using System.Collections.Generic;
using System.Drawing;
using System.Drawing.Imaging;
using System.IO;
using System.Linq;
using Microsoft.Win32;
using System.Numerics;
using System.Runtime.InteropServices;
using System.Security.Cryptography;
using System.Text;

internal static class StuBridge
{
    // Se importa por nombre. Antes del primer P/Invoke se localiza una copia
    // oficial instalada o una copia junto al helper (si la licencia lo permite)
    // y se precarga desde su ruta real para que Windows resuelva dependencias
    // relativas al directorio de la DLL.
    private const string DllSdk = "wgssSTU.dll";
    private const string VersionSdkRequerida = "2.18.0.82";
    private static string rutaDllSdk;
    private static IntPtr moduloDllSdk = IntPtr.Zero;

    private const uint LoadWithAlteredSearchPath = 0x00000008;

    [DllImport("kernel32.dll", CharSet = CharSet.Unicode, SetLastError = true,
        EntryPoint = "LoadLibraryExW", ExactSpelling = true)]
    private static extern IntPtr LoadLibraryEx(string fileName, IntPtr file, uint flags);

    private const ushort VidWacom = 0x056A;
    private const ushort PidStu540 = 0x00A8;
    private const int TimeoutCapturaSegDefecto = 120;

    // ---- P/Invoke: STU SDK C API (stdcall, x64) ----

    [DllImport(DllSdk, CallingConvention = CallingConvention.StdCall)]
    private static extern int WacomGSS_getUsbDevices(
        UIntPtr sizeofUsbDevice, out UIntPtr count, out IntPtr devices);

    [DllImport(DllSdk, CallingConvention = CallingConvention.StdCall)]
    private static extern int WacomGSS_free(IntPtr memory);

    [DllImport(DllSdk, CallingConvention = CallingConvention.StdCall)]
    private static extern int WacomGSS_getException(
        out int exceptionCode, out UIntPtr messageLength, out IntPtr message);

    [DllImport(DllSdk, CallingConvention = CallingConvention.StdCall)]
    private static extern int WacomGSS_UsbInterface_create_1(
        UIntPtr sizeofUsbDevice, ref StuUsbDevice usbDevice,
        int exclusiveLock, out IntPtr handle);

    [DllImport(DllSdk, CallingConvention = CallingConvention.StdCall)]
    private static extern int WacomGSS_Interface_disconnect(IntPtr handle);

    [DllImport(DllSdk, CallingConvention = CallingConvention.StdCall)]
    private static extern int WacomGSS_Interface_free(IntPtr handle);

    [DllImport(DllSdk, CallingConvention = CallingConvention.StdCall)]
    private static extern int WacomGSS_Tablet_create_1(out IntPtr handle);

    [DllImport(DllSdk, CallingConvention = CallingConvention.StdCall)]
    private static extern int WacomGSS_Tablet_attach(IntPtr tablet, IntPtr intf);

    [DllImport(DllSdk, CallingConvention = CallingConvention.StdCall)]
    private static extern int WacomGSS_Tablet_getInformation(
        IntPtr tablet, UIntPtr sizeofInformation, out IntPtr information);

    [DllImport(DllSdk, CallingConvention = CallingConvention.StdCall)]
    private static extern int WacomGSS_Tablet_getCapability(
        IntPtr tablet, UIntPtr sizeofCapability, out IntPtr capability);

    [DllImport(DllSdk, CallingConvention = CallingConvention.StdCall)]
    private static extern int WacomGSS_Tablet_setClearScreen(IntPtr tablet);

    [DllImport(DllSdk, CallingConvention = CallingConvention.StdCall)]
    private static extern int WacomGSS_Tablet_setInkingMode(IntPtr tablet, byte inkingMode);

    [DllImport(DllSdk, CallingConvention = CallingConvention.StdCall)]
    private static extern int WacomGSS_Tablet_startCapture(IntPtr tablet, uint sessionId);

    [DllImport(DllSdk, CallingConvention = CallingConvention.StdCall)]
    private static extern int WacomGSS_Tablet_endCapture(IntPtr tablet);

    [DllImport(DllSdk, CallingConvention = CallingConvention.StdCall)]
    private static extern int WacomGSS_Tablet_disconnect(IntPtr tablet);

    [DllImport(DllSdk, CallingConvention = CallingConvention.StdCall)]
    private static extern int WacomGSS_Tablet_free(IntPtr tablet);

    [DllImport(DllSdk, CallingConvention = CallingConvention.StdCall)]
    private static extern int WacomGSS_Tablet_interfaceQueue(IntPtr tablet, out IntPtr queue);

    [DllImport(DllSdk, CallingConvention = CallingConvention.StdCall)]
    private static extern int WacomGSS_InterfaceQueue_try_getReport(
        IntPtr queue, out IntPtr report, out UIntPtr length, out int hasReport);

    [DllImport(DllSdk, CallingConvention = CallingConvention.StdCall)]
    private static extern int WacomGSS_ProtocolHelper_writeImage(
        IntPtr intf, byte encodingMode, byte[] imageData, UIntPtr imageLength,
        uint retries, uint sleepBetweenRetries);

    [DllImport(DllSdk, CallingConvention = CallingConvention.StdCall)]
    private static extern int WacomGSS_Tablet_writeImage(
        IntPtr tablet, byte encodingMode, byte[] imageData, UIntPtr imageLength);

    [DllImport(DllSdk, CallingConvention = CallingConvention.StdCall)]
    private static extern int WacomGSS_Tablet_getStatus(
        IntPtr tablet, UIntPtr sizeofStatus, out IntPtr status);

    [DllImport(DllSdk, CallingConvention = CallingConvention.StdCall)]
    private static extern int WacomGSS_Tablet_setPenDataOptionMode(
        IntPtr tablet, byte penDataOptionMode);

    [DllImport(DllSdk, CallingConvention = CallingConvention.StdCall)]
    private static extern int WacomGSS_Tablet_getDHprime(
        IntPtr tablet, UIntPtr sizeofValue, out IntPtr value);

    [DllImport(DllSdk, CallingConvention = CallingConvention.StdCall)]
    private static extern int WacomGSS_Tablet_getDHbase(
        IntPtr tablet, UIntPtr sizeofValue, out IntPtr value);

    [DllImport(
        DllSdk,
        EntryPoint = "WacomGSS_Protocol_setHostPublicKey",
        CallingConvention = CallingConvention.StdCall,
        ExactSpelling = true)]
    private static extern int WacomGSS_Protocol_setHostPublicKey(
        IntPtr intf, UIntPtr sizeofKey, ref StuPublicKey key);

    [DllImport(DllSdk, CallingConvention = CallingConvention.StdCall)]
    private static extern int WacomGSS_Tablet_getDevicePublicKey(
        IntPtr tablet, UIntPtr sizeofKey, out IntPtr key);

    [DllImport(DllSdk, CallingConvention = CallingConvention.StdCall)]
    private static extern int WacomGSS_Protocol_setStartCapture(
        IntPtr intf, uint sessionId);

    [DllImport(DllSdk, CallingConvention = CallingConvention.StdCall)]
    private static extern int WacomGSS_Protocol_setEndCapture(IntPtr intf);

    [DllImport(DllSdk, CallingConvention = CallingConvention.StdCall)]
    private static extern int WacomGSS_Tablet_setHandwritingThicknessColor(
        IntPtr tablet, UIntPtr sizeofHandwritingThicknessColor,
        ref StuTinta tinta);

    [DllImport(DllSdk, CallingConvention = CallingConvention.StdCall)]
    private static extern int WacomGSS_Tablet_setBackgroundColor(
        IntPtr tablet, ushort backgroundColor);

    [StructLayout(LayoutKind.Sequential)]
    private struct StuUsbDevice
    {
        public ushort idVendor;
        public ushort idProduct;
        public ushort bcdDevice;
        public IntPtr fileName;
        public IntPtr bulkFileName;
    }

    [StructLayout(LayoutKind.Sequential)]
    private struct StuInformation
    {
        [MarshalAs(UnmanagedType.ByValArray, SizeConst = 10)]
        public byte[] modelName;
        public byte firmwareMajorVersion;
        public byte firmwareMinorVersion;
        public byte secureIc;
        [MarshalAs(UnmanagedType.ByValArray, SizeConst = 4)]
        public byte[] secureIcVersion;
    }

    // wgssSTU.h: WacomGSS_PublicKey is a 16-byte struct containing
    // uint8_t publicKey[16]. Keep the inline array layout explicit for P/Invoke.
    [StructLayout(LayoutKind.Sequential)]
    private struct StuPublicKey
    {
        [MarshalAs(UnmanagedType.ByValArray, SizeConst = 16, ArraySubType = UnmanagedType.U1)]
        public byte[] publicKey;
    }

    [StructLayout(LayoutKind.Sequential)]
    private struct StuCapability
    {
        public ushort tabletMaxX;
        public ushort tabletMaxY;
        public ushort tabletMaxPressure;
        public ushort screenWidth;
        public ushort screenHeight;
        public byte maxReportRate;
        public byte pad1;
        public ushort resolution;
        public byte encodingFlag;
        public byte pad2;
    }

    [StructLayout(LayoutKind.Sequential)]
    private struct StuStatus
    {
        public byte statusCode;
        public byte lastResultCode;
        public ushort statusWord;
    }

    [StructLayout(LayoutKind.Sequential, Pack = 1)]
    private struct StuTinta
    {
        public ushort colorPluma; // RGB565
        public byte grosor;
        public byte relleno;
    }

    private const byte StatusCodeReady = 0x00;

    // Banderas EncodingFlag de la capacidad (header wgssSTU.h).
    private const byte FlagCodif16bit = 0x04;

    // Modos de codificación de imagen (header wgssSTU.h).
    private const byte ModoImagen1bit = 0x00;
    private const byte ModoImagen16bit = 0x02;
    private const byte ModoImagen16bitBulk = 0x12;

    private sealed class StuException : Exception
    {
        public readonly string Codigo;
        public StuException(string codigo, string mensaje) : base(mensaje)
        {
            Codigo = codigo;
        }
    }

    // ---------- utilidades ----------

    private static string UltimoErrorSdk(int rc)
    {
        try
        {
            int codigo;
            UIntPtr longitud;
            IntPtr mensajePtr;
            if (WacomGSS_getException(out codigo, out longitud, out mensajePtr) == 0 &&
                mensajePtr != IntPtr.Zero)
            {
                string mensaje = Marshal.PtrToStringAnsi(mensajePtr) ?? string.Empty;
                try { WacomGSS_free(mensajePtr); } catch { }
                if (!string.IsNullOrWhiteSpace(mensaje))
                    return "rc=" + rc + " código=" + codigo + " " + mensaje.Trim();
            }
        }
        catch { }
        return "rc=" + rc;
    }

    private static void Comprobar(int rc, string operacion)
    {
        if (rc == 0) return;
        string detalle = UltimoErrorSdk(rc);
        string minus = detalle.ToLowerInvariant();
        if (minus.Contains("remov") || minus.Contains("not_connected") ||
            minus.Contains("device_removed") || minus.Contains("not connected"))
            throw new StuException("DESCONECTADO", operacion + ": pad desconectado (" + detalle + ").");
        if (minus.Contains("lock") || minus.Contains("busy") || minus.Contains("access") ||
            minus.Contains("denied") || minus.Contains("exclusive"))
            throw new StuException("OCUPADO", operacion + ": pad ocupado por otra aplicación (" + detalle + ").");
        if (minus.Contains("timeout"))
            throw new StuException("TIMEOUT", operacion + ": tiempo agotado (" + detalle + ").");
        throw new StuException("ERROR_SDK", operacion + " falló (" + detalle + ").");
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
        string error = ok ? "null" : JsonEscape(codigo ?? "ERROR_SDK");
        Console.WriteLine("{\"ok\":" + (ok ? "true" : "false") +
                          ",\"codigo\":" + (ok ? "null" : error) + "," + cuerpoJson + "}");
    }

    private static void SalirError(string codigo, string mensaje)
    {
        SalirJson(false, codigo, "\"error\":" + JsonEscape(mensaje));
    }

    private static List<string> RutasCandidatasDllSdk()
    {
        var candidatas = new List<string>();
        string juntoAlPuente = Path.Combine(AppDomain.CurrentDomain.BaseDirectory, DllSdk);
        if (File.Exists(juntoAlPuente)) candidatas.Add(juntoAlPuente);

        string programFilesX86 = Environment.GetFolderPath(Environment.SpecialFolder.ProgramFilesX86);
        string programFiles = Environment.GetFolderPath(Environment.SpecialFolder.ProgramFiles);
        string[] raices = { programFilesX86, programFiles };
        foreach (string raiz in raices)
        {
            if (string.IsNullOrWhiteSpace(raiz)) continue;
            string sdk = Path.Combine(raiz, "Wacom STU SDK", "C", "bin", "x64", DllSdk);
            if (File.Exists(sdk) && !candidatas.Contains(sdk, StringComparer.OrdinalIgnoreCase)) candidatas.Add(sdk);
            string sigCaptX = Path.Combine(raiz, "Wacom SigCaptX STU", DllSdk);
            if (File.Exists(sigCaptX) && !candidatas.Contains(sigCaptX, StringComparer.OrdinalIgnoreCase)) candidatas.Add(sigCaptX);
        }

        try
        {
            foreach (RegistryView vista in new[] { RegistryView.Registry64, RegistryView.Registry32 })
            {
                using (RegistryKey lm = RegistryKey.OpenBaseKey(RegistryHive.LocalMachine, vista))
                using (RegistryKey uninstall = lm.OpenSubKey(@"SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall"))
                {
                    if (uninstall == null) continue;
                    foreach (string subkeyName in uninstall.GetSubKeyNames())
                    {
                        using (RegistryKey producto = uninstall.OpenSubKey(subkeyName))
                        {
                            if (producto == null) continue;
                            string displayName = producto.GetValue("DisplayName") as string;
                            string installLocation = producto.GetValue("InstallLocation") as string;
                            if (string.IsNullOrWhiteSpace(displayName) ||
                                displayName.IndexOf("Wacom STU SDK", StringComparison.OrdinalIgnoreCase) < 0 ||
                                string.IsNullOrWhiteSpace(installLocation)) continue;
                            string dll = Path.Combine(installLocation, "C", "bin", "x64", DllSdk);
                            if (File.Exists(dll) && !candidatas.Contains(dll, StringComparer.OrdinalIgnoreCase)) candidatas.Add(dll);
                        }
                    }
                }
            }
        }
        catch (System.Security.SecurityException) { }
        catch (UnauthorizedAccessException) { }
        return candidatas;
    }

    private static void VerificarVersionDll()
    {
        try
        {
            List<string> candidatas = RutasCandidatasDllSdk();
            if (candidatas.Count == 0)
                throw new StuException("ERROR_SDK", "No se encontró wgssSTU.dll. Instale el SDK oficial Wacom STU 2.18.0.82 o posterior compatible.");

            string detalleVersiones = string.Empty;
            foreach (string candidata in candidatas)
            {
                string version = System.Diagnostics.FileVersionInfo.GetVersionInfo(candidata).FileVersion ?? string.Empty;
                if (!version.StartsWith(VersionSdkRequerida, StringComparison.Ordinal))
                {
                    detalleVersiones += Path.GetFileName(Path.GetDirectoryName(candidata)) + "=" + version + "; ";
                    continue;
                }

                IntPtr modulo = LoadLibraryEx(candidata, IntPtr.Zero, LoadWithAlteredSearchPath);
                if (modulo == IntPtr.Zero)
                {
                    int errorWin32 = Marshal.GetLastWin32Error();
                    throw new StuException("ERROR_SDK", "No se pudo cargar wgssSTU.dll desde la instalación detectada (Win32 " + errorWin32 + "). Revise las dependencias del SDK.");
                }
                rutaDllSdk = candidata;
                moduloDllSdk = modulo; // mantener cargada mientras vivan los P/Invoke
                return;
            }
            throw new StuException("ERROR_SDK", "No se encontró una wgssSTU.dll compatible. Versión requerida: " + VersionSdkRequerida + ". Versiones detectadas: " + detalleVersiones);
        }
        catch (StuException) { throw; }
        catch (System.Security.SecurityException)
        {
            throw new StuException("ERROR_SDK", "No hay permisos para consultar la instalación registrada del SDK Wacom.");
        }
        catch (Exception ex)
        {
            throw new StuException("ERROR_SDK", "No se pudo verificar wgssSTU.dll: " + ex.Message);
        }
    }

    private sealed class Dispositivo : IDisposable
    {
        public IntPtr Intf = IntPtr.Zero;
        public IntPtr Tableta = IntPtr.Zero;
        public bool Adjunto = false;
        public string RutaBulk = null;
        public StuInformation Info;
        public StuCapability Capacidad;

        public void Dispose()
        {
            // Tras Tablet_attach la tableta es dueña de la interfaz: solo se
            // libera la tableta (en cascada cierra la interfaz). Liberar la
            // interfaz por separado corrompe memoria.
            if (Adjunto)
            {
                try { if (Tableta != IntPtr.Zero) WacomGSS_Tablet_endCapture(Tableta); } catch { }
                // El pad necesita asentarse tras endCapture antes de
                // desconectar; sin esta pausa puede quedar colgado hasta
                // re-enumerar el USB (ver Tablet::internal_setEndCapture).
                System.Threading.Thread.Sleep(300);
                try { if (Tableta != IntPtr.Zero) WacomGSS_Tablet_disconnect(Tableta); } catch { }
                try { if (Tableta != IntPtr.Zero) WacomGSS_Tablet_free(Tableta); } catch { }
                Tableta = IntPtr.Zero;
                Intf = IntPtr.Zero;
                return;
            }
            try { if (Tableta != IntPtr.Zero) WacomGSS_Tablet_free(Tableta); } catch { }
            finally
            {
                Tableta = IntPtr.Zero;
                try { if (Intf != IntPtr.Zero) WacomGSS_Interface_disconnect(Intf); } catch { }
                try { if (Intf != IntPtr.Zero) WacomGSS_Interface_free(Intf); } catch { }
                Intf = IntPtr.Zero;
            }
        }
    }

    private sealed class EntradaUsb
    {
        public StuUsbDevice Info;
        public string RutaBulk;
    }

    private static List<EntradaUsb> EnumerarUsb()
    {
        UIntPtr cantidad;
        IntPtr arreglo;
        int rc = WacomGSS_getUsbDevices(
            (UIntPtr)Marshal.SizeOf(typeof(StuUsbDevice)), out cantidad, out arreglo);
        Comprobar(rc, "Enumerar pads USB");
        var lista = new List<EntradaUsb>();
        try
        {
            int tam = Marshal.SizeOf(typeof(StuUsbDevice));
            for (ulong i = 0; i < cantidad.ToUInt64(); i++)
            {
                IntPtr p = new IntPtr(arreglo.ToInt64() + (long)(i * (ulong)tam));
                var info = (StuUsbDevice)Marshal.PtrToStructure(p, typeof(StuUsbDevice));
                // Las rutas se leen ANTES de liberar el arreglo.
                string bulk = null;
                try
                {
                    if (info.bulkFileName != IntPtr.Zero)
                        bulk = Marshal.PtrToStringAnsi(info.bulkFileName);
                }
                catch { bulk = null; }
                var entrada = new EntradaUsb { Info = info };
                if (!string.IsNullOrEmpty(bulk)) entrada.RutaBulk = bulk;
                lista.Add(entrada);
            }
        }
        finally
        {
            try { WacomGSS_free(arreglo); } catch { }
        }
        return lista;
    }

    private static Dispositivo AbrirPad(ushort pidRequerido, bool exclusivo)
    {
        var lista = EnumerarUsb();
        EntradaUsb elegido = null;
        foreach (var d in lista)
        {
            if (d.Info.idVendor == VidWacom && d.Info.idProduct == pidRequerido) { elegido = d; break; }
        }
        if (elegido == null)
        {
            var sb = new StringBuilder();
            foreach (var d in lista)
                sb.Append("vid=").Append(d.Info.idVendor.ToString("x4"))
                  .Append(" pid=").Append(d.Info.idProduct.ToString("x4")).Append(';');
            if (pidRequerido == PidStu540)
                throw new StuException("SIN_DISPOSITIVO",
                    "STU-540 no encontrado por USB. Detectados: " + sb);
            throw new StuException("SIN_DISPOSITIVO", "Sin pads STU por USB. Detectados: " + sb);
        }

        var dev = new Dispositivo { RutaBulk = elegido.RutaBulk };
        try
        {
            var copia = elegido.Info;
            // La apertura exclusiva puede fallar de forma transitoria si el
            // lock se está liberando o el USB se está asentando: reintentar.
            int rc = -1;
            for (int intento = 0; intento < 3; intento++)
            {
                rc = WacomGSS_UsbInterface_create_1(
                    (UIntPtr)Marshal.SizeOf(typeof(StuUsbDevice)),
                    ref copia, exclusivo ? 1 : 0, out dev.Intf);
                if (rc == 0) break;
                dev.Intf = IntPtr.Zero;
                System.Threading.Thread.Sleep(500);
            }
            try
            {
                Comprobar(rc, "Abrir conexión USB");
            }
            catch (StuException ex)
            {
                throw new StuException(ex.Codigo, ex.Message +
                    " Si persiste, desconecte y reconecte el USB del pad.");
            }

            rc = WacomGSS_Tablet_create_1(out dev.Tableta);
            Comprobar(rc, "Crear tableta");
            rc = WacomGSS_Tablet_attach(dev.Tableta, dev.Intf);
            Comprobar(rc, "Asociar tableta");
            dev.Adjunto = true;

            IntPtr ptrInfo;
            rc = WacomGSS_Tablet_getInformation(
                dev.Tableta, (UIntPtr)Marshal.SizeOf(typeof(StuInformation)), out ptrInfo);
            Comprobar(rc, "Leer información del pad");
            try
            {
                dev.Info = (StuInformation)Marshal.PtrToStructure(ptrInfo, typeof(StuInformation));
            }
            finally { try { WacomGSS_free(ptrInfo); } catch { } }

            IntPtr ptrCap;
            rc = WacomGSS_Tablet_getCapability(
                dev.Tableta, (UIntPtr)Marshal.SizeOf(typeof(StuCapability)), out ptrCap);
            Comprobar(rc, "Leer capacidad del pad");
            try
            {
                dev.Capacidad = (StuCapability)Marshal.PtrToStructure(ptrCap, typeof(StuCapability));
            }
            finally { try { WacomGSS_free(ptrCap); } catch { } }

            return dev;
        }
        catch
        {
            dev.Dispose();
            throw;
        }
    }

    private static string ModeloDe(StuInformation info)
    {
        int n = Array.IndexOf(info.modelName, (byte)0);
        if (n < 0) n = info.modelName.Length;
        return Encoding.ASCII.GetString(info.modelName, 0, n);
    }

    // ---------- cifrado v1 (Diffie-Hellman + AES-128-ECB) ----------
    // Espejo de Tablet_OpenSSL.cpp del SDK: primos/base big-endian, privada
    // aleatoria de p.bits-1 bits, pública y secreto compartido de 16 bytes
    // big-endian, AES-128-ECB sin padding sobre bloques de 16.

    private static BigInteger DesdeBigEndian(byte[] be)
    {
        var le = new byte[be.Length + 1]; // byte extra = signo positivo
        for (int i = 0; i < be.Length; i++) le[i] = be[be.Length - 1 - i];
        return new BigInteger(le);
    }

    private static byte[] HaciaBigEndian(BigInteger valor, int longitud)
    {
        byte[] le = valor.ToByteArray();
        int n = le.Length;
        while (n > 1 && le[n - 1] == 0) n--; // quita byte de signo
        if (n > longitud)
            throw new StuException("CLAVE_INVALIDA", "Clave DH fuera de rango.");
        var be = new byte[longitud];
        for (int i = 0; i < n; i++) be[longitud - 1 - i] = le[i];
        return be;
    }

    private static int BitsDe(BigInteger valor)
    {
        byte[] le = valor.ToByteArray();
        int n = le.Length;
        while (n > 1 && le[n - 1] == 0) n--;
        int bits = (n - 1) * 8;
        byte alto = le[n - 1];
        while (alto != 0) { bits++; alto >>= 1; }
        return bits;
    }

    private static StuStatus LeerEstado(Dispositivo dev, string operacion)
    {
        IntPtr ptr;
        int rc = WacomGSS_Tablet_getStatus(
            dev.Tableta, (UIntPtr)Marshal.SizeOf(typeof(StuStatus)), out ptr);
        Comprobar(rc, operacion);
        try
        {
            return (StuStatus)Marshal.PtrToStructure(ptr, typeof(StuStatus));
        }
        finally { try { WacomGSS_free(ptr); } catch { } }
    }

    private static void EsperarListo(Dispositivo dev)
    {
        for (int i = 0; i < 50; i++)
        {
            if (LeerEstado(dev, "Leer estado del pad").statusCode == StatusCodeReady)
                return;
            System.Threading.Thread.Sleep(100);
        }
        throw new StuException("TIMEOUT", "El pad no quedó listo para capturar.");
    }

    // Negocia DH y devuelve la clave AES-128, o null si el pad no anuncia
    // cifrado (primo todo ceros): entonces se captura en claro.
    private static byte[] NegociarCifrado(Dispositivo dev)
    {
        IntPtr ptrPrimo;
        int rc = WacomGSS_Tablet_getDHprime(
            dev.Tableta, (UIntPtr)16, out ptrPrimo);
        Comprobar(rc, "Negociar cifrado del pad");
        byte[] primo;
        try
        {
            primo = new byte[16];
            Marshal.Copy(ptrPrimo, primo, 0, 16);
        }
        finally { try { WacomGSS_free(ptrPrimo); } catch { } }

        bool todoCero = true;
        foreach (byte b in primo) if (b != 0) { todoCero = false; break; }
        if (todoCero) return null;

        IntPtr ptrBase;
        rc = WacomGSS_Tablet_getDHbase(dev.Tableta, (UIntPtr)2, out ptrBase);
        Comprobar(rc, "Negociar cifrado del pad");
        var baseDh = new byte[2];
        try { Marshal.Copy(ptrBase, baseDh, 0, 2); }
        finally { try { WacomGSS_free(ptrBase); } catch { } }

        BigInteger p = DesdeBigEndian(primo);
        BigInteger g = DesdeBigEndian(baseDh);
        int bits = BitsDe(p);
        if (bits < 64 || g.IsZero)
            throw new StuException("CIFRADO_NO_NEGOCIADO", "Parámetros DH inválidos del pad.");

        byte[] privadaBytes = null, publicaBytes = null, compartidoBytes = null;
        try
        {
            using (var azar = new RNGCryptoServiceProvider())
            {
                BigInteger privada;
                int bytesPriv = (bits - 1 + 7) / 8;
                do
                {
                    privadaBytes = new byte[bytesPriv];
                    azar.GetBytes(privadaBytes);
                    // Limpia bits sobrantes y fija el bit superior (TOP_ONE).
                    int sobrantes = bytesPriv * 8 - (bits - 1);
                    privadaBytes[bytesPriv - 1] &= (byte)(0xFF >> sobrantes);
                    privadaBytes[bytesPriv - 1] |= (byte)(0x80 >> sobrantes);
                    var le = new byte[bytesPriv + 1];
                    for (int i = 0; i < bytesPriv; i++) le[i] = privadaBytes[bytesPriv - 1 - i];
                    privada = new BigInteger(le);
                } while (privada <= 1);

                publicaBytes = HaciaBigEndian(BigInteger.ModPow(g, privada, p), 16);
            }

            int tamanoClavePublica = Marshal.SizeOf(typeof(StuPublicKey));
            if (publicaBytes == null || publicaBytes.Length != 16 || tamanoClavePublica != 16)
                throw new StuException("CIFRADO_NO_NEGOCIADO", "La clave pública no tiene el layout esperado de 16 bytes.");

            var clavePublica = new StuPublicKey { publicKey = publicaBytes };
            rc = WacomGSS_Protocol_setHostPublicKey(
                dev.Intf, (UIntPtr)tamanoClavePublica, ref clavePublica);
            Comprobar(rc, "Negociar cifrado del pad");

            byte[] publicaPad = null;
            for (int i = 0; i < 100; i++)
            {
                IntPtr ptrPub;
                rc = WacomGSS_Tablet_getDevicePublicKey(
                    dev.Tableta, (UIntPtr)16, out ptrPub);
                Comprobar(rc, "Negociar cifrado del pad");
                try
                {
                    publicaPad = new byte[16];
                    Marshal.Copy(ptrPub, publicaPad, 0, 16);
                }
                finally { try { WacomGSS_free(ptrPub); } catch { } }
                bool cero = true;
                foreach (byte b in publicaPad) if (b != 0) { cero = false; break; }
                if (!cero) break;
                publicaPad = null;
                System.Threading.Thread.Sleep(100);
            }
            if (publicaPad == null)
                throw new StuException("CIFRADO_NO_NEGOCIADO",
                    "El pad no entregó su clave pública.");

            BigInteger pubPad = DesdeBigEndian(publicaPad);
            if (pubPad <= 1 || pubPad >= p - 1)
                throw new StuException("CLAVE_INVALIDA", "Clave pública del pad fuera de rango.");

            // El firmante de Main ya conoce privadaBytes vía clausura: se
            // recalcula aquí con la privada vigente del bucle.
            compartidoBytes = HaciaBigEndian(
                BigInteger.ModPow(pubPad, DesdeBigEndian(privadaBytes), p), 16);
            return (byte[])compartidoBytes.Clone();
        }
        finally
        {
            if (privadaBytes != null) Array.Clear(privadaBytes, 0, privadaBytes.Length);
            if (compartidoBytes != null) Array.Clear(compartidoBytes, 0, compartidoBytes.Length);
        }
    }

    // ---------- pantalla 1bpp ----------

    private sealed class AreaBoton
    {
        public int X, Y, Ancho, Alto;
        public AreaBoton(int x, int y, int ancho, int alto)
        { X = x; Y = y; Ancho = ancho; Alto = alto; }
        public bool Contiene(int x, int y)
        { return x >= X && x < X + Ancho && y >= Y && y < Y + Alto; }
    }

    // Esquema estándar: fondo blanco, título azul, ACEPTAR verde, CANCELAR rojo.
    private static readonly Color ColorFondo = Color.White;
    private static readonly Color ColorTitulo = Color.FromArgb(0, 51, 153);
    private static readonly Color ColorTexto = Color.Black;
    private static readonly Color ColorMarco = Color.Black;
    private static readonly Color ColorFondoOk = Color.FromArgb(0, 150, 0);
    private static readonly Color ColorFondoCancelar = Color.FromArgb(200, 0, 0);
    private static readonly Color ColorTextoBoton = Color.White;

    private static Bitmap ComponerPantalla(
        int ancho, int alto, string nombre, string documento, string motivo,
        string aviso, out AreaBoton botonOk, out AreaBoton botonCancelar,
        out Rectangle areaFirma)
    {
        botonOk = new AreaBoton(ancho - 220, alto - 90, 180, 64);
        botonCancelar = new AreaBoton(40, alto - 90, 180, 64);
        areaFirma = new Rectangle(40, 150, ancho - 80, alto - 150 - 120);

        var bmp = new Bitmap(ancho, alto, PixelFormat.Format24bppRgb);
        var g = Graphics.FromImage(bmp);
        g.Clear(ColorFondo);
        g.TextRenderingHint = System.Drawing.Text.TextRenderingHint.SingleBitPerPixelGridFit;
        var fuenteTitulo = new Font(FontFamily.GenericSansSerif, 26, FontStyle.Bold);
        var fuenteTexto = new Font(FontFamily.GenericSansSerif, 20, FontStyle.Regular);
        var fuenteBoton = new Font(FontFamily.GenericSansSerif, 24, FontStyle.Bold);

        g.DrawString("FARMACIA CONTROL — Firma del receptor", fuenteTitulo,
            new SolidBrush(ColorTitulo), 40, 18);
        string linea = ("Recibe: " + nombre + "  Doc: " + documento).Trim();
        g.DrawString(linea, fuenteTexto, new SolidBrush(ColorTexto), 40, 62);
        g.DrawString("Motivo: " + motivo, fuenteTexto, new SolidBrush(ColorTexto), 40, 94);
        if (!string.IsNullOrEmpty(aviso))
            g.DrawString(aviso, fuenteTexto, new SolidBrush(ColorTexto), 40, 122);

        g.DrawRectangle(new Pen(ColorMarco, 3), areaFirma);

        DibujarBoton(g, botonCancelar, "CANCELAR", fuenteBoton, ColorFondoCancelar);
        DibujarBoton(g, botonOk, "ACEPTAR", fuenteBoton, ColorFondoOk);
        g.Dispose();
        return bmp;
    }

    private static ushort Rgb565(byte r, byte g, byte b)
    {
        return (ushort)(((r & 0xF8) << 8) | ((g & 0xFC) << 3) | (b >> 3));
    }

    // RGB565 big-endian por píxel (espejo de flattenColor16 del SDK).
    private static byte[] AplanarRgb565(Bitmap color, int ancho, int alto)
    {
        var datos = color.LockBits(new Rectangle(0, 0, ancho, alto),
            ImageLockMode.ReadOnly, PixelFormat.Format24bppRgb);
        try
        {
            int strideColor = Math.Abs(datos.Stride);
            var crudo = new byte[strideColor * alto];
            Marshal.Copy(datos.Scan0, crudo, 0, crudo.Length);
            var salida = new byte[ancho * 2 * alto];
            for (int y = 0; y < alto; y++)
            {
                for (int x = 0; x < ancho; x++)
                {
                    int o = y * strideColor + x * 3;
                    ushort v = Rgb565(crudo[o + 2], crudo[o + 1], crudo[o]);
                    int d = (y * ancho + x) * 2;
                    salida[d] = (byte)(v >> 8);
                    salida[d + 1] = (byte)(v & 0xFF);
                }
            }
            return salida;
        }
        finally { color.UnlockBits(datos); }
    }

    // 1bpp MSB primero (contingencia si el pad rechaza color).
    private static byte[] AplanarMono1bpp(Bitmap color, int ancho, int alto)
    {
        var datos = color.LockBits(new Rectangle(0, 0, ancho, alto),
            ImageLockMode.ReadOnly, PixelFormat.Format24bppRgb);
        try
        {
            int strideColor = Math.Abs(datos.Stride);
            int strideDestino = (ancho + 7) / 8;
            var crudo = new byte[strideColor * alto];
            Marshal.Copy(datos.Scan0, crudo, 0, crudo.Length);
            var salida = new byte[strideDestino * alto];
            for (int y = 0; y < alto; y++)
            {
                for (int x = 0; x < ancho; x++)
                {
                    int o = y * strideColor + x * 3;
                    int lum = (crudo[o + 2] + crudo[o + 1] + crudo[o]) / 3;
                    if (lum < 128)
                        salida[y * strideDestino + x / 8] |= (byte)(0x80 >> (x % 8));
                }
            }
            return salida;
        }
        finally { color.UnlockBits(datos); }
    }

    private static byte[] GenerarPantallaColor(
        int ancho, int alto, string nombre, string documento, string motivo,
        string aviso, out AreaBoton botonOk, out AreaBoton botonCancelar,
        out Rectangle areaFirma)
    {
        using (var bmp = ComponerPantalla(ancho, alto, nombre, documento, motivo,
            aviso, out botonOk, out botonCancelar, out areaFirma))
        {
            return AplanarRgb565(bmp, ancho, alto);
        }
    }

    private static byte[] GenerarPantallaFirma(
        int ancho, int alto, string nombre, string documento, string motivo,
        string aviso, out AreaBoton botonOk, out AreaBoton botonCancelar,
        out Rectangle areaFirma)
    {
        using (var bmp = ComponerPantalla(ancho, alto, nombre, documento, motivo,
            aviso, out botonOk, out botonCancelar, out areaFirma))
        {
            return AplanarMono1bpp(bmp, ancho, alto);
        }
    }

    private static void DibujarBoton(Graphics g, AreaBoton b, string texto,
        Font fuente, Color fondo)
    {
        g.FillRectangle(new SolidBrush(fondo), b.X, b.Y, b.Ancho, b.Alto);
        g.DrawRectangle(new Pen(ColorMarco, 3), b.X, b.Y, b.Ancho, b.Alto);
        var formato = new StringFormat
        {
            Alignment = StringAlignment.Center,
            LineAlignment = StringAlignment.Center
        };
        g.DrawString(texto, fuente, new SolidBrush(ColorTextoBoton),
            new RectangleF(b.X, b.Y, b.Ancho, b.Alto), formato);
    }

    // Tinta negra visible y fondo blanco para el entintado local del pad.
    private static void FijarTinta(Dispositivo dev)
    {
        var tinta = new StuTinta { colorPluma = 0x0000, grosor = 3, relleno = 0 };
        Comprobar(WacomGSS_Tablet_setHandwritingThicknessColor(
            dev.Tableta, (UIntPtr)Marshal.SizeOf(typeof(StuTinta)), ref tinta),
            "Fijar tinta del pad");
        Comprobar(WacomGSS_Tablet_setBackgroundColor(dev.Tableta, 0xFFFF),
            "Fijar fondo del pad");
    }

    // Elige 16 bits (bulk si hay endpoint) o 1 bit según la capacidad.
    private static byte ModoColor(Dispositivo dev, out bool esColor)
    {
        esColor = (dev.Capacidad.encodingFlag & FlagCodif16bit) != 0;
        if (!esColor) return ModoImagen1bit;
        return dev.RutaBulk != null ? ModoImagen16bitBulk : ModoImagen16bit;
    }

    private static void EscribirPantalla(Dispositivo dev, byte[] imagen, byte modo)
    {
        int rc = WacomGSS_ProtocolHelper_writeImage(
            dev.Intf, modo, imagen, (UIntPtr)imagen.Length, 50u, 20u);
        if (rc != 0)
        {
            // Alternativa: variante de alto nivel de la tableta.
            rc = WacomGSS_Tablet_writeImage(
                dev.Tableta, modo, imagen, (UIntPtr)imagen.Length);
        }
        Comprobar(rc, "Escribir pantalla del pad");
    }

    private static void LimpiarPantalla(Dispositivo dev)
    {
        Comprobar(WacomGSS_Tablet_setClearScreen(dev.Tableta), "Limpiar pantalla del pad");
    }

    // ---------- comandos ----------

    private static int ComandoDetectar()
    {
        var lista = EnumerarUsb();
        var sb = new StringBuilder("\"dispositivos\":[");
        bool primero = true;
        foreach (var d in lista)
        {
            if (d.Info.idVendor != VidWacom) continue;
            if (!primero) sb.Append(',');
            primero = false;
            sb.Append("{\"vid\":\"").Append(d.Info.idVendor.ToString("x4"))
              .Append("\",\"pid\":\"").Append(d.Info.idProduct.ToString("x4")).Append('"');
            try
            {
                using (var dev = AbrirPad(d.Info.idProduct, false))
                {
                    sb.Append(",\"modelo\":").Append(JsonEscape(ModeloDe(dev.Info)));
                    sb.Append(",\"pantalla\":\"").Append(dev.Capacidad.screenWidth)
                      .Append('x').Append(dev.Capacidad.screenHeight).Append('"');
                    sb.Append(",\"sensor\":\"").Append(dev.Capacidad.tabletMaxX)
                      .Append('x').Append(dev.Capacidad.tabletMaxY).Append('"');
                    sb.Append(",\"codificacion\":\"0x")
                      .Append(dev.Capacidad.encodingFlag.ToString("x2")).Append('"');
                    sb.Append(",\"bulk\":").Append(dev.RutaBulk != null ? "true" : "false");
                }
            }
            catch (StuException ex)
            {
                sb.Append(",\"advertencia\":").Append(JsonEscape(ex.Message));
            }
            sb.Append('}');
        }
        sb.Append(']');
        SalirJson(true, null, sb.ToString());
        return 0;
    }

    private struct PuntoTrazo { public int X, Y; }

    // Estado de trazos/botones durante una captura (1 o 2 muestras por reporte).
    private sealed class SesionCaptura
    {
        public readonly List<List<PuntoTrazo>> Trazos = new List<List<PuntoTrazo>>();
        public List<PuntoTrazo> Actual = new List<PuntoTrazo>();
        public bool LapizAbajo;
        public int? AbajoX, AbajoY;
        public long AbajoTicks;
        public AreaBoton BotonOk, BotonCancelar;
        public Action AlAceptarVacio;

        public int ContarPuntos()
        {
            int n = 0;
            foreach (var t in Trazos) n += t.Count;
            return n;
        }

        // Devuelve "ok" | "cancelado" | null (seguir).
        public string Procesar(int px, int py, bool tocando)
        {
            if (tocando)
            {
                if (!LapizAbajo)
                {
                    LapizAbajo = true;
                    Actual = new List<PuntoTrazo>();
                    AbajoX = px; AbajoY = py;
                    AbajoTicks = DateTime.UtcNow.Ticks;
                }
                Actual.Add(new PuntoTrazo { X = px, Y = py });
                return null;
            }
            if (!LapizAbajo) return null;
            LapizAbajo = false;
            if (Actual.Count > 0) Trazos.Add(Actual);
            Actual = new List<PuntoTrazo>();
            // Toques cortos y quietos sobre botones.
            long ms = (DateTime.UtcNow.Ticks - AbajoTicks) / 10000;
            int dx = AbajoX.HasValue ? Math.Abs(px - AbajoX.Value) : 999;
            int dy = AbajoY.HasValue ? Math.Abs(py - AbajoY.Value) : 999;
            AbajoX = AbajoY = null;
            if (ms < 800 && dx < 14 && dy < 14)
            {
                if (BotonCancelar.Contiene(px, py)) return "cancelado";
                if (BotonOk.Contiene(px, py))
                {
                    if (ContarPuntos() > 0) return "ok";
                    if (AlAceptarVacio != null) AlAceptarVacio();
                }
            }
            return null;
        }
    }

    private static int ComandoProbarPantalla()
    {
        using (var dev = AbrirPad(PidStu540, true))
        {
            string modelo = ModeloDe(dev.Info);
            if (!modelo.Contains("540"))
                throw new StuException("MODELO_NO_SOPORTADO",
                    "Modelo detectado: " + modelo + " (se requiere STU-540).");
            int ancho = dev.Capacidad.screenWidth;
            int alto = dev.Capacidad.screenHeight;
            AreaBoton ok, cancelar;
            Rectangle area;
            bool esColor;
            byte modo = ModoColor(dev, out esColor);
            byte[] imagen = esColor
                ? GenerarPantallaColor(ancho, alto, "Prueba", "-", "Prueba de pantalla",
                    null, out ok, out cancelar, out area)
                : GenerarPantallaFirma(ancho, alto, "Prueba", "-", "Prueba de pantalla",
                    null, out ok, out cancelar, out area);
            LimpiarPantalla(dev);
            FijarTinta(dev);
            EscribirPantalla(dev, imagen, modo);
            System.Threading.Thread.Sleep(6000);
            LimpiarPantalla(dev);
            SalirJson(true, null,
                "\"modelo\":" + JsonEscape(modelo) +
                ",\"pantalla\":\"" + ancho + "x" + alto + "\"");
        }
        return 0;
    }

    private static Dictionary<string, string> LeerArgumentos(string[] args, int desde)
    {
        var mapa = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);
        for (int i = desde; i < args.Length; i++)
        {
            if (args[i].StartsWith("--") && i + 1 < args.Length)
            {
                mapa[args[i].Substring(2)] = args[i + 1];
                i++;
            }
        }
        return mapa;
    }

    private static int ComandoCapturar(string[] args)
    {
        var ops = LeerArgumentos(args, 1);
        string nombre = ops.ContainsKey("nombre") ? ops["nombre"] : "Receptor";
        string documento = ops.ContainsKey("documento") ? ops["documento"] : "-";
        string motivo = ops.ContainsKey("motivo") ? ops["motivo"] : "Recepción de medicamentos";
        int timeoutSeg = TimeoutCapturaSegDefecto;
        if (ops.ContainsKey("timeout"))
        {
            int t;
            if (int.TryParse(ops["timeout"], out t) && t >= 10 && t <= 600) timeoutSeg = t;
        }

        var inicio = DateTime.UtcNow;
        DateTime limite = inicio.AddSeconds(timeoutSeg);
        var rnd = new Random();
        uint sesionId = (uint)rnd.Next(1, int.MaxValue);

        using (var dev = AbrirPad(PidStu540, true))
        {
            string modelo = ModeloDe(dev.Info);
            if (!modelo.Contains("540"))
                throw new StuException("MODELO_NO_SOPORTADO",
                    "Modelo detectado: " + modelo + " (se requiere STU-540).");

            int ancho = dev.Capacidad.screenWidth;
            int alto = dev.Capacidad.screenHeight;
            int maxX = Math.Max(1, (int)dev.Capacidad.tabletMaxX);
            int maxY = Math.Max(1, (int)dev.Capacidad.tabletMaxY);

            AreaBoton botonOk, botonCancelar;
            Rectangle areaFirma;
            bool esColor;
            byte modo = ModoColor(dev, out esColor);
            byte[] imagen = esColor
                ? GenerarPantallaColor(ancho, alto, nombre, documento, motivo,
                    null, out botonOk, out botonCancelar, out areaFirma)
                : GenerarPantallaFirma(ancho, alto, nombre, documento, motivo,
                    null, out botonOk, out botonCancelar, out areaFirma);

            Comprobar(WacomGSS_Tablet_setPenDataOptionMode(dev.Tableta, 0x00),
                "Fijar modo de reportes del pad");

            // Cifrado v1 obligatorio en STU-540 (Tablet_startCapture lo exige):
            // handshake DH; null = pad sin cifrado -> captura en claro.
            byte[] claveAes = NegociarCifrado(dev);
            Aes aes = null;
            ICryptoTransform descifrador = null;
            List<List<PuntoTrazo>> trazos = null;
            try
            {
                if (claveAes != null)
                {
                    aes = Aes.Create();
                    aes.Key = (byte[])claveAes.Clone();
                    aes.Mode = CipherMode.ECB;
                    aes.Padding = PaddingMode.None;
                    descifrador = aes.CreateDecryptor();
                }

                Comprobar(WacomGSS_Tablet_setClearScreen(dev.Tableta), "Limpiar pantalla del pad");
                FijarTinta(dev);
                EscribirPantalla(dev, imagen, modo);
                Comprobar(WacomGSS_Tablet_setInkingMode(dev.Tableta, 0x01), "Activar entintado local");
                EsperarListo(dev);
                // Arranque por protocolo: el wrapper Tablet_startCapture exige
                // handler de cifrado y aquí el cifrado ya se negoció a mano.
                Comprobar(WacomGSS_Protocol_setStartCapture(dev.Intf, sesionId), "Iniciar captura");
                StuStatus estadoArranque = LeerEstado(dev, "Iniciar captura");
                if (estadoArranque.lastResultCode != 0)
                    throw new StuException("ERROR_SDK",
                        "Iniciar captura rechazado por el pad (código " +
                        estadoArranque.lastResultCode + ").");

                IntPtr cola;
                Comprobar(WacomGSS_Tablet_interfaceQueue(dev.Tableta, out cola), "Obtener cola de reportes");

                var sesion = new SesionCaptura
                {
                    BotonOk = botonOk,
                    BotonCancelar = botonCancelar,
                    AlAceptarVacio = delegate
                    {
                        AreaBoton ok2, cancelar2;
                        Rectangle area2;
                        byte[] reintento = esColor
                            ? GenerarPantallaColor(ancho, alto,
                                nombre, documento, motivo,
                                "Firme dentro del recuadro y toque ACEPTAR.",
                                out ok2, out cancelar2, out area2)
                            : GenerarPantallaFirma(ancho, alto,
                                nombre, documento, motivo,
                                "Firme dentro del recuadro y toque ACEPTAR.",
                                out ok2, out cancelar2, out area2);
                        EscribirPantalla(dev, reintento, modo);
                    }
                };

                string resultado = null; // "ok" | "cancelado"
                try
                {
                    while (DateTime.UtcNow < limite && resultado == null)
                    {
                        IntPtr reporte;
                        UIntPtr longitud;
                        int hay;
                        int rc = WacomGSS_InterfaceQueue_try_getReport(cola, out reporte, out longitud, out hay);
                        Comprobar(rc, "Leer reportes del pad");
                        if (hay != 0)
                        {
                            int n = (int)longitud.ToUInt64();
                            var crudo = new byte[n];
                            Marshal.Copy(reporte, crudo, 0, n);
                            if (claveAes != null)
                            {
                                // Reporte cifrado: [0x10 + 16 B] -> sesión BE32 + 2 muestras.
                                if (n >= 17 && crudo[0] == 0x10)
                                {
                                    descifrador.TransformBlock(crudo, 1, 16, crudo, 1);
                                    uint sesionDev = ((uint)crudo[1] << 24) |
                                                     ((uint)crudo[2] << 16) |
                                                     ((uint)crudo[3] << 8) | crudo[4];
                                    if (sesionDev == sesionId)
                                    {
                                        for (int k = 0; k < 2 && resultado == null; k++)
                                        {
                                            int b = 5 + k * 6;
                                            int cmd0 = crudo[b];
                                            int enRango = (cmd0 >> 7) & 0x01;
                                            int sw = (cmd0 >> 4) & 0x07;
                                            int x = (crudo[b + 2] << 8) | crudo[b + 3];
                                            int y = (crudo[b + 4] << 8) | crudo[b + 5];
                                            bool tocando = enRango != 0 && sw != 0;
                                            int px = (int)((long)x * ancho / maxX);
                                            int py = (int)((long)y * alto / maxY);
                                            resultado = sesion.Procesar(px, py, tocando) ?? resultado;
                                        }
                                    }
                                }
                            }
                            else
                            {
                                // Reporte PenData en claro: [0x01, cmd0..cmd5], big-endian.
                                if (n >= 7 && crudo[0] == 0x01)
                                {
                                    int cmd0 = crudo[1];
                                    int enRango = (cmd0 >> 7) & 0x01;
                                    int sw = (cmd0 >> 4) & 0x07;
                                    int x = (crudo[3] << 8) | crudo[4];
                                    int y = (crudo[5] << 8) | crudo[6];
                                    bool tocando = enRango != 0 && sw != 0;
                                    int px = (int)((long)x * ancho / maxX);
                                    int py = (int)((long)y * alto / maxY);
                                    string r = sesion.Procesar(px, py, tocando);
                                    if (r != null) resultado = r;
                                }
                            }
                        }
                        else
                        {
                            System.Threading.Thread.Sleep(5);
                        }
                    }
                }
                finally
                {
                    try { WacomGSS_Tablet_endCapture(dev.Tableta); } catch { }
                }

                if (resultado == null)
                    throw new StuException("TIMEOUT", "Captura sin respuesta en " + timeoutSeg + " s.");
                if (resultado == "cancelado")
                    throw new StuException("CANCELADO", "Captura cancelada en el pad.");
                if (sesion.ContarPuntos() == 0)
                    throw new StuException("FIRMA_VACIA", "Sin trazos de firma.");
                trazos = sesion.Trazos;
            }
            finally
            {
                try { if (descifrador != null) descifrador.Dispose(); } catch { }
                try { if (aes != null) aes.Clear(); } catch { }
                if (claveAes != null) Array.Clear(claveAes, 0, claveAes.Length);
            }

            string pngB64 = RenderizarPng(trazos, 720, 260, ancho, alto);
            double segundos = (DateTime.UtcNow - inicio).TotalSeconds;
            SalirJson(true, null,
                "\"modelo\":" + JsonEscape(modelo) +
                ",\"uid\":" + JsonEscape(dev.Info.secureIc.ToString()) +
                ",\"origen\":\"STU-540\"" +
                ",\"pngBase64\":" + JsonEscape(pngB64) +
                ",\"trazos\":" + trazos.Count +
                ",\"duracionSeg\":" + segundos.ToString("0.0",
                    System.Globalization.CultureInfo.InvariantCulture));
        }
        return 0;
    }

    private static string RenderizarPng(List<List<PuntoTrazo>> trazos, int ancho, int alto,
        int pantallaAncho, int pantallaAlto)
    {
        using (var bmp = new Bitmap(ancho, alto))
        using (var g = Graphics.FromImage(bmp))
        using (var lapiz = new Pen(Color.Black, 3))
        {
            g.Clear(Color.White);
            g.SmoothingMode = System.Drawing.Drawing2D.SmoothingMode.AntiAlias;
            foreach (var trazo in trazos)
            {
                for (int i = 1; i < trazo.Count; i++)
                {
                    g.DrawLine(lapiz, trazo[i - 1].X * ancho / pantallaAncho,
                        trazo[i - 1].Y * alto / pantallaAlto, trazo[i].X * ancho / pantallaAncho,
                        trazo[i].Y * alto / pantallaAlto);
                }
            }
            using (var ms = new MemoryStream())
            {
                bmp.Save(ms, ImageFormat.Png);
                return Convert.ToBase64String(ms.ToArray());
            }
        }
    }

    // ---------- entrada ----------

    public static int Main(string[] args)
    {
        try
        {
            VerificarVersionDll();
            if (args.Length == 0)
            {
                SalirError("ERROR_SDK", "Sin comando. Uso: detectar | probar-pantalla | capturar ...");
                return 2;
            }
            switch (args[0].ToLowerInvariant())
            {
                case "detectar": return ComandoDetectar();
                case "probar-pantalla": return ComandoProbarPantalla();
                case "capturar": return ComandoCapturar(args);
                default:
                    SalirError("ERROR_SDK", "Comando desconocido: " + args[0]);
                    return 2;
            }
        }
        catch (StuException ex)
        {
            SalirError(ex.Codigo, ex.Message);
            return 0;
        }
        catch (DllNotFoundException ex)
        {
            SalirError("ERROR_SDK", "No se cargó wgssSTU.dll x64 del SDK instalado: " + ex.Message);
            return 0;
        }
        catch (Exception ex)
        {
            // stderr solo diagnóstico operativo (sin trazos ni coordenadas).
            try { Console.Error.WriteLine("stu-bridge: " + ex.GetType().Name + ": " + ex.Message); } catch { }
            SalirError("ERROR_INESPERADO", "Fallo interno del puente (" + ex.GetType().Name + ").");
            return 0;
        }
    }
}
