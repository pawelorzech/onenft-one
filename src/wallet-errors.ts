export type WalletErrorContext = { phase?: "before" | "sending" | "sent"; hash?: string | null; network?: string; contractMessage?: string | null };
/** Self-contained so exactly this function can also run in the wallet browser. */
export function walletErrorMessage(error: unknown, context: WalletErrorContext = {}): string {
  const codes: number[] = [], messages: string[] = [], visited = new Set<unknown>();
  function collect(value: unknown, depth: number) {
    if (!value || depth > 5 || visited.has(value)) return;
    if (typeof value === "string") { messages.push(value); return; }
    if (typeof value !== "object") return;
    visited.add(value);
    const row = value as Record<string, unknown>;
    if (typeof row.code === "number") codes.push(row.code);
    if (typeof row.message === "string") messages.push(row.message);
    for (const key of ["cause", "error", "data", "originalError"]) collect(row[key], depth + 1);
  }
  collect(error, 0);
  const code = codes.includes(4001) ? 4001 : codes.includes(-32002) ? -32002 : codes.find(c => c === 4900 || c === 4901);
  const message = messages.join(" ").toLowerCase();
  const network = context.network || "Base";
  if (context.phase === "sent" || context.hash) return "A transaction was sent, but its confirmation could not be checked. Open View transaction or your wallet activity. Do not send another transaction until you know its result.";
  if (code === 4001) return "Cancelled in the wallet. No new transaction was sent. You can try again when you are ready.";
  if (code === -32002) return "Your wallet already has a request waiting. Open your wallet and finish or cancel that request. Do not start another one yet.";
  if (context.contractMessage) return context.contractMessage + " This attempt was rejected. Check the collection status and your balance before trying again.";
  if (/insufficient funds|insufficient.*eth|funds for gas/.test(message)) return "There is not enough ETH on " + network + " for network gas and the randomness fee. This attempt was rejected. Add ETH on " + network + ", then try again.";
  if (/allowance/.test(message)) return "The USDC approval is too small for this mint. This attempt was rejected. Check your wallet's pending approvals, then approve the amount shown in the mint form.";
  if (/insufficient.*usdc|usdc.*balance/.test(message)) return "There is not enough USDC on " + network + " for this mint. No new mint was sent. Add USDC or choose fewer coins, then try again.";
  if (/switch back to (base|ethereum)|wrong network|wrong chain/.test(message)) return "Your wallet is on another network. No new transaction was sent. Choose Continue on " + network + "; your pending transaction is kept.";
  if (/account changed|another wallet|gave no account/.test(message)) return "The wallet account changed or is not connected. No new transaction was sent. Switch back to the original account and reconnect to continue.";
  if (context.phase === "sending") return "The wallet did not confirm whether it sent the transaction. Check your wallet activity on " + network + " before trying again. This page will not resend it automatically.";
  if (code === 4900 || code === 4901 || /disconnect|not connected/.test(message)) return "The wallet connection was lost. No new transaction was sent. Reconnect your wallet on " + network + " and check any pending transaction before continuing.";
  if (/timeout|timed out|network|fetch|rpc/.test(message)) return "The network did not answer while checking the mint. No new transaction was sent. Wait a moment, check any pending transaction in your wallet, then try again.";
  return "The wallet could not complete this step. Check its activity and any pending requests before trying again. If this keeps happening, reload the page and reconnect your wallet.";
}
export const walletErrorScript = `var walletErrorMessage=${walletErrorMessage.toString()};`;
