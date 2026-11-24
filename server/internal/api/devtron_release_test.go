package api

import (
	"context"
	"testing"
)

func TestBuildReleaseMetaContributorsAndCoAuthors(t *testing.T) {
	raw := map[string]any{
		"appName":       "lec-sso",
		"version":       "748e4b80-1-58",
		"proposer":      "陈信豪",
		"proposerLogin": "Apries406",
		"commits": []any{
			map[string]any{
				"sha":         "748e4b801234567890",
				"message":     "feat(core): 新增工作室成员公开名片\n\nCo-authored-by: Bob <12345+bob-dev@users.noreply.github.com>",
				"author":      "Apries406",
				"authorLogin": "Apries406",
			},
			map[string]any{
				"sha":         "50d439201234567890",
				"message":     "feat(portal): 返回第三方绑定用户名",
				"author":      "Apries406",
				"authorLogin": "Apries406",
			},
		},
	}

	meta, summary := buildReleaseMeta(context.Background(), raw)
	if meta.ShortSHA != "748e4b80" {
		t.Fatalf("expected ShortSHA 748e4b80, got %q", meta.ShortSHA)
	}
	if meta.Repo != "lec-org/lec-sso" {
		t.Fatalf("expected repo lec-org/lec-sso, got %q", meta.Repo)
	}
	if meta.Proposer == nil || meta.Proposer.GithubLogin != "Apries406" {
		t.Fatalf("expected proposer Apries406, got %+v", meta.Proposer)
	}
	if len(meta.Contributors) != 2 {
		t.Fatalf("expected 2 contributors, got %d (%+v)", len(meta.Contributors), meta.Contributors)
	}
	if meta.Contributors[0].GithubLogin != "Apries406" || meta.Contributors[0].Commits != 2 {
		t.Fatalf("expected first contributor Apries406 with 2 commits, got %+v", meta.Contributors[0])
	}
	if meta.Contributors[1].GithubLogin != "bob-dev" || meta.Contributors[1].Name != "Bob" {
		t.Fatalf("expected second contributor bob-dev (Bob), got %+v", meta.Contributors[1])
	}
	if summary == "" {
		t.Fatalf("expected non-empty summary")
	}
}
