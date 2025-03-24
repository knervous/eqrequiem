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
                    WebView: Node<{}>,
                }
            >,
            GDBridge: Node<{}>,
            JSBridge: Node<{}>,
        },
    }
}
