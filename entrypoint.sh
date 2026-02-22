#!/bin/sh

# 设置严格模式
set -e

# 检查并修复 volume 挂载目录的权限
fix_permissions() {
    local dir="$1"
    local type="$2"
    
    if [ -e "$dir" ]; then
        current_owner=$(stat -c '%u:%g' "$dir" 2>/dev/null || echo "0:0")
        if [ "$current_owner" != "1000:1000" ]; then
            echo "修复 $type 权限: $dir"
            # 尝试修改所有者，如果失败则继续（可能是只读挂载）
            chown 1000:1000 "$dir" 2>/dev/null || echo "警告: 无法修改 $dir 的所有者"
        fi
        
        # 设置适当的权限
        if [ "$type" = "目录" ]; then
            chmod 755 "$dir" 2>/dev/null || true
        else
            chmod 644 "$dir" 2>/dev/null || true
        fi
    else
        echo "创建 $type: $dir"
        if [ "$type" = "目录" ]; then
            mkdir -p "$dir"
            chmod 755 "$dir"
        else
            touch "$dir"
            echo '{}' > "$dir"
            chmod 644 "$dir"
        fi
        chown 1000:1000 "$dir" 2>/dev/null || true
    fi
}

echo "开始权限检查和修复..."

# 修复 images 目录权限
fix_permissions "/app/images" "目录"

# 修复 config.json 文件权限
fix_permissions "/app/config.json" "文件"

echo "权限检查完成！"

# 切换到 node 用户并执行原始命令
echo "以 node 用户身份启动应用..."
exec su-exec node "$@"