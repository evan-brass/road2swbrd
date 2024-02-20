const charset = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
export function base58(input) {
	let ret;
	if (typeof input == 'string') {
		ret = 0n;
		for (let i = 0; i < input.length; ++i) {
			const d = charset.indexOf(input[i]);
			if (d == -1) return 0n;
			ret += 58n ** BigInt(i) * d;
		}
		return ret;
	}
	else if (typeof input == 'bigint') {
		ret = '';
		while (input > 0n) {
			ret += charset.charAt(Number(input % 58n));
			input /= 58n;
		}
	}
	else { throw new Error("base58 swaps string <-> bigint"); }
	return ret;
}
