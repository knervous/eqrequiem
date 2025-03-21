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
                            "@HScrollBar@39265": HScrollBar<{}>,
                            "@VScrollBar@39266": VScrollBar<{}>,
                            "@Timer@39267": Timer<{}>,
                            "@Timer@39268": Timer<{}>,
                            "@Timer@39269": Timer<{}>,
                        }
                    >,
                    ZoneButton: Button<{}>,
                    FPS: Label<{}>,
                    PlayerDetails: RichTextLabel<
                        {
                            "@VScrollBar@39270": VScrollBar<{}>,
                        }
                    >,
                    RaceChooser: OptionButton<
                        {
                            "@PopupMenu@39276": PopupMenu<
                                {
                                    "@PanelContainer@39271": PanelContainer<
                                        {
                                            "@ScrollContainer@39272": ScrollContainer<
                                                {
                                                    "@Control@39273": Control<{}>,
                                                    _h_scroll: HScrollBar<{}>,
                                                    _v_scroll: VScrollBar<{}>,
                                                }
                                            >,
                                        }
                                    >,
                                    "@Timer@39274": Timer<{}>,
                                    "@Timer@39275": Timer<{}>,
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
