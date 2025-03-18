declare module "godot" {
    interface SceneNodes {
        "zone.tscn": {
            Camera3D: Camera3D<{}>,
            WorldEnvironment2: WorldEnvironment<
                {
                    Sun3: DirectionalLight3D<{}>,
                    ReflectionProbe: ReflectionProbe<{}>,
                }
            >,
            DebugUI: Node2D<
                {
                    ZoneEntry: TextEdit<
                        {
                            "@HScrollBar@33828": HScrollBar<{}>,
                            "@VScrollBar@33829": VScrollBar<{}>,
                            "@Timer@33830": Timer<{}>,
                            "@Timer@33831": Timer<{}>,
                            "@Timer@33832": Timer<{}>,
                        }
                    >,
                    ZoneButton: Button<{}>,
                    FPS: Label<{}>,
                }
            >,
            Node3D: Node3D<
                {
                    sky1: Node3D<
                        {
                            Mesh: MeshInstance3D<{}>,
                            Mesh2: MeshInstance3D<{}>,
                        }
                    >,
                }
            >,
        },
    }
}
