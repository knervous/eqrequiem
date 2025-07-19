// src/UI/components/game/stone/middle/stone-chat-input.tsx
import React, { useCallback, useEffect, useMemo, useState, useRef } from 'react';
import { useEventArg } from '@game/Events/event-hooks';
import { Typography } from '@mui/material';
import { createEditor, Transforms, Descendant, Node, Editor, Range, Element } from 'slate';
import { withHistory } from 'slate-history';
import {
  Slate,
  Editable,
  withReact,
  RenderElementProps,
  ReactEditor,
} from 'slate-react';
import { JsonCommandLink } from './command-link-util';
import { withCommandLinks } from './stone-chat.hooks';

interface ChatInputSlateProps {
  onExecuteCommand: (payload: JsonCommandLink) => void;
  onSubmit: (value: string) => void;
}
const initialValue: Descendant[] = [
  {
    type    : 'paragraph',
    children: [{ text: '' }],
  },
] as any as Descendant[];

export const ChatInputSlate: React.FC<ChatInputSlateProps> = ({
  onExecuteCommand,
  onSubmit,
}) => {
  const editor = useMemo(
    () => withCommandLinks(withHistory(withReact(createEditor()))),
    [],
  );
  const [value, setValue] = React.useState<Descendant[]>(initialValue);
  const [historyStack, setHistoryStack] = useState<Descendant[][]>([]);
  const [historyIndex, setHistoryIndex] = useState<number>(-1);
  const editableRef = useRef<HTMLDivElement>(null);
  const replaceEditorContent = useCallback(
    (nodes: Descendant[]) => {
      Transforms.removeNodes(editor, {
        at: Array.from({ length: editor.children.length }, (_, i) => [i]),
      } as any);
      Transforms.insertNodes(editor, nodes);
      Transforms.select(editor, Editor.start(editor, []));
    },
    [editor],
  );

  useEventArg('chatCommandLink', (payload) => {
    const isFocused = ReactEditor.isFocused(editor);
    if (!isFocused) {
      try {
        ReactEditor.focus(editor);
        Transforms.select(editor, Editor.end(editor, []));
      } catch (e) {
        console.error('Failed to focus editor:', e);
      }
    }
    Editor.withoutNormalizing(editor, () => {
      Transforms.insertNodes(
        editor,
        {
          type    : 'command-link',
          payload,
          children: [
            {
              text: `{{${Buffer.from(JSON.stringify(payload)).toString('base64')}}}`,
            },
          ],
        },
        { at: Editor.end(editor, []) }, // Always insert at the end
      );
      // Insert a space after the node to separate it from future insertions
      Transforms.insertText(editor, ' ', { at: Editor.end(editor, []) });
      // Ensure the cursor is at the end after insertion
      Transforms.select(editor, Editor.end(editor, []));
    });
    if (editableRef.current) {
      editableRef.current.scrollLeft = editableRef.current.scrollWidth;
    }
  });
  useEffect(() => {
    const handleGlobalKey = (e: KeyboardEvent) => {
      const isFocused = ReactEditor.isFocused(editor);
      if ((e.key === '/' || e.key === 'Enter') && !isFocused) {
        e.preventDefault();
        try {
          ReactEditor.focus(editor);
          Transforms.select(editor, Editor.end(editor, []));
        } catch (e) {
          console.error('Failed to focus editor:', e);
        }
        if (e.key === '/') {
          // insert slash once focused
          Editor.insertText(editor, '/');
        }
      }
    };
    document.addEventListener('keydown', handleGlobalKey);
    return () => document.removeEventListener('keydown', handleGlobalKey);
  }, [editor]);

  // Custom renderer for our command‑link node
  const renderElement = useCallback(
    (props: RenderElementProps) => {
      const { element, children, attributes } = props;
      if (element.type === 'command-link') {
        const el = element as any as { payload: JsonCommandLink };
        return (
          <Typography
            variant={'span' as any}
            {...attributes}
            contentEditable={false}
            sx={{ color: 'aquamarine', cursor: 'pointer' }}
            onClick={() => onExecuteCommand(el.payload)}
          >
            {el.payload.label}
          </Typography>
        );
      }
      // fallback
      return (
        <Typography
          {...attributes}
          sx={{ m: 0, fontSize: '12px', lineHeight: '24px' }}
          variant={'span' as any}
        >
          {children}
        </Typography>
      );
    },
    [onExecuteCommand],
  );

  const onKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      const { selection } = editor;
      e.stopPropagation();
      if (e.key === 'Backspace' && selection && Range.isCollapsed(selection)) {
        const [match] = Editor.nodes(editor, {
          match: (n) => Element.isElement(n) && n.type === 'command-link',
          at   : Editor.before(editor, selection.anchor, { unit: 'character' }) || selection,
        });

        if (match) {
          e.preventDefault();
          const [, path] = match;
          Transforms.removeNodes(editor, { at: path });
          return;
        }
      }
      switch (e.key) {
        case 'Enter': {
          e.preventDefault();
          const text = value
            .map((n) => Node.string(n))
            .join('\n')
            .trim();
          if (!text) {
            return;
          }
          // add deep clone of current nodes to history
          const snapshot = JSON.parse(JSON.stringify(value));
          setHistoryStack((prev) => [snapshot, ...prev]);
          setHistoryIndex(-1);
          onSubmit(text);
          // clear editor
          replaceEditorContent(initialValue);
          break;
        }
        case 'Escape': {
          e.preventDefault();
          replaceEditorContent(initialValue);
          setHistoryIndex(-1);
          (document.activeElement as HTMLElement)?.blur();
          break;
        }
        case 'ArrowUp': {
          e.preventDefault();
          if (historyStack.length === 0) {
            return;
          }
          const newIndex = Math.min(historyIndex + 1, historyStack.length - 1);
          setHistoryIndex(newIndex);
          replaceEditorContent(historyStack[newIndex]);
          break;
        }
        case 'ArrowDown': {
          e.preventDefault();
          if (historyIndex <= -1) {
            return;
          }
          const newIndex = historyIndex - 1;
          setHistoryIndex(newIndex);
          replaceEditorContent(
            newIndex === -1 ? initialValue : historyStack[newIndex],
          );
          break;
        }
        default:

          break;
      }
    },
    [historyStack, historyIndex, onSubmit, replaceEditorContent, value, editor],
  );

  return (
    <Slate
      editor={editor}
      initialValue={value}
      onChange={(v) => {
        console.log('onChange', v);
        setValue(v);
      }}
    >
      <Editable
        ref={editableRef}
        placeholder="Enter message…"
        renderElement={renderElement}
        style={{
          background    : 'rgba(0,0,0,0.5)',
          color         : '#dedede',
          maxHeight     : 24,
          minHeight     : 24,
          paddingLeft   : 5,
          width         : 'calc(100% - 0px)',
          // whiteSpace    : 'pre-wrap', // Prevent text wrapping
          // overflowX     : 'auto', // Enable horizontal scrolling
          // overflowY     : 'hidden', // Prevent vertical scrolling
          maxWidth      : 'calc(100% + 5px)', // Stay within parent bounds
          display       : 'inline-block', // Ensure single-line behavior
          verticalAlign : 'top', // Align properly
          scrollbarWidth: 'thin', // Firefox scrollbar
          scrollbarColor: '#888 rgba(0,0,0,0.5)', // Scrollbar style
        }}
        onKeyDown={onKeyDown}
        onPaste={(e) => {
          // e.preventDefault();
          // e.stopPropagation();
          // return false;
        }}
      />
    </Slate>
  );
};
