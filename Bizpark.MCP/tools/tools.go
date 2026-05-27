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

func Register(s *server.MCPServer, database *db.DB) {
	registerOverview(s, database)
	registerSocialPosts(s, database)
	registerReviews(s, database)
	registerWebsite(s, database)
	registerSocialAccounts(s, database)
}

// ── Business Overview ────────────────────────────────────────────────────────

func registerOverview(s *server.MCPServer, database *db.DB) {
	tool := mcp.NewTool("get_business_overview",
		mcp.WithDescription("Get an overview of the business: name, category, description, and connected social accounts."),
	)
	s.AddTool(tool, func(ctx context.Context, req mcp.CallToolRequest) (*mcp.CallToolResult, error) {
		bizID, err := getBusinessID(ctx)
		if err != nil {
			return mcp.NewToolResultError(err.Error()), nil
		}

		biz, err := database.GetBusiness(ctx, bizID)
		if err != nil {
			return mcp.NewToolResultError(err.Error()), nil
		}

		accounts, _ := database.ListSocialAccounts(ctx, bizID)

		result := map[string]any{
			"id":          biz.ID,
			"name":        biz.Name,
			"category":    biz.Category,
			"description": biz.Description,
			"socialAccounts": accounts,
		}
		return mcp.NewToolResultText(mustJSON(result)), nil
	})
}

// ── Social Posts ─────────────────────────────────────────────────────────────

func registerSocialPosts(s *server.MCPServer, database *db.DB) {
	tool := mcp.NewTool("list_social_posts",
		mcp.WithDescription("List social media posts for the business. Filter by status: DRAFT, SCHEDULED, PUBLISHED, FAILED. Default returns 20 most recent."),
		mcp.WithString("status",
			mcp.Description("Filter by post status: DRAFT, SCHEDULED, PUBLISHED, FAILED, CANCELLED. Leave empty for all."),
		),
		mcp.WithString("limit",
			mcp.Description("Number of posts to return (max 100, default 20)."),
		),
	)
	s.AddTool(tool, func(ctx context.Context, req mcp.CallToolRequest) (*mcp.CallToolResult, error) {
		bizID, err := getBusinessID(ctx)
		if err != nil {
			return mcp.NewToolResultError(err.Error()), nil
		}

		status, _ := req.Params.Arguments["status"].(string)
		limitStr, _ := req.Params.Arguments["limit"].(string)
		limit, _ := strconv.Atoi(limitStr)

		posts, err := database.ListSocialPosts(ctx, bizID, status, limit)
		if err != nil {
			return mcp.NewToolResultError(fmt.Sprintf("Failed to fetch posts: %v", err)), nil
		}
		if len(posts) == 0 {
			return mcp.NewToolResultText("No posts found."), nil
		}
		return mcp.NewToolResultText(mustJSON(posts)), nil
	})
}

// ── Google Reviews ───────────────────────────────────────────────────────────

func registerReviews(s *server.MCPServer, database *db.DB) {
	tool := mcp.NewTool("list_google_reviews",
		mcp.WithDescription("List Google Business reviews for the business, including AI-generated replies and their approval status."),
		mcp.WithString("limit",
			mcp.Description("Number of reviews to return (max 100, default 20)."),
		),
	)
	s.AddTool(tool, func(ctx context.Context, req mcp.CallToolRequest) (*mcp.CallToolResult, error) {
		bizID, err := getBusinessID(ctx)
		if err != nil {
			return mcp.NewToolResultError(err.Error()), nil
		}

		limitStr, _ := req.Params.Arguments["limit"].(string)
		limit, _ := strconv.Atoi(limitStr)

		reviews, err := database.ListReviews(ctx, bizID, limit)
		if err != nil {
			return mcp.NewToolResultError(fmt.Sprintf("Failed to fetch reviews: %v", err)), nil
		}
		if len(reviews) == 0 {
			return mcp.NewToolResultText("No reviews found."), nil
		}
		return mcp.NewToolResultText(mustJSON(reviews)), nil
	})
}

// ── Website ──────────────────────────────────────────────────────────────────

func registerWebsite(s *server.MCPServer, database *db.DB) {
	tool := mcp.NewTool("get_website_data",
		mcp.WithDescription("Get the business website status and CMS content (hero text, about section, SEO, features, etc.)."),
	)
	s.AddTool(tool, func(ctx context.Context, req mcp.CallToolRequest) (*mcp.CallToolResult, error) {
		bizID, err := getBusinessID(ctx)
		if err != nil {
			return mcp.NewToolResultError(err.Error()), nil
		}

		website, err := database.GetWebsite(ctx, bizID)
		if err != nil {
			return mcp.NewToolResultText("No website generated yet for this business."), nil
		}
		return mcp.NewToolResultText(mustJSON(website)), nil
	})
}

// ── Social Accounts ──────────────────────────────────────────────────────────

func registerSocialAccounts(s *server.MCPServer, database *db.DB) {
	tool := mcp.NewTool("list_social_accounts",
		mcp.WithDescription("List connected social media accounts (Facebook, Instagram, TikTok) and their connection status."),
	)
	s.AddTool(tool, func(ctx context.Context, req mcp.CallToolRequest) (*mcp.CallToolResult, error) {
		bizID, err := getBusinessID(ctx)
		if err != nil {
			return mcp.NewToolResultError(err.Error()), nil
		}

		accounts, err := database.ListSocialAccounts(ctx, bizID)
		if err != nil {
			return mcp.NewToolResultError(fmt.Sprintf("Failed to fetch accounts: %v", err)), nil
		}
		if len(accounts) == 0 {
			return mcp.NewToolResultText("No social accounts connected."), nil
		}
		return mcp.NewToolResultText(mustJSON(accounts)), nil
	})
}
