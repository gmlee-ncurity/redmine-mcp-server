# /etc/nginx/snippets/mcp-proxy.inc
#
# MCP 스트리머블 HTTP 백엔드용 공통 프록시 설정.
# proxy_pass 는 파라미터를 넘길 수 없으므로 각 server 블록에서 직접 지정한다.
#
#   location / {
#       proxy_pass http://127.0.0.1:3001;
#       include /etc/nginx/snippets/mcp-proxy.inc;
#   }

proxy_http_version 1.1;
proxy_set_header Host              $host;
proxy_set_header X-Real-IP         $remote_addr;
proxy_set_header X-Forwarded-For   $proxy_add_x_forwarded_for;
proxy_set_header X-Forwarded-Proto $scheme;

# --- SSE(GET /mcp) 필수 설정 ---
# 이 4줄이 없으면 스트림이 nginx 버퍼에 갇혀 세션이 즉시 죽는다.
proxy_set_header Connection '';
proxy_buffering off;
proxy_cache off;
chunked_transfer_encoding off;

# 장시간 유지되는 SSE 스트림이 read timeout 으로 끊기지 않게 한다.
proxy_read_timeout 3600s;
proxy_send_timeout 3600s;
