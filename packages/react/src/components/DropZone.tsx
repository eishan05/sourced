import {
  type ChangeEvent,
  type DragEvent,
  type ReactNode,
  useState,
} from "react";

export interface DropZoneProps {
  onText: (text: string, name?: string) => void;
  onUnsupported?: (file: File) => void;
  className?: string;
  children?: ReactNode;
}

function isTextFile(file: File): boolean {
  const name = file.name.toLowerCase();
  return name.endsWith(".txt") || name.endsWith(".md");
}

export function DropZone({
  onText,
  onUnsupported,
  className,
  children,
}: DropZoneProps) {
  const [text, setText] = useState("");

  const add = (): void => {
    if (text.length === 0) return;
    onText(text);
    setText("");
  };

  const addFiles = async (files: File[]): Promise<void> => {
    for (const file of files) {
      if (!isTextFile(file)) {
        onUnsupported?.(file);
        continue;
      }
      onText(await file.text(), file.name);
    }
  };

  const onFileChange = (event: ChangeEvent<HTMLInputElement>): void => {
    const files = Array.from(event.target.files ?? []);
    event.target.value = "";
    void addFiles(files);
  };

  const onDrop = (event: DragEvent<HTMLDivElement>): void => {
    event.preventDefault();
    void addFiles(Array.from(event.dataTransfer.files));
  };

  return (
    <section
      aria-label="Text source drop zone"
      className={className}
      data-drop-zone
      onDragOver={(event) => event.preventDefault()}
      onDrop={onDrop}
    >
      {children}
      <textarea
        aria-label="Source text"
        onChange={(event) => setText(event.target.value)}
        value={text}
      />
      <button disabled={text.length === 0} onClick={add} type="button">
        Add
      </button>
      <input
        accept=".txt,.md,text/plain,text/markdown"
        aria-label="Add text files"
        multiple
        onChange={onFileChange}
        type="file"
      />
    </section>
  );
}
