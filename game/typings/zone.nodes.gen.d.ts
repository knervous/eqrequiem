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
                            "@HScrollBar@45244": HScrollBar<{}>,
                            "@VScrollBar@45245": VScrollBar<{}>,
                            "@Timer@45246": Timer<{}>,
                            "@Timer@45247": Timer<{}>,
                            "@Timer@45248": Timer<{}>,
                        }
                    >,
                    ZoneButton: Button<{}>,
                    FPS: Label<{}>,
                }
            >,
            GDBridge: Node<{}>,
        },
    }
}
