import { Wallet, JsonRpcProvider, Contract } from "ethers";

const ERC20_MINT_ABI = [
  "function mint(address to, uint256 amount) external",
  "function decimals() view returns (uint8)",
];

export type MintResult = { hash: string };

export function getTokenContract() {
  const rpcUrl = process.env.BASE_RPC_URL;
  const privateKey = process.env.PRIVATE_KEY;
  const tokenAddress = process.env.TOKEN_ADDRESS;
  if (!rpcUrl || !privateKey || !tokenAddress) return null;
  const provider = new JsonRpcProvider(rpcUrl);
  const wallet = new Wallet(privateKey, provider);
  const contract = new Contract(tokenAddress, ERC20_MINT_ABI, wallet);
  return { contract };
}

export async function mintTo(to: string, humanAmount: number): Promise<MintResult> {
  const setup = getTokenContract();
  if (!setup) throw new Error("Token contract not configured");
  const { contract } = setup;
  const decimals: number = await contract.decimals();
  const amount = BigInt(Math.floor(humanAmount * 10 ** decimals));
  const tx = await contract.mint(to, amount);
  return { hash: tx.hash };
}

