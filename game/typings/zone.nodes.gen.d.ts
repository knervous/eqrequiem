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
                            "@HScrollBar@46183": HScrollBar<{}>,
                            "@VScrollBar@46184": VScrollBar<{}>,
                            "@Timer@46185": Timer<{}>,
                            "@Timer@46186": Timer<{}>,
                            "@Timer@46187": Timer<{}>,
                        }
                    >,
                    ZoneButton: Button<{}>,
                    FPS: Label<{}>,
                    PlayerDetails: RichTextLabel<
                        {
                            "@VScrollBar@46188": VScrollBar<{}>,
                        }
                    >,
                }
            >,
            GDBridge: Node<{}>,
        },
    }
}
