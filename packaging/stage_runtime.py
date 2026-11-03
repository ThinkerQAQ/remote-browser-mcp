#!/usr/bin/env python3
"""Stage a self-contained per-platform runtime from verified upstream releases.

Run on the target OS *after* npm ci so native node_modules match the platform.
No user configuration, runtime data or credentials may enter the package.
"""
from __future__ import annotations

import argparse
import hashlib
import io
import json
import os
from pathlib import Path
import re
import shutil
import subprocess
import tarfile
import tempfile
import urllib.request
import zipfile

ROOT = Path(__file__).resolve().parent.parent
NODE_VERSION = "v24.21.0"
TUNNEL_VERSION = "v0.0.19"
PLATFORMS = {"windows": "win", "linux": "linux", "darwin": "darwin"}
ARCHES = {"amd64": "x64", "arm64": "arm64"}
PRIVATE_NAMES = {"config.toml", "credentials.json", "setup.json", "tunnel.yaml", ".env", "api-token"}
PRIVATE_PARTS = {"runtime", "data", "backups", ".git"}


def fetch(url: str) -> bytes:
    with urllib.request.urlopen(urllib.request.Request(url, headers={"User-Agent": "RemoteBrowserMCP-release-builder"}), timeout=120) as response:
        return response.read()


def verified_download(base: str, filename: str, sums: str) -> bytes:
    manifest = fetch(base + "/" + sums).decode("utf-8")
    matches = [line.split() for line in manifest.splitlines() if line.strip() and
               len(line.split()) >= 2 and line.split()[1].lstrip("*") == filename]
    if len(matches) != 1 or not re.fullmatch(r"[a-fA-F0-9]{64}", matches[0][0]):
        raise ValueError(f"Upstream release lacks an unambiguous SHA256 for {filename}")
    data = fetch(base + "/" + filename)
    if hashlib.sha256(data).hexdigest().lower() != matches[0][0].lower():
        raise ValueError(f"Upstream SHA256 mismatch: {filename}")
    return data


def file_from_archive(data: bytes, filename: str, predicate) -> bytes:
    if filename.endswith(".zip"):
        with zipfile.ZipFile(io.BytesIO(data)) as archive:
            names = [name for name in archive.namelist() if predicate(name) and not name.endswith("/")]
            if len(names) != 1:
                raise ValueError(f"Expected one archive member; found {names}")
            return archive.read(names[0])
    with tarfile.open(fileobj=io.BytesIO(data), mode="r:gz") as archive:
        members = [member for member in archive.getmembers()
                   if member.isfile() and predicate(member.name)]
        if len(members) != 1:
            raise ValueError(f"Expected one tar member; found {[m.name for m in members]}")
        return archive.extractfile(members[0]).read()


def check_tree(source: Path) -> None:
    if not (source / "scripts/proxy.mjs").is_file() or not (source / "node_modules").is_dir():
        raise ValueError("npm ci must be completed on the target OS before staging")
    if (source / "config.toml").exists() or (source / "runtime").exists():
        raise ValueError("Staging from a workspace containing private runtime configuration is prohibited")
    for base in ("scripts", "node_modules"):
        for file in (source / base).rglob("*"):
            if file.is_symlink() and base != "node_modules":
                raise ValueError(f"Unexpected symlink: {file}")


def copy_app(source: Path, target: Path) -> None:
    for name in ("package.json", "package-lock.json", "config.example.toml",
                 "LICENSE", "THIRD_PARTY_NOTICES.md"):
        shutil.copy2(source / name, target / name)
    shutil.copytree(source / "scripts", target / "scripts")
    # The npm-generated .bin launchers are unnecessary at runtime, and can be
    # platform-dependent symlinks. All actual runtime packages are retained.
    shutil.copytree(source / "node_modules", target / "node_modules",
                    ignore=shutil.ignore_patterns(".bin"))
    brand = target / "brand"
    brand.mkdir()
    shutil.copy2(ROOT / "packaging/assets/remotebrowsermcp.ico", brand / "remotebrowsermcp.ico")
    shutil.copy2(ROOT / "packaging/assets/remotebrowsermcp.png", brand / "remotebrowsermcp.png")


def build_windows_launchers(target: Path) -> None:
    """Build icon-branded GUI entrypoints using the Windows .NET Framework C# compiler."""
    import os
    win_dir = Path(os.environ.get("SystemRoot", r"C:\Windows"))
    csc = win_dir / "Microsoft.NET/Framework64/v4.0.30319/csc.exe"
    if not csc.is_file():
        raise FileNotFoundError(f"Windows .NET Framework C# compiler required for GUI launcher: {csc}")
    icon = target / "brand/remotebrowsermcp.ico"
    # These icon-branded native windows are launchers only; the Go client owns
    # all configuration, GUI, CLI, and service-management behavior.
    for name, switch in (("RemoteBrowserMCP-Configure", "CONFIGURE"), ("RemoteBrowserMCP-Maintenance", "MAINTENANCE")):
        source = ROOT / "packaging/assets" / (
            "RemoteBrowserMCP-Configure.cs" if switch == "CONFIGURE" else "RemoteBrowserMCP-Launcher.cs")
        output = target / (name + ".exe") if switch == "MAINTENANCE" else target / "bin" / (name + ".exe")
        subprocess.run([
            str(csc), "/nologo", "/target:winexe", f"/define:{switch}",
            "/reference:System.Windows.Forms.dll", "/reference:System.Drawing.dll",
            f"/win32icon:{icon}", f"/out:{output}", str(source)
        ], check=True)


def build_client(stage: Path, platform: str, arch: str) -> None:
    """Compile a single Go client source for GUI and headless CLI entrypoints."""
    env = dict(os.environ)
    env.update(GOOS=platform, GOARCH=arch, CGO_ENABLED="0")
    executable = ".exe" if platform == "windows" else ""
    target = stage / "bin" / ("remotebrowsermcp" + executable)
    subprocess.run(["go", "build", "-trimpath", "-o", str(target), "."],
                   check=True, cwd=ROOT / "client", env=env)
    target.chmod(0o755)
    # Compiled Go dependencies must carry their redistribution licenses.
    for module, filename in (("golang.org/x/term", "Go-term-LICENSE.txt"),
                             ("golang.org/x/sys", "Go-sys-LICENSE.txt"),
                             ("github.com/kardianos/service", "Go-service-LICENSE.txt"),
                             ("github.com/pelletier/go-toml/v2", "Go-toml-LICENSE.txt")):
        metadata = json.loads(subprocess.check_output(
            ["go", "list", "-m", "-json", module], cwd=ROOT / "client", env=env, text=True))
        license_file = Path(metadata["Dir"]) / "LICENSE"
        if not license_file.is_file():
            raise FileNotFoundError(f"Missing Go module license: {module}")
        # Go module cache files are read-only on Windows. Avoid propagating that
        # attribute into cross-volume staging and installer payloads.
        shutil.copyfile(license_file, stage / "third_party" / filename)

def build(platform: str, arch: str, dest: Path, source: Path = ROOT) -> None:
    if dest.exists():
        raise FileExistsError(f"Refusing to overwrite an existing staging directory: {dest}")
    check_tree(source)
    version = json.loads((source / "package.json").read_text())["version"]
    node_arch = ARCHES[arch]
    node_suffix = "zip" if platform == "windows" else "tar.gz"
    node_filename = f"node-{NODE_VERSION}-{PLATFORMS[platform]}-{node_arch}.{node_suffix}"
    node_base = f"https://nodejs.org/dist/{NODE_VERSION}"
    tunnel_filename = f"tunnel-client-{TUNNEL_VERSION}-{platform}-{arch}.zip"
    tunnel_license = f"tunnel-client-{TUNNEL_VERSION}-{platform}-{arch}-licenses.txt"
    tunnel_base = f"https://github.com/openai/tunnel-client/releases/download/{TUNNEL_VERSION}"
    # Keep staging on the destination filesystem, including GitHub Windows
    # runners where TEMP is on C: and the checkout lives on D:.
    dest.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory(prefix="remote-browser-stage-", dir=dest.parent) as temporary:
        stage = Path(temporary) / "payload"
        stage.mkdir()
        (stage / "bin").mkdir()
        (stage / "third_party").mkdir()
        copy_app(source, stage)
        build_client(stage, platform, arch)
        if platform == "windows":
            build_windows_launchers(stage)
        node_archive = verified_download(node_base, node_filename, "SHASUMS256.txt")
        node_member = (lambda name: name.endswith("/node.exe")) if platform == "windows" else (lambda name: name.endswith("/bin/node"))
        node_path = stage / "bin" / ("node.exe" if platform == "windows" else "node")
        node_path.write_bytes(file_from_archive(node_archive, node_filename, node_member))
        node_path.chmod(0o755)
        (stage / "third_party" / "Node-LICENSE.txt").write_bytes(
            file_from_archive(node_archive, node_filename, lambda name: name.endswith("/LICENSE") and name.count("/") == 1))
        tunnel_archive = verified_download(tunnel_base, tunnel_filename, "SHA256SUMS.txt")
        with zipfile.ZipFile(io.BytesIO(tunnel_archive)) as archive:
            for binary in (("tunnel-client.exe", "cloudflared.exe") if platform == "windows"
                           else ("tunnel-client", "cloudflared")):
                names = [name for name in archive.namelist()
                         if name.split("/")[-1] == binary and not name.endswith("/")]
                if binary.startswith("tunnel-client") and len(names) != 1:
                    raise ValueError(f"Missing or ambiguous tunnel executable: {names}")
                if len(names) == 1:
                    target = stage / "bin" / binary
                    target.write_bytes(archive.read(names[0]))
                    target.chmod(0o755)
        (stage / "third_party" / "Tunnel-LICENSES.txt").write_bytes(
            verified_download(tunnel_base, tunnel_license, "SHA256SUMS.txt"))
        (stage / "third_party" / "BUNDLED_VERSIONS.json").write_text(
            json.dumps({"app": version, "node": NODE_VERSION, "tunnel_client": TUNNEL_VERSION,
                        "target": f"{platform}-{arch}", "node_archive_sha256": hashlib.sha256(node_archive).hexdigest(),
                        "tunnel_archive_sha256": hashlib.sha256(tunnel_archive).hexdigest()}, indent=2) + "\n")
        for item in stage.rglob("*"):
            relative = item.relative_to(stage)
            # Allow legitimate dependency-internal data directories.
            if (relative.parts[0].lower() in PRIVATE_PARTS or
                (len(relative.parts) == 1 and item.name.lower() in PRIVATE_NAMES)):
                raise ValueError(f"Private user data must not be staged: {item}")
        dest.parent.mkdir(parents=True, exist_ok=True)
        shutil.move(str(stage), str(dest))


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--platform", choices=PLATFORMS, required=True)
    parser.add_argument("--arch", choices=ARCHES, required=True)
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    build(args.platform, args.arch, args.output.resolve())
