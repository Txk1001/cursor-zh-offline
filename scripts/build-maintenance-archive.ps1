#requires -Version 7.0
# Compatibility entry point: maintenance archives now use the public allowlist.
param([string]$OutputPath, [switch]$WithOffline, [switch]$SourceOnly)
$ErrorActionPreference = 'Stop'
& (Join-Path $PSScriptRoot 'build-public-archive.ps1') @PSBoundParameters
