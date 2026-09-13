#!/usr/bin/env bash
set -euo pipefail

: "${PACKAGE_NAME:?PACKAGE_NAME is required}"
: "${WAIT_TEXT:?WAIT_TEXT is required}"
: "${SECOND_ACTION:?SECOND_ACTION is required}"
: "${OUTPUT_DIR:?OUTPUT_DIR is required}"

readonly apk_path="$GITHUB_WORKSPACE/android/app/build/outputs/apk/debug/app-debug.apk"
readonly output_dir="$GITHUB_WORKSPACE/$OUTPUT_DIR"

dump_ui() {
  adb shell uiautomator dump /sdcard/window.xml >/dev/null 2>&1 || true
  adb shell cat /sdcard/window.xml 2>/dev/null
}

wait_for_text() {
  local expected="$1"
  local attempt
  for attempt in $(seq 1 45); do
    if dump_ui | grep -Fq "$expected"; then
      return 0
    fi
    sleep 1
  done
  echo "Timed out waiting for real app UI: $expected" >&2
  dump_ui >&2 || true
  return 1
}

tap_text() {
  local expected="$1"
  dump_ui > /tmp/current-window.xml
  python3 - "$expected" <<'PY'
import re
import subprocess
import sys
import xml.etree.ElementTree as ET

expected = sys.argv[1]
root = ET.parse('/tmp/current-window.xml').getroot()
for node in root.iter('node'):
    values = (node.attrib.get('text', ''), node.attrib.get('content-desc', ''))
    if expected not in values:
        continue
    bounds = [int(value) for value in re.findall(r'\d+', node.attrib.get('bounds', ''))]
    if len(bounds) != 4:
        continue
    x = (bounds[0] + bounds[2]) // 2
    y = (bounds[1] + bounds[3]) // 2
    subprocess.run(['adb', 'shell', 'input', 'tap', str(x), str(y)], check=True)
    break
else:
    raise SystemExit(f'Could not find tappable text: {expected}')
PY
}

launch_app() {
  adb shell am force-stop "$PACKAGE_NAME"
  adb shell am start -n "$PACKAGE_NAME/.MainActivity"
  wait_for_text "$WAIT_TEXT"
}

assert_clean_foreground() {
  if ! adb shell dumpsys window windows | grep -E "mCurrentFocus|mFocusedApp" | grep -Fq "$PACKAGE_NAME"; then
    echo "Expected $PACKAGE_NAME in the foreground; refusing to capture." >&2
    return 1
  fi
  if dump_ui | grep -Eqi "isn't responding|responding|reagiert nicht|keine rückmeldung|keeps stopping|wird wiederholt beendet"; then
    echo 'A system error dialog is covering the app; refusing to capture.' >&2
    return 1
  fi
}

mkdir -p "$output_dir"
rm -f "$output_dir"/*.png
adb install -r "$apk_path"
adb shell cmd locale set-app-locales "$PACKAGE_NAME" --user 0 de-DE
launch_app
assert_clean_foreground
adb exec-out screencap -p > "$output_dir/01-current-ui.png"

case "$SECOND_ACTION" in
  tap)
    : "${SECOND_TEXT:?SECOND_TEXT is required for tap}"
    tap_text "$SECOND_TEXT"
    sleep 2
    ;;
  dark)
    adb shell cmd uimode night yes
    sleep 2
    launch_app
    ;;
  swipe)
    adb shell input swipe 540 1900 540 650 500
    sleep 2
    ;;
  *)
    echo "Unsupported SECOND_ACTION: $SECOND_ACTION" >&2
    exit 1
    ;;
esac

assert_clean_foreground
adb exec-out screencap -p > "$output_dir/02-current-ui-detail.png"

python3 - "$output_dir" <<'PY'
import hashlib
import struct
import sys
from pathlib import Path

paths = sorted(Path(sys.argv[1]).glob('*.png'))
assert len(paths) == 2, paths
digests = set()
for path in paths:
    data = path.read_bytes()
    assert data[:8] == b'\x89PNG\r\n\x1a\n', path
    width, height = struct.unpack('>II', data[16:24])
    assert (width, height) == (1080, 2400), (path, width, height)
    digests.add(hashlib.sha256(data).hexdigest())
assert len(digests) == 2, 'The two screenshots must show distinct real UI states'
PY

