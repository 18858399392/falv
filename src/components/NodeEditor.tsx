import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Placeholder from '@tiptap/extension-placeholder';
import TextAlign from '@tiptap/extension-text-align';
import { useEffect, useRef } from 'react';

interface NodeEditorProps {
  content: string;
  onChange: (content: string) => void;
  onBlur: () => void;
  isEditing: boolean;
  verticalAlign?: 'top' | 'center' | 'bottom';
}

export default function NodeEditor({ content, onChange, onBlur, isEditing, verticalAlign = 'center' }: NodeEditorProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  const getVerticalAlignClass = () => {
    switch (verticalAlign) {
      case 'top': return 'justify-start';
      case 'bottom': return 'justify-end';
      case 'center':
      default: return 'justify-center';
    }
  };

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: {
          levels: [1, 2, 3],
        },
      }),
      Placeholder.configure({
        placeholder: '输入文本...',
      }),
      TextAlign.configure({
        types: ['heading', 'paragraph'],
        defaultAlignment: 'center',
      }),
    ],
    content: content,
    editable: isEditing,
    onUpdate: ({ editor }) => {
      onChange(editor.getHTML());
    },
    editorProps: {
      attributes: {
        class: `prose prose-sm focus:outline-none max-w-none w-full h-full flex flex-col ${getVerticalAlignClass()} [&_*]:!m-0 [&_h1]:!leading-tight [&_h2]:!leading-tight [&_h3]:!leading-tight [&_p]:!leading-tight`,
      },
    },
  });

  useEffect(() => {
    if (editor && isEditing) {
      editor.setEditable(true);
      editor.commands.focus('end');
    } else if (editor) {
      editor.setEditable(false);
    }
  }, [editor, isEditing]);

  useEffect(() => {
    if (editor) {
      editor.setOptions({
        editorProps: {
          attributes: {
            class: `prose prose-sm focus:outline-none max-w-none w-full h-full flex flex-col ${getVerticalAlignClass()} [&_*]:!m-0 [&_h1]:!leading-tight [&_h2]:!leading-tight [&_h3]:!leading-tight [&_p]:!leading-tight`,
          },
        },
      });
    }
  }, [editor, verticalAlign]);

  useEffect(() => {
    if (editor && content !== editor.getHTML() && !isEditing) {
      editor.commands.setContent(content);
    }
  }, [content, editor, isEditing]);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (isEditing && containerRef.current && !containerRef.current.contains(e.target as Node)) {
        onBlur();
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isEditing, onBlur]);

  if (!editor) {
    return null;
  }

  return (
    <div ref={containerRef} className="w-full h-full flex flex-col items-center justify-center relative tiptap-container">
      <EditorContent editor={editor} className="w-full h-full" />
    </div>
  );
}
