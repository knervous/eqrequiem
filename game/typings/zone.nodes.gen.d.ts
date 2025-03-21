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
                    FPS: Label<{}>,
                    PlayerDetails: RichTextLabel<
                        {
                            "@VScrollBar@164254": VScrollBar<{}>,
                        }
                    >,
                    RaceChooser: OptionButton<
                        {
                            "@PopupMenu@164260": PopupMenu<
                                {
                                    "@PanelContainer@164255": PanelContainer<
                                        {
                                            "@ScrollContainer@164256": ScrollContainer<
                                                {
                                                    "@Control@164257": Control<{}>,
                                                    _h_scroll: HScrollBar<{}>,
                                                    _v_scroll: VScrollBar<{}>,
                                                }
                                            >,
                                        }
                                    >,
                                    "@Timer@164258": Timer<{}>,
                                    "@Timer@164259": Timer<{}>,
                                }
                            >,
                        }
                    >,
                    ChatContainer: VBoxContainer<
                        {
                            ScrollContainer: ScrollContainer<
                                {
                                    Content: RichTextLabel<
                                        {
                                            "@VScrollBar@164261": VScrollBar<{}>,
                                        }
                                    >,
                                    _h_scroll: HScrollBar<{}>,
                                    _v_scroll: VScrollBar<{}>,
                                }
                            >,
                            Edit: LineEdit<{}>,
                        }
                    >,
                }
            >,
            GDBridge: Node<{}>,
            JSBridge: Node<{}>,
        },
    }
}
