package tools

import (
	"context"
	"encoding/json"
	"fmt"
	"strconv"

	"github.com/bizspark/mcp/db"
	"github.com/mark3labs/mcp-go/mcp"
	"github.com/mark3labs/mcp-go/server"
)

type contextKey string

const BusinessIDKey contextKey = "businessId"

func mustJSON(v any) string {
	b, _ := json.MarshalIndent(v, "", "  ")
	return string(b)
}

func getBusinessID(ctx context.Context) (string, error) {
	id, _ := ctx.Value(BusinessIDKey).(string)
	if id == "" {
		return "", fmt.Errorf("unauthorized: valid API key required")
	}
	return id, nil
}

func strArg(req mcp.CallToolRequest, key string) string {
	v, _ := req.Params.Arguments[key].(string)
	return v
}

func intArg(req mcp.CallToolRequest, key string) int {
	n, _ := strconv.Atoi(strArg(req, key))
	return n
}

func Register(s *server.MCPServer, database *db.DB) {
	// Products & Catalog
	registerListProducts(s, database)
	registerSearchProducts(s, database)
	registerGetProduct(s, database)
	registerListCategories(s, database)
	registerGetLowStock(s, database)

	// Orders
	registerListOrders(s, database)
	registerGetOrder(s, database)
	registerGetOrderStats(s, database)

	// Customers
	registerListCustomers(s, database)

	// Store
	registerGetStoreConfig(s, database)
	registerListShippingMethods(s, database)
	registerGetStoreSummary(s, database)
}

// ── Products ──────────────────────────────────────────────────────────────────

func registerListProducts(s *server.MCPServer, database *db.DB) {
	s.AddTool(mcp.NewTool("list_products",
		mcp.WithDescription("List all active products in the store with title, price, currency, and category."),
		mcp.WithString("limit", mcp.Description("Max products to return (default 20, max 100).")),
	), func(ctx context.Context, req mcp.CallToolRequest) (*mcp.CallToolResult, error) {
		bizID, err := getBusinessID(ctx)
		if err != nil { return mcp.NewToolResultError(err.Error()), nil }

		products, err := database.ListProducts(ctx, bizID, intArg(req, "limit"))
		if err != nil { return mcp.NewToolResultError(err.Error()), nil }
		if len(products) == 0 { return mcp.NewToolResultText("No products found in the store yet."), nil }
		return mcp.NewToolResultText(mustJSON(products)), nil
	})
}

func registerSearchProducts(s *server.MCPServer, database *db.DB) {
	s.AddTool(mcp.NewTool("search_products",
		mcp.WithDescription("Search products by keyword in title or description."),
		mcp.WithString("keyword", mcp.Description("Search keyword. Required.")),
		mcp.WithString("limit", mcp.Description("Max results (default 10).")),
	), func(ctx context.Context, req mcp.CallToolRequest) (*mcp.CallToolResult, error) {
		bizID, err := getBusinessID(ctx)
		if err != nil { return mcp.NewToolResultError(err.Error()), nil }

		keyword := strArg(req, "keyword")
		if keyword == "" { return mcp.NewToolResultError("keyword is required"), nil }

		products, err := database.SearchProducts(ctx, bizID, keyword, intArg(req, "limit"))
		if err != nil { return mcp.NewToolResultError(err.Error()), nil }
		if len(products) == 0 { return mcp.NewToolResultText(fmt.Sprintf("No products found matching '%s'.", keyword)), nil }
		return mcp.NewToolResultText(mustJSON(products)), nil
	})
}

func registerGetProduct(s *server.MCPServer, database *db.DB) {
	s.AddTool(mcp.NewTool("get_product",
		mcp.WithDescription("Get full details of a product including variants and stock level."),
		mcp.WithString("productId", mcp.Description("Product UUID. Required.")),
	), func(ctx context.Context, req mcp.CallToolRequest) (*mcp.CallToolResult, error) {
		bizID, err := getBusinessID(ctx)
		if err != nil { return mcp.NewToolResultError(err.Error()), nil }

		productID := strArg(req, "productId")
		if productID == "" { return mcp.NewToolResultError("productId is required"), nil }

		details, err := database.GetProductWithDetails(ctx, bizID, productID)
		if err != nil { return mcp.NewToolResultError(err.Error()), nil }
		return mcp.NewToolResultText(mustJSON(details)), nil
	})
}

func registerListCategories(s *server.MCPServer, database *db.DB) {
	s.AddTool(mcp.NewTool("list_categories",
		mcp.WithDescription("List all active product categories in the store."),
	), func(ctx context.Context, req mcp.CallToolRequest) (*mcp.CallToolResult, error) {
		bizID, err := getBusinessID(ctx)
		if err != nil { return mcp.NewToolResultError(err.Error()), nil }

		cats, err := database.ListCategories(ctx, bizID)
		if err != nil { return mcp.NewToolResultError(err.Error()), nil }
		if len(cats) == 0 { return mcp.NewToolResultText("No categories set up yet."), nil }
		return mcp.NewToolResultText(mustJSON(cats)), nil
	})
}

func registerGetLowStock(s *server.MCPServer, database *db.DB) {
	s.AddTool(mcp.NewTool("get_low_stock",
		mcp.WithDescription("Find products with stock at or below the threshold. Useful for restocking alerts."),
		mcp.WithString("threshold", mcp.Description("Stock level threshold (default 5). Items at or below this are returned.")),
	), func(ctx context.Context, req mcp.CallToolRequest) (*mcp.CallToolResult, error) {
		bizID, err := getBusinessID(ctx)
		if err != nil { return mcp.NewToolResultError(err.Error()), nil }

		items, err := database.GetLowStockItems(ctx, bizID, intArg(req, "threshold"))
		if err != nil { return mcp.NewToolResultError(err.Error()), nil }
		if len(items) == 0 { return mcp.NewToolResultText("All products are well-stocked."), nil }
		return mcp.NewToolResultText(mustJSON(items)), nil
	})
}

// ── Orders ────────────────────────────────────────────────────────────────────

func registerListOrders(s *server.MCPServer, database *db.DB) {
	s.AddTool(mcp.NewTool("list_orders",
		mcp.WithDescription("List customer orders. Filter by status: PENDING, PAID, FULFILLED, CANCELLED."),
		mcp.WithString("status", mcp.Description("Order status filter. Leave empty for all.")),
		mcp.WithString("limit", mcp.Description("Max orders (default 20, max 100).")),
	), func(ctx context.Context, req mcp.CallToolRequest) (*mcp.CallToolResult, error) {
		bizID, err := getBusinessID(ctx)
		if err != nil { return mcp.NewToolResultError(err.Error()), nil }

		orders, err := database.ListOrders(ctx, bizID, strArg(req, "status"), intArg(req, "limit"))
		if err != nil { return mcp.NewToolResultError(err.Error()), nil }
		if len(orders) == 0 { return mcp.NewToolResultText("No orders found."), nil }
		return mcp.NewToolResultText(mustJSON(orders)), nil
	})
}

func registerGetOrder(s *server.MCPServer, database *db.DB) {
	s.AddTool(mcp.NewTool("get_order",
		mcp.WithDescription("Get full details of a specific order including all line items and customer info."),
		mcp.WithString("orderId", mcp.Description("Order UUID. Required.")),
	), func(ctx context.Context, req mcp.CallToolRequest) (*mcp.CallToolResult, error) {
		bizID, err := getBusinessID(ctx)
		if err != nil { return mcp.NewToolResultError(err.Error()), nil }

		orderID := strArg(req, "orderId")
		if orderID == "" { return mcp.NewToolResultError("orderId is required"), nil }

		order, err := database.GetOrder(ctx, bizID, orderID)
		if err != nil { return mcp.NewToolResultError(err.Error()), nil }
		return mcp.NewToolResultText(mustJSON(order)), nil
	})
}

func registerGetOrderStats(s *server.MCPServer, database *db.DB) {
	s.AddTool(mcp.NewTool("get_order_stats",
		mcp.WithDescription("Get order statistics: total orders, total revenue, and count by status (PENDING/PAID/FULFILLED/CANCELLED)."),
	), func(ctx context.Context, req mcp.CallToolRequest) (*mcp.CallToolResult, error) {
		bizID, err := getBusinessID(ctx)
		if err != nil { return mcp.NewToolResultError(err.Error()), nil }

		stats, err := database.GetOrderStats(ctx, bizID)
		if err != nil { return mcp.NewToolResultError(err.Error()), nil }
		return mcp.NewToolResultText(mustJSON(stats)), nil
	})
}

// ── Customers ─────────────────────────────────────────────────────────────────

func registerListCustomers(s *server.MCPServer, database *db.DB) {
	s.AddTool(mcp.NewTool("list_customers",
		mcp.WithDescription("List registered store customers with email and name. Returns most recent first."),
		mcp.WithString("limit", mcp.Description("Max customers (default 20, max 100).")),
	), func(ctx context.Context, req mcp.CallToolRequest) (*mcp.CallToolResult, error) {
		bizID, err := getBusinessID(ctx)
		if err != nil { return mcp.NewToolResultError(err.Error()), nil }

		customers, err := database.ListCustomers(ctx, bizID, intArg(req, "limit"))
		if err != nil { return mcp.NewToolResultError(err.Error()), nil }
		if len(customers) == 0 { return mcp.NewToolResultText("No customers registered yet."), nil }
		return mcp.NewToolResultText(mustJSON(customers)), nil
	})
}

// ── Store ─────────────────────────────────────────────────────────────────────

func registerGetStoreConfig(s *server.MCPServer, database *db.DB) {
	s.AddTool(mcp.NewTool("get_store_config",
		mcp.WithDescription("Get store branding and config: business name, tagline, colors, currency, locale, and whether the store is published."),
	), func(ctx context.Context, req mcp.CallToolRequest) (*mcp.CallToolResult, error) {
		bizID, err := getBusinessID(ctx)
		if err != nil { return mcp.NewToolResultError(err.Error()), nil }

		config, err := database.GetWebsiteConfig(ctx, bizID)
		if err != nil { return mcp.NewToolResultError(err.Error()), nil }
		return mcp.NewToolResultText(mustJSON(config)), nil
	})
}

func registerListShippingMethods(s *server.MCPServer, database *db.DB) {
	s.AddTool(mcp.NewTool("list_shipping_methods",
		mcp.WithDescription("List active shipping methods and their flat rates."),
	), func(ctx context.Context, req mcp.CallToolRequest) (*mcp.CallToolResult, error) {
		bizID, err := getBusinessID(ctx)
		if err != nil { return mcp.NewToolResultError(err.Error()), nil }

		methods, err := database.ListShippingMethods(ctx, bizID)
		if err != nil { return mcp.NewToolResultError(err.Error()), nil }
		if len(methods) == 0 { return mcp.NewToolResultText("No shipping methods configured."), nil }
		return mcp.NewToolResultText(mustJSON(methods)), nil
	})
}

func registerGetStoreSummary(s *server.MCPServer, database *db.DB) {
	s.AddTool(mcp.NewTool("get_store_summary",
		mcp.WithDescription("Get a complete store dashboard: product count, customer count, and full order statistics including total revenue."),
	), func(ctx context.Context, req mcp.CallToolRequest) (*mcp.CallToolResult, error) {
		bizID, err := getBusinessID(ctx)
		if err != nil { return mcp.NewToolResultError(err.Error()), nil }

		summary, err := database.GetStoreSummary(ctx, bizID)
		if err != nil { return mcp.NewToolResultError(err.Error()), nil }
		return mcp.NewToolResultText(mustJSON(summary)), nil
	})
}
