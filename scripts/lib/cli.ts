/**
 * Helpers shared by the user CLI scripts: argument parsing, hidden password
 * prompt, French error output.
 */
import { createInterface } from "node:readline";
import { parseArgs } from "node:util";

/**
 * Parses `--name value` / `--name=value` options.
 * @param options - Names of the accepted options.
 */
export function parseOptions<K extends string>(options: readonly K[]): Partial<Record<K, string>> {
  const { values } = parseArgs({
    args: process.argv.slice(2).filter((arg) => arg !== "--"),
    options: Object.fromEntries(options.map((name) => [name, { type: "string" }])) as Record<K, { type: "string" }>,
    strict: true,
    allowPositionals: false,
  });
  return values as Partial<Record<K, string>>;
}

/**
 * Asks for a secret without echoing it (TTY). With a non-interactive stdin
 * (tests, CI), reads one line from stdin instead.
 * @param question - Prompt shown to the user.
 */
export function promptHidden(question: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const input = process.stdin;
    const output = process.stdout;
    if (!input.isTTY) {
      const rl = createInterface({ input, terminal: false });
      output.write(question);
      rl.once("line", (line) => {
        rl.close();
        output.write("\n");
        resolve(line);
      });
      rl.once("close", () => reject(new Error("Saisie interrompue.")));
      return;
    }
    output.write(question);
    input.setRawMode(true);
    input.resume();
    input.setEncoding("utf8");
    let value = "";
    const onData = (char: string) => {
      switch (char) {
        case "\r":
        case "\n":
        case "\u0004":
          input.setRawMode(false);
          input.pause();
          input.off("data", onData);
          output.write("\n");
          resolve(value);
          return;
        case "\u0003":
          input.setRawMode(false);
          output.write("\n");
          reject(new Error("Saisie annulée."));
          return;
        case "\u007f":
        case "\b":
          value = value.slice(0, -1);
          return;
        default:
          value += char;
      }
    };
    input.on("data", onData);
  });
}

/** Stdin lines, consumed one at a time (non-interactive mode reads them in order). */
let pendingLines: string[] | null = null;

/**
 * Asks for a new password twice (hidden) and checks both entries match.
 * @returns The password.
 */
export async function promptNewPassword(): Promise<string> {
  if (!process.stdin.isTTY) {
    pendingLines ??= await readAllStdin();
    const [first = "", second = ""] = pendingLines.splice(0, 2);
    if (first !== second) throw new Error("Les deux saisies ne correspondent pas.");
    return first;
  }
  const first = await promptHidden("Mot de passe : ");
  const second = await promptHidden("Confirmer le mot de passe : ");
  if (first !== second) throw new Error("Les deux saisies ne correspondent pas.");
  return first;
}

async function readAllStdin(): Promise<string[]> {
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) chunks.push(chunk as Buffer);
  return Buffer.concat(chunks).toString("utf8").split(/\r?\n/);
}

/**
 * Runs a CLI main function: prints French errors without stack traces for
 * expected failures, sets the exit code, and always disconnects.
 */
export async function runCli(main: () => Promise<void>, cleanup: () => Promise<void>): Promise<void> {
  try {
    await main();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`Erreur : ${message}`);
    process.exitCode = 1;
  } finally {
    await cleanup();
  }
}
