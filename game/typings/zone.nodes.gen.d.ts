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
                            "@HScrollBar@41545": HScrollBar<{}>,
                            "@VScrollBar@41546": VScrollBar<{}>,
                            "@Timer@41547": Timer<{}>,
                            "@Timer@41548": Timer<{}>,
                            "@Timer@41549": Timer<{}>,
                        }
                    >,
                    ZoneButton: Button<{}>,
                    FPS: Label<{}>,
                    PlayerDetails: RichTextLabel<
                        {
                            "@VScrollBar@41550": VScrollBar<{}>,
                        }
                    >,
                    RaceChooser: OptionButton<
                        {
                            "@PopupMenu@41556": PopupMenu<
                                {
                                    "@PanelContainer@41551": PanelContainer<
                                        {
                                            "@ScrollContainer@41552": ScrollContainer<
                                                {
                                                    "@Control@41553": Control<{}>,
                                                    _h_scroll: HScrollBar<{}>,
                                                    _v_scroll: VScrollBar<{}>,
                                                }
                                            >,
                                        }
                                    >,
                                    "@Timer@41554": Timer<{}>,
                                    "@Timer@41555": Timer<{}>,
                                }
                            >,
                        }
                    >,
                }
            >,
            GDBridge: Node<{}>,
        },
    }
}
