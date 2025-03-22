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
                            "@VScrollBar@25662": VScrollBar<{}>,
                        }
                    >,
                    RaceChooser: OptionButton<
                        {
                            "@PopupMenu@25668": PopupMenu<
                                {
                                    "@PanelContainer@25663": PanelContainer<
                                        {
                                            "@ScrollContainer@25664": ScrollContainer<
                                                {
                                                    "@Control@25665": Control<{}>,
                                                    _h_scroll: HScrollBar<{}>,
                                                    _v_scroll: VScrollBar<{}>,
                                                }
                                            >,
                                        }
                                    >,
                                    "@Timer@25666": Timer<{}>,
                                    "@Timer@25667": Timer<{}>,
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
                                            "@VScrollBar@25669": VScrollBar<{}>,
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
