import getpass
import json
import os
import re
import secrets
import shutil
import socket
import subprocess
import sys
import time
from pathlib import Path


ROOT = Path(__file__).resolve().parent
FRONTEND = ROOT / "frontend"
SERVICES = [
    ("Product Service", 8001, "product_service.main:app"),
    ("Order Service", 8002, "order_service.main:app"),
    ("Category Service", 8003, "category_service.main:app"),
    ("User Service", 8004, "user_service.main:app"),
    ("Integration Service", 8000, "integration_service.main:app"),
]


def get_python_executable():
    virtualenv_python = ROOT / ".venv" / "Scripts" / "python.exe"
    return str(virtualenv_python) if virtualenv_python.exists() else sys.executable


def check_prerequisites():
    if not (FRONTEND / "node_modules" / "vite" / "bin" / "vite.js").exists():
        raise RuntimeError(
            "Frontend dependencies are missing. Run "
            "'npm.cmd install --prefix frontend' once, then run 'python run.py'."
        )

    if not (ROOT / ".env").exists():
        print("Warning: .env was not found; services will use their default database settings.")


def check_ports(ports):
    occupied = []
    for port in ports:
        with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as probe:
            try:
                probe.bind(("127.0.0.1", port))
            except OSError:
                occupied.append(port)

    if occupied:
        port_list = ", ".join(str(port) for port in occupied)
        raise RuntimeError(
            f"Port(s) already in use: {port_list}. Stop the existing processes "
            "before starting the project."
        )


def ensure_auth_configuration():
    env_path = ROOT / ".env"
    values = {}
    if env_path.exists():
        for line in env_path.read_text(encoding="utf-8").splitlines():
            stripped = line.strip()
            if not stripped or stripped.startswith("#") or "=" not in stripped:
                continue
            key, value = stripped.split("=", 1)
            value = value.strip()
            if value.startswith('"') and value.endswith('"'):
                value = json.loads(value)
            elif value.startswith("'") and value.endswith("'"):
                value = value[1:-1]
            values[key.strip()] = value

    def save_value(key, value):
        lines = env_path.read_text(encoding="utf-8").splitlines() if env_path.exists() else []
        replacement = f"{key}={json_quote(value)}"
        for index, line in enumerate(lines):
            if line.strip().startswith(f"{key}="):
                lines[index] = replacement
                break
        else:
            lines.append(replacement)
        env_path.write_text("\n".join(lines) + "\n", encoding="utf-8")
        values[key] = value

    jwt_secret = os.getenv("JWT_SECRET_KEY") or values.get("JWT_SECRET_KEY")
    if not jwt_secret:
        jwt_secret = secrets.token_urlsafe(48)
        save_value("JWT_SECRET_KEY", jwt_secret)
        print("Generated and saved JWT signing key in .env.")
    os.environ["JWT_SECRET_KEY"] = jwt_secret

    username = (
        os.getenv("BOOTSTRAP_ADMIN_USERNAME")
        or values.get("BOOTSTRAP_ADMIN_USERNAME")
        or ""
    ).strip().lower()
    if not username:
        username = input("Create initial admin username: ").strip().lower()
        if not re.fullmatch(r"[a-z0-9_.-]{3,50}", username):
            raise RuntimeError("Admin username must be 3-50 letters, digits, ., _ or -")
        save_value("BOOTSTRAP_ADMIN_USERNAME", username)
    os.environ["BOOTSTRAP_ADMIN_USERNAME"] = username

    password = (
        os.getenv("BOOTSTRAP_ADMIN_PASSWORD")
        or values.get("BOOTSTRAP_ADMIN_PASSWORD")
        or ""
    )
    if not password:
        password = getpass.getpass("Create initial admin password (8-128 characters): ")
        confirmation = getpass.getpass("Confirm admin password: ")
        if password != confirmation:
            raise RuntimeError("Admin passwords do not match")
        if not 8 <= len(password) <= 128:
            raise RuntimeError("Admin password must be 8-128 characters")
        save_value("BOOTSTRAP_ADMIN_PASSWORD", password)
    if not 8 <= len(password) <= 128:
        raise RuntimeError("BOOTSTRAP_ADMIN_PASSWORD must be 8-128 characters")
    os.environ["BOOTSTRAP_ADMIN_PASSWORD"] = password


def json_quote(value):
    return json.dumps(value)


def stop_processes(processes):
    for name, process in reversed(processes):
        if process.poll() is None:
            print(f"Stopping {name}...")
            process.terminate()

    for name, process in reversed(processes):
        if process.poll() is None:
            try:
                process.wait(timeout=5)
            except subprocess.TimeoutExpired:
                print(f"{name} did not stop in time; terminating it.")
                process.kill()
                process.wait()


def main():
    check_prerequisites()
    ports = [port for _, port, _ in SERVICES] + [5174]
    check_ports(ports)
    ensure_auth_configuration()

    frontend_node = shutil.which("node")
    if frontend_node is None:
        raise RuntimeError("Node.js was not found. Install Node.js and try again.")

    vite_script = FRONTEND / "node_modules" / "vite" / "bin" / "vite.js"
    python = get_python_executable()
    commands = [
        (
            name,
            port,
            [
                python,
                "-m",
                "uvicorn",
                app,
                "--host",
                "127.0.0.1",
                "--port",
                str(port),
            ],
            ROOT,
        )
        for name, port, app in SERVICES
    ]
    commands.append(
        (
            "Frontend",
            5174,
            [
                frontend_node,
                str(vite_script),
                "--host",
                "127.0.0.1",
                "--port",
                "5174",
                "--strictPort",
            ],
            FRONTEND,
        )
    )

    processes = []
    try:
        for name, port, command, working_directory in commands:
            process = subprocess.Popen(command, cwd=working_directory)
            processes.append((name, process))
            print(f"Started {name} on http://127.0.0.1:{port}")
            sys.stdout.flush()

        print("\nProject is running. Open http://127.0.0.1:5174")
        print("Press Ctrl+C to stop all services.\n")

        while True:
            for name, process in processes:
                exit_code = process.poll()
                if exit_code is not None:
                    raise RuntimeError(
                        f"{name} stopped unexpectedly (exit code {exit_code})."
                    )
            time.sleep(0.5)
    except KeyboardInterrupt:
        print("\nShutting down the project...")
    except OSError as exc:
        raise RuntimeError(f"Could not start a project process: {exc}") from exc
    finally:
        stop_processes(processes)


if __name__ == "__main__":
    try:
        main()
    except RuntimeError as exc:
        print(f"Cannot start project: {exc}", file=sys.stderr)
        sys.exit(1)
