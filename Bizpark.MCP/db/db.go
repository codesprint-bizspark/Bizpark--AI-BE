package db

import (
	"context"
	"crypto/sha256"
	"fmt"
	"regexp"
	"strings"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
)

type DB struct {
	pool *pgxpool.Pool
}

func New(ctx context.Context, commerceURL string) (*DB, error) {
	pool, err := pgxpool.New(ctx, commerceURL)
	if err != nil {
		return nil, fmt.Errorf("commerce db connect: %w", err)
	}
	if err := pool.Ping(ctx); err != nil {
		return nil, fmt.Errorf("commerce db ping: %w", err)
	}
	return &DB{pool: pool}, nil
}

func (d *DB) Close() { d.pool.Close() }

// tenantSchema converts businessId → "tenant_<sanitized>"
// Matches Bizpark.Commerce TenantDataSourceFactory logic exactly.
func tenantSchema(businessID string) string {
	re := regexp.MustCompile(`[^a-zA-Z0-9]`)
	return "tenant_" + re.ReplaceAllString(businessID, "_")
}

// tbl returns a safely quoted "schema"."table" string.
func tbl(schema, table string) string {
	s := strings.ReplaceAll(schema, `"`, ``)
	t := strings.ReplaceAll(table, `"`, ``)
	return fmt.Sprintf(`"%s"."%s"`, s, t)
}

// ── API Key (public schema) ───────────────────────────────────────────────────

func (d *DB) EnsureApiKeyTable(ctx context.Context) error {
	_, err := d.pool.Exec(ctx, `
		CREATE TABLE IF NOT EXISTS public."McpApiKey" (
			id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
			"businessId" TEXT NOT NULL,
			"keyHash"    TEXT NOT NULL UNIQUE,
			"keyPrefix"  VARCHAR(24) NOT NULL,
			label        VARCHAR(100),
			"lastUsedAt" TIMESTAMPTZ,
			"revokedAt"  TIMESTAMPTZ,
			"createdAt"  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
			"updatedAt"  TIMESTAMPTZ NOT NULL DEFAULT NOW()
		);
		CREATE INDEX IF NOT EXISTS idx_mcp_api_key_business ON public."McpApiKey" ("businessId");
	`)
	return err
}

func (d *DB) ResolveAPIKey(ctx context.Context, rawKey string) (string, error) {
	hash := fmt.Sprintf("%x", sha256.Sum256([]byte(rawKey)))
	var businessID string
	err := d.pool.QueryRow(ctx,
		`SELECT "businessId" FROM public."McpApiKey" WHERE "keyHash"=$1 AND "revokedAt" IS NULL LIMIT 1`,
		hash).Scan(&businessID)
	if err != nil {
		return "", fmt.Errorf("invalid or revoked API key")
	}
	go func() {
		c, cancel := context.WithTimeout(context.Background(), 3*time.Second)
		defer cancel()
		_, _ = d.pool.Exec(c, `UPDATE public."McpApiKey" SET "lastUsedAt"=NOW() WHERE "keyHash"=$1`, hash)
	}()
	return businessID, nil
}

// ── Types ─────────────────────────────────────────────────────────────────────

type Product struct {
	ID          string  `json:"id"`
	Title       string  `json:"title"`
	Description string  `json:"description,omitempty"`
	Price       float64 `json:"price"`
	Currency    string  `json:"currency"`
	CategoryID  *string `json:"categoryId,omitempty"`
	CreatedAt   time.Time `json:"createdAt"`
}

type ProductVariant struct {
	ID         string            `json:"id"`
	Title      string            `json:"title"`
	Attributes map[string]string `json:"attributes,omitempty"`
	Price      *float64          `json:"price,omitempty"`
	SKU        string            `json:"sku"`
	IsActive   bool              `json:"isActive"`
}

type InventoryItem struct {
	SKU               string `json:"sku"`
	AvailableQuantity int    `json:"availableQuantity"`
	ReservedQuantity  int    `json:"reservedQuantity"`
}

type Category struct {
	ID       string `json:"id"`
	Name     string `json:"name"`
	Slug     string `json:"slug"`
	IsActive bool   `json:"isActive"`
}

type OrderItem struct {
	ProductID string  `json:"productId"`
	Title     string  `json:"title"`
	Quantity  int     `json:"quantity"`
	UnitPrice float64 `json:"unitPrice"`
	Subtotal  float64 `json:"subtotal"`
}

type Order struct {
	ID           string      `json:"id"`
	Status       string      `json:"status"`
	TotalAmount  float64     `json:"totalAmount"`
	CustomerName string      `json:"customerName,omitempty"`
	CustomerEmail string     `json:"customerEmail,omitempty"`
	ShippingCity string      `json:"shippingCity,omitempty"`
	Items        []OrderItem `json:"items,omitempty"`
	CreatedAt    time.Time   `json:"createdAt"`
}

type Customer struct {
	ID        string    `json:"id"`
	Email     string    `json:"email"`
	Name      string    `json:"name,omitempty"`
	CreatedAt time.Time `json:"createdAt"`
}

type ShippingMethod struct {
	Code     string  `json:"code"`
	Label    string  `json:"label"`
	FlatRate float64 `json:"flatRate"`
	Currency string  `json:"currency"`
	Active   bool    `json:"active"`
}

type WebsiteConfig struct {
	BusinessName    string `json:"businessName"`
	Tagline         string `json:"tagline,omitempty"`
	PrimaryColor    string `json:"primaryColor"`
	SecondaryColor  string `json:"secondaryColor"`
	Currency        string `json:"currency"`
	Locale          string `json:"locale"`
	IsPublished     bool   `json:"isPublished"`
	ContentRaw      string `json:"content,omitempty"`
}

// ── Products ──────────────────────────────────────────────────────────────────

func (d *DB) ListProducts(ctx context.Context, bizID string, limit int) ([]Product, error) {
	if limit <= 0 || limit > 100 { limit = 20 }
	schema := tenantSchema(bizID)
	rows, err := d.pool.Query(ctx, fmt.Sprintf(`
		SELECT id, title, COALESCE(description,''), price::float8, currency,
		       "categoryId"::text, "createdAt"
		FROM %s WHERE "deletedAt" IS NULL
		ORDER BY "createdAt" DESC LIMIT $1
	`, tbl(schema, "products")), limit)
	if err != nil { return nil, fmt.Errorf("store not activated yet — no products table found") }
	defer rows.Close()
	var out []Product
	for rows.Next() {
		var p Product
		var catID *string
		if err := rows.Scan(&p.ID, &p.Title, &p.Description, &p.Price, &p.Currency, &catID, &p.CreatedAt); err != nil { return nil, err }
		p.CategoryID = catID
		out = append(out, p)
	}
	return out, nil
}

func (d *DB) SearchProducts(ctx context.Context, bizID, keyword string, limit int) ([]Product, error) {
	if limit <= 0 || limit > 50 { limit = 10 }
	schema := tenantSchema(bizID)
	rows, err := d.pool.Query(ctx, fmt.Sprintf(`
		SELECT id, title, COALESCE(description,''), price::float8, currency,
		       "categoryId"::text, "createdAt"
		FROM %s
		WHERE "deletedAt" IS NULL AND (title ILIKE $1 OR description ILIKE $1)
		ORDER BY "createdAt" DESC LIMIT $2
	`, tbl(schema, "products")), "%"+keyword+"%", limit)
	if err != nil { return nil, fmt.Errorf("search failed") }
	defer rows.Close()
	var out []Product
	for rows.Next() {
		var p Product
		var catID *string
		if err := rows.Scan(&p.ID, &p.Title, &p.Description, &p.Price, &p.Currency, &catID, &p.CreatedAt); err != nil { return nil, err }
		p.CategoryID = catID
		out = append(out, p)
	}
	return out, nil
}

func (d *DB) GetProductWithDetails(ctx context.Context, bizID, productID string) (map[string]any, error) {
	schema := tenantSchema(bizID)

	var p Product
	var catID *string
	err := d.pool.QueryRow(ctx, fmt.Sprintf(`
		SELECT id, title, COALESCE(description,''), price::float8, currency, "categoryId"::text, "createdAt"
		FROM %s WHERE id=$1 AND "deletedAt" IS NULL
	`, tbl(schema, "products")), productID).Scan(
		&p.ID, &p.Title, &p.Description, &p.Price, &p.Currency, &catID, &p.CreatedAt)
	if err != nil { return nil, fmt.Errorf("product not found") }
	p.CategoryID = catID

	// Variants
	varRows, _ := d.pool.Query(ctx, fmt.Sprintf(`
		SELECT id, title, attributes::text, price::float8, sku, "isActive"
		FROM %s WHERE "productId"=$1 AND "isActive"=true
	`, tbl(schema, "product_variants")), productID)
	var variants []map[string]any
	if varRows != nil {
		defer varRows.Close()
		for varRows.Next() {
			var id, title, attrs, sku string
			var price *float64
			var active bool
			_ = varRows.Scan(&id, &title, &attrs, &price, &sku, &active)
			variants = append(variants, map[string]any{
				"id": id, "title": title, "attributes": attrs,
				"price": price, "sku": sku,
			})
		}
	}

	// Inventory
	var invRow InventoryItem
	_ = d.pool.QueryRow(ctx, fmt.Sprintf(`
		SELECT sku, "availableQuantity", "reservedQuantity"
		FROM %s WHERE "productId"=$1 AND "variantId" IS NULL LIMIT 1
	`, tbl(schema, "inventory_items")), productID).Scan(
		&invRow.SKU, &invRow.AvailableQuantity, &invRow.ReservedQuantity)

	return map[string]any{
		"product":   p,
		"variants":  variants,
		"inventory": invRow,
	}, nil
}

// ── Inventory ─────────────────────────────────────────────────────────────────

func (d *DB) GetLowStockItems(ctx context.Context, bizID string, threshold int) ([]map[string]any, error) {
	if threshold <= 0 { threshold = 5 }
	schema := tenantSchema(bizID)
	rows, err := d.pool.Query(ctx, fmt.Sprintf(`
		SELECT i.sku, i."availableQuantity", i."reservedQuantity",
		       p.title, p.price::float8
		FROM %s i
		JOIN %s p ON p.id = i."productId" AND p."deletedAt" IS NULL
		WHERE i."availableQuantity" <= $1
		ORDER BY i."availableQuantity" ASC
		LIMIT 20
	`, tbl(schema, "inventory_items"), tbl(schema, "products")), threshold)
	if err != nil { return nil, fmt.Errorf("inventory data not available") }
	defer rows.Close()
	var out []map[string]any
	for rows.Next() {
		var sku, title string
		var avail, reserved int
		var price float64
		_ = rows.Scan(&sku, &avail, &reserved, &title, &price)
		out = append(out, map[string]any{
			"sku": sku, "productTitle": title, "price": price,
			"availableQuantity": avail, "reservedQuantity": reserved,
		})
	}
	return out, nil
}

// ── Categories ────────────────────────────────────────────────────────────────

func (d *DB) ListCategories(ctx context.Context, bizID string) ([]Category, error) {
	schema := tenantSchema(bizID)
	rows, err := d.pool.Query(ctx, fmt.Sprintf(`
		SELECT id, name, slug, "isActive" FROM %s
		WHERE "isActive"=true ORDER BY "sortOrder", name
	`, tbl(schema, "categories")))
	if err != nil { return nil, fmt.Errorf("categories not available") }
	defer rows.Close()
	var out []Category
	for rows.Next() {
		var c Category
		_ = rows.Scan(&c.ID, &c.Name, &c.Slug, &c.IsActive)
		out = append(out, c)
	}
	return out, nil
}

// ── Orders ────────────────────────────────────────────────────────────────────

func (d *DB) ListOrders(ctx context.Context, bizID, status string, limit int) ([]Order, error) {
	if limit <= 0 || limit > 100 { limit = 20 }
	schema := tenantSchema(bizID)

	query := fmt.Sprintf(`
		SELECT o.id, o.status, o."totalAmount"::float8,
		       COALESCE(c.name,''), COALESCE(c.email,''),
		       COALESCE(o."shippingCity",''), o."createdAt"
		FROM %s o
		LEFT JOIN %s c ON c.id = o."customerId"
	`, tbl(schema, "orders"), tbl(schema, "customers"))

	var args []any
	if status != "" {
		query += ` WHERE o.status = $1 ORDER BY o."createdAt" DESC LIMIT $2`
		args = append(args, status, limit)
	} else {
		query += ` ORDER BY o."createdAt" DESC LIMIT $1`
		args = append(args, limit)
	}

	rows, err := d.pool.Query(ctx, query, args...)
	if err != nil { return nil, fmt.Errorf("orders not available") }
	defer rows.Close()
	var out []Order
	for rows.Next() {
		var o Order
		_ = rows.Scan(&o.ID, &o.Status, &o.TotalAmount, &o.CustomerName,
			&o.CustomerEmail, &o.ShippingCity, &o.CreatedAt)
		out = append(out, o)
	}
	return out, nil
}

func (d *DB) GetOrder(ctx context.Context, bizID, orderID string) (*Order, error) {
	schema := tenantSchema(bizID)
	var o Order
	err := d.pool.QueryRow(ctx, fmt.Sprintf(`
		SELECT o.id, o.status, o."totalAmount"::float8,
		       COALESCE(c.name,''), COALESCE(c.email,''),
		       COALESCE(o."shippingCity",''), o."createdAt"
		FROM %s o
		LEFT JOIN %s c ON c.id = o."customerId"
		WHERE o.id = $1
	`, tbl(schema, "orders"), tbl(schema, "customers")), orderID).Scan(
		&o.ID, &o.Status, &o.TotalAmount, &o.CustomerName,
		&o.CustomerEmail, &o.ShippingCity, &o.CreatedAt)
	if err != nil { return nil, fmt.Errorf("order not found") }

	// Items
	itemRows, _ := d.pool.Query(ctx, fmt.Sprintf(`
		SELECT "productId", "unitTitle", quantity, "unitPrice"::float8, subtotal::float8
		FROM %s WHERE "orderId"=$1
	`, tbl(schema, "order_items")), orderID)
	if itemRows != nil {
		defer itemRows.Close()
		for itemRows.Next() {
			var item OrderItem
			_ = itemRows.Scan(&item.ProductID, &item.Title, &item.Quantity, &item.UnitPrice, &item.Subtotal)
			o.Items = append(o.Items, item)
		}
	}
	return &o, nil
}

type OrderStats struct {
	TotalOrders     int     `json:"totalOrders"`
	TotalRevenue    float64 `json:"totalRevenue"`
	PendingOrders   int     `json:"pendingOrders"`
	PaidOrders      int     `json:"paidOrders"`
	FulfilledOrders int     `json:"fulfilledOrders"`
	CancelledOrders int     `json:"cancelledOrders"`
}

func (d *DB) GetOrderStats(ctx context.Context, bizID string) (*OrderStats, error) {
	schema := tenantSchema(bizID)
	var s OrderStats
	err := d.pool.QueryRow(ctx, fmt.Sprintf(`
		SELECT
			COUNT(*)::int,
			COALESCE(SUM("totalAmount"::float8), 0),
			COUNT(*) FILTER (WHERE status='PENDING')::int,
			COUNT(*) FILTER (WHERE status='PAID')::int,
			COUNT(*) FILTER (WHERE status='FULFILLED')::int,
			COUNT(*) FILTER (WHERE status='CANCELLED')::int
		FROM %s
	`, tbl(schema, "orders"))).Scan(
		&s.TotalOrders, &s.TotalRevenue,
		&s.PendingOrders, &s.PaidOrders, &s.FulfilledOrders, &s.CancelledOrders)
	if err != nil { return nil, fmt.Errorf("order stats not available") }
	return &s, nil
}

// ── Customers ─────────────────────────────────────────────────────────────────

func (d *DB) ListCustomers(ctx context.Context, bizID string, limit int) ([]Customer, error) {
	if limit <= 0 || limit > 100 { limit = 20 }
	schema := tenantSchema(bizID)
	rows, err := d.pool.Query(ctx, fmt.Sprintf(`
		SELECT id, email, COALESCE(name,''), "createdAt"
		FROM %s ORDER BY "createdAt" DESC LIMIT $1
	`, tbl(schema, "customers")), limit)
	if err != nil { return nil, fmt.Errorf("customers not available") }
	defer rows.Close()
	var out []Customer
	for rows.Next() {
		var c Customer
		_ = rows.Scan(&c.ID, &c.Email, &c.Name, &c.CreatedAt)
		out = append(out, c)
	}
	return out, nil
}

func (d *DB) GetCustomerCount(ctx context.Context, bizID string) (int, error) {
	schema := tenantSchema(bizID)
	var count int
	err := d.pool.QueryRow(ctx, fmt.Sprintf(`SELECT COUNT(*)::int FROM %s`, tbl(schema, "customers"))).Scan(&count)
	return count, err
}

// ── Store Config ──────────────────────────────────────────────────────────────

func (d *DB) GetWebsiteConfig(ctx context.Context, bizID string) (*WebsiteConfig, error) {
	schema := tenantSchema(bizID)
	var w WebsiteConfig
	err := d.pool.QueryRow(ctx, fmt.Sprintf(`
		SELECT "businessName", COALESCE(tagline,''), "primaryColor", "secondaryColor",
		       currency, locale, "isPublished", COALESCE(content::text,'{}')
		FROM %s ORDER BY "createdAt" DESC LIMIT 1
	`, tbl(schema, "website_config"))).Scan(
		&w.BusinessName, &w.Tagline, &w.PrimaryColor, &w.SecondaryColor,
		&w.Currency, &w.Locale, &w.IsPublished, &w.ContentRaw)
	if err != nil { return nil, fmt.Errorf("store config not found") }
	return &w, nil
}

// ── Shipping ──────────────────────────────────────────────────────────────────

func (d *DB) ListShippingMethods(ctx context.Context, bizID string) ([]ShippingMethod, error) {
	schema := tenantSchema(bizID)
	rows, err := d.pool.Query(ctx, fmt.Sprintf(`
		SELECT code, label, "flatRate"::float8, currency, active
		FROM %s WHERE active=true ORDER BY "flatRate"
	`, tbl(schema, "shipping_methods")))
	if err != nil { return nil, fmt.Errorf("shipping methods not available") }
	defer rows.Close()
	var out []ShippingMethod
	for rows.Next() {
		var s ShippingMethod
		_ = rows.Scan(&s.Code, &s.Label, &s.FlatRate, &s.Currency, &s.Active)
		out = append(out, s)
	}
	return out, nil
}

// ── Store Summary (dashboard) ─────────────────────────────────────────────────

type StoreSummary struct {
	ProductCount int         `json:"productCount"`
	CustomerCount int        `json:"customerCount"`
	Orders       *OrderStats `json:"orders"`
}

func (d *DB) GetStoreSummary(ctx context.Context, bizID string) (*StoreSummary, error) {
	schema := tenantSchema(bizID)

	var productCount, customerCount int
	_ = d.pool.QueryRow(ctx, fmt.Sprintf(
		`SELECT COUNT(*)::int FROM %s WHERE "deletedAt" IS NULL`, tbl(schema, "products")),
	).Scan(&productCount)
	_ = d.pool.QueryRow(ctx, fmt.Sprintf(
		`SELECT COUNT(*)::int FROM %s`, tbl(schema, "customers")),
	).Scan(&customerCount)

	orders, err := d.GetOrderStats(ctx, bizID)
	if err != nil { orders = &OrderStats{} }

	return &StoreSummary{
		ProductCount:  productCount,
		CustomerCount: customerCount,
		Orders:        orders,
	}, nil
}
