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
                            "@HScrollBar@31178": HScrollBar<{}>,
                            "@VScrollBar@31179": VScrollBar<{}>,
                            "@Timer@31180": Timer<{}>,
                            "@Timer@31181": Timer<{}>,
                            "@Timer@31182": Timer<{}>,
                        }
                    >,
                    ZoneButton: Button<{}>,
                    FPS: Label<{}>,
                }
            >,
        },
    }
}
