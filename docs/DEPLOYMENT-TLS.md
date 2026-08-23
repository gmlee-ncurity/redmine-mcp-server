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
cp /home/redmine-mcp-tls/deploy/tls/nginx/mcp.ncurity.com.conf /etc/nginx/conf.d/ && nginx -t && systemctl reload nginx
```

`deploy/tls/nginx/mcp.ncurity.com.conf`의 SSE 관련 4줄(`proxy_buffering off`,
`proxy_cache off`, `Connection ''`, `chunked_transfer_encoding off`)은 필수다.
빠지면 `GET /mcp` 스트림이 nginx 버퍼에 갇혀 세션이 바로 죽는다.

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

## 롤백

D+14 이전에는 기존 스택이 그대로 살아 있으므로, 플러그인 `.mcp.json`의 URL을
`http://192.168.71.103:3000/mcp`로 되돌리기만 하면 즉시 복귀된다.
신규 스택은 `docker compose -f deploy/tls/docker-compose.tls.yml down`으로 내린다.

## 남은 작업

- **세션 누수**: `GET/POST /mcp` 세션이 명시적 `DELETE` 없이는 회수되지 않아
  `transports` 맵에 무한 누적된다(운영 서버 실측 9103건). 별도 브랜치에서 수정 중이며,
  머지 후 신규 스택을 `up -d --build`로 재빌드할 것.
- **포트 3000 차단**: 폐기 완료 후 LAN에서의 평문 접근 경로를 방화벽에서 닫는다.
