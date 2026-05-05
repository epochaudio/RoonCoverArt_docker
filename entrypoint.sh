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

RUN_AS_USER="node"

keyboard_enabled() {
    case "$KEYBOARD_ENABLED" in
        true|TRUE|1|yes|YES|on|ON)
            return 0
            ;;
        *)
            return 1
            ;;
    esac
}

setup_input_group() {
    if ! keyboard_enabled; then
        return
    fi

    if [ -z "$INPUT_GID" ]; then
        echo "警告: KEYBOARD_ENABLED=true 但未设置 INPUT_GID，node 用户可能无法读取 /dev/input"
        return
    fi

    case "$INPUT_GID" in
        *[!0-9]*)
            echo "警告: INPUT_GID 不是数字: $INPUT_GID"
            return
            ;;
    esac

    input_group_name=$(awk -F: -v gid="$INPUT_GID" '$3 == gid { print $1; exit }' /etc/group)
    if [ -z "$input_group_name" ]; then
        input_group_name="hostinput"
        addgroup -g "$INPUT_GID" "$input_group_name" 2>/dev/null || true
    fi

    input_group_name=$(awk -F: -v gid="$INPUT_GID" '$3 == gid { print $1; exit }' /etc/group)
    if [ -n "$input_group_name" ]; then
        addgroup node "$input_group_name" 2>/dev/null || true
        RUN_AS_USER="node:$input_group_name"
        echo "宿主机键盘输入组已配置: $input_group_name($INPUT_GID)"
    else
        echo "警告: 无法配置 INPUT_GID=$INPUT_GID 对应的输入组"
    fi
}

setup_input_group

echo "权限检查完成！"

# 切换到 node 用户并执行原始命令
echo "以 $RUN_AS_USER 身份启动应用..."
exec su-exec "$RUN_AS_USER" "$@"
