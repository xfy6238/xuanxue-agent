#!/bin/bash
# D7数据备份：xuanxue.db + jwt密钥 + 后台配置导出，打包带时间戳
set -e
ROOT="$(cd "$(dirname "$0")" && pwd)"
TS=$(date +%Y%m%d-%H%M%S)
BACKUP_DIR="$ROOT/backups"
mkdir -p "$BACKUP_DIR"
cp "$ROOT/code/xuanxue.db" "$BACKUP_DIR/xuanxue-$TS.db"
[ -f "$ROOT/code/.jwt-secret" ] && cp "$ROOT/code/.jwt-secret" "$BACKUP_DIR/jwt-secret-$TS" && chmod 600 "$BACKUP_DIR/jwt-secret-$TS"
chmod 600 "$BACKUP_DIR/xuanxue-$TS.db"
ls -la "$BACKUP_DIR" | tail -3
echo "备份完成：$BACKUP_DIR/xuanxue-$TS.db（恢复时直接覆盖回code/xuanxue.db并重启8322）"
