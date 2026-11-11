# Auditoría de puentes nativos Wacom STU-540 y ZKTeco ZK-9500

**Fecha de inspección:** 2026-10-24

**Alcance:** inspección estática del checkout, los recursos `win-unpacked`, las DLL presentes en este equipo y documentación oficial disponible. Se hicieron compilaciones C# a un directorio temporal y una prueba administrada de reflexión/marshalling; no se ejecutaron los helpers de fabricante ni se cargaron DLL, y no se conectaron dispositivos.

## Resumen ejecutivo

- Los dos puentes declaran rutas absolutas para la DLL principal del fabricante. Wacom exige `C:\Program Files (x86)\Wacom STU SDK\C\bin\x64\wgssSTU.dll`; ZKTeco exige `C:\Windows\System32\libzkfp.dll`. Las DLL principales existen en este equipo, pero no en los directorios `bin` ni en los recursos empaquetados examinados.
- El binding Wacom que antes nombraba `WacomGSS_Tablet_setHostPublicKey` fue corregido a `WacomGSS_Protocol_setHostPublicKey` con handle `WacomGSS_Interface`, `size_t`/`UIntPtr` y estructura inline de 16 bytes. La prueba administrada estructural pasó; la ABI nativa y captura física siguen pendientes.
- ZKTeco permanece **NO CONCLUYENTE**: no se identificó documentación oficial aplicable a la DLL exacta para validar sus doce firmas.
- Electron inicia ambos helpers mediante `child_process.spawn()` desde `backend/services/signatureService.js`; `biometricService.js` reutiliza ese ejecutor para ZKTeco. La hipótesis de que se use `fork()` queda refutada por el código actual.
- Los ejecutables x64 están presentes en las carpetas `bin` ignoradas por Git y en `dist/win-unpacked/resources/native/`. Cada carpeta contiene solo el `.exe`. El empaquetado no incluye las DLL del fabricante ni las dependencias ZKTeco halladas en el `System32` local.
- Los scripts invocan `csc.exe` de .NET Framework y no llaman a MSBuild, `cl.exe` ni a un compilador C/C++. Ambas fuentes actuales compilaron con `csc.exe` x64 hacia un directorio temporal; no hay evidencia de que Visual Studio Build Tools sea un requisito técnico.
- El análisis estático de imports confirma dependencias adicionales de ZKTeco (`ZKFPCap.dll` y `fpslib.dll`), presentes en este equipo. La resolución de toda dependencia dinámica/transitiva y la compatibilidad funcional en otro equipo siguen **NO CONCLUYENTES**.
- Las licencias de redistribución de ambas DLL permanecen **PENDIENTES**. La documentación oficial consultada describe componentes y SDK compatibles, pero no prueba permiso de redistribución aplicable a estos binarios.
- La configuración de release ahora exige firma (`forceCodeSigning:true`, `signAndEditExecutable:true`, `signDlls:false`). Los setup, portable, app y puentes del `dist` actual siguen `NotSigned`; no hay certificado con EKU Code Signing disponible en los almacenes consultados ni variables de firma de release. El release firmado no está listo.
- La auditoría no demuestra que la captura real funcione en este equipo ni en equipos destino.

## Archivos y métodos comprobados

| Elemento | Evidencia actual |
|---|---|
| Fuentes C# | `native/stu-bridge/stu-bridge.cs` y `native/zk-bridge/zk-bridge.cs` existen y están versionadas. |
| Scripts | `scripts/compilar-stu-bridge.js` y `scripts/compilar-zk-bridge.js` existen. |
| Servicios Electron | `backend/services/signatureService.js` y `backend/services/biometricService.js` existen. |
| Paquete | `package.json` define `prebuild` y `build.extraResources`. |
| Informe previo | `bridge_contradiction_audit.md` no existía antes de esta actualización. |

Las referencias de línea siguientes corresponden a los archivos observados durante esta auditoría.

## Declaraciones `DllImport` y carga de DLL

### Wacom STU-540

En `native/stu-bridge/stu-bridge.cs:35–37`:

```csharp
private const string DllSdk =
    @"C:\Program Files (x86)\Wacom STU SDK\C\bin\x64\wgssSTU.dll";
```

Las declaraciones P/Invoke usan esa constante, por ejemplo, `stu-bridge.cs:45`:

```csharp
[DllImport(DllSdk, CallingConvention = CallingConvention.StdCall)]
```

El archivo valida además que la versión de la DLL empiece por `2.18.0.82` (`stu-bridge.cs:304–308`). Por tanto, no basta con que exista cualquier copia de `wgssSTU.dll`: la ruta debe coincidir y la comprobación de versión debe pasar.

### ZKTeco ZK-9500

En `native/zk-bridge/zk-bridge.cs:35`:

```csharp
private const string DllZkfp = @"C:\Windows\System32\libzkfp.dll";
```

Las declaraciones P/Invoke usan esa constante, por ejemplo, `zk-bridge.cs:43`:

```csharp
[DllImport(DllZkfp, CallingConvention = CallingConvention.Winapi)]
```

Esto no es una declaración por nombre simple ni una ruta relativa. El destino debe tener la DLL en la ruta absoluta codificada; además necesita que el cargador resuelva sus dependencias nativas.

## Inicio, argumentos, salida y errores

- `signatureService.js:14` importa `spawn` de `child_process`. `ejecutarHelper()` verifica que el archivo exista y lo inicia como ejecutable (`signatureService.js:89–100`):

  ```js
  child = spawn(exe, argumentos, { windowsHide: true, ...opcionesSpawnExtra });
  ```

- El servicio guarda los fragmentos de `stdout` y `stderr` (`signatureService.js:103–113`). Ante el evento `error`, limpia el timeout y rechaza la operación (`:115–117`). Ante `close`, limpia el timeout, registra como máximo 500 caracteres de `stderr` y busca una línea JSON válida entre las líneas de salida (`:119–152`).
- El timeout del proceso mata al hijo con `child.kill()` y produce `TIMEOUT_LOCAL` (`signatureService.js:105–108`). La detección Wacom tiene 15 s (`:20`, `:177–178`). Para captura, el ejecutor añade un margen de 20 s al timeout del puente (`:21`, `:206`).
- `biometricService.js:85–89` llama al mismo ejecutor con `['capturar', '--timeout', '30']` y un límite local de 45 s (30 s de captura más 15 s de margen; constantes `biometricService.js:17–18`).
- Los puentes documentan entrada por argumentos, JSON por `stdout` y diagnóstico por `stderr` (`stu-bridge.cs:6–17`, `zk-bridge.cs:7–23`).

**Conclusión:** el mecanismo implementado es `spawn()`, no `fork()`. Estas líneas demuestran el diseño de ejecución y manejo de eventos; no demuestran que el `.exe` arranque correctamente, cargue las DLL o capture datos del dispositivo.

## Empaquetado y contenido observado

`package.json:15–17` configura ambos scripts en `prebuild`. `package.json:73–81` declara:

| Origen de `extraResources` | Destino dentro de resources |
|---|---|
| `native/stu-bridge/bin` | `native/stu-bridge` |
| `native/zk-bridge/bin` | `native/zk-bridge` |

La regla copia el contenido que haya en esos directorios; no incorpora por sí sola las DLL instaladas en Windows. Inspección de archivos observados:

| Ubicación | Archivos encontrados |
|---|---|
| `native/stu-bridge/bin/` | `stu-bridge.exe`, 29.184 bytes. Ignorado por Git (`.gitignore:25`). |
| `native/zk-bridge/bin/` | `zk-bridge.exe`, 10.752 bytes. Ignorado por Git (`.gitignore:27`). |
| `dist/win-unpacked/resources/native/stu-bridge/` | `stu-bridge.exe`, 29.184 bytes. |
| `dist/win-unpacked/resources/native/zk-bridge/` | `zk-bridge.exe`, 10.752 bytes. |

En esas cuatro carpetas no aparecieron DLL. Los hashes SHA-256 de origen y paquete coinciden:

| Ejecutable | Arquitectura PE | SHA-256 en `bin` y `dist` |
|---|---:|---|
| `stu-bridge.exe` | x64 (`Machine=0x8664`) | `7FB84EB5BBC1AEAD0C494EE670E2E2CC7D3EF5EF4A1F41205BE485B708AC9B1D` |
| `zk-bridge.exe` | x64 (`Machine=0x8664`) | `34DE9C4DF0BE0B81C697BED3DBD64D9321AE3EF189322980190CE96C56EC1A63` |

La arquitectura PE se obtuvo leyendo las cabeceras de los archivos; no se ejecutaron. El contenido observado corresponde a un `win-unpacked` local, no a una instalación limpia en otro Windows. No se inspeccionó un instalador instalado en una máquina destino.

## DLL instaladas localmente, dependencias e imports

| DLL | Ruta local observada | Tamaño | Versión de archivo | Arquitectura |
|---|---|---:|---|---|
| Wacom `wgssSTU.dll` | `C:\Program Files (x86)\Wacom STU SDK\C\bin\x64\wgssSTU.dll` | 1.180.680 bytes | `2.18.0.82` | x64 (`0x8664`) |
| ZKTeco `libzkfp.dll` | `C:\Windows\System32\libzkfp.dll` | 277.504 bytes | No informada por Windows | x64 (`0x8664`) |
| ZKTeco `ZKFPCap.dll` | `C:\Windows\System32\ZKFPCap.dll` | 97.792 bytes | `5, 0, 0, 1` | x64 (`0x8664`) |
| ZKTeco `fpslib.dll` | `C:\Windows\System32\fpslib.dll` | 958.464 bytes | No informada por Windows | x64 (`0x8664`) |

Las ACL observadas para `wgssSTU.dll` y `libzkfp.dll` permiten lectura y ejecución a `BUILTIN\Usuarios`; `SYSTEM` y `BUILTIN\Administradores` tienen control total. También figuran permisos heredados de entidades de paquetes de aplicaciones. Estas ACL describen las copias locales observadas y no garantizan permisos ni presencia en equipos destino.

Se inspeccionaron las tablas PE de imports estáticos sin ejecutar los binarios ni instalar herramientas:

| Archivo analizado | Imports directos observados |
|---|---|
| `wgssSTU.dll` | `KERNEL32.dll`, `USER32.dll`, `ADVAPI32.dll`, `ole32.dll`, `OLEAUT32.dll`, `SETUPAPI.dll`, `HID.DLL`, `VERSION.dll`, `WINHTTP.dll` |
| `libzkfp.dll` | `KERNEL32.dll`, `OLEAUT32.dll`, `ZKFPCap.dll`, `fpslib.dll` |
| `ZKFPCap.dll` | `KERNEL32.dll`, `SHLWAPI.dll` |
| `fpslib.dll` | `KERNEL32.dll`, `USER32.dll`, `ADVAPI32.dll`, `SHLWAPI.dll`, `IPHLPAPI.DLL` |

Las dependencias ZKTeco adicionales están presentes localmente en `System32`, pero no aparecen en `native/zk-bridge/bin` ni en los recursos examinados. Las tablas de imports estáticos no revelan necesariamente cargas dinámicas (`LoadLibrary`), dependencias condicionadas por flujo, ni todas las dependencias transitivas del sistema operativo. No se puede concluir a partir de esta inspección qué componentes requiere todo equipo destino: **NO CONCLUYENTE**. No se encontraron `dumpbin`, `llvm-readobj`, `llvm-objdump`, `objdump` ni `Dependencies.exe` en `PATH`; la lectura PE se hizo con un analizador temporal basado en la biblioteca estándar de Python.

## Compilación y necesidad de Visual Studio Build Tools

Ambos scripts buscan `csc.exe` en las rutas del .NET Framework 4 (`scripts/compilar-stu-bridge.js:16–19`, `scripts/compilar-zk-bridge.js:16–19`) y lo invocan con `spawnSync` (`:33–37`). Ambos solicitan `/platform:x64`, `/optimize` y `/target:exe`. El script Wacom añade `/reference:System.Numerics.dll`; el script ZKTeco no agrega referencias explícitas.

En este equipo existe `C:\Windows\Microsoft.NET\Framework64\v4.0.30319\csc.exe`. Los scripts no invocan MSBuild, `cl.exe`, `dumpbin` ni procesos de Visual Studio. En las búsquedas de comandos disponibles tampoco se encontraron `MSBuild.exe` ni `cl.exe` en `PATH`.

**Conclusión:** no hay una razón técnica comprobada para instalar Visual Studio Build Tools para la ruta de compilación que describen los scripts. Esto no equivale a certificar que ambos scripts compilen correctamente en una instalación limpia: no se ejecutaron, tal como exige el alcance de solo lectura. La compilación requiere que el equipo de construcción disponga del `csc.exe` de .NET Framework en una de las rutas codificadas. Si aparece un error de referencia o de compilación en una validación futura, deberá investigarse antes de atribuirlo a Build Tools.

## Licencias y documentación oficial

Estado de redistribución:

| Archivo | Estado | Motivo |
|---|---|---|
| `wgssSTU.dll` | **PENDIENTE** | La documentación oficial explica componentes y modalidades de despliegue del STU SDK, pero no se encontró un permiso de redistribución que se pueda aplicar con certeza a esta DLL y versión. |
| `libzkfp.dll` | **PENDIENTE** | La página oficial describe el SDK de Windows, los dispositivos compatibles (incluido ZK9500) y ofrece descarga autenticada; no publica en la información consultada las condiciones para redistribuir la DLL. |

Fuentes oficiales consultadas:

- [Wacom: STU SDK Installation Options](https://developer-support.wacom.com/hc/en-us/articles/9354489795607-STU-SDK-Installation-Options) describe `wgssSTU.dll`, las variantes x86/x64 y los componentes que distintas aplicaciones .NET/Java necesitan para desplegarse.
- [Wacom: DLL Installation](https://developer-support.wacom.com/hc/en-us/articles/9354455458967-DLL-Installation) describe opciones de despliegue sin registro; no constituye por sí sola una licencia de redistribución.
- [ZKTeco: ZKFinger SDK for Windows](https://www.zkteco.com/en/Biometrics_Module_SDK/ZKFinger-SDK-for-Windows) indica compatibilidad con ZK9500 y que el SDK incluye driver, documentación y demo; el acceso a la descarga requiere iniciar sesión. No se encontraron términos públicos de redistribución aplicables a `libzkfp.dll`.

No copiar ni incluir las DLL en el instalador hasta confirmar por escrito o mediante términos oficiales aplicables la redistribución autorizada, y hasta revisar todas las dependencias necesarias.

## Contradicciones resueltas y conclusiones

| Cuestión contradictoria | Conclusión basada en evidencia actual |
|---|---|
| ¿`DllImport` usa nombre simple o ruta absoluta? | Ambas fuentes usan rutas absolutas mediante constantes (`stu-bridge.cs:36–37, 45`; `zk-bridge.cs:35, 43`). Se descartan las conclusiones previas incompatibles. |
| ¿Electron usa `fork()` para el `.exe`? | No. `signatureService.js:14, 89–100` usa `spawn()`; `biometricService.js:85–89` reutiliza ese ejecutor para ZKTeco. |
| ¿Los `.exe` se empaquetan? | Sí, los ejecutables observados en `native/*/bin` aparecen en las rutas correspondientes de `dist/win-unpacked/resources/native`; hashes coincidentes. |
| ¿Las DLL se empaquetan por `extraResources`? | No en el contenido examinado: los directorios de origen y destino solo contienen los `.exe`. |
| ¿Visual Studio Build Tools es requisito? | No demostrado. El método configurado llama a `csc.exe`; no se encontró una invocación de herramientas C/C++ o MSBuild. La compilación misma no fue verificada. |
| ¿Los puentes funcionan con los equipos? | No determinado: no se ejecutaron helpers, DLL ni pruebas con los dispositivos. |

## Riesgos para uso y distribución fiable

1. En un equipo sin el SDK Wacom en la ruta absoluta esperada, el puente STU no encontrará `wgssSTU.dll`; además exige la versión `2.18.0.82`.
2. En un equipo sin los componentes del driver/SDK ZKTeco en `System32`, el puente ZK no encontrará `libzkfp.dll`; la DLL depende además de `ZKFPCap.dll` y `fpslib.dll`.
3. Las reglas de `extraResources` actuales empaquetan los helpers, no las dependencias de fabricantes observadas. La presencia de los `.exe` no acredita que la carga nativa funcione en destino.
4. Las licencias pendientes impiden tratar la copia de DLL al paquete como una solución ya autorizada.
5. El control por inspección de archivos y cabeceras no sustituye pruebas funcionales en máquinas limpias, con controladores y dispositivos conectados.

## Límites y próximos pasos recomendados

- Solicitar/confirmar a Wacom y ZKTeco las condiciones vigentes de redistribución para las versiones exactas de SDK/DLL antes de diseñar el instalador.
- Obtener de cada fabricante el paquete/instalador de runtime recomendado y su procedimiento para preparar equipos destino; no asumir que basta copiar las DLL principales.
- En una fase posterior autorizada, probar en una máquina limpia el instalador y la carga de cada helper, con cada dispositivo y controlador instalados según el fabricante; registrar errores, versiones, arquitectura y dependencias.
- Verificar la compilación en un equipo Windows limpio con .NET Framework Compiler disponible, sin instalar Visual Studio Build Tools salvo que un error concreto lo requiera.
- Completar el análisis recursivo de dependencias nativas/dinámicas con una herramienta PE autorizada/disponible y documentación de los fabricantes.

La auditoría de puentes no modificó sus fuentes C# ni los binarios. Las conclusiones son de inspección estática y del estado local observado; no constituyen validación funcional ni aprobación legal de redistribución.

## Implementación de Fase 1: diagnóstico estático

Fecha de actualización: 2026-10-24.

Se añadió una consulta de prerrequisitos de solo lectura en el proceso principal. Analiza los bytes de archivos PE desde rutas fijadas por el proceso principal; no carga DLL, no inicia los helpers y no admite que el renderer indique rutas. La consulta IPC es `puentes:verificarPrerrequisitos`, no recibe argumentos y se expone como `window.api.puentes.verificarPrerrequisitos()`.

El diagnóstico distingue `prerrequisitos_verificados`, `incompatibilidad_confirmada`, `archivo_faltante`, `error_inspeccion` y `diagnostico_incompleto`. Comprueba arquitectura x64, exports esperados de las DLL de los fabricantes e imports estáticos conocidos. Para ZKTeco comprueba explícitamente `ZKFPCap.dll` y `fpslib.dll` en el directorio fijado, además de las dependencias no pertenecientes a Windows que aparezcan en la tabla de imports estáticos de `libzkfp.dll`.

Para Wacom se extrae `FileVersion` del recurso PE sin cargar la biblioteca y se replica el criterio del puente: `FileVersionInfo.FileVersion.StartsWith("2.18.0.82")`. Este resultado solo verifica metadatos estáticos. La discrepancia informada durante la Fase 1 fue posteriormente corregida en el binding fuente; su marshalling se verificó estructuralmente, pero la ABI nativa y la captura física continúan pendientes.

La interfaz muestra las comprobaciones por dispositivo e instrucciones con enlaces oficiales de Wacom y ZKTeco. Cada respuesta incluye literalmente `dispositivo: no probado`; archivos y exports presentes no se presentan como evidencia de que el dispositivo fue detectado ni de que se haya capturado firma o huella. Las licencias de redistribución siguen **PENDIENTES** y no se copiaron DLL ni se integraron instaladores.

### Pruebas automatizadas ejecutadas

Se ejecutó únicamente `node --test tests/unit/bridge_prerequisites.test.js`: **11 pruebas aprobadas, 0 fallidas**. La suite usa fixtures PE sintéticos y cubre lectura de metadatos, archivos ausentes, permisos denegados, PE inválidos, arquitectura incorrecta, versión Wacom incompatible, exports faltantes, dependencias ZKTeco faltantes, prerrequisitos presentes con bloqueo Wacom aún activo, IPC sin argumentos y omisión de argumentos del renderer. No se ejecutaron DLL ni helpers y no se conectaron dispositivos.

La prueba inicial encontró dos defectos de fixtures (tabla de recursos PE solapada y sensibilidad de mayúsculas en la simulación del sistema de archivos) y además mostró que la comprobación de dependencias ZKTeco dependía indebidamente de que ambas DLL aparecieran en imports estáticos. Se corrigió el fixture y el servicio ahora verifica explícitamente `ZKFPCap.dll` y `fpslib.dll`. La ejecución final de la suite pasó completa.

### Alcance y limitaciones del diagnóstico

- Los exports requeridos se comparan por nombre y se valida que los directos tengan ordinal y RVA en una sección ejecutable. Esto no valida el contenido/cuerpo de la función ni las firmas P/Invoke o la convención de llamada de ZKTeco.
- Los imports PE no revelan cargas dinámicas ni garantizan descubrir todas las dependencias transitivas. La inspección nativa completa permanece **NO CONCLUYENTE**.
- La versión de ZKTeco se muestra como metadato orientativo; no existe una línea base oficial compatible confirmada.
- El estado `prerrequisitos_verificados` significa que pasaron los controles estáticos aplicables, no que el binding sea compatible ni que la captura funcione. Wacom conserva el bloqueo confirmado descrito arriba; ZKTeco conserva limitaciones de diagnóstico.
- No se inspeccionó aquí una máquina destino limpia y no se realizaron pruebas funcionales. El dispositivo continúa **no probado**.
- La autorización para redistribuir `wgssSTU.dll`, `libzkfp.dll`, `ZKFPCap.dll` y `fpslib.dll` continúa **PENDIENTE**. La Fase 1 solo enlaza a instrucciones oficiales para instalación manual; la integración de instaladores oficiales queda para una Fase 2 condicionada a autorización aplicable.

## Endurecimiento tras revisión de Fase 1

Fecha de actualización: 2026-10-24.

La última revisión identificó posibles aprobaciones falsas ante cabeceras, secciones, directorios y tablas PE malformadas; el conteo de exports por nombre sin validar su EAT; recursos VERSIONINFO truncados; omisión de las dos DLL ZKTeco conocidas si faltaba `libzkfp.dll`; y persistencia visual de un diagnóstico previo ante una nueva consulta fallida. Se aplicaron las siguientes correcciones:

- `backend/services/peStaticInspector.js` valida coherencia entre `COFF.Machine` y `OptionalHeader.Magic`, tamaños/rangos de cabeceras y secciones, secciones virtuales/raw superpuestas, `SizeOfImage`/`SizeOfHeaders`, cantidad de data directories, sumas RVA/offset y rangos de directorios. El mapeo de RVA exige una sección única, bytes raw suficientes y límites dentro del archivo. Los imports comprueban descriptor, nombre, thunks, `FirstThunk`, terminador, hints e imports por ordinal antes de aceptar el nombre de una DLL.
- La tabla de exports ahora verifica el rango de las tablas y del nombre, ordinal único y dentro de rango, EAT no cero y RVA mapeable en una sección ejecutable. Los resultados se separan en exports directos, exports inválidos y exports reenviados; estos últimos no se consideran utilizables porque el destino no se resuelve estáticamente. La interfaz refleja exports ausentes, inválidos y reenviados.
- El recorrido de recursos limita cada directorio y nombre al rango declarado para recursos, detecta ciclos/duplicados/jerarquía inesperada y valida bloques UTF-16, longitudes, terminadores, `VS_FIXEDFILEINFO` y tablas localizadas. El criterio de Wacom permanece exactamente `FileVersionInfo.FileVersion.StartsWith("2.18.0.82")`. Si la estructura no permite determinar la versión con fiabilidad, el resultado queda `diagnostico_incompleto` y no pasa el requisito de versión.
- ZKTeco verifica `ZKFPCap.dll` y `fpslib.dll` en sus rutas controladas incluso si `libzkfp.dll` falta o no se puede analizar. Cada comprobación incluye la ruta, resultado de lectura y arquitectura cuando procede. También comprueba imports estáticos externos detectados. No se afirma que la lista sea exhaustiva.
- Al iniciar una consulta nueva, el renderer elimina el diagnóstico anterior. Una respuesta fallida o una excepción vuelve a dejarlo vacío y muestra el error, tanto en la acción manual como en la consulta automática del componente.

### Pruebas posteriores a las correcciones

La suite enfocada `node --test tests/unit/bridge_prerequisites.test.js` pasó con **23 pruebas aprobadas y 0 fallidas**. Incluye fixtures para Machine/Magic incoherentes, directorios RVA fuera de rango, secciones fuera del archivo, RVA de función cero/no mapeable, exports reenviados, recursos VERSIONINFO truncados, imports inválidos, DLL principal ZKTeco ausente, dependencias conocidas, fallo del handler IPC y eliminación del resultado anterior en la interfaz. Los fixtures son sintéticos; la suite no ejecuta helpers ni carga DLL.

ESLint enfocado sobre `backend/services/peStaticInspector.js`, `backend/services/bridgePrerequisitesService.js`, los fixtures y pruebas terminó con **0 errores**. ESLint ignoró `src/components/DocumentacionReceptor.jsx` porque la configuración actual no tiene una configuración aplicable para ese archivo; por ello este resultado no certifica lint del componente. `git diff --check` no reportó errores de whitespace.

La lectura estática de la DLL Wacom local que se realizó durante la Fase 1 reportó versión `2.18.0.82`, x64 y 29/30 símbolos según la lista de aquel momento, que aún contenía el nombre incorrecto `WacomGSS_Tablet_setHostPublicKey`. Tras corregir el símbolo esperado, se releyó la misma DLL sin cargarla: FileVersion `2.18.0.82`, x64, `WacomGSS_Protocol_setHostPublicKey` presente y el símbolo erróneo `WacomGSS_Tablet_setHostPublicKey` ausente. ZKTeco reportó arquitectura x64, 12/12 exports requeridos, imports `KERNEL32.dll`, `OLEAUT32.dll`, `ZKFPCap.dll` y `fpslib.dll`, y ambas dependencias conocidas presentes como x64 en `System32`. Todo ello es estático; no prueba carga, firmas P/Invoke, dependencias completas ni funcionamiento de ningún dispositivo.

### Límites que permanecen

- El validador es un analizador estático acotado, no un verificador formal ni sustituto del cargador PE de Windows. Aún no compara cada tabla/rango y semántica posible contra `LoadLibrary`; se deben tratar formatos desconocidos, reenvíos, recursos ausentes y cualquier resultado no inspeccionable como diagnóstico incompleto.
- Un RVA de export dentro de una sección marcada ejecutable no demuestra que el código sea una función válida ni que su firma P/Invoke coincida. No se han validado firmas de ZKTeco ni la carga real de dependencias.
- La inspección de dependencias cubre imports PE estáticos visibles más `ZKFPCap.dll` y `fpslib.dll`; no descubre `LoadLibrary` dinámicos ni garantiza dependencias transitivas o ubicación efectiva del cargador. La lista completa de dependencias continúa **NO CONCLUYENTE**.
- El análisis de VERSIONINFO usa fixtures sintéticos y no se comparó con `FileVersionInfo` sobre la DLL real durante esta fase. Una versión observada como compatible por prefijo solo satisface el metadato estático y no acredita compatibilidad completa del SDK.
- En el estado histórico de cierre de Fase 1, el bloqueo Wacom seguía pendiente. La corrección de binding y las verificaciones posteriores se documentan en la sección de implementación que sigue. Las licencias de redistribución siguen **PENDIENTES**; los dispositivos siguen **no probados**. No se ejecutaron helpers ni se cargaron DLL.

## Corrección Wacom y preparación de release Windows

Fecha de actualización: 2026-10-24.

### Binding Wacom

Se corrigió `native/stu-bridge/stu-bridge.cs:129–138`: el import ahora nombra `WacomGSS_Protocol_setHostPublicKey`, declara `StdCall` y recibe `IntPtr` para `WacomGSS_Interface`, `UIntPtr` para `size_t` y `ref StuPublicKey`. `StuPublicKey` en `stu-bridge.cs:182–189` tiene una matriz inline de 16 bytes (`UnmanagedType.ByValArray`, `U1`), y la llamada en `stu-bridge.cs:612–618` usa `dev.Intf`. La fuente también comprueba longitud y tamaño marshallado antes de invocar.

La evidencia local cotejada con `C:\Program Files (x86)\Wacom STU SDK\C\include\WacomGSS\wgssSTU.h:42,81–85,503–507,955` y la DLL exacta Wacom 2.18.0.82 indica: `Protocol_setHostPublicKey(WacomGSS_Interface, size_t, WacomGSS_PublicKey const*)`; la convención Windows del header es `__stdcall`; el struct contiene 16 bytes. El ejemplo C++ instalado del SDK convierte la clave DH mediante `BN_bn2bin()` a una matriz de 16 bytes; el puente usa `HaciaBigEndian` (`stu-bridge.cs:509–518`). La DLL fue analizada como bytes, sin carga: x64 y export directo `WacomGSS_Protocol_setHostPublicKey` presente; `WacomGSS_Tablet_setHostPublicKey` ausente.

La prueba `tests/unit/native_bridge_abi.test.js` compila a un directorio temporal una versión de prueba que selecciona un `Main` de reflexión. Comprueba el `EntryPoint`, `StdCall`, tipos/prototipo, tamaño 16, offset 0, atributos de marshalling, ida/vuelta de los bytes y el vector big-endian de `HaciaBigEndian`. No invoca ningún P/Invoke, DLL de fabricante ni helper compilado. Por tanto, esto verifica el contrato administrado y la representación de bytes, no la llamada ABI real ni el protocolo con el pad. El estado operativo Wacom permanece **ABI nativa pendiente y dispositivo: no probado** hasta prueba física STU-540.

### ZKTeco y compilación

No se encontró header oficial dentro de las rutas locales revisadas que pueda vincularse al hash/versionado de `libzkfp.dll`; la DLL local no reporta versión de archivo/producto. En una inspección posterior se encontró `C:\Windows\System32\libzkfpcsharp.dll` (FileVersion 1.0.0.1; ensamblado MSIL/.NET Framework). Sus metadatos reflejan las 12 declaraciones utilizadas por el puente y `CallingConvention.Winapi`, pero no hay manifiesto del instalador, header ni evidencia que vincule esa versión del wrapper con el hash/build de la DLL nativa local. Por eso la corroboración de tipos del wrapper es local, y las firmas ABI aplicables siguen **NO CONCLUYENTES**. Windows 11 sigue bloqueado para ZKTeco hasta confirmación oficial de ZKTeco y prueba física en Windows 11.

`csc.exe` x64 de .NET Framework compiló ambas fuentes en esa revisión histórica a un directorio temporal fuera del repositorio: Wacom 29.184 bytes, SHA-256 `FA6F71B5BBC1AEAD0C494EE670E2E2CC7D3EF5EF4A1C8253AB74A3061659F`; ZKTeco 10.752 bytes, SHA-256 `27393376699C1F453C014197B117539380CCD8A7E9D89FA971D244FDC2ED3A8C`. Esos hashes fueron reemplazados por los artefactos compilados en la actualización de carga de SDK descrita al final. Los ejecutables temporales no se iniciaron. La compilación ZK solo confirma que `csc.exe` acepta la sintaxis fuente; no valida sus firmas ABI. No hay evidencia de requisito de Visual Studio Build Tools para estos scripts C#.

### Política de firma del release

La versión resuelta de `electron-builder` se comprobó como **25.1.8** (`pnpm exec electron-builder --version`; `pnpm-lock.yaml` también fija 25.1.8). En `package.json:91–93`, `win.forceCodeSigning` ahora es `true`, `win.signAndEditExecutable` es `true` y `win.signDlls` permanece `false`. En el app-builder-lib instalado, `winPackager.js:99–108,192–224` hace fallar la generación si la firma obligatoria no se aplica y omite la firma del ejecutable principal/transformador extra si `signAndEditExecutable` es falso; `platformPackager.js:239–241` aplica el transformador a recursos extra. `NsisTarget.js:281,349` invoca la firma del setup y del desinstalador. Los puentes, incluidos mediante `extraResources`, deben verificarse explícitamente en el payload resultante.

Se añadió `scripts/verificar-artefactos-release.ps1`. Recorre payload desempacado, setup, portable y una instalación indicada; detecta cabeceras PE por firma `MZ`/`PE`, calcula SHA-256, comprueba Authenticode, editor y timestamp; exige app, puentes, `elevate.exe`, setup, portable y desinstalador. Las firmas presentes inválidas siempre fallan. Un PE de tercero sin firma solo puede exceptuarse mediante una entrada aprobada con ruta relativa, hash, fuente, motivo y aprobador en un archivo externo; no se agregó excepción. `scripts/authenticode-signers.psd1` registra el editor Microsoft observado para `d3dcompiler_47.dll`. Los ejecutables propios nunca admiten excepciones.

No se generó un nuevo setup/portable durante esta tarea: la búsqueda de `WIN_CSC_LINK` y `WIN_CSC_KEY_PASSWORD` dio ambos ausentes y en los almacenes CurrentUser/LocalMachine revisados no apareció certificado con EKU Code Signing. Se verificaron como `NotSigned` los setup, portable, ejecutable principal, ambos puentes y `elevate.exe` actuales; no satisfacen el release. No se instalaron certificados ni herramientas y no se usó un certificado local ajeno como identidad de producto. La verificación final de todos los artefactos sigue **BLOQUEADA** hasta disponer de certificado publisher autorizado, producir los artefactos y hacer instalación limpia; no se afirma que la firma esté aplicada.

### Verificación ejecutada y límites

- `node --test tests/unit/bridge_prerequisites.test.js tests/unit/native_bridge_abi.test.js tests/unit/native_bridge_process.test.js`: **29 aprobadas, 0 fallidas**. Los tests de proceso usan fixtures Node/`.cmd` temporales y cubren stdout/stderr, código de salida no cero, error de lanzamiento, cancelación simulada y timeout/cierre. No inician los puentes de fabricante.
- `pnpm exec eslint backend/services/signatureService.js tests/unit/native_bridge_abi.test.js tests/unit/native_bridge_process.test.js`: terminó con código 0.
- Compilación `csc.exe` x64 Wacom y ZKTeco a temp: ambas exitosas; ninguna DLL/helper de fabricante se ejecutó.
- `pnpm exec electron-builder --version`: `25.1.8`.
- El parser PowerShell reporta sintaxis válida para `scripts/verificar-artefactos-release.ps1`; no se ejecutó la verificación de artefactos porque los binarios existentes son unsigned y no hay una instalación limpia con desinstalador firmado.
- No se ejecutó `pnpm run build` para evitar sobrescribir `dist/` y los ejecutables binarios locales antes de disponer de una identidad de firma autorizada. No se conectó hardware, no se ejecutaron helpers, no se cargaron DLL y no se hicieron pruebas físicas.

### Estados pendientes

- **Matriz de destino propuesta:** Windows 10 Pro 22H2 x64, build 19045.7807, solo compatibilidad técnica con ESU; Windows 10 Enterprise LTSC 2021 x64, build 19044.7807, candidato de producción mientras permanezca soportado (revalidar antes de enero de 2027); Windows 11 Pro 26H2 x64, build 26300.9711, candidato principal de producción. Confirmar builds acumulativos vigentes y derecho de soporte antes de cada release. ZKTeco en Windows 11 queda bloqueado hasta confirmación oficial y prueba física.
- **Wacom:** binding fuente corregido; marshalling estructural aprobado por fixture; ABI nativa y captura STU-540 pendientes. `dispositivo: no probado`.
- **ZKTeco:** doce firmas aún **NO CONCLUYENTES**, licencias **PENDIENTES** y Windows 11 bloqueado hasta confirmación oficial más prueba física.
- **Distribución:** rutas/paquetes oficiales en equipos destino y dependencias transitivas deben comprobarse en laboratorio limpio. No se copió DLL ni instalador del fabricante; las licencias de redistribución continúan **PENDIENTES**.
- **Release:** requiere un certificado de firma de código con identidad del editor esperado desde secretos protegidos, luego setup/portable/instalación limpia firmados y verificación con `verificar-artefactos-release.ps1`. Los builds Windows y las pruebas físicas siguen separados del diagnóstico estático.

## Carga de SDK y aviso de prerrequisitos del setup

Fecha de actualización: 2026-10-24.

- Ambos puentes x64 ahora declaran P/Invoke por nombre (`wgssSTU.dll` y `libzkfp.dll`) en vez de fijar una ruta absoluta en `DllImport`. Antes de la primera operación del SDK, Wacom localiza una DLL app-local, una instalación bajo las carpetas Program Files del sistema o una ubicación declarada en el registro, verifica `FileVersion.StartsWith("2.18.0.82")` y usa `LoadLibraryExW` sobre la ruta encontrada. ZKTeco busca primero junto al helper y luego en el directorio de sistema que devuelve el proceso x64; carga la primera copia encontrada con `LoadLibraryExW`. En ambos casos se mantiene el módulo cargado para las llamadas P/Invoke y se reporta el error Win32 de inicialización/dependencias.
- La carga app-local permite un despliegue futuro dentro de `resources/native/<puente>` si y solo si se confirma la licencia. El fallback actual es a las instalaciones oficiales del SDK/driver. Farmacia-Control no copia ni escribe DLL en `System32`. `LoadLibraryExW` es una operación de inicialización que solo ocurre cuando el usuario invoca el puente; la consulta estática de prerrequisitos no carga bibliotecas.
- El diagnóstico busca DLL app-locales dentro de `process.resourcesPath`, en `native/*/bin` durante desarrollo y en las ubicaciones oficiales instaladas. Para ZKTeco inspecciona `libzkfp.dll`, `ZKFPCap.dll`, `fpslib.dll` e imports estáticos visibles; mantiene la advertencia de que no detecta cargas dinámicas ni todas las dependencias transitivas. Para Wacom mantiene la versión exacta requerida, arquitectura x64, exports y bloqueo independiente de ABI/captura.
- Se añadió `build/installer-bridge-prerequisites.nsh` mediante `build.nsis.include`. Al finalizar la instalación, el setup hace comprobaciones de existencia de `wgssSTU.dll`, `libzkfp.dll`, `ZKFPCap.dll` y `fpslib.dll` en recursos app-locales o rutas de instalación observadas y muestra enlaces a los fabricantes si faltan. El aviso no instala, descarga, copia ni valida ABI. La aplicación conserva el diagnóstico estático y muestra los errores de carga/inicialización cuando se intenta detectar/capturar. Una DLL presente no marca un dispositivo como funcional.
- Se añadió `tests/unit/bridge_distribution.test.js` para comprobar por texto el uso de nombres DLL, el precargador, las rutas del diagnóstico y el preflight NSIS sin cargar DLL ni ejecutar helpers.

### Límites de captura y despacho

- Wacom contiene un flujo implementado de enumeración/captura STU-540, pero su carga e interacción física no se probaron en esta actualización. La prueba de contrato C# valida marshalling estructural; la ABI nativa y la captura física siguen pendientes.
- ZKTeco contiene flujos de detección, captura de plantilla en memoria y diagnóstico de comparación 1:1 de dos capturas. La comparación de dos muestras no valida la identidad contra una plantilla inscrita. No hay un enrolamiento o referencia biométrica segura enlazada a un receptor en el flujo de despacho; por tanto, **no se afirma verificación de identidad**. Las 12 firmas ABI continúan **NO CONCLUYENTES** hasta conseguir header/wrapper oficial de la versión exacta.
- El flujo existente de despacho conserva su política de documentación incompleta y exenciones para `MUNICIPIO_VEREDA`. `entregaService.js` registra que una huella manual es `DECLARACION_MANUAL_SIN_LECTOR` y `verificada_biometricamente: false`; esa declaración no se presenta como evidencia de lector. Esta actualización no altera esas reglas de negocio.
- Las licencias de redistribución de `wgssSTU.dll`, `libzkfp.dll`, `ZKFPCap.dll`, `fpslib.dll`, `libzkfpcsharp.dll` y drivers siguen **PENDIENTES**. Wacom documenta que el instalador requiere aceptar su EULA y que `wgssSTU.dll` es el componente nativo, pero las páginas revisadas no conceden permiso explícito para redistribuirlo: [STU SDK Windows](https://developer-docs.wacom.com/docs/stu-sdk/windows-sdk/getting-started/), [Deployment](https://developer-docs.wacom.com/docs/stu-sdk/windows-sdk/deployment/). ZKTeco documenta soporte del ZK9500 y contenido del SDK, pero no permiso explícito de redistribución ni Windows 11: [ZKFinger SDK for Windows](https://www.zkteco.com/en/ZKFingerSDKforWindows).

### Verificación de esta actualización

- Pruebas enfocadas: `node --test tests/unit/bridge_prerequisites.test.js tests/unit/bridge_distribution.test.js tests/unit/native_bridge_abi.test.js tests/unit/native_bridge_process.test.js`: **32 aprobadas, 0 fallidas**.
- `csc.exe` .NET Framework x64 compiló ambos puentes; no se ejecutaron los binarios ni DLL de fabricante.
- Los ejecutables de desarrollo resultantes son `native/stu-bridge/bin/stu-bridge.exe` (32.256 bytes; SHA-256 `8422C2662E69AA8D2918275AD546F0411D30032269B7CBC27BF0A9AD94672A00`) y `native/zk-bridge/bin/zk-bridge.exe` (12.288 bytes; SHA-256 `A5F5ECEC0979F78D690EBCF442DC8745DDE5C59E64E9BB68D6B5A1BEE819FF12`). Son x64 compilados, no iniciados.
- ESLint enfocado en el servicio de prerrequisitos y la prueba nueva terminó con código 0.
- Se generó setup NSIS x64 de prueba en `%TEMP%\farmacia-control-test-installer-20261024-final\Farmacia Control-1.0.0-setup.exe` (606.145.622 bytes). Para esta invocación únicamente se pasaron `forceCodeSigning=false` y `signAndEditExecutable=false`; `package.json` conserva la política obligatoria del release. Authenticode reportó `NotSigned`, así que el artefacto es solo de prueba. El log `builder-debug.yml` confirma que NSIS incluyó el macro de prerrequisitos. El payload desempacado contiene únicamente los dos ejecutables nativos en esas carpetas; no contiene DLL de fabricante. No se instaló ni ejecutó el setup.
- La primera build de prueba no llegó al instalador: falló la extracción de `winCodeSign` porque Windows denegó crear enlaces simbólicos sin el privilegio requerido. La build final omitió el editor/firma solo por parámetros temporales y completó el target NSIS. No se obtuvo certificado ni se cambió la configuración versionada de firma.
- No se copiaron DLL de fabricante, no se conectaron dispositivos y no se realizaron pruebas físicas. El setup actual no contiene los componentes propietarios. **Dispositivo: no probado** en ambos casos.

## Addendum: bloqueo de despacho y distribución (2026-10-24)

### Validación de SDK, versiones y plataformas

- **ZKTeco / ZK-9500:** el portal oficial identifica el ZK9500 entre los equipos soportados por “ZKFinger SDK for Windows”, e indica que el paquete contiene driver, documentación de desarrollo y demo. La misma página enumera Windows hasta Windows 10 y Windows Server 2012 x86/x64; **no enumera Windows 11**. El centro oficial lista un RAR “ZKFinger SDK Windows” de 34,18 MB fechado 2022-07-25, pero no publica hashes. Estas páginas no permiten asociar ese paquete con el `libzkfp.dll` local observado, cuya versión no se pudo determinar, ni identificar con certeza la versión de su wrapper local. Por ello, las **12 firmas P/Invoke siguen NO CONCLUYENTES** frente al SDK oficial exacto; no se cambió ninguna firma ni se declara compatibilidad con Windows 11.
  - Fuentes oficiales: [ZKFinger SDK for Windows](https://www.zkteco.com/en/ZKFingerSDKforWindows), [Download Center de SDK](https://www.zkteco.com/en/SDK?keyword=ZKFinger+SDK), [FAQ ZKTeco](https://www.zkteco.com/en/faq.html). La FAQ confirma que el lector ZK9500 puede requerir su driver USB; no acredita compatibilidad de Farmacia-Control con Windows 11 ni permisos de redistribución.
  - Observación local reportada previamente: DLL principal y `ZKFPCap.dll`/`fpslib.dll` son x64 y aparecen en `C:\Windows\System32`; `libzkfp.dll` importa esas dos DLL. Esto solo caracteriza el equipo revisado; no acredita una instalación limpia, completitud de dependencias transitivas ni versión compatible.
- **Wacom / STU-540:** el SDK local fue reportado como 2.18.0.82 x64. Wacom documenta STU-540, Windows 10 o superior, `wgssSTU.dll` como componente nativo principal y la necesidad del driver para tabletas a color. La guía de deployment reserva `Interop.wgssSTU.dll` para el enlace estándar .NET/COM; el puente de Farmacia-Control usa P/Invoke directo a la DLL nativa, por lo que ese wrapper COM no es requisito de este diseño. El binding corregido de `Protocol_setHostPublicKey` aún requiere validación ABI con la DLL y captura física. Fuentes: [Getting Started](https://developer-docs.wacom.com/docs/stu-sdk/windows-sdk/getting-started/), [Deployment](https://developer-docs.wacom.com/docs/stu-sdk/windows-sdk/deployment/), [API guide](https://developer-docs.wacom.com/docs/stu-sdk/windows-sdk/api-guide/).
- **Redistribución:** ambas licencias siguen **PENDIENTES**. Wacom indica que debe aceptarse su EULA de instalación y describe archivos de deployment, pero la documentación pública consultada no otorga un permiso explícito y aplicable para redistribuir `wgssSTU.dll` o drivers. La página de terceros cubre dependencias de terceros, no concede licencia sobre la DLL de Wacom: [Third-party licenses](https://developer-docs.wacom.com/docs/stu-sdk/thirdparty/). ZKTeco describe componentes del SDK, pero las páginas oficiales citadas no acreditan permiso para redistribuir `libzkfp.dll`, `ZKFPCap.dll`, `fpslib.dll`, wrapper ni driver. No se copiaron archivos de fabricante ni instaladores al producto.

### Captura, enrolamiento y bloqueo de despacho

- El puente ZKTeco actual puede devolver una captura y un tamaño de plantilla; su comando `diagnostico` compara dos capturas de la misma sesión. No mantiene un enrolamiento ligado al documento del receptor ni compara la nueva muestra contra esa identidad registrada. Esto no es verificación de identidad.
- Se añadió la migración `035_evidencia_fisica_despacho.js`, con `firma_wacom_verificada` y `huella_identidad_verificada`, ambas `0` por defecto. El proceso principal ignora el booleano de huella enviado por renderer al decidir el despacho. En destino local, `despachoService.crear` ahora rechaza antes de cualquier operación de inventario salvo que haya firma guardada marcada por flujo Wacom confiable y una coincidencia biométrica registrada. `entregaService.crear` aplica la misma barrera. Las salidas `MUNICIPIO_VEREDA` mantienen su excepción previa de firma/huella.
- Actualmente ningún flujo productivo confiable establece esos dos campos. En consecuencia, **los despachos locales quedan bloqueados hasta completar e integrar el flujo físico real**. Es un cierre seguro del hueco anterior, donde se aceptaban capturas manuales/incompletas; no es una implementación final de enrolamiento o verificación. Las marcas del nuevo esquema no se pueden declarar satisfechas por una respuesta positiva de captura, `huella_registrada: true` ni datos aportados por el renderer.
- `biometricService` informa `verificada: false` y `CAPTURA_SIN_VERIFICAR`; la interfaz deja la huella pendiente y explica que una muestra no fue cotejada con un enrolamiento. Estado constante: **dispositivo: no probado**.
- El test fixture `dispatchEvidenceFixture.js` solo coloca precondiciones internas en bases de datos SQLite `:memory:` para conservar pruebas existentes de inventario; no usa DLL ni representa un resultado de laboratorio. No se modificaron datos reales ni se corrieron migraciones sobre `data/`.

### Instalador de 606 MB y firma observada

- El artefacto temporal previo `Farmacia Control-1.0.0-setup.exe` pesa **606.145.622 bytes**. Su directorio `win-unpacked` pesa **1.240.168.109 bytes** y contiene un `app.asar` de **950.576.899 bytes**. Inspección estática de su ASAR encontró archivos previos de build dentro de `dist/`: otro `dist/win-unpacked/resources/app.asar` (302.979.114 bytes), `Farmacia Control.exe` (186.328.576), setup (172.225.639) y portable (171.997.871). La causa es la regla demasiado amplia `dist/**/*` en `build.files`, que vuelve a incluir `dist/win-unpacked` y artefactos NSIS/portable preexistentes en la siguiente compilación; builds sucesivas pueden inflarse recursivamente.
- Se ajustó `build.files` para excluir `dist/win-unpacked/**`, ejecutables, blockmaps, `latest.yml` y `builder-debug.yml`, conservando `dist/**/*` para el frontend. Se añadió `tests/unit/release_payload.test.js` para fijar estas exclusiones. Los `dist/` existentes siguen siendo artefactos anteriores a ese cambio y no se reconstruyeron para afirmar el tamaño corregido. El setup actual en `dist/` pesa 172.225.639 bytes; el portable, 171.997.871 bytes. Por ello, no se debe confundir el artefacto actual en `dist` con el instalador temporal de 606 MB.
- Authenticode en los binarios locales revisados: setup `NotSigned` (172.225.639 bytes), portable `NotSigned` (171.997.871), app `NotSigned` (186.328.576), helper Wacom `NotSigned` (29.184), helper ZKTeco `NotSigned` (10.752) y `elevate.exe` `NotSigned` (107.520). No se detectaron `dumpbin`, `llvm-readobj`, `llvm-objdump`, `objdump` o `signtool` en `PATH`. El estado de firma bloquea release.
- La configuración versionada conserva `forceCodeSigning: true`, `signAndEditExecutable: true`, `signDlls: false`. `electron-builder` instalado: 25.1.8. El setup temporal se generó con overrides de firma solo en CLI, descritos en el registro previo; no se modificó la política de release ni se encontró un certificado de editor autorizado. No se preparó ni firmó un release.

### Pruebas y estado

- Se añadieron cuatro pruebas de reglas para orden inexistente, firma ausente, firma sin procedencia Wacom y declaración/captura de huella no verificada. También se añadió cobertura estática para excluir builds anteriores del payload. Las antiguas pruebas de inventario usan una fixture en memoria para verificar el código transaccional, sin conexión o ejecución de dispositivos.
- Las DLL o puentes de fabricante no fueron ejecutados/cargados; no hubo capturas ni pruebas físicas. No se descargó un SDK ni se integró instalador del fabricante. La ABI ZKTeco, las licencias, la compatibilidad ZKTeco en Windows 11 y la firma Authenticode del release siguen bloqueadas.
- **No se declara terminada la integración.** Para salida se requieren: documentación/header/wrapper oficial que corresponda exactamente a la DLL ZKTeco; integración de enrolamiento y matching de identidad con manejo seguro de datos biométricos y autorización de su tratamiento; procedencia confiable y persistente de la captura Wacom; confirmación de licencias e instalación oficial en destino; pruebas físicas de captura y desconexión en las versiones Windows aprobadas; y build reproducible con exclusiones comprobadas, instalador firmado y verificación Authenticode completa.

### Verificación posterior de payload y pruebas

- Build aislado final de prueba con electron-builder 25.1.8 hacia `%TEMP%\farmacia-control-install-test-final`, después de los cambios de bloqueo de despacho, pasando solo overrides CLI para omitir firma porque no hay certificado autorizado. Setup: **85.780.073 bytes**, portable: **85.551.758 bytes**, `app.asar`: **25.431.929 bytes**. El ASAR no contiene entradas de `dist/win-unpacked` ni ejecutables/blockmaps/YAML previos; el payload de `resources/native` contiene solamente `stu-bridge.exe` y `zk-bridge.exe`. No hay DLL de fabricante en el payload. No se instaló ni ejecutó el setup.
- Authenticode del artefacto de prueba: setup, portable, app, ambos helpers, `elevate.exe`, `better_sqlite3.node` y DLL de Electron no firmadas; `d3dcompiler_47.dll` tiene firma válida de Microsoft. Por tanto, esta build confirma el filtrado de payload, pero **no sirve como release**. No se instaló el setup.
- Pruebas después del bloqueo de despacho: `node --test tests/business-rules/dispatch_evidence.test.js tests/business-rules/reglas_negocio.test.js tests/database/sqlite_transaccionalidad.test.js tests/sync-offline/offline_sync.test.js`: **30 aprobadas, 0 fallidas**. `node --test tests/unit/bridge_prerequisites.test.js tests/unit/bridge_distribution.test.js tests/unit/native_bridge_abi.test.js tests/unit/native_bridge_process.test.js tests/unit/release_payload.test.js`: **34 aprobadas, 0 fallidas**. ESLint enfocado terminó con código 0; `git diff --check` no encontró errores de whitespace (solo avisos CRLF/LF de Git).
- `better-sqlite3` se pasó temporalmente a ABI Node 127 para ejecutar las pruebas y luego se restauró con `pnpm run rebuild:electron`. Verificación final con el ejecutable de Electron: **Electron 32.3.3, ABI 128, SQLite carga correctamente**. No se ejecutó `pnpm run build` (que dispara los scripts de compilación de los puentes) ni se compilaron/ejecutaron puentes durante esta última build aislada; electron-builder reconstruyó únicamente la dependencia SQLite para empaquetar.

## Inventario local, límite de confianza y próximos bloqueos

Fecha de actualización: 2026-10-24. Esta sección registra metadatos del equipo de desarrollo consultados localmente. No implica que esos componentes estén en el repositorio, el setup o equipos destino.

### Componentes locales por build/hash

| Componente | Ruta observada | Tamaño | Versión/metadato | Arquitectura | SHA-256 | Authenticode / dependencias visibles |
|---|---|---:|---|---|---|---|
| Wacom `wgssSTU.dll` (build x64) | `C:\Program Files (x86)\Wacom STU SDK\C\bin\x64\wgssSTU.dll` | 1.180.680 | FileVersion `2.18.0.82`, ProductVersion `2.18.0` | x64 | `89A0BF50D59870BD1AF9A00D72F22F71293E5DC7F73B8C1AF2EF5D622C0E486D` | Válida, Wacom Co., Ltd.; imports estáticos: `KERNEL32`, `USER32`, `ADVAPI32`, `ole32`, `OLEAUT32`, `SETUPAPI`, `HID`, `VERSION`, `WINHTTP` |
| Wacom `wgssSTU.dll` (copia COM x64) | `C:\Program Files (x86)\Wacom STU SDK\COM\bin\x64\wgssSTU.dll` | 1.180.680 | `2.18.0.82` / `2.18.0` | x64 | `89A0BF50D59870BD1AF9A00D72F22F71293E5DC7F73B8C1AF2EF5D622C0E486D` | Válida, Wacom; hash idéntico a la build C x64 |
| Wacom `wgssSTU.dll` (copia Java x64) | `C:\Program Files (x86)\Wacom STU SDK\Java\jar\x64\wgssSTU.dll` | 1.180.680 | `2.18.0.82` / `2.18.0` | x64 | `89A0BF50D59870BD1AF9A00D72F22F71293E5DC7F73B8C1AF2EF5D622C0E486D` | Válida, Wacom; hash idéntico a las copias C/COM x64 |
| Wacom `wgssSTU.dll` (SigCaptX STU) | `C:\Program Files\Wacom SigCaptX STU\wgssSTU.dll` | 1.180.680 | `2.18.0.82` / `2.18.0` | x64 | `89A0BF50D59870BD1AF9A00D72F22F71293E5DC7F73B8C1AF2EF5D622C0E486D` | Válida, Wacom; mismo contenido/hash. Es una ubicación local, no evidencia de autorización para redistribuir |
| Wacom `wgssSTU.dll` Win32 | `C:\Program Files (x86)\Wacom STU SDK\C\bin\Win32\wgssSTU.dll` | 1.093.128 | FileVersion `2.18.0.82` | x86 | `DF8246698E6DAFB042324A1962A53B77BF6546F96A542B1005BEC5B8448E46BD` | Válida, Wacom; no mezclar con x64: incompatible con los puentes x64 |
| Wacom interop .NET | `C:\Program Files (x86)\Wacom STU SDK\COM\bin\x64\Interop.wgssSTU.dll` | 128.512 | FileVersion `2.18.0.82`, ProductVersion `2.18.0` | MSIL/AnyCPU | `B49669989327EBA42747883829C4EAC0D7B70B8103D4A2EFF647FB4A6828C6E3` | Sin firma Authenticode. No está referenciado por el puente, que hace P/Invoke directo a `wgssSTU.dll` |
| ZKTeco `libzkfp.dll` | `C:\Windows\System32\libzkfp.dll` | 277.504 | FileVersion/ProductVersion no informadas | x64 | `1678F86185645E8826078248D4B9F56A8E244BAB08A44AFEB3AE51EC8F2AB8B6` | Sin firma Authenticode; imports directos: `KERNEL32`, `OLEAUT32`, `ZKFPCap.dll`, `fpslib.dll` |
| ZKTeco `ZKFPCap.dll` | `C:\Windows\System32\ZKFPCap.dll` | 97.792 | FileVersion/ProductVersion `5.0.0.1` | x64 | `55DFA7A30B2D737276AF241EA37F6D54DCBE71BB53A6350BB1277DF101EE3126` | Sin firma Authenticode; imports `KERNEL32`, `SHLWAPI` |
| ZKTeco `fpslib.dll` | `C:\Windows\System32\fpslib.dll` | 958.464 | FileVersion/ProductVersion no informadas | x64 | `FB0F453C917926E50435971D3C753FB94E0D440F9A4B89C5D21782C5F23A5EEE` | Sin firma Authenticode; imports `KERNEL32`, `USER32`, `ADVAPI32`, `SHLWAPI`, `IPHLPAPI` |
| ZKTeco wrapper .NET local | `C:\Windows\System32\libzkfpcsharp.dll` | 13.312 | FileVersion/ProductVersion `1.0.0.1` | MSIL/AnyCPU | `CDD44C5580260CCCC55B85CDF3C69B99017D556AF4CA7ABB821E96A0CA68ECF9` | Sin firma Authenticode; metadatos IL-only. No demuestra que corresponda al hash/build de `libzkfp.dll` |

Las dependencias Windows enumeradas son imports PE directos, no un grafo completo: no revelan cargas dinámicas ni garantizan que cada API del sistema esté disponible en toda edición/build de Windows. El inventario no ejecutó ni cargó los componentes.

### SDK y controlador presentes

- Registro de productos instalado localmente: Wacom STU SDK `2.18.0.82`, Wacom Signature SDK `4.10.7`, Wacom SigCaptX STU `2.18.0.82`, Wacom Signature SDK - SigCaptX `1.27.3.96`, y entradas de controlador STU x64 `5.4.5` y `5.5.0` (también aparece una entrada STU Driver `5.4.5`). La coexistencia de esas entradas no identifica por sí sola qué paquete INF está activo para un STU-540.
- Los INF de Wacom listados por `pnputil` incluyen `signtab.inf` / `signtabhid.inf` 1.1.2.0, `wachidrouter_pro.inf` / `_re.inf` 4.0.0.4, `wacomrouterfilter.inf` 4.0.0.0, `wacom_wusd.inf` 1.0.0.3 y `wacpaper.inf` 1.0.0.2; sus firmantes observados son Microsoft Hardware Compatibility Publisher. No se atribuyen todos al STU-540 ni se afirma que uno esté vinculado al dispositivo activo.
- El catálogo reporta paquete ZKTeco `zkusbdevices.inf`, versión 1.2.6.0, fechado 2017-06-01 y publicado por Microsoft Hardware Compatibility Publisher. Prueba que existe un paquete driver local, no la versión SDK de `libzkfp.dll`, autorización de redistribución ni selección activa del dispositivo.
- La búsqueda en carpetas habituales de `Program Files` encontró headers y binaries Wacom, incluido `C\include\WacomGSS\wgssSTU.h` (84.441 bytes), pero no SDK/header ZKTeco. `Get-PnpDevice -PresentOnly` no reportó un dispositivo presente que coincida con Wacom/STU/ZKTeco/huella. La consulta elevada adicional de drivers no se realizó; por tanto, no se infiere el binding PnP activo.
- La documentación oficial de Wacom recomienda el STU Driver 5.4.5; para STU-540 lo recomienda para rendimiento óptimo de carga de imágenes en Windows 10 y Windows 11. Esto acredita un prerrequisito técnico recomendado, no permiso para redistribuir el driver ni para empacarlo con Farmacia-Control. [Wacom: STU Driver Installation](https://developer-support.wacom.com/hc/en-us/articles/9354527258007-STU-Driver-Installation)
- Wacom documenta `wgssSTU.dll` como código de API y `Interop.wgssSTU.dll` como interfaz .NET de su vía ActiveX/COM. El código actual usa P/Invoke nativo y no referencia el wrapper; por ello la ausencia de `Interop.wgssSTU.dll` en el payload no es el bloqueo de este diseño. El uso directo no concede derechos sobre la DLL. Wacom exige aceptar la EULA durante la instalación y la documentación pública revisada no concede inequívocamente permiso para redistribuir la DLL/driver. [Wacom: Deployment](https://developer-docs.wacom.com/docs/stu-sdk/windows-sdk/deployment/), [Getting Started](https://developer-docs.wacom.com/docs/stu-sdk/windows-sdk/getting-started/)
- La página oficial ZKTeco identifica ZK9500 entre los dispositivos compatibles con ZKFinger SDK Windows y lista sistemas hasta Windows 10/Windows Server 2012; no enumera Windows 11. El portal lista un RAR de 34,18 MB fechado 2022-07-25 sin SHA-256 publicado. No se descargó el paquete. No se puede correlacionar ese release con el hash `1678...AB8B6` de la DLL local. [ZKTeco: ZKFinger SDK for Windows](https://www.zkteco.com/en/Biometrics_Module_SDK/ZKFinger-SDK-for-Windows), [Download Center](https://www.zkteco.com/en/SDK?keyword=ZKFinger+SDK)
- En consecuencia, las doce P/Invoke ZKTeco permanecen **NO CONCLUYENTES** frente al build exacto; dependencias transitivas, soporte Windows 11 y derechos de redistribución también quedan pendientes. No se mezclan la DLL nativa x64 local, el wrapper MSIL local ni el RAR oficial no obtenido.

**Consulta Wacom sugerida (no enviada):** solicitar por escrito, citando STU SDK/SigCaptX y driver observados, qué paquete/versión de driver es la aplicable a STU-540 y si el instalador puede distribuirse o invocarse desde un instalador comercial; pedir el texto de licencia aplicable a `wgssSTU.dll` 2.18.0.82 en instalación app-local y en ruta del SDK; aclarar si el uso por P/Invoke nativo está cubierto; y solicitar instrucciones de deployment y soporte técnico para Windows 10/11 x64. La guía pública recomienda driver 5.4.5 para óptimo rendimiento STU-540 en ambos sistemas, pero el equipo contiene entradas 5.4.5 y 5.5.0. No se deduce que la copia 5.5.0 sea inválida ni redistribuible sin respuesta del fabricante.

### Solicitud técnica preparada para ZKTeco (no enviada)

> **Asunto: Confirmación de versión, ABI y redistribución de ZKFinger SDK para ZK9500**
>
> Estamos integrando el ZK9500 en una aplicación comercial x64 para Windows. En un equipo de desarrollo encontramos `libzkfp.dll` x64, tamaño 277.504 bytes, SHA-256 `1678F86185645E8826078248D4B9F56A8E244BAB08A44AFEB3AE51EC8F2AB8B6`, sin FileVersion/ProductVersion; sus imports PE visibles incluyen `ZKFPCap.dll` y `fpslib.dll`. También hay `ZKFPCap.dll` x64, versión 5.0.0.1, SHA-256 `55DFA7A30B2D737276AF241EA37F6D54DCBE71BB53A6350BB1277DF101EE3126`, `fpslib.dll` x64 SHA-256 `FB0F453C917926E50435971D3C753FB94E0D440F9A4B89C5D21782C5F23A5EEE` y `libzkfpcsharp.dll` 1.0.0.1 SHA-256 `CDD44C5580260CCCC55B85CDF3C69B99017D556AF4CA7ABB821E96A0CA68ECF9`. ¿Pueden confirmar si estos archivos provienen del mismo release oficial y proporcionar un manifiesto/hash o identificador verificable del paquete?
>
> Solicitamos para ese release: (1) header y wrapper oficiales aplicables y prototipos completos para las 12 funciones `ZKFPM_Init`, `ZKFPM_Terminate`, `ZKFPM_GetDeviceCount`, `ZKFPM_OpenDevice`, `ZKFPM_CloseDevice`, `ZKFPM_GetParameters`, `ZKFPM_GetCaptureParamsEx`, `ZKFPM_AcquireFingerprint`, `ZKFPM_CreateDBCache`, `ZKFPM_CloseDBCache`, `ZKFPM_MatchFinger`, `ZKFPM_DBGetParameter`, incluyendo calling convention, tipos, packing, tamaños de buffers, ownership y liberación; (2) lista de dependencias directas/transitivas y runtimes de Visual C++ requeridos, arquitectura y rutas recomendadas; (3) builds/ediciones de Windows 10 y 11 x64 oficialmente soportados, y confirmación expresa para ZK9500 en Windows 11; (4) licencia que autorice o prohíba redistribuir cada DLL, wrapper, driver y runtime dentro de un instalador comercial offline y condiciones de avisos/atribución; (5) procedimiento de instalación y prueba limpia recomendado.
>
> Hasta recibir evidencia aplicable, no distribuiremos dichos archivos ni declararemos las firmas ABI compatibles.

### Enrolamiento, confianza y bloqueo de despacho

- `biometricService.capturarHuella()` devuelve solo metadatos y `verificada:false`; el puente actual captura una muestra temporal, no la compara contra una plantilla previamente enrolada. No se registra template ni existe identidad biométrica segura asociada al receptor. Por tanto no hay enrolamiento/verificación productivos ni prueba biométrica que pueda desbloquear despacho.
- Las flags `firma_wacom_verificada` y `huella_identidad_verificada` nacen en `0`; el código de captura/IPC actual no las escribe. La firma de una orden puede recibirse como dato de documentación enviado desde renderer, pero por sí sola no activa la flag confiable. `despachoService` y `entregaService` consultan las flags persistidas; mandar `huella_verificada`, `huella_registrada` o un tipo de destino falso desde renderer no cuenta como verificación. El test de regresión comprueba el último caso.
- La corrección local en `backend/services/entregaService.js` obtiene `tipo_destino` de la orden almacenada y rechaza si no existe la orden o si faltan ambas evidencias verificadas; evita que `data.tipo_destino` enviado por renderer convierta una orden local en salida exenta. `tests/business-rules/dispatch_evidence.test.js` cubre ese bypass. La política existente para órdenes `MUNICIPIO_VEREDA` se conserva; no se ha agregado una excepción nueva. Para órdenes locales, el despacho continúa bloqueado mientras no exista evidencia confiable de ambos dispositivos.
- Diseño pendiente para biometría: enrolar solo una plantilla obtenida por el proceso principal del dispositivo confirmado y ligada al ID/documento inmutable del receptor; confirmar dos o más capturas según el protocolo oficial del SDK, verificar calidad y coincidencia con umbral del fabricante (no inventado); nunca aceptar una declaración del renderer. Proteger plantilla cifrada en reposo bajo una clave protegida por Windows (por ejemplo DPAPI con alcance y recuperación aprobados), limitar acceso a procesos/roles autorizados, no devolver plantilla/imágenes ni incluirlas en logs/sync/backup sin política explícita; documentar consentimiento, finalidad, retención, revocación y borrado. Al verificar 1:1, el main emite evidencia de un solo uso ligada al receptor y a la orden, con fecha, versión del SDK y hash del artefacto/captura permitida, y la invalida ante edición de identidad, cancelación, desconexión o expiración. Implementar solo con ABI oficial confirmada y revisión legal/privacidad. La representación y formato de template ZKTeco no están determinados actualmente.

### Pruebas de esta actualización

- Automatizadas de puentes/preflight/IPC/marshalling/procesos/exclusiones: `node --test tests/unit/bridge_prerequisites.test.js tests/unit/bridge_distribution.test.js tests/unit/native_bridge_abi.test.js tests/unit/native_bridge_process.test.js tests/unit/release_payload.test.js` — **34 aprobadas, 0 fallidas**. Usan fixtures y un helper Node temporal; no se cargaron DLL ni se iniciaron los puentes nativos.
- Automatizadas SQLite y reglas: `node --test tests/business-rules/dispatch_evidence.test.js tests/business-rules/reglas_negocio.test.js tests/database/sqlite_transaccionalidad.test.js tests/sync-offline/offline_sync.test.js` — **31 aprobadas, 0 fallidas**. `better-sqlite3` se compiló temporalmente para Node CLI; `tests/helpers/testDb.js` usa `:memory:`. `data/farmacia.db` conservó tamaño (1.056.768 bytes) y fecha observada (2026-10-23), sin cambios por estas pruebas.
- Se restauró el runtime normal con `pnpm run rebuild:electron`; completó correctamente `better-sqlite3` para Electron 32.3.3/ABI 128. No se ejecutó compilación de puentes, `pnpm run build`, instalador, DLL ni helper de fabricante.
- `git diff --check` no informó errores; muestra únicamente avisos de normalización CRLF/LF en archivos ya modificados localmente.
- No se realizó prueba con STU-540 ni ZK9500 conectado. Ambos permanecen **`dispositivo: no probado`**.

### Decisión de preparación

No está listo para distribuir como versión funcional con dispositivos. El payload reducido y las exclusiones de `dist` permanecen como están; no se generó release ni se cambiaron política de firma o archivos de fabricante. Bloqueos externos/técnicos: conseguir paquete y ABI ZKTeco de versión exacta, confirmación oficial de Windows 11 y redistribución; obtener confirmación de redistribución Wacom; ejecutar pruebas autorizadas de ABI/captura física en equipos limpios; e implementar enrolamiento y verificación biométrica reales con controles de privacidad. La evidencia de prerrequisitos estáticos no equivale a funcionamiento.
