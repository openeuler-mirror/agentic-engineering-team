<#
.SYNOPSIS
  Normalize a remote Git input and clone it to a local directory.

.DESCRIPTION
  Accepts any of the following remote-git input forms and runs a shallow
  (--depth=1) clone to a destination directory (default: a temp dir).

    - owner/repo                    -> https://github.com/<owner>/<repo>.git
    - https://github.com/o/r        -> https://github.com/o/r.git
    - https://github.com/o/r.git
    - https://gitee.com/o/r
    - https://atomgit.com/o/r
    - git@github.com:o/r.git
    - git@gitee.com:o/r.git
    - git@atomgit.com:o/r.git

  Prints the absolute path of the cloned tree to stdout. The caller is
  responsible for cleaning up the destination directory afterwards
  (use Remove-Item -Recurse -Force on the path printed here).

.PARAMETER Remote
  The remote-git input string. Required.

.PARAMETER Dest
  Optional destination directory. If omitted, a new directory under
  $env:TEMP\qa-gen-<timestamp> is created.

.EXAMPLE
  & clone_repo.ps1 -Remote anthropics/claude-code
  & clone_repo.ps1 -Remote https://github.com/anthropics/claude-code -Dest D:\tmp\clone
#>

[CmdletBinding()]
param(
    [Parameter(Mandatory = $true, Position = 0)]
    [string]$Remote,

    [Parameter(Position = 1)]
    [string]$Dest
)

$ErrorActionPreference = "Stop"

function Normalize-RemoteUrl {
    param([string]$Value)

    if ([string]::IsNullOrWhiteSpace($Value)) {
        throw "Remote input is empty."
    }

    $r = $Value.Trim()

    # SSH form: git@host:owner/repo[.git]
    if ($r -match '^git@([^:]+):(.+?)(\.git)?$') {
        $gitHost = $Matches[1]
        $repoPath = $Matches[2]
        return "https://$gitHost/$repoPath.git"
    }

    # HTTPS form already ending in .git
    if ($r -match '^https?://.+\.git$') {
        return $r
    }

    # Web URL on a supported platform (with or without trailing slash, with or without extra path)
    if ($r -match '^https?://(github\.com|gitee\.com|atomgit\.com)/([^/]+/[^/]+).*$') {
        $gitHost = $Matches[1]
        $repoPath = $Matches[2]
        return "https://$gitHost/$repoPath.git"
    }

    # owner/repo shorthand (no slashes beyond the one separator, no dots)
    if ($r -match '^[A-Za-z0-9._-]+/[A-Za-z0-9._-]+$') {
        return "https://github.com/$r.git"
    }

    # Otherwise assume the user passed a usable URL as-is
    return $r
}

try {
    $url = Normalize-RemoteUrl -Value $Remote

    if ([string]::IsNullOrWhiteSpace($Dest)) {
        $stamp = Get-Date -Format "yyyyMMdd-HHmmss"
        $Dest = Join-Path $env:TEMP "qa-gen-$stamp"
    }

    # If destination exists, refuse to clobber
    if (Test-Path -LiteralPath $Dest) {
        throw "Destination already exists: $Dest. Remove it first or pass a different -Dest."
    }

    Write-Verbose "Cloning $url -> $Dest (depth=1)"

    & git clone --depth=1 --quiet $url $Dest
    if ($LASTEXITCODE -ne 0) {
        # Surface the actual git error so the skill can show it to the user
        throw "git clone failed (exit $LASTEXITCODE) for $url"
    }

    # Resolve to absolute path and emit on stdout (single line)
    $abs = (Resolve-Path -LiteralPath $Dest).Path
    Write-Output $abs
}
catch {
    # Emit error to stderr; non-zero exit so the caller knows it failed
    [Console]::Error.WriteLine("clone_repo.ps1: $($_.Exception.Message)")
    exit 1
}
