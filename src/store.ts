export type Fid = number;

export class OffchainStore {
  private fidToAddress = new Map<Fid, string>();
  private balances = new Map<Fid, number>();
  private faucetUsage = new Map<Fid, { day: string; amount: number }>();

  linkWallet(fid: Fid, address: string): void {
    this.fidToAddress.set(fid, address);
    if (!this.balances.has(fid)) this.balances.set(fid, 0);
  }

  getAddress(fid: Fid): string | undefined {
    return this.fidToAddress.get(fid);
  }

  getBalance(fid: Fid): number {
    return this.balances.get(fid) ?? 0;
  }

  addBalance(fid: Fid, amount: number): number {
    const current = this.getBalance(fid);
    const next = current + amount;
    this.balances.set(fid, next);
    return next;
  }

  subtractBalance(fid: Fid, amount: number): number {
    const current = this.getBalance(fid);
    if (amount > current) throw new Error("Insufficient balance");
    const next = current - amount;
    this.balances.set(fid, next);
    return next;
  }

  canClaimFaucet(fid: Fid, dailyCap: number, amount: number): boolean {
    const today = new Date().toISOString().slice(0, 10);
    const usage = this.faucetUsage.get(fid);
    if (!usage || usage.day !== today) return amount <= dailyCap;
    return usage.amount + amount <= dailyCap;
  }

  recordFaucet(fid: Fid, amount: number): void {
    const today = new Date().toISOString().slice(0, 10);
    const usage = this.faucetUsage.get(fid);
    if (!usage || usage.day !== today) this.faucetUsage.set(fid, { day: today, amount });
    else this.faucetUsage.set(fid, { day: today, amount: usage.amount + amount });
  }
}

export const offchainStore = new OffchainStore();

