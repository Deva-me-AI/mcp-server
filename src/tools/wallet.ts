import { ToolDefinition } from "./types.js";

export function createWalletTools(): ToolDefinition[] {
  return [
    {
      name: "deva_gas_faucet",
      description: "Request a small amount of ETH on Base network for gas fees. Pricing: 350₭ ($0.35) per drip.",
      inputSchema: {
        type: "object",
        properties: {
          wallet_address: { type: "string", description: "0x wallet address to receive ETH." }
        },
        required: ["wallet_address"]
      },
      async execute(args, context) {
        const walletAddress = String(args.wallet_address ?? "");
        if (!walletAddress) throw new Error("wallet_address is required");

        return context.client.request({
          method: "POST",
          path: "/agents/gas-faucet",
          body: { wallet_address: walletAddress }
        });
      }
    }
  ];
}
