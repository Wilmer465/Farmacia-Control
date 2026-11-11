using System;
using System.Linq;
using System.Numerics;
using System.Reflection;
using System.Runtime.InteropServices;

internal static class WacomInteropContract
{
    private static void Exigir(bool condicion, string mensaje)
    {
        if (!condicion) throw new InvalidOperationException(mensaje);
    }

    public static int Main()
    {
        Type puente = typeof(StuBridge);
        Type clave = puente.GetNestedType("StuPublicKey", BindingFlags.NonPublic);
        Exigir(clave != null, "No se encontró StuPublicKey.");
        Exigir(Marshal.SizeOf(clave) == 16, "StuPublicKey no ocupa 16 bytes.");
        Exigir(Marshal.OffsetOf(clave, "publicKey").ToInt32() == 0,
            "publicKey no comienza en offset 0.");

        FieldInfo campo = clave.GetField("publicKey");
        var marshalAs = (MarshalAsAttribute)Attribute.GetCustomAttribute(
            campo, typeof(MarshalAsAttribute));
        Exigir(marshalAs != null && marshalAs.Value == UnmanagedType.ByValArray &&
            marshalAs.SizeConst == 16 && marshalAs.ArraySubType == UnmanagedType.U1,
            "El marshalling no es una matriz inline de 16 bytes sin signo.");

        MethodInfo import = puente.GetMethod("WacomGSS_Protocol_setHostPublicKey",
            BindingFlags.NonPublic | BindingFlags.Static);
        Exigir(import != null, "No se encontró el método P/Invoke corregido.");
        var dllImport = (DllImportAttribute)Attribute.GetCustomAttribute(
            import, typeof(DllImportAttribute));
        Exigir(dllImport != null && dllImport.EntryPoint == "WacomGSS_Protocol_setHostPublicKey" &&
            dllImport.CallingConvention == CallingConvention.StdCall,
            "El símbolo o la convención de llamada no coincide.");
        ParameterInfo[] parametros = import.GetParameters();
        Exigir(parametros.Length == 3 && parametros[0].ParameterType == typeof(IntPtr) &&
            parametros[1].ParameterType == typeof(UIntPtr) &&
            parametros[2].ParameterType == clave.MakeByRefType(),
            "El prototipo P/Invoke no refleja Interface, size_t y PublicKey*.");

        byte[] esperado = Enumerable.Range(1, 16).Select(i => (byte)i).ToArray();
        object instancia = Activator.CreateInstance(clave);
        campo.SetValue(instancia, esperado);
        IntPtr buffer = Marshal.AllocHGlobal(16);
        try
        {
            Marshal.StructureToPtr(instancia, buffer, false);
            byte[] escrito = new byte[16];
            Marshal.Copy(buffer, escrito, 0, escrito.Length);
            Exigir(escrito.SequenceEqual(esperado), "El layout alteró el orden de los bytes.");
            object recuperado = Marshal.PtrToStructure(buffer, clave);
            Exigir(((byte[])campo.GetValue(recuperado)).SequenceEqual(esperado),
                "La lectura del layout alteró el orden de los bytes.");
        }
        finally { Marshal.FreeHGlobal(buffer); }

        MethodInfo convertir = puente.GetMethod("HaciaBigEndian",
            BindingFlags.NonPublic | BindingFlags.Static);
        byte[] numeroLittleEndianConSigno = new byte[17];
        for (int i = 0; i < 16; i++) numeroLittleEndianConSigno[i] = (byte)(16 - i);
        byte[] resultado = (byte[])convertir.Invoke(null, new object[] {
            new BigInteger(numeroLittleEndianConSigno), 16
        });
        Exigir(resultado.SequenceEqual(esperado),
            "La clave pública no conserva la representación big-endian del vector.");
        Console.WriteLine("Wacom interop contract: OK (sin invocar P/Invoke).");
        return 0;
    }
}
