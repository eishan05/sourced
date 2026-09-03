import {
  type ChangeEvent,
  type DragEvent,
  type ReactNode,
  useState,
} from "react";

export interface DropZoneProps {
  onText: (text: string, name?: string) => void;
  onFile?: (file: File) => unknown | Promise<unknown>;
  onUnsupported?: (file: File) => void;
  pending?: string[];
  className?: string;
  children?: ReactNode;
}

function isTextFile(file: File): boolean {
  const name = file.name.toLowerCase();
  return name.endsWith(".txt") || name.endsWith(".md");
}

function isPdfFile(file: File): boolean {
  return (
    file.name.toLowerCase().endsWith(".pdf") ||
    file.type.toLowerCase() === "application/pdf"
  );
}

function pendingEntries(names: string[]): Array<{ key: string; name: string }> {
  const counts = new Map<string, number>();
  return names.map((name) => {
    const count = (counts.get(name) ?? 0) + 1;
    counts.set(name, count);
    return { key: `${name}-${count}`, name };
  });
}

export function DropZone({
  onText,
  onFile,
  onUnsupported,
  pending = [],
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
      if (isPdfFile(file)) {
        if (!onFile) {
          onUnsupported?.(file);
          continue;
        }
        try {
          await onFile(file);
        } catch {
          // File handlers surface their own errors so one failure does not stop
          // the rest of a multi-file drop.
        }
        continue;
      }
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
      aria-label="Source drop zone"
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
        accept=".txt,.md,.pdf,text/plain,text/markdown,application/pdf"
        aria-label="Add source files"
        multiple
        onChange={onFileChange}
        type="file"
      />
      {pending.length > 0 ? (
        <div aria-live="polite" data-pending-sources>
          {pendingEntries(pending).map(({ key, name }) => (
            <p data-pending-source key={key}>
              Extracting {name}…
            </p>
          ))}
        </div>
      ) : null}
    </section>
  );
}
