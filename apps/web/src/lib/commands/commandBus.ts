export interface CommandDefinition {
  id: string;
  title: string;
  category: string;
  shortcutLabel?: string;
  keywords?: string[];
  isEnabled?: () => boolean;
  run: () => void;
}

export interface CommandExecuteOptions {
  respectInputFocus?: boolean;
}

type Listener = () => void;

function isInputElement(element: Element | null): boolean {
  if (!(element instanceof HTMLElement)) return false;
  const tag = element.tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || element.isContentEditable;
}

class CommandBus {
  private readonly commands = new Map<string, CommandDefinition>();
  private readonly listeners = new Set<Listener>();

  register(command: CommandDefinition): () => void {
    this.commands.set(command.id, command);
    this.notify();
    return () => {
      const current = this.commands.get(command.id);
      if (current === command) {
        this.commands.delete(command.id);
        this.notify();
      }
    };
  }

  list(): CommandDefinition[] {
    return Array.from(this.commands.values()).sort((a, b) => a.title.localeCompare(b.title));
  }

  isEnabled(id: string): boolean {
    const command = this.commands.get(id);
    if (!command) return false;
    return command.isEnabled ? command.isEnabled() : true;
  }

  execute(id: string, options: CommandExecuteOptions = {}): boolean {
    const command = this.commands.get(id);
    if (!command) return false;
    if (options.respectInputFocus !== false && isInputElement(document.activeElement)) {
      return false;
    }
    if (!this.isEnabled(id)) return false;
    command.run();
    return true;
  }

  filter(query: string): CommandDefinition[] {
    const list = this.list();
    const normalized = query.trim().toLowerCase();
    if (normalized.length === 0) return list;
    return list.filter((command) => {
      if (command.title.toLowerCase().includes(normalized)) return true;
      if (command.category.toLowerCase().includes(normalized)) return true;
      if (command.id.toLowerCase().includes(normalized)) return true;
      return (command.keywords ?? []).some((keyword) => keyword.toLowerCase().includes(normalized));
    });
  }

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private notify() {
    this.listeners.forEach((listener) => listener());
  }
}

export const commandBus = new CommandBus();
