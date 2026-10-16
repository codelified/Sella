import { validateCoupon } from "../lib/coupons.js";
import { money } from "../lib/money.js";
import type { PluginRoute } from "emdash";

export const couponsValidateRoute: PluginRoute = {
	public: true,
	methods: ["POST"],
	handler: async (ctx: any) => {
		const body = (ctx.input ?? {}) as { code?: unknown; subtotal?: unknown };
		const result = await validateCoupon(ctx.storage.coupons, body.code, Number(body.subtotal ?? 0));
		if (!result.valid) return { valid: false, reason: result.reason };
		return {
			valid: true,
			code: result.coupon!.code,
			kind: result.coupon!.kind,
			value: result.coupon!.value,
			discount: result.discount,
			discountLabel: money(result.discount ?? 0),
		};
	},
};
