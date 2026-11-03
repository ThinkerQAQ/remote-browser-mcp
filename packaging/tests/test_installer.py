"""Offline installer metadata, target platform and private-data acceptance tests."""
import json
import tempfile
from pathlib import Path
import unittest

from packaging.qt_installer import prepare, check_payload


class InstallerTests(unittest.TestCase):
    def fake_stage(self, root, platform):
        stage = root / "stage"
        (stage / "scripts").mkdir(parents=True)
        (stage / "node_modules" / "lib" / "data").mkdir(parents=True)
        (stage / "bin").mkdir()
        (stage / "package.json").write_text(json.dumps({"version": "0.4.0"}))
        (stage / "LICENSE").write_text("test license")
        (stage / "scripts/proxy.mjs").write_text("// stub")
        (stage / "scripts/launch.mjs").write_text("// stub")
        (stage / "node_modules/lib/data/fixture.json").write_text("{}")
        (stage / "bin" / ("node.exe" if platform == "windows" else "node")).write_text("node")
        (stage / "bin" / ("tunnel-client.exe" if platform == "windows" else "tunnel-client")).write_text("client")
        if platform == "windows":
            (stage / "bin/RemoteBrowserMCP-Configure.exe").write_text("stub")
            (stage / "RemoteBrowserMCP-Maintenance.exe").write_text("stub")
        (stage / "brand").mkdir()
        (stage / "brand/remotebrowsermcp.ico").write_text("stub")
        (stage / "brand/remotebrowsermcp.png").write_text("stub")
        (stage / "bin" / ("remotebrowsermcp.exe" if platform == "windows" else "remotebrowsermcp")).write_text("client")
        return stage

    def test_qt_tree_all_platforms(self):
        for platform in ("windows", "linux", "darwin"):
            with self.subTest(platform=platform), tempfile.TemporaryDirectory() as d:
                root = Path(d)
                stage = self.fake_stage(root, platform)
                dest = root / "out"
                prepare(stage, dest, "0.4.0", platform)
                self.assertTrue((dest / "config/config.xml").is_file())
                config_page = dest / "packages/org.thinkerqaq.remotebrowser/meta/configure.ui"
                self.assertEqual(config_page.is_file(), platform != "windows")
                script = (dest / "packages/org.thinkerqaq.remotebrowser/meta/installscript.qs").read_text()
                if platform != "windows":
                    self.assertIn("finishConfigure", script)
                else:
                    self.assertNotIn("finishConfigure", script)
                    self.assertIn("function Component() {}", script)
                    self.assertIn("RemoteBrowserMCP-Configure.exe", script)
                self.assertNotIn("Runtime API key", script)
                self.assertTrue((dest / "packages/org.thinkerqaq.remotebrowser/data/node_modules/lib/data/fixture.json").exists())

    def test_windows_config_shortcut_uses_native_gui(self):
        with tempfile.TemporaryDirectory() as d:
            root = Path(d)
            stage = self.fake_stage(root, "windows")
            dest = root / "out"
            prepare(stage, dest, "0.4.0", "windows")
            script = (dest / "packages/org.thinkerqaq.remotebrowser/meta/installscript.qs").read_text()
            self.assertIn("RemoteBrowserMCP-Configure.exe", script)
            self.assertIn("RemoteBrowserMCP-Maintenance.exe", script)
            self.assertNotIn("powershell.exe", script)

    def test_single_component_and_install_name(self):
        import xml.etree.ElementTree as ET
        with tempfile.TemporaryDirectory() as d:
            root = Path(d)
            stage = self.fake_stage(root, "windows")
            dest = root / "out"
            prepare(stage, dest, "0.4.0", "windows")
            xml = ET.parse(dest / "config/config.xml")
            self.assertEqual(xml.findtext("./Name"), "RemoteBrowserMCP")
            self.assertEqual(xml.findtext("./TargetDir"), "@HomeDir@/RemoteBrowserMCP")
            self.assertEqual(xml.findtext("./StartMenuDir"), "RemoteBrowserMCP")
            self.assertEqual(xml.findtext("./ControlScript"), "controller.qs")
            controller = (dest / "config/controller.qs").read_text()
            self.assertIn("QInstaller.ComponentSelection, false", controller)
            self.assertIn("QInstaller.StartMenuSelection, false", controller)
            package_script = (dest / "packages/org.thinkerqaq.remotebrowser/meta/installscript.qs").read_text()
            self.assertIn("RemoteBrowserMCP-Uninstaller.exe", package_script)

    def test_windows_maintenance_entrypoint_manages_both_actions(self):
        import xml.etree.ElementTree as ET
        with tempfile.TemporaryDirectory() as d:
            root = Path(d)
            stage = self.fake_stage(root, "windows")
            dest = root / "out"
            prepare(stage, dest, "0.4.0", "windows")
            xml = ET.parse(dest / "config/config.xml")
            self.assertEqual(xml.findtext("./MaintenanceToolName"), "RemoteBrowserMCP-Uninstaller")
            self.assertIsNone(xml.findtext("./InstallerApplicationIcon"))
            self.assertIsNone(xml.findtext("./InstallerWindowIcon"))
            script = (dest / "packages/org.thinkerqaq.remotebrowser/meta/installscript.qs").read_text()
            self.assertIn("RemoteBrowserMCP-Maintenance.exe", script)
            self.assertIn("RemoteBrowserMCP-Uninstaller.exe", script)
            self.assertIn("RemoteBrowserMCP-Configure.exe", script)

    def test_configuration_links_only_in_app_not_installer_completion(self):
        import xml.etree.ElementTree as ET
        with tempfile.TemporaryDirectory() as d:
            root = Path(d)
            for platform in ("windows", "linux", "darwin"):
                stage = self.fake_stage(root / platform, platform)
                dest = root / (platform + "-out")
                prepare(stage, dest, "0.4.0", platform)
                config = ET.parse(dest / "config/config.xml")
                if platform == "windows":
                    self.assertEqual(config.findtext("./RunProgram"), "@TargetDir@/bin/RemoteBrowserMCP-Configure.exe")
                    self.assertEqual(config.findtext("./RunProgramDescription"), "Open RemoteBrowserMCP configuration")
                else:
                    text = (dest / "packages/org.thinkerqaq.remotebrowser/meta/configure.ui").read_text()
                    self.assertIn("Installation complete.", text)
                    self.assertNotIn("platform.openai.com", text)
        ui = (Path(__file__).resolve().parents[2] / "client/ui/index.html").read_text()
        self.assertIn("https://platform.openai.com/settings/organization/tunnels", ui)
        self.assertIn("https://platform.openai.com/settings/organization/api-keys", ui)
        self.assertIn("https://chatgpt.com/plugins", ui)

    def test_remotebrowsermcp_icon_is_embedded_in_assets(self):
        from struct import unpack_from
        icon = Path(__file__).resolve().parents[1] / "assets" / "remotebrowsermcp.ico"
        png = icon.with_suffix(".png")
        content = icon.read_bytes()
        self.assertEqual(unpack_from("<HHH", content, 0), (0, 1, 5))
        self.assertEqual(
            [unpack_from("<B", content, 6 + n * 16)[0] for n in range(5)],
            [16, 24, 32, 48, 64],
        )
        self.assertTrue(png.read_bytes().startswith(bytes.fromhex("89504e470d0a1a0a")))
        gui = (Path(__file__).resolve().parents[1] / "assets" / "RemoteBrowserMCP-Launcher.cs").read_text()
        self.assertIn("Modify Tunnel Configuration", gui)
        self.assertIn("RemoteBrowserMCP-Uninstaller.exe", gui)
        self.assertIn("DialogResult.Yes", gui)
        self.assertNotIn("RB_RUNTIME_API_KEY", gui)

    def test_unified_go_client_has_gui_and_headless_cli(self):
        client = (Path(__file__).resolve().parents[2] / "client/main.go").read_text()
        html = (Path(__file__).resolve().parents[2] / "client/ui/index.html").read_text()
        launcher = (Path(__file__).resolve().parents[1] / "assets/RemoteBrowserMCP-Configure.cs").read_text()
        for action in ('case "configure":', 'case "status":', 'case "start", "stop":', 'case "gui":'):
            self.assertIn(action, client)
        for control in ('Tunnel ID', 'Runtime API Key', 'Save', 'Start Service', 'Refresh Status'):
            self.assertIn(control, html)
        self.assertIn('type="password"', html)
        self.assertIn('remotebrowsermcp.exe', launcher)
        self.assertNotIn('powershell.exe', launcher)

    def test_refuse_runtime_data(self):
        with tempfile.TemporaryDirectory() as d:
            root = Path(d)
            stage = self.fake_stage(root, "windows")
            (stage / "runtime").mkdir()
            (stage / "runtime/credentials.json").write_text("private")
            with self.assertRaisesRegex(ValueError, "runtime secrets"):
                check_payload(stage, "windows")

    def test_refuse_wrong_version(self):
        with tempfile.TemporaryDirectory() as d:
            root = Path(d)
            stage = self.fake_stage(root, "windows")
            with self.assertRaisesRegex(ValueError, "Version differs"):
                prepare(stage, root / "out", "0.3.1", "windows")


if __name__ == "__main__":
    unittest.main()
