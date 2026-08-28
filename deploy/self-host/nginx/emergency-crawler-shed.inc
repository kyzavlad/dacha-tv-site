# TEMPORARY production pressure-shed include for dachatv.com.
#
# Use only while the catalog/Supabase hot path is degraded. Include this file
# inside the active dachatv.com server{} block, validate with `nginx -t`, then
# reload Nginx. Remove the include again after the PDP hot-path fix is deployed
# and /api/health is stable.
#
# Why 503: this is explicitly temporary load shedding. It asks crawlers to retry
# later instead of presenting a permanent block. Googlebot is intentionally NOT
# matched. Current production access logs identified the four agents below as
# concurrent catalog crawlers during the incident.
#
# `if` + immediate `return` is the safe Nginx if-use case: no rewrites, proxy
# mutations or nested location logic are performed.

if ($http_user_agent ~* "(SemrushBot|PetalBot|meta-externalagent|bingbot)") {
  return 503;
}
