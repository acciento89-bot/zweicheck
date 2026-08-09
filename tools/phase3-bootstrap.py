from __future__ import annotations

import base64
import hashlib
import io
import shutil
import tarfile
from pathlib import Path

root = Path.cwd().resolve()
chunk_dir = root / "tools" / "bootstrap"
workflow_dir = root / ".github" / "workflows"
workflow_files = {
    path.relative_to(workflow_dir): path.read_bytes()
    for path in workflow_dir.rglob("*")
    if path.is_file()
}

chunk_names = [*(f"chunk{index:02d}" for index in range(7)), "chunk07a", "chunk07b"]
encoded = "".join((chunk_dir / name).read_text().strip() for name in chunk_names)

if len(encoded) != 39552:
    raise RuntimeError(f"Unexpected encoded length: {len(encoded)}")
if hashlib.sha256(encoded.encode()).hexdigest() != "f561be8bef5c5faa63344c6c0a7ea59ecbf6a2218db14624362656688a95b9eb":
    raise RuntimeError("Phase 3 archive checksum mismatch")

archive = base64.b64decode(encoded, validate=True)
if hashlib.sha256(archive).hexdigest() != "65419058af83dfdbf23e15a49f2ccdcc8aa8dd15e2f4e5f288eeec723325251e":
    raise RuntimeError("Decoded Phase 3 archive checksum mismatch")

with tarfile.open(fileobj=io.BytesIO(archive), mode="r:gz") as tar:
    for member in tar.getmembers():
        destination = (root / member.name).resolve()
        if root not in destination.parents and destination != root:
            raise RuntimeError(f"Unsafe archive path: {member.name}")
    tar.extractall(root)

# GitHub Actions darf mit dem Laufzeit-Token keine Workflow-Dateien ändern.
# Deshalb bleiben die vorhandenen Workflows in diesem Commit unverändert.
shutil.rmtree(workflow_dir, ignore_errors=True)
for relative_path, data in workflow_files.items():
    destination = workflow_dir / relative_path
    destination.parent.mkdir(parents=True, exist_ok=True)
    destination.write_bytes(data)

shutil.rmtree(root / "deploy", ignore_errors=True)
shutil.rmtree(chunk_dir, ignore_errors=True)
(root / "tools" / "phase3-bootstrap.py").unlink(missing_ok=True)
try:
    (root / "tools").rmdir()
except OSError:
    pass

print("Phase 3 files extracted.")
