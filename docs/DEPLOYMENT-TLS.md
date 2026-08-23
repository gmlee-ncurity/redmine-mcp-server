# HTTPS 배포 및 기존 평문 서버 폐기(deprecate) 절차

## 배경

Claude Code는 OAuth 토큰 교환(`POST /token`)을 **TLS 위에서만** 수행한다. 루프백
(`localhost` / `127.0.0.1` / `::1`)만 예외다. 따라서 issuer가 평문 HTTP + 비루프백
주소로 광고되면 브라우저 인증까지는 성공하고 토큰 교환 단계에서 다음과 같이 끊긴다.

```
Refusing to send credentials to non-https token endpoint
'http://192.168.71.103:3000/token'.
```

현행 운영 서버(192.168.71.103:3000)가 정확히 이 상태다.

```console
$ curl -s http://192.168.71.103:3000/.well-known/oauth-authorization-server
{"issuer":"http://192.168.71.103:3000/", ...,
 "token_endpoint":"http://192.168.71.103:3000/token", ...}
```

`issuer`는 코드에 박힌 값이 아니라 `MCP_ISSUER_URL` 환경변수를 그대로 쓴다
([src/transport/http.ts](../src/transport/http.ts) 참조). 즉 서버 설정 문제이며,
클라이언트 측 우회 대상이 아니다.

> **현행 서버는 SDK 가드를 우회한 상태다.**
> `@modelcontextprotocol/sdk`의 `mcpAuthRouter`는 https가 아닌 issuer에 대해
> `Issuer URL must be HTTPS`를 던진다(루프백만 예외). 이 검사는 lockfile에
> 고정된 1.29.0을 포함해 오래전부터 있었고, 유일한 예외는 환경변수
> `MCP_DANGEROUSLY_ALLOW_INSECURE_ISSUER_URL=true`다. 현행 서버가 http issuer로
> 정상 기동 중이라는 것은 이 플래그가 켜져 있다는 뜻이다. 서버 측 가드를 끈 결과
> 실패 지점이 클라이언트로 밀린 것뿐이다.
> **신규 스택에는 절대 설정하지 말 것.**

목표 구성:

```
[Claude Code] --HTTPS--> [nginx :443] --HTTP--> [redmine-mcp-tls 127.0.0.1:3001]
```

## 이행 원칙: 무중단 병렬 운영

기존 서버를 **건드리지 않은 채** 새 스택을 옆에 띄우고, 검증 후 클라이언트를 옮기고,
마지막에 기존 서버를 내린다. 사용 중인 사용자가 있으므로 in-place 변경은 하지 않는다.

| | 기존(blue) | 신규(green) |
|---|---|---|
| 경로 | `/home/redmine-mcp-server` | `/home/redmine-mcp-tls` |
| compose 프로젝트 | `redmine-mcp-server` | `redmine-mcp-tls` |
| 포트 | `0.0.0.0:3000` | `127.0.0.1:3001` (nginx 경유 443) |
| issuer | `http://192.168.71.103:3000` | `https://mcp.ncurity.com` |
| 볼륨 | `redmine-mcp-server_mcp-data` | `redmine-mcp-tls-data` |

> **경고 — 볼륨을 공유하지 말 것.**
> [src/auth/store.ts](../src/auth/store.ts)는 `oauth-store.json` 전체를 메모리에 올린 뒤
> 통째로 덮어쓴다. 두 인스턴스가 같은 파일을 가리키면 서로의 토큰을 지운다.
> 어차피 issuer가 바뀌면 클라이언트는 재등록·재로그인해야 하므로 공유할 이유도 없다.

---

## 1. DNS

내부 DNS(또는 split-horizon 존)에 A 레코드를 추가한다.

```
mcp.ncurity.com.  A  192.168.71.103
```

`space.ncurity.com`은 공인 IP(211.177.120.91)로 이미 떠 있지만 `mcp.ncurity.com`은
현재 어디에도 없다. 2번의 DNS-01 인증서 발급은 **공인 존의 TXT 레코드**를 사용하므로,
A 레코드가 사설 IP를 가리켜도(또는 내부 DNS에만 존재해도) 발급에는 지장이 없다.

## 2. 인증서

사설 IP라 HTTP-01 챌린지는 쓸 수 없다. **DNS-01**로 발급한다.

```bash
certbot certonly --manual --preferred-challenges dns -d mcp.ncurity.com
```

출력되는 `_acme-challenge.mcp.ncurity.com` TXT 레코드를 공인 존에 등록한 뒤 진행한다.

> `--manual`은 자동 갱신이 안 된다. 90일마다 수작업하지 않으려면 DNS 제공자용
> certbot 플러그인(`certbot-dns-route53`, `certbot-dns-cloudflare` 등)으로
> 전환하고 `certbot renew --dry-run`으로 검증할 것. **이 단계를 건너뛰면 90일 뒤
> 전 사용자가 동시에 인증 실패한다.**

사내 CA가 있다면 그쪽으로 발급해도 된다. 단, 사내 CA는 각 클라이언트에서
`NODE_EXTRA_CA_CERTS`로 루트 CA를 신뢰시켜야 하므로 배포 부담이 늘어난다.
Let's Encrypt를 쓰면 클라이언트 설정이 0이다.

## 3. 신규 스택 기동

기존 디렉터리를 재사용하지 않고 새로 받는다(롤백 경로를 깨끗하게 유지).

```bash
git clone https://github.com/gmlee-ncurity/redmine-mcp-server.git /home/redmine-mcp-tls
```

```bash
cd /home/redmine-mcp-tls && docker compose -f deploy/tls/docker-compose.tls.yml up -d --build
```

로컬 확인:

```bash
curl -s http://127.0.0.1:3001/health
```

## 4. nginx

```bash
mkdir -p /etc/nginx/snippets && cp /home/redmine-mcp-tls/deploy/tls/nginx/snippets/mcp-proxy.inc /etc/nginx/snippets/ && cp /home/redmine-mcp-tls/deploy/tls/nginx/mcp.ncurity.com.conf /etc/nginx/conf.d/ && nginx -t && systemctl reload nginx
```

공통 프록시 설정은 `snippets/mcp-proxy.inc`로 분리돼 있다(MCP 서버를 추가할 때
재사용). 그 안의 SSE 관련 4줄(`proxy_buffering off`, `proxy_cache off`,
`Connection ''`, `chunked_transfer_encoding off`)은 필수다. 빠지면 `GET /mcp`
스트림이 nginx 버퍼에 갇혀 세션이 바로 죽는다.

## 5. 검증

```bash
curl -s https://mcp.ncurity.com/.well-known/oauth-authorization-server
```

`issuer`, `authorization_endpoint`, `token_endpoint`가 모두 `https://mcp.ncurity.com`
으로 나와야 한다. 하나라도 http이면 `MCP_ISSUER_URL`을 다시 확인한다.

클라이언트에서 end-to-end 확인:

```bash
claude mcp add --transport http redmine-tls https://mcp.ncurity.com/mcp && claude mcp login redmine-tls
```

## 6. 클라이언트 이전

플러그인(`ncurion-plugin`)의 `.mcp.json`에 박힌 URL을
`http://192.168.71.103:3000/mcp` → `https://mcp.ncurity.com/mcp`로 교체한다.

사용자 안내 시 함께 전달할 것:

- issuer가 바뀌므로 **기존 등록은 무효**다. `claude mcp remove` 후 재등록·재로그인이 필요하다.
- `[mcp-sdk] SEP-2352: stored OAuth credential has no 'issuer' stamp` 경고는
  이 문제와 무관한 클라이언트 측 노이즈이며, 새 엔드포인트로 재로그인하면 사라진다.

## 7. 기존 서버 폐기

| 단계 | 내용 | 기간 |
|---|---|---|
| D+0 | 신규 스택 검증 완료, 플러그인 URL 교체, 공지 발송 | — |
| D+0 ~ D+14 | 병렬 운영. 기존 서버 잔여 사용자 모니터링 | 2주 |
| D+14 | 기존 컨테이너 `stop` (볼륨 보존) | — |
| D+21 | 이의 없으면 컨테이너·볼륨 삭제, 3000 포트 방화벽 차단 | — |

잔여 사용자 확인 — `/health`의 `sessions` 값은 세션 누수 때문에 신뢰할 수 없으므로
로그의 신규 세션 생성 기록을 본다.

```bash
cd /home/redmine-mcp-server && docker compose logs --since 24h 2>&1 | grep -c "Session initialized"
```

정지(롤백 가능 상태 유지):

```bash
cd /home/redmine-mcp-server && docker compose stop
```

최종 삭제:

```bash
cd /home/redmine-mcp-server && docker compose down -v
```

## 8. 여러 MCP 서버 얹기

**서버 하나당 호스트네임 하나**가 원칙이다. 한 호스트네임에 경로로 여러 MCP 서버를
붙이는 구성(`/redmine/mcp`, `/foo/mcp`)은 OAuth를 쓰는 서버끼리는 동작하지 않는다.

SDK 구현상의 이유:

- `mcpAuthRouter`는 문서화된 대로 **애플리케이션 루트에 마운트해야** 한다.
- 메타데이터의 엔드포인트가 `new URL('/authorize', baseUrl ?? issuer)` 식으로
  만들어진다. 선행 슬래시 때문에 issuer에 경로 접두어를 넣어도(`https://host/redmine`)
  결과는 언제나 `https://host/authorize`로 루트에 붙는다.
- `/.well-known/oauth-authorization-server`도 경로 인식 없이 루트에만 서빙된다.
  (`/.well-known/oauth-protected-resource`만 RFC 9728식 경로 인식을 지원한다.)

즉 두 번째 MCP 서버를 같은 호스트네임에 얹으면 `/authorize`, `/token`, `/register`,
`/revoke`, `/.well-known/oauth-authorization-server`가 전부 충돌한다.

### 서브도메인 추가 절차

1. DNS에 `mcp-<name>.ncurity.com A 192.168.71.103` 추가
2. 인증서에 이름 추가 — SAN으로 묶거나(권장) 와일드카드 발급

```bash
certbot certonly --manual --preferred-challenges dns -d mcp.ncurity.com -d mcp-foo.ncurity.com
```

3. 새 스택은 루프백의 빈 포트(3002, 3003 …)에 바인딩하고,
   `MCP_ISSUER_URL`을 **자기 서브도메인**으로 설정
4. `mcp.ncurity.com.conf`를 복사해 `server_name`, `proxy_pass`, 인증서 경로,
   로그 경로만 바꾼다. 프록시 설정은 `include /etc/nginx/snippets/mcp-proxy.inc;`로 공유된다.

### 예외: OAuth를 쓰지 않는 서버

인증이 없거나 정적 토큰만 쓰는 MCP 서버는 well-known 디스커버리를 타지 않으므로
경로 기반으로 얹어도 된다. `location /foo/ { proxy_pass ...; }` 한 줄이면 끝이다.
이 저장소의 서버처럼 자체 OAuth AS 역할을 하는 경우에만 서브도메인이 강제된다.

## 롤백

D+14 이전에는 기존 스택이 그대로 살아 있으므로, 플러그인 `.mcp.json`의 URL을
`http://192.168.71.103:3000/mcp`로 되돌리기만 하면 즉시 복귀된다.
신규 스택은 `docker compose -f deploy/tls/docker-compose.tls.yml down`으로 내린다.

## 남은 작업

- **세션 누수**: `GET/POST /mcp` 세션이 명시적 `DELETE` 없이는 회수되지 않아
  `transports` 맵에 무한 누적된다(운영 서버 실측 9103건). 별도 브랜치에서 수정 중이며,
  머지 후 신규 스택을 `up -d --build`로 재빌드할 것.
- **포트 3000 차단**: 폐기 완료 후 LAN에서의 평문 접근 경로를 방화벽에서 닫는다.
