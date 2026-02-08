#!/usr/bin/env python3
"""
扫描目录下所有 Git 仓库并生成日报

用法:
    python get_git_log.py <root_path> <date> [author]

参数:
    root_path: 要扫描的根目录（包含多个 Git 仓库）
    date: 日期 (YYYY-MM-DD)
    author: 作者名称，可选，用于筛选提交

输出:
    格式化的日报内容
"""

import argparse
import json
import os
import subprocess
from collections import defaultdict
from typing import List, Dict, Tuple


def run_git_cmd(repo_path: str, cmd: list[str]) -> str:
    """执行 Git 命令并返回输出"""
    result = subprocess.run(
        cmd,
        cwd=repo_path,
        stdout=subprocess.PIPE,
        stderr=subprocess.DEVNULL,
        text=True,
        encoding="utf-8",
        errors="ignore"
    )
    return result.stdout.strip()


def is_git_repo(path: str) -> bool:
    """检查目录是否是 Git 仓库"""
    return os.path.isdir(os.path.join(path, ".git"))


def get_commits(repo_path: str, date: str, author: str = None) -> List[Tuple[str, str]]:
    """
    获取指定日期和作者的提交记录

    Args:
        repo_path: Git 仓库路径
        date: 日期 (YYYY-MM-DD)
        author: 作者名称，可选

    Returns:
        提交记录列表 [(commit_hash, commit_message)]
    """
    since = f"{date} 00:00:00"
    until = f"{date} 23:59:59"

    cmd = [
        "git", "log",
        "--since", since,
        "--until", until,
        "--pretty=format:%H|%s"
    ]

    if author:
        cmd.extend(["--author", author])

    output = run_git_cmd(repo_path, cmd)
    commits = []

    for line in output.splitlines():
        if "|" in line:
            commits.append(tuple(line.split("|", 1)))

    return commits


def get_changed_files(repo_path: str, commit_hash: str) -> List[str]:
    """获取提交的变更文件列表"""
    cmd = [
        "git", "show",
        commit_hash,
        "--name-status",
        "--pretty=format:"
    ]
    output = run_git_cmd(repo_path, cmd)
    return output.splitlines()


def scan_repos(root_path: str, date: str, author: str = None) -> Dict[str, List[Dict]]:
    """
    扫描根目录下所有 Git 仓库并获取提交记录

    Args:
        root_path: 根目录路径
        date: 日期 (YYYY-MM-DD)
        author: 作者名称，可选

    Returns:
        仓库提交报告 {repo_name: [commits]}
    """
    report = defaultdict(list)
    visited = set()

    for current_path, dirs, files in os.walk(root_path):
        if current_path in visited:
            continue

        if is_git_repo(current_path):
            visited.add(current_path)
            repo_name = os.path.basename(current_path)

            commits = get_commits(current_path, date, author)
            if commits:
                for commit_hash, subject in commits:
                    report[repo_name].append({
                        "subject": subject,
                        "files": get_changed_files(current_path, commit_hash)
                    })

            dirs[:] = []  # 不进入子目录

    return dict(report)


def format_report(report: Dict[str, List[Dict]], date: str, author: str = None) -> str:
    """
    格式化输出日报

    Args:
        report: 仓库提交报告
        date: 日期
        author: 作者名称

    Returns:
        格式化的日报文本
    """
    if author:
        title = f"{author} 提交日报（{date}）"
    else:
        title = f"代码提交日报（{date}）"

    lines = [
        "=" * (len(title) + 10),
        f"   {title}",
        "=" * (len(title) + 10),
        ""
    ]

    if not report:
        lines.append("当天无提交记录")
        return "\n".join(lines)

    for repo, commits in report.items():
        lines.append(f"[{repo}]")
        for item in commits:
            lines.append(f"- {item['subject']}")
            if item["files"]:
                lines.append("  文件变更：")
                for f in item["files"]:
                    lines.append(f"    {f}")
        lines.append("")

    return "\n".join(lines)


def main():
    import sys

    # 设置标准输出编码为 UTF-8
    if sys.platform == 'win32':
        import io
        sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')

    parser = argparse.ArgumentParser(description='扫描目录下所有 Git 仓库并生成日报')
    parser.add_argument('root_path', help='要扫描的根目录')
    parser.add_argument('date', help='日期 (YYYY-MM-DD)')
    parser.add_argument('--author', help='作者名称，用于筛选提交')
    parser.add_argument('--json', action='store_true', help='输出 JSON 格式')

    args = parser.parse_args()

    report = scan_repos(args.root_path, args.date, args.author)

    if args.json:
        print(json.dumps(report, indent=2, ensure_ascii=False))
    else:
        print(format_report(report, args.date, args.author))


if __name__ == "__main__":
    main()
