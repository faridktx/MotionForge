export interface CommandDefinition {
  id: string;
  title: string;
  category: string;
  shortcutLabel?: string;
  keywords?: string[];
  isEnabled?: () => boolean;
  run: (payload?: unknown) => unknown | Promise<unknown>;
}

export interface CommandExecuteOptions {
  respectInputFocus?: boolean;
  payload?: unknown;
}

type Listener = () => void;

export interface CommandExecuteResult {
  executed: boolean;
  result?: unknown;
  error?: string;
  reason?: "missing" | "focused-input" | "disabled" | "failed";
}

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
    command.run(options.payload);
    return true;
  }

  async executeWithResult(id: string, options: CommandExecuteOptions = {}): Promise<CommandExecuteResult> {
    const command = this.commands.get(id);
    if (!command) {
      return {
        executed: false,
        reason: "missing",
        error: `Command "${id}" is not registered.`,
      };
    }
    if (options.respectInputFocus !== false && isInputElement(document.activeElement)) {
      return {
        executed: false,
        reason: "focused-input",
        error: `Command "${id}" is blocked while editing text.`,
      };
    }
    if (!this.isEnabled(id)) {
      return {
        executed: false,
        reason: "disabled",
        error: `Command "${id}" is disabled.`,
      };
    }

    try {
      const result = await command.run(options.payload);
      return {
        executed: true,
        result,
      };
    } catch (error) {
      return {
        executed: false,
        reason: "failed",
        error: error instanceof Error ? error.message : "command execution failed",
      };
    }
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
