from __future__ import annotations

import base64
import io
import shutil
import tarfile
from pathlib import Path

root = Path.cwd().resolve()
chunk_dir = root / "tools" / "bootstrap"
encoded = "".join(path.read_text().strip() for path in sorted(chunk_dir.glob("chunk*")))
archive = base64.b64decode(encoded)

with tarfile.open(fileobj=io.BytesIO(archive), mode="r:gz") as tar:
    for member in tar.getmembers():
        destination = (root / member.name).resolve()
        if root not in destination.parents and destination != root:
            raise RuntimeError(f"Unsafe archive path: {member.name}")
    tar.extractall(root)

shutil.rmtree(root / "deploy", ignore_errors=True)
shutil.rmtree(chunk_dir, ignore_errors=True)
(root / "tools" / "phase3-bootstrap.py").unlink(missing_ok=True)
(root / ".github" / "workflows" / "phase3-bootstrap.yml").unlink(missing_ok=True)
try:
    (root / "tools").rmdir()
except OSError:
    pass

print("Phase 3 files extracted.")
