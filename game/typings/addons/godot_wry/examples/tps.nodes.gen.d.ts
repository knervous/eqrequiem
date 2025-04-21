declare module "godot" {
    interface SceneNodes {
        "addons/godot_wry/examples/tps.tscn": {
            WorldEnvironment: WorldEnvironment<{}>,
            DirectionalLight3D: DirectionalLight3D<{}>,
            CharacterBody3D: CharacterBody3D<
                {
                    MeshInstance3D: MeshInstance3D<{}>,
                    CollisionShape3D: CollisionShape3D<{}>,
                    Camera3D: Camera3D<{}>,
                }
            >,
            MeshInstance3D: MeshInstance3D<
                {
                    StaticBody3D: StaticBody3D<
                        {
                            CollisionShape3D: CollisionShape3D<{}>,
                        }
                    >,
                }
            >,
            WebView: WebView<{}>,
        },
    }
}
