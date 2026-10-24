#requires -Version 7.0
param([string]$OutputPath, [switch]$WithOffline, [switch]$SourceOnly, [string]$PrivateCatalogPath)
$ErrorActionPreference = 'Stop'
if ($WithOffline -and $SourceOnly) { throw '-WithOffline 和 -SourceOnly 不能同时使用。' }
$sourceRoot = [IO.Path]::GetFullPath((Split-Path -Parent $PSScriptRoot))
$config = Get-Content -LiteralPath (Join-Path $sourceRoot 'config.json') -Raw | ConvertFrom-Json
$kind = if ($SourceOnly) { 'source' } elseif ($WithOffline) { 'Windows-x64-offline' } else { 'Windows-x64-installer' }
if (!$OutputPath) { $OutputPath = Join-Path (Split-Path -Parent $sourceRoot) ('cursor-zh-offline-{0}-{1}.zip' -f $config.version, $kind) }
$destination = [IO.Path]::GetFullPath($OutputPath)
if (Test-Path -LiteralPath $destination) { throw "文件已存在，请指定新的输出名称：$destination" }
$staging = $destination + '.' + [Guid]::NewGuid().ToString('N') + '.partial'
[IO.Directory]::CreateDirectory((Split-Path -Parent $destination)) | Out-Null
$entries = [Collections.Generic.SortedDictionary[string,string]]::new([StringComparer]::Ordinal)
$entries['.markdownlint-cli2.jsonc'] = '.markdownlint-cli2.jsonc'
$entries['.node-version'] = '.node-version'
$entries['.python-version'] = '.python-version'
foreach ($name in @('AGENTS.md','README.md','README-通用安装.md','README-upstream.md','CONTRIBUTING.md','CODE_OF_CONDUCT.md','ROADMAP.md','SECURITY.md','LICENSE','NOTICE','CHANGELOG.md','.gitignore','.gitattributes','config.json','package.json','package-lock.json','local-overrides.zh-cn.json','runtime-overrides.zh-cn.json','安装汉化.cmd','安装离线汉化.cmd','install.sh','metadata/community-sources.json')) { $entries[$name] = $name }
foreach ($name in @('THIRD-PARTY.md','engine.py','install-assets.py','assets.json','terms.default.json','reviewed.zh-cn.json')) { $entries['offline/'+$name] = 'offline/'+$name }
$folders = @('.github','scripts','src','docs','media','templates','tests','offline/licenses')
if (!$SourceOnly) {
    $buildRecord = Get-Content -LiteralPath (Join-Path $sourceRoot 'dist/build-record.json') -Raw | ConvertFrom-Json
    if ($buildRecord.profile -ne 'public' -or $buildRecord.version -ne $config.version) { throw '公共安装包必须先执行当前版本的公共发行构建。' }
    $entries['dist/build-record.json'] = 'dist/build-record.json'
    $entries['dist/build-summary.json'] = 'dist/build-summary.json'
    $folders += 'upstream'
    $name = 'dist/cursor-language-pack-' + $config.version + '.vsix'
    $entries[$name] = $name
}
if ($WithOffline) { $folders += 'offline/assets' }
foreach ($folder in $folders) {
    foreach ($file in Get-ChildItem -LiteralPath (Join-Path $sourceRoot $folder) -Recurse -File -Force) {
        $relative = [IO.Path]::GetRelativePath($sourceRoot,$file.FullName).Replace('\','/')
        if ($relative -match '(^|/)(__pycache__|node_modules|\.git)/|\.pyc$') { continue }
        $entries[$relative] = $relative
    }
}
# Private data is never read by default. This optional local check requires an
# explicit path; its content is used only in memory and never printed or packed.
$privateProfile = [Environment]::GetFolderPath('UserProfile')
$privateSources = @()
if ($PrivateCatalogPath) { $privateSources = @((Get-Content -LiteralPath $PrivateCatalogPath -Raw | ConvertFrom-Json).entries.source | Where-Object { $_.Length -gt 12 }) }
$commit = $null; $dirty = $null
if (Test-Path -LiteralPath (Join-Path $sourceRoot '.git')) {
    $commit = (& git -C $sourceRoot rev-parse HEAD).Trim()
    if ($LASTEXITCODE -ne 0) { throw '无法读取源码提交标识。' }
    $dirty = [bool](& git -C $sourceRoot status --porcelain --untracked-files=no)
}
$buildInfo = [ordered]@{schema=1;version=$config.version;kind=$kind;profile='public';commit=$commit;dirty=$dirty;lockSha256=(Get-FileHash -LiteralPath (Join-Path $sourceRoot 'package-lock.json') -Algorithm SHA256).Hash.ToLowerInvariant();upstream=$config.upstream;platform=[Environment]::OSVersion.Platform.ToString();architecture=[Runtime.InteropServices.RuntimeInformation]::ProcessArchitecture.ToString();privateCatalogCheck=[bool]$PrivateCatalogPath}
Add-Type -AssemblyName System.IO.Compression.FileSystem
try {
    $archive = [IO.Compression.ZipFile]::Open($staging,[IO.Compression.ZipArchiveMode]::Create)
    try {
        $manifestLines = [Collections.Generic.List[string]]::new()
        foreach ($entry in $entries.GetEnumerator()) {
            $file = [IO.Path]::GetFullPath((Join-Path $sourceRoot $entry.Value))
            if (!$file.StartsWith($sourceRoot + [IO.Path]::DirectorySeparatorChar,[StringComparison]::OrdinalIgnoreCase)) { throw '文件超出源码目录。' }
            if (!(Test-Path -LiteralPath $file -PathType Leaf)) { throw "缺少待打包文件：$($entry.Key)" }
            if ($entry.Key -notmatch '\.(png|jpg|gif|vsix|ico|whl|zip|argosmodel)$') {
                $content = [IO.File]::ReadAllText($file)
                if (($privateProfile -and ($content.Contains($privateProfile) -or $content.Contains($privateProfile.Replace('\','/')))) -or @($privateSources | Where-Object { $content.Contains($_) }).Count) { throw "发现私人内容：$($entry.Key)" }
                if ($content -match '(?:gh[pousr]_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{30,}|sk-[A-Za-z0-9]{32,})') { throw "发现疑似密钥，请在本地人工核对文件：$($entry.Key)" }
            }
            [IO.Compression.ZipFileExtensions]::CreateEntryFromFile($archive,$file,$entry.Key,[IO.Compression.CompressionLevel]::Optimal) | Out-Null
            $manifestLines.Add(('{0}  {1}' -f (Get-FileHash -LiteralPath $file -Algorithm SHA256).Hash.ToLowerInvariant(),$entry.Key))
        }
        $infoBytes = [Text.UTF8Encoding]::new($false).GetBytes(($buildInfo | ConvertTo-Json -Depth 10)+"`n")
        $infoStream = $archive.CreateEntry('BUILD-INFO.json').Open()
        try { $infoStream.Write($infoBytes) } finally { $infoStream.Dispose() }
        $manifestLines.Add(('{0}  BUILD-INFO.json' -f [Convert]::ToHexString([Security.Cryptography.SHA256]::HashData($infoBytes)).ToLowerInvariant()))
        $writer = [IO.StreamWriter]::new($archive.CreateEntry('MANIFEST.sha256').Open(),[Text.UTF8Encoding]::new($false))
        try { $writer.Write(($manifestLines -join "`n")+"`n") } finally { $writer.Dispose() }
    } finally { $archive.Dispose() }
    $verification = @{ArchivePath=$staging}
    if ($SourceOnly) { $verification.SourceOnly = $true }
    if ($WithOffline) { $verification.RequireOffline = $true }
    & (Join-Path $PSScriptRoot 'verify-archive.ps1') @verification
    Move-Item -LiteralPath $staging -Destination $destination
} finally {
    # Only the unique temporary file created above can be removed; no directory deletion.
    if (Test-Path -LiteralPath $staging -PathType Leaf) { Remove-Item -LiteralPath $staging }
}
$sha = (Get-FileHash -LiteralPath $destination -Algorithm SHA256).Hash.ToLowerInvariant()
('{0}  {1}' -f $sha,[IO.Path]::GetFileName($destination)) | Set-Content -LiteralPath ($destination+'.sha256') -Encoding utf8
[pscustomobject]@{Path=$destination;Kind=$kind;Entries=$entries.Count+2;Bytes=(Get-Item -LiteralPath $destination).Length;SHA256=$sha} | ConvertTo-Json
