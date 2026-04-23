import { computePosition, flip, offset, shift } from "@floating-ui/dom";
import { Extension } from "@tiptap/react";
import Suggestion from "@tiptap/suggestion";
import { createRef } from "react";
import { createRoot, type Root } from "react-dom/client";
import { filterCommands, type SlashCommand } from "./slash-commands";
import { SlashMenu, type SlashMenuHandle } from "./slash-menu";

export const SlashCommandsExtension = Extension.create({
  name: "slashCommands",
  addProseMirrorPlugins() {
    return [
      Suggestion({
        editor: this.editor,
        char: "/",
        startOfLine: true,
        allowSpaces: false,
        items: ({ query }: { query: string }) => filterCommands(query).slice(0, 12),
        command: ({ editor, range, props }) => {
          const cmd = props as SlashCommand;
          cmd.run(editor, range);
        },
        render: () => {
          let container: HTMLDivElement | null = null;
          let root: Root | null = null;
          const ref = createRef<SlashMenuHandle>();

          const ensureMounted = () => {
            if (!container) {
              container = document.createElement("div");
              container.style.position = "absolute";
              container.style.top = "0";
              container.style.left = "0";
              container.style.zIndex = "1000";
              document.body.appendChild(container);
              root = createRoot(container);
            }
            return { container, root };
          };

          const position = async (getRect: () => DOMRect | null) => {
            const rect = getRect();
            if (!rect || !container) return;
            const ref = {
              getBoundingClientRect: () => rect,
              getClientRects: () =>
                ({ length: 1, item: () => rect, [0]: rect }) as unknown as DOMRectList,
            };
            const { x, y } = await computePosition(
              ref as unknown as { getBoundingClientRect: () => DOMRect },
              container,
              {
                placement: "bottom-start",
                middleware: [offset(6), flip(), shift({ padding: 8 })],
              },
            );
            container.style.transform = `translate(${x}px, ${y}px)`;
          };

          return {
            onStart: (props: {
              items: SlashCommand[];
              command: (i: SlashCommand) => void;
              clientRect?: (() => DOMRect | null) | null;
            }) => {
              const mounted = ensureMounted();
              mounted.root?.render(
                <SlashMenu ref={ref} items={props.items} command={props.command} />,
              );
              if (props.clientRect) void position(props.clientRect);
            },
            onUpdate: (props: {
              items: SlashCommand[];
              command: (i: SlashCommand) => void;
              clientRect?: (() => DOMRect | null) | null;
            }) => {
              const mounted = ensureMounted();
              mounted.root?.render(
                <SlashMenu ref={ref} items={props.items} command={props.command} />,
              );
              if (props.clientRect) void position(props.clientRect);
            },
            onKeyDown: (props: { event: KeyboardEvent }) => {
              if (props.event.key === "Escape") {
                if (container) container.style.display = "none";
                return true;
              }
              return ref.current?.onKeyDown(props.event) ?? false;
            },
            onExit: () => {
              if (root) root.unmount();
              if (container && container.parentNode) container.parentNode.removeChild(container);
              root = null;
              container = null;
            },
          };
        },
      }),
    ];
  },
});
