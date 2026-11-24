package api

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"os"
	"regexp"
	"strings"
	"time"
)

// releaseCommitItem 单条 Git 提交变更摘要，持久化在通知 payload.release.commits 中。
type releaseCommitItem struct {
	SHA          string `json:"sha"`
	ShortSHA     string `json:"shortSha"`
	Message      string `json:"message"`
	Author       string `json:"author,omitempty"`
	AuthorLogin  string `json:"authorLogin,omitempty"`
	AuthorAvatar string `json:"authorAvatar,omitempty"`
	CommittedAt  string `json:"committedAt,omitempty"`
	URL          string `json:"url,omitempty"`
}

// releaseContributor 本次发布的贡献者摘要（供前端按 GitHub 绑定关系映射为 @工作室成员）。
type releaseContributor struct {
	GithubLogin string `json:"githubLogin,omitempty"`
	Name        string `json:"name,omitempty"`
	Avatar      string `json:"avatar,omitempty"`
	RoleLabel   string `json:"roleLabel,omitempty"`
	Commits     int    `json:"commits,omitempty"`
}

// releaseMeta 发布通知的结构化元信息，供 Orbit 客户端展示更新内容与一键跳转。
type releaseMeta struct {
	AppName      string               `json:"appName"`
	DisplayName  string               `json:"displayName,omitempty"`
	Environment  string               `json:"environment,omitempty"`
	Version      string               `json:"version,omitempty"`
	DockerImage  string               `json:"dockerImage,omitempty"`
	GitHash      string               `json:"gitHash,omitempty"`
	ShortSHA     string               `json:"shortSha,omitempty"`
	Branch       string               `json:"branch,omitempty"`
	Repo         string               `json:"repo,omitempty"`
	CommitTitle  string               `json:"commitTitle,omitempty"`
	CommitBody   string               `json:"commitBody,omitempty"`
	Author       string               `json:"author,omitempty"`
	AuthorLogin  string               `json:"authorLogin,omitempty"`
	AuthorAvatar string               `json:"authorAvatar,omitempty"`
	Proposer     *releaseContributor  `json:"proposer,omitempty"`
	TriggeredBy  string               `json:"triggeredBy,omitempty"`
	AppURL       string               `json:"appUrl,omitempty"`
	CommitURL    string               `json:"commitUrl,omitempty"`
	DevtronURL   string               `json:"devtronUrl,omitempty"`
	FilesChanged int                  `json:"filesChanged,omitempty"`
	Additions    int                  `json:"additions,omitempty"`
	Deletions    int                  `json:"deletions,omitempty"`
	Commits      []releaseCommitItem  `json:"commits,omitempty"`
	Contributors []releaseContributor `json:"contributors,omitempty"`
}

type knownAppSpec struct {
	DisplayName string
	Repo        string
	AppURL      string
}

var knownStudioApps = map[string]knownAppSpec{
	"lec-sso":          {DisplayName: "LecSSO 统一身份", Repo: "lec-org/lec-sso", AppURL: "https://sso.lecspace.top/portal"},
	"lecsso":           {DisplayName: "LecSSO 统一身份", Repo: "lec-org/lec-sso", AppURL: "https://sso.lecspace.top/portal"},
	"lec-doc":          {DisplayName: "LecDoc 乐程云文档", Repo: "lec-org/lec-doc", AppURL: "https://doc.lecspace.top"},
	"lecdoc":           {DisplayName: "LecDoc 乐程云文档", Repo: "lec-org/lec-doc", AppURL: "https://doc.lecspace.top"},
	"lecpunch-api":     {DisplayName: "LecPunch 考勤 API", Repo: "lec-org/LecPunch", AppURL: "https://punch.lecspace.top"},
	"lecpunch-web":     {DisplayName: "LecPunch 考勤前端", Repo: "lec-org/LecPunch", AppURL: "https://punch.lecspace.top"},
	"lec-punch":        {DisplayName: "LecPunch 考勤打卡", Repo: "lec-org/LecPunch", AppURL: "https://punch.lecspace.top"},
	"lec-drive":        {DisplayName: "LecDrive 云盘素材", Repo: "lec-org/lec-drive", AppURL: "https://drive.lecspace.top"},
	"lec-oj":           {DisplayName: "LecOJ 在线判题", Repo: "lec-org/lec-oj", AppURL: "https://code.lecspace.top"},
	"lec-oj-judge":     {DisplayName: "LecOJ 判题评测机", Repo: "lec-org/lec-oj", AppURL: "https://code.lecspace.top"},
	"lec-website":      {DisplayName: "乐程工作室官网", Repo: "lec-org/LEC-Official-Website", AppURL: "https://lecspace.top"},
	"lec-orbit":        {DisplayName: "Orbit 伴程", Repo: "lec-org/lec-orbit", AppURL: "https://lec-org.github.io/lec-orbit/"},
	"lec-orbit-server": {DisplayName: "Orbit 服务端", Repo: "lec-org/lec-orbit", AppURL: "https://lec-org.github.io/lec-orbit/"},
	"orbit":            {DisplayName: "Orbit 伴程", Repo: "lec-org/lec-orbit", AppURL: "https://lec-org.github.io/lec-orbit/"},
	"lec-blog":         {DisplayName: "乐程博客", Repo: "lec-org/lec-blog", AppURL: ""},
}

var versionSHARegex = regexp.MustCompile(`^([0-9a-fA-F]{7,40})(?:[-_].*)?$`)
var coAuthorRegex = regexp.MustCompile(`(?im)^co-authored-by:\s*([^<\r\n]+?)(?:\s*<([^>\r\n]+)>)?\s*$`)
var githubNoreplyRegex = regexp.MustCompile(`^(?:\d+\+)?([^@]+)@users\.noreply\.github\.com$`)

func firstNonEmptyString(sources []map[string]any, keys ...string) string {
	for _, src := range sources {
		if src == nil {
			continue
		}
		for _, k := range keys {
			if v, ok := src[k].(string); ok {
				if trimmed := strings.TrimSpace(v); trimmed != "" {
					return trimmed
				}
			}
		}
	}
	return ""
}

func extractSHAFromVersion(version string) string {
	trimmed := strings.TrimSpace(version)
	if trimmed == "" {
		return ""
	}
	// 处理形如 registry/repo:89a4662f-1-56 的完整镜像地址
	if idx := strings.LastIndex(trimmed, ":"); idx >= 0 && idx+1 < len(trimmed) {
		trimmed = trimmed[idx+1:]
	}
	matches := versionSHARegex.FindStringSubmatch(trimmed)
	if len(matches) >= 2 {
		return strings.ToLower(matches[1])
	}
	return ""
}

func splitCommitMessage(msg string) (string, string) {
	normalized := strings.ReplaceAll(strings.TrimSpace(msg), "\r\n", "\n")
	if normalized == "" {
		return "", ""
	}
	parts := strings.SplitN(normalized, "\n", 2)
	title := strings.TrimSpace(parts[0])
	body := ""
	if len(parts) > 1 {
		body = strings.TrimSpace(parts[1])
	}
	return title, body
}

// buildReleaseMeta 从 Devtron webhook 原始负载中提取结构化发布信息；如配置了 GITHUB_TOKEN 且缺失提交说明，尝试拉取 GitHub Commit 详情。
func buildReleaseMeta(ctx context.Context, raw map[string]any) (releaseMeta, string) {
	nestedPayload, _ := raw["payload"].(map[string]any)
	sources := []map[string]any{raw, nestedPayload}

	appName := firstNonEmptyString(sources, "appName", "app_name", "application")
	if appName == "" {
		appName = "studio-app"
	}
	spec, hasSpec := knownStudioApps[strings.ToLower(appName)]

	version := firstNonEmptyString(sources, "version", "imageTag", "tag")
	dockerImage := firstNonEmptyString(sources, "dockerImage", "dockerImageUrl", "image")
	if version == "" && dockerImage != "" {
		if idx := strings.LastIndex(dockerImage, ":"); idx >= 0 && idx+1 < len(dockerImage) {
			version = dockerImage[idx+1:]
		}
	}

	gitHash := firstNonEmptyString(sources, "gitHash", "commitHash", "commitSha", "sha")
	if gitHash == "" {
		gitHash = extractSHAFromVersion(version)
	}
	shortSHA := gitHash
	if len(shortSHA) > 8 {
		shortSHA = shortSHA[:8]
	}

	repo := firstNonEmptyString(sources, "repo", "repository")
	if repo == "" && hasSpec {
		repo = spec.Repo
	}

	appURL := firstNonEmptyString(sources, "appUrl", "appURL", "url")
	if appURL == "" && hasSpec {
		appURL = spec.AppURL
	}

	devtronURL := firstNonEmptyString(sources, "devtronUrl", "devtronURL", "appDetailLink", "cdPipelineLink")
	if devtronURL == "" {
		devtronURL = "https://devtron.lecspace.top/dashboard/app/list"
	}

	commitMsg := firstNonEmptyString(sources, "commitMessage", "commit_message", "changelog", "releaseNotes")
	commitTitle, commitBody := splitCommitMessage(commitMsg)

	meta := releaseMeta{
		AppName:      appName,
		DisplayName:  spec.DisplayName,
		Environment:  firstNonEmptyString(sources, "envName", "environment", "env"),
		Version:      version,
		DockerImage:  dockerImage,
		GitHash:      gitHash,
		ShortSHA:     shortSHA,
		Branch:       firstNonEmptyString(sources, "branch", "gitBranch"),
		Repo:         repo,
		CommitTitle:  commitTitle,
		CommitBody:   commitBody,
		Author:       firstNonEmptyString(sources, "author", "commitAuthor", "committer"),
		AuthorLogin:  firstNonEmptyString(sources, "authorLogin", "githubLogin", "author_login"),
		AuthorAvatar: firstNonEmptyString(sources, "authorAvatar", "author_avatar"),
		TriggeredBy:  firstNonEmptyString(sources, "triggeredBy", "triggered_by"),
		AppURL:       appURL,
		DevtronURL:   devtronURL,
	}
	if proposerName := firstNonEmptyString(sources, "proposer", "requestedBy", "requested_by"); proposerName != "" {
		meta.Proposer = &releaseContributor{
			GithubLogin: firstNonEmptyString(sources, "proposerLogin", "requestedByLogin"),
			Name:        proposerName,
			RoleLabel:   "需求提出",
		}
	}
	if meta.Environment == "" {
		meta.Environment = "校园生产环境"
	}
	if meta.Repo != "" && meta.GitHash != "" {
		meta.CommitURL = fmt.Sprintf("https://github.com/%s/commit/%s", meta.Repo, meta.GitHash)
	}

	// 若 payload 携带 commits 数组则直接提取
	if rawCommits, ok := raw["commits"].([]any); ok {
		for _, entry := range rawCommits {
			m, ok := entry.(map[string]any)
			if !ok {
				continue
			}
			sha := firstNonEmptyString([]map[string]any{m}, "sha", "id", "hash")
			msg := firstNonEmptyString([]map[string]any{m}, "message", "title")
			if msg == "" && sha == "" {
				continue
			}
			short := sha
			if len(short) > 8 {
				short = short[:8]
			}
			itemURL := firstNonEmptyString([]map[string]any{m}, "url")
			if itemURL == "" && meta.Repo != "" && sha != "" {
				itemURL = fmt.Sprintf("https://github.com/%s/commit/%s", meta.Repo, sha)
			}
			meta.Commits = append(meta.Commits, releaseCommitItem{
				SHA:          sha,
				ShortSHA:     short,
				Message:      msg,
				Author:       firstNonEmptyString([]map[string]any{m}, "author", "authorName"),
				AuthorLogin:  firstNonEmptyString([]map[string]any{m}, "authorLogin", "githubLogin", "login"),
				AuthorAvatar: firstNonEmptyString([]map[string]any{m}, "authorAvatar", "avatar"),
				CommittedAt:  firstNonEmptyString([]map[string]any{m}, "committedAt", "timestamp", "date"),
				URL:          itemURL,
			})
		}
		if meta.CommitTitle == "" && len(meta.Commits) > 0 {
			meta.CommitTitle, meta.CommitBody = splitCommitMessage(meta.Commits[0].Message)
			if meta.Author == "" {
				meta.Author = meta.Commits[0].Author
			}
			if meta.AuthorLogin == "" {
				meta.AuthorLogin = meta.Commits[0].AuthorLogin
			}
		}
	}

	// 若仍缺少提交说明且配置了 GITHUB_TOKEN，尝试在 4 秒超时内从 GitHub API 补全提交摘要与变更统计
	if meta.CommitTitle == "" && meta.Repo != "" && meta.GitHash != "" {
		if ghToken := strings.TrimSpace(os.Getenv("GITHUB_TOKEN")); ghToken != "" {
			enrichReleaseFromGitHub(ctx, &meta, ghToken)
		}
	}

	// 汇总贡献者列表（按 GitHub login 优先去重）
	meta.Contributors = aggregateReleaseContributors(&meta)

	// 生成可读的通知正文：优先展示真实更新说明，其次使用传入的 summary/message
	summary := firstNonEmptyString(sources, "summary", "message")
	if meta.CommitTitle != "" {
		if meta.Author != "" {
			summary = fmt.Sprintf("更新内容：%s（提交者：%s）", meta.CommitTitle, meta.Author)
		} else {
			summary = fmt.Sprintf("更新内容：%s", meta.CommitTitle)
		}
	} else if summary == "" {
		if meta.Version != "" {
			summary = fmt.Sprintf("%s 已完成新一轮%s发布（镜像版本 %s）。", appName, meta.Environment, meta.Version)
		} else {
			summary = fmt.Sprintf("%s 已完成新一轮%s发布上线。", appName, meta.Environment)
		}
	}

	return meta, summary
}

func enrichReleaseFromGitHub(parentCtx context.Context, meta *releaseMeta, token string) {
	ctx, cancel := context.WithTimeout(parentCtx, 4*time.Second)
	defer cancel()

	apiURL := fmt.Sprintf("https://api.github.com/repos/%s/commits/%s", meta.Repo, meta.GitHash)
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, apiURL, nil)
	if err != nil {
		return
	}
	req.Header.Set("Accept", "application/vnd.github+json")
	req.Header.Set("Authorization", "Bearer "+token)
	req.Header.Set("User-Agent", "lec-orbit-server")

	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		return
	}

	var gh struct {
		SHA     string `json:"sha"`
		HTMLURL string `json:"html_url"`
		Commit  struct {
			Message string `json:"message"`
			Author  struct {
				Name string `json:"name"`
				Date string `json:"date"`
			} `json:"author"`
		} `json:"commit"`
		Author struct {
			Login     string `json:"login"`
			AvatarURL string `json:"avatar_url"`
		} `json:"author"`
		Stats struct {
			Additions int `json:"additions"`
			Deletions int `json:"deletions"`
		} `json:"stats"`
		Files []struct {
			Filename string `json:"filename"`
		} `json:"files"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&gh); err != nil {
		return
	}

	if gh.SHA != "" {
		meta.GitHash = gh.SHA
		if len(gh.SHA) >= 8 {
			meta.ShortSHA = gh.SHA[:8]
		}
	}
	if gh.HTMLURL != "" {
		meta.CommitURL = gh.HTMLURL
	}
	title, body := splitCommitMessage(gh.Commit.Message)
	meta.CommitTitle = title
	meta.CommitBody = body
	if gh.Author.Login != "" {
		meta.AuthorLogin = gh.Author.Login
		meta.AuthorAvatar = gh.Author.AvatarURL
	}
	if gh.Commit.Author.Name != "" {
		meta.Author = gh.Commit.Author.Name
	} else if gh.Author.Login != "" {
		meta.Author = gh.Author.Login
	}
	meta.FilesChanged = len(gh.Files)
	meta.Additions = gh.Stats.Additions
	meta.Deletions = gh.Stats.Deletions
	if title != "" && len(meta.Commits) == 0 {
		meta.Commits = []releaseCommitItem{{
			SHA:          meta.GitHash,
			ShortSHA:     meta.ShortSHA,
			Message:      gh.Commit.Message,
			Author:       meta.Author,
			AuthorLogin:  meta.AuthorLogin,
			AuthorAvatar: meta.AuthorAvatar,
			CommittedAt:  gh.Commit.Author.Date,
			URL:          meta.CommitURL,
		}}
	}
}

func aggregateReleaseContributors(meta *releaseMeta) []releaseContributor {
	index := map[string]int{}
	out := make([]releaseContributor, 0)
	add := func(login, name, avatar string) {
		login = strings.TrimSpace(login)
		name = strings.TrimSpace(name)
		key := strings.ToLower(login)
		if key == "" {
			key = strings.ToLower(name)
		}
		if key == "" {
			return
		}
		if pos, exists := index[key]; exists {
			out[pos].Commits++
			if out[pos].GithubLogin == "" && login != "" {
				out[pos].GithubLogin = login
			}
			if out[pos].Name == "" && name != "" {
				out[pos].Name = name
			}
			if out[pos].Avatar == "" && avatar != "" {
				out[pos].Avatar = avatar
			}
			return
		}
		index[key] = len(out)
		out = append(out, releaseContributor{
			GithubLogin: login,
			Name:        name,
			Avatar:      avatar,
			Commits:     1,
		})
	}

	for _, c := range meta.Commits {
		add(c.AuthorLogin, c.Author, c.AuthorAvatar)
		// 解析 Git 标准 Co-authored-by 署名，支持多人协作提交归属
		for _, match := range coAuthorRegex.FindAllStringSubmatch(c.Message, -1) {
			coName := strings.TrimSpace(match[1])
			coLogin := ""
			if len(match) >= 3 {
				if m := githubNoreplyRegex.FindStringSubmatch(strings.TrimSpace(match[2])); len(m) >= 2 {
					coLogin = strings.TrimSpace(m[1])
				}
			}
			add(coLogin, coName, "")
		}
	}
	if len(out) == 0 {
		add(meta.AuthorLogin, meta.Author, meta.AuthorAvatar)
		for _, match := range coAuthorRegex.FindAllStringSubmatch(meta.CommitBody, -1) {
			coName := strings.TrimSpace(match[1])
			coLogin := ""
			if len(match) >= 3 {
				if m := githubNoreplyRegex.FindStringSubmatch(strings.TrimSpace(match[2])); len(m) >= 2 {
					coLogin = strings.TrimSpace(m[1])
				}
			}
			add(coLogin, coName, "")
		}
	}
	return out
}
