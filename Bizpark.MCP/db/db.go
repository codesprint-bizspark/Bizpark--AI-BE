package db

import (
	"context"
	"crypto/sha256"
	"fmt"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
)

type DB struct {
	pool *pgxpool.Pool
}

func New(ctx context.Context, databaseURL string) (*DB, error) {
	pool, err := pgxpool.New(ctx, databaseURL)
	if err != nil {
		return nil, fmt.Errorf("db connect: %w", err)
	}
	if err := pool.Ping(ctx); err != nil {
		return nil, fmt.Errorf("db ping: %w", err)
	}
	return &DB{pool: pool}, nil
}

func (d *DB) Close() {
	d.pool.Close()
}

// ResolveAPIKey validates an API key and returns the businessId it belongs to.
// Also updates lastUsedAt for audit purposes.
func (d *DB) ResolveAPIKey(ctx context.Context, rawKey string) (string, error) {
	hash := fmt.Sprintf("%x", sha256.Sum256([]byte(rawKey)))

	var businessID string
	err := d.pool.QueryRow(ctx, `
		SELECT "businessId" FROM api."McpApiKey"
		WHERE "keyHash" = $1 AND "revokedAt" IS NULL
		LIMIT 1
	`, hash).Scan(&businessID)
	if err != nil {
		return "", fmt.Errorf("invalid or revoked API key")
	}

	// Fire-and-forget lastUsedAt update
	go func() {
		ctx2, cancel := context.WithTimeout(context.Background(), 3*time.Second)
		defer cancel()
		_, _ = d.pool.Exec(ctx2, `
			UPDATE api."McpApiKey" SET "lastUsedAt" = NOW() WHERE "keyHash" = $1
		`, hash)
	}()

	return businessID, nil
}

type Business struct {
	ID          string
	Name        string
	Category    string
	Description string
}

func (d *DB) GetBusiness(ctx context.Context, businessID string) (*Business, error) {
	var b Business
	err := d.pool.QueryRow(ctx, `
		SELECT id, name, COALESCE(category,''), COALESCE(description,'')
		FROM api."businesses"
		WHERE id = $1
		LIMIT 1
	`, businessID).Scan(&b.ID, &b.Name, &b.Category, &b.Description)
	if err != nil {
		return nil, fmt.Errorf("business not found")
	}
	return &b, nil
}

type SocialPost struct {
	ID         string
	Platform   string
	PostType   string
	Status     string
	Caption    string
	ScheduledAt *time.Time
	PublishedAt *time.Time
	ExternalURL string
}

func (d *DB) ListSocialPosts(ctx context.Context, businessID, status string, limit int) ([]SocialPost, error) {
	if limit <= 0 || limit > 100 {
		limit = 20
	}

	query := `
		SELECT id, platform::text, "postType"::text, status::text,
		       COALESCE(caption,''), "scheduledAt", "publishedAt",
		       COALESCE("externalPostUrl",'')
		FROM api."SocialPost"
		WHERE "businessId" = $1 AND "deletedAt" IS NULL
	`
	args := []any{businessID}

	if status != "" {
		query += ` AND status::text = $2`
		args = append(args, status)
		query += ` ORDER BY "createdAt" DESC LIMIT $3`
		args = append(args, limit)
	} else {
		query += ` ORDER BY "createdAt" DESC LIMIT $2`
		args = append(args, limit)
	}

	rows, err := d.pool.Query(ctx, query, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var posts []SocialPost
	for rows.Next() {
		var p SocialPost
		if err := rows.Scan(&p.ID, &p.Platform, &p.PostType, &p.Status,
			&p.Caption, &p.ScheduledAt, &p.PublishedAt, &p.ExternalURL); err != nil {
			return nil, err
		}
		posts = append(posts, p)
	}
	return posts, nil
}

type Review struct {
	ID          string
	Rating      int
	Reviewer    string
	Comment     string
	Status      string
	AIReply     string
	GoogleReply string
}

func (d *DB) ListReviews(ctx context.Context, businessID string, limit int) ([]Review, error) {
	if limit <= 0 || limit > 100 {
		limit = 20
	}
	rows, err := d.pool.Query(ctx, `
		SELECT id, rating, COALESCE("reviewerDisplayName",'Anonymous'),
		       COALESCE(comment,''), status,
		       COALESCE("aiReply",''), COALESCE("googleReply",'')
		FROM api."GoogleBusinessReview"
		WHERE "businessId" = $1
		ORDER BY "reviewCreateTime" DESC
		LIMIT $2
	`, businessID, limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var reviews []Review
	for rows.Next() {
		var r Review
		if err := rows.Scan(&r.ID, &r.Rating, &r.Reviewer, &r.Comment,
			&r.Status, &r.AIReply, &r.GoogleReply); err != nil {
			return nil, err
		}
		reviews = append(reviews, r)
	}
	return reviews, nil
}

type WebsiteData struct {
	Status  string
	CmsData map[string]any
}

func (d *DB) GetWebsite(ctx context.Context, businessID string) (*WebsiteData, error) {
	var w WebsiteData
	var cmsRaw []byte
	err := d.pool.QueryRow(ctx, `
		SELECT status::text, COALESCE("cmsData"::text, '{}')
		FROM api."Website"
		WHERE "businessId" = $1
		ORDER BY "createdAt" DESC
		LIMIT 1
	`, businessID).Scan(&w.Status, &cmsRaw)
	if err != nil {
		return nil, fmt.Errorf("no website found")
	}
	w.CmsData = map[string]any{"raw": string(cmsRaw)}
	return &w, nil
}

type SocialAccount struct {
	Platform string
	Status   string
	Username string
}

func (d *DB) ListSocialAccounts(ctx context.Context, businessID string) ([]SocialAccount, error) {
	rows, err := d.pool.Query(ctx, `
		SELECT platform::text, status::text, COALESCE(username,'')
		FROM api."SocialAccount"
		WHERE "businessId" = $1 AND "deletedAt" IS NULL
	`, businessID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var accounts []SocialAccount
	for rows.Next() {
		var a SocialAccount
		if err := rows.Scan(&a.Platform, &a.Status, &a.Username); err != nil {
			return nil, err
		}
		accounts = append(accounts, a)
	}
	return accounts, nil
}
