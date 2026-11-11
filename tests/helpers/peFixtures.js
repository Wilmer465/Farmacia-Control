'use strict';

function alinear4(value) {
  return (value + 3) & ~3;
}

function bloqueVersion(key, type, value = Buffer.alloc(0), children = []) {
  const keyBytes = Buffer.from(`${key}\0`, 'utf16le');
  const valueStart = alinear4(6 + keyBytes.length);
  const valuePadding = Buffer.alloc(valueStart - 6 - keyBytes.length);
  const childrenStart = alinear4(valueStart + value.length);
  const valueTail = Buffer.alloc(childrenStart - valueStart - value.length);
  const childBytes = Buffer.concat(children);
  const length = 6 + keyBytes.length + valuePadding.length + value.length + valueTail.length + childBytes.length;
  const header = Buffer.alloc(6);
  header.writeUInt16LE(length, 0);
  header.writeUInt16LE(type === 1 ? value.length / 2 : value.length, 2);
  header.writeUInt16LE(type, 4);
  return Buffer.concat([header, keyBytes, valuePadding, value, valueTail, childBytes]);
}

function crearVersionInfo(fileVersion) {
  const fixed = Buffer.alloc(52);
  fixed.writeUInt32LE(0xFEEF04BD, 0);
  const fileVersionParts = String(fileVersion || '0.0.0.0').split('.').map((part) => Number(part) || 0);
  fixed.writeUInt32LE(((fileVersionParts[0] || 0) << 16) | (fileVersionParts[1] || 0), 8);
  fixed.writeUInt32LE(((fileVersionParts[2] || 0) << 16) | (fileVersionParts[3] || 0), 12);
  const strings = fileVersion === null ? [] : [
    bloqueVersion('FileVersion', 1, Buffer.from(`${fileVersion}\0`, 'utf16le'))
  ];
  const stringTable = bloqueVersion('040904B0', 1, Buffer.alloc(0), strings);
  const stringFileInfo = bloqueVersion('StringFileInfo', 1, Buffer.alloc(0), [stringTable]);
  const translation = Buffer.alloc(4);
  translation.writeUInt16LE(0x0409, 0);
  translation.writeUInt16LE(0x04B0, 2);
  const varInfo = bloqueVersion('VarFileInfo', 1, Buffer.alloc(0), [bloqueVersion('Translation', 0, translation)]);
  return bloqueVersion('VS_VERSION_INFO', 0, fixed, [stringFileInfo, varInfo]);
}

function crearPeFixture({ machine = 0x8664, exports = [], imports = [], fileVersion = null } = {}) {
  const file = Buffer.alloc(0x2200);
  const peOffset = 0x80;
  const optionalOffset = peOffset + 24;
  const sectionTableOffset = optionalOffset + 0xF0;
  file.write('MZ', 0, 'ascii');
  file.writeUInt32LE(peOffset, 0x3C);
  file.write('PE\0\0', peOffset, 'binary');
  file.writeUInt16LE(machine, peOffset + 4);
  file.writeUInt16LE(1, peOffset + 6);
  file.writeUInt16LE(0xF0, peOffset + 20);
  file.writeUInt16LE(0x2022, peOffset + 22);
  const isPe32 = machine === 0x14C;
  const directoryBaseRelative = isPe32 ? 96 : 112;
  file.writeUInt16LE(isPe32 ? 0x10B : 0x20B, optionalOffset);
  file.writeUInt32LE(0x1000, optionalOffset + 32);
  file.writeUInt32LE(0x200, optionalOffset + 36);
  file.writeUInt32LE(0x3000, optionalOffset + 56);
  file.writeUInt32LE(0x200, optionalOffset + 60);
  file.writeUInt32LE(16, optionalOffset + (isPe32 ? 92 : 108));
  const sectionName = Buffer.from('.rdata\0\0', 'ascii');
  sectionName.copy(file, sectionTableOffset);
  file.writeUInt32LE(0x2000, sectionTableOffset + 8);
  file.writeUInt32LE(0x1000, sectionTableOffset + 12);
  file.writeUInt32LE(0x2000, sectionTableOffset + 16);
  file.writeUInt32LE(0x200, sectionTableOffset + 20);
  file.writeUInt32LE(0x60000020, sectionTableOffset + 36);

  function offsetRva(rva) { return 0x200 + (rva - 0x1000); }
  function writeCString(rva, value) {
    const bytes = Buffer.from(`${value}\0`, 'ascii');
    bytes.copy(file, offsetRva(rva));
    return bytes.length;
  }

  if (exports.length) {
    const directory = 0x1000;
    const functionsRva = 0x1040;
    const namesRva = functionsRva + exports.length * 4;
    const ordinalsRva = namesRva + exports.length * 4;
    let stringsRva = Math.max(ordinalsRva + exports.length * 2, 0x1600);
    file.writeUInt32LE(1, offsetRva(directory) + 16);
    file.writeUInt32LE(exports.length, offsetRva(directory) + 20);
    file.writeUInt32LE(exports.length, offsetRva(directory) + 24);
    file.writeUInt32LE(functionsRva, offsetRva(directory) + 28);
    file.writeUInt32LE(namesRva, offsetRva(directory) + 32);
    file.writeUInt32LE(ordinalsRva, offsetRva(directory) + 36);
    for (let index = 0; index < exports.length; index += 1) {
      const nameLength = writeCString(stringsRva, exports[index]);
      file.writeUInt32LE(0x1F00 + index * 4, offsetRva(functionsRva + index * 4));
      file.writeUInt32LE(stringsRva, offsetRva(namesRva + index * 4));
      file.writeUInt16LE(index, offsetRva(ordinalsRva + index * 2));
      stringsRva += nameLength;
    }
    file.writeUInt32LE(directory, optionalOffset + directoryBaseRelative);
    file.writeUInt32LE(stringsRva - directory, optionalOffset + directoryBaseRelative + 4);
  }

  if (imports.length) {
    const directory = 0x1100;
    let nameRva = 0x1B00;
    imports.forEach((name, index) => {
      const descriptor = offsetRva(directory + index * 20);
      const thunkRva = 0x1180 + index * 0x20;
      const importNameRva = 0x1C00 + index * 0x40;
      file.writeUInt32LE(thunkRva, descriptor);
      file.writeUInt32LE(nameRva, descriptor + 12);
      file.writeUInt32LE(thunkRva + 8, descriptor + 16);
      file.writeUInt32LE(importNameRva, offsetRva(thunkRva));
      file.writeUInt32LE(0, offsetRva(thunkRva) + 4);
      file.writeUInt16LE(0, offsetRva(importNameRva));
      Buffer.from(`FixtureImport${index}\0`, 'ascii').copy(file, offsetRva(importNameRva) + 2);
      nameRva += writeCString(nameRva, name);
    });
    const descriptorCount = imports.length + 1;
    file.writeUInt32LE(directory, optionalOffset + directoryBaseRelative + 8);
    file.writeUInt32LE(descriptorCount * 20, optionalOffset + directoryBaseRelative + 12);
  }

  if (fileVersion !== undefined) {
    const resourceRva = 0x1200;
    const resourceOffset = offsetRva(resourceRva);
    const escribirDirectorio = (offset, id, childOffset, isDirectory) => {
      file.writeUInt16LE(1, resourceOffset + offset + 14);
      file.writeUInt32LE(id, resourceOffset + offset + 16);
      const child = isDirectory ? (0x80000000 | childOffset) >>> 0 : childOffset;
      file.writeUInt32LE(child, resourceOffset + offset + 20);
    };
    escribirDirectorio(0, 16, 0x20, true);
    escribirDirectorio(0x20, 1, 0x40, true);
    escribirDirectorio(0x40, 0x0409, 0x80, false);
    const versionBytes = crearVersionInfo(fileVersion);
    const dataEntry = resourceOffset + 0x80;
    file.writeUInt32LE(0x1300, dataEntry);
    file.writeUInt32LE(versionBytes.length, dataEntry + 4);
    file.writeUInt32LE(1200, dataEntry + 8);
    versionBytes.copy(file, offsetRva(0x1300));
    file.writeUInt32LE(resourceRva, optionalOffset + directoryBaseRelative + 16);
    file.writeUInt32LE(0x80 + versionBytes.length, optionalOffset + directoryBaseRelative + 20);
  }

  return file;
}

module.exports = { crearPeFixture };
