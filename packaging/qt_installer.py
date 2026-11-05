#!/usr/bin/env python3
"""Package a verified runtime payload as a native Qt Installer Framework offline installer."""
from __future__ import annotations

import argparse
import datetime
import json
import os
from pathlib import Path
import platform
import re
import shutil
import subprocess
import tempfile
import xml.etree.ElementTree as ET

ASSETS = Path(__file__).resolve().parent / "assets"
PRIVATE_NAMES = {"config.toml", "credentials.json", "setup.json", "tunnel.yaml", "api-token", ".env"}
PRIVATE_PARTS = {"runtime", "data", "backups", ".git"}


def write_xml(path: Path, name: str, content: dict[str, str]) -> None:
    root = ET.Element(name)
    for k, v in content.items():
        ET.SubElement(root, k).text = v
    ET.indent(root)
    ET.ElementTree(root).write(path, encoding="utf-8", xml_declaration=True)


def check_payload(stage: Path, target: str) -> None:
    required = ("package.json", "LICENSE", "node_modules", "scripts/proxy.mjs",
                "scripts/launch.mjs", "bin/node.exe" if target == "windows" else "bin/node",
                "bin/tunnel-client.exe" if target == "windows" else "bin/tunnel-client",
                "bin/RemoteBrowserMCP-Configure.exe" if target == "windows" else "brand/remotebrowsermcp.png",
                "RemoteBrowserMCP-Maintenance.exe" if target == "windows" else "brand/remotebrowsermcp.ico",
                "bin/remotebrowsermcp.exe" if target == "windows" else "bin/remotebrowsermcp")
    for name in required:
        if not (stage / name).exists():
            raise ValueError(f"Missing packaged dependency: {name}")
    for item in stage.rglob("*"):
        if item.is_symlink():
            raise ValueError(f"Unexpected symbolic link in distributable: {item}")
        relative = item.relative_to(stage)
        if (relative.parts[0].lower() in PRIVATE_PARTS or
            (len(relative.parts) == 1 and item.name.lower() in PRIVATE_NAMES)):
            raise ValueError(f"Refusing to package runtime secrets: {item}")


def prepare(stage: Path, work: Path, version: str, target: str) -> None:
    if not re.fullmatch(r"\d+\.\d+\.\d+", version):
        raise ValueError("Invalid semantic version")
    if version != json.loads((stage / "package.json").read_text())["version"]:
        raise ValueError("Version differs from staged package.json")
    lock = json.loads((stage / "package-lock.json").read_text())
    if lock.get("version") != version or lock.get("packages", {}).get("", {}).get("version") != version:
        raise ValueError("Version differs from staged npm package-lock.json")
    bundled = json.loads((stage / "third_party" / "BUNDLED_VERSIONS.json").read_text())
    if bundled.get("app") != version or not str(bundled.get("target", "")).startswith(target + "-"):
        raise ValueError("Version differs from bundled runtime metadata")
    check_payload(stage, target)
    config = work / "config"
    meta = work / "packages" / "org.thinkerqaq.remotebrowser" / "meta"
    data = meta.parent / "data"
    config.mkdir(parents=True)
    meta.mkdir(parents=True)
    shutil.copytree(stage, data)
    installer_config = {
        "Name": "RemoteBrowserMCP",
        "Version": version,
        "Title": "RemoteBrowserMCP",
        "Publisher": "ThinkerQAQ",
        "StartMenuDir": "RemoteBrowserMCP",
        "TargetDir": "@HomeDir@/RemoteBrowserMCP",
        "RemoveTargetDir": "false",
        "MaintenanceToolName": "RemoteBrowserMCP-Uninstaller",
        "ControlScript": "controller.qs",
        "WizardStyle": "Modern",
        "WizardShowPageList": "false",
    }
    if target == "windows":
        installer_config["RunProgram"] = "@TargetDir@/bin/RemoteBrowserMCP-Configure.exe"
        installer_config["RunProgramDescription"] = "Open RemoteBrowserMCP configuration"
    write_xml(config / "config.xml", "Installer", installer_config)
    write_xml(meta / "package.xml", "Package", {
        "DisplayName": "RemoteBrowserMCP",
        "Description": "Chrome DevTools MCP with bundled Node.js and OpenAI tunnel-client",
        "Version": version,
        "ReleaseDate": datetime.date.today().isoformat(),
        "Default": "true",
        "Script": "installscript.qs",
    })
    tree = ET.parse(meta / "package.xml")
    user_interfaces = ET.SubElement(tree.getroot(), "UserInterfaces")
    if target != "windows":
        ET.SubElement(user_interfaces, "UserInterface").text = "configure.ui"
    licenses = ET.SubElement(tree.getroot(), "Licenses")
    ET.SubElement(licenses, "License", {"name": "RemoteBrowserMCP (Apache-2.0)", "file": "LICENSE.txt"})
    ET.indent(tree)
    tree.write(meta / "package.xml", encoding="utf-8", xml_declaration=True)
    if target != "windows":
        shutil.copy2(ASSETS / "configure.ui", meta / "configure.ui")
    shutil.copy2(ASSETS / "controller.qs", config / "controller.qs")
    shutil.copy2(stage / "LICENSE", meta / "LICENSE.txt")
    script = """
function Component() {
    if (installer.isInstaller() && !installer.isCommandLineInstance()) {
        installer.installationFinished.connect(this, Component.prototype.showConfigure);
        installer.finishButtonClicked.connect(this, Component.prototype.finishConfigure);
    }
}
Component.prototype.createOperations = function() {
    component.createOperations();
"""
    if target == "windows":
        script = """
function Component() {}
Component.prototype.createOperations = function() {
    component.createOperations();
"""
    if target == "windows":
        script += """
    if (!installer.isCommandLineInstance()) {
    component.addOperation("Mkdir", "@UserStartMenuProgramsPath@/RemoteBrowserMCP");
    component.addOperation("CreateShortcut",
        "@TargetDir@/bin/RemoteBrowserMCP-Configure.exe",
        "@UserStartMenuProgramsPath@/RemoteBrowserMCP/Configure Tunnel.lnk");
    component.addOperation("CreateShortcut",
        "@TargetDir@/RemoteBrowserMCP-Maintenance.exe",
        "@UserStartMenuProgramsPath@/RemoteBrowserMCP/Manage RemoteBrowserMCP.lnk");
    component.addOperation("CreateShortcut",
        "@TargetDir@/RemoteBrowserMCP-Uninstaller.exe",
        "@UserStartMenuProgramsPath@/RemoteBrowserMCP/Uninstall.lnk");
    }
"""
    elif target == "linux":
        # Avoid a dependency on desktop environment-specific menu packages.
        desktop = 'Type=Application\nName=Configure RemoteBrowserMCP\nTerminal=false\nExec="@TargetDir@/bin/remotebrowsermcp" gui\nCategories=Development;Utility;'
        script += f'    if (!installer.isCommandLineInstance()) component.addOperation("CreateDesktopEntry", "remotebrowsermcp.desktop", {json.dumps(desktop)});\n'
    else:
        script += "    // macOS uses the same Go client as the command-line interface.\n"
    if target == "windows":
        script += "};\n"
    else:
        script += """};
Component.prototype.showConfigure = function() {
    if (installer.isInstaller() && !installer.isCommandLineInstance() &&
        installer.status == QInstaller.Success)
        installer.addWizardPageItem(component, "ConfigureConnection", QInstaller.InstallationFinished);
};
Component.prototype.finishConfigure = function() {
    if (!installer.isInstaller() || installer.isCommandLineInstance() ||
        installer.status != QInstaller.Success) return;
    var form = component.userInterface("ConfigureConnection");
    if (!form || !form.configureNowCheckBox.checked) return;
    var target = installer.value("TargetDir");
"""
    if target == "darwin":
        script += """
    installer.executeDetached(target + "/bin/remotebrowsermcp", ["gui"], target);
"""
    elif target == "linux":
        script += """
    installer.executeDetached(target + "/bin/remotebrowsermcp", ["gui"], target);
"""
    if target != "windows":
        script += "};\n"
    (meta / "installscript.qs").write_text(script)


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--stage", required=True, type=Path)
    parser.add_argument("--platform", choices=("windows", "linux", "darwin"), required=True)
    parser.add_argument("--version", required=True)
    parser.add_argument("--binarycreator", default="binarycreator")
    parser.add_argument("--output", required=True, type=Path)
    parser.add_argument("--prepare-only", action="store_true")
    args = parser.parse_args()
    stage = args.stage.resolve()
    output = args.output.resolve()
    if output.exists():
        parser.error(f"Refusing to overwrite {output}")
    if not args.prepare_only:
        host = {"Windows": "windows", "Linux": "linux", "Darwin": "darwin"}[platform.system()]
        if host != args.platform:
            parser.error("Qt offline installer must be created using the matching native OS")
    output.parent.mkdir(parents=True, exist_ok=True)
    if args.prepare_only:
        prepare(stage, output, args.version, args.platform)
        return
    with tempfile.TemporaryDirectory(prefix="rb-qtifw-") as temp:
        tree = Path(temp)
        prepare(stage, tree, args.version, args.platform)
        # Compression level 1 keeps CI build times predictable for the many
        # small npm files in an otherwise fully self-contained payload.
        command = [args.binarycreator, "--offline-only", "--compression", "1"]
        if args.platform == "windows":
            if __package__:
                from .windows_gui_template import WINDOWS_GUI, gui_template, pe_subsystem
            else:
                from windows_gui_template import WINDOWS_GUI, gui_template, pe_subsystem
            creator = Path(shutil.which(args.binarycreator) or args.binarycreator).resolve()
            base = creator.with_name("installerbase.exe")
            if not base.is_file():
                raise FileNotFoundError(f"Qt IFW installerbase.exe not found next to binarycreator: {creator}")
            template = tree / "installerbase-gui.exe"
            gui_template(base, template)
            command += ["--template", str(template)]
        command += ["-c", str(tree / "config/config.xml"),
                    "-p", str(tree / "packages"), str(output)]
        subprocess.run(command, check=True)
        if args.platform == "windows" and pe_subsystem(output) != WINDOWS_GUI:
            raise ValueError("Generated Qt installer is not a Windows GUI executable")


if __name__ == "__main__":
    main()
