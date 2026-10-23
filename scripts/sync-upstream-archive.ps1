#requires -Version 7.0
param([string]$ArchivePath)
$ErrorActionPreference = 'Stop'

# Official pinned source archive fallback when raw.githubusercontent.com fails.
$projectRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$config = Get-Content -LiteralPath (Join-Path $projectRoot 'config.json') -Raw -Encoding UTF8 | ConvertFrom-Json
$repo = [string]$config.upstream.repo
$ref = [string]$config.upstream.ref
if ($repo -notmatch '^[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+$' -or $ref -notmatch '^[a-fA-F0-9]{40}$') {
    throw '源码归档同步要求 config.upstream 指向明确的 GitHub 仓库和 40 位 commit。'
}
$sourceUrl = "https://codeload.github.com/$repo/zip/$ref"
if (-not $ArchivePath) {
    $cacheRoot = Join-Path $projectRoot 'reports\upstream-archives'
    New-Item -ItemType Directory -Path $cacheRoot -Force | Out-Null
    $ArchivePath = Join-Path $cacheRoot "$ref.zip"
    Invoke-WebRequest -Uri $sourceUrl -OutFile $ArchivePath
}
$ArchivePath = [IO.Path]::GetFullPath($ArchivePath)
$archiveHash = (Get-FileHash -LiteralPath $ArchivePath -Algorithm SHA256).Hash
Add-Type -AssemblyName System.IO.Compression.FileSystem
$zip = [IO.Compression.ZipFile]::OpenRead($ArchivePath)
try {
    $archiveRoot = @($zip.Entries | ForEach-Object { $_.FullName.Split('/')[0] } | Select-Object -Unique)
    if ($archiveRoot.Count -ne 1 -or $archiveRoot[0] -notlike "*-$ref") { throw '归档根目录与指定 commit 不符。' }
    foreach ($locale in @($config.locales | Where-Object { $_.enabled -ne $false -and $_.upstreamPackDir })) {
        $localeRoot = [IO.Path]::GetFullPath((Join-Path $projectRoot "upstream\$($locale.id)"))
        $prefix = "$($archiveRoot[0])/$($locale.upstreamPackDir)/translations/"
        $count = 0
        foreach ($entry in $zip.Entries) {
            if (-not $entry.FullName.StartsWith($prefix, [StringComparison]::Ordinal) -or -not $entry.FullName.EndsWith('.i18n.json')) { continue }
            $relative = $entry.FullName.Substring($prefix.Length).Replace('/', [IO.Path]::DirectorySeparatorChar)
            $target = [IO.Path]::GetFullPath((Join-Path $localeRoot $relative))
            if (-not $target.StartsWith($localeRoot + [IO.Path]::DirectorySeparatorChar, [StringComparison]::OrdinalIgnoreCase)) { throw '归档条目超出翻译目录。' }
            $reader = [IO.StreamReader]::new($entry.Open(), [Text.Encoding]::UTF8)
            try { $text = $reader.ReadToEnd() } finally { $reader.Dispose() }
            $null = $text | ConvertFrom-Json -AsHashtable
            New-Item -ItemType Directory -Path ([IO.Path]::GetDirectoryName($target)) -Force | Out-Null
            [IO.File]::WriteAllText($target, $text, [Text.UTF8Encoding]::new($false))
            $count++
        }
        if (-not (Test-Path -LiteralPath (Join-Path $localeRoot 'main.i18n.json'))) { throw "$($locale.id) 缺少工作台基线。" }
        $info = [ordered]@{ repo = $repo; ref = $ref; resolvedSha = $ref; strategy = 'archive'; packDir = $locale.upstreamPackDir; files = $count; sourceUrl = $sourceUrl; archiveSha256 = $archiveHash; syncedAt = [DateTime]::UtcNow.ToString('o') }
        [IO.File]::WriteAllText((Join-Path $localeRoot '.sync-info.json'), ($info | ConvertTo-Json), [Text.UTF8Encoding]::new($false))
        Write-Output "$($locale.id): 已从固定 commit 的官方归档恢复 $count 个基线文件。"
    }
} finally { $zip.Dispose() }
