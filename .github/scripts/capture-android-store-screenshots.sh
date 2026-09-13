#!/usr/bin/env bash
set -euo pipefail

: "${PACKAGE_NAME:?PACKAGE_NAME is required}"
: "${SECOND_ACTION:?SECOND_ACTION is required}"
: "${OUTPUT_DIR:?OUTPUT_DIR is required}"

readonly apk_path="$GITHUB_WORKSPACE/android/app/build/outputs/apk/debug/app-debug.apk"
readonly output_dir="$GITHUB_WORKSPACE/$OUTPUT_DIR"
readonly ui_dump="/sdcard/zweicheck-window.xml"

current_focus() {
  local dump
  local line
  dump="$(adb shell dumpsys window windows)"
  while IFS= read -r line; do
    if [[ "$line" == *"mCurrentFocus="* ]]; then
      printf '%s\n' "$line"
      return 0
    fi
  done <<< "$dump"
  return 0
}

wait_for_foreground() {
  local attempt
  local focus
  for attempt in $(seq 1 45); do
    focus="$(current_focus)"
    if [[ "$focus" == *"$PACKAGE_NAME"* ]]; then
      return 0
    fi
    sleep 1
  done
  echo "Timed out waiting for $PACKAGE_NAME to become the foreground app." >&2
  current_focus >&2
  return 1
}

dump_ui() {
  adb shell uiautomator dump "$ui_dump" >/dev/null
  adb shell cat "$ui_dump"
}

wait_for_text() {
  local expected="$1"
  local attempt
  local ui
  [[ -z "$expected" ]] && return 0
  for attempt in $(seq 1 45); do
    ui="$(dump_ui || true)"
    if [[ "$ui" == *"$expected"* ]]; then
      return 0
    fi
    sleep 1
  done
  echo "Timed out waiting for visible UI text: $expected" >&2
  dump_ui >&2 || true
  return 1
}

tap_text() {
  local expected="$1"
  local local_dump="$RUNNER_TEMP/zweicheck-window.xml"
  local coordinates
  adb shell uiautomator dump "$ui_dump" >/dev/null
  adb pull "$ui_dump" "$local_dump" >/dev/null
  coordinates="$(python3 - "$local_dump" "$expected" <<'PY'
import re
import sys
import xml.etree.ElementTree as ET

root = ET.parse(sys.argv[1]).getroot()
expected = sys.argv[2]
for node in root.iter("node"):
    if node.attrib.get("text") == expected or node.attrib.get("content-desc") == expected:
        match = re.fullmatch(r"\[(\d+),(\d+)\]\[(\d+),(\d+)\]", node.attrib.get("bounds", ""))
        if match:
            left, top, right, bottom = map(int, match.groups())
            print((left + right) // 2, (top + bottom) // 2)
            raise SystemExit(0)
raise SystemExit(f"Could not find tappable UI text: {expected}")
PY
)"
  read -r tap_x tap_y <<< "$coordinates"
  adb shell input tap "$tap_x" "$tap_y"
}

launch_app() {
  adb shell am force-stop "$PACKAGE_NAME"
  adb shell am start -W -n "$PACKAGE_NAME/.MainActivity"
  wait_for_foreground
  wait_for_text "${WAIT_TEXT:-}"
}

assert_clean_foreground() {
  local focus
  focus="$(current_focus)"
  if [[ "$focus" != *"$PACKAGE_NAME"* ]]; then
    echo "Expected $PACKAGE_NAME in mCurrentFocus; refusing to capture." >&2
    printf '%s\n' "$focus" >&2
    return 1
  fi
}

mkdir -p "$output_dir"
rm -f "$output_dir"/*.png
adb install -r "$apk_path"
adb shell settings put global hide_error_dialogs 1
adb shell cmd locale set-app-locales "$PACKAGE_NAME" --user 0 de-DE
launch_app
assert_clean_foreground
adb exec-out screencap -p > "$output_dir/01-current-ui.png"

case "$SECOND_ACTION" in
  tap)
    if [[ -n "${SECOND_TEXT:-}" ]]; then
      wait_for_text "$SECOND_TEXT"
      tap_text "$SECOND_TEXT"
    else
      adb shell input tap 540 2150
    fi
    sleep 3
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
