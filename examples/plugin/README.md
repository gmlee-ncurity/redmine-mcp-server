# 플러그인으로 배포하기 (stdio + userConfig)

Claude Code 플러그인이 이 MCP 서버를 stdio로 띄우고, Redmine API 키는 사용자마다
**설치 시점에 입력받는** 구성이다. HTTP transport에 필요한 인증서·DNS·리버스
프록시·OAuth가 전부 필요 없다.

사용자 입장의 절차는 **플러그인 설치 → API 키 입력**이 전부다. 셸 프로파일 편집도,
Claude Code 재시작도 없다.

## 파일

| 파일 | 플러그인 내 위치 |
|---|---|
| [`plugin.json`](plugin.json) | `.claude-plugin/plugin.json` 의 `userConfig` 부분 |
| [`.mcp.json`](.mcp.json) | 플러그인 루트의 `.mcp.json` |

`sensitive: true`이므로 입력이 마스킹되고, 값은 `settings.json`이 아니라 시스템
키체인(키체인이 없는 플랫폼에서는 `~/.claude/.credentials.json`)에 저장된다.
`.mcp.json`의 `env`에서 `${user_config.redmine_api_key}`로 참조한다.

`required: true`를 유지할 것. 키가 비면 서버가 설정 검증에서 종료하는데, 그게
사용자에게는 원인을 알기 어려운 서버 연결 실패로만 보인다.

## 확인된 동작

이 저장소의 1.3.0 빌드를 stdio로 직접 띄워 검증했다.

- `initialize` 핸드셰이크 정상 (protocol 2025-06-18)
- `tools/list` → 33개 툴
- `REDMINE_API_KEY`가 실제로 요청에 실림 — 잘못된 키로는 401, 정상 키로는 조회 성공
- `REDMINE_URL`도 env로 그대로 전달됨

## 버전 핀

예시는 `@1.3.0`으로 고정돼 있다. 버전을 빼면 `npx`가 매번 최신을 끌어오므로,
의도치 않은 업데이트를 막으려면 핀을 유지하고 올릴 때 플러그인을 갱신한다.

> **주의**: 현재 npm 레지스트리의 `@gmlee-ncurity/mcp-server-redmine`는 latest가
> 1.0.2다. 1.3.0을 핀으로 쓰려면 **먼저 1.3.0을 배포해야 한다.** 배포 전에는
> `npx`가 해당 버전을 찾지 못해 서버가 뜨지 않는다.

## npm에 의존하고 싶지 않다면

패키지를 플러그인에 동봉하고 `.mcp.json`을 아래처럼 바꾼다. 레지스트리 접근과
`npx` 해석 지연이 모두 사라진다.

```json
{
  "mcpServers": {
    "redmine": {
      "command": "node",
      "args": ["${CLAUDE_PLUGIN_ROOT}/server/dist/index.js"],
      "env": {
        "REDMINE_URL": "https://space.ncurity.com",
        "REDMINE_API_KEY": "${user_config.redmine_api_key}"
      }
    }
  }
}
```

## 확인이 필요한 것

`userConfig`를 지원하는 **Claude Code 최소 버전**은 확인하지 않았다. 사내 사용자
버전이 제각각이라면 배포 전에 확인할 것. 지원되지 않는 버전에서는
`${user_config.*}`가 치환되지 않고 문자열 그대로 전달되어, API 키가 잘못된 값으로
넘어간 것처럼 보인다.

## 배경

이 방식을 고른 이유와 HTTP transport를 택했을 때의 선택지는
[docs/DEPLOYMENT-OPTIONS.md](../../docs/DEPLOYMENT-OPTIONS.md)에 정리돼 있다.
