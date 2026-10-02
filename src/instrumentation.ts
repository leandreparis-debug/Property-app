/**
 * Runs once when the Next.js server starts. The Node.js tasks live in
 * `instrumentation-node.ts`; the condition below lets the bundler drop them
 * from the edge build.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { registerNode } = await import("./instrumentation-node");
    await registerNode();
  }
}
