declare module "godot" {
    interface SceneNodes {
        "addons/sky_3d/assets/resources/MoonRender.tscn": {
            MoonTransform: Node3D<
                {
                    Camera3D: Camera3D<
                        {
                            Mesh: MeshInstance3D<{}>,
                        }
                    >,
                }
            >,
        },
    }
}
