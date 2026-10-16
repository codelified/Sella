import type { PluginAdminExports } from "emdash";
import { CouponsPage } from "./pages/CouponsPage.js";
import { DesignsPage } from "./pages/DesignsPage.js";
import { OrdersPage } from "./pages/OrdersPage.js";
import { ReportsPage } from "./pages/ReportsPage.js";
import { ReviewsPage } from "./pages/ReviewsPage.js";
import { LowStockWidget, PendingReviewsWidget, RecentOrdersWidget } from "./widgets.js";

export const pages: PluginAdminExports["pages"] = {
	"/orders": OrdersPage,
	"/coupons": CouponsPage,
	"/reviews": ReviewsPage,
	"/reports": ReportsPage,
	"/designs": DesignsPage,
};

export const widgets: PluginAdminExports["widgets"] = {
	"recent-orders": RecentOrdersWidget,
	"low-stock": LowStockWidget,
	"pending-reviews": PendingReviewsWidget,
};
