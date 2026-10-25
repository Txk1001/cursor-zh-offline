"""Private loopback translation bridge using Argos packages and CTranslate2.

Only model installation downloads files. This process refuses outbound sockets.
Argos' package/tokenizer modules are reused; its optional online and Stanza
pipelines are not loaded. See THIRD-PARTY.md for the minimal integration.
"""
from __future__ import annotations
import argparse
from collections import Counter
import hashlib
import hmac
import ipaddress
import json
import os
from pathlib import Path
import re
import secrets
import socket
import sqlite3
import threading
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

VERSION = "argos-en-zh-1.9-bridge-4"
TRUSTED_ORIGINS = {"vscode-file://vscode-app", "file://", "null"}
MAX_TEXT = 12000
TECH_TERMS = json.loads(Path(__file__).with_name('protected-terms.json').read_text(encoding='utf-8-sig'))
if not isinstance(TECH_TERMS, list) or any(not isinstance(term, str) or not term for term in TECH_TERMS):
    raise ValueError('Invalid protected terminology file')
# A command mentioned in prose is still executable content. Stop at common
# prose boundaries; quoted arguments and command chains remain intact.
COMMAND_TOOL = r"(?:npm|npx|pnpm|yarn|bun|pip3?|python3?|node|cargo|rustc|go|git|docker|kubectl|curl|wget|pwsh|powershell|dotnet|make|cmake|apt(?:-get)?|brew|winget|uv|poetry|conda|pytest|rg)"
COMMAND_STOP = r"(?:before|after|then|because|when|while|unless|until|instead|from|to|for|with|and|or|but|in|on|as)"
COMMAND_ARG = r'''(?:"[^"\n]*"|'[^'\n]*'|(?!(?:''' + COMMAND_STOP + r''')\b)[^\s,;.!?。！？<>()]+(?:\.[^\s,;.!?。！？<>()]+)*)'''
COMMAND = r"(?<![\w.-])" + COMMAND_TOOL + r"(?:[ \t]+" + COMMAND_ARG + r")+"
PROTECTED = re.compile(
    r"```[\s\S]*?```|`[^`\n]+`"
    r"|\{\{[^{}\n]+\}\}|\$\{[^}\n]+\}|\$\([^)\n]+\)"
    r"|(?<!\w)\$(?:[A-Za-z_][\w:]*(?:\.[A-Za-z_]\w*)*|[0-9@*#?$!_-])"
    r"|%\([^)\n]+\)[#0 +\-]*(?:\d+|\*)?(?:\.(?:\d+|\*))?[hlL]?[diouxXeEfFgGcrsa]"
    r"|%[A-Za-z_]\w*%"
    r"|%(?:\d+\$)?[#0 +\-]*(?:\d+|\*)?(?:\.(?:\d+|\*))?[hlL]{0,2}[diouxXeEfFgGcsapn%]"
    r"|\{[A-Za-z_\d][\w.\[\]]*(?:![rsa])?(?::[^{}\n]+)?\}"
    r"|</?[A-Za-z][^>\n]*>"
    r"|https?://[^\s<>]+|[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}"
    r"|[\u21b5\u23ce\u2318\u2325\u21e7\u2303\u21e5\ue000-\uf8ff]"
    r"|(?:[A-Za-z]:[\\/]|\\\\[^\\\s]+\\|~/|(?<![\w:/])/(?!/)|\.{1,2}/)[^\s<>\"']+"
    r"|\b(?:Ctrl|Control|Alt|Shift|Cmd|Command|Meta|Super)(?:\+(?:[A-Za-z0-9]+|[+]))+"
    r"|(?i:" + COMMAND + r")"
    r"|(?i:\b(?:" + "|".join(re.escape(t) for t in sorted(TECH_TERMS,key=len,reverse=True)) + r")\b)"
    r"|[\u3400-\u9fff\uf900-\ufaff][\u3400-\u9fff\uf900-\ufaff\u3000-\u303f\uff00-\uffef]*"
    r"|\b\d+(?:[.,]\d+)*(?:%|[smhd])?\b|\b[A-Z]{2,}[A-Z0-9_-]*\b"
    r"|\b[a-z]+(?:[A-Z][a-z0-9]+)+\b|\b\w+_\w+\b"
    r"|\b[\w-]+\.(?:js|ts|tsx|jsx|py|json|md|txt|html|css|yml|yaml|rs|go|sh|ps1|c|cpp|h|java|cs|toml|ini|xml|sql)\b"
)
CODE_LINE = re.compile(r"^\s*(?:(?:const|let|var)\s+\w+\s*=|(?:import|export)\s+.+[;{}]|from\s+\S+\s+import\s|(?:def|class|function)\s+\w+\s*[(::{]|#include\s|(?:SELECT|INSERT|UPDATE)\s.+(?:FROM|INTO|SET)\s)", re.I)
# Isolated connective fragments have too little context for this small model.
# Keep their meanings deterministic when marker validation requires gap fallback.
FRAGMENT_TRANSLATIONS = {'and':'和','or':'或','but':'但','the':'','a':'','an':'',
    'press':'按','use':'使用','open':'打开','close':'关闭','run':'运行','read':'读取',
    'keep':'保持','replace':'替换','format':'设置格式','save':'保存','install':'安装'}

def protected_spans(text, glossary):
    """Return non-overlapping (start, end, original, replacement) spans.

    Longest matches win at the same position, allowing 'API key' to use its
    reviewed term while backticks, placeholders, commands and paths keep every
    byte inside them. Existing Chinese is immutable as well.
    """
    candidates=[(m.start(),m.end(),m.group(),m.group()) for m in PROTECTED.finditer(text)]
    if glossary:
        pattern=re.compile(r'(?<![A-Za-z0-9_])(?:'+'|'.join(re.escape(t) for t in sorted(glossary,key=len,reverse=True))+r')(?![A-Za-z0-9_])',re.I)
        candidates.extend((m.start(),m.end(),m.group(),glossary[m.group().casefold()]) for m in pattern.finditer(text))
    spans=[];cursor=0
    for span in sorted(candidates,key=lambda s:(s[0],-s[1])):
        if span[0]>=cursor:
            spans.append(span);cursor=span[1]
    return spans

def spans_preserved(translated, spans):
    # Check repetitions too: two occurrences of $HOME must not become one.
    return all(translated.count(value)>=count for value,count in Counter(s[3] for s in spans).items())

def json_write(path: Path, value):
    path.parent.mkdir(parents=True, exist_ok=True)
    temp = path.with_suffix(path.suffix + ".tmp")
    temp.write_text(json.dumps(value,ensure_ascii=False,indent=2)+"\n",encoding="utf8")
    temp.chmod(0o600)
    temp.replace(path)

def forbid_outbound():
    original_connect = socket.socket.connect
    original_connect_ex = socket.socket.connect_ex
    def check(address):
        if isinstance(address, tuple):
            try: allowed = ipaddress.ip_address(address[0]).is_loopback
            except ValueError: allowed = False
            if not allowed: raise OSError("Offline translator refuses outbound networking")
    def connect(sock,address):
        check(address)
        return original_connect(sock,address)
    def connect_ex(sock,address):
        check(address)
        return original_connect_ex(sock,address)
    socket.socket.connect = connect
    socket.socket.connect_ex = connect_ex

class Engine:
    def __init__(self, state: Path):
        os.environ.update(ARGOS_MODEL_PROVIDER="OPENNMT",ARGOS_DEVICE_TYPE="cpu",ARGOS_PACKAGES_DIR=str(state/"models"),ARGOS_DEBUG="0",XDG_DATA_HOME=str(state/"argos-data"),XDG_CACHE_HOME=str(state/"argos-cache"),XDG_CONFIG_HOME=str(state/"argos-config"))
        import ctranslate2
        from argostranslate.package import Package
        from argostranslate.tokenizer import SentencePieceTokenizer
        import sentencepiece
        self.package = Package(state/"models"/"translate-en_zh-1_9")
        # SentencePiece's native Windows file API cannot open every Unicode
        # path. Python reads the bytes with Unicode path support; Argos keeps
        # its standard encode/decode implementation and the same model.
        if isinstance(self.package.tokenizer, SentencePieceTokenizer):
            self.package.tokenizer.processor = sentencepiece.SentencePieceProcessor(
                model_proto=Path(self.package.tokenizer.model_file).read_bytes())
        self.translator = ctranslate2.Translator(str(self.package.package_path/"model"),device="cpu",compute_type="int8",inter_threads=1,intra_threads=min(4,os.cpu_count() or 2))
        self.lock = threading.Lock()
        reviewed_file=state/'reviewed.zh-cn.json'
        self.reviewed=json.loads(reviewed_file.read_text(encoding='utf-8-sig')) if reviewed_file.exists() else {}
        if not isinstance(self.reviewed,dict) or any(not isinstance(k,str) or not isinstance(v,str) or not k or not v for k,v in self.reviewed.items()):raise ValueError('Invalid reviewed dictionary')
        self.reviewed={k.casefold():v for k,v in self.reviewed.items()}
        self.glossary={}
        for name in ['terms.default.json','terms.user.json']:
            file=state/name
            if file.exists():
                values=json.loads(file.read_text(encoding='utf-8-sig'))
                if not isinstance(values,dict) or any(not isinstance(k,str) or not k or len(k)>100 or not isinstance(v,str) or not v or len(v)>100 for k,v in values.items()):raise ValueError('Invalid terminology file')
                self.glossary.update({k.casefold():v for k,v in values.items()})
        self.db = sqlite3.connect(state/"translations.sqlite3",check_same_thread=False)
        self.db.execute("CREATE TABLE IF NOT EXISTS translations (key TEXT PRIMARY KEY, source TEXT NOT NULL, translation TEXT NOT NULL, created INTEGER NOT NULL)")
        self.db.commit()
        (state/"translations.sqlite3").chmod(0o600)
        # Pin the cache revision to protection rules as well as the model.
        self.revision = VERSION + hashlib.sha256(Path(__file__).read_bytes()+json.dumps([self.glossary,self.reviewed,TECH_TERMS],sort_keys=True).encode()).hexdigest()[:12]
        forbid_outbound()

    def plain(self, text: str) -> str:
        if not re.search(r"[A-Za-z]{2}",text): return text
        leading = re.match(r"^\s*",text).group()
        trailing = re.search(r"\s*$",text).group()
        text = text.strip()
        if not text: return leading+trailing
        if text.casefold() in FRAGMENT_TRANSLATIONS:
            return leading+FRAGMENT_TRANSLATIONS[text.casefold()]+trailing
        # Split long input before the model's limit, retaining all source tokens.
        pieces = re.split(r"(?<=[.!?])\s+(?=[A-Z])",text)
        output=[]
        for sentence in pieces:
            tokens=self.package.tokenizer.encode(sentence)
            for offset in range(0,len(tokens),128):
                result=self.translator.translate_batch([tokens[offset:offset+128]],beam_size=4,max_decoding_length=384)[0]
                output.append(self.package.tokenizer.decode(result.hypotheses[0]))
        result=" ".join(output).strip()
        if re.match(r'^(Hello|Hi)\b',text,re.I):result=re.sub(r'^哈[罗啰]','你好',result)
        result=re.sub(r'(?<=[\u3400-\u9fff])[?]','？',result)
        result=re.sub(r'(?<=[\u3400-\u9fff])[!]', '！',result)
        result=re.sub(r'(?<=[。！？])\s+(?=[\u3400-\u9fff])','',result)
        result=re.sub(r'(?<=[\u3400-\u9fff])\s+(?=[\u3400-\u9fff])','',result)
        result=re.sub(r'\s+([。，！？；：])',r'\1',result)
        if re.search(r'[\u3400-\u9fff]',result):
            result=re.sub(r'(?<=>)\.(?=\s*$)','。',result)
        if re.search(r"\bagents?\b",text,re.I): result=result.replace("代理人","智能体").replace("代理商","智能体")
        return leading+result+trailing if result else leading+text+trailing

    def protected(self, text: str) -> str:
        if CODE_LINE.match(text) or re.match(r'^\s*(?:(?:\w+\.)*\w+\([^)]*\)\s*;?$|[\w$.]+\s*(?:=|=>|:=)|(?:return|throw|await)\s+.*(?:[;{}]|\([^)]*\))\s*$|(?:if|for|while|switch|catch)\s*\(|[\[{]|["\'][^"\']+["\']\s*:)',text) or not re.search(r"[A-Za-z]{2}",text): return text
        leading=re.match(r'^\s*',text).group();trailing=re.search(r'\s*$',text).group();clean=text.strip()
        spans=protected_spans(text,self.glossary)
        approved=self.reviewed.get(clean.casefold())
        if approved and spans_preserved(approved,spans):return leading+approved+trailing
        # Existing Chinese prose is already localized. Do not retranslate its
        # embedded product names or reconstruct its punctuation with the model.
        if any(re.match(r'[\u3400-\u9fff\uf900-\ufaff]',match.group()) for match in PROTECTED.finditer(text)):return text
        duration=re.fullmatch(r'The operation completed in (\d+(?:[.,]\d+)?) seconds?\.',clean,re.I)
        if duration:return leading+'操作已完成，用时 '+duration[1]+' 秒。'+trailing
        keep_code=re.fullmatch(r'(Please )?keep (`[^`\n]+`) unchanged\.',clean,re.I)
        if keep_code:return leading+('请' if keep_code[1] else '')+'保持 '+keep_code[2]+' 不变。'+trailing
        # Translate with stable placeholders to retain sentence context. If a
        # model alters, drops or duplicates any marker, translate only the gaps.
        # Verify reconstructed output as well; no unverified result is cached.
        if spans and not re.search(r'<\s*x\s*\d', text, re.I):
            masked=[];cursor=0
            for index,(start,end,original,replacement) in enumerate(spans):
                masked.extend([text[cursor:start],f'<x{index}>']);cursor=end
            masked.append(text[cursor:])
            translated=self.plain(''.join(masked))
            marker=re.compile(r'<\s*x\s*(\d+)\s*>',re.I)
            indices=[int(m.group(1)) for m in marker.finditer(translated)]
            if sorted(indices)==list(range(len(spans))):
                translated=marker.sub(lambda m:spans[int(m.group(1))][3],translated)
                if not re.search(r'<\s*x\s*\d',translated,re.I) and spans_preserved(translated,spans):return translated
        parts=[]; cursor=0
        for start,end,original,replacement in spans:
            parts.append(self.plain(text[cursor:start]))
            parts.append(replacement)
            cursor=end
        parts.append(self.plain(text[cursor:]))
        result="".join(parts)
        return result if spans_preserved(result,spans) else text

    def translate(self, source: str) -> str:
        if not isinstance(source,str) or len(source)>MAX_TEXT: raise ValueError("text too long")
        key=hashlib.sha256((self.revision+"\0"+source).encode()).hexdigest()
        with self.lock:
            found=self.db.execute("SELECT translation FROM translations WHERE key=?",(key,)).fetchone()
            if found: return found[0]
            blocks=re.split(r"(```[\s\S]*?(?:```|$))",source)
            result="".join(block if block.startswith('```') else "\n".join(self.protected(line) for line in block.split("\n")) for block in blocks)
            # A final document-level check also covers reviewed phrases and
            # future formatting rules. Prefer unchanged source to damaged code.
            if not spans_preserved(result,protected_spans(source,self.glossary)):result=source
            self.db.execute("INSERT OR REPLACE INTO translations VALUES (?,?,?,?)",(key,source,result,int(time.time())))
            self.db.commit()
            return result

class Bridge(ThreadingHTTPServer):
    daemon_threads=True
    allow_reuse_address=False
    def __init__(self,address,engine,token):
        self.engine=engine; self.token=token; self.last_activity=time.monotonic()
        super().__init__(address,Handler)

class Handler(BaseHTTPRequestHandler):
    server_version="CursorOfflineTranslator"
    def log_message(self,*_): pass  # Never log source text, tokens, or URLs.
    def origin_allowed(self): return self.headers.get("Origin") in TRUSTED_ORIGINS or self.headers.get("Origin") is None
    def authorized(self):
        return self.origin_allowed() and hmac.compare_digest(self.headers.get("X-Cursor-Zh-Token",""),self.server.token)
    def reply(self,status,value):
        body=json.dumps(value,ensure_ascii=False).encode("utf8")
        self.send_response(status)
        origin=self.headers.get("Origin")
        if origin in TRUSTED_ORIGINS:
            self.send_header("Access-Control-Allow-Origin",origin)
            self.send_header("Vary","Origin")
        self.send_header("Cache-Control","no-store")
        self.send_header("Content-Type","application/json; charset=utf-8")
        self.send_header("Content-Length",str(len(body)))
        self.end_headers(); self.wfile.write(body)
    def do_OPTIONS(self):
        if not self.origin_allowed(): return self.reply(403,{"error":"origin"})
        self.send_response(204)
        if self.headers.get("Origin") in TRUSTED_ORIGINS: self.send_header("Access-Control-Allow-Origin",self.headers["Origin"])
        self.send_header("Access-Control-Allow-Headers","Content-Type, X-Cursor-Zh-Token")
        self.send_header("Access-Control-Allow-Methods","GET, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Private-Network","true")
        self.send_header("Access-Control-Max-Age","600")
        self.end_headers()
    def do_GET(self):
        if not self.authorized(): return self.reply(403,{"error":"unauthorized"})
        if self.path!="/health": return self.reply(404,{"error":"not_found"})
        self.server.last_activity=time.monotonic()
        self.reply(200,{"ready":True,"engine":"Argos Translate / CTranslate2","version":VERSION,"offline":True,"languages":["en","zh"]})
    def do_POST(self):
        if not self.authorized(): return self.reply(403,{"error":"unauthorized"})
        if self.path=="/stop":
            self.reply(200,{"stopped":True})
            threading.Thread(target=self.server.shutdown,daemon=True).start(); return
        if self.path!="/translate": return self.reply(404,{"error":"not_found"})
        try:
            length=int(self.headers.get("Content-Length","0"))
            if length<1 or length>131072: return self.reply(413,{"error":"request_too_large"})
            if self.headers.get_content_type()!="application/json": return self.reply(415,{"error":"json_required"})
            request=json.loads(self.rfile.read(length))
            texts=request.get("texts")
            if not isinstance(texts,list) or not 1<=len(texts)<=8 or any(not isinstance(t,str) or len(t)>MAX_TEXT for t in texts): raise ValueError()
            self.server.last_activity=time.monotonic()
            translated=[self.server.engine.translate(text) for text in texts]
            self.server.last_activity=time.monotonic()
            self.reply(200,{"translations":translated,"engine":"argos-en-zh"})
        except (ValueError,TypeError,UnicodeError): self.reply(400,{"error":"invalid_request"})
        except Exception: self.reply(500,{"error":"translation_failed"})

def main():
    parser=argparse.ArgumentParser()
    parser.add_argument("--state",type=Path,required=True)
    parser.add_argument("--translate")
    args=parser.parse_args(); state=args.state.resolve(); state.mkdir(parents=True,exist_ok=True)
    engine=Engine(state)
    if args.translate is not None:
        print(engine.translate(args.translate)); return
    connection_path=state/"connection.json"
    previous={}
    if connection_path.exists():
        try: previous=json.loads(connection_path.read_text(encoding="utf8"))
        except (ValueError,OSError): pass
    token=previous.get("token") if re.fullmatch(r"[a-f0-9]{64}",str(previous.get("token",""))) else secrets.token_hex(32)
    desired=int(previous.get("port",0))
    try: server=Bridge(("127.0.0.1",desired),engine,token)
    except OSError: server=Bridge(("127.0.0.1",0),engine,token)
    port=server.server_address[1]
    json_write(connection_path,{"version":1,"type":"cursor-zh-offline","url":f"http://127.0.0.1:{port}","port":port,"token":token})
    json_write(state/"process.json",{"pid":os.getpid(),"port":port,"version":VERSION})
    def idle_watch():
        while True:
            time.sleep(15)
            if time.monotonic()-server.last_activity>180:
                server.shutdown(); return
    threading.Thread(target=idle_watch,daemon=True).start()
    try: server.serve_forever(poll_interval=1)
    finally: server.server_close(); engine.db.close()

if __name__=="__main__": main()
