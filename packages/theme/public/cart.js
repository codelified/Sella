// Northwind Supply — tiny localStorage cart. No backend needed for the demo.
// To take real payments later, point the checkout button at Stripe Payment
// Links (or Shop Pay) and keep this file for the drawer/badge only.
(function () {
	var KEY = "sella_cart_v1";
	var FREE_SHIPPING_AT = 75;

	function load() {
		try {
			return JSON.parse(localStorage.getItem(KEY)) || {};
		} catch (e) {
			return {};
		}
	}
	function save(cart) {
		localStorage.setItem(KEY, JSON.stringify(cart));
		document.dispatchEvent(new CustomEvent("nw:cart-updated"));
	}

	window.NWCart = {
		FREE_SHIPPING_AT: FREE_SHIPPING_AT,
		items: function () {
			return Object.values(load());
		},
		count: function () {
			return Object.values(load()).reduce(function (n, i) {
				return n + (i.qty || 0);
			}, 0);
		},
		subtotal: function () {
			return Object.values(load()).reduce(function (n, i) {
				return n + i.price * i.qty;
			}, 0);
		},
		money: function (n) {
			return "$" + Number(n).toFixed(2);
		},
		add: function (product, qty) {
			qty = qty || 1;
			var cart = load();
			var id = String(product.id);
			var existing = cart[id];
			cart[id] = {
				id: id,
				name: product.name,
				price: Number(product.price),
				image: product.image || "",
				qty: Math.min(99, (existing ? existing.qty : 0) + qty),
			};
			save(cart);
		},
		setQty: function (id, qty) {
			var cart = load();
			if (!cart[id]) return;
			if (qty <= 0) delete cart[id];
			else cart[id].qty = Math.min(99, qty);
			save(cart);
		},
		remove: function (id) {
			var cart = load();
			delete cart[id];
			save(cart);
		},
		clear: function () {
			save({});
		},
	};
})();
