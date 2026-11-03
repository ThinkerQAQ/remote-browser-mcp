#!/usr/bin/env python3
"""Prepare a Windows GUI-subsystem Qt IFW template, without mutating the SDK.

Qt's upstream installerbase may be built as a CONSOLE executable. The GUI
installer itself works, but Explorer allocates an unwanted terminal window.
Qt IFW's documented binarycreator -t/--template flag accepts a custom
installerbase and also ensures the resulting maintenance executable uses it.
Only the unsigned PE subsystem flag is changed, before adding IFW archives
and before code signing.
"""
from __future__ import annotations

import struct
from pathlib import Path

WINDOWS_GUI = 2
WINDOWS_CUI = 3


def _header(data: bytes | bytearray) -> tuple[int, int, int]:
    if len(data) < 0x80 or data[:2] != b'MZ':
        raise ValueError('Not an MZ executable')
    pe_offset = struct.unpack_from('<I', data, 0x3c)[0]
    if pe_offset > len(data) - 160 or data[pe_offset:pe_offset + 4] != b'PE\x00\x00':
        raise ValueError('Not a PE executable')
    optional = pe_offset + 24
    magic = struct.unpack_from('<H', data, optional)[0]
    if magic not in (0x10b, 0x20b):
        raise ValueError('Not a supported PE32 / PE32+ executable')
    size = struct.unpack_from('<H', data, pe_offset + 20)[0]
    if size < 120 or optional + size > len(data):
        raise ValueError('Invalid PE optional header')
    security_directory = optional + (112 if magic == 0x20b else 96) + 8 * 4
    if security_directory + 8 > optional + size:
        raise ValueError('Missing Authenticode security-directory field')
    return optional, optional + 68, security_directory


def pe_subsystem(path: Path) -> int:
    with path.open('rb') as f:
        head = f.read(2048)
    _, position, _ = _header(head)
    return struct.unpack_from('<H', head, position)[0]


def gui_template(source: Path, target: Path) -> None:
    source = source.resolve()
    target = target.resolve()
    if source == target:
        raise ValueError('Refusing to overwrite the Qt SDK installerbase')
    if target.exists():
        raise FileExistsError(f'Refusing to replace an existing GUI template: {target}')
    data = bytearray(source.read_bytes())
    optional, position, security_dir = _header(data)
    certificate_offset, certificate_size = struct.unpack_from('<II', data, security_dir)
    if certificate_offset or certificate_size:
        raise ValueError('The original Qt installerbase is signed; cannot alter its PE header')
    subsystem = struct.unpack_from('<H', data, position)[0]
    if subsystem not in (WINDOWS_GUI, WINDOWS_CUI):
        raise ValueError(f'Unexpected Windows subsystem {subsystem}')
    struct.pack_into('<H', data, position, WINDOWS_GUI)
    # CheckSum is optional for ordinary PE application binaries. IFW's bundled
    # installerbase leaves it zero; preserve that convention rather than
    # calculating a checksum of an unsigned binary that IFW will append to.
    struct.pack_into('<I', data, optional + 64, 0)
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_bytes(data)
    if pe_subsystem(target) != WINDOWS_GUI:
        raise AssertionError('Qt GUI template has the wrong PE subsystem')
