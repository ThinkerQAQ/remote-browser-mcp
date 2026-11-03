"""PE subsystem regression checks: GUI installer must not allocate a console."""
import struct
import tempfile
from pathlib import Path
import unittest

from packaging.windows_gui_template import WINDOWS_GUI, WINDOWS_CUI, gui_template, pe_subsystem


def fake_pe(subsystem=WINDOWS_CUI, certificate=False):
    data = bytearray(1024)
    data[:2] = b'MZ'
    struct.pack_into('<I', data, 0x3c, 128)
    data[128:132] = b'PE\x00\x00'
    struct.pack_into('<H', data, 128 + 20, 240)  # optional header size
    opt = 128 + 24
    struct.pack_into('<H', data, opt, 0x20b)  # PE32+
    struct.pack_into('<H', data, opt + 68, subsystem)
    if certificate:
        struct.pack_into('<II', data, opt + 112 + 4 * 8, 512, 40)
    return data


class WindowsGuiTemplateTests(unittest.TestCase):
    def test_subsystem_patched_without_modifying_source(self):
        with tempfile.TemporaryDirectory() as d:
            source = Path(d) / 'installerbase.exe'
            target = Path(d) / 'installerbase-gui.exe'
            source.write_bytes(fake_pe())
            gui_template(source, target)
            self.assertEqual(pe_subsystem(source), WINDOWS_CUI)
            self.assertEqual(pe_subsystem(target), WINDOWS_GUI)
            self.assertEqual(source.read_bytes()[:128 + 24 + 68], target.read_bytes()[:128 + 24 + 68])

    def test_does_not_touch_signed_pe(self):
        with tempfile.TemporaryDirectory() as d:
            source = Path(d) / 'installerbase.exe'
            target = Path(d) / 'patched.exe'
            source.write_bytes(fake_pe(certificate=True))
            with self.assertRaisesRegex(ValueError, 'signed'):
                gui_template(source, target)
            self.assertFalse(target.exists())

    def test_rejects_invalid_and_no_overwrite(self):
        with tempfile.TemporaryDirectory() as d:
            source = Path(d) / 'base.exe'
            target = Path(d) / 'gui.exe'
            source.write_bytes(b'not a PE')
            with self.assertRaisesRegex(ValueError, 'Not an MZ'):
                gui_template(source, target)
            source.write_bytes(fake_pe())
            gui_template(source, target)
            with self.assertRaises(FileExistsError):
                gui_template(source, target)


if __name__ == '__main__':
    unittest.main()
