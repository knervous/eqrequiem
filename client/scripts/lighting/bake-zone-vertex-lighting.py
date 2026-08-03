import argparse
import gzip
import json
import math
import os
import sys
import tempfile

import bpy
from mathutils import Vector
from mathutils.bvhtree import BVHTree

LOCAL_LIGHT_BAKE_MULTIPLIER = 2.0


def arguments():
    parser = argparse.ArgumentParser()
    parser.add_argument("--scene", required=True)
    parser.add_argument("--metadata", required=True)
    parser.add_argument("--authoring")
    parser.add_argument("--output", required=True)
    parser.add_argument("--ao-rays", type=int, default=8)
    parser.add_argument("--audit-only", action="store_true")
    separator = sys.argv.index("--") if "--" in sys.argv else len(sys.argv)
    return parser.parse_args(sys.argv[separator + 1 :])


def read_scene(path):
    if path.endswith(".gz"):
        with gzip.open(path, "rb") as source:
            payload = source.read()
        unpacked = os.path.join(tempfile.gettempdir(), "requiem-lighting-source.glb")
        with open(unpacked, "wb") as output:
            output.write(payload)
        return unpacked
    return path


def clear_scene():
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.object.delete(use_global=False)
    # MCP bakes start from the open authoring file rather than Blender's empty
    # startup scene. Remove the now-unlinked mesh datablocks as well so glTF
    # mesh identities are imported verbatim instead of receiving `.001`
    # suffixes from the authoring datablocks we just unlinked.
    for mesh in list(bpy.data.meshes):
        if mesh.users == 0:
            bpy.data.meshes.remove(mesh)


def build_bvh(objects):
    vertices = []
    polygons = []
    for obj in objects:
        if obj.name == "CLOUD_MDF":
            continue
        matrix = obj.matrix_world
        base = len(vertices)
        vertices.extend(matrix @ vertex.co for vertex in obj.data.vertices)
        for polygon in obj.data.polygons:
            if len(polygon.vertices) == 3:
                polygons.append(tuple(base + index for index in polygon.vertices))
            else:
                first = base + polygon.vertices[0]
                for index in range(1, len(polygon.vertices) - 1):
                    polygons.append(
                        (
                            first,
                            base + polygon.vertices[index],
                            base + polygon.vertices[index + 1],
                        )
                    )
    return BVHTree.FromPolygons(vertices, polygons, all_triangles=True)


def hemisphere_samples(count):
    samples = []
    golden = math.pi * (3.0 - math.sqrt(5.0))
    for index in range(count):
        z = (index + 0.5) / count
        radius = math.sqrt(max(0.0, 1.0 - z * z))
        angle = index * golden
        samples.append(Vector((math.cos(angle) * radius, math.sin(angle) * radius, z)))
    return samples


def basis_direction(sample, normal):
    helper = Vector((0.0, 0.0, 1.0))
    if abs(normal.dot(helper)) > 0.9:
        helper = Vector((0.0, 1.0, 0.0))
    tangent = normal.cross(helper).normalized()
    bitangent = tangent.cross(normal).normalized()
    return (tangent * sample.x + bitangent * sample.y + normal * sample.z).normalized()


def spatial_lights(lights, cell_size=40.0):
    cells = {}
    for light in lights:
        key = (
            math.floor(light["x"] / cell_size),
            math.floor(light["y"] / cell_size),
            math.floor(light["z"] / cell_size),
        )
        cells.setdefault(key, []).append(light)
    return cells, cell_size


def babylon_to_blender(position):
    """Canonical package/metadata Y-up coordinates -> Blender Z-up."""
    return Vector((float(position["x"]), -float(position["z"]), float(position["y"])))


def authored_object_placements(authoring):
    """Return exact enabled authoring stamp IDs and Babylon-space pivots."""
    placements = []
    for stamp in authoring.get("objects", {}).get("stamps", []):
        if stamp.get("enabled", True) is False:
            continue
        position = stamp.get("position")
        if not isinstance(position, list) or len(position) != 3 or not stamp.get("id"):
            raise RuntimeError(f"Invalid authoring object stamp {stamp!r}")
        scale_value = stamp.get("scale", [1.0, 1.0, 1.0])
        if isinstance(scale_value, list):
            scale = max(abs(float(value)) for value in scale_value)
        else:
            scale = abs(float(scale_value))
        placements.append((stamp["id"], {
            "x": position[0], "y": position[1], "z": position[2], "scale": scale,
        }))
    return placements


def normalized_lights(lights):
    result = []
    for source in lights:
        position = babylon_to_blender(source)
        light = dict(source)
        light["x"], light["y"], light["z"] = position
        result.append(light)
    return result


def percentile(values, fraction):
    if not values:
        return None
    ordered = sorted(values)
    index = min(len(ordered) - 1, max(0, round((len(ordered) - 1) * fraction)))
    return ordered[index]


def light_alignment_summary(bvh, source_lights, mirror_x=False):
    distances = []
    within_radius = 0
    for source in source_lights:
        position = babylon_to_blender(source)
        if mirror_x:
            position.x = -position.x
        nearest = bvh.find_nearest(position)
        if nearest is None or nearest[3] is None:
            continue
        distance = float(nearest[3])
        distances.append(distance)
        if distance < max(1.0, float(source.get("radius", 30.0))):
            within_radius += 1
    return {
        "sampleCount": len(distances),
        "minimumSurfaceDistance": min(distances) if distances else None,
        "medianSurfaceDistance": percentile(distances, 0.5),
        "p90SurfaceDistance": percentile(distances, 0.9),
        "withinAuthoredRadius": within_radius,
    }


def nearby_lights(cells, cell_size, position):
    center = (
        math.floor(position.x / cell_size),
        math.floor(position.y / cell_size),
        math.floor(position.z / cell_size),
    )
    result = []
    for x in range(center[0] - 1, center[0] + 2):
        for y in range(center[1] - 1, center[1] + 2):
            for z in range(center[2] - 1, center[2] + 2):
                result.extend(cells.get((x, y, z), ()))
    return result


def unobstructed(bvh, origin, direction, distance):
    hit = bvh.ray_cast(origin, direction, distance)
    return hit[0] is None


def bake_vertex(
    bvh,
    position,
    normal,
    samples,
    light_cells,
    light_cell_size,
    local_light_stats=None,
):
    origin = position + normal * 0.06
    visible = 0.0
    weight = 0.0
    for sample in samples:
        direction = basis_direction(sample, normal)
        sample_weight = max(0.05, direction.dot(normal))
        weight += sample_weight
        if unobstructed(bvh, origin, direction, 35.0):
            visible += sample_weight
    ao = visible / weight if weight else 1.0
    # Preserve readable fill while allowing enclosed and contact regions to
    # become visibly darker.
    ambient_strength = 0.2 + 0.34 * ao
    color = Vector(
        (
            ambient_strength * 0.92,
            ambient_strength * 0.96,
            ambient_strength,
        )
    )

    contributions = []
    for light in nearby_lights(light_cells, light_cell_size, position):
        light_position = Vector((light["x"], light["y"], light["z"]))
        direction = light_position - position
        distance = direction.length
        radius = max(1.0, float(light.get("radius", 30.0)))
        if distance <= 0.001 or distance >= radius:
            continue
        direction /= distance
        facing = max(0.0, normal.dot(direction))
        if facing <= 0.01:
            continue
        attenuation = (1.0 - distance / radius) ** 2
        strength = attenuation * facing
        contributions.append((strength, direction, distance, light))
    contributions.sort(key=lambda item: item[0], reverse=True)
    local_energy = 0.0
    visible_local_lights = 0
    for strength, direction, distance, light in contributions[:4]:
        if not unobstructed(bvh, origin, direction, max(0.0, distance - 0.12)):
            continue
        light_color = Vector((light["r"], light["g"], light["b"]))
        contribution = light_color * (
            strength * 2.6 * LOCAL_LIGHT_BAKE_MULTIPLIER
        )
        color += contribution
        local_energy += max(contribution)
        visible_local_lights += 1

    if local_light_stats is not None:
        local_light_stats["sampleCount"] += 1
        local_light_stats["sumContribution"] += local_energy
        local_light_stats["maximumContribution"] = max(
            local_light_stats["maximumContribution"], local_energy
        )
        if visible_local_lights:
            local_light_stats["litSampleCount"] += 1

    return [min(1.0, max(0.1, component)) for component in color] + [1.0]


def local_light_stats():
    return {
        "sampleCount": 0,
        "litSampleCount": 0,
        "sumContribution": 0.0,
        "maximumContribution": 0.0,
    }


def finalized_local_light_stats(stats):
    samples = stats["sampleCount"]
    lit_samples = stats["litSampleCount"]
    return {
        "sampleCount": samples,
        "litSampleCount": lit_samples,
        "litFraction": lit_samples / samples if samples else 0.0,
        "meanContribution": stats["sumContribution"] / samples if samples else 0.0,
        "maximumContribution": stats["maximumContribution"],
    }


def main(options):
    clear_scene()
    bpy.ops.import_scene.gltf(filepath=read_scene(options.scene))
    objects = [
        obj
        for obj in bpy.context.scene.objects
        if obj.type == "MESH" and len(obj.data.vertices) > 0
    ]
    with open(options.metadata, "r", encoding="utf-8") as source:
        metadata = json.load(source)
    authoring = None
    if options.authoring:
        with open(options.authoring, "r", encoding="utf-8") as source:
            authoring = json.load(source)
    source_lights = metadata.get("lights", [])
    lights = normalized_lights(source_lights)
    bvh = build_bvh(objects)
    coordinate_audit = {
        "mapping": "babylon-y-up_to_blender-z-up:x,-z,y",
        "canonical": light_alignment_summary(bvh, source_lights),
        "mirroredX": light_alignment_summary(bvh, source_lights, mirror_x=True),
    }
    print("REQ_LIGHT_COORDINATE_AUDIT", json.dumps(coordinate_audit), flush=True)
    if options.audit_only:
        return
    samples = hemisphere_samples(options.ao_rays)
    light_cells, light_cell_size = spatial_lights(lights)
    baked = {}
    mesh_local_light_stats = local_light_stats()
    object_local_light_stats = local_light_stats()
    minimum = [1.0, 1.0, 1.0]
    maximum = [0.0, 0.0, 0.0]
    for object_index, obj in enumerate(objects):
        if obj.name == "CLOUD_MDF":
            colors = [1.0, 1.0, 1.0, 1.0] * len(obj.data.vertices)
        else:
            matrix = obj.matrix_world
            normal_matrix = matrix.to_3x3().inverted().transposed()
            colors = []
            for vertex in obj.data.vertices:
                position = matrix @ vertex.co
                normal = (normal_matrix @ vertex.normal).normalized()
                color = bake_vertex(
                    bvh,
                    position,
                    normal,
                    samples,
                    light_cells,
                    light_cell_size,
                    mesh_local_light_stats,
                )
                colors.extend(color)
                for axis in range(3):
                    minimum[axis] = min(minimum[axis], color[axis])
                    maximum[axis] = max(maximum[axis], color[axis])
        baked[obj.data.name] = colors
        if object_index % 12 == 0:
            print(
                "REQ_LIGHT_PROGRESS",
                object_index,
                len(objects),
                obj.data.name,
                flush=True,
            )
    object_irradiance = {}
    if authoring is not None:
        object_placements = authored_object_placements(authoring)
    else:
        object_placements = [
            (f"{model}-{legacy_index}", transform)
            for model, transforms in metadata.get("objects", {}).items()
            for legacy_index, transform in enumerate(transforms)
        ]
    for stamp_id, transform in object_placements:
        position = babylon_to_blender(transform)
        scale = max(0.01, abs(float(transform.get("scale", 1.0))))
        # Sample above the authored pivot to avoid treating a ground-level
        # placement as being inside its supporting surface.
        position += Vector((0.0, 0.0, max(0.5, scale)))
        object_irradiance[stamp_id] = bake_vertex(
            bvh,
            position,
            Vector((0.0, 0.0, 1.0)),
            samples,
            light_cells,
            light_cell_size,
            object_local_light_stats,
        )
    document = {
        "schema": "eltania.zone-vertex-lighting",
        "version": 2,
        "scene": os.path.basename(options.scene),
        "meshCount": len(baked),
        "lightCount": len(source_lights),
        "localLightMultiplier": LOCAL_LIGHT_BAKE_MULTIPLIER,
        "bakedComponents": ["ambient-occlusion", "metadata-local-lights"],
        "excludedDynamicComponents": ["sun", "sky", "player-light"],
        "objectCount": len(object_irradiance),
        "aoRays": options.ao_rays,
        "minimumRgb": minimum,
        "maximumRgb": maximum,
        "coordinateAudit": coordinate_audit,
        "localLightDiagnostics": {
            "meshes": finalized_local_light_stats(mesh_local_light_stats),
            "objects": finalized_local_light_stats(object_local_light_stats),
        },
        "meshes": baked,
        "objects": object_irradiance,
    }
    with open(options.output, "w", encoding="utf-8") as output:
        json.dump(document, output, separators=(",", ":"))
    print("REQ_LIGHT_COMPLETE", len(baked), minimum, maximum, flush=True)


if __name__ == "__main__":
    main(arguments())
