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
                            "@HScrollBar@79272": HScrollBar<{}>,
                            "@VScrollBar@79273": VScrollBar<{}>,
                            "@Timer@79274": Timer<{}>,
                            "@Timer@79275": Timer<{}>,
                            "@Timer@79276": Timer<{}>,
                        }
                    >,
                    ZoneButton: Button<{}>,
                    FPS: Label<{}>,
                }
            >,
        },
    }
}
