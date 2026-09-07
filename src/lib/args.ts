export type ParsedArgs = {
  command: string[];
  flags: Record<string, string | boolean>;
  positionals: string[];
};

export function parseArgv(argv: string[]): ParsedArgs {
  const command: string[] = [];
  const flags: Record<string, string | boolean> = {};
  const positionals: string[] = [];
  let seenCommand = false;
  for (let i = 0; i < argv.length; i++) {
    const token = argv[i]!;
    if (token.startsWith("--")) {
      const key = token.slice(2);
      const next = argv[i + 1];
      if (next === undefined || next.startsWith("--")) {
        flags[key] = true;
      } else {
        flags[key] = next;
        i += 1;
      }
      continue;
    }
    if (!seenCommand) {
      command.push(token);
      if (command.length >= 2) seenCommand = true;
      continue;
    }
    positionals.push(token);
  }
  if (command.length === 1) {
    seenCommand = true;
  }
  return { command, flags, positionals };
}

export function flagString(flags: Record<string, string | boolean>, name: string): string | undefined {
  const value = flags[name];
  return typeof value === "string" ? value : undefined;
}

export function flagBool(flags: Record<string, string | boolean>, name: string): boolean {
  return flags[name] === true || flags[name] === "true";
}
