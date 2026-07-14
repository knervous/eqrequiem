#!/usr/bin/env python3
"""Summarize a Spector.js JSON capture without dumping shader/texture blobs.

Usage:
  python3 scripts/analyze_spector_capture.py "capture 00_37_00.json"
"""

from __future__ import annotations

import argparse
import json
import re
from collections import Counter, defaultdict
from pathlib import Path
from typing import Any


DRAW_NAMES = {"drawArrays", "drawElements", "drawArraysInstanced", "drawElementsInstanced"}
STATE_NAMES = {
    "activeTexture",
    "bindFramebuffer",
    "bindTexture",
    "bindVertexArray",
    "blendFunc",
    "blendFuncSeparate",
    "clear",
    "depthFunc",
    "depthMask",
    "disable",
    "enable",
    "useProgram",
    "viewport",
}


def short(value: Any, limit: int = 120) -> str:
    text = str(value)
    return text if len(text) <= limit else text[: limit - 1] + "..."


def parse_program_text(text: str) -> str | None:
    match = re.search(r"WebGLProgram - ID: (\d+)", text)
    return match.group(1) if match else None


def parse_texture_text(text: str) -> tuple[str | None, str | None]:
    match = re.search(r"bindTexture: ([^,]+), (.+)", text)
    if not match:
        return None, None
    target = match.group(1)
    raw = match.group(2)
    if raw == "null":
        return target, None
    tex = re.search(r"WebGLTexture - ID: (\d+)", raw)
    return target, tex.group(1) if tex else raw


def parse_active_texture(text: str) -> str | None:
    match = re.search(r"activeTexture: (TEXTURE\d+)", text)
    return match.group(1) if match else None


def parse_draw(text: str) -> dict[str, Any]:
    result: dict[str, Any] = {"text": text}
    shader_match = re.search(r"vertex:([^ ]+)fragment:([^ ]+)$", text)
    if shader_match:
        result["vertex"] = shader_match.group(1)
        result["fragment"] = shader_match.group(2)
    inst_match = re.search(r",\s*([0-9]+)(?:vertex:)?$", text)
    if inst_match:
        result["instances"] = int(inst_match.group(1))
    count_match = re.search(r":\s*([^,]+),\s*([0-9]+)\s+indices", text)
    if count_match:
        result["mode"] = count_match.group(1)
        result["indices"] = int(count_match.group(2))
    return result


def get_stack_summary(command: dict[str, Any], max_frames: int = 5) -> list[str]:
    frames = command.get("stackTrace") or []
    out: list[str] = []
    for frame in frames[:max_frames]:
        if isinstance(frame, str):
            out.append(frame)
        elif isinstance(frame, dict):
            fn = frame.get("functionName") or frame.get("name") or ""
            url = frame.get("url") or frame.get("fileName") or ""
            line = frame.get("lineNumber") or frame.get("line") or ""
            col = frame.get("columnNumber") or frame.get("column") or ""
            out.append(f"{fn} {url}:{line}:{col}".strip())
    return out


def extract_program_names(command: dict[str, Any]) -> list[str]:
    names: list[str] = []
    for arg in command.get("commandArguments") or []:
        custom = arg.get("__SPECTOR_Object_CustomData") if isinstance(arg, dict) else None
        if not custom:
            continue
        for shader in custom.get("shaders") or []:
            name = shader.get("name")
            if name:
                names.append(name)
    return names


def summarize(capture_path: Path) -> dict[str, Any]:
    data = json.loads(capture_path.read_text())
    commands = data.get("commands") or []

    active_texture = "TEXTURE0"
    texture_units: dict[str, dict[str, str | None]] = defaultdict(dict)
    current_program: str | None = None
    program_names: dict[str, list[str]] = {}
    current_vao: str | None = None
    depth_test = None
    blend = None
    depth_mask = None

    draws: list[dict[str, Any]] = []
    clears: list[dict[str, Any]] = []
    texture_uploads: list[dict[str, Any]] = []
    state_timeline: list[dict[str, Any]] = []
    counts = Counter(c.get("name") for c in commands)

    for command in commands:
        name = command.get("name")
        text = command.get("text", "")
        cid = command.get("id")

        if name == "activeTexture":
            active_texture = parse_active_texture(text) or active_texture
        elif name == "bindTexture":
            target, tex = parse_texture_text(text)
            if target:
                texture_units[active_texture][target] = tex
        elif name == "useProgram":
            current_program = parse_program_text(text)
            if current_program:
                names = extract_program_names(command)
                if names:
                    program_names[current_program] = names
        elif name == "bindVertexArray":
            match = re.search(r"WebGLVertexArrayObject - ID: (\d+)", text)
            current_vao = match.group(1) if match else None
        elif name == "enable":
            if "DEPTH_TEST" in text:
                depth_test = True
            elif "BLEND" in text:
                blend = True
        elif name == "disable":
            if "DEPTH_TEST" in text:
                depth_test = False
            elif "BLEND" in text:
                blend = False
        elif name == "depthMask":
            depth_mask = "true" in text
        elif name == "clear":
            clears.append({"id": cid, "text": text, "afterDraws": len(draws)})
        elif name == "texImage2D":
            texture_uploads.append({"id": cid, "activeTexture": active_texture, "text": text})

        if name in STATE_NAMES:
            state_timeline.append({"id": cid, "name": name, "text": text})

        if name in DRAW_NAMES:
            draw = parse_draw(text)
            depth_state = command.get("DepthState") or {}
            blend_state = command.get("BlendState") or {}
            cull_state = command.get("CullState") or {}
            draw.update(
                {
                    "id": cid,
                    "name": name,
                    "program": current_program,
                    "programShaders": program_names.get(current_program or "", []),
                    "vao": current_vao,
                    "depthTest": depth_state.get("DEPTH_TEST", depth_test),
                    "depthMask": depth_state.get("DEPTH_WRITEMASK", depth_mask),
                    "depthFunc": depth_state.get("DEPTH_FUNC"),
                    "blend": blend_state.get("BLEND", blend),
                    "blendSrcRgb": blend_state.get("BLEND_SRC_RGB"),
                    "blendDstRgb": blend_state.get("BLEND_DST_RGB"),
                    "cullFace": cull_state.get("CULL_FACE"),
                    "textures": {unit: dict(targets) for unit, targets in sorted(texture_units.items())},
                    "stack": get_stack_summary(command),
                }
            )
            draws.append(draw)

    programs_seen = {
        pid: names
        for pid, names in sorted(program_names.items(), key=lambda item: int(item[0]))
    }

    return {
        "file": str(capture_path),
        "canvas": data.get("canvas"),
        "commandCount": len(commands),
        "commandCounts": dict(counts.most_common()),
        "programs": programs_seen,
        "clears": clears,
        "textureUploads": texture_uploads,
        "draws": draws,
        "stateTimeline": state_timeline,
        "endState": data.get("endState"),
    }


def print_report(summary: dict[str, Any]) -> None:
    print(f"Capture: {summary['file']}")
    canvas = summary.get("canvas") or {}
    print(
        f"Canvas: {canvas.get('width')}x{canvas.get('height')} "
        f"(client {canvas.get('clientWidth')}x{canvas.get('clientHeight')})"
    )
    print(f"Commands: {summary['commandCount']}")

    print("\nPrograms:")
    for pid, shaders in summary["programs"].items():
        print(f"  Program {pid}: {', '.join(shaders)}")

    print("\nClears:")
    for clear in summary["clears"]:
        print(f"  #{clear['id']} afterDraws={clear['afterDraws']} {clear['text']}")

    print("\nDraws:")
    for i, draw in enumerate(summary["draws"], 1):
        shaders = ", ".join(draw.get("programShaders") or [])
        texture_bits = []
        for unit, targets in draw["textures"].items():
            bound = ",".join(f"{target}={tex}" for target, tex in targets.items() if tex)
            if bound:
                texture_bits.append(f"{unit}[{bound}]")
        print(
            f"  {i}. #{draw['id']} {draw['name']} program={draw.get('program')} "
            f"vao={draw.get('vao')} indices={draw.get('indices')} instances={draw.get('instances')} "
            f"depthTest={draw.get('depthTest')} depthMask={draw.get('depthMask')} "
            f"depthFunc={draw.get('depthFunc')} blend={draw.get('blend')} "
            f"blend={draw.get('blendSrcRgb')}/{draw.get('blendDstRgb')} cull={draw.get('cullFace')}"
        )
        print(f"     shaders: {shaders or draw.get('text')}")
        print(f"     textures: {'; '.join(texture_bits) or '(none tracked)'}")
        if draw.get("stack"):
            print(f"     stack: {draw['stack'][0]}")

    print("\nTexture uploads near frame:")
    for upload in summary["textureUploads"][:12]:
        print(f"  #{upload['id']} {upload['activeTexture']} {upload['text']}")
    if len(summary["textureUploads"]) > 12:
        print(f"  ... {len(summary['textureUploads']) - 12} more")


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("capture", type=Path)
    parser.add_argument("--json", action="store_true", help="emit compact JSON summary")
    args = parser.parse_args()
    summary = summarize(args.capture)
    if args.json:
        print(json.dumps(summary, indent=2))
    else:
        print_report(summary)


if __name__ == "__main__":
    main()
