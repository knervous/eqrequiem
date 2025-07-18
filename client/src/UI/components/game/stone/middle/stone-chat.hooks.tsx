// src/components/game/stone/middle/stone-chat.hooks.tsx
import { Editor, Element, Node, Transforms } from 'slate';

export const withCommandLinks = <T extends Editor>(editor: T) => {
  const { isInline, normalizeNode } = editor;

  editor.isInline = (element) => {
    return element.type === 'command-link' ? true : isInline(element);
  };
  
  editor.normalizeNode = (entry) => {
    const [node, path] = entry;
    if (Element.isElement(node) && node.type === 'command-link') {
      if (node.children.length !== 1) {
        Transforms.setNodes(
          editor,
          {
            children: [
              { text: `{{${Buffer.from(JSON.stringify(node.payload)).toString('base64')}}}` },
            ],
          },
          { at: path },
        );
        return;
      }
    }
    normalizeNode(entry);
  };

  return editor;
};
