import { GDictionary, GError, GLTFDocumentExtension, GLTFNode, GLTFState, Image, Node, PackedByteArray } from "godot";


export default class Extension extends GLTFDocumentExtension {
    constructor() {
        super(...arguments);
        console.log('ctor exten')
    }
    _import_node(state: GLTFState, gltf_node: GLTFNode, json: GDictionary<Record<any, any>>, node: Node<{}>): GError {
        console.log('Looking at state from IMPORT NODE');
        for(const iter of json.values()) {
            console.log('Got iter', iter);
        }
        return super._import_node(state, gltf_node, json, node);
    }
    _parse_node_extensions(state: GLTFState, gltf_node: GLTFNode, extensions: GDictionary<Record<any, any>>): GError {
        console.log('Looking at state from PARSE NODE', JSON.stringify(state));

        return super._parse_node_extensions(state, gltf_node, extensions);
    }
    _parse_image_data(state: GLTFState, image_data: PackedByteArray | number[] | ArrayBuffer, mime_type: string, ret_image: Image): GError {
        console.log('Looking at state', JSON.stringify(state));
        return super._parse_image_data(state, image_data, mime_type, ret_image);
    }
}
