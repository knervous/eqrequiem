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


def arguments():
    parser = argparse.ArgumentParser()
    parser.add_argument("--scene", required=True)
    parser.add_argument("--metadata", required=True)
    parser.add_argument("--output", required=True)
    parser.add_argument("--ao-rays", type=int, default=8)
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

    to_sun = Vector((0.36, 0.82, 0.44)).normalized()
    sun_facing = max(0.0, normal.dot(to_sun))
    if sun_facing > 0.01 and unobstructed(bvh, origin, to_sun, 1500.0):
        color += Vector((0.58, 0.52, 0.42)) * sun_facing

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
    for strength, direction, distance, light in contributions[:4]:
        if not unobstructed(bvh, origin, direction, max(0.0, distance - 0.12)):
            continue
        light_color = Vector((light["r"], light["g"], light["b"]))
        color += light_color * (strength * 2.6)

    return [min(1.0, max(0.1, component)) for component in color] + [1.0]


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
    lights = metadata.get("lights", [])
    bvh = build_bvh(objects)
    samples = hemisphere_samples(options.ao_rays)
    light_cells, light_cell_size = spatial_lights(lights)
    baked = {}
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
    document = {
        "schema": "eltania.zone-vertex-lighting",
        "version": 1,
        "scene": os.path.basename(options.scene),
        "meshCount": len(baked),
        "lightCount": len(lights),
        "aoRays": options.ao_rays,
        "minimumRgb": minimum,
        "maximumRgb": maximum,
        "meshes": baked,
    }
    with open(options.output, "w", encoding="utf-8") as output:
        json.dump(document, output, separators=(",", ":"))
    print("REQ_LIGHT_COMPLETE", len(baked), minimum, maximum, flush=True)


if __name__ == "__main__":
    main(arguments())
