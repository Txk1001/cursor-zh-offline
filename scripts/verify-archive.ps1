#requires -Version 7.0
param([Parameter(Mandatory)][string]$ArchivePath, [switch]$SourceOnly, [switch]$RequireOffline)
$ErrorActionPreference='Stop'
if($SourceOnly -and $RequireOffline){throw '源码包不能要求离线二进制资产'}
Add-Type -AssemblyName System.IO.Compression.FileSystem
$zip=[IO.Compression.ZipFile]::OpenRead([IO.Path]::GetFullPath($ArchivePath))
function Read-Text($entry){$reader=[IO.StreamReader]::new($entry.Open());try{return $reader.ReadToEnd()}finally{$reader.Dispose()}}
function Hash-Entry($entry){$stream=$entry.Open();try{return [Convert]::ToHexString([Security.Cryptography.SHA256]::HashData($stream)).ToLowerInvariant()}finally{$stream.Dispose()}}
try{
 $names=@($zip.Entries.FullName)
 if(($names|Select-Object -Unique).Count -ne $names.Count){throw '重复的压缩包路径'}
 if($names -match '(^|/)(reports|node_modules|backup|__pycache__|\.cursor|\.git)/|connection\.json$|translations\.sqlite3|runtime\.json$|history-translations\.zh-cn\.json$|metadata/cursor\.json$|(^|/)\.\./|(^/)|:|\\'){throw '包中包含私人状态或不安全路径'}
 if(@($names|Where-Object { $_.StartsWith('metadata/') -and $_ -ne 'metadata/community-sources.json' }).Count){throw '包中包含未经允许的本机元数据'}
 if(!$zip.GetEntry('MANIFEST.sha256')){throw '缺少文件校验清单'}
 $lines=(Read-Text $zip.GetEntry('MANIFEST.sha256')).Trim() -split '\r?\n'
 if($lines.Count -ne $names.Count-1){throw '文件清单不完整'}
 $manifestNames=[Collections.Generic.HashSet[string]]::new([StringComparer]::Ordinal)
 foreach($line in $lines){if($line -notmatch '^([a-f0-9]{64})  (.+)$'){throw '无效的校验清单'};$entryName=$Matches[2];$expected=$Matches[1];if($entryName -eq 'MANIFEST.sha256' -or !$manifestNames.Add($entryName)){throw '文件校验清单重复或包含自身'};$entry=$zip.GetEntry($entryName);if(!$entry -or (Hash-Entry $entry) -ne $expected){throw '文件哈希不匹配'}}
 $config=Read-Text $zip.GetEntry('config.json')|ConvertFrom-Json
 $pkg=Read-Text $zip.GetEntry('package.json')|ConvertFrom-Json
 if($pkg.scripts.'lint:md' -and !$zip.GetEntry('.markdownlint-cli2.jsonc')){throw '声明了文档检查命令但归档缺少对应规则配置'}
 $lock=Read-Text $zip.GetEntry('package-lock.json')|ConvertFrom-Json -AsHashtable
 if($config.version -ne $pkg.version -or $config.version -ne $lock.version -or $config.version -ne $lock.packages[''].version){throw '版本不一致'}
 if($pkg.scripts.'test:protection'){
   foreach($required in @('BUILD-INFO.json','.node-version','.python-version','src/extension/package.nls.json','src/extension/package.nls.zh-cn.json','scripts/lib/installation-lock.mjs')){if(!$zip.GetEntry($required)){throw "新版公共归档缺少 $required"}}
   $info=Read-Text $zip.GetEntry('BUILD-INFO.json')|ConvertFrom-Json
   if($info.profile -ne 'public' -or $info.version -ne $config.version -or $info.lockSha256 -ne (Hash-Entry $zip.GetEntry('package-lock.json'))){throw '公共归档构建参数或锁文件记录不一致'}
   if(!$SourceOnly){
     $record=Read-Text $zip.GetEntry('dist/build-record.json')|ConvertFrom-Json
     if($record.profile -ne 'public' -or $record.version -ne $config.version -or $record.lockSha256 -ne $info.lockSha256 -or $record.configSha256 -ne (Hash-Entry $zip.GetEntry('config.json'))){throw '安装包构建记录与归档源码不一致'}
   }
 }
 foreach($required in @('README.md','CHANGELOG.md','CONTRIBUTING.md','SECURITY.md','LICENSE','NOTICE','metadata/community-sources.json','.github/workflows/ci.yml','.github/workflows/release.yml','.gitignore','tests/history-dom.test.mjs','offline/reviewed.zh-cn.json','offline/licenses/manifest.json','scripts/build-maintenance-archive.ps1')){if(!$zip.GetEntry($required)){throw "缺少文件 $required"}}
 if($SourceOnly -and ($names -match '(^|/)(dist|upstream|assets)/|\.(vsix|whl|argosmodel|exe|dll|pyc|zip)$')){throw '源码包包含构建产物、缓存或运行时二进制'}
 $manifest=Read-Text $zip.GetEntry('offline/assets.json')|ConvertFrom-Json
 $assets=0
 foreach($asset in $manifest.assets){$entry=$zip.GetEntry('offline/assets/'+$asset.file);if($entry){if((Hash-Entry $entry) -ne $asset.sha256){throw '离线资产哈希不匹配'};$assets++}}
 if($assets -and $assets -ne $manifest.assets.Count){throw '离线资产不完整'}
 if($RequireOffline -and $assets -ne $manifest.assets.Count){throw '离线完整包缺少必需资产'}
 foreach($license in (Read-Text $zip.GetEntry('offline/licenses/manifest.json')|ConvertFrom-Json).entries){if((Hash-Entry $zip.GetEntry('offline/licenses/'+$license.file)) -ne $license.sha256){throw '许可正文哈希不匹配'}}
 foreach($entry in $zip.Entries|Where-Object {$_.FullName -match '\.md$' -and $_.FullName -ne 'README-upstream.md'}){
   foreach($match in [regex]::Matches((Read-Text $entry),'!?\[[^\]\r\n]*\]\(([^)\s]+)(?:\s+[^)]*)?\)')){
     $link=$match.Groups[1].Value;if($link -match '^(?:[a-z][a-z0-9+.-]*:|#|/)'){continue};$target=($link -split '[#?]',2)[0];if(!$target){continue}
     $root=Join-Path ([IO.Path]::GetTempPath()) '__cursor_zip_links__';$base=Join-Path $root (Split-Path -Parent $entry.FullName);$resolved=[IO.Path]::GetRelativePath($root,[IO.Path]::GetFullPath((Join-Path $base ([Uri]::UnescapeDataString($target))))).Replace('\','/')
     if($resolved -notin $names -and !@($names|Where-Object {$_.StartsWith($resolved.TrimEnd('/')+'/')}).Count){throw "失效链接：$($entry.FullName) -> $link"}
   }
 }
 if(!$SourceOnly){
 $vsix=$zip.GetEntry('dist/cursor-language-pack-'+$config.version+'.vsix')
 if(!$vsix){throw '安装包缺少匹配版本的 VSIX；校验源码包请指定 -SourceOnly'}
 $nested=[IO.Compression.ZipArchive]::new($vsix.Open(),[IO.Compression.ZipArchiveMode]::Read)
 try{
   $extension=Read-Text $nested.GetEntry('extension/package.json')|ConvertFrom-Json
   if($extension.version -ne $config.version -or $extension.publisher -ne $config.publisher){throw 'VSIX 身份或版本不一致'}
   foreach($item in @('extension/extension.js','extension/offline.cjs','extension/offline/licenses/CTranslate2-4.6.0-LICENSE.txt','extension/offline/licenses/SentencePiece-0.2.1-LICENSE.txt')){if(!$nested.GetEntry($item)){throw 'VSIX 缺少运行文件或许可'}}
   if($pkg.scripts.'test:protection'){foreach($item in @('extension/package.nls.json','extension/package.nls.zh-cn.json')){if(!$nested.GetEntry($item)){throw 'VSIX 缺少清单中文资源'}}}
 }finally{$nested.Dispose()}
 }
 Write-Output ("归档检查通过：{0} 个文件，{1} 项离线资产，版本 {2}，源码模式 {3}。" -f $names.Count,$assets,$config.version,$SourceOnly.IsPresent)
}finally{$zip.Dispose()}
