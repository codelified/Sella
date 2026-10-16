export function money(n: number): string {
	return "$" + Number(n).toFixed(2);
}

export function round2(n: number): number {
	return Math.round(n * 100) / 100;
}
