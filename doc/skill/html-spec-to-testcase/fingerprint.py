#!/usr/bin/env python3
"""指纹工具 —— html-spec-to-testcase 技能的双指纹唯一算法（可复算的单一真源）。

用法:
  fingerprint.py source-rev <index.html> <anchor-id>   # html_spec 片段指纹（排除预览/截图噪声）
  fingerprint.py impl-rev   <contract-file>            # 契约代码指纹（git blob 短 hash，over-flag 更安全）

要点:
- 所有指纹取 sha1 前 12 位十六进制，**注解里必须同时存"定位符"**（source: 锚点 id；impl: file#symbol），
  否则未来 reconcile 者无法复算同一片段 —— 定位符 + 本脚本 = 可复现。
- source-rev 只对 html_spec 该锚点 <section> 的**规格文本**取 hash，剔除 preview/screenshot/demo/script/style/iframe
  噪声块（否则改一下运行态预览就误报规格漂移）。改预览 → 指纹不变；改字段/约束表 → 指纹变。
- impl-rev 用 `git hash-object` 整文件短 hash：文件任意改动都翻转（over-sensitive），故意偏向"多触发复核"
  ——漏检假绿的代价远高于多复核一次。定位符 file#symbol 供人对齐到具体符号。
"""
import hashlib
import re
import subprocess
import sys
from html.parser import HTMLParser

NOISE_CLASS = re.compile(r"(preview|screenshot|demo)", re.I)
NOISE_TAG = {"script", "style", "iframe", "svg"}


class SectionExtractor(HTMLParser):
    """抽取 id==anchor 的元素子树的规格文本，跳过噪声子树。"""

    def __init__(self, anchor):
        super().__init__(convert_charrefs=True)
        self.anchor = anchor
        self.depth = 0          # 目标元素内的标签嵌套深度（0=尚未进入）
        self.skip_depth = 0     # >0 表示在噪声子树里
        self.parts = []

    def _is_noise(self, tag, attrs):
        if tag in NOISE_TAG:
            return True
        cls = dict(attrs).get("class", "") or ""
        return bool(NOISE_CLASS.search(cls))

    def handle_starttag(self, tag, attrs):
        ad = dict(attrs)
        if self.depth == 0 and ad.get("id") == self.anchor:
            self.depth = 1
            return
        if self.depth >= 1:
            if self.skip_depth > 0:
                self.skip_depth += 1
                return
            if self._is_noise(tag, attrs):
                self.skip_depth = 1
                return
            self.depth += 1

    def handle_endtag(self, tag):
        if self.depth == 0:
            return
        if self.skip_depth > 0:
            self.skip_depth -= 1
            return
        self.depth -= 1  # 目标元素自身闭合时 depth 归 0，之后忽略

    def handle_data(self, data):
        if self.depth >= 1 and self.skip_depth == 0:
            t = data.strip()
            if t:
                self.parts.append(t)


def sha12(b: bytes) -> str:
    return hashlib.sha1(b).hexdigest()[:12]


def source_rev(path, anchor):
    with open(path, encoding="utf-8") as f:
        p = SectionExtractor(anchor)
        p.feed(f.read())
    if not p.parts:
        sys.exit(f"anchor id='{anchor}' not found (or empty) in {path}")
    norm = "\n".join(p.parts)                 # 规范化：去空白噪声，只留规格文本
    return sha12(norm.encode("utf-8"))


def impl_rev(path):
    h = subprocess.check_output(["git", "hash-object", path], text=True).strip()
    return h[:12]


def main():
    if len(sys.argv) < 3:
        sys.exit(__doc__)
    cmd = sys.argv[1]
    if cmd == "source-rev":
        if len(sys.argv) != 4:
            sys.exit("source-rev <index.html> <anchor-id>")
        print(source_rev(sys.argv[2], sys.argv[3]))
    elif cmd == "impl-rev":
        print(impl_rev(sys.argv[2]))
    else:
        sys.exit(__doc__)


if __name__ == "__main__":
    main()
