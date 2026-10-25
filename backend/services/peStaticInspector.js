'use strict';

const MACHINE_X86 = 0x014C;
const MACHINE_X64 = 0x8664;
const MAX_TABLE_ENTRIES = 100000;
const MAX_U32_PLUS_ONE = 0x100000000;
const RESOURCE_VERSION_ID = 16;

class PeInspectionError extends Error {
  constructor(message, code = 'PE_INVALIDO') {
    super(message);
    this.name = 'PeInspectionError';
    this.code = code;
  }
}

function exigirRango(buffer, offset, length, label) {
  if (!Number.isSafeInteger(offset) || !Number.isSafeInteger(length) || offset < 0 || length < 0 ||
      offset > buffer.length || length > buffer.length - offset) {
    throw new PeInspectionError(`Estructura PE fuera de rango: ${label}.`);
  }
}

function exigirSumaU32(inicio, longitud, label) {
  if (!Number.isSafeInteger(inicio) || !Number.isSafeInteger(longitud) || inicio < 0 || longitud < 0 ||
      inicio >= MAX_U32_PLUS_ONE || longitud > MAX_U32_PLUS_ONE - inicio) {
    throw new PeInspectionError(`Desbordamiento PE en ${label} (${inicio} + ${longitud}).`);
  }
  return inicio + longitud;
}

function leerU16(buffer, offset, label) {
  exigirRango(buffer, offset, 2, label);
  return buffer.readUInt16LE(offset);
}

function leerU32(buffer, offset, label) {
  exigirRango(buffer, offset, 4, label);
  return buffer.readUInt32LE(offset);
}

function alinear4(offset) {
  const resultado = Math.ceil(offset / 4) * 4;
  if (!Number.isSafeInteger(resultado)) throw new PeInspectionError('Desbordamiento al alinear estructura PE.');
  return resultado;
}

function leerCadenaAscii(buffer, offset, label, limit = buffer.length) {
  if (!Number.isSafeInteger(limit) || limit > buffer.length || offset < 0 || offset >= limit) {
    throw new PeInspectionError(`Cadena PE fuera de rango: ${label}.`);
  }
  const end = buffer.indexOf(0, offset);
  if (end < 0 || end >= limit) throw new PeInspectionError(`Cadena PE sin terminador: ${label}.`);
  const value = buffer.toString('latin1', offset, end);
  if ([...value].some((char) => char.charCodeAt(0) > 0x7F)) {
    throw new PeInspectionError(`Cadena PE no ASCII: ${label}.`);
  }
  return value;
}

function leerCadenaUtf16(buffer, start, limit) {
  if (!Number.isSafeInteger(start) || !Number.isSafeInteger(limit) || start < 0 || limit > buffer.length || start >= limit) {
    throw new PeInspectionError('Cadena UTF-16 PE fuera de rango.');
  }
  let end = start;
  while (end + 1 < limit) {
    if (buffer.readUInt16LE(end) === 0) return { value: buffer.toString('utf16le', start, end), next: end + 2 };
    end += 2;
  }
  throw new PeInspectionError('Cadena UTF-16 PE sin terminador.');
}

function parsearBloqueVersion(buffer, start, limit, depth = 0) {
  if (depth > 12) throw new PeInspectionError('Jerarquía VERSIONINFO demasiado profunda.');
  exigirRango(buffer, start, 6, 'VERSIONINFO header');
  const length = leerU16(buffer, start, 'VERSIONINFO.wLength');
  const valueLength = leerU16(buffer, start + 2, 'VERSIONINFO.wValueLength');
  const type = leerU16(buffer, start + 4, 'VERSIONINFO.wType');
  const end = exigirSumaU32(start, length, 'VERSIONINFO.wLength');
  if (length < 6 || end > limit || (type !== 0 && type !== 1)) {
    throw new PeInspectionError('Bloque VERSIONINFO inválido.');
  }
  const key = leerCadenaUtf16(buffer, start + 6, end);
  const valueStart = alinear4(key.next);
  const valueBytes = type === 1 ? exigirSumaU32(0, valueLength * 2, 'VERSIONINFO.wValueLength') : valueLength;
  const valueEnd = exigirSumaU32(valueStart, valueBytes, 'VERSIONINFO.value');
  if (valueEnd > end) throw new PeInspectionError('Valor VERSIONINFO fuera de su bloque.');
  const value = buffer.subarray(valueStart, valueEnd);
  let childStart = alinear4(valueEnd);
  const children = [];
  while (childStart < end) {
    if (end - childStart < 6) {
      if (buffer.subarray(childStart, end).some((byte) => byte !== 0)) throw new PeInspectionError('Relleno VERSIONINFO inválido.');
      break;
    }
    const childLength = leerU16(buffer, childStart, 'VERSIONINFO child length');
    if (childLength === 0) {
      if (buffer.subarray(childStart, end).some((byte) => byte !== 0)) throw new PeInspectionError('Terminador VERSIONINFO con datos residuales.');
      break;
    }
    if (childLength < 6) throw new PeInspectionError('Longitud de subbloque VERSIONINFO inválida.');
    const childEnd = exigirSumaU32(childStart, childLength, 'VERSIONINFO child');
    if (childEnd > end) throw new PeInspectionError('Subbloque VERSIONINFO truncado.');
    children.push(parsearBloqueVersion(buffer, childStart, end, depth + 1));
    childStart = alinear4(childEnd);
  }
  return { key: key.value, type, value, children };
}

function cadenaVersion(node) {
  if (!node || node.type !== 1 || node.value.length < 2 || node.value.length % 2 !== 0 || node.value.readUInt16LE(node.value.length - 2) !== 0) return null;
  const raw = node.value.toString('utf16le');
  if (raw.slice(0, -1).includes('\0')) return null;
  const value = raw.replace(/\0+$/g, '');
  return value || null;
}

function leerFileVersion(buffer, dataOffset, dataSize) {
  exigirRango(buffer, dataOffset, dataSize, 'VERSIONINFO resource');
  if (dataSize < 6) throw new PeInspectionError('Recurso VERSIONINFO truncado.');
  const root = parsearBloqueVersion(buffer, dataOffset, dataOffset + dataSize);
  if (root.key !== 'VS_VERSION_INFO' || root.type !== 0) throw new PeInspectionError('Raíz VERSIONINFO desconocida.');

  const stringInfo = root.children.find((child) => child.key === 'StringFileInfo');
  const languageTables = stringInfo?.children || [];
  const varInfo = root.children.find((child) => child.key === 'VarFileInfo');
  const translation = varInfo?.children.find((child) => child.key === 'Translation');
  let preferredTables = languageTables;
  if (translation) {
    if (translation.type !== 0 || translation.value.length === 0 || translation.value.length % 4 !== 0) {
      throw new PeInspectionError('Translation VERSIONINFO incompleto.');
    }
    const keys = [];
    for (let offset = 0; offset + 4 <= translation.value.length; offset += 4) {
      keys.push(`${translation.value.readUInt16LE(offset).toString(16).padStart(4, '0')}${translation.value.readUInt16LE(offset + 2).toString(16).padStart(4, '0')}`.toLowerCase());
    }
    const selected = keys.flatMap((key) => languageTables.filter((table) => table.key.toLowerCase() === key));
    if (selected.length) preferredTables = selected;
    else if (languageTables.length) throw new PeInspectionError('Translation no corresponde a una tabla FileVersion.');
  } else if (languageTables.length > 1) {
    throw new PeInspectionError('VERSIONINFO tiene varias tablas sin Translation para elegir una FileVersion confiable.');
  }

  let fileVersionNodeFound = false;
  for (const table of preferredTables) {
    const fileVersionNode = table.children.find((entry) => entry.key === 'FileVersion');
    if (!fileVersionNode) continue;
    fileVersionNodeFound = true;
    const value = cadenaVersion(fileVersionNode);
    if (value !== null) return value;
  }
  if (fileVersionNodeFound) throw new PeInspectionError('FileVersion de VERSIONINFO incompleto.');

  if (root.value.length < 52 || root.value.readUInt32LE(0) !== 0xFEEF04BD) {
    throw new PeInspectionError('VS_FIXEDFILEINFO incompleto o inválido.');
  }
  const versionMs = root.value.readUInt32LE(8);
  const versionLs = root.value.readUInt32LE(12);
  return [versionMs >>> 16, versionMs & 0xFFFF, versionLs >>> 16, versionLs & 0xFFFF].join('.');
}

function parsearPe(buffer) {
  if (!Buffer.isBuffer(buffer) || buffer.length < 64) throw new PeInspectionError('Archivo demasiado corto para ser PE.');
  if (buffer.toString('ascii', 0, 2) !== 'MZ') throw new PeInspectionError('Falta la firma DOS MZ.');
  const peOffset = leerU32(buffer, 0x3C, 'e_lfanew');
  if (peOffset < 64) throw new PeInspectionError('e_lfanew apunta dentro de la cabecera DOS.');
  exigirRango(buffer, peOffset, 24, 'cabecera PE/COFF');
  if (buffer.toString('ascii', peOffset, peOffset + 4) !== 'PE\0\0') throw new PeInspectionError('Falta la firma PE.');

  const machine = leerU16(buffer, peOffset + 4, 'COFF.Machine');
  const sectionCount = leerU16(buffer, peOffset + 6, 'COFF.NumberOfSections');
  const optionalSize = leerU16(buffer, peOffset + 20, 'COFF.SizeOfOptionalHeader');
  if (sectionCount === 0 || sectionCount > 96) throw new PeInspectionError('Cantidad de secciones PE inválida.');
  const optionalOffset = peOffset + 24;
  exigirRango(buffer, optionalOffset, optionalSize, 'optional header');
  const magic = leerU16(buffer, optionalOffset, 'OptionalHeader.Magic');
  const isPe32Plus = magic === 0x20B;
  const isPe32 = magic === 0x10B;
  if (!isPe32Plus && !isPe32) throw new PeInspectionError('Formato de optional header PE no reconocido.');
  if ((machine === MACHINE_X64 && !isPe32Plus) || (machine === MACHINE_X86 && !isPe32)) {
    throw new PeInspectionError('COFF.Machine y OptionalHeader.Magic no son coherentes.');
  }

  const directoryBaseRelative = isPe32Plus ? 112 : 96;
  const numberOfDirectoriesOffset = isPe32Plus ? 108 : 92;
  const minimumOptionalSize = directoryBaseRelative + 4;
  if (optionalSize < minimumOptionalSize) throw new PeInspectionError('Optional header PE truncado.');
  const numberOfDirectories = leerU32(buffer, optionalOffset + numberOfDirectoriesOffset, 'NumberOfRvaAndSizes');
  if (numberOfDirectories > Math.floor((optionalSize - directoryBaseRelative) / 8)) {
    throw new PeInspectionError('NumberOfRvaAndSizes excede el optional header.');
  }
  const sizeOfImage = leerU32(buffer, optionalOffset + 56, 'SizeOfImage');
  const sizeOfHeaders = leerU32(buffer, optionalOffset + 60, 'SizeOfHeaders');
  if (sizeOfImage === 0 || sizeOfHeaders === 0 || sizeOfHeaders > buffer.length || sizeOfHeaders > sizeOfImage) {
    throw new PeInspectionError('SizeOfImage o SizeOfHeaders inválido.');
  }

  const sectionOffset = exigirSumaU32(optionalOffset, optionalSize, 'section table');
  const sectionTableBytes = sectionCount * 40;
  exigirRango(buffer, sectionOffset, sectionTableBytes, 'tabla de secciones');
  const sectionTableEnd = sectionOffset + sectionTableBytes;
  if (sectionTableEnd > sizeOfHeaders) throw new PeInspectionError('La tabla de secciones excede SizeOfHeaders.');
  const sections = [];
  for (let index = 0; index < sectionCount; index += 1) {
    const offset = sectionOffset + index * 40;
    const virtualSize = leerU32(buffer, offset + 8, 'Section.VirtualSize');
    const virtualAddress = leerU32(buffer, offset + 12, 'Section.VirtualAddress');
    const rawSize = leerU32(buffer, offset + 16, 'Section.SizeOfRawData');
    const rawAddress = leerU32(buffer, offset + 20, 'Section.PointerToRawData');
    const characteristics = leerU32(buffer, offset + 36, 'Section.Characteristics');
    const virtualLength = virtualSize || rawSize;
    const virtualEnd = exigirSumaU32(virtualAddress, virtualLength, 'Section.VirtualAddress');
    const rawEnd = exigirSumaU32(rawAddress, rawSize, 'Section.PointerToRawData');
    if (virtualAddress < sizeOfHeaders || virtualEnd > sizeOfImage) throw new PeInspectionError('Sección virtual fuera de SizeOfImage.');
    if (rawSize && (rawAddress < sizeOfHeaders || rawEnd > buffer.length)) throw new PeInspectionError('Sección raw fuera del archivo.');
    sections.push({ virtualSize, virtualAddress, rawSize, rawAddress, virtualEnd, rawEnd, characteristics });
  }
  for (let index = 0; index < sections.length; index += 1) {
    for (let other = index + 1; other < sections.length; other += 1) {
      const left = sections[index];
      const right = sections[other];
      if (left.virtualAddress < right.virtualEnd && right.virtualAddress < left.virtualEnd) {
        throw new PeInspectionError('Secciones virtuales superpuestas.');
      }
      if (left.rawSize && right.rawSize && left.rawAddress < right.rawEnd && right.rawAddress < left.rawEnd) {
        throw new PeInspectionError('Secciones raw superpuestas.');
      }
    }
  }

  function rvaAOffset(rva, size, label) {
    const end = exigirSumaU32(rva, size, label);
    if (rva < sizeOfHeaders) {
      if (end > sizeOfHeaders || end > buffer.length) throw new PeInspectionError(`RVA de cabecera fuera de límites: ${label}.`);
      return rva;
    }
    const matches = sections.filter((section) => rva >= section.virtualAddress && rva < section.virtualEnd);
    if (matches.length !== 1) throw new PeInspectionError(`RVA PE ambiguo o no mapeable: ${label}.`);
    const section = matches[0];
    const delta = rva - section.virtualAddress;
    if (delta + size > section.rawSize) throw new PeInspectionError(`RVA PE sin bytes raw suficientes: ${label}.`);
    const offset = exigirSumaU32(section.rawAddress, delta, label);
    exigirRango(buffer, offset, size, label);
    return offset;
  }

  function leerCadenaRva(rva, label, limiteRva = null) {
    const offset = rvaAOffset(rva, 1, label);
    let limiteOffset;
    if (rva < sizeOfHeaders) {
      limiteOffset = sizeOfHeaders;
    } else {
      const section = sections.find((item) => rva >= item.virtualAddress && rva < item.virtualEnd);
      limiteOffset = section.rawAddress + section.rawSize;
    }
    if (limiteRva !== null) {
      const finPermitido = rvaAOffset(limiteRva - 1, 1, `${label} boundary`) + 1;
      limiteOffset = Math.min(limiteOffset, finPermitido);
    }
    return leerCadenaAscii(buffer, offset, label, limiteOffset);
  }

  function dataDirectory(index) {
    if (index >= numberOfDirectories) return { rva: 0, size: 0, offset: null };
    const offset = optionalOffset + directoryBaseRelative + index * 8;
    exigirRango(buffer, offset, 8, `DataDirectory[${index}]`);
    const rva = leerU32(buffer, offset, 'DataDirectory.VirtualAddress');
    const size = leerU32(buffer, offset + 4, 'DataDirectory.Size');
    if ((rva === 0) !== (size === 0)) {
      if (index === 2) return { rva, size, offset: null, error: 'Resource data directory incompleto.' };
      throw new PeInspectionError(`DataDirectory[${index}] incompleto.`);
    }
    let mappedOffset = null;
    if (rva !== 0) {
      try {
        if (index === 4) { // Security directory usa offset de archivo, no RVA.
          exigirRango(buffer, rva, size, 'security directory');
          mappedOffset = rva;
        } else {
          mappedOffset = rvaAOffset(rva, size, `DataDirectory[${index}]`);
        }
      } catch (error) {
        if (index === 2) return { rva, size, offset: null, error: error.message };
        throw error;
      }
    }
    return { rva, size, offset: mappedOffset };
  }

  const directories = Array.from({ length: numberOfDirectories }, (_, index) => dataDirectory(index));
  const exportDirectory = directories[0] || { rva: 0, size: 0, offset: null };
  const exports = [];
  const exportsInvalid = [];
  const forwardedExports = [];
  if (exportDirectory.rva) {
    if (exportDirectory.size < 40) throw new PeInspectionError('Export directory truncado.');
    const offset = exportDirectory.offset;
    const functionCount = leerU32(buffer, offset + 20, 'Export.NumberOfFunctions');
    const nameCount = leerU32(buffer, offset + 24, 'Export.NumberOfNames');
    const functionsRva = leerU32(buffer, offset + 28, 'Export.AddressOfFunctions');
    const namesRva = leerU32(buffer, offset + 32, 'Export.AddressOfNames');
    const ordinalsRva = leerU32(buffer, offset + 36, 'Export.AddressOfNameOrdinals');
    if (functionCount > MAX_TABLE_ENTRIES || nameCount > MAX_TABLE_ENTRIES) {
      throw new PeInspectionError('Tabla de exports PE inválida o excede el límite.');
    }
    if ((functionCount > 0) !== (functionsRva !== 0) || (nameCount > 0) !== (namesRva !== 0 && ordinalsRva !== 0)) {
      throw new PeInspectionError('Tablas de exports PE incompletas.');
    }
    const functionsOffset = functionCount ? rvaAOffset(functionsRva, functionCount * 4, 'export address table') : 0;
    const namesOffset = nameCount ? rvaAOffset(namesRva, nameCount * 4, 'export names') : 0;
    const ordinalsOffset = nameCount ? rvaAOffset(ordinalsRva, nameCount * 2, 'export ordinals') : 0;
    const seenNames = new Set();
    const forwarderStart = exportDirectory.rva;
    const forwarderEnd = exigirSumaU32(forwarderStart, exportDirectory.size, 'export directory end');
    function validarRangoExport(rva, size, label) {
      const end = exigirSumaU32(rva, size, label);
      if (rva < forwarderStart || end > forwarderEnd) throw new PeInspectionError(`${label} excede el export directory.`);
    }
    if (functionCount) validarRangoExport(functionsRva, functionCount * 4, 'export address table');
    if (nameCount) {
      validarRangoExport(namesRva, nameCount * 4, 'export names');
      validarRangoExport(ordinalsRva, nameCount * 2, 'export ordinals');
    }
    for (let index = 0; index < nameCount; index += 1) {
      const nameRva = leerU32(buffer, namesOffset + index * 4, 'Export.NameRVA');
      if (!nameRva) throw new PeInspectionError('Export.NameRVA es cero.');
      validarRangoExport(nameRva, 1, 'export name');
      const name = leerCadenaRva(nameRva, 'export name', forwarderEnd);
      const ordinalIndex = leerU16(buffer, ordinalsOffset + index * 2, 'Export.Ordinal');
      if (!name || ordinalIndex >= functionCount) {
        exportsInvalid.push({ nombre: name, ordinal: ordinalIndex, motivo: !name ? 'nombre vacío' : 'ordinal fuera de rango' });
        continue;
      }
      const ordinalBase = leerU32(buffer, offset + 16, 'Export.Base');
      const ordinal = exigirSumaU32(ordinalBase, ordinalIndex, 'export ordinal');
      if (ordinal > 0xFFFFFFFF) throw new PeInspectionError('Ordinal de export fuera de rango DWORD.');
      if (seenNames.has(name)) {
        exportsInvalid.push({ nombre: name, ordinal, motivo: 'nombre duplicado' });
        continue;
      }
      seenNames.add(name);
      const functionRva = leerU32(buffer, functionsOffset + ordinalIndex * 4, 'Export.FunctionRVA');
      if (!functionRva) {
        exportsInvalid.push({ nombre: name, ordinal, motivo: 'RVA de función cero' });
        continue;
      }
      if (functionRva >= forwarderStart && functionRva < forwarderEnd) {
        let destino;
        try { destino = leerCadenaRva(functionRva, 'export forwarder', forwarderEnd); } catch {
          exportsInvalid.push({ nombre: name, ordinal, motivo: 'forwarder inválido' });
          continue;
        }
        const separadorDestino = destino?.lastIndexOf('.') ?? -1;
        const moduloDestino = separadorDestino > 0 ? destino.slice(0, separadorDestino) : '';
        const simboloDestino = separadorDestino > 0 ? destino.slice(separadorDestino + 1) : '';
        const destinoValido = /^[A-Za-z0-9_.-]+$/.test(moduloDestino) &&
          (/^#[0-9]+$/.test(simboloDestino) || /^[A-Za-z_?$@][A-Za-z0-9_.$@?]*$/.test(simboloDestino));
        if (!destinoValido) exportsInvalid.push({ nombre: name, ordinal, motivo: 'forwarder sin destino válido' });
        else forwardedExports.push({ nombre: name, ordinal, destino });
        continue;
      }
      try {
        rvaAOffset(functionRva, 1, `export function ${name}`);
        const codeSection = sections.find((section) => functionRva >= section.virtualAddress && functionRva < section.virtualEnd);
        if (!codeSection || !(codeSection.characteristics & 0x20000000)) {
          exportsInvalid.push({ nombre: name, ordinal, motivo: 'RVA no pertenece a una sección ejecutable' });
        } else {
          exports.push(name);
        }
      } catch {
        exportsInvalid.push({ nombre: name, ordinal, motivo: 'RVA de función no mapeable' });
      }
    }
  }

  const imports = [];
  const importDirectory = directories[1] || { rva: 0, size: 0, offset: null };
  if (importDirectory.rva) {
    if (importDirectory.size < 20 || importDirectory.size % 20 !== 0) throw new PeInspectionError('Import directory truncado o desalineado.');
    const maxDescriptors = Math.min(importDirectory.size / 20, MAX_TABLE_ENTRIES);
    let ended = false;
    for (let index = 0; index < maxDescriptors; index += 1) {
      const descriptorRva = exigirSumaU32(importDirectory.rva, index * 20, 'import descriptor RVA');
      const descriptorOffset = rvaAOffset(descriptorRva, 20, 'import descriptor');
      const fields = [0, 4, 8, 12, 16].map((delta) => leerU32(buffer, descriptorOffset + delta, 'ImportDescriptor'));
      if (fields.every((value) => value === 0)) { ended = true; break; }
      if (!fields[3] || !fields[4]) throw new PeInspectionError('ImportDescriptor sin nombre o FirstThunk.');
      const nombre = leerCadenaRva(fields[3], 'import name');
      if (!nombre) throw new PeInspectionError('Nombre de DLL importada vacío.');
      const lookupRva = fields[0] || fields[4];
      const thunkWidth = isPe32Plus ? 8 : 4;
      let thunkTerminado = false;
      let thunkIndex = 0;
      for (; thunkIndex < MAX_TABLE_ENTRIES; thunkIndex += 1) {
        const thunkRva = exigirSumaU32(lookupRva, thunkIndex * thunkWidth, 'import thunk RVA');
        const thunkOffset = rvaAOffset(thunkRva, thunkWidth, 'import thunk');
        const thunk = isPe32Plus ? buffer.readBigUInt64LE(thunkOffset) : BigInt(leerU32(buffer, thunkOffset, 'ImportThunk'));
        if (thunk === 0n) { thunkTerminado = true; break; }
        const ordinalFlag = isPe32Plus ? (1n << 63n) : (1n << 31n);
        if ((thunk & ordinalFlag) !== 0n) {
          const ordinalValue = thunk & 0xFFFFn;
          if (ordinalValue === 0n || thunk !== (ordinalFlag | ordinalValue)) throw new PeInspectionError('Import por ordinal inválido.');
        } else {
          const importByNameRva = Number(thunk & (isPe32Plus ? 0x7FFFFFFFFFFFFFFFn : 0x7FFFFFFFn));
          if (importByNameRva === 0) throw new PeInspectionError('ImportByName RVA vacío.');
          const hintOffset = rvaAOffset(importByNameRva, 2, 'import hint');
          leerCadenaRva(exigirSumaU32(importByNameRva, 2, 'import symbol RVA'), 'import symbol');
          leerU16(buffer, hintOffset, 'ImportHint');
        }
      }
      if (!thunkTerminado) throw new PeInspectionError('Tabla de import thunks sin terminador.');
      const iatOffset = rvaAOffset(fields[4], (thunkIndex + 1) * thunkWidth, 'import address table');
      const iatTerminatorOffset = iatOffset + thunkIndex * thunkWidth;
      const iatTerminator = isPe32Plus ? buffer.readBigUInt64LE(iatTerminatorOffset) : BigInt(leerU32(buffer, iatTerminatorOffset, 'IAT terminator'));
      if (iatTerminator !== 0n) throw new PeInspectionError('Import address table sin terminador válido.');
      imports.push(nombre);
    }
    if (!ended) throw new PeInspectionError('Tabla de imports PE sin terminador válido.');
  }

  let fileVersion = null;
  let versionStatus = 'ausente';
  const resourceDirectory = directories[2] || { rva: 0, size: 0, offset: null };
  if (resourceDirectory.rva || resourceDirectory.size || resourceDirectory.error) {
    try {
      const resourceStart = resourceDirectory.offset;
      const resourceEnd = resourceStart + resourceDirectory.size;
      function resourceEntries(relativeOffset) {
        const absolute = exigirSumaU32(resourceStart, relativeOffset, 'resource relative offset');
        if (absolute < resourceStart || absolute + 16 > resourceEnd) throw new PeInspectionError('Directorio de recursos fuera de sus límites.');
        const namedCount = leerU16(buffer, absolute + 12, 'Resource.NumberOfNamedEntries');
        const idCount = leerU16(buffer, absolute + 14, 'Resource.NumberOfIdEntries');
        const count = namedCount + idCount;
        if (count > MAX_TABLE_ENTRIES || absolute + 16 + count * 8 > resourceEnd) throw new PeInspectionError('Entradas de recursos truncadas.');
        const entries = Array.from({ length: count }, (_, index) => ({
          name: leerU32(buffer, absolute + 16 + index * 8, 'Resource.Name'),
          child: leerU32(buffer, absolute + 20 + index * 8, 'Resource.OffsetToData')
        }));
        for (const entry of entries.filter((item) => item.name & 0x80000000)) {
          const nameOffset = exigirSumaU32(resourceStart, entry.name & 0x7FFFFFFF, 'resource name offset');
          if (nameOffset + 2 > resourceEnd) throw new PeInspectionError('Nombre de recurso fuera del directorio.');
          const characterCount = leerU16(buffer, nameOffset, 'Resource.NameLength');
          if (nameOffset + 2 + characterCount * 2 > resourceEnd) throw new PeInspectionError('Nombre de recurso truncado.');
        }
        return entries;
      }
      const rootEntries = resourceEntries(0);
      const versionEntries = rootEntries.filter((entry) => entry.name === RESOURCE_VERSION_ID);
      if (versionEntries.length > 1) throw new PeInspectionError('Resource VERSIONINFO duplicado.');
      const versionEntry = versionEntries[0];
      if (versionEntry) {
        versionStatus = 'incompleto';
        if (!(versionEntry.child & 0x80000000)) throw new PeInspectionError('Resource VERSIONINFO no contiene un directorio de tipo.');
        const dataEntries = [];
        const visited = new Set();
        function recorrerResources(relativeOffset, depth) {
          if (depth > 3) throw new PeInspectionError('Jerarquía de recursos VERSIONINFO demasiado profunda.');
          if (visited.has(relativeOffset)) throw new PeInspectionError('Ciclo en directorio de recursos VERSIONINFO.');
          visited.add(relativeOffset);
          for (const entry of resourceEntries(relativeOffset)) {
            if (entry.child & 0x80000000) {
              if (depth >= 2) throw new PeInspectionError('Árbol VERSIONINFO tiene niveles inesperados.');
              recorrerResources(entry.child & 0x7FFFFFFF, depth + 1);
            } else {
              if (depth !== 2) throw new PeInspectionError('Data entry VERSIONINFO en nivel inesperado.');
              dataEntries.push(entry.child);
            }
          }
          visited.delete(relativeOffset);
        }
        recorrerResources(versionEntry.child & 0x7FFFFFFF, 1);
        if (dataEntries.length === 0) throw new PeInspectionError('No se encontró el data entry VERSIONINFO.');
        let falloVersion = null;
        for (const relativeOffset of dataEntries) {
          const dataOffset = exigirSumaU32(resourceStart, relativeOffset, 'VERSIONINFO data entry');
          if (dataOffset < resourceStart || dataOffset + 16 > resourceEnd) throw new PeInspectionError('Data entry VERSIONINFO fuera del directorio.');
          const dataRva = leerU32(buffer, dataOffset, 'ResourceData.RVA');
          const dataSize = leerU32(buffer, dataOffset + 4, 'ResourceData.Size');
          if (!dataRva || !dataSize) throw new PeInspectionError('Data entry VERSIONINFO vacío.');
          try {
            fileVersion = leerFileVersion(buffer, rvaAOffset(dataRva, dataSize, 'VERSIONINFO data'), dataSize);
            versionStatus = 'verificado';
            break;
          } catch (error) {
            falloVersion = error;
          }
        }
        if (fileVersion === null) throw falloVersion || new PeInspectionError('No se pudo determinar FileVersion.');
      }
    } catch {
      fileVersion = null;
      versionStatus = 'incompleto';
    }
  }

  return {
    machine,
    architecture: machine === MACHINE_X64 ? 'x64' : machine === MACHINE_X86 ? 'x86' : 'desconocida',
    exports,
    exportsInvalid,
    forwardedExports,
    imports,
    fileVersion,
    versionStatus
  };
}

module.exports = { MACHINE_X64, PeInspectionError, parsearPe };
